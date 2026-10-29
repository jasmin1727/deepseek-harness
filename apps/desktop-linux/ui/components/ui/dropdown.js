/**
 * DeepSeek Harness — Reusable Dropdown & Context Menu Controller
 */

let activeDropdown = null;

export function openDropdown({ triggerEl, items = [], position = 'bottom-start' }) {
  closeActiveDropdown();

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.setAttribute('role', 'menu');

  items.forEach((item) => {
    if (item.type === 'divider') {
      const div = document.createElement('div');
      div.className = 'dropdown-divider';
      menu.appendChild(div);
      return;
    }

    const btn = document.createElement('button');
    btn.className = `dropdown-item ${item.danger ? 'danger' : ''}`;
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `
      ${item.icon ? `<span class="dropdown-icon">${item.icon}</span>` : ''}
      <span class="dropdown-label">${item.label}</span>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeActiveDropdown();
      if (item.onClick) item.onClick();
    });

    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  // Position relative to trigger
  const rect = triggerEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  let top = rect.bottom + 4;
  let left = rect.left;

  if (position === 'bottom-end') {
    left = rect.right - menuRect.width;
  } else if (position === 'top-start') {
    top = rect.top - menuRect.height - 4;
    left = rect.left;
  } else if (position === 'top-end') {
    top = rect.top - menuRect.height - 4;
    left = rect.right - menuRect.width;
  }

  // Prevent overflowing window viewport
  if (left + menuRect.width > window.innerWidth - 8) {
    left = window.innerWidth - menuRect.width - 8;
  }
  if (left < 8) left = 8;
  if (top + menuRect.height > window.innerHeight - 8) {
    top = rect.top - menuRect.height - 4;
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  activeDropdown = menu;

  function onDocClick(e) {
    if (!menu.contains(e.target) && e.target !== triggerEl && !triggerEl.contains(e.target)) {
      closeActiveDropdown();
      cleanup();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      closeActiveDropdown();
      cleanup();
    }
  }

  function cleanup() {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKeyDown);
  }

  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
  }, 10);
}

export function closeActiveDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}
