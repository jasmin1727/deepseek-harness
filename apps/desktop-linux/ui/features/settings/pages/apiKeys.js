/**
 * Settings Page — API Keys Management
 * Real integration with ~/.dsh/.credentials.yaml via Tauri IPC.
 */

import { icons } from '../../../components/ui/icons.js';
import { showToast } from '../../../components/ui/toast.js';

export function renderApiKeysPage() {
  const container = document.createElement('div');
  container.className = 'settings-pane-scroll';

  let hasStoredApiKey = false;

  async function checkKeyStatus() {
    if (window.__TAURI__ && window.__TAURI__.core) {
      try {
        hasStoredApiKey = await window.__TAURI__.core.invoke('cmd_has_api_key');
      } catch {
        hasStoredApiKey = false;
      }
    }
  }

  async function render() {
    await checkKeyStatus();

    container.innerHTML = `
      <!-- Primary DeepSeek Platform API Key Card -->
      <div class="settings-section-card" style="padding: 22px 24px;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 6px;">
          <div style="flex: 1; min-width: 0;">
            <h3 class="settings-card-title" style="font-size: 15px; font-weight: 600;">DeepSeek Platform API Key</h3>
            <p class="settings-card-desc" style="margin-top: 4px; line-height: 1.5; color: var(--text-secondary); font-size: 13px;">
              Direct authentication key persisted securely in <code style="font-family: var(--font-mono); font-size: 11.5px; background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">~/.dsh/.credentials.yaml</code> (chmod 0600).
            </p>
          </div>
          <span class="badge ${hasStoredApiKey ? 'badge-pro' : 'badge-neutral'}" id="dsh-api-status-badge" style="white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border-radius: 999px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.3px;">
            ${hasStoredApiKey ? '<span style="color:#22c55e; font-size: 10px;">●</span> Configured' : '<span style="color:var(--text-muted); font-size: 10px;">○</span> Not Configured'}
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; margin-top: 16px;">
          <input
            type="password"
            class="input-text"
            id="input-primary-api-key"
            placeholder="${hasStoredApiKey ? '••••••••••••••••••••••••••••••••' : 'sk-...'}"
            style="flex: 1; height: 38px; font-family: var(--font-mono); font-size: 13px; padding: 0 12px;"
            autocomplete="off"
            spellcheck="false"
          />
          <button class="btn btn-primary" id="btn-save-primary-key" style="height: 38px; padding: 0 16px; white-space: nowrap;">
            ${hasStoredApiKey ? 'Update Key' : 'Save Key'}
          </button>
          ${hasStoredApiKey ? `
            <button class="btn btn-secondary" id="btn-clear-primary-key" style="height: 38px; padding: 0 14px; white-space: nowrap; color: var(--status-danger);">
              Remove
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // Handlers
    const saveKeyBtn = container.querySelector('#btn-save-primary-key');
    const clearKeyBtn = container.querySelector('#btn-clear-primary-key');
    const keyInput = container.querySelector('#input-primary-api-key');

    saveKeyBtn?.addEventListener('click', async () => {
      const val = keyInput.value.trim();
      if (!val) {
        showToast('Please enter an API key', 'error');
        keyInput.focus();
        return;
      }
      if (!val.startsWith('sk-')) {
        showToast('Warning: DeepSeek API keys typically begin with "sk-"', 'info');
      }

      if (window.__TAURI__ && window.__TAURI__.core) {
        try {
          await window.__TAURI__.core.invoke('cmd_set_api_key', { key: val });
          showToast('API key securely saved to ~/.dsh/.credentials.yaml', 'success');
          keyInput.value = '';
          await render();
        } catch (err) {
          showToast(`Failed to save key: ${err}`, 'error');
        }
      } else {
        showToast('API key saved (browser mode)', 'success');
        keyInput.value = '';
      }
    });

    clearKeyBtn?.addEventListener('click', async () => {
      if (window.__TAURI__ && window.__TAURI__.core) {
        try {
          await window.__TAURI__.core.invoke('cmd_clear_api_key');
          showToast('API key removed from ~/.dsh/.credentials.yaml', 'info');
          await render();
        } catch (err) {
          showToast(`Failed to remove key: ${err}`, 'error');
        }
      } else {
        hasStoredApiKey = false;
        showToast('API key cleared', 'info');
        await render();
      }
    });
  }

  render();
  return container;
}
