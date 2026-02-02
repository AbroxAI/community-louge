// synthetic-people.js
// Lightweight synthetic people generator with mixed avatar providers
(function SyntheticPeopleIIFE(){
  if(window.SyntheticPeople) return;

  function uid(n){ return 'p_' + Math.random().toString(36).slice(2,9); }

  const DEFAULT = { size: 4872, seedBase: 2026 };

  // simple seeded RNG
  function xorshift32(seed){ let x = (seed>>>0) || 0x811c9dc5; return function(){ x|=0; x ^= x<<13; x>>>=0; x ^= x>>>17; x>>>=0; x ^= x<<5; x>>>=0; return (x>>>0)/4294967296; }; }

  function pick(arr, rnd){ return arr[Math.floor(rnd()*arr.length)]; }

  // avatar mix providers (deterministic pick by index)
  function makeAvatar(name, idx){
    const enc = encodeURIComponent(name || ('u'+idx));
    const prov = idx % 4;
    switch(prov){
      case 0: return `https://api.dicebear.com/6.x/miniavs/svg?seed=${enc}`;
      case 1: return `https://api.dicebear.com/6.x/identicon/svg?seed=${enc}`;
      case 2: return `https://api.multiavatar.com/${enc}.png`;
      default: return `https://api.dicebear.com/6.x/pixel-art/svg?seed=${enc}`;
    }
  }

  const SyntheticPeople = {
    people: [],
    meta: Object.assign({}, DEFAULT),

    generatePool(opts){
      opts = opts || {};
      const size = Math.max(10, Number(opts.size || this.meta.size || DEFAULT.size));
      const seedBase = Number(opts.seedBase || this.meta.seedBase || DEFAULT.seedBase);
      this.meta.size = size; this.meta.seedBase = seedBase;
      const rnd = xorshift32(seedBase);
      const names = ['Profit Hunters','Kitty Star','Trader Joe','Luna','Rex','Maya','Zed','Nina','Omar','Kofi','Sage','Ava','Noah','Liam','Olivia'];
      this.people = [];
      for(let i=0;i<size;i++){
        const name = (i<names.length) ? names[i] + (i===0? '':' #' + (i+1)) : ('Member ' + (i+1));
        const role = (name.indexOf('Profit Hunters')!==-1) ? 'ADMIN' : (name.indexOf('Kitty Star')!==-1 ? 'MOD' : (rnd() < 0.01 ? 'MOD' : 'VERIFIED'));
        const p = {
          id: uid(i),
          name: name.replace(/\s/g,'_'),
          displayName: name,
          role: role,
          avatar: makeAvatar(name, i),
          lastActive: Date.now() - Math.round(rnd()*1000*60*60*48) // within last 48h
        };
        this.people.push(p);
      }
      return this.people;
    },

    exportForSimulation(){
      // limited export for UI consumption
      return (this.people || []).slice(0, 500).map(p => ({ id: p.id, displayName: p.displayName, avatar: p.avatar, role: p.role, lastActive: p.lastActive }));
    },

    simulatePresenceStep(opts){
      opts = opts || {}; const pct = Number(opts.percent || 0.01);
      if(!this.people || !this.people.length) return;
      for(let i=0;i<Math.max(1, Math.round(this.people.length * pct)); i++){
        const idx = Math.floor(Math.random()*this.people.length);
        this.people[idx].lastActive = Date.now() - Math.round(Math.random()*1000*60*5); // recent
      }
    }
  };

  window.SyntheticPeople = SyntheticPeople;
  // auto-generate small set for preview
  setTimeout(()=>{ try{ SyntheticPeople.generatePool({ size: Math.min(500, SyntheticPeople.meta.size) }); }catch(e){} }, 60);

  console.info('SyntheticPeople loaded');
})();
