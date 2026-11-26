// SkyForge — hangar: persistent progression (credits, XP/ranks, owned airframes & tech-tree parts,
// loadout, liveries, lifetime stats, medals). Save v2 migrates v1 transparently.
import { CFG, AIRFRAMES, UPGRADES, MISSIONS, MEDALS, RANKS, LIVERY_PALETTES } from './config.js';

const DEFAULT_SAVE = {
  credits: 300, xp: 0,
  owned: ['sparrow'],
  ownedUpgrades: [],
  loadout: { airframe: 'sparrow', wings: null, engine: null, armor: null, avionics: null },
  livery: { palette: 'default', unlocked: ['default', 'shark', 'wasp'] },
  stats: {
    sorties: 0, landings: 0, rings: 0, crashes: 0, kills: 0, timeFlown: 0,
    bestScore: {}, medals: [], stallsRecovered: 0, maxG: 0, noDamageSorties: 0,
  },
  settings: { sfx: true, invertY: false, sensitivity: 1.0 },
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) {
      // migrate v1 if present
      const v1 = localStorage.getItem('skyforge.save.v1');
      if (v1) {
        const old = JSON.parse(v1);
        return { ...structuredClone(DEFAULT_SAVE),
          credits: old.credits ?? 300, xp: old.xp ?? 0, owned: old.owned ?? ['sparrow'],
          ownedUpgrades: old.ownedUpgrades ?? [], loadout: { ...structuredClone(DEFAULT_SAVE.loadout), ...(old.loadout||{}) },
          stats: { ...structuredClone(DEFAULT_SAVE.stats), ...(old.stats||{}) } };
      }
      return structuredClone(DEFAULT_SAVE);
    }
    const loaded = JSON.parse(raw);
    const merged = { ...structuredClone(DEFAULT_SAVE), ...loaded };
    merged.loadout = { ...structuredClone(DEFAULT_SAVE.loadout), ...(loaded.loadout || {}) };
    merged.livery = { ...structuredClone(DEFAULT_SAVE.livery), ...(loaded.livery || {}) };
    merged.settings = { ...structuredClone(DEFAULT_SAVE.settings), ...(loaded.settings || {}) };
    merged.stats = { ...structuredClone(DEFAULT_SAVE.stats), ...(loaded.stats || {}) };
    return merged;
  } catch { return structuredClone(DEFAULT_SAVE); }
}
export function persist(save) {
  try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

export function levelOf(xp) { return 1 + Math.floor(Math.sqrt(xp / 160)); }
export function xpForLevel(lv) { return Math.pow(lv - 1, 2) * 160; }
export function rankOf(xp) {
  const lv = levelOf(xp);
  return RANKS[Math.min(RANKS.length - 1, Math.floor((lv - 1) / 2))];
}

export function medalById(id) { return MEDALS.find(m => m.id === id); }

// Award any newly-earned medals; returns list of new medal defs.
export function checkMedals(save) {
  const got = [];
  const has = (id) => save.stats.medals.includes(id);
  const give = (id) => { if (!has(id)) { save.stats.medals.push(id); got.push(medalById(id)); } };
  if (save.stats.landings >= 1) give('first-flight');
  if (save.stats.kills >= 5) give('ace-5');
  if (save.stats.kills >= 25) give('ace-25');
  const stars = Object.values(save.stats.bestScore).reduce((a, b) => a + (b.stars || 0), 0);
  if (stars >= 15) give('star-chaser');
  if (save.stats.timeFlown >= 1800) give('iron-butt');
  if (save.stats.noDamageSorties >= 1 && save.stats.kills >= 1) give('ghost');
  if (save.owned.includes('aurora')) give('aurora-pilot');
  if (save.stats.stallsRecovered >= 1) give('stallion');
  if (save.stats.maxG >= 9.0) give('flatliner');
  const nightBest = save.stats.bestScore['night'];
  if (nightBest && nightBest.stars >= 3) give('night-owl');
  if (got.length) persist(save);
  return got;
}

// Mission unlock gate.
export function missionUnlocked(save, def) {
  if (!def.unlock) return true;
  return levelOf(save.xp) >= def.unlock.level;
}

// Effective flight envelope after airframe + parts.
export function specOf(save) {
  const air = AIRFRAMES.find(a => a.id === save.loadout.airframe) || AIRFRAMES[0];
  const spec = {
    id: air.id, name: air.name, shape: air.shape, color: air.color, tier: air.tier,
    mass: air.mass, thrust: air.thrust, agility: air.agility,
    stall: air.stall, hp: air.hp, fuelMax: air.fuel || 100, lift: 1, drag: 1, burn: 1, leak: 1,
    gun: 1, flares: 0, lockCone: 1, parts: [],
  };
  for (const slot of ['wings', 'engine', 'armor', 'avionics']) {
    const uid = save.loadout[slot];
    if (!uid) continue;
    const u = UPGRADES.find(x => x.id === uid);
    if (!u) continue;
    spec.parts.push(u.name);
    if (u.lift) spec.lift *= u.lift;
    if (u.agility) spec.agility *= u.agility;
    if (u.thrust) spec.thrust *= u.thrust;
    if (u.drag) spec.drag *= u.drag;
    if (u.burn) spec.burn *= u.burn;
    if (u.hp) spec.hp += u.hp;
    if (u.stall) spec.stall -= u.stall;
    if (u.leak) spec.leak = u.leak;
    if (u.gun) spec.gun *= u.gun;
    if (u.flares) spec.flares += u.flares;
    if (u.lockCone) spec.lockCone *= u.lockCone;
  }
  spec.stall = Math.max(24, spec.stall);
  // livery
  const pal = LIVERY_PALETTES.find(p => p.id === save.livery.palette) || LIVERY_PALETTES[0];
  spec.body = pal.body || air.color;
  spec.trim = pal.trim || '#eaf2f8';
  return spec;
}

// A part is buyable when its tier ≤ owned airframes' max tier and its `needs` part is owned.
export function partState(save, u) {
  const owned = save.ownedUpgrades.includes(u.id);
  if (owned) return { owned: true, reason: null };
  const maxTier = Math.max(...save.owned.map(id => (AIRFRAMES.find(a => a.id === id)?.tier) || 1));
  if (u.tier > maxTier) return { owned: false, reason: `requires tier-${u.tier} airframe` };
  if (u.needs && !save.ownedUpgrades.includes(u.needs)) {
    const dep = UPGRADES.find(x => x.id === u.needs);
    return { owned: false, reason: `requires ${dep ? dep.name : u.needs}` };
  }
  if (save.credits < u.cost) return { owned: false, reason: 'insufficient credits' };
  return { owned: false, reason: null };
}

export function buyAirframe(save, id) {
  const air = AIRFRAMES.find(a => a.id === id);
  if (!air || save.owned.includes(id) || save.credits < air.cost) return false;
  save.credits -= air.cost;
  save.owned.push(id);
  save.loadout.airframe = id;
  persist(save);
  return true;
}
export function buyUpgrade(save, id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || partState(save, u).reason) return false;
  save.credits -= u.cost;
  save.ownedUpgrades.push(id);
  if (!save.loadout[u.slot]) save.loadout[u.slot] = id;
  persist(save);
  return true;
}
export function equip(save, slot, id) {
  if (slot === 'airframe') { if (save.owned.includes(id)) save.loadout.airframe = id; }
  else if (id === null || save.ownedUpgrades.includes(id)) save.loadout[slot] = id;
  persist(save);
}
export function buyLivery(save, palId) {
  const pal = LIVERY_PALETTES.find(p => p.id === palId);
  if (!pal || save.livery.unlocked.includes(palId)) return false;
  if (save.credits < 150) return false;
  save.credits -= 150;
  save.livery.unlocked.push(palId);
  save.livery.palette = palId;
  persist(save);
  return true;
}
export function setLivery(save, palId) {
  if (!save.livery.unlocked.includes(palId)) return false;
  save.livery.palette = palId;
  persist(save);
  return true;
}
