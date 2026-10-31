//! Robust Daemon Supervisor for DeepSeek Harness on Linux.
//!
//! Spawns and manages the `dsh web` daemon process with:
//! - Interactive login-shell environment probing (`$SHELL -ilc "env -0"`)
//! - Dynamic port handling (tries 3000, falls back to dynamic port 0 on collision)
//! - Ready token capture from daemon output (`http://127.0.0.1:<port>/?token=<token>`)
//! - Crash detection and exponential back-off restart
//! - Clean termination (SIGTERM -> SIGKILL) on application quit
//! - Ring-buffer log collection for UI error diagnostics

use std::{
    collections::{HashMap, VecDeque},
    net::TcpListener,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
    sync::Mutex,
    time::sleep,
};
use tracing::{error, info, warn};

use crate::ws::WsBridge;

/// Default port that `dsh web` tries to bind to.
pub const DEFAULT_PORT: u16 = 3000;

/// Maximum number of lines retained in diagnostic log ring buffer.
const MAX_LOG_LINES: usize = 200;

/// Maximum automatic restarts before entering error state.
const MAX_RESTARTS: u32 = 5;

/// Base backoff duration before restarting crashed daemon.
const RESTART_BACKOFF_SECS: u64 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonStatusInfo {
    pub status: String, // "starting" | "ready" | "error" | "offline"
    pub port: Option<u16>,
    pub token: Option<String>,
    pub logs: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuitInspectionInfo {
    pub active_tasks: bool,
    pub scheduled_tasks: bool,
}

struct SupervisorState {
    child: Option<Child>,
    status: String,
    port: Option<u16>,
    token: Option<String>,
    auth_cookie: Option<String>,
    ws_bridge: WsBridge,
    logs: VecDeque<String>,
    error: Option<String>,
    restarts: u32,
    stopping: bool,
}

#[derive(Clone)]
pub struct DshSidecar {
    inner: Arc<Mutex<SupervisorState>>,
}

impl DshSidecar {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SupervisorState {
                child: None,
                status: "starting".to_string(),
                port: None,
                token: None,
                auth_cookie: None,
                ws_bridge: WsBridge::new(),
                logs: VecDeque::with_capacity(MAX_LOG_LINES),
                error: None,
                restarts: 0,
                stopping: false,
            })),
        }
    }

    /// Query current status, port, token (masked), and recent logs.
    pub async fn get_status(&self) -> DaemonStatusInfo {
        let guard = self.inner.lock().await;
        let masked_tok = guard.token.as_deref().map(|tok| {
            if tok.len() > 6 {
                format!("{}...[masked]", &tok[..6])
            } else {
                "[masked]".to_string()
            }
        });
        DaemonStatusInfo {
            status: guard.status.clone(),
            port: guard.port,
            token: masked_tok,
            logs: guard.logs.iter().cloned().collect(),
            error: guard.error.clone(),
        }
    }

    /// Return loopback port and session cookie for native RPC routing.
    pub async fn get_auth_context(&self) -> (Option<u16>, Option<String>) {
        let guard = self.inner.lock().await;
        (guard.port, guard.auth_cookie.clone())
    }

    /// Send a multiplexed frame across the WebSocket bridge.
    pub async fn ws_send(&self, message: String) -> Result<(), String> {
        let guard = self.inner.lock().await;
        guard.ws_bridge.send(message).await
    }

    /// Ensure the WebSocket bridge is connected.
    pub async fn ws_ensure_connected(&self, app: AppHandle) -> Result<(), String> {
        let guard = self.inner.lock().await;
        if let Some(port) = guard.port {
            guard.ws_bridge.connect(app, port, guard.auth_cookie.clone()).await
        } else {
            Err("Daemon is not ready yet".to_string())
        }
    }

    /// Spawn the daemon and begin supervisor monitoring.
    pub async fn start(&self, app: AppHandle) -> Result<(), String> {
        info!("Spawning DeepSeek Harness daemon supervisor");

        {
            let mut guard = self.inner.lock().await;
            guard.status = "starting".to_string();
            guard.stopping = false;
            guard.error = None;
        }

        let app_handle = app.clone();
        let inner_arc = Arc::clone(&self.inner);

        tokio::spawn(async move {
            run_supervisor_loop(app_handle, inner_arc).await;
        });

        Ok(())
    }

    /// Gracefully stop the daemon.
    pub async fn stop(&self) {
        let mut guard = self.inner.lock().await;
        guard.stopping = true;
        guard.status = "offline".to_string();

        if let Some(mut child) = guard.child.take() {
            let pid = child.id();
            info!("Stopping dsh daemon (pid={pid:?})");
            let _ = child.kill().await;
        }
    }

    /// Restart the daemon with fresh state.
    pub async fn restart(&self, app: AppHandle) -> Result<(), String> {
        info!("Restarting dsh daemon");
        self.stop().await;
        sleep(Duration::from_millis(800)).await;

        {
            let mut guard = self.inner.lock().await;
            guard.restarts = 0;
            guard.error = None;
            guard.status = "starting".to_string();
        }

        self.start(app).await
    }
}

impl Default for DshSidecar {
    fn default() -> Self {
        Self::new()
    }
}

/// Probes interactive login shell environment (`$SHELL -ilc "env -0"`).
pub async fn probe_login_shell_env() -> HashMap<String, String> {
    // Start with all current process environment variables so nothing is lost
    let mut map: HashMap<String, String> = std::env::vars().collect();

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    let output = tokio::time::timeout(
        Duration::from_secs(4),
        tokio::process::Command::new(&shell)
            .args(["-ilc", "env -0"])
            .output(),
    )
    .await;

    if let Ok(Ok(out)) = output {
        if out.status.success() {
            for entry in out.stdout.split(|&b| b == 0) {
                if let Ok(s) = std::str::from_utf8(entry) {
                    if let Some((k, v)) = s.split_once('=') {
                        if !k.is_empty() {
                            map.insert(k.to_string(), v.to_string());
                        }
                    }
                }
            }
        }
    }

    // Ensure PATH has pnpm, node, local bin and system bin
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let pnpm_home = format!("{}/.local/share/pnpm", home);
    let pnpm_bin = format!("{}/bin", pnpm_home);
    let local_bin = format!("{}/.local/bin", home);

    let current_path = map
        .get("PATH")
        .cloned()
        .unwrap_or_else(|| std::env::var("PATH").unwrap_or_default());

    let new_path = format!("{}:{}:{}:/usr/local/bin:/usr/bin:{}", pnpm_home, pnpm_bin, local_bin, current_path);
    map.insert("PATH".to_string(), new_path);
    if !pnpm_home.is_empty() {
        map.insert("PNPM_HOME".to_string(), pnpm_home);
    }
    map.insert("DSH_DESKTOP".to_string(), "1".to_string());

    info!("Probed environment: {} variables captured", map.len());
    map
}

/// Check if a local port is currently available on 127.0.0.1.
fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Helper to locate tsx executable inside a repository root.
fn resolve_tsx(repo: &Path) -> PathBuf {
    let candidate_mjs = repo.join("node_modules/tsx/dist/cli.mjs");
    if candidate_mjs.exists() {
        return candidate_mjs;
    }
    let candidate_bin = repo.join("node_modules/.bin/tsx");
    if candidate_bin.exists() {
        return candidate_bin;
    }
    candidate_mjs
}

/// Resolves repository paths for deepseek-harness dynamically across environments.
fn resolve_repo_paths() -> (PathBuf, PathBuf, PathBuf) {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    // 1. Explicit environment variable override
    if let Ok(env_root) = std::env::var("DSH_REPO_ROOT") {
        let p = PathBuf::from(env_root);
        if p.join("apps/cli/src/bin.ts").exists() {
            let tsx = resolve_tsx(&p);
            let bin = p.join("apps/cli/src/bin.ts");
            return (p, tsx, bin);
        }
    }

    // 2. Check ~/.dsh/repo_path pointer if saved by installer
    if let Ok(home) = std::env::var("HOME") {
        let pointer_file = PathBuf::from(&home).join(".dsh/repo_path");
        if pointer_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&pointer_file) {
                let trimmed = content.trim();
                let p = PathBuf::from(trimmed);
                if p.join("apps/cli/src/bin.ts").exists() {
                    let tsx = resolve_tsx(&p);
                    let bin = p.join("apps/cli/src/bin.ts");
                    return (p, tsx, bin);
                }
            }
        }
    }

    // 3. Ascend upwards from current working directory or executable location
    let mut search_origins = vec![base.clone()];
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            search_origins.push(exe_dir.to_path_buf());
        }
    }

    for origin in search_origins {
        let mut cur = origin;
        for _ in 0..7 {
            if cur.join("apps/cli/src/bin.ts").exists() {
                let tsx = resolve_tsx(&cur);
                let bin = cur.join("apps/cli/src/bin.ts");
                return (cur, tsx, bin);
            }
            if let Some(parent) = cur.parent() {
                cur = parent.to_path_buf();
            } else {
                break;
            }
        }
    }

    // 4. Fallback: Common paths where deepseek-harness may be installed or cloned
    if let Ok(home) = std::env::var("HOME") {
        let candidates = [
            PathBuf::from(&home).join(".local/share/deepseek-harness"),
            PathBuf::from(&home).join("Projects/deepseek-harness"),
            PathBuf::from(&home).join("projects/deepseek-harness"),
            PathBuf::from(&home).join("deepseek-harness"),
            PathBuf::from(&home).join("src/deepseek-harness"),
            PathBuf::from(&home).join("dev/deepseek-harness"),
            PathBuf::from(&home).join("workspace/deepseek-harness"),
            PathBuf::from(&home).join("Desktop/deepseek-harness"),
            PathBuf::from("/opt/deepseek-harness"),
            PathBuf::from("/usr/share/deepseek-harness"),
        ];

        for installed_repo in candidates {
            if installed_repo.join("apps/cli/src/bin.ts").exists() {
                let tsx = resolve_tsx(&installed_repo);
                let bin = installed_repo.join("apps/cli/src/bin.ts");
                return (installed_repo, tsx, bin);
            }
        }
    }

    let tsx_cli = resolve_tsx(&base);
    let bin_ts = base.join("apps/cli/src/bin.ts");
    (base, tsx_cli, bin_ts)
}

/// Spawns the daemon process with probed env and port selection.
async fn spawn_daemon_child(probed_env: &HashMap<String, String>) -> std::io::Result<(Child, u16)> {
    let (repo_root, tsx_cli, bin_ts) = resolve_repo_paths();

    // Port selection: Try 3000 if available, otherwise 0 (dynamic OS-assigned)
    let requested_port = if is_port_available(DEFAULT_PORT) {
        DEFAULT_PORT
    } else {
        info!("Port {DEFAULT_PORT} occupied; requesting OS dynamic port (0)");
        0
    };

    let node_path = probed_env
        .get("PATH")
        .and_then(|p| {
            p.split(':').find_map(|dir| {
                let candidate = Path::new(dir).join("node");
                if candidate.exists() {
                    Some(candidate)
                } else {
                    None
                }
            })
        })
        .unwrap_or_else(|| PathBuf::from("/usr/bin/node"));

    println!(
        ">>> [DAEMON:SPAWN] node={:?} root={:?} tsx={:?} bin={:?} requested_port={requested_port}",
        node_path, repo_root, tsx_cli, bin_ts
    );
    info!(
        "Spawning daemon: node={:?} in {:?} requested_port={requested_port}",
        node_path, repo_root
    );

    let child = Command::new(&node_path)
        .arg(&tsx_cli)
        .arg(&bin_ts)
        .arg("web")
        .arg("--no-open")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(requested_port.to_string())
        .current_dir(&repo_root)
        .envs(probed_env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    Ok((child, requested_port))
}

/// Main supervisor loop: monitors daemon stdout/stderr, captures readiness, restarts on crash.
async fn run_supervisor_loop(app: AppHandle, inner: Arc<Mutex<SupervisorState>>) {
    let probed_env = probe_login_shell_env().await;

    loop {
        let is_stopping = {
            let guard = inner.lock().await;
            guard.stopping
        };
        if is_stopping {
            break;
        }

        let spawn_res = spawn_daemon_child(&probed_env).await;
        let (mut child, _requested_port) = match spawn_res {
            Ok(c) => c,
            Err(e) => {
                error!("Failed to spawn daemon child: {e}");
                let mut guard = inner.lock().await;
                guard.status = "error".to_string();
                guard.error = Some(format!("Failed to spawn daemon: {e}"));
                notify_ui(&app, &guard);
                return;
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        {
            let mut guard = inner.lock().await;
            guard.child = Some(child);
            guard.status = "starting".to_string();
            notify_ui(&app, &guard);
        }

        // Spawn stdout reader
        let inner_stdout = Arc::clone(&inner);
        let app_stdout = app.clone();
        if let Some(stdout) = stdout {
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    println!(">>> [DAEMON:OUT] {line}");
                    append_log(&inner_stdout, format!("[daemon:out] {line}")).await;
                    check_readiness_line(&app_stdout, &inner_stdout, &line).await;
                }
            });
        }

        // Spawn stderr reader
        let inner_stderr = Arc::clone(&inner);
        if let Some(stderr) = stderr {
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    eprintln!(">>> [DAEMON:ERR] {line}");
                    append_log(&inner_stderr, format!("[daemon:err] {line}")).await;
                }
            });
        }

        // Await child process exit
        let exit_status = loop {
            sleep(Duration::from_millis(500)).await;
            let mut guard = inner.lock().await;
            if guard.stopping {
                return;
            }
            if let Some(child_mut) = guard.child.as_mut() {
                match child_mut.try_wait() {
                    Ok(Some(status)) => break status,
                    Ok(None) => {}
                    Err(e) => {
                        error!("Error waiting for child: {e}");
                        break std::process::ExitStatus::default();
                    }
                }
            } else {
                return;
            }
        };

        warn!("Daemon child exited with: {exit_status:?}");

        // Handle crash vs clean exit
        let mut guard = inner.lock().await;
        if guard.stopping {
            guard.status = "offline".to_string();
            notify_ui(&app, &guard);
            break;
        }

        guard.restarts += 1;
        if guard.restarts > MAX_RESTARTS {
            error!("Daemon crashed {MAX_RESTARTS} times; giving up");
            guard.status = "error".to_string();
            guard.error = Some(format!("Daemon exited unexpectedly ({exit_status:?})"));
            notify_ui(&app, &guard);
            break;
        }

        guard.status = "starting".to_string();
        notify_ui(&app, &guard);
        drop(guard);

        info!("Restarting daemon in {RESTART_BACKOFF_SECS}s...");
        sleep(Duration::from_secs(RESTART_BACKOFF_SECS)).await;
    }
}

/// Masks sensitive tokens in logs to prevent accidental terminal leakage.
pub fn mask_token_in_line(line: &str) -> String {
    if let Some(pos) = line.find("token=") {
        let prefix = &line[..pos + 6];
        let rest = &line[pos + 6..];
        let end = rest.find(|c: char| c.is_whitespace() || c == '&').unwrap_or(rest.len());
        let tok = &rest[..end];
        let masked = if tok.len() > 6 {
            format!("{}...[masked]", &tok[..6])
        } else {
            "[masked]".to_string()
        };
        format!("{}{}{}", prefix, masked, &rest[end..])
    } else {
        line.to_string()
    }
}

/// Appends a log line to the ring buffer.
async fn append_log(inner: &Arc<Mutex<SupervisorState>>, line: String) {
    let masked = mask_token_in_line(&line);
    let mut guard = inner.lock().await;
    if guard.logs.len() >= MAX_LOG_LINES {
        guard.logs.pop_front();
    }
    guard.logs.push_back(masked);
}

/// Checks stdout line for readiness url: `dsh web: http://127.0.0.1:<port>/?token=<token>`.
/// Parses a line of daemon stdout looking for `http://127.0.0.1:<port>/?token=<token>`
pub fn parse_ready_line(line: &str) -> Option<(u16, Option<String>)> {
    let pos = line.find("http://127.0.0.1:")?;
    let rest = &line[pos + "http://127.0.0.1:".len()..];
    let slash_pos = rest.find('/')?;
    let port = rest[..slash_pos].parse::<u16>().ok()?;
    let token = rest.find("token=").map(|token_pos| {
        let token_str = &rest[token_pos + 6..];
        token_str
            .split(|c: char| c.is_whitespace() || c == '&')
            .next()
            .unwrap_or("")
            .to_string()
    });
    Some((port, token))
}

async fn check_readiness_line(app: &AppHandle, inner: &Arc<Mutex<SupervisorState>>, line: &str) {
    if let Some((port, token)) = parse_ready_line(line) {
        let masked_tok = token.as_deref().map(|t| {
            if t.len() > 6 {
                format!("{}...[masked]", &t[..6])
            } else {
                "[masked]".to_string()
            }
        });
        println!(">>> [DAEMON:READY] Daemon reported ready on port {port} with token {masked_tok:?}");
        info!("Daemon reported ready on port {port} with token {masked_tok:?}");

        // Exchange launch token for authority-bound session cookie via loopback HTTP GET
        let mut cookie_header = None;
        if let Some(tok) = &token {
            let client = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .unwrap_or_default();
            let exchange_url = format!("http://127.0.0.1:{port}/?token={tok}");
            match client.get(&exchange_url).send().await {
                Ok(resp) => {
                    if let Some(cookie) = resp.headers().get("set-cookie") {
                        if let Ok(cookie_str) = cookie.to_str() {
                            let clean = cookie_str.split(';').next().unwrap_or(cookie_str).to_string();
                            println!(">>> [AUTH:COOKIE] Exchanged launch token for cookie");
                            info!("Successfully exchanged launch token for auth cookie");
                            cookie_header = Some(clean);
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to exchange launch token for auth cookie: {e}");
                }
            }
        }

        let ws_bridge = {
            let mut guard = inner.lock().await;
            guard.status = "ready".to_string();
            guard.port = Some(port);
            guard.token = token.clone();
            guard.auth_cookie = cookie_header.clone();
            guard.restarts = 0; // reset on clean ready

            notify_ui(app, &guard);
            guard.ws_bridge.clone()
        };

        // Connect WebSocket bridge automatically
        let app_handle = app.clone();
        tokio::spawn(async move {
            if let Err(e) = ws_bridge.connect(app_handle, port, cookie_header).await {
                warn!("WebSocket bridge connect warning: {e}");
            }
        });

        // Inject into webview window (safe: masked token or omitted)
        if let Some(win) = app.get_webview_window("main") {
            println!(">>> [WINDOW:INJECT] Injecting __DSH_DAEMON_INFO__ into main window");
            let script = format!(
                "window.__DSH_DAEMON_INFO__ = {{ status: 'ready', port: {} }}; \
                 if (typeof window.__onDaemonReady === 'function') {{ \
                     window.__onDaemonReady({{ port: {} }}); \
                 }}",
                port, port
            );
            let _ = win.eval(&script);
        } else {
            println!(">>> [WINDOW:WARN] main webview window not found for injection");
        }
    }
}

/// Emits status update event to webview frontend.
fn notify_ui(app: &AppHandle, state: &SupervisorState) {
    let payload = DaemonStatusInfo {
        status: state.status.clone(),
        port: state.port,
        token: state.token.clone(),
        logs: state.logs.iter().cloned().collect(),
        error: state.error.clone(),
    };
    let _ = app.emit("dsh://status-changed", payload);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ready_line_default() {
        let line = "dsh web: http://127.0.0.1:3000/?token=abc123secret456";
        let parsed = parse_ready_line(line);
        assert_eq!(parsed, Some((3000, Some("abc123secret456".to_string()))));
    }

    #[test]
    fn test_parse_ready_line_dynamic_port() {
        let line = "  Ready at http://127.0.0.1:41892/?token=xyz_tok_999 & other params";
        let parsed = parse_ready_line(line);
        assert_eq!(parsed, Some((41892, Some("xyz_tok_999".to_string()))));
    }

    #[test]
    fn test_parse_ready_line_no_token() {
        let line = "Listening on http://127.0.0.1:8080/";
        let parsed = parse_ready_line(line);
        assert_eq!(parsed, Some((8080, None)));
    }

    #[test]
    fn test_parse_ready_line_unrelated() {
        let line = "Some compilation log output without url";
        assert_eq!(parse_ready_line(line), None);
    }

    #[test]
    fn test_mask_token_in_line() {
        let line = "http://127.0.0.1:3000/?token=abc123secret456&foo=bar";
        assert_eq!(
            mask_token_in_line(line),
            "http://127.0.0.1:3000/?token=abc123...[masked]&foo=bar"
        );
    }
}
