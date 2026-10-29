/**
 * DeepSeek Harness — Linux Desktop Client Logic
 * Clean Modular Architecture
 */

import { store } from './store/state.js';
import { createSidebar } from './components/layout/sidebar.js';
import { createChatArea } from './features/chat/chatArea.js';
import { openSettingsModal } from './features/settings/settingsModal.js';
import { showToast } from './components/ui/toast.js';
import { apiClient } from './api/client.js';
import { callRpc } from './api/rpc.js';
import { streamMux } from './api/stream.js';
import { checkStoredAuth, startOAuthSignIn, cancelOAuthSignIn, saveApiKey, signOut } from './api/auth.js';

// ── Tauri Window Controller ──────────────────────────────────────────────────
let tauriWindow = null;

async function initTauriWindow() {
  try {
    if (window.__TAURI__ && window.__TAURI__.window) {
      tauriWindow = window.__TAURI__.window.getCurrentWindow();
    }
  } catch (err) {
    console.warn('Tauri window API not available (running in browser/mock mode):', err);
  }
}

function setupTitlebarControls() {
  const btnClose = document.getElementById('tb-close');
  const btnMinimize = document.getElementById('tb-minimize');
  const btnExpand = document.getElementById('tb-expand');
  const titlebar = document.getElementById('app-titlebar');

  btnClose?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (tauriWindow?.close) {
      await tauriWindow.close();
    }
  });

  btnMinimize?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (tauriWindow?.minimize) {
      await tauriWindow.minimize();
    }
  });

  btnExpand?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (tauriWindow?.toggleMaximize) {
      await tauriWindow.toggleMaximize();
    }
  });

  titlebar?.addEventListener('dblclick', async (e) => {
    if (e.target.closest('.traffic-lights') || e.target.closest('button')) return;
    if (tauriWindow?.toggleMaximize) {
      await tauriWindow.toggleMaximize();
    }
  });
}

// ── In-Webview Bridge Self-Test ──────────────────────────────────────────────
async function runBridgeSelfTest() {
  const log = (msg, level = 'info') => {
    console.log(`[SELF-TEST] ${msg}`);
    if (window.__TAURI__ && window.__TAURI__.core) {
      window.__TAURI__.core.invoke('cmd_log_webview', { level, msg: `[SELF-TEST] ${msg}` }).catch(() => {});
    }
  };

  log('Starting Linux Desktop Bridge In-Webview Self-Test...');

  let passes = 0;
  let fails = 0;

  // Step 1: Token exchange & daemon status
  try {
    const status = await window.__TAURI__.core.invoke('cmd_get_daemon_status');
    if (status && status.status === 'ready' && status.port) {
      log(`Step 1 PASS: Daemon is ready on port ${status.port} (token exchanged & masked: ${status.token || 'ok'})`);
      passes++;
    } else {
      throw new Error(`Daemon status is ${status?.status || 'unknown'}`);
    }
  } catch (e) {
    log(`Step 1 FAIL (Token Exchange / Daemon Status): ${e.message}`, 'error');
    fails++;
  }

  // Step 2: workspace/initializeDefault
  let defaultWs = null;
  try {
    const wsRes = await callRpc('workspace', 'initializeDefault', {});
    if (wsRes && wsRes.workspace && wsRes.workspace.workspaceId) {
      defaultWs = wsRes.workspace;
      log(`Step 2 PASS: workspace/initializeDefault returned workspace '${defaultWs.title || defaultWs.path}' (id=${defaultWs.workspaceId})`);
      passes++;
    } else {
      throw new Error(`Unexpected workspace response: ${JSON.stringify(wsRes)}`);
    }
  } catch (e) {
    log(`Step 2 FAIL (workspace/initializeDefault): ${e.message}`, 'error');
    fails++;
  }

  // Step 3: session/create
  let createdSessionId = null;
  try {
    const createRes = await callRpc('session', 'create', { request: {} });
    if (createRes && createRes.sessionId) {
      createdSessionId = createRes.sessionId;
      log(`Step 3 PASS: session/create created session ${createdSessionId}`);
      passes++;
    } else {
      throw new Error(`Unexpected create response: ${JSON.stringify(createRes)}`);
    }
  } catch (e) {
    log(`Step 3 FAIL (session/create): ${e.message}`, 'error');
    fails++;
  }

  // Step 4: session/list
  try {
    const listRes = await callRpc('session', 'list', { _request: {} });
    if (listRes && Array.isArray(listRes.items)) {
      log(`Step 4 PASS: session/list returned ${listRes.items.length} sessions (contains newly created session: ${listRes.items.some(s => s.sessionId === createdSessionId)})`);
      passes++;
    } else {
      throw new Error(`Unexpected list response: ${JSON.stringify(listRes)}`);
    }
  } catch (e) {
    log(`Step 4 FAIL (session/list): ${e.message}`, 'error');
    fails++;
  }

  // Step 5: session/modelCatalog
  try {
    const catRes = await callRpc('session', 'modelCatalog', {});
    if (catRes && Array.isArray(catRes.groups)) {
      const totalModels = catRes.groups.reduce((acc, g) => acc + (g.models?.length || 0), 0);
      log(`Step 5 PASS: session/modelCatalog returned ${catRes.groups.length} groups with ${totalModels} models`);
      passes++;
    } else {
      throw new Error(`Unexpected modelCatalog response: ${JSON.stringify(catRes)}`);
    }
  } catch (e) {
    log(`Step 5 FAIL (session/modelCatalog): ${e.message}`, 'error');
    fails++;
  }

  // Step 6: WebSocket follow snapshot
  if (createdSessionId) {
    try {
      const snapshotPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket snapshot timeout after 5s')), 5000);
        const sub = streamMux.followSession(createdSessionId, {
          onSnapshot: (snap) => {
            clearTimeout(timeout);
            sub.cancel();
            resolve(snap);
          },
          onError: (err) => {
            clearTimeout(timeout);
            reject(err);
          }
        });
      });

      const snap = await snapshotPromise;
      log(`Step 6 PASS: WebSocket session/follow snapshot received! (permissionPreset=${snap.permissionPreset}, sandboxMode=${snap.sandboxMode})`);
      passes++;
    } catch (e) {
      log(`Step 6 FAIL (WebSocket follow snapshot): ${e.message}`, 'error');
      fails++;
    }
  }

  log(`Bridge Self-Test Complete: ${passes}/6 PASSED (${fails} failed).`);
}

window.runBridgeSelfTest = runBridgeSelfTest;

// ── Real Daemon Status Probing ───────────────────────────────────────────────
let selfTestRan = false;

function setupDaemonStatusListener() {
  const pillDot = document.getElementById('engine-pill-dot');
  const pillText = document.getElementById('engine-pill-text');
  const centerDot = document.getElementById('center-engine-dot');
  const centerText = document.getElementById('center-engine-text');

  apiClient.onStatusChange((state) => {
    let statusStr = 'Standby • Port ' + state.port;
    let isConnected = false;

    if (state.status === 'ready') {
      statusStr = `Connected • Port ${state.port}`;
      isConnected = true;
      // Initialize default model on daemon (maps to deepseek-account if signed in)
      callRpc('session', 'initializeDefaultModel', {}).catch(e => {
        console.warn('initializeDefaultModel notice:', e);
      });
    } else if (state.status === 'starting') {
      statusStr = `Starting • Port ${state.port}`;
    } else if (state.status === 'error') {
      statusStr = 'Error • Daemon Failed';
    } else if (state.status === 'offline') {
      statusStr = 'Offline';
    }

    if (pillDot) pillDot.className = `status-dot ${isConnected ? 'connected' : ''}`;
    if (pillText) pillText.textContent = statusStr;

    if (centerDot) centerDot.className = `status-dot ${isConnected ? 'connected' : ''}`;
    if (centerText) centerText.textContent = statusStr;

    if (state.status === 'error' && state.error) {
      showToast(`Daemon notice: ${state.error}`, 'error');
    }
  });

  if (apiClient.status === 'ready') {
    callRpc('session', 'initializeDefaultModel', {}).catch(e => {
      console.warn('initializeDefaultModel notice:', e);
    });
  }
}

// ── Auth Flow & Navigation ───────────────────────────────────────────────────
function setupAuth() {
  const authView = document.getElementById('auth-view');
  const mainAppStage = document.getElementById('main-app-stage');
  const titlebarScope = document.getElementById('titlebar-scope');

  const cardEntry = document.getElementById('auth-card-entry');
  const cardWaiting = document.getElementById('auth-card-waiting');
  const cardApiKey = document.getElementById('auth-card-apikey');

  const btnSignInBrowser = document.getElementById('btn-signin-browser');
  const btnUseApiKey = document.getElementById('btn-use-apikey');
  const btnCopyAuthLink = document.getElementById('btn-copy-auth-link');
  const btnCancelAuth = document.getElementById('btn-cancel-auth');
  const btnSubmitApiKey = document.getElementById('btn-submit-apikey');
  const btnBackFromApiKey = document.getElementById('btn-back-from-apikey');
  const apikeyInput = document.getElementById('auth-apikey-input');

  let activeAttemptId = null;

  function showAuthView(viewName) {
    if (cardEntry) cardEntry.style.display = viewName === 'entry' ? 'flex' : 'none';
    if (cardWaiting) cardWaiting.style.display = viewName === 'waiting' ? 'flex' : 'none';
    if (cardApiKey) cardApiKey.style.display = viewName === 'apikey' ? 'flex' : 'none';
  }

  async function performLogin(mode, name, email) {
    // 0.3s smooth deliberate transition
    await new Promise((res) => setTimeout(res, 300));

    store.login(mode, name, email);

    authView?.classList.add('hidden');
    mainAppStage?.classList.remove('hidden');

    if (titlebarScope) {
      titlebarScope.textContent = store.getState().user.name;
    }

    mountMainApp();
    showToast(`Welcome, ${store.getState().user.name}!`, 'success');
    callRpc('session', 'initializeDefaultModel', {}).catch(e => {
      console.warn('initializeDefaultModel notice:', e);
    });
  }

  // 1. Official Browser / Platform Sign-In
  btnSignInBrowser?.addEventListener('click', async () => {
    showToast('Redirecting to browser for sign-in...', 'info');
    btnSignInBrowser.classList.add('loading');
    btnSignInBrowser.disabled = true;

    try {
      showAuthView('waiting');
      const result = await startOAuthSignIn((attempt) => {
        activeAttemptId = attempt.id;
        if (attempt.authorizeUrl) {
          window.__lastAuthUrl = attempt.authorizeUrl;
        }
      });

      if (result && result.success) {
        await performLogin('google', result.user.name, result.user.email);
      }
    } catch (err) {
      console.error('Browser sign-in error:', err);
      showToast(`Sign in error: ${err.message}`, 'error');
      showAuthView('entry');
    } finally {
      btnSignInBrowser.classList.remove('loading');
      btnSignInBrowser.disabled = false;
    }
  });

  // 2. Copy Browser Auth Link
  btnCopyAuthLink?.addEventListener('click', () => {
    if (window.__lastAuthUrl) {
      navigator.clipboard.writeText(window.__lastAuthUrl).then(() => {
        showToast('Sign-in link copied to clipboard!', 'success');
      }).catch(() => {
        showToast('Failed to copy link', 'error');
      });
    }
  });

  // 3. Cancel Active Browser Authorization
  btnCancelAuth?.addEventListener('click', async () => {
    if (activeAttemptId) {
      await cancelOAuthSignIn(activeAttemptId).catch(() => {});
      activeAttemptId = null;
    }
    showAuthView('entry');
  });

  // 4. Switch to Direct API Key View
  btnUseApiKey?.addEventListener('click', () => {
    showAuthView('apikey');
    setTimeout(() => apikeyInput?.focus(), 60);
  });

  // 5. Back from API Key View to Entry
  btnBackFromApiKey?.addEventListener('click', () => {
    showAuthView('entry');
  });

  // 6. Save API Key and Initialize
  btnSubmitApiKey?.addEventListener('click', async () => {
    const key = apikeyInput?.value.trim();
    if (!key) {
      showToast('Please enter a valid DeepSeek API key', 'error');
      apikeyInput?.focus();
      return;
    }

    btnSubmitApiKey.classList.add('loading');
    btnSubmitApiKey.disabled = true;

    try {
      const res = await saveApiKey(key);
      showToast('API key securely saved to ~/.dsh/.credentials.yaml', 'success');
      await performLogin('apikey', res.user.name, res.user.email);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btnSubmitApiKey.classList.remove('loading');
      btnSubmitApiKey.disabled = false;
    }
  });

  // Key press Enter on API key input submits
  apikeyInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnSubmitApiKey?.click();
    }
  });

  document.getElementById('engine-status-pill')?.addEventListener('click', async () => {
    showToast(`Probing daemon on port ${apiClient.port}...`, 'info');
    await apiClient.probe();
  });
}

// ── Mount Main Application ───────────────────────────────────────────────────
function mountMainApp() {
  const mainAppStage = document.getElementById('main-app-stage');
  if (!mainAppStage) return;

  try {
    mainAppStage.innerHTML = '';

    function handleOpenSettings(initialTab = 'general') {
      openSettingsModal({
        initialTab,
        onSignOut: handleSignOut
      });
    }

    async function handleSignOut() {
      const authView = document.getElementById('auth-view');
      const titlebarScope = document.getElementById('titlebar-scope');

      await signOut();
      store.logout();

      mainAppStage.classList.add('hidden');
      authView?.classList.remove('hidden');

      if (titlebarScope) {
        titlebarScope.textContent = 'Workspace';
      }

      showToast('Signed out successfully', 'info');
    }

    // Sidebar
    const sidebarEl = createSidebar({
      onOpenSettings: handleOpenSettings,
      onSignOut: handleSignOut
    });

    // Main Chat Area
    const chatAreaEl = createChatArea();

    mainAppStage.appendChild(sidebarEl);
    mainAppStage.appendChild(chatAreaEl);

    // If user was already authenticated, show main app directly
    if (store.getState().auth.isAuthenticated) {
      const authView = document.getElementById('auth-view');
      const titlebarScope = document.getElementById('titlebar-scope');
      authView?.classList.add('hidden');
      mainAppStage.classList.remove('hidden');
      if (titlebarScope) {
        titlebarScope.textContent = store.getState().user.name;
      }
    }
  } catch (err) {
    const errorMsg = 'Critical error in mountMainApp: ' + (err.stack || err.message || err);
    console.error(errorMsg);
    if (window.__TAURI__ && window.__TAURI__.core) {
      window.__TAURI__.core.invoke('cmd_log_webview', { level: 'error', msg: errorMsg }).catch(() => {});
    }
    showToast('UI Error: ' + err.message, 'error');
  }
}

// ── Keyboard Shortcuts ───────────────────────────────────────────────────────
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Ctrl+B: Toggle Sidebar
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      store.toggleSidebar();
    }

    // Ctrl+N: New Chat
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      store.clearActiveChat();
      const textarea = document.getElementById('chat-hero-textarea');
      textarea?.focus();
    }

    // Ctrl+,: Open Settings
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      openSettingsModal({
        initialTab: 'general',
        onSignOut: async () => {
          await signOut();
          store.logout();
          const authView = document.getElementById('auth-view');
          const mainAppStage = document.getElementById('main-app-stage');
          const titlebarScope = document.getElementById('titlebar-scope');
          mainAppStage?.classList.add('hidden');
          authView?.classList.remove('hidden');
          if (titlebarScope) titlebarScope.textContent = 'Workspace';
        }
      });
    }

    // Ctrl+/: Focus Chat Input
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const textarea = document.getElementById('chat-hero-textarea');
      textarea?.focus();
    }

    // Ctrl+T: Toggle Deep Reason (Reasoner model)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
      e.preventDefault();
      const currentModel = store.getState().model;
      // If current model has reasoning, switch to fast; otherwise switch to reasoner
      const hasReasoning = currentModel?.reasoning || currentModel?.id?.includes('r1');
      if (hasReasoning) {
        // Switch to DeepSeek-V3 (fast)
        store.setModel({ id: 'deepseek-v3', name: 'DeepSeek-V3', tag: 'Fast', reasoning: false });
        showToast('Switched to DeepSeek-V3 (Fast)', 'info');
      } else {
        // Switch to DeepSeek-R1 (reasoner)
        store.setModel({ id: 'deepseek-r1', name: 'DeepSeek-R1', tag: 'Reasoner', reasoning: true });
        showToast('Switched to DeepSeek-R1 (Reasoner)', 'info');
      }
    }

    // Ctrl+S: Cycle Workspace Permission (Sandbox mode)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      // Only trigger if chat input is focused (scope: Chat)
      const activeEl = document.activeElement;
      const textarea = document.getElementById('chat-hero-textarea');
      if (activeEl === textarea) {
        e.preventDefault();
        // Find and click the permission pill button to cycle modes
        const permBtn = document.getElementById('chat-permission-btn');
        if (permBtn) {
          permBtn.click();
        }
      }
    }

    // Esc: Close any open modal
    if (e.key === 'Escape') {
      const openModals = document.querySelectorAll('.modal-overlay');
      if (openModals.length > 0) {
        // Let each modal handle its own Esc internally; don't double-close
      }
    }
  });
}

// ── Apply Initial Preferences ────────────────────────────────────────────────
function applyInitialPreferences() {
  const gen = store.getState().settings.general;
  const root = document.documentElement;

  if (gen.theme) root.setAttribute('data-theme', gen.theme);
  if (gen.textSize) root.setAttribute('data-text-size', gen.textSize);
  if (gen.transcriptWidth) root.setAttribute('data-transcript-width', gen.transcriptWidth);
  if (gen.motion) root.setAttribute('data-motion', gen.motion);
  if (gen.interfaceFont) {
    root.style.setProperty(
      '--font-sans',
      gen.interfaceFont === 'JetBrains Mono'
        ? 'JetBrains Mono, monospace'
        : `-apple-system, BlinkMacSystemFont, "${gen.interfaceFont}", system-ui, sans-serif`
    );
  }
}

// ── Session Restoration at Startup ──────────────────────────────────────────
async function restoreStoredSession() {
  try {
    const auth = await checkStoredAuth();
    if (auth && auth.authenticated) {
      store.login(auth.mode, auth.user.name, auth.user.email);
      const authView = document.getElementById('auth-view');
      const mainAppStage = document.getElementById('main-app-stage');
      const titlebarScope = document.getElementById('titlebar-scope');

      authView?.classList.add('hidden');
      mainAppStage?.classList.remove('hidden');

      if (titlebarScope) {
        titlebarScope.textContent = store.getState().user.name;
      }

      mountMainApp();
      showToast(`Session restored (${auth.user.name})`, 'info');
      callRpc('session', 'initializeDefaultModel', {}).catch(e => {
        console.warn('initializeDefaultModel notice:', e);
      });
    }
  } catch (err) {
    console.warn('Session restoration check skipped:', err);
  }
}

// ── Application Bootstrap ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (window.__TAURI__ && window.__TAURI__.core) {
    window.__TAURI__.core.invoke('cmd_log_webview', { level: 'info', msg: 'Webview DOMContentLoaded initialized' }).catch(() => {});
  }

  await initTauriWindow();
  setupTitlebarControls();
  applyInitialPreferences();

  // Initialize Living ASCII Koi Pond for Full Auth Screen Background
  if (typeof window.initPond === 'function') {
    window.initPond('pond-canvas', 'auth-view');
  }

  setupAuth();
  mountMainApp();
  setupKeyboardShortcuts();

  // Initialize backend API client & supervisor status listener
  await apiClient.init();
  setupDaemonStatusListener();

  // Polling watchdog to ensure self-test triggers as soon as daemon is ready
  const pollTimer = setInterval(async () => {
    try {
      if (window.__TAURI__ && window.__TAURI__.core) {
        const info = await window.__TAURI__.core.invoke('cmd_get_daemon_status');
        if (info && info.status === 'ready') {
          apiClient.updateState(info);
          clearInterval(pollTimer);
        }
      }
    } catch (e) {
      console.warn('Daemon status poll error:', e);
    }
  }, 1000);

  // Attempt session restoration if credentials already exist
  await restoreStoredSession();

  // Listen for OAuth callback deep-link events from Tauri backend.
  // When user clicks "Open DeepSeek Harness" in browser, the dsh:// handler
  // fires, the Rust single-instance guard focuses this window, and Tauri
  // emits 'dsh://oauth-callback' into the webview so the auth poller reacts.
  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.listen('dsh://oauth-callback', (_event) => {
      // Focus window and bring to foreground
      window.__TAURI__.core.invoke('cmd_focus_window').catch(() => {});
      showToast('Browser sign-in callback received', 'success');
    }).catch(() => {});
  }
});
