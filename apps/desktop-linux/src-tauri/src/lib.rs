//! App builder — wires up Tauri plugins, state, sidecar, tray, and IPC commands.

pub mod sidecar;
pub mod tray;
pub mod ws;

use tauri::{AppHandle, Emitter, Listener, Manager, State};
use tracing::info;

use crate::sidecar::{DaemonStatusInfo, DshSidecar, QuitInspectionInfo};
use crate::tray::setup_tray;

/// Focus and show the main window, raising it to the foreground.
fn focus_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Called once by `main.rs` to configure and run the Tauri app.
pub fn run() {
    // Initialise tracing (uses RUST_LOG env var; defaults to info)
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("DeepSeek Harness desktop-linux starting");

    // ── Single-Instance Guard via Unix Domain Socket ──────────────────────────
    // If another instance of DeepSeek Harness is already running, we connect to
    // its socket, pass along the CLI arguments (such as dsh:// URLs from the browser),
    // and exit immediately. The running instance brings its window to the foreground.
    let socket_path = std::env::temp_dir().join("dsh-desktop-linux.sock");

    if let Ok(mut stream) = std::os::unix::net::UnixStream::connect(&socket_path) {
        use std::io::Write;
        info!("Existing instance detected. Forwarding invocation and focusing main window.");
        let args: Vec<String> = std::env::args().collect();
        let payload = args.get(1).cloned().unwrap_or_else(|| "dsh://focus".to_string());
        let _ = writeln!(stream, "{payload}");

        // Also trigger xdotool windowactivate as fallback
        let _ = std::process::Command::new("xdotool")
            .args(["search", "--name", "DeepSeek Harness", "windowactivate"])
            .spawn();

        std::process::exit(0);
    }

    // Remove any stale socket from an unclean previous shutdown
    let _ = std::fs::remove_file(&socket_path);

    let socket_path_cleanup = socket_path.clone();
    std::panic::set_hook(Box::new(move |_| {
        let _ = std::fs::remove_file(&socket_path_cleanup);
    }));

    let socket_path_server = socket_path.clone();

    tauri::Builder::default()
        // ── Plugins ───────────────────────────────────────────────────────────
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        // ── Setup ─────────────────────────────────────────────────────────────
        .setup(move |app| {
            // Store the sidecar as app-wide managed state
            let sidecar = DshSidecar::new();
            app.manage(sidecar);

            // Build the system tray
            if let Err(e) = setup_tray(&app.handle()) {
                tracing::warn!("Failed to initialize system tray (running in window-only mode): {e}");
            }

            // Kick off the sidecar supervisor asynchronously
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(sidecar) = handle.try_state::<DshSidecar>() {
                    if let Err(e) = sidecar.start(handle.clone()).await {
                        tracing::error!("dsh daemon supervisor failed to start: {e}");
                    }
                }
            });

            // Spawn Unix domain socket server to listen for single-instance invocations
            let handle_socket = app.handle().clone();
            let sock_path = socket_path_server.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(listener) = tokio::net::UnixListener::bind(&sock_path) {
                    use tokio::io::AsyncBufReadExt;
                    while let Ok((stream, _)) = listener.accept().await {
                        let mut reader = tokio::io::BufReader::new(stream);
                        let mut line = String::new();
                        if reader.read_line(&mut line).await.is_ok() {
                            let url = line.trim().to_string();
                            info!("Single-instance invocation received: {url}");
                            focus_main_window(&handle_socket);
                            if let Some(win) = handle_socket.get_webview_window("main") {
                                let _ = win.emit("dsh://oauth-callback", url);
                            }
                        }
                    }
                }
            });

            // Handle dsh:// deep-link open events by focusing the main window
            // and emitting a JS event so the UI can react (e.g. after OAuth).
            let handle2 = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                info!("Deep-link received: {:?}", event.payload());
                focus_main_window(&handle2);
                // Notify the webview that an oauth callback arrived
                if let Some(win) = handle2.get_webview_window("main") {
                    let _ = win.emit("dsh://oauth-callback", event.payload());
                }
            });

            Ok(())
        })
        // ── Window Events (Close hides to tray) ────────────────────────────────
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide window to system tray instead of destroying running agent jobs
                let _ = window.hide();
                api.prevent_close();
            }
        })
        // ── IPC Commands ──────────────────────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            cmd_get_daemon_status,
            cmd_restart_daemon,
            cmd_open_browser,
            cmd_pick_directory,
            cmd_pick_file,
            cmd_quit_inspection,
            cmd_get_dsh_port,
            cmd_set_api_key,
            cmd_has_api_key,
            cmd_clear_api_key,
            cmd_call_rpc,
            cmd_ws_send,
            cmd_ws_ensure_connected,
            cmd_log_webview,
            cmd_focus_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DeepSeek Harness");

    // Clean up socket file on clean exit
    let _ = std::fs::remove_file(&socket_path);
}

/// Return current daemon status, port, launch token, and log buffer.
#[tauri::command]
async fn cmd_get_daemon_status(
    sidecar: State<'_, DshSidecar>,
) -> Result<DaemonStatusInfo, String> {
    Ok(sidecar.get_status().await)
}

/// Restart the daemon supervisor on request.
#[tauri::command]
async fn cmd_restart_daemon(
    app: AppHandle,
    sidecar: State<'_, DshSidecar>,
) -> Result<(), String> {
    sidecar.restart(app).await
}

/// Open an external URL safely in the system default browser.
#[tauri::command]
async fn cmd_open_browser(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") && !url.starts_with("mailto:") {
        return Err("Forbidden URL protocol".to_string());
    }

    tokio::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to open browser: {e}"))?;

    Ok(())
}

static PICKER_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Open native directory picker (zenity with kdialog fallback).
#[tauri::command]
async fn cmd_pick_directory() -> Result<Option<String>, String> {
    let _lock = match PICKER_MUTEX.try_lock() {
        Ok(guard) => guard,
        Err(_) => return Ok(None),
    };

    // Try zenity first
    match tokio::process::Command::new("zenity")
        .args(["--file-selection", "--directory", "--title=Select Workspace Directory"])
        .output()
        .await
    {
        Ok(output) => {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(Some(path));
                }
            }
            return Ok(None);
        }
        Err(_) => {}
    }

    // Try kdialog only if zenity was not found
    if let Ok(output) = tokio::process::Command::new("kdialog")
        .args(["--getexistingdirectory", "--title", "Select Workspace Directory"])
        .output()
        .await
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(Some(path));
            }
        }
    }

    Ok(None)
}

/// Open native file picker for images, documents, and code files (zenity with kdialog fallback).
#[tauri::command]
async fn cmd_pick_file() -> Result<Option<String>, String> {
    let _lock = match PICKER_MUTEX.try_lock() {
        Ok(guard) => guard,
        Err(_) => return Ok(None),
    };

    // Try zenity first
    match tokio::process::Command::new("zenity")
        .args([
            "--file-selection",
            "--title=Select File to Attach (Images, Docs, Code)",
        ])
        .output()
        .await
    {
        Ok(output) => {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(Some(path));
                }
            }
            return Ok(None);
        }
        Err(_) => {}
    }

    // Try kdialog only if zenity was not found
    if let Ok(output) = tokio::process::Command::new("kdialog")
        .args(["--getopenfilename", "--title", "Select File to Attach"])
        .output()
        .await
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(Some(path));
            }
        }
    }

    Ok(None)
}

/// Query active tasks before quitting.
#[tauri::command]
async fn cmd_quit_inspection() -> Result<QuitInspectionInfo, String> {
    Ok(QuitInspectionInfo {
        active_tasks: false,
        scheduled_tasks: false,
    })
}

/// Legacy port helper (backwards compatibility).
#[tauri::command]
async fn cmd_get_dsh_port(sidecar: State<'_, DshSidecar>) -> Result<u16, String> {
    let status = sidecar.get_status().await;
    Ok(status.port.unwrap_or(3000))
}

fn get_user_home() -> std::path::PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        if !home.trim().is_empty() {
            return std::path::PathBuf::from(home);
        }
    }
    std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
}

/// Securely persist DEEPSEEK_API_KEY into ~/.dsh/.credentials.yaml with mode 0600.
#[tauri::command]
async fn cmd_set_api_key(key: String) -> Result<(), String> {
    use std::fs::{create_dir_all, OpenOptions};
    use std::io::Write;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    let key_trimmed = key.trim();
    if key_trimmed.is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    let dsh_dir = get_user_home().join(".dsh");
    create_dir_all(&dsh_dir).map_err(|e| format!("Failed to create ~/.dsh: {e}"))?;

    let cred_file = dsh_dir.join(".credentials.yaml");
    let mut content = if cred_file.exists() {
        std::fs::read_to_string(&cred_file).unwrap_or_default()
    } else {
        "version: 1\n".to_string()
    };

    if content.contains("DEEPSEEK_API_KEY:") {
        let mut new_lines = Vec::new();
        for line in content.lines() {
            if line.trim_start().starts_with("DEEPSEEK_API_KEY:") {
                new_lines.push(format!("  DEEPSEEK_API_KEY: \"{}\"", key_trimmed));
            } else {
                new_lines.push(line.to_string());
            }
        }
        content = new_lines.join("\n") + "\n";
    } else if content.contains("refs:") {
        content = content.replace("refs:\n", &format!("refs:\n  DEEPSEEK_API_KEY: \"{}\"\n", key_trimmed));
    } else {
        content.push_str(&format!("refs:\n  DEEPSEEK_API_KEY: \"{}\"\n", key_trimmed));
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&cred_file)
        .map_err(|e| format!("Failed to open credentials file: {e}"))?;

    #[cfg(unix)]
    {
        let permissions = std::fs::Permissions::from_mode(0o600);
        let _ = file.set_permissions(permissions);
    }

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write credentials: {e}"))?;

    #[cfg(unix)]
    {
        let permissions = std::fs::Permissions::from_mode(0o600);
        let _ = std::fs::set_permissions(&cred_file, permissions);
    }

    info!("Securely updated DEEPSEEK_API_KEY in ~/.dsh/.credentials.yaml (mode 0600)");
    Ok(())
}

/// Check if ~/.dsh/.credentials.yaml has a stored DEEPSEEK_API_KEY.
#[tauri::command]
async fn cmd_has_api_key() -> Result<bool, String> {
    let cred_file = get_user_home().join(".dsh/.credentials.yaml");
    if !cred_file.exists() {
        return Ok(false);
    }

    let content = std::fs::read_to_string(&cred_file).unwrap_or_default();
    Ok(content.contains("DEEPSEEK_API_KEY:") && !content.contains("DEEPSEEK_API_KEY: \"\""))
}

/// Clear or remove DEEPSEEK_API_KEY from ~/.dsh/.credentials.yaml.
#[tauri::command]
async fn cmd_clear_api_key() -> Result<(), String> {
    let cred_file = get_user_home().join(".dsh/.credentials.yaml");
    if cred_file.exists() {
        let content = std::fs::read_to_string(&cred_file).unwrap_or_default();
        let lines: Vec<String> = content
            .lines()
            .filter(|line| !line.trim_start().starts_with("DEEPSEEK_API_KEY:"))
            .map(|s| s.to_string())
            .collect();
        std::fs::write(&cred_file, lines.join("\n")).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Native loopback RPC bridge for POST /api/<namespace>/<method>.
/// Strips cross-origin browser markers and injects the daemon's auth cookie.
#[tauri::command]
async fn cmd_call_rpc(
    sidecar: State<'_, DshSidecar>,
    namespace: String,
    method: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let (port, cookie) = sidecar.get_auth_context().await;
    let port = port.ok_or_else(|| "Daemon is not ready yet".to_string())?;

    let full_method = format!("{namespace}/{method}");
    println!(">>> [RPC:REQ] {full_method}");
    let rpc_id = format!(
        "rpc-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );

    let formatted_payload = if payload.is_object() && payload.get("args").is_some() {
        payload
    } else {
        serde_json::json!({ "args": payload })
    };

    let body = serde_json::json!({
        "type": "client-request",
        "rpcId": rpc_id,
        "method": full_method,
        "payload": formatted_payload,
    });

    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{port}/api/{namespace}/{method}");

    let mut req = client
        .post(&url)
        .header("content-type", "application/json")
        .header("accept", "application/json")
        .header("host", format!("127.0.0.1:{port}"));

    if let Some(c) = cookie {
        req = req.header("cookie", c);
    }

    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to daemon: {e}"))?;

    let status = resp.status();
    println!(">>> [RPC:RES] {namespace}/{method} -> status={status}");
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response JSON: {e}"))?;

    if let Some(result) = json.get("result") {
        if result.get("ok").and_then(|v| v.as_bool()) == Some(true) {
            return Ok(result.get("value").cloned().unwrap_or(serde_json::Value::Null));
        } else {
            let err_val = result
                .get("error")
                .cloned()
                .unwrap_or(serde_json::json!("Unknown RPC failure"));
            let msg = if let Some(s) = err_val.as_str() {
                s.to_string()
            } else if let Some(m) = err_val.get("message").and_then(|m| m.as_str()) {
                m.to_string()
            } else {
                err_val.to_string()
            };
            return Err(msg);
        }
    }

    Ok(json)
}

/// Send a frame into the WebSocket multiplexer on /api/remote.mux.
#[tauri::command]
async fn cmd_ws_send(sidecar: State<'_, DshSidecar>, message: String) -> Result<(), String> {
    println!(">>> [WS:SEND] {message}");
    sidecar.ws_send(message).await
}

/// Ensure the WebSocket connection to /api/remote.mux is established.
#[tauri::command]
async fn cmd_ws_ensure_connected(
    app: AppHandle,
    sidecar: State<'_, DshSidecar>,
) -> Result<(), String> {
    sidecar.ws_ensure_connected(app).await
}

/// Relay webview diagnostic logs to Tauri standard output.
#[tauri::command]
async fn cmd_log_webview(level: String, msg: String) -> Result<(), String> {
    println!(">>> [WEBVIEW:{level}] {msg}");
    match level.as_str() {
        "error" => tracing::error!("[webview] {msg}"),
        "warn" => tracing::warn!("[webview] {msg}"),
        _ => tracing::info!("[webview] {msg}"),
    }
    Ok(())
}

/// Bring the main window to the foreground (used by OAuth callback and single-instance guard).
#[tauri::command]
async fn cmd_focus_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
    Ok(())
}
