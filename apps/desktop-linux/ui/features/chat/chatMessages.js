/**
 * DeepSeek Harness — Chat Messages Renderer
 * High-fidelity messages with agent tool-calls and terminal output
 */

import { icons } from '../../components/ui/icons.js';
import { showToast } from '../../components/ui/toast.js';

export function createMessagesList({ messages = [], onRegenerate }) {
  const container = document.createElement('div');
  container.className = 'messages-list';

  messages.forEach((msg) => {
    try {
      const el = renderMessageItem(msg, onRegenerate);
      if (el) container.appendChild(el);
    } catch (err) {
      console.error('Failed to render message item:', msg, err);
      // Fallback message wrapper so transcript never breaks
      const fallbackWrap = document.createElement('div');
      fallbackWrap.className = msg.role === 'user' ? 'message-user' : 'message-assistant';
      fallbackWrap.innerHTML = `
        <div class="${msg.role === 'user' ? 'user-bubble' : 'assistant-prose'}">
          ${escapeHtml(msg.text || msg.thinking || 'Message rendered with partial content')}
        </div>
      `;
      container.appendChild(fallbackWrap);
    }
  });

  return container;
}

export function renderMessageItem(msg, onRegenerate) {
  if (msg.role === 'user') {
    const userWrap = document.createElement('div');
    userWrap.className = 'message-user';
    userWrap.dataset.msgId = msg.id;
    userWrap.innerHTML = `
      <div class="user-bubble">${escapeHtml(msg.text)}</div>
      <div class="message-meta">
        <span>${msg.timestamp || 'Just now'}</span>
      </div>
    `;
    return userWrap;
  }

  // Assistant Message
  const asstWrap = document.createElement('div');
  asstWrap.className = 'message-assistant';
  asstWrap.dataset.msgId = msg.id;

  // Header: Logo, Model, Timestamp
  const header = document.createElement('div');
  header.className = 'assistant-header';
  header.innerHTML = `
    <div class="assistant-identity">
      <span class="assistant-logo">${icons.whaleMark('', 18)}</span>
      <span class="assistant-name">DeepSeek</span>
      <span class="assistant-model-tag">${escapeHtml(msg.model || 'DeepSeek-V3')}</span>
      ${msg.wasCancelled ? '<span class="status-pill-cancelled" style="font-size: 11px; padding: 2px 7px; border-radius: 999px; background: rgba(239,68,68,0.15); color: #f87171; font-weight: 500;">Cancelled</span>' : ''}
    </div>
    <div class="message-meta">
      <span>${msg.timestamp || 'Just now'}</span>
    </div>
  `;
  asstWrap.appendChild(header);

  // Error Card if generation or stream failed
  if (msg.error) {
    const errCard = document.createElement('div');
    errCard.className = 'assistant-error-card';
    errCard.innerHTML = `
      <div class="error-card-header">
        <span class="error-card-icon">${icons.alertTriangle('', 15)}</span>
        <span class="error-card-title">${escapeHtml(msg.error.code || 'Generation Error')}</span>
      </div>
      <div class="error-card-body">${escapeHtml(msg.error.message || 'The model did not return a response.')}</div>
      ${msg.error.retry ? `
        <div class="error-card-actions">
          <button class="btn-error-retry" type="button">
            ${icons.refreshCw('', 12)}
            <span>Retry</span>
          </button>
        </div>
      ` : ''}
    `;
    if (msg.error.retry) {
      errCard.querySelector('.btn-error-retry')?.addEventListener('click', () => {
        msg.error.retry();
      });
    }
    asstWrap.appendChild(errCard);
  }

  // Live Thinking / Loading Indicator when stream is active but no text yet
  if (msg.isStreaming && !msg.text && !msg.thinking && !msg.toolCall && !msg.error) {
    const loaderEl = document.createElement('div');
    loaderEl.className = 'assistant-thinking-indicator';
    loaderEl.innerHTML = `
      <span class="thinking-status thinking-cycling-text">Thinking...</span>
    `;
    asstWrap.appendChild(loaderEl);

    // Active dots animation: Thinking. -> Thinking.. -> Thinking...
    let dotStep = 1;
    const cycleTimer = setInterval(() => {
      if (!loaderEl.isConnected) {
        clearInterval(cycleTimer);
        return;
      }
      dotStep = (dotStep % 3) + 1;
      const statusEl = loaderEl.querySelector('.thinking-cycling-text');
      if (statusEl) {
        statusEl.textContent = `Thinking${'.'.repeat(dotStep)}`;
      }
    }, 400);
  }

  // Optional Thinking block
  if (msg.thinking) {
    const thinkEl = document.createElement('div');
    thinkEl.className = 'thinking-block';
    const isThinkingLive = msg.isStreaming && !msg.text;
    thinkEl.innerHTML = `
      <div class="thinking-header" style="cursor: pointer; user-select: none;">
        ${icons.sparkles('', 12)}
        <span class="${isThinkingLive ? 'thinking-cycling-text' : ''}">${isThinkingLive ? 'Thinking...' : 'Reasoning Chain'}</span>
        <span class="thinking-chevron" style="margin-left: auto;">${icons.chevronDown('', 11)}</span>
      </div>
      <div class="thinking-content">${escapeHtml(msg.thinking)}</div>
    `;

    if (isThinkingLive) {
      let thinkDotStep = 1;
      const thinkTimer = setInterval(() => {
        if (!thinkEl.isConnected) {
          clearInterval(thinkTimer);
          return;
        }
        thinkDotStep = (thinkDotStep % 3) + 1;
        const liveStatusEl = thinkEl.querySelector('.thinking-cycling-text');
        if (liveStatusEl) {
          liveStatusEl.textContent = `Thinking${'.'.repeat(thinkDotStep)}`;
        }
      }, 400);
    }
    const header = thinkEl.querySelector('.thinking-header');
    const content = thinkEl.querySelector('.thinking-content');
    const chevron = thinkEl.querySelector('.thinking-chevron');
    header.addEventListener('click', () => {
      const isHidden = content.style.display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      chevron.innerHTML = isHidden ? icons.chevronDown('', 11) : icons.chevronRight('', 11);
    });
    asstWrap.appendChild(thinkEl);
  }

  // Prose
  if (msg.text) {
    const proseEl = document.createElement('div');
    proseEl.className = 'assistant-prose';
    proseEl.innerHTML = formatMarkdown(msg.text) + (msg.isStreaming ? '<span class="streaming-cursor">▋</span>' : '');
    asstWrap.appendChild(proseEl);
  }

  // Agent Tool Call Block (Terminal Output) or User Question Card
  if (msg.toolCall) {
    const tc = msg.toolCall;
    let renderedAsQuestion = false;

    // Check if this tool call is ask_user_question
    if (tc.toolName === 'ask_user_question' && !msg.userQuestion) {
      try {
        const rawArgs = typeof tc.command === 'string' ? JSON.parse(tc.command) : tc.command;
        const qList = rawArgs?.questions || rawArgs?.items;
        if (Array.isArray(qList) && qList.length > 0) {
          const firstQ = qList[0];
          const questionCard = createUserQuestionCard({
            header: firstQ.header,
            question: firstQ.question,
            options: firstQ.options,
            onAnswer: (chosen) => {
              if (window.__dsh_answer_question) {
                window.__dsh_answer_question(chosen);
              }
            }
          });
          asstWrap.appendChild(questionCard);
          renderedAsQuestion = true;
        }
      } catch (e) {
        console.warn('Could not parse ask_user_question command for visual card:', e);
      }
    }

    if (!renderedAsQuestion) {
      const isRunning = tc.duration === 'running...';
      const isError = tc.isError || (typeof tc.output === 'string' && tc.output.includes('Error:'));
      const toolEl = document.createElement('div');
      toolEl.className = 'tool-call-block';
      toolEl.innerHTML = `
        <div class="tool-call-header">
          <div class="tool-call-title">
            ${icons.terminal('', 14)}
            <span>${tc.toolName || 'bash'}</span>
          </div>
          <div class="tool-status-badge ${isRunning ? 'is-running' : isError ? 'is-error' : 'is-success'}">
            <span class="tool-status-dot"></span>
            <span>${isRunning ? 'Running in sandbox...' : (tc.duration || '0.4s')}</span>
          </div>
        </div>
        <div class="tool-call-cmd">
          <span class="tool-call-cmd-prompt">$</span>
          <span>${escapeHtml(tc.command)}</span>
        </div>
        ${tc.output ? `<pre class="tool-call-terminal"><code>${escapeHtml(tc.output)}</code></pre>` : ''}
      `;
      asstWrap.appendChild(toolEl);
    }
  }

  // Interactive Approval Prompt Card
  if (msg.approvalRequest) {
    const appr = msg.approvalRequest;
    const card = document.createElement('div');
    card.className = 'approval-prompt-card';
    card.style.cssText = 'border: 1px solid var(--border-color, #333); border-radius: 12px; padding: 12px 14px; margin: 10px 0; background: var(--bg-surface-secondary, rgba(255,255,255,0.03));';

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-weight: 500; font-size: 13px;">
        <span style="color: #e5a93c;">${icons.shield('', 14)}</span>
        <span>Security Permission Approval</span>
      </div>
      <div style="font-size: 13px; color: var(--text-muted, #aaa); margin-bottom: 8px;">
        ${escapeHtml(appr.reason || `Agent wants to execute ${appr.toolName || 'command'}`)}
      </div>
      ${appr.command ? `<pre style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; font-family: monospace; font-size: 12px; margin-bottom: 10px;"><code>${escapeHtml(appr.command)}</code></pre>` : ''}
      <div class="approval-actions" style="display: flex; gap: 8px;">
        ${appr.status === 'pending' ? `
          <button class="btn-allow-once" style="background: #3b82f6; color: white; border: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">Allow Once</button>
          <button class="btn-deny" style="background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">Deny</button>
        ` : `
          <span style="font-size: 12px; color: ${appr.status === 'allowed' ? '#10b981' : '#ef4444'}; font-weight: 500;">
            ${appr.status === 'allowed' ? '✓ Allowed Once' : '✕ Denied'}
          </span>
        `}
      </div>
    `;

    if (appr.status === 'pending') {
      const allowBtn = card.querySelector('.btn-allow-once');
      const denyBtn = card.querySelector('.btn-deny');
      allowBtn?.addEventListener('click', () => {
        appr.status = 'allowed';
        if (appr.onAllow) appr.onAllow();
        card.querySelector('.approval-actions').innerHTML = `<span style="font-size: 12px; color: #10b981; font-weight: 500;">✓ Allowed Once</span>`;
      });
      denyBtn?.addEventListener('click', () => {
        appr.status = 'rejected';
        if (appr.onDeny) appr.onDeny();
        card.querySelector('.approval-actions').innerHTML = `<span style="font-size: 12px; color: #ef4444; font-weight: 500;">✕ Denied</span>`;
      });
    }

    asstWrap.appendChild(card);
  }

  // Interactive User Question Card
  if (msg.userQuestion) {
    const card = createUserQuestionCard(msg.userQuestion);
    asstWrap.appendChild(card);
  }

  // Conclusion / followup text
  if (msg.conclusion) {
    const conclEl = document.createElement('div');
    conclEl.className = 'assistant-prose';
    conclEl.innerHTML = formatMarkdown(msg.conclusion);
    asstWrap.appendChild(conclEl);
  }

  // Action Bar: Copy & Regenerate
  const actionsBar = document.createElement('div');
  actionsBar.className = 'message-actions-bar';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-icon';
  copyBtn.title = 'Copy response text';
  copyBtn.setAttribute('aria-label', 'Copy response text');
  copyBtn.innerHTML = icons.copy('', 14);
  copyBtn.addEventListener('click', () => {
    const fullText = [msg.text, msg.toolCall ? `$ ${msg.toolCall.command}\n${msg.toolCall.output}` : '', msg.conclusion].filter(Boolean).join('\n\n');
    navigator.clipboard?.writeText(fullText).then(() => {
      showToast('Response copied to clipboard', 'success');
    }).catch(() => {
      showToast('Copied', 'info');
    });
  });

  const regenBtn = document.createElement('button');
  regenBtn.className = 'btn-icon';
  regenBtn.title = 'Regenerate response (mock)';
  regenBtn.setAttribute('aria-label', 'Regenerate response');
  regenBtn.innerHTML = icons.refreshCw('', 14);
  regenBtn.addEventListener('click', () => {
    if (onRegenerate) {
      onRegenerate(msg);
    }
  });

  actionsBar.appendChild(copyBtn);
  actionsBar.appendChild(regenBtn);
  asstWrap.appendChild(actionsBar);

  return asstWrap;
}

export function createUserQuestionCard(q) {
  const card = document.createElement('div');
  card.className = 'user-question-card';
  card.style.cssText = 'border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 12px; padding: 14px 16px; margin: 12px 0; background: var(--bg-surface-secondary, rgba(59, 130, 246, 0.04)); backdrop-filter: blur(8px);';

  const headingText = q.header || 'Question from DeepSeek Agent';
  const questionBody = q.question || 'Please select an option to continue:';

  card.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-weight: 600; font-size: 13px;">
      <span style="color: #3b82f6;">${icons.sparkles('', 14)}</span>
      <span style="color: var(--text-primary, #fff);">${escapeHtml(headingText)}</span>
    </div>
    <div style="font-size: 13.5px; color: var(--text-primary, #fff); margin-bottom: 12px; line-height: 1.45;">${escapeHtml(questionBody)}</div>
    <div class="question-options" style="display: flex; flex-direction: column; gap: 8px;">
      ${(q.options || []).map((opt, i) => {
        const label = typeof opt === 'object' ? (opt.label || opt.text || opt.title || JSON.stringify(opt)) : String(opt);
        const desc = typeof opt === 'object' ? (opt.description || opt.desc || '') : '';
        const isRec = label.includes('(Recommended)');
        return `
          <button class="btn-question-opt ${isRec ? 'is-recommended' : ''}" data-idx="${i}" data-opt="${escapeHtml(label)}" type="button" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color, rgba(255,255,255,0.12)); color: var(--text-primary, #fff); padding: 10px 14px; border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 0.15s ease; width: 100%;">
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 8px;">
              <span style="font-weight: 600; color: ${isRec ? '#60a5fa' : 'inherit'};">${escapeHtml(label)}</span>
              ${isRec ? '<span style="font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase;">Recommended</span>' : ''}
            </div>
            ${desc ? `<div style="font-size: 12px; color: var(--text-secondary, #9ca3af); margin-top: 4px; font-weight: 400; line-height: 1.4;">${escapeHtml(desc)}</div>` : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;

  card.querySelectorAll('.btn-question-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const selected = btn.dataset.opt;
      if (q.onAnswer) q.onAnswer(selected);
      card.querySelector('.question-options').innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 8px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); color: #10b981; font-size: 13px; font-weight: 500;">
          <span>✓</span>
          <span>Selected: <strong>${escapeHtml(selected)}</strong></span>
        </div>
      `;
    });
  });

  return card;
}

function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val.label) return escapeHtml(val.label);
    if (val.text) return escapeHtml(val.text);
    if (val.title) return escapeHtml(val.title);
    return escapeHtml(JSON.stringify(val));
  }
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMarkdown(text) {
  if (!text) return '';
  let formatted = escapeHtml(text);
  // Fenced code blocks
  formatted = formatted.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre class="code-block" data-lang="${lang}" style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; margin: 8px 0; overflow-x: auto;"><code>${code}</code></pre>`;
  });
  // Inline code: `code`
  formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 2px 5px; border-radius: 4px; font-size: 0.9em;">$1</code>');
  // Bold: **text**
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Paragraphs / line breaks outside <pre>
  const parts = formatted.split(/(<pre[\s\S]*?<\/pre>)/g);
  return parts.map(part => {
    if (part.startsWith('<pre')) return part;
    return part.replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>');
  }).join('');
}
