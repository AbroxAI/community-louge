// -------- Emoji picker wiring --------
(function wireEmojiPicker(){
  const btn = document.getElementById('emojiBtn');
  const input = document.getElementById('input');
  if(!btn || !input) return;

  function insertAtCursor(el, text){
    el.focus();
    if(document.activeElement !== el) el.focus();
    try{
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = el.value || '';
      el.value = val.slice(0, start) + text + val.slice(end);
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
      el.dispatchEvent(new Event('input',{ bubbles:true }));
    }catch(e){
      el.value += text;
      el.dispatchEvent(new Event('input',{ bubbles:true }));
    }
  }

  btn.addEventListener('click', (ev) => {
    // Preferred modern API
    if(window.EmojiPicker && typeof window.EmojiPicker.open === 'function'){
      window.EmojiPicker.open({
        anchor: btn,
        onSelect: (emoji) => insertAtCursor(input, emoji)
      });
      return;
    }
    if(window.emojiPicker && typeof window.emojiPicker.open === 'function'){
      window.emojiPicker.open({ onPick: e => insertAtCursor(input, e) });
      return;
    }

    // Fallback: tiny inline quick-picker
    const existing = document.getElementById('__tiny_emoji_picker');
    if(existing){ existing.remove(); return; }
    const box = document.createElement('div');
    box.id = '__tiny_emoji_picker';
    box.style.position = 'absolute';
    box.style.bottom = '72px';
    box.style.left = (btn.getBoundingClientRect().left) + 'px';
    box.style.background = '#11121a';
    box.style.border = '1px solid #343a4a';
    box.style.padding = '8px';
    box.style.borderRadius = '8px';
    box.style.zIndex = 99999;
    const sample = ['😀','🚀','💎','🔥','📈','📉','✅','❌','🐳','🤖'];
    sample.forEach(s=>{
      const b = document.createElement('button');
      b.type='button';
      b.style.fontSize='18px';
      b.style.margin='4px';
      b.style.border='none';
      b.style.background='transparent';
      b.style.color='inherit';
      b.textContent = s;
      b.addEventListener('click', ()=>{ insertAtCursor(input, s); box.remove(); });
      box.appendChild(b);
    });
    document.body.appendChild(box);
    setTimeout(()=>{ document.addEventListener('click', function docClose(ev){ if(!box.contains(ev.target) && ev.target !== btn){ box.remove(); document.removeEventListener('click', docClose); } }); }, 10);
  });
})();
