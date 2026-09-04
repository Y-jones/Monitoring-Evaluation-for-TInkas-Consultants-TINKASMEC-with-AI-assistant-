(function () {
  // ---- CONFIGURE THIS ----
  // Point this at your deployed backend's /api/chat endpoint.
  // See server/README.md for how to deploy the backend.
  var CHAT_API_URL = 'https://tinkas-web.onrender.com/api/chat';
  // -------------------------

  var GREETING = "Hi! I'm the TinkasMec assistant. Ask me about M&E concepts and best practices, our M&E and Data & AI services, or how to reach the team.";

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Renders a small, safe subset of markdown for bot replies: headings,
  // bold/italic/code/links, flat bullet lists, and markdown tables. The
  // system prompt tells the model not to use tables, but models slip
  // sometimes — when they do, each row is turned into a bold label plus a
  // short list of "Column: value" bullets (using the header row for column
  // names) instead of one unreadable run-on paragraph. Literal <br> tags
  // inside table cells are treated as line breaks within that cell, not
  // shown as text.
  function fmtInline(str) {
    var e = escapeHtml(str);
    e = e.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    e = e.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    e = e.replace(/`([^`]+)`/g, '<code>$1</code>');
    e = e.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return e;
  }

  // Splits one table cell's raw text on <br> tags (or literal "•" runs) into
  // its separate fragments, stripping any leading bullet marker from each.
  function splitCellFragments(cell) {
    return cell
      .split(/<br\s*\/?>/gi)
      .map(function (f) { return f.replace(/^[\s•\-*]+/, '').trim(); })
      .filter(Boolean);
  }

  function renderMarkdown(text) {
    var lines = String(text).split(/\r?\n/);
    var html = '';
    var inList = false;
    var tableHeaders = null; // column labels for the table block currently being read

    function closeList() { if (inList) { html += '</ul>'; inList = false; } }
    function openList() { if (!inList) { html += '<ul>'; inList = true; } }

    lines.forEach(function (raw) {
      var line = raw.trim();

      // Markdown table separator row, e.g. |---|---| — ignore, stay in table mode.
      if (tableHeaders !== null && /^\|?[\s:\-]+\|?[\s:\-|]*$/.test(line) && line.indexOf('-') !== -1) {
        return;
      }
      if (/^\|?[\s:\-]+\|[\s:\-|]*$/.test(line) && line.indexOf('-') !== -1) {
        return;
      }

      if (line.indexOf('|') !== -1) {
        var cells = line.split('|').map(function (c) { return c.trim(); }).filter(function (c) { return c !== ''; });
        if (cells.length >= 2) {
          if (tableHeaders === null) {
            // First row of a new table block becomes the column labels; not shown itself.
            tableHeaders = cells;
            return;
          }
          closeList();
          html += '<p><strong>' + fmtInline(splitCellFragments(cells[0])[0] || cells[0]) + '</strong></p>';
          openList();
          for (var i = 1; i < cells.length && i < tableHeaders.length; i++) {
            var colLabel = fmtInline(tableHeaders[i]);
            var fragments = splitCellFragments(cells[i]);
            var value = fragments.length ? fragments.map(fmtInline).join('; ') : fmtInline(cells[i]);
            html += '<li>' + (colLabel ? '<strong>' + colLabel + ':</strong> ' : '') + value + '</li>';
          }
          closeList();
          return;
        }
      }

      // Not a table row: close out any table block we were reading.
      tableHeaders = null;

      if (line === '') return;

      var heading = line.match(/^#{1,6}\s*(.*)/);
      if (heading) {
        closeList();
        html += '<p><strong>' + fmtInline(heading[1]) + '</strong></p>';
        return;
      }

      var bulletMatch = line.match(/^[-*•]\s+(.*)/);
      if (bulletMatch) {
        openList();
        html += '<li>' + fmtInline(bulletMatch[1]) + '</li>';
        return;
      }

      closeList();
      html += '<p>' + fmtInline(line) + '</p>';
    });
    closeList();
    return html;
  }
  document.addEventListener('DOMContentLoaded', function () {
    var history = []; // {role, content}
    var sending = false;

    // ---- Toggle button ----
    var toggle = el('button', { class: 'chat-toggle', 'aria-label': 'Open chat' }, [
      el('span', { class: 'ring' }),
    ]);
    toggle.innerHTML += (
      '<svg class="chat-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' +
      '<svg class="chat-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
    );

    // ---- Name label above the toggle ----
    var toggleLabel = el('div', { class: 'chat-toggle-label' }, [
      document.createTextNode('TinkasMec AI'),
      el('button', { class: 'chat-toggle-label-close', 'aria-label': 'Dismiss' , html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'}),
    ]);

    // ---- Panel ----
    var messagesEl = el('div', { class: 'chat-messages' });
    var input = el('textarea', { class: 'chat-input', rows: '1', placeholder: 'Ask a question…' });
    var sendBtn = el('button', { class: 'chat-send', 'aria-label': 'Send' , html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>'});

    var logoSrc = 'assets/logo.png';
    var panel = el('div', { class: 'chat-panel' }, [
      el('div', { class: 'chat-header' }, [
        el('img', { src: logoSrc, alt: 'TinkasMec' }),
        el('div', { class: 'titles' }, [
          el('strong', {}, [document.createTextNode('TinkasMec AI')]),
          el('span', {}, [document.createTextNode('Usually replies instantly')]),
        ]),
        el('span', { class: 'status-dot' }),
      ]),
      messagesEl,
      el('div', { class: 'chat-input-row' }, [input, sendBtn]),
      el('div', { class: 'chat-footnote' }, [document.createTextNode('AI-generated answers — please verify anything important by contacting us directly.')]),
    ]);

    document.body.appendChild(toggle);
    document.body.appendChild(toggleLabel);
    document.body.appendChild(panel);

    function addMessage(role, text) {
      var bubble = el('div', { class: 'chat-msg ' + role });
      if (role === 'bot' || role === 'error') {
        // Bot text may contain markdown-ish formatting from the model;
        // render it safely instead of showing raw ** and | characters.
        bubble.innerHTML = renderMarkdown(text);
      } else {
        bubble.appendChild(document.createTextNode(text));
      }

      if (role === 'bot' || role === 'error') {
        // Show the TinkasMec logo as an avatar next to AI messages, the way
        // a contact's photo appears next to their messages in WhatsApp.
        var avatar = el('img', { class: 'chat-avatar', src: logoSrc, alt: '' });
        var row = el('div', { class: 'chat-row' }, [avatar, bubble]);
        messagesEl.appendChild(row);
      } else {
        messagesEl.appendChild(bubble);
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return bubble;
    }

    function addTyping() {
      var avatar = el('img', { class: 'chat-avatar', src: logoSrc, alt: '' });
      var dots = el('div', { class: 'chat-typing' }, [el('span'), el('span'), el('span')]);
      var row = el('div', { class: 'chat-row' }, [avatar, dots]);
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return row;
    }

    // Greeting shown once, on first open
    var greeted = false;
    function openPanel() {
      panel.classList.add('open');
      toggle.classList.add('open');
      toggle.setAttribute('aria-label', 'Close chat');
      toggleLabel.classList.add('chat-toggle-label--hidden');
      if (!greeted) {
        addMessage('bot', GREETING);
        greeted = true;
      }
      input.focus();
    }
    function closePanel() {
      panel.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-label', 'Open chat');
      if (!toggleLabel.classList.contains('chat-toggle-label--dismissed')) {
        toggleLabel.classList.remove('chat-toggle-label--hidden');
      }
    }

    toggle.addEventListener('click', function () {
      if (panel.classList.contains('open')) closePanel();
      else openPanel();
    });

    toggleLabel.addEventListener('click', function (e) {
      if (e.target.closest('.chat-toggle-label-close')) {
        toggleLabel.classList.add('chat-toggle-label--hidden', 'chat-toggle-label--dismissed');
        return;
      }
      openPanel();
    });

    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 90) + 'px';
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    sendBtn.addEventListener('click', send);

    function send() {
      var text = input.value.trim();
      if (!text || sending) return;
      addMessage('user', text);
      history.push({ role: 'user', content: text });
      input.value = '';
      input.style.height = 'auto';
      sending = true;
      sendBtn.disabled = true;

      var typingEl = addTyping();

      fetch(CHAT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Request failed');
          return res.json();
        })
        .then(function (data) {
          typingEl.remove();
          var reply = data.reply || "Sorry, I didn't get a response — please try again.";
          addMessage('bot', reply);
          history.push({ role: 'assistant', content: reply });
        })
        .catch(function () {
          typingEl.remove();
          addMessage('error', "Couldn't reach the assistant right now. Please contact TinkasMec directly at +255 754 513 185 or tinkasconsults@gmail.com.");
        })
        .finally(function () {
          sending = false;
          sendBtn.disabled = false;
        });
    }
  });
})();