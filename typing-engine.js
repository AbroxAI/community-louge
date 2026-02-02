// typing-engine.js
// Passive typing indicator engine (SimulationEngine-driven)
(function globalTypingEngine(){
  if (window.TypingEngine) return;
  function xorshift32(seed){ let x=(seed>>>0)||0x811c9dc5; return function(){ x|=0; x^=x<<13; x>>>=0; x^=x>>>17; x>>>=0; x^=x<<5; x>>>=0; return (x>>>0)/4294967296; }; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  const DEFAULTS = { seedBase: null, minDurationMs: 120, maxNames:6 };
  let cfg = { ...DEFAULTS }, rnd = Math.random, active=false, clearTimer=null;
  function showTyping(names){ try{ if(window._abrox && typeof window._abrox.showTyping === 'function'){ window._abrox.showTyping(names); return; } const row = document.getElementById('typingRow'); const text = document.getElementById('typingText'); if(!row||!text) return; if(names.length===1) text.textContent = `${names[0]} is typing…`; else if(names.length===2) text.textContent = `${names[0]} and ${names[1]} are typing…`; else text.textContent = `${names.length} people are typing…`; row.classList.add('active'); }catch(e){ console.warn('TypingEngine showTyping', e); } }
  function clearTyping(){ try{ if(window._abrox && typeof window._abrox.showTyping === 'function'){ window._abrox.showTyping([]); } }catch(e){} const row = document.getElementById('typingRow'); row && row.classList.remove('active'); active=false; }
  const TypingEngine = {
    configure(opts={}){ if(opts.seedBase !== undefined){ cfg.seedBase = opts.seedBase === null ? null : Number(opts.seedBase); rnd = cfg.seedBase != null ? xorshift32(cfg.seedBase) : Math.random; } if(opts.minDurationMs !== undefined) cfg.minDurationMs = Math.max(20, Number(opts.minDurationMs)); if(opts.maxNames !== undefined) cfg.maxNames = clamp(Number(opts.maxNames),1,10); return {...cfg}; },
    triggerTyping(names,durationMs){ if(!Array.isArray(names)) names=[names]; names = names.filter(Boolean).slice(0,cfg.maxNames); if(!names.length) return; const dur = Math.max(cfg.minDurationMs, Number(durationMs) || cfg.minDurationMs); if(clearTimer){ clearTimeout(clearTimer); clearTimer=null; } active=true; showTyping(names); clearTimer = setTimeout(()=>{ clearTyping(); }, dur); },
    clear(){ if(clearTimer){ clearTimeout(clearTimer); clearTimer=null; } clearTyping(); },
    isActive(){ return active; }
  };
  window.TypingEngine = TypingEngine; console.info('TypingEngine (passive) loaded');
})();
