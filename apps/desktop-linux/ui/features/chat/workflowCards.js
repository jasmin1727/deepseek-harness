/**
 * DeepSeek Harness — Workflow Suggestion Cards
 * Pre-canned developer execution recipes that populate the chat input.
 */

import { icons } from '../../components/ui/icons.js';

export function createWorkflowCards({ onSelect }) {
  const container = document.createElement('div');
  container.className = 'workflow-suggestions';

  const cardsData = [
    {
      title: 'Inspect Repository',
      desc: 'Scan workspace tree and verify dependency health',
      icon: icons.terminal('', 14),
      prompt: 'Inspect repository architecture, verify Cargo dependencies, and check build configs.'
    },
    {
      title: 'Run Test Suite',
      desc: 'Execute verification suites and catch regressions',
      icon: icons.cpu('', 14),
      prompt: 'Execute verification test suite across packages and generate an execution report.'
    },
    {
      title: 'Sidecar Diagnostics',
      desc: 'Inspect JSON-RPC status on localhost:3000',
      icon: icons.zap('', 14),
      prompt: 'Probe sidecar daemon socket on localhost:3000 and verify IPC latency.'
    }
  ];

  cardsData.forEach((card) => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-card';
    btn.type = 'button';
    btn.innerHTML = `
      <div class="suggestion-title">
        <span>${card.icon}</span>
        <span>${card.title}</span>
      </div>
      <div class="suggestion-desc">${card.desc}</div>
    `;

    btn.addEventListener('click', () => {
      if (onSelect) {
        onSelect(card.prompt);
      }
    });

    container.appendChild(btn);
  });

  return container;
}
