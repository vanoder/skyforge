// SkyForge — render: sky (day/night), terrain painter, storm cells, aircraft w/ liveries,
// bandits, tracers/missiles/flares, rings, runway, hangar UI helpers.
import { CFG } from './config.js';
import { project } from './camera.js';

const SKY_TOP = '#0b2a4d', SKY_MID = '#3f83c4', SKY_HOR = '#cfdfe9';

// Day/night tinting: t in 0..1 (0=dawn, .25=noon, .5=dusk, .75=night)
export function dayFactors(t) {
  const light = Math.max(-1, Math.min(1, Math.sin(t * Math.PI * 2)));
  const day = Math.max(0, light);
  const dusk = Math.max(0, 1 - Math.abs(light) * 2.6);
  return { light, day, dusk, night: Math.max(0, -light) };
}

export function drawSky(ctx, cam, W, H, dayTime = 0.25) {
  const f = dayFactors(dayTime);
  const top = mixHex(SKY_TOP, '#05070f', f.night * 0.95);
  const mid = mixHex(SKY_MID, '#0b1426', f.night * 0.9);
  const hor = mixHex(SKY_HOR, '#1b2436', f.night * 0.85);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(0.8, mixHex(hor, '#e8a15a', f.dusk * 0.55));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // sun / moon
  const sunX = W * 0.72, sunY = H * (0.12 + (1 - f.day) * 0.1);
  if (f.night < 0.75) {
    const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
    sg.addColorStop(0, `rgba(255,244,214,${0.95 - f.night})`);
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
  const lightK = 0.32 + f.day * 0.68; // darken at night
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
      const slope = Math.abs(h - hL);
      const [cr, cg, cb] = terrain.colorAt(h, slope);
      const fog = Math.min(1, depth / CFG.VIEW_DIST * 1.1);
      const fadeK = 1 - fog * 0.72;      // shade by slope: sunlit west faces brighter, gives ridges volume
      const shadeK = 1 - Math.min(0.28, slope / 900);
      const lit = (cr * fadeK * shadeK * lightK + 170 * fog * (0.25 + f.day * 0.75));
      const litG = (cg * fadeK * shadeK * lightK + 195 * fog * (0.25 + f.day * 0.75));
      const litB = (cb * fadeK * shadeK * lightK + 215 * fog * (0.35 + f.day * 0.65));
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
    ctx.restore();
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
      ctx.strokeStyle = active ? '#ffd257' : 'rgba(255,190,60,0.4)';
      ctx.lineWidth = active ? 4 : 2;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, 0, 7); ctx.stroke();
      const n = 10;
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        ctx.fillStyle = active ? '#ffcf5a' : 'rgba(255,190,60,0.45)';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, a0, a1); ctx.arc(pr.x, pr.y, rr * 0.72, a1, a0, true); ctx.closePath(); ctx.fill();
      }
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
  if (p.afterburner) {
    ctx.fillStyle = 'rgba(255,170,80,0.75)';
    ctx.beginPath(); ctx.moveTo(-s * 0.12, s * 0.75); ctx.lineTo(s * 0.12, s * 0.75); ctx.lineTo(0, s * 0.75 + s * 0.5); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  if (p.smoke > 0.05) {
    ctx.fillStyle = `rgba(60,60,64,${p.smoke * 0.5})`;
    ctx.beginPath(); ctx.arc(pr.x, pr.y - s, s * 0.8, 0, 7); ctx.fill();
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
