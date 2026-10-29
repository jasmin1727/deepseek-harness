/**
 * Authentication & Platform Credentials Manager
 * Handles OAuth PKCE browser sign-in, API key persistence, guest mode, and session persistence.
 */

import { callRpc } from './rpc.js';
import { apiClient } from './client.js';

export function getClientMetadata() {
  return {
    version: '0.2.1',
    locale: navigator.language || 'en-US',
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
  };
}

export async function checkStoredAuth() {
  // 1. Check if stored API key exists in ~/.dsh/.credentials.yaml
  try {
    if (window.__TAURI__ && window.__TAURI__.core) {
      const hasKey = await window.__TAURI__.core.invoke('cmd_has_api_key');
      if (hasKey) {
        return {
          authenticated: true,
          mode: 'apikey',
          user: {
            name: 'Jasmin',
            email: 'developer@deepseek.com',
            plan: 'API Key'
          }
        };
      }
    }
  } catch (err) {
    console.warn('Auth: could not check stored API key:', err);
  }

  // 2. Check if platform OAuth credentials are saved in daemon
  try {
    const accountState = await callRpc('account', 'getState');
    if (accountState && accountState.status === 'credential-stored') {
      try {
        const profileRaw = await callRpc('account', 'getProfile', { client: getClientMetadata() });
        const p = profileRaw?.value || profileRaw;
        const name = p?.name || p?.contact || p?.email || 'DeepSeek User';
        const email = p?.contact || p?.email || 'user@deepseek.com';
        return {
          authenticated: true,
          mode: 'google',
          user: {
            name,
            email,
            plan: 'Pro',
            avatar: p?.avatarUrl || null
          }
        };
      } catch {
        return {
          authenticated: true,
          mode: 'google',
          user: { name: 'DeepSeek User', email: 'account@deepseek.com', plan: 'Pro' }
        };
      }
    }
  } catch (err) {
    console.warn('Auth: daemon account check failed (daemon may be initializing):', err);
  }

  return { authenticated: false, mode: 'none', user: null };
}

export async function startOAuthSignIn(onWaitingBrowser) {
  const client = getClientMetadata();
  const callbackOrigin = apiClient.getBaseUrl();

  let state = await callRpc('account', 'startSignIn', {
    client,
    callbackOrigin,
    loginSource: 'desktop'
  });

  let attempt = state.attempt;

  // Daemon's startSignIn begins authorization asynchronously; on the first tick,
  // attempt.authorizeUrl may still be generating. Poll until authorizeUrl is ready.
  const startWait = Date.now();
  while ((!attempt || !attempt.authorizeUrl) && (Date.now() - startWait < 8000)) {
    await new Promise((res) => setTimeout(res, 200));
    try {
      state = await callRpc('account', 'getState');
      attempt = state?.attempt;
    } catch {
      // transient poll error, continue
    }
  }

  if (!attempt || !attempt.authorizeUrl) {
    throw new Error('Failed to obtain authorization URL from daemon');
  }

  // Open the platform OAuth URL in system default browser
  if (window.__TAURI__ && window.__TAURI__.core) {
    await window.__TAURI__.core.invoke('cmd_open_browser', { url: attempt.authorizeUrl });
  } else {
    window.open(attempt.authorizeUrl, '_blank');
  }

  if (onWaitingBrowser) {
    onWaitingBrowser(attempt);
  }

  // Poll until browser exchange completes or attempt terminates
  return pollSignInAttempt(attempt.id);
}

export async function cancelOAuthSignIn(attemptId) {
  return callRpc('account', 'cancelSignIn', { attemptId });
}

async function pollSignInAttempt(attemptId, timeoutMs = 120_000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((res) => setTimeout(res, 1000));

    try {
      const state = await callRpc('account', 'getState');
      if (state.status === 'credential-stored') {
        const profileRaw = await callRpc('account', 'getProfile', { client: getClientMetadata() }).catch(() => null);
        const p = profileRaw?.value || profileRaw;
        const name = p?.name || p?.contact || p?.email || 'DeepSeek User';
        const email = p?.contact || p?.email || 'user@deepseek.com';
        return {
          success: true,
          user: {
            name,
            email,
            plan: 'Pro',
            avatar: p?.avatarUrl || null
          }
        };
      }

      if (state.attempt) {
        if (state.attempt.phase === 'succeeded') {
          return {
            success: true,
            user: { name: 'DeepSeek User', email: 'user@deepseek.com', plan: 'Pro' }
          };
        }
        if (state.attempt.phase === 'cancelled') {
          throw new Error('Login was cancelled');
        }
        if (state.attempt.phase === 'failed' || state.attempt.phase === 'expired') {
          throw new Error(`Login attempt ${state.attempt.phase} (${state.attempt.errorCode || 'unknown error'})`);
        }
      }
    } catch (err) {
      if (err.message.includes('Login')) throw err;
      // Network hiccup during polling is tolerated
    }
  }

  throw new Error('Browser login timed out after 2 minutes');
}

export async function saveApiKey(apiKey) {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error('API key cannot be empty');
  }

  if (!trimmed.startsWith('sk-')) {
    throw new Error('Invalid DeepSeek API key format (must start with sk-)');
  }

  if (window.__TAURI__ && window.__TAURI__.core) {
    await window.__TAURI__.core.invoke('cmd_set_api_key', { key: trimmed });
  } else {
    // Development mode fallback
    localStorage.setItem('dsh_dev_api_key_set', 'true');
  }

  return {
    success: true,
    user: {
      name: 'Jasmin',
      email: 'developer@deepseek.com',
      plan: 'API Key'
    }
  };
}

export async function signOut() {
  try {
    await callRpc('account', 'signOut', { client: getClientMetadata() });
  } catch (err) {
    console.warn('Sign out RPC warning:', err);
  }
}
