/**
 * DeepSeek Harness — Localhost API Client & Daemon Bridge
 * Manages loopback communication, authentication tokens, and daemon lifecycle events.
 */

class ApiClient {
  constructor() {
    this.port = 3000;
    this.token = null;
    this.status = 'starting'; // 'starting' | 'ready' | 'error' | 'offline'
    this.error = null;
    this.listeners = new Set();
    this.initialized = false;
    this.connected = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Check window global injected by Tauri webview if already present
    if (window.__DSH_DAEMON_INFO__) {
      this.updateState(window.__DSH_DAEMON_INFO__);
    }

    // 2. Query Tauri IPC if available
    try {
      if (window.__TAURI__ && window.__TAURI__.core) {
        const info = await window.__TAURI__.core.invoke('cmd_get_daemon_status');
        if (info) {
          this.updateState(info);
        }

        // Listen for live status change events from supervisor
        if (window.__TAURI__.event) {
          await window.__TAURI__.event.listen('dsh://status-changed', (event) => {
            if (event && event.payload) {
              this.updateState(event.payload);
            }
          });
        }
      }
    } catch (err) {
      console.warn('API Client: Tauri IPC not available, defaulting to mock/direct mode:', err);
    }

    // 3. Register global hook for early webview evaluation
    window.__onDaemonReady = (info) => {
      this.updateState({ status: 'ready', ...info });
    };

    // 4. Probe loopback if still starting
    if (this.status !== 'ready') {
      await this.probe();
    }
  }

  updateState(info) {
    const prevStatus = this.status;
    const prevPort = this.port;

    if (info.status) this.status = info.status;
    if (info.port) this.port = info.port;
    if (info.token) this.token = info.token;
    if (info.error) this.error = info.error;

    if (this.status === 'ready') {
      this.connected = true;
    }

    if (prevStatus !== this.status || prevPort !== this.port) {
      this.notifyListeners();
    }
  }

  async probe() {
    try {
      const url = this.getBaseUrl();
      const res = await fetch(`${url}/`, {
        method: 'HEAD',
        mode: 'no-cors'
      });
      this.connected = true;
      this.status = 'ready';
      this.notifyListeners();
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  getBaseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  getWsUrl(path = '/api/remote.mux') {
    const base = `ws://127.0.0.1:${this.port}${path}`;
    return this.token ? `${base}?token=${encodeURIComponent(this.token)}` : base;
  }

  onStatusChange(fn) {
    this.listeners.add(fn);
    fn({ status: this.status, port: this.port, token: this.token, connected: this.connected, error: this.error });
    return () => this.listeners.delete(fn);
  }

  notifyListeners() {
    const state = {
      status: this.status,
      port: this.port,
      token: this.token,
      connected: this.connected,
      error: this.error
    };
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (e) {
        console.error('API Client listener error:', e);
      }
    }
  }

  async authenticatedFetch(path, options = {}) {
    const baseUrl = this.getBaseUrl();
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
    const headers = new Headers(options.headers || {});

    if (this.token) {
      headers.set('x-dsh-auth-token', this.token);
    }

    const fetchOpts = {
      ...options,
      headers,
      credentials: 'include'
    };

    return fetch(url, fetchOpts);
  }

  async ensureTrust() {
    if (!this.token) return;
    try {
      await this.authenticatedFetch(`/connect?token=${encodeURIComponent(this.token)}&interactions=answer`);
    } catch (e) {
      console.warn('Connect trust check warning:', e);
    }
  }
}

export const apiClient = new ApiClient();
