// simulation-engine.js
// Demo simulation engine that wires MessagePool.createGeneratorView() + TypingEngine
// - Defaults: useStreamAPI: true (preferred for very large pools), simulateTypingBeforeSend: true
// - If simulateTypingBeforeSend is true the engine will call TypingEngine.triggerTyping() (or window._abrox.showTyping())
//   before rendering each message to create a natural "typing -> send" flow.
// - If useStreamAPI && !simulateTypingBeforeSend and MessagePool.streamToUI exists, the engine will call streamToUI()
//   which lets MessagePool drive rendering (fast).
// - If MessagePool.createGeneratorView() exists we use it for memory-light paging; otherwise we fall back to getRange()
// - Deterministic: call SimulationEngine.configure({ seedBase: 4000 }) before start to reproduce runs.
//
// API:
//   SimulationEngine.configure(opts)
//   SimulationEngine.start()
//   SimulationEngine.stop()
//   SimulationEngine.isRunning()
//   SimulationEngine.setRate(ratePerMin)
//   SimulationEngine.setUseStreamAPI(bool)
//   SimulationEngine.setSimulateTypingBeforeSend(bool)
//   SimulationEngine.triggerOnce()  // emits a single message immediately (respecting typing simulation mode)
//

(function globalSimulationEngine(){
  if(window.SimulationEngine) return;

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function now(){ return Date.now(); }

  const DEFAULTS = {
    seedBase: null,                // if set => deterministic PRNG used for internal jitter decisions
    useStreamAPI: true,            // prefer MessagePool.streamToUI for very large pools (fast)
    simulateTypingBeforeSend: true,// simulate typing before sending (more realistic)
    ratePerMin: 45,                // messages per minute
    pageSize: 200,                 // generator view page size (if using generator view)
    jitterFraction: 0.25,          // jitter applied to intervals
    typingMinMs: 300,              // min typing indicator (ms)
    typingMaxMs: 1800,             // max typing indicator (ms)
    typingPerCharMs: 45,           // optional typing duration per character heuristic
    useGeneratorViewIfAvailable: true, // prefer generator view over getRange for prefill/streaming
    simulateTypingFraction: 0.75,  // fraction of messages to simulate typing for (not all)
    startIndex: 0                  // initial message index
  };

  let cfg = Object.assign({}, DEFAULTS);
  let running = false;
  let timer = null;
  let pageIdx = Number(cfg.startIndex) || 0;    // absolute message index counter
  let currentStreamer = null; // holds stream object from MessagePool.streamToUI if in use
  let deterministicRnd = null;

  function createRnd(seed){
    if(seed === null || seed === undefined) return Math.random;
    // tiny xorshift32 local
    let x = (seed >>> 0) || 0x811c9dc5;
    return function(){
      x |= 0;
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17; x >>>= 0;
      x ^= x << 5; x >>>= 0;
      return (x >>> 0) / 4294967296;
    };
  }

  // small helper to call TypingEngine.triggerTyping or fallback to _abrox.showTyping
  function triggerTypingForNames(names, durationMs){
    durationMs = Math.max(50, Math.round(durationMs || 500));
    try{
      if(window.TypingEngine && typeof window.TypingEngine.triggerTyping === 'function'){
        window.TypingEngine.triggerTyping(names, durationMs);
        return;
      }
    }catch(e){}
    try{
      if(window._abrox && typeof window._abrox.showTyping === 'function'){
        window._abrox.showTyping(names);
        setTimeout(()=>{ try{ window._abrox.showTyping([]); }catch(e){} }, durationMs + 80);
        return;
      }
    }catch(e){}
    // otherwise no-op
  }

  // compute per-message typing duration heuristically
  function computeTypingDurationForMessage(m){
    if(!m) return cfg.typingMinMs;
    const text = (m.text || m.content || m.message || '');
    const chars = (typeof text === 'string') ? text.length : 0;
    const est = Math.round(chars * cfg.typingPerCharMs);
    return clamp(est || cfg.typingMinMs, cfg.typingMinMs, cfg.typingMaxMs);
  }

  // safe view helpers (normalize generator view / fallback)
  function makeView(){
    // prefer generator view
    try{
      if(cfg.useGeneratorViewIfAvailable && window.MessagePool && typeof window.MessagePool.createGeneratorView === 'function'){
        const v = window.MessagePool.createGeneratorView({ pageSize: cfg.pageSize, seedBase: (cfg.seedBase !== null ? cfg.seedBase : undefined), spanDays: (window.MessagePool && window.MessagePool.meta && window.MessagePool.meta.spanDays) || undefined, cachePages: 12 });
        // ensure totalSize property exists when possible
        if(v && v.totalSize === undefined && window.MessagePool && window.MessagePool.meta && window.MessagePool.meta.size) v.totalSize = Number(window.MessagePool.meta.size);
        return v;
      }
    }catch(e){ console.warn('SimulationEngine.makeView generator view failed', e); }

    // fallback to getRange/getMessageByIndex
    if(window.MessagePool && (typeof window.MessagePool.getRange === 'function' || typeof window.MessagePool.getMessageByIndex === 'function')){
      const total = (window.MessagePool && window.MessagePool.messages && window.MessagePool.messages.length) || (window.MessagePool && window.MessagePool.meta && window.MessagePool.meta.size) || null;
      return {
        pageSize: cfg.pageSize,
        totalSize: total,
        nextPage: function(start){ 
          try{
            // clamp start into range if totalSize known
            if(total !== null && total !== undefined && start >= total){
              start = start % total;
            }
            return window.MessagePool.getRange(start, cfg.pageSize) || [];
          }catch(e){ return []; }
        },
        get: function(i){
          try{
            if(window.MessagePool.getMessageByIndex) return window.MessagePool.getMessageByIndex(i);
            const arr = window.MessagePool.getRange(i,1);
            return (arr && arr.length) ? arr[0] : null;
          }catch(e){ return null; }
        }
      };
    }

    return null;
  }

  // main loop when using generator view / manual streaming
  function startManualStream(){
    if(running === false) return;
    const view = makeView();
    if(!view){
      console.warn('SimulationEngine: No MessagePool view or getRange available — cannot start manual stream.');
      running = false;
      return;
    }

    // compute timing
    const baseIntervalMs = Math.round(60000 / Math.max(1, cfg.ratePerMin));
    deterministicRnd = createRnd(cfg.seedBase);

    // prepare page cursor
    let currentPageStart = Math.floor(pageIdx / view.pageSize) * view.pageSize;
    if(view.totalSize !== null && view.totalSize !== undefined && currentPageStart >= view.totalSize){
      currentPageStart = currentPageStart % view.totalSize;
      pageIdx = currentPageStart;
    }
    let currentPage = (typeof view.nextPage === 'function') ? (view.nextPage(currentPageStart) || []) : [];
    let idxWithinPage = pageIdx - currentPageStart;
    if(idxWithinPage < 0) idxWithinPage = 0;

    // internal emitter function
    const emitNext = () => {
      if(!running) return;

      // if we exhausted current page, fetch next
      if(idxWithinPage >= currentPage.length){
        currentPageStart += view.pageSize;
        // wrap if totalSize exists
        if(view.totalSize !== null && view.totalSize !== undefined){
          if(currentPageStart >= view.totalSize) currentPageStart = currentPageStart % view.totalSize;
        }
        currentPage = (typeof view.nextPage === 'function') ? (view.nextPage(currentPageStart) || []) : [];
        idxWithinPage = 0;
        // if still empty, try wrapping to 0 once
        if(!currentPage || !currentPage.length){
          if(view.totalSize && view.totalSize > 0 && currentPageStart !== 0){
            currentPageStart = 0;
            currentPage = (typeof view.nextPage === 'function') ? (view.nextPage(0) || []) : [];
            idxWithinPage = 0;
          }
          if(!currentPage || !currentPage.length){
            console.warn('SimulationEngine: no messages returned for page start', currentPageStart);
            SimulationEngine.stop();
            return;
          }
        }
      }

      const m = currentPage[idxWithinPage];
      pageIdx = currentPageStart + idxWithinPage;
      idxWithinPage++;

      // simulate typing before send?
      const rndFunc = deterministicRnd || Math.random;
      const doTyping = cfg.simulateTypingBeforeSend && (rndFunc() < cfg.simulateTypingFraction);
      if(doTyping){
        const name = (m && (m.displayName || m.name)) ? (m.displayName || m.name) : 'Someone';
        const typingDur = computeTypingDurationForMessage(m);
        try{
          triggerTypingForNames([name], typingDur);
        }catch(e){}
        // render after typingDur plus a small natural delay
        setTimeout(()=>{
          try{ window.renderMessage && window.renderMessage(m, true); }catch(e){ console.warn('SimulationEngine: renderMessage failed', e); }
        }, typingDur + Math.round((rndFunc() - 0.5) * 180)); // small +/- jitter to feel organic
      } else {
        // immediate render
        try{ window.renderMessage && window.renderMessage(m, true); }catch(e){ console.warn('SimulationEngine: renderMessage failed', e); }
      }

      // schedule next emit with jitter
      const jitter = Math.round(( (deterministicRnd || Math.random)() - 0.5) * baseIntervalMs * cfg.jitterFraction);
      const nextDelay = Math.max(20, baseIntervalMs + jitter);
      timer = setTimeout(emitNext, nextDelay);
    };

    // kick off first emit (short delay)
    timer = setTimeout(emitNext, 0);
  }

  // start using MessagePool.streamToUI (fast) - only used when simulateTypingBeforeSend === false
  function startStreamAPI(){
    if(!window.MessagePool || typeof window.MessagePool.streamToUI !== 'function'){
      // fallback
      startManualStream();
      return;
    }

    deterministicRnd = createRnd(cfg.seedBase);
    const rndFunc = deterministicRnd || Math.random;

    // Use streamToUI; pass an onEmit callback for instrumentation
    const opts = {
      startIndex: pageIdx || 0,
      ratePerMin: cfg.ratePerMin,
      jitterMs: Math.round((60000 / Math.max(1, cfg.ratePerMin)) * cfg.jitterFraction),
      onEmit: (m, idx) => {
        // keep pageIdx moving forward
        pageIdx = idx + 1;
        // occasional typing nudges to TypingEngine to keep UI lively (independent)
        try{
          if((deterministicRnd ? deterministicRnd() : Math.random()) < 0.02){
            const name = (m && (m.displayName || m.name)) ? (m.displayName || m.name) : null;
            if(name) triggerTypingForNames([name], Math.round(200 + Math.random()*900));
          }
        }catch(e){}
      }
    };

    // stop existing streamer if any
    if(currentStreamer && typeof currentStreamer.stop === 'function'){
      try{ currentStreamer.stop(); }catch(e){}
      currentStreamer = null;
    }

    currentStreamer = MessagePool.streamToUI(opts);
  }

  // public API
  const SimulationEngine = {
    configure(opts){
      opts = opts || {};
      if(opts.seedBase !== undefined) cfg.seedBase = (opts.seedBase === null ? null : Number(opts.seedBase));
      if(opts.useStreamAPI !== undefined) cfg.useStreamAPI = !!opts.useStreamAPI;
      if(opts.simulateTypingBeforeSend !== undefined) cfg.simulateTypingBeforeSend = !!opts.simulateTypingBeforeSend;
      if(opts.ratePerMin !== undefined) cfg.ratePerMin = Math.max(1, Number(opts.ratePerMin));
      if(opts.pageSize !== undefined) cfg.pageSize = Math.max(1, Number(opts.pageSize));
      if(opts.jitterFraction !== undefined) cfg.jitterFraction = clamp(Number(opts.jitterFraction), 0, 1);
      if(opts.typingMinMs !== undefined) cfg.typingMinMs = Math.max(10, Number(opts.typingMinMs));
      if(opts.typingMaxMs !== undefined) cfg.typingMaxMs = Math.max(cfg.typingMinMs, Number(opts.typingMaxMs));
      if(opts.typingPerCharMs !== undefined) cfg.typingPerCharMs = Math.max(1, Number(opts.typingPerCharMs));
      if(opts.simulateTypingFraction !== undefined) cfg.simulateTypingFraction = clamp(Number(opts.simulateTypingFraction), 0, 1);
      if(opts.startIndex !== undefined) pageIdx = Math.max(0, Number(opts.startIndex));
      return Object.assign({}, cfg);
    },

    start(){
      if(running) return;
      // ensure clean state
      this.stop();
      running = true;

      // Prefer generator/manual streaming when simulateTypingBeforeSend is true (because streamToUI renders messages directly)
      if(cfg.useStreamAPI && !cfg.simulateTypingBeforeSend && window.MessagePool && typeof window.MessagePool.streamToUI === 'function'){
        startStreamAPI();
      } else {
        startManualStream();
      }
      return true;
    },

    stop(){
      running = false;
      if(timer){ clearTimeout(timer); timer = null; }
      if(currentStreamer && typeof currentStreamer.stop === 'function'){
        try{ currentStreamer.stop(); }catch(e){}
        currentStreamer = null;
      }
      return true;
    },

    isRunning(){ return running; },

    // emit a single message immediately (respects simulateTypingBeforeSend setting)
    triggerOnce(){
      const view = makeView();
      if(!view) return null;

      // ensure pageIdx wraps if totalSize known
      if(view.totalSize !== null && view.totalSize !== undefined && view.totalSize > 0){
        pageIdx = pageIdx % view.totalSize;
      }

      // fetch message (prefer get)
      let m = null;
      try{
        if(typeof view.get === 'function'){
          m = view.get(pageIdx);
        } else if(typeof view.nextPage === 'function'){
          const pageStart = Math.floor(pageIdx / view.pageSize) * view.pageSize;
          const page = view.nextPage(pageStart) || [];
          m = page[pageIdx - pageStart] || null;
        }
      }catch(e){ m = null; }

      if(!m){
        // try advancing one and try again (best-effort)
        pageIdx++;
        return null;
      }

      // advance index for next calls (wrap if needed)
      pageIdx++;
      if(view.totalSize !== null && view.totalSize !== undefined && view.totalSize > 0){
        pageIdx = pageIdx % view.totalSize;
      }

      const doTyping = cfg.simulateTypingBeforeSend && (Math.random() < cfg.simulateTypingFraction);
      if(doTyping){
        const name = m.displayName || m.name || 'Someone';
        const typingDur = computeTypingDurationForMessage(m);
        triggerTypingForNames([name], typingDur);
        setTimeout(()=>{ try{ window.renderMessage && window.renderMessage(m, true); }catch(e){ console.warn('SimulationEngine.triggerOnce render failed', e); } }, typingDur + 80);
      } else {
        try{ window.renderMessage && window.renderMessage(m, true); }catch(e){ console.warn('SimulationEngine.triggerOnce render failed', e); }
      }
      return m;
    },

    // setter helpers
    setRate(r){ cfg.ratePerMin = Math.max(1, Number(r)); },
    setUseStreamAPI(b){ cfg.useStreamAPI = !!b; },
    setSimulateTypingBeforeSend(b){ cfg.simulateTypingBeforeSend = !!b; },

    // internal debug/state
    _cfg(){ return Object.assign({}, cfg); },
    _state(){ return { running, pageIdx }; }
  };

  // expose globally
  window.SimulationEngine = SimulationEngine;

  // friendly auto-log
  console.info('SimulationEngine loaded — uses MessagePool.createGeneratorView() when available. Defaults:', DEFAULTS);

})();
