// SkyForge — render: sky (day/night), terrain painter, storm cells, aircraft w/ liveries,
// bandits, tracers/missiles/flares, rings, runway, hangar UI helpers.
import { CFG } from './config.js';
import { project } from './camera.js';

const SKY_TOP = '#0b2a4d', SKY_MID = '#3f83c4', SKY_HOR = '#cfdfe9';
// Golden-hour palette: warm orange/pink horizon band, deep blue-violet zenith.
const GH_ZEN = '#2b2a6e', GH_MID = '#7a5aa8', GH_HOR = '#ff9a4d', GH_PINK = '#ff7a9e';

// Day/night tinting: t in 0..1 (0=dawn, .25=noon, .5=dusk, .75=night)
export function dayFactors(t) {
  const light = Math.max(-1, Math.min(1, Math.sin(t * Math.PI * 2)));
  const day = Math.max(0, light);
  const dusk = Math.max(0, 1 - Math.abs(light) * 2.6);
  // golden-hour band also around dawn (t near 0/1): dawn peaks as light crosses 0 going positive
  const dawn = Math.max(0, 1 - Math.abs(t < 0.5 ? t / 0.5 : (1 - t) / 0.5 - 1) * 2.2) * (1 - Math.max(0, -light) * 0.3);
  // golden hour: sun near the horizon but still up — warm band on lit sky/terrain
  const golden = Math.max(0, 1 - Math.abs(light) / 0.5) * (1 - Math.max(0, -light) * 0.6);
  return { light, day, dusk, dawn, golden, night: Math.max(0, -light) };
}

// Layered procedural soft-ellipse clouds, 3 parallax bands, lit by sun angle (golden hour = warm bellies).
export function drawClouds(ctx, W, H, dayTime = 0.25, cam, tNow = 0) {
  const f = dayFactors(dayTime);
  const gh = Math.max(f.golden, f.dusk * 0.7);
  const horizon = H * 0.42;
  const drift = tNow * 6;
  // per-layer: count, y-band fraction of sky, scale, speed, alpha
  const layers = [
    { n: 9,  y0: 0.05, y1: 0.30, s: 1.7, sp: 0.35, a: 0.30 },
    { n: 11, y0: 0.16, y1: 0.38, s: 1.15, sp: 0.7,  a: 0.38 },
    { n: 8,  y0: 0.30, y1: 0.44, s: 0.7,  sp: 1.3,  a: 0.45 },
  ];
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    for (let i = 0; i < L.n; i++) {
      // deterministic placement from indices (no per-frame randomness)
      const hx = ((i * 9301 + li * 49297 + Math.floor(drift * L.sp * 0.2)) % 233280) / 233280;
      const hy = ((i * 4177 + li * 104729) % 65536) / 65536;
      const baseX = hx * (W + 400) - 200;
      const x = ((baseX - drift * L.sp * 30) % (W + 400) + W + 400) % (W + 400) - 200;
      const y = horizon - (y0y(L, hy)) * horizon;
      const rr = (26 + hy * 40) * L.s * (W / 960);
      // sun-lit coloring: lit edge faces the sun (right side at golden hour)
      const litW = 0.45 + f.day * 0.45;
      const topC = gh > 0.15 ? `rgba(${255},${(200 - gh * 40) | 0},${(170 - gh * 60) | 0},${L.a})` : `rgba(${(245 * litW + 40) | 0},${(248 * litW + 45) | 0},255,${L.a})`;
      const botC = gh > 0.15 ? `rgba(${(180 + gh * 60) | 0},${(90 + gh * 40) | 0},${70},${L.a * 0.8})` : `rgba(${(150 * litW + 40) | 0},${(160 * litW + 50) | 0},${(185 * litW + 60) | 0},${L.a * 0.8})`;
      const cg = ctx.createRadialGradient(x - rr * 0.2, y - rr * 0.28, rr * 0.12, x, y, rr);
      cg.addColorStop(0, topC);
      cg.addColorStop(1, botC);
      ctx.fillStyle = cg;
      // soft mass: 4 overlapping ellipses
      for (let e = 0; e < 4; e++) {
        const ex = x + (e - 1.5) * rr * 0.42 + Math.sin(i * 3 + e) * rr * 0.1;
        const ey = y + Math.abs(e - 1.5) * rr * 0.14;
        ctx.beginPath();
        ctx.ellipse(ex, ey, rr * (e === 1 || e === 2 ? 0.62 : 0.45), rr * 0.3, 0, 0, 7);
        ctx.fill();
      }
    }
  }
}
function y0y(L, hy) { return L.y0 + (L.y1 - L.y0) * hy; }

export function drawSky(ctx, cam, W, H, dayTime = 0.25) {
  const f = dayFactors(dayTime);
  const top = mixHex(SKY_TOP, '#05070f', f.night * 0.95);
  const mid = mixHex(SKY_MID, '#0b1426', f.night * 0.9);
  const hor = mixHex(SKY_HOR, '#1b2436', f.night * 0.85);
  // golden-hour blending: zenith deepens to blue-violet, horizon goes warm orange/pink
  const gh = Math.max(f.dusk * 0.6, f.golden);
  let topC = mixHex(top, GH_ZEN, gh * 0.5);
  let midC = mixHex(mid, GH_MID, gh * 0.45);
  let horC = mixHex(hor, GH_HOR, gh * 0.95);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, topC);
  g.addColorStop(0.45, midC);
  g.addColorStop(0.72, mixHex(midC, horC, 0.55));
  g.addColorStop(0.82, horC);
  // pink rim just above the horizon at golden hour
  if (gh > 0.02) g.addColorStop(0.9, mixHex(horC, GH_PINK, gh * 0.7));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // sun / moon
  const sunX = W * 0.72, sunY = H * (0.12 + (1 - f.day) * 0.1 + gh * 0.52);
  if (f.night < 0.75) {
    const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
    sg.addColorStop(0, gh > 0.3 ? `rgba(255,214,140,${0.95 - f.night})` : `rgba(255,244,214,${0.95 - f.night})`);
    sg.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sunX, sunY, 120, 0, 7); ctx.fill();
  }
  if (f.night > 0.2) {
    // stars
    for (let i = 0; i < 90; i++) {
      const sx = ((i * 137.5) % W), sy = ((i * 71.3) % (H * 0.5));
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(i + dayTime * 40));
      ctx.fillStyle = `rgba(230,240,255,${tw * f.night * 0.75})`;
      ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
    // moon
    const mx = W * 0.2, my = H * 0.16;
    const mg = ctx.createRadialGradient(mx, my, 2, mx, my, 60);
    mg.addColorStop(0, `rgba(226,236,255,${f.night})`);
    mg.addColorStop(1, 'rgba(226,236,255,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 60, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(236,244,255,${0.9 * f.night})`;
    ctx.beginPath(); ctx.arc(mx, my, 18, 0, 7); ctx.fill();
  }
}

// Painter's-terrain: depth-sorted columns from far to near, colored by height/slope.
export function drawTerrain(ctx, cam, terrain, W, H, dayTime = 0.25) {
  const f = dayFactors(dayTime);
  const rows = 56, cols = 34;
  const horizon = H * 0.42;
  const lightK = 0.32 + f.day * 0.68 + f.golden * 0.35; // golden hour keeps the world lit warm
  ctx.save();
  for (let r = rows; r >= 1; r--) {
    const depth = CFG.VIEW_DIST * Math.pow(r / rows, 2.0);
    const y0 = horizon + (H - horizon) * Math.pow(1 - depth / CFG.VIEW_DIST, 1.5);
    const spread = depth * 1.05;
    for (let c = -cols; c <= cols; c++) {
      const ang = cam.yaw + c * 0.048;
      const wx = cam.x + Math.sin(ang) * spread;
      const wz = cam.z + Math.cos(ang) * spread;
      const h = terrain.height(wx, wz);
      const hL = terrain.height(wx - 30, wz);
      const hR = terrain.height(wx + 30, wz);
      const slope = Math.abs(h - hL);
      const [cr, cg, cb] = terrain.colorAt(h, slope);
      const fog = Math.min(1, depth / CFG.VIEW_DIST * 1.1);
      const fadeK = 1 - fog * 0.72;
      // faceted warm/cool shading by sun angle: sun rides screen-right at golden hour,
      // so westward-rising faces go cool shadow, eastward-rising faces warm-lit
      const face = (hR - hL) / 60;             // -1 steep toward sun ... +1 away
      const ghT = 0.32 + f.golden * 0.9 + f.dusk * 0.4;   // golden-hour warmth strength
      const warm = Math.max(0, -face) * ghT;   // sunlit face → warm
      const cool = Math.max(0, face) * (0.35 + ghT * 0.5); // shaded face → cool blue
      let R = cr * (1 + warm * 0.55) - cool * 34;
      let G = cg * (1 + warm * 0.18) - cool * 18;
      let B = cb * (1 - warm * 0.22) + cool * 30;
      const shadeK = 1 - Math.min(0.28, slope / 900);
      const sunK = shadeK * lightK;
      const lit = (Math.max(0, R) * fadeK * sunK + 170 * fog * (0.25 + f.day * 0.75));
      const litG = (Math.max(0, G) * fadeK * sunK + 195 * fog * (0.25 + f.day * 0.75));
      const litB = (Math.max(0, B) * fadeK * sunK + 215 * fog * (0.35 + f.day * 0.65));
      ctx.fillStyle = `rgb(${lit | 0},${litG | 0},${litB | 0})`;
      const cw = W / (cols * 2) * 1.4;
      const yTop = y0 - Math.max(0, h - 24) * (H / 860) * (420 / Math.max(depth, 380));
      ctx.fillRect(W / 2 + c * cw - cw / 2, yTop, cw + 1, H - yTop + 2);
    }
  }
  ctx.restore();
  // sea haze band
  const hg = ctx.createLinearGradient(0, horizon - 8, 0, horizon + 26);
  hg.addColorStop(0, 'rgba(188,214,232,0)'); hg.addColorStop(1, `rgba(188,214,232,${0.15 + f.day * 0.4})`);
  ctx.fillStyle = hg; ctx.fillRect(0, horizon - 8, W, 34);
}

// Storm cells as layered dark cloud masses with lightning flicker.
export function drawStorm(ctx, cam, terrain, W, H, tNow) {
  for (const st of terrain.storms) {
    const d = Math.hypot(cam.x - st.x, cam.z - st.z);
    if (d > st.r + 3200) continue;
    const pr = project(cam, W, H, st.x, 900, st.z);
    if (!pr) continue;
    const rad = Math.max(40, (st.r * pr.scale) / 30);
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const ox = Math.sin(i * 2.1 + tNow * 0.2) * rad * 0.35;
      const oy = -rad * 0.55 + i * rad * 0.12;
      const g = ctx.createRadialGradient(pr.x + ox, pr.y + oy, rad * 0.1, pr.x + ox, pr.y + oy, rad);
      g.addColorStop(0, `rgba(28,32,48,${0.34 * st.intensity})`);
      g.addColorStop(1, 'rgba(28,32,48,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(pr.x + ox, pr.y + oy, rad, rad * 0.55, 0, 0, 7); ctx.fill();
    }
    // lightning flicker inside the cell
    const flick = Math.sin(tNow * 2.7 + st.x) > 0.985;
    if (flick) {
      ctx.strokeStyle = 'rgba(220,235,255,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath();
      let lx = pr.x, ly = pr.y - rad * 0.4;
      for (let i = 0; i < 6; i++) { lx += (Math.random() - 0.5) * rad * 0.4; ly += rad * 0.16; ctx.lineTo(lx, ly); }
      ctx.stroke();
    }
    // rain streaks under the cell when the camera is close
    if (d < st.r + 600) {
      const k = Math.max(0, 1 - d / (st.r + 600)) * st.intensity;
      ctx.strokeStyle = `rgba(180,200,225,${0.28 * k})`;
      ctx.lineWidth = 1;
      const n = Math.floor(46 * k);
      for (let i = 0; i < n; i++) {
        const rx = pr.x - rad + ((i * 761 + Math.floor(tNow * 90)) % (rad * 2));
        const ry = pr.y - rad * 0.5 + ((i * 337 + Math.floor(tNow * 260)) % (rad * 1.4));
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 11); ctx.stroke();
      }
      // whole-screen lightning flash when very close
      if (flick && d < st.r) {
        ctx.fillStyle = 'rgba(210,225,255,0.18)';
        ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.restore();
  }
}

// Terrain scatter: deterministic trees (lowland) and rocks (highland), drawn as tiny silhouettes.
export function drawScatter(ctx, cam, terrain, W, H, dayTime = 0.25) {
  const f = dayFactors(dayTime);
  const horizon = H * 0.42;
  for (let r = 26; r >= 8; r--) {
    const depth = CFG.VIEW_DIST * Math.pow(r / 56, 2.0);
    const spread = depth * 1.05;
    for (let c = -14; c <= 14; c++) {
      // stable jitter from cell indices
      const hsh = ((r * 73856093) ^ (c * 19349663)) >>> 0;
      const jx = (hsh % 1000) / 1000 - 0.5, jz = ((hsh >>> 10) % 1000) / 1000 - 0.5;
      const ang = cam.yaw + (c + jx) * 0.048;
      const wx = cam.x + Math.sin(ang) * spread + jx * 60;
      const wz = cam.z + Math.cos(ang) * spread + jz * 60;
      const h = terrain.height(wx, wz);
      if (h < 30 || h > 620) continue;
      const kind = (hsh >>> 20) % 5; // 0-2 tree, 3-4 rock
      if (h > 430 && kind < 3) continue; // trees stop above treeline
      const y = horizon + (H - horizon) * Math.pow(1 - depth / CFG.VIEW_DIST, 1.5);
      const size = Math.max(1, 90 / Math.max(depth, 200) * 8);
      const sx = W / 2 + (c + jx) * (W / 68) * 1.4;
      const sy = y - Math.max(0, h - 24) * (H / 860) * (420 / Math.max(depth, 380));
      const dim = 0.55 + f.day * 0.45;
      if (kind < 3) {
        ctx.fillStyle = `rgba(${(40 * dim) | 0},${(70 * dim) | 0},${(36 * dim) | 0},0.85)`;
        ctx.fillRect(sx, sy - size * 1.6, size * 0.35, size * 1.6);
        ctx.beginPath(); ctx.arc(sx + size * 0.17, sy - size * 1.7, size * 0.42, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(${(120 * dim) | 0},${(112 * dim) | 0},${(100 * dim) | 0},0.85)`;
        ctx.beginPath();
        ctx.moveTo(sx - size * 0.5, sy); ctx.lineTo(sx, sy - size * 0.7); ctx.lineTo(sx + size * 0.55, sy);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}

export function drawRunway(ctx, cam, terrain, W, H) {
  const rw = terrain.runway;
  const marks = [];
  for (let i = -4; i <= 4; i++) marks.push({ x: rw.x, z: rw.z + i * 62 });
  for (const m of marks) {
    const y = terrain.height(m.x, m.z) + 0.5;
    const pr = project(cam, W, H, m.x, y, m.z);
    if (!pr) continue;
    ctx.fillStyle = (m.z % 124 === 0) ? '#f2f2f2' : '#e8d84a';
    const w = Math.max(2, pr.scale * 3);
    ctx.fillRect(pr.x - w / 2, pr.y - w / 4, w, Math.max(1.5, w / 2));
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = rw.x + side * (18 + i * 16), z = rw.z - rw.len / 2;
      const pr = project(cam, W, H, x, terrain.height(x, z) + 0.5, z);
      if (!pr) continue;
      ctx.fillStyle = '#f2f2f2';
      const w = Math.max(2, pr.scale * 4);
      ctx.fillRect(pr.x - w / 2, pr.y - w / 2, w, w);
    }
  }
}

export function drawRings(ctx, cam, mission, W, H) {
  if (!mission || !mission.rings.length) return;
  const r = mission.rings[mission.idx];
  const list = r ? [mission.rings[mission.idx - 1], r, mission.rings[mission.idx + 1]].filter(Boolean) : [];
  for (const ring of list) {
    const active = ring === r;
    const base = Math.max(0, ring.y - 140);
    for (const [wx, wy] of [[ring.x - ring.r, base], [ring.x + ring.r, base]]) {
      const pb = project(cam, W, H, wx, wy, ring.z);
      if (pb) { ctx.strokeStyle = 'rgba(255,210,87,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pb.x, pb.y); ctx.lineTo(pb.x, pb.y - 2000 / pb.depth); ctx.stroke(); }
    }
    const pr = project(cam, W, H, ring.x, ring.y, ring.z);
    if (pr) {
      const rr = Math.max(3, ring.r * pr.scale * 0.55);
      // additive glow halo behind the ring
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(pr.x, pr.y, rr * 0.4, pr.x, pr.y, rr * 2.2);
      halo.addColorStop(0, active ? 'rgba(255,190,70,0.35)' : 'rgba(255,170,50,0.12)');
      halo.addColorStop(1, 'rgba(255,170,50,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, rr * 2.2, 0, 7); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = active ? '#ffd257' : 'rgba(255,190,60,0.4)';
      ctx.lineWidth = active ? 4 : 2;
      ctx.shadowColor = active ? '#ffb020' : 'transparent';
      ctx.shadowBlur = active ? 14 : 0;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, 0, 7); ctx.stroke();
      ctx.shadowBlur = 0;
      const n = 10;
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        ctx.fillStyle = active ? '#ffcf5a' : 'rgba(255,190,60,0.45)';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, a0, a1); ctx.arc(pr.x, pr.y, rr * 0.72, a1, a0, true); ctx.closePath(); ctx.fill();
      }
      // distance label under the ring gate
      const d3 = Math.hypot(ring.x - cam.x, ring.y - (cam.y || 0), ring.z - cam.z);
      ctx.fillStyle = active ? '#ffe9a8' : 'rgba(255,210,120,0.75)';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(`G-${String(mission.rings.indexOf(ring) + 1).padStart(2, '0')} ${Math.round(d3)}m`, pr.x - 34, pr.y + rr + 14);
    }
  }
}

// Generic silhouette drawer shared by player and bandits.
function silhouette(ctx, spec, s) {
  // fuselage
  ctx.fillStyle = spec.body || spec.color;
  ctx.beginPath();
  if (spec.shape === 'dart') {
    ctx.moveTo(0, -s * 0.75); ctx.lineTo(s * 0.22, s * 0.55); ctx.lineTo(0, s * 0.8); ctx.lineTo(-s * 0.22, s * 0.55);
  } else {
    ctx.moveTo(0, -s * 0.55); ctx.lineTo(s * 0.28, 0); ctx.lineTo(0, s * 0.75); ctx.lineTo(-s * 0.28, 0);
  }
  ctx.closePath(); ctx.fill();
  // wings
  ctx.fillStyle = shade(spec.body || spec.color, -18);
  if (spec.shape === 'delta') {
    ctx.beginPath(); ctx.moveTo(-s, s * 0.4); ctx.lineTo(s, s * 0.4); ctx.lineTo(0, -s * 0.2); ctx.closePath(); ctx.fill();
  } else if (spec.shape === 'wide') {
    ctx.fillRect(-s * 1.3, s * 0.15, s * 2.6, s * 0.3);
  } else if (spec.shape === 'wing') {
    ctx.beginPath(); ctx.moveTo(-s * 1.5, s * 0.3); ctx.lineTo(0, -s * 0.15); ctx.lineTo(s * 1.5, s * 0.3);
    ctx.lineTo(s * 1.1, s * 0.5); ctx.lineTo(0, s * 0.22); ctx.lineTo(-s * 1.1, s * 0.5); ctx.closePath(); ctx.fill();
  } else if (spec.shape === 'swept') {
    ctx.beginPath(); ctx.moveTo(-s, s * 0.55); ctx.lineTo(-s * 0.2, s * 0.05); ctx.lineTo(s * 0.2, s * 0.05);
    ctx.lineTo(s, s * 0.55); ctx.lineTo(s * 0.6, s * 0.7); ctx.lineTo(-s * 0.6, s * 0.7); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(-s, s * 0.2, s * 2, s * 0.22);
  }
  // tail
  ctx.fillStyle = shade(spec.body || spec.color, -40);
  ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(0, s * 0.95); ctx.lineTo(s * 0.22, s * 0.6); ctx.closePath(); ctx.fill();
  // livery trim stripe
  if (spec.trim) { ctx.fillStyle = spec.trim; ctx.fillRect(-s * 0.05, -s * 0.2, s * 0.1, s * 0.75); }
}

export function drawAircraft(ctx, cam, p, spec, W, H) {
  if (cam.mode === 'cockpit') return; // not visible from inside
  const pr = project(cam, W, H, p.pos.x, p.pos.y, p.pos.z);
  if (!pr) return;
  const s = Math.max(6, Math.min(60, 900 / pr.depth * 3));
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.rotate(Math.sin(p.roll) * 0.5);
  silhouette(ctx, spec, s);
  const blink = (Date.now() / 400 | 0) % 2 === 0;
  if (blink) {
    ctx.fillStyle = '#ff5a5a'; ctx.fillRect(-s * 0.95, s * 0.24, 2, 2);
    ctx.fillStyle = '#63ff7a'; ctx.fillRect(s * 0.92, s * 0.24, 2, 2);
  }
  if (p.afterburner || p.throttle > 0.72) {
    // afterburner flame quad, scaled by throttle — additive glow
    const burn = p.afterburner ? 1 : (p.throttle - 0.72) / 0.28;
    const fl = s * (0.45 + burn * 0.85) * (0.9 + 0.18 * Math.sin(Date.now() / 33));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createLinearGradient(0, s * 0.72, 0, s * 0.72 + fl);
    fg.addColorStop(0, 'rgba(255,246,210,0.95)');
    fg.addColorStop(0.35, 'rgba(255,178,64,0.8)');
    fg.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-s * 0.14, s * 0.72); ctx.lineTo(s * 0.14, s * 0.72);
    ctx.lineTo(0, s * 0.72 + fl);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // engine smoke / contrail particle trail: drifts behind and expands
  if (p.smoke > 0.05 || (p.throttle > 0.85 && !p.onGround)) {
    const dense = p.smoke > 0.05 ? p.smoke : 0.25;
    for (let i = 0; i < 5; i++) {
      const tt = (Date.now() / 90 + i * 3.1) % 5;
      const px = pr.x + Math.sin(p.roll) * (tt - 2) * s * 0.7;
      const py = pr.y - s * 0.75 + (tt - 2) * s * 0.45;
      ctx.fillStyle = `rgba(${p.smoke > 0.05 ? '60,60,64' : '225,228,235'},${(p.smoke > 0.05 ? dense * 0.5 : 0.16) * (1 - tt / 5)})`;
      ctx.beginPath(); ctx.arc(px, py, s * (0.35 + tt * 0.16), 0, 7); ctx.fill();
    }
  }
}

// Bandit silhouette: dark airframe, red nav light, threat bracket when attacking.
export function drawFoe(ctx, cam, f, W, H) {
  const pr = project(cam, W, H, f.pos.x, f.pos.y, f.pos.z);
  if (!pr) return;
  const s = Math.max(7, Math.min(52, 900 / pr.depth * 4.2));
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.rotate(Math.sin(f.heading * 3) * 0.06);
  silhouette(ctx, { body: '#3a3038', color: '#3a3038', shape: 'swept', trim: '#8f2233' }, s);
  ctx.fillStyle = '#ff4a4a';
  ctx.fillRect(-1.5, -s * 0.5, 3, 3);
  ctx.restore();
  if (f.mode === 'attack') {
    ctx.strokeStyle = 'rgba(255,80,80,0.85)'; ctx.lineWidth = 1.5;
    const b = s * 1.5;
    ctx.beginPath();
    ctx.moveTo(pr.x - b, pr.y - b); ctx.lineTo(pr.x - b * 0.6, pr.y - b);
    ctx.moveTo(pr.x + b, pr.y - b); ctx.lineTo(pr.x + b * 0.6, pr.y - b);
    ctx.stroke();
  }
}

export function drawTracers(ctx, cam, bullets, missiles, flares, W, H) {
  for (const b of bullets) {
    const pr = project(cam, W, H, b.pos.x, b.pos.y, b.pos.z);
    if (!pr) continue;
    ctx.strokeStyle = b.fromPlayer ? 'rgba(255,235,140,0.95)' : 'rgba(255,120,110,0.9)';
    ctx.lineWidth = Math.max(1, Math.min(3, 700 / pr.depth));
    ctx.beginPath();
    ctx.moveTo(pr.x, pr.y);
    ctx.lineTo(pr.x - b.vel.x * 0.012, pr.y - b.vel.y * 0.012);
    ctx.stroke();
  }
  for (const m of missiles) {
    const pr = project(cam, W, H, m.pos.x, m.pos.y, m.pos.z);
    if (!pr) continue;
    ctx.fillStyle = m.fromPlayer ? '#ffd257' : '#ff5a5a';
    ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(1.5, 300 / pr.depth), 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,120,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(pr.x - 18, pr.y + 12); ctx.stroke();
  }
  for (const fl of flares) {
    const pr = project(cam, W, H, fl.pos.x, fl.pos.y, fl.pos.z);
    if (!pr) continue;
    ctx.fillStyle = `rgba(255,240,180,${Math.min(1, fl.life)})`;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, 3, 0, 7); ctx.fill();
  }
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export function mixHex(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k);
  const g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k);
  const bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
  return `rgb(${r},${g},${bl})`;
}
