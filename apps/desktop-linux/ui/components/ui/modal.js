/**
 * DeepSeek Harness — Accessible Modal Controller
 */

export function createModal({ title, contentEl, onClose, maxWidth = '840px', className = '' }) {
  const backdrop = document.createElement('div');
  backdrop.className = `modal-backdrop ${className}`;
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const container = document.createElement('div');
  container.className = 'modal-container';
  container.style.maxWidth = maxWidth;

  container.appendChild(contentEl);
  backdrop.appendChild(container);
  document.body.appendChild(backdrop);

  // Trigger animation next tick
  requestAnimationFrame(() => {
    backdrop.classList.add('modal-visible');
  });

  function close() {
    backdrop.classList.remove('modal-visible');
    setTimeout(() => {
      backdrop.remove();
      if (onClose) onClose();
      document.removeEventListener('keydown', onKeyDown);
    }, 180);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
    }
  });

  document.addEventListener('keydown', onKeyDown);

  return {
    close,
    element: backdrop,
    container
  };
}
