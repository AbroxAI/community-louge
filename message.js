// message.js
// Responsible for rendering a single chat message into the UI.
// Used by SimulationEngine, MessagePool.streamToUI, and manual inserts.

(function globalMessageRenderer(){
  if (window.renderMessage) return;

  /* ---------- helpers ---------- */
  function escapeHTML(str){
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(ts){
    try{
      const d = new Date(Number(ts) || Date.now());
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }catch{
      return '';
    }
  }

  function smallSnippet(text, max = 120){
    if (!text) return '';
    const s = String(text);
    return s.length <= max ? s : (s.slice(0, max-1) + '…');
  }

  // tiny inline eye SVG used for seen-by indicator (keeps file self-contained)
  function eyeIconSVG(){
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></circle>
    </svg>`;
  }

  /* ---------- main render function ---------- */
  function renderMessage(message, autoScroll = true){
    if (!message) return;

    const chat = document.getElementById('chat');
    if (!chat) return;

    try {
      // normalize fields (backwards compat)
      const id = message.id || message.msgId || ('msg_' + Date.now());
      const out = !!message.out || !!message.isOwn || false;
      const displayName = message.displayName || message.name || 'Unknown';
      const role = (message.role || '').toUpperCase() || (message.isAdmin ? 'ADMIN' : (message.isMod ? 'MOD' : (message.role || 'VERIFIED')));
      const avatar = message.avatar || message.photo || '';
      const ts = message.time || message.timestamp || message.date || Date.now();
      const textRaw = message.text == null ? '' : String(message.text);
      const replyTo = message.replyTo || null;
      const pinned = !!message.pinned;
      const attachment = message.attachment || null;
      const seenBy = Array.isArray(message.seenBy) ? message.seenBy : (message.seen ? (Array.isArray(message.seen) ? message.seen : [message.seen]) : []);

      // date pill when day changes (sticky visual)
      const d = new Date(Number(ts) || Date.now());
      const day = d.toDateString();
      if (chat._lastDate !== day) {
        const pill = document.createElement('div');
        pill.className = 'date-pill';
        pill.textContent = (day === (new Date()).toDateString() ? 'Today' : day);
        chat.appendChild(pill);
        chat._lastDate = day;
      }

      // message container
      const el = document.createElement('div');
      el.className = 'msg ' + (out ? 'out' : 'in');
      el.dataset.id = id;

      // avatar (only for incoming messages)
      if (!out) {
        const imgWrap = document.createElement('div');
        imgWrap.className = 'avatar-wrap';
        const img = document.createElement('img');
        img.className = 'avatar';
        img.alt = displayName;
        img.loading = 'lazy';
        img.width = 42; img.height = 42;
        img.src = avatar || 'assets/default-avatar.png';
        imgWrap.appendChild(img);
        el.appendChild(imgWrap);
      } else {
        // keep layout consistent: spacer
        const spacer = document.createElement('div');
        spacer.style.width = '42px';
        spacer.style.height = '42px';
        spacer.style.flex = '0 0 42px';
        el.appendChild(spacer);
      }

      // bubble
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.setAttribute('role', 'article');

      // sender row (for incoming messages show name + role badge)
      if (!out) {
        const sender = document.createElement('div');
        sender.className = 'sender';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'sender-name';
        nameSpan.textContent = displayName;
        sender.appendChild(nameSpan);

        // role badge: only display ADMIN / MOD as prominent pills; for others show verified icon
        if (role === 'ADMIN' || role === 'MOD') {
          const pill = document.createElement('span');
          pill.className = 'role-pill ' + (role === 'ADMIN' ? 'admin' : 'mod');
          pill.textContent = role;
          sender.appendChild(pill);
        } else {
          const verified = document.createElement('span');
          verified.className = 'verified-bubble';
          verified.title = 'Verified';
          // small checkmark glyph (keeps it self-contained)
          verified.innerHTML = '&#10003;'; // checkmark
          sender.appendChild(verified);
        }
        bubble.appendChild(sender);
      }

      // reply preview inside the bubble if present
      if (replyTo) {
        const replyPreview = document.createElement('div');
        replyPreview.className = 'reply-preview';
        // try to locate referenced message content if present in DOM
        const ref = document.querySelector(`[data-id="${replyTo}"]`);
        let refSender = 'Message';
        let refSnippet = '';
        if (ref) {
          const senderNode = ref.querySelector('.sender-name') || ref.querySelector('.sender');
          if (senderNode) refSender = senderNode.textContent.trim();
          const contentNode = ref.querySelector('.content') || ref.querySelector('.message-text');
          if (contentNode) refSnippet = smallSnippet(contentNode.textContent || '', 120);
        } else {
          // fallback to whatever the message object provided
          if (typeof replyTo === 'object' && replyTo.displayName) refSender = replyTo.displayName;
          if (typeof replyTo === 'string') refSnippet = ''; // unknown
        }
        replyPreview.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:700">${escapeHTML(refSender)}</div><div class="close-btn" title="Cancel" style="cursor:pointer;font-size:12px;color:var(--muted)">✕</div></div><div class="snippet">${escapeHTML(refSnippet)}</div>`;
        // wire close to remove reply preview (UI glue expects setReplyTo to manage state; this is a visual convenience)
        replyPreview.querySelector('.close-btn')?.addEventListener('click', () => {
          replyPreview.remove();
          // if global reply preview container exists, clear it (keeps compatibility)
          const rpc = document.getElementById('replyPreviewContainer');
          if (rpc) rpc.innerHTML = '';
        });
        bubble.appendChild(replyPreview);
      }

      // content
      const content = document.createElement('div');
      content.className = 'content';
      // safe text insertion (preserve line breaks)
      const safeText = escapeHTML(textRaw).replace(/\n/g, '<br>');
      content.innerHTML = safeText;
      bubble.appendChild(content);

      // attachments (images, otherwise show filename)
      if (attachment) {
        const aWrap = document.createElement('div');
        aWrap.className = 'attachment';
        if (attachment.url && /\.(png|jpe?g|gif|webp)$/i.test(attachment.filename || attachment.url || '')) {
          const aImg = document.createElement('img');
          aImg.className = 'attachment-img';
          aImg.src = attachment.url;
          aImg.alt = attachment.filename || 'attachment';
          aImg.loading = 'lazy';
          aImg.style.maxWidth = '220px';
          aImg.style.display = 'block';
          aWrap.appendChild(aImg);
        } else {
          const link = document.createElement('div');
          link.className = 'attachment-file';
          link.textContent = attachment.filename || 'Attachment';
          aWrap.appendChild(link);
        }
        bubble.appendChild(aWrap);
      }

      // time + seen-by row
      const timeRow = document.createElement('div');
      timeRow.className = 'time';
      timeRow.innerHTML = `<span class="time-text">${formatTime(ts)}</span>`;

      // seen-by small indicator (if provided)
      if (seenBy && seenBy.length) {
        const seenWrap = document.createElement('button');
        seenWrap.type = 'button';
        seenWrap.className = 'seen-by';
        seenWrap.title = 'Seen by ' + seenBy.length + ' member(s)';
        seenWrap.style.border = 'none';
        seenWrap.style.background = 'transparent';
        seenWrap.style.padding = '0 6px';
        seenWrap.style.cursor = 'pointer';
        seenWrap.style.display = 'inline-flex';
        seenWrap.style.alignItems = 'center';
        seenWrap.style.gap = '6px';
        seenWrap.innerHTML = eyeIconSVG() + `<span style="font-size:11px;opacity:.8">${seenBy.length}</span>`;

        // on click show simple tooltip listing first 10 names (native alert fallback)
        seenWrap.addEventListener('click', (ev) => {
          ev.stopPropagation();
          try {
            // small floating panel
            const existing = document.getElementById('seenByPopup');
            if (existing) { existing.remove(); return; }
            const popup = document.createElement('div');
            popup.id = 'seenByPopup';
            popup.style.position = 'fixed';
            popup.style.zIndex = 99999;
            popup.style.left = Math.min(window.innerWidth - 260, Math.max(8, ev.clientX - 130)) + 'px';
            popup.style.top = Math.min(window.innerHeight - 200, Math.max(8, ev.clientY + 6)) + 'px';
            popup.style.background = '#0b1020';
            popup.style.color = '#fff';
            popup.style.border = '1px solid #343a4a';
            popup.style.padding = '8px';
            popup.style.borderRadius = '8px';
            popup.style.maxWidth = '240px';
            popup.style.boxShadow = '0 8px 24px rgba(0,0,0,.6)';
            popup.innerHTML = `<div style="font-weight:700;margin-bottom:6px">Seen by (${seenBy.length})</div>
              <div style="font-size:13px;line-height:1.4">${escapeHTML(seenBy.slice(0,50).join(', '))}</div>
              <div style="font-size:11px;opacity:.8;margin-top:8px">Click anywhere to close</div>`;
            document.body.appendChild(popup);
            setTimeout(()=>{ document.addEventListener('click', function closer(){ popup.remove(); document.removeEventListener('click', closer); }); }, 10);
          } catch (err) {
            alert('Seen by: ' + seenBy.join(', '));
          }
        });

        timeRow.appendChild(seenWrap);
      }

      if (pinned) {
        const pinSpan = document.createElement('span');
        pinSpan.className = 'pinned-indicator';
        pinSpan.textContent = '📌';
        pinSpan.style.marginLeft = '8px';
        timeRow.appendChild(pinSpan);
      }

      bubble.appendChild(timeRow);

      el.appendChild(bubble);
      chat.appendChild(el);

      // allow lucide to replace icons if available
      try{ if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons(); }catch(e){}

      // auto-scroll behavior
      if (autoScroll) {
        // if user is near bottom scroll to bottom; otherwise show unread button (UI glue handles that)
        if (chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 120) {
          chat.scrollTop = chat.scrollHeight;
        } else {
          // do nothing; UI has unread button to take user to bottom
        }
      }

      // attach interactions hook for other modules (if they expect it)
      if (typeof window.attachMessageInteractions === 'function') {
        try { window.attachMessageInteractions(el, message); } catch (e) { /* ignore */ }
      }

    } catch (err) {
      console.error('renderMessage error', err, message);
    }
  } // end renderMessage

  window.renderMessage = renderMessage;

  console.info('message.js loaded — renderMessage ready.');
})();
