// synthetic-people.js
// Lightweight synthetic people generator with mixed avatar providers
(function SyntheticPeopleIIFE(){
  if(window.SyntheticPeople) return;

  // deterministic xorshift32 RNG factory
  function xorshift32(seed){ let x = (seed>>>0) || 0x811c9dc5; return function(){ x|=0; x ^= x<<13; x>>>=0; x ^= x>>>17; x>>>=0; x ^= x<<5; x>>>=0; return (x>>>0)/4294967296; }; }

  // deterministic simple hash -> int
  function simpleHashToInt(str){
    let h = 2166136261 >>> 0;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return h >>> 0;
  }

  // seeded uid (deterministic by index+seed)
  function seededUid(index, seed){
    const s = 'p_' + String(seed) + '_' + String(index);
    return 'p_' + (simpleHashToInt(s).toString(36));
  }

  // default meta
  const DEFAULT = { size: 4872, seedBase: 2026, spanDays: 365 };

  // avatar provider templates (5 providers for variety)
  const AVATAR_PROVIDERS = [
    'https://api.dicebear.com/8.x/thumbs/svg?seed={seed}',
    'https://api.dicebear.com/8.x/identicon/svg?seed={seed}',
    'https://api.multiavatar.com/{seed}.png',
    'https://ui-avatars.com/api/?name={seed}&background=111827&color=ffffff&bold=true',
    'https://robohash.org/{seed}.png?set=set4'
  ];

  function buildAvatar(name, idx){
    const seed = encodeURIComponent(name || ('user' + idx));
    const provIdx = (simpleHashToInt(name || String(idx)) + idx) % AVATAR_PROVIDERS.length;
    const tpl = AVATAR_PROVIDERS[provIdx];
    return tpl.replace('{seed}', seed);
  }

  // curated name lists with gender hint to reduce mismatch rendering
  const MALE = ['Trader Joe','Rex','Omar','Kofi','Noah','Liam','Zed','Ethan','Daniel','Samuel','Ahmed','Ibrahim','Mike','Carlos','David'];
  const FEMALE = ['Luna','Maya','Nina','Ava','Olivia','Zara','Amara','Sophie','Yara','Mia','Chloe','Lola','Aisha','Hana','Leah'];
  const NEUTRAL = ['Sage','Sky','River','Jules','Rowan','Casey','Alex','Kai','Chris','Sam'];

  // special admin/mod accounts (fixed)
  const SPECIAL = [
    { name: 'profit_hunters', displayName: 'Profit Hunters', role: 'ADMIN' },
    { name: 'kitty_star', displayName: 'Kitty Star', role: 'MOD' }
  ];

  // helper to pick deterministic from array using seeded rnd
  function pickWithRnd(arr, rnd){ return arr[Math.floor(rnd()*arr.length)]; }

  const SyntheticPeople = {
    people: [],
    meta: Object.assign({}, DEFAULT),

    // generate pool deterministically; opts: { size, seedBase, spanDays, startDate }
    generatePool(opts){
      opts = opts || {};
      const size = Math.max(10, Number(opts.size || this.meta.size || DEFAULT.size));
      const seedBase = Number(opts.seedBase || this.meta.seedBase || DEFAULT.seedBase);
      const spanDays = Number(opts.spanDays || this.meta.spanDays || DEFAULT.spanDays);

      this.meta.size = size;
      this.meta.seedBase = seedBase;
      this.meta.spanDays = spanDays;

      const rnd = xorshift32(seedBase);

      // build baseline name pool mixing curated lists
      const namePool = [];
      // ensure SPECIAL come first
      SPECIAL.forEach(s => namePool.push({ displayName: s.displayName, nameKey: s.name, role: s.role, gender: null }));
      // fill from male/female/neutral lists repeatedly to reach requested variety
      let i = 0;
      while(namePool.length < Math.max(size, 120)){
        const sourceRoll = Math.floor(rnd()*3);
        let displayName;
        if(sourceRoll === 0) displayName = MALE[i % MALE.length] + (Math.floor(i/MALE.length) ? ' #' + (Math.floor(i/MALE.length)+1) : '');
        else if(sourceRoll === 1) displayName = FEMALE[i % FEMALE.length] + (Math.floor(i/FEMALE.length) ? ' #' + (Math.floor(i/FEMALE.length)+1) : '');
        else displayName = NEUTRAL[i % NEUTRAL.length] + (Math.floor(i/NEUTRAL.length) ? ' #' + (Math.floor(i/NEUTRAL.length)+1) : '');
        namePool.push({ displayName, nameKey: displayName.replace(/\s+/g,'_').toLowerCase(), role: 'VERIFIED', gender: (sourceRoll===0?'male':(sourceRoll===1?'female':'neutral')) });
        i++;
      }

      // now build people array deterministically
      const people = new Array(size);
      const now = Date.now();
      const earliest = (opts.startDate ? (new Date(opts.startDate)).getTime() : (now - spanDays * 86400000));

      for(let idx=0; idx<size; idx++){
        // pick from namePool deterministically
        const pickIdx = Math.floor(rnd() * namePool.length);
        const base = namePool[pickIdx];

        // ensure the first two special slots are the fixed admin/mod
        let role = base.role || 'VERIFIED';
        let displayName = base.displayName;
        let nameKey = base.nameKey || displayName.replace(/\s+/g,'_').toLowerCase();

        // Small deterministic suffix to avoid repeated exact display names in large pools
        const suffixRoll = Math.floor(rnd()*1000);
        if(idx >= SPECIAL.length){
          // Append a numeric suffix occasionally for realism on common names
          if(suffixRoll < 6) { displayName = displayName + ' #' + (Math.floor(idx/100)+1); nameKey = displayName.replace(/\s+/g,'_').toLowerCase(); }
          else if(suffixRoll > 995) { displayName = displayName + ' Jr'; nameKey = displayName.replace(/\s+/g,'_').toLowerCase(); }
        }

        // deterministic id & avatar
        const id = seededUid(idx, seedBase);
        const avatar = buildAvatar(displayName, idx);

        // deterministic lastActive spread across spanDays (more recent bias)
        // use rnd twice to get skew
        const skew = Math.pow(rnd(), 2); // bias to recent
        const lastActive = Math.round(earliest + skew * (now - earliest));

        // role occasionally elevated to MOD (rare) except for special ones already set
        if(role === 'VERIFIED' && rnd() < 0.008) role = 'MOD';

        people[idx] = {
          id: id,
          name: nameKey,
          displayName: displayName,
          role: role,
          avatar: avatar,
          lastActive: lastActive
        };
      }

      // If SPECIAL entries exist, ensure they are present and have deterministic avatars & roles
      SPECIAL.forEach((s, pos) => {
        if(pos < people.length){
          people[pos].name = s.name;
          people[pos].displayName = s.displayName;
          people[pos].role = s.role;
          // deterministic avatar for special using their name + seed
          people[pos].avatar = buildAvatar(s.displayName + '_' + seedBase, pos);
        } else {
          // if size too small, push them
          people.unshift({
            id: seededUid(- (pos+1), seedBase),
            name: s.name,
            displayName: s.displayName,
            role: s.role,
            avatar: buildAvatar(s.displayName + '_' + seedBase, pos),
            lastActive: now
          });
        }
      });

      // finalize
      this.people = people;
      return this.people;
    },

    // limited export for UI consumption (same contract)
    exportForSimulation(){
      return (this.people || []).slice(0, 500).map(p => ({ id: p.id, displayName: p.displayName, avatar: p.avatar, role: p.role, lastActive: p.lastActive }));
    },

    // simulate presence step; opts: { percent: 0.01, seed } - when seed provided uses deterministic RNG for repeatability
    simulatePresenceStep(opts){
      opts = opts || {};
      const pct = Number(opts.percent || 0.01);
      if(!this.people || !this.people.length) return;
      const count = Math.max(1, Math.round(this.people.length * pct));
      let rnd = Math.random;
      if(typeof opts.seed === 'number') rnd = xorshift32(opts.seed);

      for(let i=0;i<count;i++){
        const idx = Math.floor(rnd() * this.people.length);
        // mark recent activity within last 5 minutes
        this.people[idx].lastActive = Date.now() - Math.round(rnd()*1000*60*5);
      }
    }
  };

  window.SyntheticPeople = SyntheticPeople;

  // auto-generate small set for preview (non-blocking)
  setTimeout(()=>{ try{ SyntheticPeople.generatePool({ size: Math.min(500, SyntheticPeople.meta.size), seedBase: SyntheticPeople.meta.seedBase, spanDays: SyntheticPeople.meta.spanDays }); }catch(e){} }, 60);

  console.info('SyntheticPeople loaded (patched)');
})();
