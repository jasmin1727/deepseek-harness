/**
 * DeepSeek Harness — Lightweight Toast System
 */

import { icons } from './icons.js';

let container = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = 'info', duration = 2800) {
  const cont = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconHtml = icons.info('', 16);
  if (type === 'success') iconHtml = icons.check('', 16);
  if (type === 'error') iconHtml = icons.alertTriangle('', 16);

  toast.innerHTML = `
    <span class="toast-icon">${iconHtml}</span>
    <span class="toast-msg">${message}</span>
  `;

  cont.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      toast.remove();
    }, 160);
  }, duration);
}
