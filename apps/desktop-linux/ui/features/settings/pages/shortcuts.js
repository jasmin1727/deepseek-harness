/**
 * Settings Page — Keyboard Shortcuts
 */

export function renderShortcutsPage() {
  const container = document.createElement('div');
  container.className = 'settings-pane-scroll';

  const shortcuts = [
    { action: 'New Chat Conversation', keys: ['Ctrl', 'N'], scope: 'Global' },
    { action: 'Toggle Sidebar Collapse', keys: ['Ctrl', 'B'], scope: 'Global' },
    { action: 'Open Preferences / Settings', keys: ['Ctrl', ','], scope: 'Global' },
    { action: 'Focus Chat Input Box', keys: ['Ctrl', '/'], scope: 'Global' },
    { action: 'Attach File or Image', keys: ['Ctrl', 'U'], scope: 'Chat' },
    { action: 'Send Message Prompt', keys: ['Enter'], scope: 'Chat' },
    { action: 'Insert Newline in Prompt', keys: ['Shift', 'Enter'], scope: 'Chat' },
    { action: 'Close Modal or Context Menu', keys: ['Esc'], scope: 'Global' },
    { action: 'Toggle Deep Reason (Think)', keys: ['Ctrl', 'T'], scope: 'Chat' }
  ];

  container.innerHTML = `
    <div class="settings-section-card">
      <h3 class="settings-card-title">Keyboard Shortcuts</h3>
      <p class="settings-card-desc">Accelerators designed for rapid keyboard-first navigation on Linux.</p>

      <table class="data-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Scope</th>
            <th style="text-align: right;">Shortcut</th>
          </tr>
        </thead>
        <tbody>
          ${shortcuts.map((s) => `
            <tr>
              <td style="color: var(--text-primary); font-weight: 500;">${s.action}</td>
              <td><span class="badge badge-neutral">${s.scope}</span></td>
              <td style="text-align: right;">
                ${s.keys.map((k) => `<kbd class="shortcut-kbd">${k}</kbd>`).join(' + ')}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  return container;
}
