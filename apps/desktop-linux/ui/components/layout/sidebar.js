/**
 * DeepSeek Harness — Sidebar Component
 * Connects real workspaces, folders, and durable sessions to the daemon.
 */

import { icons } from '../ui/icons.js';
import { store } from '../../store/state.js';
import { openDropdown } from '../ui/dropdown.js';
import { showToast } from '../ui/toast.js';
import { listSessions, renameSession, loadSessionHistory, saveSessionTitle } from '../../api/sessions.js';
import { listWorkspaces, pickAndCreateWorkspace } from '../../api/workspaces.js';
import { apiClient } from '../../api/client.js';

export function createSidebar({ onOpenSettings, onSignOut }) {
  const sidebarEl = document.createElement('aside');
  sidebarEl.className = 'app-sidebar';
  sidebarEl.id = 'app-sidebar';

  const state = store.getState();
  if (!state.sidebar.isOpen) {
    sidebarEl.classList.add('collapsed');
  }

  // 1. Header (Brand + Collapse Toggle)
  const headerEl = document.createElement('div');
  headerEl.className = 'sidebar-header';
  headerEl.innerHTML = `
    <div class="sidebar-brand-lockup" id="sidebar-brand-home" title="DeepSeek Harness">
      <span class="sidebar-logo">${icons.whaleMark('', 22)}</span>
      <span class="sidebar-brand-text">deepseek</span>
      <span class="sidebar-brand-tag">HARNESS</span>
    </div>
    <button class="btn-icon sidebar-toggle-btn" id="sidebar-toggle-btn" title="Toggle Sidebar (Ctrl+B)" aria-label="Toggle Sidebar">
      ${icons.sidebar('', 16)}
    </button>
  `;

  // 2. Primary Action Button: + New Session
  const actionsEl = document.createElement('div');
  actionsEl.className = 'sidebar-actions';
  actionsEl.innerHTML = `
    <button class="btn-new-session" id="btn-sidebar-new-session" title="New Session (Ctrl+N)">
      <span class="new-session-icon">${icons.plus('', 15)}</span>
      <span>New Session</span>
    </button>
  `;

  // 3. Quick Navigation (Skills, Connectors, Plugins & Automation)
  const quickNavEl = document.createElement('div');
  quickNavEl.className = 'sidebar-quick-nav';
  quickNavEl.innerHTML = `
    <button class="quick-nav-item" id="nav-skills" title="Skills">
      <span class="quick-nav-icon">${icons.puzzle('', 14)}</span>
      <span>Skills</span>
    </button>
    <button class="quick-nav-item" id="nav-connectors" title="Connectors">
      <span class="quick-nav-icon">${icons.link2('', 14)}</span>
      <span>Connectors</span>
    </button>
    <button class="quick-nav-item" id="nav-plugins" title="Plugins">
      <span class="quick-nav-icon">${icons.sliders('', 14)}</span>
      <span>Plugins</span>
    </button>
    <button class="quick-nav-item" id="nav-automation" title="Automation">
      <span class="quick-nav-icon">${icons.clock('', 14)}</span>
      <span>Automation</span>
    </button>
  `;

  quickNavEl.querySelector('#nav-skills')?.addEventListener('click', () => {
    if (onOpenSettings) onOpenSettings('skills');
  });
  quickNavEl.querySelector('#nav-connectors')?.addEventListener('click', () => {
    if (onOpenSettings) onOpenSettings('connectors');
  });
  quickNavEl.querySelector('#nav-plugins')?.addEventListener('click', () => {
    if (onOpenSettings) onOpenSettings('plugins');
  });
  quickNavEl.querySelector('#nav-automation')?.addEventListener('click', () => {
    if (onOpenSettings) onOpenSettings('automation');
  });

  // 4. Workspace Section
  const workspaceSection = document.createElement('div');
  workspaceSection.className = 'sidebar-workspace-section';

  const wsHeader = document.createElement('div');
  wsHeader.className = 'workspace-section-header';
  wsHeader.innerHTML = `
    <span class="workspace-section-title">Workspace</span>
    <div class="workspace-header-actions">
      <button class="btn-icon-xs" id="ws-btn-search" title="Search sessions" aria-label="Search">
        ${icons.search('', 13)}
      </button>
      <button class="btn-icon-xs" id="ws-btn-refresh" title="Refresh workspaces & sessions" aria-label="Refresh">
        ${icons.arrowUpDown('', 13)}
      </button>
      <button class="btn-icon-xs" id="ws-btn-new-folder" title="Open workspace folder..." aria-label="New folder">
        ${icons.folderPlus('', 13)}
      </button>
    </div>
  `;

  // Search input (collapsible)
  const searchBox = document.createElement('div');
  searchBox.className = 'workspace-search-box hidden';
  searchBox.id = 'workspace-search-box';
  searchBox.innerHTML = `
    <input type="text" class="workspace-search-input" id="workspace-search-input" placeholder="Search sessions..." autocomplete="off" />
  `;

  wsHeader.querySelector('#ws-btn-search')?.addEventListener('click', () => {
    searchBox.classList.toggle('hidden');
    if (!searchBox.classList.contains('hidden')) {
      searchBox.querySelector('input')?.focus();
    }
  });

  // Folders tree
  const foldersTree = document.createElement('div');
  foldersTree.className = 'workspace-folders-tree';

  // Default Folder Container
  const defaultFolder = document.createElement('div');
  defaultFolder.className = 'workspace-folder active-folder';
  defaultFolder.id = 'workspace-default-folder';

  const defaultFolderHeader = document.createElement('div');
  defaultFolderHeader.className = 'folder-header';
  defaultFolderHeader.innerHTML = `
    <span class="folder-icon">${icons.folder('', 14)}</span>
    <span class="folder-title" id="sidebar-active-ws-title">Default workspace</span>
  `;

  const sessionsContainer = document.createElement('div');
  sessionsContainer.className = 'folder-sessions-list';
  sessionsContainer.id = 'folder-default-sessions';

  defaultFolder.appendChild(defaultFolderHeader);
  defaultFolder.appendChild(sessionsContainer);

  const otherFoldersEl = document.createElement('div');
  otherFoldersEl.className = 'other-workspace-folders';

  foldersTree.appendChild(defaultFolder);
  foldersTree.appendChild(otherFoldersEl);

  workspaceSection.appendChild(wsHeader);
  workspaceSection.appendChild(searchBox);
  workspaceSection.appendChild(foldersTree);

  // 5. User Profile Footer
  const footerEl = document.createElement('div');
  footerEl.className = 'sidebar-user-footer';
  footerEl.id = 'sidebar-user-footer';

  function renderUserFooter() {
    const user = store.getState().user;
    const plan = user.plan || 'Pro';
    let badgeClass = 'badge-pro';
    if (plan.toLowerCase() === 'free' || plan.toLowerCase() === 'guest') badgeClass = 'badge-free';
    if (plan.toLowerCase() === 'api') badgeClass = 'badge-api';

    const displayName = user.name || 'DeepSeek';
    const avatarInitial = (displayName[0] || 'D').toUpperCase();

    footerEl.innerHTML = `
      <div class="sidebar-user-left" id="sidebar-user-menu-trigger" title="${displayName} (${user.email || 'harness@deepseek.com'})">
        <div class="avatar" id="sidebar-user-avatar">${avatarInitial}</div>
        <span class="user-name-text" id="sidebar-user-name">${displayName}</span>
        <span class="badge ${badgeClass} user-plan-badge" id="sidebar-user-plan">${plan}</span>
      </div>
      <button class="btn-icon btn-sidebar-settings" id="btn-sidebar-settings" title="Settings (Ctrl+,)" aria-label="Settings">
        ${icons.settings('', 16)}
      </button>
    `;

    const userTrigger = footerEl.querySelector('#sidebar-user-menu-trigger');
    userTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      openDropdown({
        triggerEl: userTrigger,
        position: 'top-start',
        items: [
          {
            label: 'Account Settings',
            icon: icons.user('', 14),
            onClick: () => onOpenSettings && onOpenSettings('account')
          },
          {
            label: 'Preferences',
            icon: icons.settings('', 14),
            onClick: () => onOpenSettings && onOpenSettings('general')
          },
          { type: 'divider' },
          {
            label: 'Sign Out',
            icon: icons.logOut('', 14),
            danger: true,
            onClick: () => {
              store.logout();
              if (onSignOut) onSignOut();
            }
          }
        ]
      });
    });

    footerEl.querySelector('#btn-sidebar-settings')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onOpenSettings) onOpenSettings('general');
    });
  }

  // 6. Render Sessions
  function renderSessions() {
    const currentState = store.getState();
    const query = (currentState.sidebar.searchQuery || '').toLowerCase().trim();
    const activeId = currentState.activeChatId;

    const filtered = currentState.chats.filter((c) => {
      if (!query) return true;
      return (c.title || '').toLowerCase().includes(query);
    });

    sessionsContainer.innerHTML = '';

    if (filtered.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'session-empty-hint';
      emptyEl.style.cssText = 'padding: 8px 12px; font-size: 11px; color: var(--text-tertiary); font-style: italic;';
      emptyEl.textContent = query ? 'No matching sessions' : 'No past sessions yet';
      sessionsContainer.appendChild(emptyEl);
      return;
    }

    filtered.forEach((chat) => {
      const itemEl = document.createElement('div');
      itemEl.className = `session-item ${chat.id === activeId ? 'active' : ''}`;
      itemEl.setAttribute('data-chat-id', chat.id);
      itemEl.title = chat.title;

      const timeTag = chat.timestamp || 'Just now';

      itemEl.innerHTML = `
        <span class="session-item-title">${escapeHtml(chat.title)}</span>
        <span class="session-item-time">${timeTag}</span>
        <button class="session-item-menu-btn" title="Session options" aria-label="Session options">
          ${icons.moreHorizontal('', 13)}
        </button>
      `;

      // Select chat
      itemEl.addEventListener('click', (e) => {
        if (e.target.closest('.session-item-menu-btn')) return;
        store.selectChat(chat.id);
      });

      // Menu
      const menuBtn = itemEl.querySelector('.session-item-menu-btn');
      menuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        itemEl.classList.add('menu-open');

        openDropdown({
          triggerEl: menuBtn,
          position: 'bottom-end',
          items: [
            {
              label: 'Rename',
              icon: icons.edit3('', 14),
              onClick: () => {
                itemEl.classList.remove('menu-open');
                promptRename(chat);
              }
            },
            {
              label: chat.pinned ? 'Unpin' : 'Pin session',
              icon: icons.pin('', 14),
              onClick: () => {
                itemEl.classList.remove('menu-open');
                store.togglePinChat(chat.id);
              }
            },
            { type: 'divider' },
            {
              label: 'Delete session',
              icon: icons.trash2('', 14),
              danger: true,
              onClick: async () => {
                itemEl.classList.remove('menu-open');
                store.deleteChat(chat.id);
                try {
                  await callRpc('workspace', 'archiveSession', { request: { sessionId: chat.id } });
                } catch (e) {
                  console.warn('Archive session error:', e);
                }
              }
            }
          ]
        });
      });

      sessionsContainer.appendChild(itemEl);
    });
  }

  async function promptRename(chat) {
    const newTitle = prompt('Enter new session title:', chat.title);
    if (newTitle && newTitle.trim()) {
      store.updateChatTitle(chat.id, newTitle.trim());
      await renameSession(chat.id, newTitle.trim()).catch(() => {});
    }
  }

  // 7. Load Real Backend Data
  async function loadBackendData() {
    try {
      // Workspaces
      const workspaces = await listWorkspaces();
      if (workspaces && workspaces.length > 0) {
        const activeWs = workspaces[0];
        const titleEl = defaultFolderHeader.querySelector('#sidebar-active-ws-title');
        const wsTitle = activeWs.name || activeWs.title || 'Default Workspace';
        if (titleEl) titleEl.textContent = wsTitle;

        otherFoldersEl.innerHTML = '';
        workspaces.slice(1).forEach((ws) => {
          const folderEl = document.createElement('div');
          folderEl.className = 'workspace-folder collapsed';
          const otherTitle = ws.name || ws.title || 'Workspace';
          folderEl.innerHTML = `
            <div class="folder-header">
              <span class="folder-icon">${icons.folder('', 14)}</span>
              <span class="folder-title">${escapeHtml(otherTitle)}</span>
            </div>
          `;
          folderEl.addEventListener('click', () => {
            showToast(`Switched workspace to: ${otherTitle}`, 'info');
          });
          otherFoldersEl.appendChild(folderEl);
        });
      }

      // Sessions
      const sessions = await listSessions();
      if (sessions && Array.isArray(sessions)) {
        const existingChats = store.getState().chats;
        const merged = [...sessions];
        for (const local of existingChats) {
          if (!merged.some(s => s.id === local.id)) {
            const msgs = store.getState().messages[local.id] || [];
            if (msgs.length > 0) {
              merged.unshift(local);
            }
          }
        }
        store.setChats(merged);

        // Auto-title any historical session that still has a generic name
        for (const s of merged) {
          if (s.title === 'Conversation' || s.title === 'Untitled Session' || s.title === 'New conversation') {
            loadSessionHistory(s.id).then((history) => {
              if (history && history.length > 0) {
                store.setSessionMessages(s.id, history);
                const firstUser = history.find(m => m.role === 'user');
                if (firstUser && firstUser.text) {
                  const clean = firstUser.text.trim().replace(/\s+/g, ' ');
                  const formatted = clean.length > 28 ? clean.slice(0, 25) + '...' : clean;
                  store.updateChatTitle(s.id, formatted);
                  saveSessionTitle(s.id, formatted);
                  renameSession(s.id, formatted).catch(() => {});
                }
              }
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('Sidebar backend sync error:', err);
    }
  }

  // Assemble Sidebar DOM
  sidebarEl.appendChild(headerEl);
  sidebarEl.appendChild(actionsEl);
  sidebarEl.appendChild(quickNavEl);
  sidebarEl.appendChild(workspaceSection);
  sidebarEl.appendChild(footerEl);

  // Event Listeners
  headerEl.querySelector('#sidebar-toggle-btn')?.addEventListener('click', () => {
    store.toggleSidebar();
  });

  headerEl.querySelector('#sidebar-brand-home')?.addEventListener('click', () => {
    store.clearActiveChat();
  });

  actionsEl.querySelector('#btn-sidebar-new-session')?.addEventListener('click', () => {
    store.clearActiveChat();
    const inputEl = document.getElementById('chat-hero-textarea');
    inputEl?.focus();
  });

  searchBox.querySelector('#workspace-search-input')?.addEventListener('input', (e) => {
    store.setSidebarSearch(e.target.value);
  });

  wsHeader.querySelector('#ws-btn-new-folder')?.addEventListener('click', async () => {
    try {
      const created = await pickAndCreateWorkspace();
      if (created) {
        showToast(`Added workspace: ${created.title}`, 'success');
        await loadBackendData();
      }
    } catch (err) {
      showToast(`Error adding workspace: ${err.message}`, 'error');
    }
  });

  wsHeader.querySelector('#ws-btn-refresh')?.addEventListener('click', async () => {
    showToast('Refreshing workspaces and sessions...', 'info');
    await loadBackendData();
  });

  // Store Subscriptions
  store.subscribe('sidebar:toggle', (isOpen) => {
    if (isOpen) {
      sidebarEl.classList.remove('collapsed');
    } else {
      sidebarEl.classList.add('collapsed');
    }
  });

  store.subscribe('sidebar:search', () => {
    renderSessions();
  });

  store.subscribe('chats:change', () => {
    renderSessions();
  });

  store.subscribe('chat:active', () => {
    renderSessions();
  });

  store.subscribe('user:change', () => {
    renderUserFooter();
  });

  // Initial renders
  renderUserFooter();
  renderSessions();
  loadBackendData();

  // Reload backend workspaces & sessions once daemon becomes ready
  apiClient.onStatusChange((info) => {
    if (info && info.status === 'ready') {
      loadBackendData();
    }
  });

  return sidebarEl;
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
