// SkyForge — terrain: deterministic heightfield over the map, ridges, islands, runway strip,
// weather field (wind + storm cells), and mission ring paths.
import { CFG } from './config.js';

// value-noise via hash, seeded
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263) ^ (seed * 1442695041);
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export class Terrain {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.size = CFG.TERRAIN_SIZE;
    this.runway = { x: 0, z: 3200, w: 90, len: 560, heading: 0 }; // flat strip south of center
    // storm cells for weather missions (position, radius, intensity)
    this.storms = [
      { x: -1200, z: -400, r: 1500, intensity: 1.0 },
      { x: 1800, z: -1800, r: 1100, intensity: 0.6 },
    ];
  }
  // Height in world units at (x, z); runway area flattened.
  height(x, z) {
    const s = this.seed;
    const nx = x / 1400, nz = z / 1400;
    let h = 0;
    h += noise2(nx, nz, s) * 360;
    h += noise2(nx * 2.7 + 13, nz * 2.7, s ^ 0x9e37) * 150;
    h += noise2(nx * 6.1, nz * 6.1 + 7, s ^ 0x51f3) * 44;
    // ridge mask: dramatic mountains along west arc (diamond-square-style amplitude boost)
    const ridge = Math.max(0, 1 - Math.abs((x + 2600) / 2200));
    h += ridge * (noise2(nx * 1.4 + 40, nz * 1.4, s ^ 0xabc1) * 1150
                + noise2(nx * 3.2 + 8, nz * 3.2, s ^ 0x77c1) * 320);
    // secondary lone massifs for silhouette drama
    const massif = Math.max(0, 1 - Math.hypot((x - 2200) / 1500, (z + 1400) / 1500));
    h += massif * noise2(nx * 1.1 + 91, nz * 1.1, s ^ 0x33d7) * 780;
    // islands: subtract sea basins
    const basin = noise2(nx * 0.9 - 30, nz * 0.9 + 22, s ^ 0x7d2f);
    if (basin < 0.34) h -= (0.34 - basin) * 900;
    h -= 60;
    // flatten runway
    const rw = this.runway;
    const dx = Math.max(0, Math.abs(x - rw.x) - rw.w / 2);
    const dz = Math.max(0, Math.abs(z - rw.z) - rw.len / 2);
    const d = Math.hypot(dx, dz);
    if (d < 260) {
      const blend = smooth(Math.min(1, d / 260));
      h = h * blend + 8 * (1 - blend);
    }
    return h;
  }
  colorAt(h, slope) {
    if (h < 2) return [26, 58, 92];        // sea
    if (h < 26) return [196, 178, 128];    // beach
    if (h < 190) return [64, 122, 66];     // lowland
    if (h < 430) return [88, 106, 60];     // highland
    if (h < 640) return [112, 104, 92];    // rock
    if (h < 780) return [150, 146, 138];   // high rock
    return [226, 230, 238];                // snow caps above threshold
  }
  // Wind vector at a position: base breeze + storm swirl. Returns {x, z, turb}.
  wind(x, y, z, tNow) {
    let wx = 14 * Math.sin(tNow * 0.05 + z / 3000), wz = 10 * Math.cos(tNow * 0.04 + x / 2600), turb = 0;
    for (const st of this.storms) {
      const d = Math.hypot(x - st.x, z - st.z);
      if (d < st.r) {
        const k = (1 - d / st.r) * st.intensity;
        // tangential swirl
        const ang = Math.atan2(x - st.x, z - st.z) + Math.PI / 2;
        wx += Math.sin(ang) * 60 * k; wz += Math.cos(ang) * 60 * k;
        turb = Math.max(turb, k);
      }
    }
    return { x: wx, z: wz, turb };
  }
  // Is a point inside a storm cell (visual + turbulence + lightning triggers)?
  inStorm(x, y, z) {
    for (const st of this.storms) {
      if (Math.hypot(x - st.x, z - st.z) < st.r && y < 1500) return st;
    }
    return null;
  }
  // Secondary flat strip (forward operating base, north)
  get fob() { return { x: 2400, z: -3200, w: 80, len: 480, heading: 0 }; }
}

// Mission ring paths per spawn style.
export function buildRings(terrain, mission, rng) {
  const rings = [];
  const n = mission.rings;
  if (n === 0) return rings;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    let x, z, y;
    if (mission.spawns === 'canyon') {
      x = -1400 + t * 3200; z = -1200 + Math.sin(t * 9) * 700; y = terrain.height(x, z) + 90;
    } else if (mission.spawns === 'flat') {
      x = -900 + t * 1800; z = 800 - t * 2600; y = terrain.height(x, z) + 140;
    } else if (mission.spawns === 'storm') {
      const a = t * Math.PI * 1.6;
      x = Math.cos(a) * (1500 - t * 600); z = Math.sin(a) * (1500 - t * 600);
      y = terrain.height(x, z) + 260 - t * 120;
    } else if (mission.spawns === 'escort') {
      x = 600 + Math.sin(t * 6) * 300; z = 2000 - t * 3400; y = terrain.height(x, z) + 200;
    } else if (mission.spawns === 'night') {
      const a = t * Math.PI * 1.3 + 0.8;
      x = Math.cos(a) * 1300; z = Math.sin(a) * 1300;
      y = terrain.height(x, z) + 120;
    } else if (mission.spawns === 'ace') {
      const a = t * Math.PI * 2.2;
      x = Math.cos(a) * 900; z = Math.sin(a) * 900 - 600;
      y = terrain.height(x, z) + 110;
    } else { // chain: scenic loop over islands
      const a = t * Math.PI * 2;
      x = Math.cos(a) * 1100; z = Math.sin(a) * 1100;
      y = terrain.height(x, z) + 150;
    }
    rings.push({ x, y: Math.max(y, 120), z, passed: false, r: 68 });
  }
  return rings;
}
