/**
 * DeepSeek Harness — Complete Settings Modal
 * 14-page navigable modal with live search filtering and instant theme/font application.
 */

import { icons } from '../../components/ui/icons.js';
import { createModal } from '../../components/ui/modal.js';
import { renderGeneralPage } from './pages/general.js';
import { renderAccountPage } from './pages/account.js';
import { renderModelsPage } from './pages/models.js';
import { renderSkillsPage } from './pages/skills.js';
import { renderConnectorsPage } from './pages/connectors.js';
import { renderPluginsPage } from './pages/plugins.js';
import { renderAutomationPage } from './pages/automation.js';
import { renderApiKeysPage } from './pages/apiKeys.js';
import { renderShortcutsPage } from './pages/shortcuts.js';
import { renderAboutPage } from './pages/about.js';

const TABS = [
  // Group: Preferences
  { id: 'general', label: 'General', group: 'Preferences', icon: icons.settings('', 15), renderer: renderGeneralPage },
  { id: 'account', label: 'Account', group: 'Preferences', icon: icons.user('', 15), renderer: renderAccountPage },
  { id: 'models', label: 'Models', group: 'Preferences', icon: icons.cpu('', 15), renderer: renderModelsPage },

  // Group: Harness
  { id: 'skills', label: 'Skills', group: 'Harness', icon: icons.puzzle('', 15), renderer: renderSkillsPage },
  { id: 'connectors', label: 'Connectors', group: 'Harness', icon: icons.link2('', 15), renderer: renderConnectorsPage },
  { id: 'plugins', label: 'Plugins', group: 'Harness', icon: icons.sliders('', 15), renderer: renderPluginsPage },
  { id: 'automation', label: 'Automation', group: 'Harness', icon: icons.clock('', 15), renderer: renderAutomationPage },

  // Group: Platform
  { id: 'apiKeys', label: 'API Keys', group: 'Platform', icon: icons.key('', 15), renderer: renderApiKeysPage },
  { id: 'shortcuts', label: 'Shortcuts', group: 'Platform', icon: icons.command('', 15), renderer: renderShortcutsPage },
  { id: 'about', label: 'About', group: 'Platform', icon: icons.info('', 15), renderer: renderAboutPage }
];

export function openSettingsModal({ initialTab = 'general', onSignOut } = {}) {
  let currentTabId = initialTab;
  let modalInstance = null;

  const dialogEl = document.createElement('div');
  dialogEl.className = 'settings-dialog';

  // Left Sidebar
  const sidebarEl = document.createElement('div');
  sidebarEl.className = 'settings-sidebar';

  sidebarEl.innerHTML = `
    <div class="settings-header-row">
      <span class="settings-title">Settings</span>
    </div>
    <div class="settings-search-wrapper">
      <span class="settings-search-icon">${icons.search('', 13)}</span>
      <input type="text" class="settings-search-input" id="settings-filter-input" placeholder="Search settings..." />
    </div>
    <div class="settings-nav-scroll" id="settings-nav-scroll"></div>
  `;

  // Right Content Pane
  const contentPaneEl = document.createElement('div');
  contentPaneEl.className = 'settings-content-pane';

  const paneHeaderEl = document.createElement('div');
  paneHeaderEl.className = 'settings-pane-header';
  paneHeaderEl.innerHTML = `
    <span class="settings-pane-title" id="settings-active-title">General</span>
    <button class="btn-icon settings-close-btn" id="btn-close-settings" title="Close (Esc)" aria-label="Close">
      ${icons.x('', 16)}
    </button>
  `;

  const paneBodyEl = document.createElement('div');
  paneBodyEl.className = 'settings-pane-body';
  paneBodyEl.style.cssText = 'flex: 1; overflow: hidden; display: flex; flex-direction: column;';

  contentPaneEl.appendChild(paneHeaderEl);
  contentPaneEl.appendChild(paneBodyEl);

  dialogEl.appendChild(sidebarEl);
  dialogEl.appendChild(contentPaneEl);

  // Render Navigation Tabs with Search Filter
  function renderNav(searchQuery = '') {
    const navScroll = sidebarEl.querySelector('#settings-nav-scroll');
    if (!navScroll) return;
    navScroll.innerHTML = '';

    const query = searchQuery.toLowerCase().trim();
    const groups = ['Preferences', 'Harness', 'Platform'];

    groups.forEach((groupName) => {
      const groupTabs = TABS.filter((t) => {
        if (t.group !== groupName) return false;
        if (!query) return true;
        return t.label.toLowerCase().includes(query) || t.id.toLowerCase().includes(query);
      });

      if (groupTabs.length === 0) return;

      const groupContainer = document.createElement('div');
      groupContainer.className = 'settings-nav-group';

      const labelEl = document.createElement('span');
      labelEl.className = 'settings-nav-group-label';
      labelEl.textContent = groupName;
      groupContainer.appendChild(labelEl);

      groupTabs.forEach((tab) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `settings-tab-btn ${tab.id === currentTabId ? 'active' : ''}`;
        btn.setAttribute('data-tab-id', tab.id);
        btn.innerHTML = `
          <span class="settings-tab-icon">${tab.icon}</span>
          <span>${tab.label}</span>
        `;

        btn.addEventListener('click', () => {
          switchTab(tab.id);
        });

        groupContainer.appendChild(btn);
      });

      navScroll.appendChild(groupContainer);
    });
  }

  // Switch Tab
  function switchTab(tabId) {
    currentTabId = tabId;
    const tabObj = TABS.find((t) => t.id === tabId) || TABS[0];

    // Update active tab button
    sidebarEl.querySelectorAll('.settings-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab-id') === tabId);
    });

    // Update Header
    const titleEl = contentPaneEl.querySelector('#settings-active-title');
    if (titleEl) titleEl.textContent = tabObj.label;

    // Render Page Content
    paneBodyEl.innerHTML = '';
    const pageEl = tabObj.renderer({
      onSignOut,
      onCloseModal: () => modalInstance && modalInstance.close()
    });
    paneBodyEl.appendChild(pageEl);
  }

  // Search Input Handler
  const searchInput = sidebarEl.querySelector('#settings-filter-input');
  searchInput?.addEventListener('input', (e) => {
    renderNav(e.target.value);
  });

  // Close Button Handler
  paneHeaderEl.querySelector('#btn-close-settings')?.addEventListener('click', () => {
    if (modalInstance) modalInstance.close();
  });

  // Open Modal
  modalInstance = createModal({
    contentEl: dialogEl,
    maxWidth: '960px'
  });

  renderNav();
  switchTab(currentTabId);

  return modalInstance;
}
