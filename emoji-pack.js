/* ======================================================
   EMOJI PACK – FULL UNICODE SET
   Picker + Message Reactions
   Compatible with Abrox Chat UI
====================================================== */

(() => {

  /* ===============================
     FULL EMOJI SET (CURATED + LARGE)
  =============================== */
  const EMOJIS = [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚',
    '😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖',
    '😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓',
    '🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄',

    '👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🙏',

    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💖','💘','💝','💞','💕','💓',

    '🔥','💯','✨','⚡','💥','💫','🎉','🎊','🎯','🏆',

    '👀','🧠','🦴','👅','👄',

    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦',

    '🍎','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🥭','🍕','🍔','🍟','🌭','🍿','🍣','🍜','🍰','🧁',

    '⚽','🏀','🏈','⚾','🎾','🎮','🎲','🎸','🎧',

    '🚀','✈️','🚗','🏍️','🚲',

    '🔒','🔓','🔑','💡','📎','📌','📱','💻','📷',

    '✅','❌','⚠️','❓','❗','💬'
  ];

  /* ===============================
     EMOJI PICKER
  =============================== */
  let picker;

  function createPicker() {
    picker = document.createElement('div');
    picker.className = 'emoji-picker';
    picker.style.cssText = `
      position:fixed;
      bottom:80px;
      left:12px;
      width:320px;
      max-height:260px;
      background:#232833;
      border:1px solid #343a4a;
      border-radius:16px;
      padding:10px;
      z-index:9999;
      box-shadow:0 12px 40px rgba(0,0,0,.45);
      overflow-y:auto;
      display:grid;
      grid-template-columns:repeat(8,1fr);
      gap:6px;
    `;

    EMOJIS.forEach(e => {
      const btn = document.createElement('button');
      btn.textContent = e;
      btn.style.cssText = `
        font-size:20px;
        padding:6px;
        border-radius:10px;
        background:transparent;
      `;
      btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,.08)';
      btn.onmouseleave = () => btn.style.background = 'transparent';
      btn.onclick = () => {
        if (picker._input) {
          picker._input.value += e;
          picker._input.focus();
        }
      };
      picker.appendChild(btn);
    });

    document.body.appendChild(picker);
  }

  window.EmojiPack = {
    openPicker(input) {
      if (!picker) createPicker();
      picker._input = input;
      picker.style.display =
        picker.style.display === 'none' || !picker.style.display
          ? 'grid'
          : 'none';
    }
  };

  /* CLOSE PICKER (THIS IS THE PART YOU SAID WORKED ✅) */
  document.addEventListener('click', e => {
    if (
      picker &&
      !e.target.closest('.emoji-picker') &&
      !e.target.closest('[data-lucide="smile"]')
    ) {
      picker.style.display = 'none';
    }
  });

  /* ===============================
     MESSAGE REACTIONS
  =============================== */
  let reactionBar;

  function createReactionBar() {
    reactionBar = document.createElement('div');
    reactionBar.style.cssText = `
      position:absolute;
      display:flex;
      gap:6px;
      padding:6px 10px;
      background:#232833;
      border:1px solid #343a4a;
      border-radius:999px;
      z-index:9999;
      box-shadow:0 8px 24px rgba(0,0,0,.4);
    `;

    EMOJIS.slice(0,10).forEach(e => {
      const btn = document.createElement('button');
      btn.textContent = e;
      btn.style.fontSize = '18px';
      btn.onclick = () => {
        if (reactionBar._bubble) addReaction(reactionBar._bubble, e);
        reactionBar.remove();
        reactionBar = null;
      };
      reactionBar.appendChild(btn);
    });

    document.body.appendChild(reactionBar);
  }

  function addReaction(bubble, emoji) {
    let row = bubble.querySelector('.reactions');
    if (!row) {
      row = document.createElement('div');
      row.className = 'reactions';
      row.style.cssText = `
        display:flex;
        gap:4px;
        margin-top:6px;
        justify-content:flex-end;
      `;
      bubble.appendChild(row);
    }

    let chip = [...row.children].find(c => c.dataset.e === emoji);
    if (!chip) {
      chip = document.createElement('div');
      chip.dataset.e = emoji;
      chip.dataset.c = 1;
      chip.textContent = `${emoji} 1`;
      chip.style.cssText = `
        font-size:11px;
        padding:2px 6px;
        border-radius:999px;
        background:rgba(255,255,255,.12);
      `;
      row.appendChild(chip);
    } else {
      chip.dataset.c++;
      chip.textContent = `${emoji} ${chip.dataset.c}`;
    }
  }

  /* ===============================
     LONG PRESS / RIGHT CLICK
  =============================== */
  let pressTimer;

  document.addEventListener('pointerdown', e => {
    const bubble = e.target.closest('.bubble');
    if (!bubble) return;

    pressTimer = setTimeout(() => {
      if (!reactionBar) createReactionBar();
      reactionBar._bubble = bubble;

      const r = bubble.getBoundingClientRect();
      reactionBar.style.left = r.left + r.width / 2 - 90 + 'px';
      reactionBar.style.top = r.top - 42 + 'px';
      reactionBar.style.display = 'flex';
    }, 450);
  });

  document.addEventListener('pointerup', () => clearTimeout(pressTimer));
  document.addEventListener('pointercancel', () => clearTimeout(pressTimer));

  document.addEventListener('contextmenu', e => {
    const bubble = e.target.closest('.bubble');
    if (!bubble) return;
    e.preventDefault();

    if (!reactionBar) createReactionBar();
    reactionBar._bubble = bubble;

    const r = bubble.getBoundingClientRect();
    reactionBar.style.left = r.left + r.width / 2 - 90 + 'px';
    reactionBar.style.top = r.top - 42 + 'px';
    reactionBar.style.display = 'flex';
  });

  document.addEventListener('click', e => {
    if (reactionBar && !e.target.closest('.bubble')) {
      reactionBar.remove();
      reactionBar = null;
    }
  });

})();
