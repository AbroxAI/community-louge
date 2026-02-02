// message-pool.js
// Deterministic, large message pool generator for Abrox chat simulation.
// - Default pool size: 100000 messages (configurable)
// - Deterministic via seedBase so same seed reproduces same messages
// - Templates + tokenization & numeric variety to reduce duplicates
// - Integrates with SyntheticPeople for senders/avatars/roles
// - Methods: generatePool, regenerateAndInject, getMessageByIndex, getRange, pickRandom,
//            streamToUI (simulate live emission), exportToJSON, estimatePoolForDuration, preGenerateTemplates
//
// Usage (example):
//   MessagePool.generatePool({ size:100000, seedBase:4000, spanDays:730 });
//   MessagePool.streamToUI({ startIndex:0, ratePerMin:45 });
//   const window = MessagePool.getRange(0,50);

(function globalMessagePool(){
  if(window.MessagePool) return;

  /* ---------- small deterministic PRNG (xorshift32) ---------- */
  function xorshift32(seed){
    let x = (seed >>> 0) || 0x811c9dc5;
    return function(){
      x |= 0;
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17; x >>>= 0;
      x ^= x << 5; x >>>= 0;
      return (x >>> 0) / 4294967296;
    };
  }

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function uid(prefix='msg'){ return prefix + '_' + Math.random().toString(36).slice(2,10); }

  /* ---------- Crypto vocabulary & templates ---------- */
  const TOKENS = ['BTC','ETH','SOL','LTC','DOGE','XRP','ADA','BNB','MATIC','AVAX','DOT','LINK','OP','ARB'];
  const INDICATORS = ['RSI','MACD','EMA50','EMA200','SMA20','OBV','VWAP','Volume'];
  const TIMEFRAMES = ['1m','5m','15m','1h','4h','1d','1w'];
  const ORDERS = ['buy','sell','long','short','swing','scalp','hodl'];
  const COMMON_PHRASES = [
    'Anyone watching {token}?',
    'Set a stop at {stop}.',
    'TP at {tp}.',
    'Looks like accumulation to me.',
    'This looks like a retrace — waiting for confirmation.',
    'FOMO incoming 🚀',
    'Diamond hands.',
    'Paper hands everywhere 😅',
    'Watching the order book — strong sell wall.',
    'Good time to DCA?',
    'That was a nasty wick on the 1h.',
    'Whale alert on {token} 🐳',
    'IIRC that indicator signals reversal.',
    'Use limit orders if you care about price.',
    'The bot produced a noisy signal today.',
    'Anyone sharing indicators? DM me.',
    'This feels like a fakeout.',
    'LFG to the moon 🚀💎',
    'That TA lines up with weekly resistance.',
    'Small position only — too risky for me.'
  ];
  const ATTACH_TITLES = ['chart.png','screenshot.jpg','trade.mp4','report.pdf','indicator.png'];
  const EMOJI = ['🚀','💎','🔥','📉','📈','🤖','🔒','⚠️','✅','❌','🐳'];

  /* ---------- Avatar providers (mixed to reduce duplicate look) ---------- */
  const AVATAR_PROVIDERS = [
    // dicebear new style (seed)
    'https://api.dicebear.com/8.x/thumbs/svg?seed={seed}',
    // dicebear identicon legacy
    'https://avatars.dicebear.com/api/identicon/{seed}.svg',
    // multiavatar (png)
    'https://api.multiavatar.com/{seed}.png',
    // simple two-letter initials avatar
    'https://ui-avatars.com/api/?name={seed}&background=111827&color=ffffff&bold=true',
    // robohash (robot/cute set)
    'https://robohash.org/{seed}.png?set=set4'
  ];

  /* ---------- Defaults (tuned for long-run realism) ---------- */
  const DEFAULT = {
    size: 100000,       // default message count
    seedBase: 4000,
    spanDays: 730,      // 2 years
    minWords: 4,
    maxWords: 28,
    replyFraction: 0.06,
    attachmentFraction: 0.04,
    pinnedFraction: 0.0008,
    adminSpeakBoost: 0.04 // chance for admin/mod messages
  };

  /* ---------- Fixed special members (admin/mod) ---------- */
  const SPECIAL_MEMBERS = [
    { name: 'profit_hunters', displayName: 'Profit Hunters', role: 'ADMIN' },
    { name: 'kitty_star', displayName: 'Kitty Star', role: 'MOD' }
  ];

  /* ---------- Helpers ---------- */
  function pickFrom(arr, rnd) { if(!arr || !arr.length) return null; return arr[Math.floor(rnd()*arr.length)]; }
  function renderTemplate(template, env){ return template.replace(/\{(\w+)\}/g, (m,k)=> env[k] !== undefined ? env[k] : m); }
  function fmtPrice(v){ return (Math.round(v*100)/100).toLocaleString(); }
  function fmtPercent(p){ return (Math.round(p*100)/100).toFixed(2) + '%'; }

  function randPriceForToken(token, rnd){
    let base = 100 * (1 + (token.charCodeAt(0) % 7));
    if(token === 'BTC') base = 30000;
    if(token === 'ETH') base = 2000;
    if(token === 'DOGE') base = 0.08;
    const jitter = (rnd()-0.5) * base * 0.12;
    return Math.max(0.0001, base + jitter);
  }

  // simple hash to numeric (for deterministic avatar provider selection)
  function simpleHashToInt(str){
    let h = 2166136261 >>> 0;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return h >>> 0;
  }

  // build avatar URL from name/seed deterministic across calls
  function buildAvatarFor(seed, fallbackIdx){
    const s = String(seed || '').trim() || ('user-' + Math.floor(Math.random()*100000));
    const idx = typeof fallbackIdx === 'number' ? (fallbackIdx % AVATAR_PROVIDERS.length) : (simpleHashToInt(s) % AVATAR_PROVIDERS.length);
    const tpl = AVATAR_PROVIDERS[idx];
    const out = tpl.replace('{seed}', encodeURIComponent(s));
    return out;
  }

  // FNV-ish content hash (fast, deterministic)
  function contentHash(s){
    let h = 2166136261 >>> 0;
    for(let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(16);
  }

  // small LRU for dedupe tracking
  function makeLRU(cap){
    const keys = [], set = new Set();
    return {
      has(k){ return set.has(k); },
      push(k){
        if(set.has(k)) return;
        keys.push(k); set.add(k);
        while(keys.length > cap){
          const rem = keys.shift(); set.delete(rem);
        }
      }
    };
  }

  /* ---------- MessagePool Implementation ---------- */
  const MessagePool = {
    messages: [],
    meta: Object.assign({}, DEFAULT),
    // cache for deterministic avatar per-sender
    _avatarCache: {},

    // generate message for index i deterministically
    _generateMessageForIndex(i, opts){
      opts = opts || {};
      const seedBase = Number(opts.seedBase || this.meta.seedBase || DEFAULT.seedBase);
      // per-index PRNG
      const rnd = xorshift32(seedBase + (i * 15721));

      // Optionally allow explicit startDate (ISO string or Date) to set earliest timestamp
      const explicitStart = opts.startDate ? (new Date(opts.startDate)).getTime() : null;

      // pick sender from SyntheticPeople if available
      let sender = null;
      const sp = (window.SyntheticPeople && Array.isArray(window.SyntheticPeople.people) && window.SyntheticPeople.people.length) ? window.SyntheticPeople : null;

      // admin/mod boost: occasionally use special members
      const useSpecial = rnd() < (opts.adminSpeakBoost || this.meta.adminSpeakBoost || DEFAULT.adminSpeakBoost);
      if(useSpecial){
        const s = SPECIAL_MEMBERS[Math.floor(rnd()*SPECIAL_MEMBERS.length)];
        sender = { name: s.name, displayName: s.displayName, role: s.role, avatar: '' };
      } else if(sp){
        const idx = Math.floor(rnd() * sp.people.length);
        sender = sp.people[idx];
      } else {
        sender = { name: 'Member_' + ((i % 5000) + 1), displayName: 'Member ' + ((i % 5000) + 1), role: 'VERIFIED', avatar: '' };
      }

      // ensure sender has deterministic avatar (if not supplied)
      try{
        if(!sender.avatar){
          if(!this._avatarCache[sender.name]){
            // produce per-sender avatar index to mix providers and avoid repeated dicebear-only
            const pickSeed = `${sender.name}-${seedBase}`;
            const pickIdx = simpleHashToInt(pickSeed) % AVATAR_PROVIDERS.length;
            this._avatarCache[sender.name] = buildAvatarFor(pickSeed, pickIdx);
          }
          sender.avatar = this._avatarCache[sender.name];
        }
      }catch(e){
        // fallback - do nothing
      }

      // template env
      const token = pickFrom(TOKENS, rnd);
      const indicator = pickFrom(INDICATORS, rnd);
      const timeframe = pickFrom(TIMEFRAMES, rnd);
      const order = pickFrom(ORDERS, rnd);

      const price = randPriceForToken(token, rnd);
      const tp = fmtPrice(price * (1 + (rnd()*0.08 + 0.02)));
      const stop = fmtPrice(price * (1 - (rnd()*0.12 + 0.01)));
      const pct = fmtPercent((rnd()-0.5) * 20);

      const env = { token, indicator, timeframe, order, tp, stop, pct };

      // choose template family
      const tPick = rnd();
      let text = '';
      if(tPick < 0.42){
        // direct phrase template
        const tpl = pickFrom(COMMON_PHRASES, rnd);
        text = renderTemplate(tpl, env);
      } else if(tPick < 0.72){
        // chatty/noisy message
        const words = Math.floor(rnd()*(this.meta.maxWords - this.meta.minWords) + this.meta.minWords);
        const parts = [];
        for(let w=0; w<words; w++){
          if(rnd() < 0.13) parts.push(pickFrom(TOKENS, rnd));
          else if(rnd() < 0.11) parts.push(pickFrom(EMOJI, rnd));
          else {
            parts.push(pickFrom(['check','signal','buy','sell','watch','nice','yikes','rekt','hold','wait','now','looks'], rnd));
          }
        }
        text = parts.join(' ');
      } else if(tPick < 0.87){
        // trade/report style
        text = `${(sender.displayName||sender.name).split(' ')[0]} posted: ${token} ${order} @ ${fmtPrice(price)} — TP ${tp} / SL ${stop} (${pct})`;
      } else {
        // question/callout
        const q = pickFrom(['Anyone got thoughts on {token}?','Who else is holding {token}?','Is {indicator} bearish on {timeframe}?','Just saw a whale move on {token}'], rnd);
        text = renderTemplate(q, env);
      }

      // attachments
      const hasAttachment = rnd() < (opts.attachmentFraction || this.meta.attachmentFraction);
      const attachment = hasAttachment ? pickFrom(ATTACH_TITLES, rnd) : null;

      // replies (deterministic earlier index)
      const isReply = rnd() < (opts.replyFraction || this.meta.replyFraction);
      let replyTo = null;
      if(isReply && i > 8){
        const offset = 2 + Math.floor(rnd() * Math.min(500, i - 2));
        replyTo = 'msg_' + (i - offset);
      }

      // pinned (rare)
      const pinned = rnd() < (opts.pinnedFraction || this.meta.pinnedFraction);

      // timestamp distribution across spanDays or explicit startDate
      const now = Date.now();
      const spanDays = Number(opts.spanDays || this.meta.spanDays || DEFAULT.spanDays);
      const frac = i / Math.max(1, (opts.size || this.meta.size || DEFAULT.size));
      const earliest = explicitStart !== null ? explicitStart : (now - spanDays * 86400000);
      const jitter = (rnd() - 0.5) * 3600000; // up to ±1h jitter
      const time = Math.round(earliest + frac * (spanDays * 86400000) + jitter);

      // small safety: ensure not tiny text
      if(text.length < 6) text += ' ' + pickFrom(EMOJI, rnd);

      // final message object
      const msg = {
        id: 'msg_' + (i+1),
        name: sender.name || sender.displayName || ('Member_' + ((i%5000)+1)),
        displayName: sender.displayName || sender.name,
        role: sender.role || 'VERIFIED',
        avatar: sender.avatar || '',
        text: text,
        out: false,
        time: time,
        replyTo: replyTo,
        pinned: pinned,
        attachment: hasAttachment ? { filename: attachment, url: (/\.(png|jpe?g)$/i.test(attachment || '') ? 'assets/' + attachment : '') } : null
      };

      return msg;
    },

    // generate the full pool (dedupe LRU applied)
    generatePool(opts){
      opts = opts || {};
      const size = clamp(Number(opts.size || this.meta.size || DEFAULT.size), 50, 500000);
      const seedBase = Number(opts.seedBase || this.meta.seedBase || DEFAULT.seedBase);
      const spanDays = Number(opts.spanDays || this.meta.spanDays || DEFAULT.spanDays);

      // accept optional explicit startDate (ISO or Date)
      if(opts.startDate){
        try{ opts.startDate = new Date(opts.startDate).toISOString(); }catch(e){ delete opts.startDate; }
      }

      this.meta.size = size;
      this.meta.seedBase = seedBase;
      this.meta.spanDays = spanDays;

      const lru = makeLRU(4096); // larger LRU to reduce duplicates further
      const arr = new Array(size);
      for(let i=0;i<size;i++){
        let m = this._generateMessageForIndex(i, Object.assign({}, opts, { size, seedBase, spanDays }));
        // dedupe attempts - increased attempts to reduce repeats
        let attempts = 0;
        let h = contentHash(m.text);
        while(lru.has(h) && attempts < 10){
          // regenerate with slight seed tweak to vary wording
          const alt = this._generateMessageForIndex(i + attempts + 1, { size, seedBase: seedBase + attempts + 1, spanDays, startDate: opts.startDate });
          // ensure alt exists
          if(alt && alt.text){
            // append a small qualifier or emoji to vary content deterministically
            const rnd = xorshift32(seedBase + attempts + i);
            m.text = alt.text + ((attempts % 2 === 0) ? (' ' + pickFrom(EMOJI, rnd)) : (' · ' + pickFrom(TOKENS, rnd)));
          } else {
            m.text = m.text + ' ' + Math.random().toString(36).slice(2,5);
          }
          h = contentHash(m.text);
          attempts++;
        }
        lru.push(h);
        arr[i] = m;
      }

      this.messages = arr;
      // id -> index quick map
      this._idIndex = {};
      for(let i=0;i<this.messages.length;i++) this._idIndex[this.messages[i].id] = i;
      return this.messages;
    },

    // regenerate & optionally inject an initial window into UI
    async regenerateAndInject(opts){
      opts = opts || {};
      const pool = this.generatePool(opts);
      if(opts.inject && typeof window.renderMessage === 'function'){
        const initial = Math.min(pool.length, opts.initialCount || 40);
        for(let i=0;i<initial;i++){
          try{ window.renderMessage(pool[i], false); }catch(e){ console.warn('renderMessage failed', e); }
        }
      }
      return pool;
    },

    // getters
    getMessageByIndex(i){ if(!this.messages || !this.messages.length) return null; if(i<0||i>=this.messages.length) return null; return this.messages[i]; },
    getRange(start, count){ if(!this.messages || !this.messages.length) return []; start = clamp(start,0, Math.max(0,this.messages.length-1)); count = clamp(count,0,this.messages.length-start); return this.messages.slice(start, start+count); },
    pickRandom(filter){ const pool = filter ? this.messages.filter(filter) : this.messages; if(!pool || !pool.length) return null; return pool[Math.floor(Math.random()*pool.length)]; },

    // stream messages to UI like a live feed
    // opts: { startIndex, ratePerMin, jitterMs, onEmit(msg,idx) }
    streamToUI(opts){
      opts = opts || {};
      if(!this.messages || !this.messages.length){
        console.warn('MessagePool.streamToUI: no messages generated yet.');
        return { stop: ()=>{} };
      }
      const start = clamp(Number(opts.startIndex || 0), 0, this.messages.length-1);
      const ratePerMin = clamp(Number(opts.ratePerMin || 45), 1, 2000); // default 45/min
      const intervalMs = Math.round(60000 / ratePerMin); // careful bucket math
      const jitter = Number(opts.jitterMs || Math.round(intervalMs * 0.25));
      let idx = start;
      let stopped = false;
      const timer = setInterval(()=>{
        if(stopped) return;
        const m = this.messages[idx];
        if(m){
          try{ window.renderMessage(m, true); }catch(e){ console.warn('renderMessage error', e); }
          if(typeof opts.onEmit === 'function') opts.onEmit(m, idx);
        }
        idx++;
        if(idx >= this.messages.length){
          // loop but start at random offset to avoid immediate repeat patterns
          idx = Math.max(0, Math.floor(Math.random() * Math.min(1000, this.messages.length)));
        }
      }, Math.max(20, intervalMs + (Math.random() * jitter - jitter/2)));

      return { stop: function(){ stopped = true; clearInterval(timer); } };
    },

    // export to JSON (careful — large)
    exportToJSON(opts){ opts = opts || {}; const start = clamp(Number(opts.start || 0), 0, this.messages.length); const end = clamp(Number(opts.end || this.messages.length), start, this.messages.length); return JSON.stringify(this.messages.slice(start,end)); },

    findById(id){ return (this._idIndex && this._idIndex[id] !== undefined) ? this.messages[this._idIndex[id]] : null; },

    // estimate pool size needed for a given duration and rate (useful for planning non-duplicate coverage)
    // msgsPerMin: average messages per minute; durationDays: total days to cover; avgMsgsPerPersonPerDay: expected messages per person/day
    estimatePoolForDuration({ msgsPerMin = 45, durationDays = 365 * 2, avgMsgsPerPersonPerDay = 5 } = {}){
      const totalMsgs = msgsPerMin * 60 * 24 * durationDays; // total messages over period
      const estimatedPeople = Math.ceil(totalMsgs / (avgMsgsPerPersonPerDay * durationDays));
      return { totalMsgs, estimatedPeople };
    },

    // pre-generate templated sentence fragments to inspect variety (no full pool allocation)
    preGenerateTemplates(count, opts){
      opts = opts || {};
      const size = clamp(Number(count) || 500, 1, 200000);
      const seedBase = Number(opts.seedBase || this.meta.seedBase || DEFAULT.seedBase);
      const out = [];
      for(let i=0;i<size;i++){
        const m = this._generateMessageForIndex(i, { size, seedBase, spanDays: opts.spanDays || this.meta.spanDays });
        out.push(m.text);
      }
      return out;
    },

    /* ---------- Memory-light paging view for large pools ---------- */
    createGeneratorView(opts){
      opts = opts || {};
      const pageSize = Math.max(1, Number(opts.pageSize || 200));
      const seedBase = (opts.seedBase !== undefined) ? Number(opts.seedBase) : (this.meta && this.meta.seedBase) || DEFAULT.seedBase;
      const spanDays = (opts.spanDays !== undefined) ? Number(opts.spanDays) : (this.meta && this.meta.spanDays) || DEFAULT.spanDays;
      const cachePagesMax = Math.max(3, Number(opts.cachePages || 12));
      const allowWrap = !!opts.allowWrap; // if true, nextPage will wrap to 0 when past end (optional)

      // attempt to determine total size if possible
      const totalSize = (this.messages && this.messages.length) ? this.messages.length : (this.meta && this.meta.size) ? Number(this.meta.size) : null;

      // LRU page cache (key = pageStartIndex)
      const pageOrder = []; // queue of keys oldest -> newest
      const pageCache = new Map();

      function pushCache(key, page){
        if(pageCache.has(key)) return;
        pageCache.set(key, page);
        pageOrder.push(key);
        while(pageOrder.length > cachePagesMax){
          const rem = pageOrder.shift();
          pageCache.delete(rem);
        }
      }
      function touchCache(key){
        const i = pageOrder.indexOf(key);
        if(i !== -1){
          pageOrder.splice(i,1);
          pageOrder.push(key);
        }
      }

      // internal generator for a single index using the MessagePool's own generator
      function genMessageAt(index){
        // clamp to integer
        index = Math.max(0, Math.floor(Number(index) || 0));
        // respect known totalSize
        if(totalSize !== null && index >= totalSize){
          if(allowWrap) index = index % totalSize;
          else return null;
        }
        // prefer existing in-memory pool if present
        if(Array.isArray(this.messages) && this.messages.length && this.messages[index]){
          return this.messages[index];
        }
        // call internal generator (keeps deterministic behavior)
        if(typeof this._generateMessageForIndex === 'function'){
          return this._generateMessageForIndex(index, { size: totalSize || undefined, seedBase: seedBase, spanDays: spanDays });
        }
        // last resort: null
        return null;
      }

      // build a page starting at absolute index `start`
      const makePage = (start) => {
        start = Math.max(0, Math.floor(Number(start) || 0));
        // if we know totalSize and start >= totalSize, optionally wrap
        if(totalSize !== null && start >= totalSize){
          if(allowWrap) start = start % totalSize;
          else return [];
        }
        const out = [];
        for(let i=0;i<pageSize;i++){
          let idx = start + i;
          if(totalSize !== null){
            if(idx >= totalSize){
              if(allowWrap) idx = idx % totalSize;
              else break;
            }
          }
          const m = genMessageAt.call(this, idx);
          if(!m) break;
          out.push(m);
        }
        return out;
      };

      const self = this; // preserve MessagePool context

      return {
        pageSize,
        totalSize,

        // get a single message (sync). Uses cache if page exists, otherwise generates inline.
        get(index){
          index = Math.max(0, Math.floor(Number(index) || 0));
          const pageStart = Math.floor(index / pageSize) * pageSize;
          if(pageCache.has(pageStart)){
            touchCache(pageStart);
            const page = pageCache.get(pageStart);
            return page[index - pageStart] || null;
          }
          // try to generate the single message inline (cheaper than full page)
          try{
            return genMessageAt.call(self, index);
          }catch(e){
            console.warn('createGeneratorView.get failed for index', index, e);
            return null;
          }
        },

        // return a page array for start index (synchronous). Caches result.
        nextPage(startIndex){
          startIndex = Math.max(0, Math.floor(Number(startIndex) || 0));
          const pageStart = Math.floor(startIndex / pageSize) * pageSize;
          if(pageCache.has(pageStart)){
            touchCache(pageStart);
            return pageCache.get(pageStart).slice(); // return shallow copy
          }
          try{
            const page = makePage.call(self, pageStart);
            pushCache(pageStart, page);
            return page.slice();
          }catch(e){
            console.warn('createGeneratorView.nextPage failed for', pageStart, e);
            return [];
          }
        },

        // prefetch N pages starting at startIndex (helpful to warm cache)
        prefetch(startIndex, pages){
          startIndex = Math.max(0, Math.floor(Number(startIndex) || 0));
          pages = Math.max(1, Math.floor(Number(pages) || 1));
          const results = [];
          for(let p=0;p<pages;p++){
            const s = startIndex + p * pageSize;
            const page = this.nextPage(s);
            results.push(page);
          }
          return results;
        },

        // clear page cache
        clearCache(){
          pageCache.clear();
          pageOrder.length = 0;
        },

        // info for debugging
        info(){
          return {
            pageSize,
            totalSize,
            cachedPages: pageOrder.slice(),
            cacheCount: pageOrder.length
          };
        }
      };
    } // end createGeneratorView

  }; // end MessagePool object

  // attach globally
  window.MessagePool = MessagePool;

  // quick sanity: if SyntheticPeople exists and message pool empty, create a small sample preview
  setTimeout(()=>{
    try{
      if(window.SyntheticPeople && (!window.MessagePool.messages || !window.MessagePool.messages.length)){
        MessagePool.generatePool({ size: 500, seedBase: MessagePool.meta.seedBase, spanDays: MessagePool.meta.spanDays });
        if(window.renderMessage){
          const initial = Math.min(20, MessagePool.messages.length);
          for(let i=0;i<initial;i++) try{ window.renderMessage(MessagePool.messages[i], false); }catch(e){}
        }
      }
    }catch(e){
      console.warn('MessagePool auto-sanity failed', e);
    }
  }, 250);

})();
