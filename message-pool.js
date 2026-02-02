// message-pool.js
// Deterministic message pool with createGeneratorView
(function globalMessagePool(){
  if(window.MessagePool) return;

  function xorshift32(seed){ let x=(seed>>>0)||0x811c9dc5; return function(){ x|=0; x^=x<<13; x>>>=0; x^=x>>>17; x>>>=0; x^=x<<5; x>>>=0; return (x>>>0)/4294967296; }; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function pickFrom(arr, rnd){ if(!arr||!arr.length) return null; return arr[Math.floor(rnd()*arr.length)]; }

  const TOKENS=['BTC','ETH','SOL','LTC','DOGE','XRP','ADA','BNB','MATIC','AVAX'];
  const COMMON_PHRASES=['Anyone watching {token}?','Set a stop at {stop}.','TP at {tp}.','FOMO incoming 🚀','Diamond hands.','Paper hands everywhere 😅'];
  const EMOJI=['🚀','💎','🔥','📉','📈','🤖','🔒','⚠️','✅','❌','🐳'];

  const DEFAULT = { size:100000, seedBase:4000, spanDays:730, minWords:4, maxWords:20, replyFraction:0.06, attachmentFraction:0.04, pinnedFraction:0.0008 };

  function renderTemplate(t, env){ return t.replace(/\{(\w+)\}/g,(m,k)=> env[k]!==undefined?env[k]:m); }
  function fmtPrice(v){ return (Math.round(v*100)/100).toLocaleString(); }

  function randPriceForToken(token, rnd){ let base = 100*(1 + (token.charCodeAt(0)%7)); if(token==='BTC') base=30000; if(token==='ETH') base=2000; const jitter=(rnd()-0.5)*base*0.12; return Math.max(0.0001, base + jitter); }

  function contentHash(s){ let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h += (h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24); } return (h>>>0).toString(16); }
  function makeLRU(cap){ const keys=[], set=new Set(); return { has(k){return set.has(k);}, push(k){ if(set.has(k)) return; keys.push(k); set.add(k); while(keys.length>cap){ const rem=keys.shift(); set.delete(rem); } } };

  const MessagePool = {
    messages: [],
    meta: Object.assign({}, DEFAULT),

    _generateMessageForIndex(i, opts){
      opts = opts || {};
      const seedBase = Number(opts.seedBase || this.meta.seedBase || DEFAULT.seedBase);
      const rnd = xorshift32(seedBase + (i * 15721));

      let sender = { name: 'Member_' + ((i%5000)+1), displayName: 'Member ' + ((i%5000)+1), role: 'VERIFIED', avatar: '' };
      if(window.SyntheticPeople && Array.isArray(window.SyntheticPeople.people) && window.SyntheticPeople.people.length){ const sp = window.SyntheticPeople.people; const idx = Math.floor(rnd()*sp.length); sender = sp[idx]; }

      const token = pickFrom(TOKENS, rnd);
      const price = randPriceForToken(token, rnd);
      const tp = fmtPrice(price*(1+(rnd()*0.08+0.02)));
      const stop = fmtPrice(price*(1-(rnd()*0.12+0.01)));
      const env = { token, tp, stop };

      const tPick = rnd(); let text='';
      if(tPick < 0.45){ text = renderTemplate(pickFrom(COMMON_PHRASES, rnd), env); }
      else if(tPick < 0.78){ const words = Math.floor(rnd()*(this.meta.maxWords - this.meta.minWords) + this.meta.minWords); const parts=[]; for(let w=0; w<words; w++){ if(rnd() < 0.13) parts.push(pickFrom(TOKENS, rnd)); else if(rnd() < 0.11) parts.push(pickFrom(EMOJI, rnd)); else parts.push(pickFrom(['check','signal','buy','sell','watch','nice','yikes','rekt','hold','wait','now','looks'], rnd)); } text = parts.join(' '); }
      else { text = `${sender.displayName.split(' ')[0]} posted: ${token} @ ${fmtPrice(price)} — TP ${tp} / SL ${stop}`; }

      const hasAttachment = rnd() < (opts.attachmentFraction || this.meta.attachmentFraction);
      const attachment = hasAttachment ? { filename: 'attachment_' + (i+1) + '.png', url: (hasAttachment?('assets/attachment_'+((i%5)+1)+'.png') : null) } : null;

      const isReply = rnd() < (opts.replyFraction || this.meta.replyFraction);
      let replyTo = null; if(isReply && i>8){ const offset = 2 + Math.floor(rnd()*Math.min(500, i-2)); replyTo = 'msg_' + (i-offset); }

      const pinned = rnd() < (opts.pinnedFraction || this.meta.pinnedFraction);
      const now = Date.now(); const spanDays = Number(opts.spanDays || this.meta.spanDays || DEFAULT.spanDays); const frac = i / Math.max(1, (opts.size || this.meta.size || DEFAULT.size)); const earliest = now - spanDays * 86400000; const jitter = (rnd()-0.5) * 3600000; const time = Math.round(earliest + frac * (spanDays * 86400000) + jitter);

      if(text.length < 6) text += ' ' + pickFrom(EMOJI, rnd);

      return { id: 'msg_' + (i+1), name: sender.name||sender.displayName, displayName: sender.displayName||sender.name, role: sender.role||'VERIFIED', avatar: sender.avatar||'', text, out:false, time, replyTo, pinned, attachment };
    },

    generatePool(opts){ opts = opts || {}; const size = clamp(Number(opts.size || this.meta.size || DEFAULT.size), 50, 500000); const seedBase = Number(opts.seedBase || this.meta.seedBase || DEFAULT.seedBase); const spanDays = Number(opts.spanDays || this.meta.spanDays || DEFAULT.spanDays); this.meta.size = size; this.meta.seedBase = seedBase; this.meta.spanDays = spanDays; const lru = makeLRU(2048); const arr = new Array(size); for(let i=0;i<size;i++){ let m = this._generateMessageForIndex(i, { size, seedBase, spanDays, replyFraction: this.meta.replyFraction, attachmentFraction: this.meta.attachmentFraction }); let attempts=0; let h=contentHash(m.text); while(lru.has(h) && attempts<6){ const alt = this._generateMessageForIndex(i+attempts+1, { size, seedBase: seedBase + attempts + 1, spanDays }); m.text = alt.text + ((attempts%2===0)?(' '+pickFrom(EMOJI, xorshift32(seedBase+attempts+i))):''); h = contentHash(m.text); attempts++; } lru.push(h); arr[i]=m; }
      this.messages = arr; this._idIndex = {}; for(let i=0;i<this.messages.length;i++) this._idIndex[this.messages[i].id] = i; return this.messages; },

    async regenerateAndInject(opts){ opts = opts || {}; const pool = this.generatePool(opts); if(opts.inject && typeof window.renderMessage === 'function'){ const initial = Math.min(pool.length, opts.initialCount || 40); for(let i=0;i<initial;i++){ try{ window.renderMessage(pool[i], false); }catch(e){ console.warn('renderMessage failed', e); } } } return pool; },

    getMessageByIndex(i){ if(!this.messages||!this.messages.length) return null; if(i<0||i>=this.messages.length) return null; return this.messages[i]; },
    getRange(start,count){ if(!this.messages||!this.messages.length) return []; start = clamp(start,0, Math.max(0,this.messages.length-1)); count = clamp(count,0,this.messages.length-start); return this.messages.slice(start, start+count); },
    pickRandom(filter){ const pool = filter?this.messages.filter(filter):this.messages; if(!pool||!pool.length) return null; return pool[Math.floor(Math.random()*pool.length)]; },

    streamToUI(opts){ opts = opts||{}; if(!this.messages||!this.messages.length){ console.warn('MessagePool.streamToUI: no messages generated yet.'); return { stop: ()=>{} }; } const start = clamp(Number(opts.startIndex||0),0,this.messages.length-1); const ratePerMin = clamp(Number(opts.ratePerMin||45),1,2000); const intervalMs = Math.round(60000/ratePerMin); const jitter = Number(opts.jitterMs || Math.round(intervalMs*0.25)); let idx=start; let stopped=false; const timer = setInterval(()=>{ if(stopped) return; const m=this.messages[idx]; if(m){ try{ window.renderMessage(m, true); }catch(e){ console.warn('renderMessage error', e); } if(typeof opts.onEmit === 'function') opts.onEmit(m, idx); } idx++; if(idx>=this.messages.length){ idx = Math.max(0, Math.floor(Math.random()*Math.min(1000,this.messages.length))); } }, Math.max(20, intervalMs + (Math.random()*jitter - jitter/2))); return { stop: function(){ stopped=true; clearInterval(timer); } }; },

    exportToJSON(opts){ opts=opts||{}; const start = clamp(Number(opts.start||0),0,this.messages.length); const end = clamp(Number(opts.end||this.messages.length), start, this.messages.length); return JSON.stringify(this.messages.slice(start,end)); },
    findById(id){ return (this._idIndex && this._idIndex[id] !== undefined) ? this.messages[this._idIndex[id]] : null; },

    estimatePoolForDuration({ msgsPerMin = 45, durationDays = 365*2, avgMsgsPerPersonPerDay = 5 } = {}){ const totalMsgs = msgsPerMin * 60 * 24 * durationDays; const estimatedPeople = Math.ceil(totalMsgs / (avgMsgsPerPersonPerDay * durationDays)); return { totalMsgs, estimatedPeople }; },

    preGenerateTemplates(count, opts){ opts = opts || {}; const size = clamp(Number(count)||500,1,200000); const seedBase = Number(opts.seedBase || this.meta.seedBase || DEFAULT.seedBase); const out = []; for(let i=0;i<size;i++){ const m = this._generateMessageForIndex(i, { size, seedBase, spanDays: opts.spanDays || this.meta.spanDays }); out.push(m.text); } return out; },

    createGeneratorView(opts){ opts = opts || {}; const pageSize = Math.max(1, Number(opts.pageSize || 200)); const seedBase = (opts.seedBase !== undefined) ? Number(opts.seedBase) : (this.meta && this.meta.seedBase) || DEFAULT.seedBase; const spanDays = (opts.spanDays !== undefined) ? Number(opts.spanDays) : (this.meta && this.meta.spanDays) || DEFAULT.spanDays; const cachePagesMax = Math.max(3, Number(opts.cachePages || 12)); const allowWrap = !!opts.allowWrap; const totalSize = (this.messages && this.messages.length) ? this.messages.length : (this.meta && this.meta.size) ? Number(this.meta.size) : null; const pageOrder = []; const pageCache = new Map(); function pushCache(key,page){ if(pageCache.has(key)) return; pageCache.set(key,page); pageOrder.push(key); while(pageOrder.length>cachePagesMax){ const rem = pageOrder.shift(); pageCache.delete(rem); } } function touchCache(key){ const i = pageOrder.indexOf(key); if(i!==-1){ pageOrder.splice(i,1); pageOrder.push(key); } }
      function genMessageAt(index){ index = Math.max(0, Math.floor(Number(index)||0)); if(totalSize !== null && index >= totalSize){ if(allowWrap) index = index % totalSize; else return null; } if(Array.isArray(this.messages) && this.messages.length && this.messages[index]){ return this.messages[index]; } if(typeof this._generateMessageForIndex === 'function'){ return this._generateMessageForIndex(index, { size: totalSize || undefined, seedBase: seedBase, spanDays: spanDays }); } return null; }
      const makePage = (start) => { start = Math.max(0, Math.floor(Number(start)||0)); if(totalSize !== null && start >= totalSize){ if(allowWrap) start = start % totalSize; else return []; } const out = []; for(let i=0;i<pageSize;i++){ let idx = start + i; if(totalSize !== null){ if(idx >= totalSize){ if(allowWrap) idx = idx % totalSize; else break; } } const m = genMessageAt.call(this, idx); if(!m) break; out.push(m); } return out; };
      const self = this;
      return {
        pageSize,
        totalSize,
        get(index){ index = Math.max(0, Math.floor(Number(index)||0)); const pageStart = Math.floor(index/pageSize) * pageSize; if(pageCache.has(pageStart)){ touchCache(pageStart); const page = pageCache.get(pageStart); return page[index - pageStart] || null; } try{ return genMessageAt.call(self, index); }catch(e){ console.warn('createGeneratorView.get failed for index', index, e); return null; } },
        nextPage(startIndex){ startIndex = Math.max(0, Math.floor(Number(startIndex)||0)); const pageStart = Math.floor(startIndex/pageSize) * pageSize; if(pageCache.has(pageStart)){ touchCache(pageStart); return pageCache.get(pageStart).slice(); } try{ const page = makePage.call(self, pageStart); pushCache(pageStart, page); return page.slice(); }catch(e){ console.warn('createGeneratorView.nextPage failed for', pageStart, e); return []; } },
        prefetch(startIndex,pages){ startIndex = Math.max(0, Math.floor(Number(startIndex)||0)); pages = Math.max(1, Math.floor(Number(pages)||1)); const results = []; for(let p=0;p<pages;p++){ const s = startIndex + p*pageSize; const page = this.nextPage(s); results.push(page); } return results; },
        clearCache(){ pageCache.clear(); pageOrder.length = 0; },
        info(){ return { pageSize, totalSize, cachedPages: pageOrder.slice(), cacheCount: pageOrder.length }; }
      };
    }
  };

  window.MessagePool = MessagePool;

  // quick sanity preview
  setTimeout(()=>{ try{ if(window.SyntheticPeople && (!window.MessagePool.messages || !window.MessagePool.messages.length)){ MessagePool.generatePool({ size:500, seedBase: MessagePool.meta.seedBase, spanDays: MessagePool.meta.spanDays }); if(window.renderMessage){ const initial = Math.min(20, MessagePool.messages.length); for(let i=0;i<initial;i++) try{ window.renderMessage(MessagePool.messages[i], false); }catch(e){} } } }catch(e){ console.warn('MessagePool auto-sanity failed', e); } }, 250);

  console.info('MessagePool loaded');
})();
