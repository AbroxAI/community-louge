// ui-adapter.js (patched)
// Full UI glue for Abrox + presence wiring that uses SyntheticPeople.simulatePresenceStep()
// - Prefill now prefers MessagePool.createGeneratorView() (memory-light paging) when available
// - Exposes window._abrox.setSampleMembers and window._abrox.showTyping
// - Renders members list and messages
// - Attaches interactions (context menu / long-press / pin / reply)
// - Presence wiring updates #onlineCount periodically
// - Demo: prefill chat from MessagePool via generator view when available
(function uiAdapterGlobal(){
  if(window._abrox && window._abrox._uiAdapterLoaded) return;
  window._abrox = window._abrox || {};
  window._abrox._uiAdapterLoaded = true;

  /* ---------- Helpers ---------- */
  function escapeHtml(s){ return (''+s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
  function formatTime(ts) {
    const d = new Date(ts || Date.now());
    return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  // presence helper (UI-visible)
  window.presenceOf = function(m){
    if(!m) return 'offline';
    const d = Date.now() - (m.lastActive || 0);
    if(d < 90*1000) return 'online';
    if(d < 300*1000) return 'idle';
    return 'offline';
  };

  /* ---------- Exposed: setSampleMembers (SyntheticPeople.injectToUI calls this) ---------- */
  window._abrox.setSampleMembers = function(members){
    try{
      window.sampleMembers = members || [];
      const pc = document.getElementById('memberCount');
      if(pc) pc.textContent = (members.length||0).toLocaleString();
      renderMemberWindow();
    }catch(e){
      console.warn('setSampleMembers failed', e);
    }
  };

  /* ---------- Typing indicator hook (used by TypingEngine) ---------- */
  window._abrox.showTyping = function(names){
    try{
      const typingRow = document.getElementById('typingRow');
      const typingText = document.getElementById('typingText');
      if(!typingRow || !typingText) return;
      if(!names || !names.length){
        typingRow.classList.remove('active');
        const mr = document.getElementById('membersRow');
        if(mr) mr.classList.remove('hidden');
        return;
      }
      typingText.textContent = names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : `${names.length} people are typing…`;
      typingRow.classList.add('active');
      const mr = document.getElementById('membersRow');
      if(mr) mr.classList.add('hidden');
      // auto-hide after short random interval (safety)
      setTimeout(()=>{ try{ typingRow.classList.remove('active'); if(mr) mr.classList.remove('hidden'); }catch(e){} }, 1000 + Math.random()*1800);
    }catch(e){ console.error('showTyping error', e); }
  };

  /* ---------- Member window rendering ---------- */
  function renderMemberWindow(){
    const memberListEl = document.getElementById('memberList');
    if(!memberListEl) return;
    memberListEl.innerHTML = '';
    const slice = (window.sampleMembers || []).slice(0, 120);
    slice.forEach(p => {
      const div = document.createElement('div');
      div.className = 'member-row';
      div.setAttribute('role','listitem');

      const presenceColor = presenceOf(p) === 'online' ? '#22c55e' : presenceOf(p) === 'idle' ? '#f59e0b' : '#94a3b8';
      const avatarSrc = p.avatar || '';
      div.innerHTML = `<div style="display:flex;gap:8px;align-items:center">
        <div style="position:relative">
          <img src="${escapeHtml(avatarSrc)}" class="w-10 h-10 rounded-full avatar" alt="${escapeHtml(p.displayName)}" loading="lazy" width="40" height="40">
          <span style="position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border-radius:999px;background:${presenceColor};border:2px solid #1c1f26"></span>
        </div>
        <div style="min-width:0">
          <div style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.displayName)}</div>
          <div style="font-size:11px;color:var(--muted)">${escapeHtml(p.role || '')}</div>
        </div>
      </div>`;
      memberListEl.appendChild(div);
    });
  }

  /* ---------- Message rendering ---------- */
  function ensureChatScrollToEnd(chatEl){
    if(!chatEl) return;
    if(chatEl.scrollTop + chatEl.clientHeight < chatEl.scrollHeight - 60){
      const unreadBtn = document.getElementById('unreadBtn');
      if(unreadBtn){
        unreadBtn.textContent = '⬇ New messages';
        unreadBtn.style.display = 'block';
      }
    } else {
      chatEl.scrollTop = chatEl.scrollHeight;
    }
  }

  window.renderMessage = function(m, isNew){
    try{
      const chat = document.getElementById('chat');
      if(!chat || !m) return;
      // date pill when day changes
      const d = new Date(m.time || Date.now());
      const day = d.toDateString();
      if(chat._lastDate !== day){
        const pill = document.createElement('div');
        pill.className = 'date-pill';
        pill.textContent = (day === (new Date()).toDateString() ? 'Today' : day);
        chat.appendChild(pill);
        chat._lastDate = day;
      }

      const grouped = false; // placeholder for grouping logic
      const el = document.createElement('div');
      el.className = 'msg ' + ((m.out) ? 'out' : 'in') + (grouped ? ' grouped' : '');
      el.dataset.id = m.id || ('id_' + Math.random().toString(36).slice(2,9));

      const badge = m.role === 'ADMIN' ? '<span class="role-pill admin">ADMIN</span>' : (m.role === 'MOD' ? '<span class="role-pill mod">MOD</span>' : '<span class="verified-bubble" title="Verified"><i data-lucide="award" style="width:12px;height:12px"></i></span>');
      const avatarHtml = (!m.out) ? `<img class="avatar" src="${escapeHtml(m.avatar||'')}" alt="${escapeHtml(m.displayName||m.name||'')}" loading="lazy">` : '';

      el.innerHTML = `${avatarHtml}
        <div class="bubble" role="article">
          ${!m.out ? `<div class="sender">${escapeHtml(m.displayName || m.name)} ${badge}</div>` : ''}
          <div class="content">${m.text}</div>
          <div class="time"><i data-lucide="eye" class="w-3 h-3"></i> · ${formatTime(m.time || Date.now())}</div>
        </div>`;

      chat.appendChild(el);
      try{ lucide.createIcons(); }catch(e){}
      ensureChatScrollToEnd(chat);
      attachMessageInteractions(el, m);
    }catch(err){
      console.error('renderMessage error', err, m);
    }
  };

  /* ---------- Message interactions (context menu, longpress) ---------- */
  window.attachMessageInteractions = function(domEl, msg){
    if(!domEl) return;
    domEl.addEventListener('contextmenu', (ev) => {
      ev.preventDefault(); showContextMenuAt(ev.clientX, ev.clientY, msg, domEl);
    });
    let touchTimer = null, startX=0, startY=0;
    domEl.addEventListener('touchstart', (ev) => {
      if(touchTimer) clearTimeout(touchTimer);
      const t = ev.touches && ev.touches[0];
      if(!t) return;
      startX = t.clientX; startY = t.clientY;
      touchTimer = setTimeout(() => { showContextMenuAt(t.clientX, t.clientY, msg, domEl); touchTimer = null; }, 520);
    }, {passive:true});
    domEl.addEventListener('touchmove', (ev) => {
      if(!touchTimer) return;
      const t = ev.touches && ev.touches[0];
      if(!t) return;
      if(Math.abs(t.clientX - startX) > 12 || Math.abs(t.clientY - startY) > 12){
        clearTimeout(touchTimer); touchTimer = null;
      }
    }, {passive:true});
    domEl.addEventListener('touchend', () => { if(touchTimer){ clearTimeout(touchTimer); touchTimer = null; } });
  };

  function showContextMenuAt(x,y,msg,anchorEl){
    try{
      document.querySelectorAll('.context-menu').forEach(n=>n.remove());
      const menu = document.createElement('div');
      menu.className = 'context-menu';
      menu.style.position = 'fixed';
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.style.zIndex = 9999;
      menu.innerHTML = `<div class="menu-item" data-action="reply">Reply</div><div class="menu-item" data-action="pin">Pin</div>`;
      document.body.appendChild(menu);
      const rect = menu.getBoundingClientRect();
      if(rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
      if(rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
      const replyBtn = menu.querySelector('[data-action="reply"]');
      const pinBtn = menu.querySelector('[data-action="pin"]');
      if(replyBtn) replyBtn.addEventListener('click', ()=>{ menu.remove(); setReplyTo(msg.id); });
      if(pinBtn) pinBtn.addEventListener('click', ()=>{ menu.remove(); pinMessage(msg.id); });
      setTimeout(()=>{ document.addEventListener('click', function closer(e){ if(!menu.contains(e.target)){ menu.remove(); document.removeEventListener('click', closer); } }); }, 10);
    }catch(e){ console.warn('showContextMenuAt', e); }
  }

  /* ---------- Pin behavior ---------- */
  window.pinMessage = function(id){
    try{
      const el = document.querySelector(`[data-id="${id}"]`);
      let txt = 'Pinned message';
      if(el && el.querySelector('.content')) txt = el.querySelector('.content').textContent;
      const pinnedTextEl = document.getElementById('pinnedText');
      if(pinnedTextEl) pinnedTextEl.textContent = txt.length > 160 ? txt.slice(0,157) + '...' : txt;
      const banner = document.getElementById('pinnedBanner');
      if(banner) banner.classList.remove('hidden');
      try{ localStorage.setItem('pinned_message_id', id); localStorage.setItem('pinned_message_text', txt); }catch(e){}
    }catch(e){ console.warn('pinMessage error', e); }
  };

  // unpin handler (wire to UI button if present)
  (function wireUnpin(){
    const unpinBtn = document.getElementById('unpinBtn');
    if(unpinBtn){
      unpinBtn.addEventListener('click', ()=>{
        const banner = document.getElementById('pinnedBanner');
        if(banner) banner.classList.add('hidden');
        try{ localStorage.removeItem('pinned_message_id'); localStorage.removeItem('pinned_message_text'); }catch(e){}
      });
    }
  })();

  /* ---------- Reply preview UI ---------- */
  let replyTargetId = null;
  window.setReplyTo = function(msgId){
    try{
      const target = document.querySelector(`[data-id="${msgId}"]`);
      if(!target) return;
      const senderText = target.querySelector('.sender') ? target.querySelector('.sender').textContent : 'Message';
      const snippet = target.querySelector('.content') ? target.querySelector('.content').textContent.slice(0,120) : '';
      const container = document.getElementById('replyPreviewContainer');
      if(!container) return;
      container.innerHTML = `<div class="reply-preview" id="replyPreview">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:700">${escapeHtml(senderText)}</div>
          <div style="font-size:11px;opacity:.65;cursor:pointer" id="replyCancelBtn">Cancel</div>
        </div>
        <div class="snippet">${escapeHtml(snippet)}</div>
      </div>`;
      const cancel = document.getElementById('replyCancelBtn');
      if(cancel) cancel.addEventListener('click', ()=>{ clearReplyPreview(); });
      replyTargetId = msgId;
      // visual focus: ensure footer is visible
      const input = document.getElementById('input');
      if(input) input.focus();
    }catch(e){ console.warn('setReplyTo failed', e); }
  };

  function clearReplyPreview(){
    const container = document.getElementById('replyPreviewContainer');
    if(container) container.innerHTML = '';
    replyTargetId = null;
  }

  /* ---------- Basic UI wiring: members sidebar toggle, unread button ---------- */
  (function uiControls(){
    const membersBtn = document.getElementById('membersBtn');
    const sidebar = document.getElementById('sidebar');
    const closeSidebar = document.getElementById('closeSidebar');
    if(membersBtn && sidebar){
      membersBtn.addEventListener('click', ()=>{
        const isHidden = sidebar.classList.contains('translate-x-full');
        if(isHidden){
          sidebar.classList.remove('translate-x-full');
          sidebar.setAttribute('aria-hidden','false');
        } else {
          sidebar.classList.add('translate-x-full');
          sidebar.setAttribute('aria-hidden','true');
        }
      });
    }
    if(closeSidebar && sidebar){
      closeSidebar.addEventListener('click', ()=>{ sidebar.classList.add('translate-x-full'); sidebar.setAttribute('aria-hidden','true'); });
    }

    const unreadBtn = document.getElementById('unreadBtn');
    if(unreadBtn){
      unreadBtn.addEventListener('click', ()=>{
        const chat = document.getElementById('chat');
        if(chat){ chat.scrollTop = chat.scrollHeight; unreadBtn.style.display = 'none'; }
      });
    }

    // optionally wire send button to simulate outgoing message (non-destructive)
    const sendBtn = document.getElementById('send');
    const inputEl = document.getElementById('input');
    if(sendBtn && inputEl){
      sendBtn.addEventListener('click', ()=> {
        const txt = (inputEl.value || '').trim();
        if(!txt) return;
        const m = {
          id: 'out_' + Date.now(),
          name: 'You',
          displayName: 'You',
          role: 'YOU',
          avatar: '',
          text: escapeHtml(txt),
          out: true,
          time: Date.now(),
          replyTo: replyTargetId
        };
        renderMessage(m, true);
        inputEl.value = '';
        clearReplyPreview();
      });
      // show send when typing
      inputEl.addEventListener('input', ()=>{
        if(inputEl.value && inputEl.value.trim().length) sendBtn.classList.remove('hidden'); else sendBtn.classList.add('hidden');
      });
    }
  })();

  /* ---------- Presence wiring: simulatePresenceStep -> UI (#onlineCount) ---------- */
  (function presenceWiring(){
    const PRESENCE_INTERVAL_MS = 20_000;
    const PRESENCE_OPTS = { percent: 0.01 }; // default: nudge ~1% per tick

    function updateOnlineDisplay(){
      try{
        if(window.SyntheticPeople && typeof window.SyntheticPeople.simulatePresenceStep === 'function'){
          try{ window.SyntheticPeople.simulatePresenceStep(PRESENCE_OPTS); }catch(e){}
        }

        const list = (window.sampleMembers && window.sampleMembers.length) ? window.sampleMembers : (window.SyntheticPeople && Array.isArray(window.SyntheticPeople.people) ? window.SyntheticPeople.people : []);
        if(!list || !list.length){
          const el = document.getElementById('onlineCount');
          if(el) el.textContent = '0';
          return;
        }

        let online = 0;
        for(let i=0;i<list.length;i++){
          const p = list[i];
          try{
            if((window.presenceOf || function(m){ const d = Date.now() - (m.lastActive || 0); if(d < 90*1000) return 'online'; if(d < 300*1000) return 'idle'; return 'offline'; })(p) === 'online') online++;
          }catch(e){}
        }

        const el = document.getElementById('onlineCount');
        if(el) el.textContent = online.toLocaleString();
        if(document.getElementById('memberList')) {
          try{ renderMemberWindow(); }catch(e){}
        }
      }catch(err){
        console.warn('presenceWiring.updateOnlineDisplay error', err);
      }
    }

    // initial run + interval
    setTimeout(updateOnlineDisplay, 600);
    const presenceTicker = setInterval(updateOnlineDisplay, PRESENCE_INTERVAL_MS);

    // expose small control API
    window._abrox.presenceControls = {
      stop: () => clearInterval(presenceTicker),
      tickNow: updateOnlineDisplay,
      setPercent: (p) => { PRESENCE_OPTS.percent = clamp(Number(p) || 0.01, 0, 1); }
    };
  })();

  /* ---------- Auto-restore pinned message from localStorage ---------- */
  (function restorePinned(){
    try{
      const pid = localStorage.getItem('pinned_message_id');
      const ptxt = localStorage.getItem('pinned_message_text');
      if(pid && ptxt){
        const el = document.getElementById('pinnedText');
        if(el) el.textContent = ptxt;
        const banner = document.getElementById('pinnedBanner');
        if(banner) banner.classList.remove('hidden');
      }
    }catch(e){}
  })();

  /* ---------- Demo prefill using generator view when available ---------- */
  // Exposed as window._abrox.prefillFromMessagePool(start = 0, count = 40)
  window._abrox.prefillFromMessagePool = function(start = 0, count = 40){
    try{
      // prefer generator view (memory-light) when available
      if(window.MessagePool && typeof window.MessagePool.createGeneratorView === 'function'){
        try{
          const pageSize = Math.max(1, Number(count) || 40);
          const gv = window.MessagePool.createGeneratorView({ pageSize, cachePages: 4 });
          // expose for debugging
          window._abrox._messagePoolView = gv;
          const page = gv.nextPage(Number(start) || 0);
          const chat = document.getElementById('chat'); if(chat) chat.innerHTML = '';
          page.forEach(m => { try{ window.renderMessage(m, false); }catch(e){ console.warn('renderMessage failed for prefill', e); } });
          return page;
        }catch(e){ console.warn('prefillFromMessagePool generatorView failed', e); }
      }

      // fallback to getRange if generator view not present
      if(window.MessagePool && typeof window.MessagePool.getRange === 'function'){
        const msgs = window.MessagePool.getRange(Number(start) || 0, Number(count) || 40) || [];
        const chat = document.getElementById('chat'); if(chat) chat.innerHTML = '';
        for(let i=0;i<msgs.length;i++){
          try{ window.renderMessage(msgs[i], false); }catch(e){ console.warn('renderMessage failed for prefill', e); }
        }
        return msgs;
      }

      console.warn('prefillFromMessagePool: MessagePool not ready');
      return [];
    }catch(e){
      console.warn('prefillFromMessagePool error', e);
      return [];
    }
  };

  // Auto-run once shortly after load if both MessagePool and renderMessage are present.
  // This prefill is conservative (40 messages) and prefers the generator view.
  setTimeout(()=>{
    try{
      if(typeof window.renderMessage !== 'function') return;
      if(window._abrox && window._abrox.disableAutoPrefill) return;

      if(window.MessagePool){
        if(typeof window.MessagePool.createGeneratorView === 'function'){
          try{
            const gv = window.MessagePool.createGeneratorView({ pageSize: 40, cachePages: 4 });
            window._abrox._messagePoolView = gv;
            const page = gv.nextPage(0);
            if(page && page.length){
              const chat = document.getElementById('chat'); if(chat) chat.innerHTML = '';
              page.forEach(m => { try{ window.renderMessage(m, false); }catch(e){} });
            }
            return;
          }catch(e){ console.warn('auto prefill generatorView failed', e); }
        }

        // fallback
        if(typeof window.MessagePool.getRange === 'function'){
          try{
            const sample = window.MessagePool.getRange(0, 40);
            if(sample && sample.length){ const chat = document.getElementById('chat'); if(chat) chat.innerHTML = ''; sample.forEach(m => { try{ window.renderMessage(m, false); }catch(e){} }); }
          }catch(e){ console.warn('auto prefill failed', e); }
        }
      }
    }catch(e){}
  }, 700);

  /* ---------- Exports for testing/debugging ---------- */
  window._abrox.renderMemberWindow = renderMemberWindow;
  window._abrox.renderMessage = window.renderMessage;
  window._abrox.clearReplyPreview = function(){ try{ clearReplyPreview(); }catch(e){} };

  // friendly log
  console.info('ui-adapter loaded — presence wiring active. Demo prefill uses MessagePool.createGeneratorView() when available.');
})();
