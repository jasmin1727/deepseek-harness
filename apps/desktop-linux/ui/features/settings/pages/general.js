/**
 * Settings Page — General Preferences
 * Matches Mac App Settings: Theme (System, Light, Dark) and Language (English, 简体中文).
 */

import { store } from '../../../store/state.js';
import { icons } from '../../../components/ui/icons.js';
import { showToast } from '../../../components/ui/toast.js';

export function renderGeneralPage() {
  const container = document.createElement('div');
  container.className = 'settings-pane-scroll';

  const settings = store.getState().settings.general;
  const currentLang = settings.language || 'en-US';

  container.innerHTML = `
    <!-- Appearance Section -->
    <div class="settings-group">
      <h3 class="settings-group-title">Appearance</h3>

      <!-- Theme Selector: 3-icon picker [ Monitor | Sun | Moon ] -->
      <div class="settings-row">
        <div class="settings-row-text">
          <span class="settings-row-label">Theme</span>
          <span class="settings-row-sub">Choose interface color scheme or follow OS system preference.</span>
        </div>
        <div class="settings-row-control">
          <div class="theme-icon-segmented" id="theme-segmented-picker">
            <button type="button" class="theme-icon-btn ${settings.theme === 'system' ? 'active' : ''}" data-val="system" title="System preference" aria-label="System theme">
              ${icons.monitor('', 15)}
            </button>
            <button type="button" class="theme-icon-btn ${settings.theme === 'light' ? 'active' : ''}" data-val="light" title="Light theme" aria-label="Light theme">
              ${icons.sun('', 15)}
            </button>
            <button type="button" class="theme-icon-btn ${settings.theme === 'dark' ? 'active' : ''}" data-val="dark" title="Dark theme" aria-label="Dark theme">
              ${icons.moon('', 15)}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Language & Localization -->
    <div class="settings-group">
      <h3 class="settings-group-title">Language & Localization</h3>

      <div class="settings-row">
        <div class="settings-row-text">
          <span class="settings-row-label">Interface Language</span>
          <span class="settings-row-sub">Primary language for application navigation and system prompts.</span>
        </div>
        <div class="settings-row-control">
          <select class="select-input" id="setting-language" style="width: 190px;">
            <option value="en-US" ${currentLang === 'en-US' ? 'selected' : ''}>English</option>
            <option value="zh-CN" ${currentLang === 'zh-CN' ? 'selected' : ''}>简体中文 (Chinese)</option>
          </select>
        </div>
      </div>
    </div>
  `;

  // Attach Working Event Handlers
  // Theme Buttons (Monitor, Sun, Moon)
  const themeButtons = container.querySelectorAll('#theme-segmented-picker button');
  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      themeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      store.updateSetting('general', 'theme', val);
      showToast(`Theme switched to ${val}`, 'info');
    });
  });

  // Language Select
  const langSelect = container.querySelector('#setting-language');
  langSelect?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'zh-CN') {
      showToast('简体中文 (Chinese): Coming Soon...', 'info');
      langSelect.value = 'en-US';
      store.updateSetting('general', 'language', 'en-US');
    } else {
      store.updateSetting('general', 'language', val);
      showToast('Language set to English', 'success');
    }
  });

  return container;
}
