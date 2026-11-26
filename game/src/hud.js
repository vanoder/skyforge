// SkyForge — hud: instruments drawn to feel flown — needles jitter, tapes roll, warnings lamp,
// radar scope with bandit blips, combat toasts, day/night tint, kill feed.
import { CFG } from './config.js';
import { project } from './camera.js';
import { dayFactors } from './render.js';

function tape(ctx, x, y, w, h, val, unit, color = '#eaf2f8') {
  ctx.save();
  ctx.strokeStyle = 'rgba(230,240,250,0.85)'; ctx.fillStyle = 'rgba(10,20,30,0.55)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.fillText(String(Math.round(val)).padStart(3, '0'), x + 8, y + h / 2 + 5);
  ctx.font = '9px ui-monospace, monospace'; ctx.fillStyle = 'rgba(230,240,250,0.7)';
  ctx.fillText(unit, x + w - 30, y + h / 2 + 4);
  ctx.restore();
}

function lamp(ctx, x, y, label, on, color) {
  ctx.save();
  ctx.fillStyle = on ? color : 'rgba(255,255,255,0.10)';
  ctx.strokeStyle = 'rgba(230,240,250,0.5)';
  ctx.beginPath(); ctx.roundRect(x, y, 86, 20, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = on ? '#08131d' : 'rgba(230,240,250,0.65)';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.fillText(label, x + 8, y + 14);
  ctx.restore();
}

function dial(ctx, cx, cy, r, val, max, label, needleJitter = 0) {
  ctx.save();
  ctx.strokeStyle = 'rgba(230,240,250,0.8)'; ctx.lineWidth = 1.5;
  ctx.fillStyle = 'rgba(10,20,30,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.stroke();
  // ticks
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82);
    ctx.lineTo(cx + Math.cos(a) * r * 0.98, cy + Math.sin(a) * r * 0.98);
    ctx.stroke();
  }
  // needle with slight inertia jitter — instruments that look flown
  const a = Math.PI * 0.75 + Math.max(0, Math.min(1, val / max)) * Math.PI * 1.5 + needleJitter;
  ctx.strokeStyle = '#ffd257'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); ctx.stroke();
  ctx.fillStyle = 'rgba(230,240,250,0.8)'; ctx.font = '9px ui-monospace, monospace';
  ctx.fillText(label, cx - 14, cy + r + 12);
  ctx.restore();
}

// Radar scope: player-centered, north-up, bandit blips with mode colour.
function radar(ctx, x, y, r, p, foes, heading) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,18,28,0.62)';
  ctx.strokeStyle = 'rgba(120,220,160,0.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  // sweep
  const sw = (Date.now() / 900) % (Math.PI * 2);
  const sg = ctx.createConicGradient ? null : null;
  ctx.strokeStyle = 'rgba(120,220,160,0.25)';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(sw) * r, y + Math.sin(sw) * r); ctx.stroke();
  // range rings
  ctx.strokeStyle = 'rgba(120,220,160,0.2)';
  for (const rr of [r * 0.5, r * 0.85]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.stroke(); }
  const RANGE = 2600;
  for (const f of foes) {
    if (!f.alive) continue;
    const dx = f.pos.x - p.pos.x, dz = f.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > RANGE) continue;
    // rotate into player heading (heading-up scope)
    const rel = Math.atan2(dx, dz) - heading;
    const bx = x + Math.sin(rel) * (d / RANGE) * r;
    const by = y - Math.cos(rel) * (d / RANGE) * r;
    ctx.fillStyle = f.mode === 'attack' ? '#ff5a5a' : f.mode === 'pursue' ? '#ffcf5a' : '#78d8a0';
    ctx.beginPath(); ctx.arc(bx, by, 3, 0, 7); ctx.fill();
  }
  // player caret
  ctx.fillStyle = '#eaf2f8';
  ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x - 4, y + 4); ctx.lineTo(x + 4, y + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(120,220,160,0.8)'; ctx.font = '8px ui-monospace, monospace';
  ctx.fillText('RDR 2.6km', x - 22, y + r + 10);
  ctx.restore();
}

export function drawHUD(ctx, p, spec, mission, cam, W, H, tNow, foes = [], toasts = [], dayTime = 0.25) {
  const jitter = Math.sin(tNow * 9) * 0.02 + (p.damage > 40 ? Math.sin(tNow * 31) * 0.05 : 0);
  // top tape row
  tape(ctx, 18, 16, 92, 26, p.speed * 1.94, 'KTS');          // airspeed
  tape(ctx, 122, 16, 92, 26, p.pos.y * 3.28, 'ALT');         // altitude
  const hdg = ((p.heading * 180 / Math.PI) % 360 + 360) % 360;
  tape(ctx, 226, 16, 92, 26, hdg, 'HDG');
  tape(ctx, 18, 48, 92, 26, p.throttle * 100, 'THR');
  // heading ribbon → real compass tape with tick marks and lubber line
  ctx.save();
  ctx.strokeStyle = 'rgba(230,240,250,0.6)';
  ctx.beginPath(); ctx.roundRect(W / 2 - 160, 14, 320, 26, 4);
  ctx.fillStyle = 'rgba(10,20,30,0.5)'; ctx.fill(); ctx.stroke();
  ctx.font = '10px ui-monospace, monospace';
  for (let d = -70; d <= 70; d += 10) {
    const hv = ((Math.round((hdg + d) / 10) * 10) % 360 + 360) % 360;
    const x = W / 2 + (((Math.round((hdg + d) / 10) * 10) - hdg) / 70) * 160;
    const major = hv % 30 === 0;
    ctx.strokeStyle = major ? 'rgba(230,240,250,0.85)' : 'rgba(230,240,250,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x, major ? 24 : 21); ctx.stroke();
    if (major) {
      ctx.fillStyle = '#eaf2f8';
      ctx.fillText(hv === 0 ? 'N' : hv === 90 ? 'E' : hv === 180 ? 'S' : hv === 270 ? 'W' : String(hv / 10 | 0), x - (hv < 100 && hv % 90 !== 0 ? 3 : 5), 35);
    }
  }
  // lubber line
  ctx.strokeStyle = '#ffd257'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W / 2, 12); ctx.lineTo(W / 2, 20); ctx.stroke();
  ctx.fillStyle = '#ffd257'; ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillText(String(Math.round(hdg)).padStart(3, '0'), W / 2 + 8, 20);
  ctx.restore();
  // G / AoA / Mach readout cluster, center-left of ladder
  ctx.fillStyle = 'rgba(10,20,30,0.5)';
  ctx.beginPath(); ctx.roundRect(W / 2 - 262, 52, 96, 44, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(230,240,250,0.5)'; ctx.stroke();
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.fillStyle = p.g > CFG.HARD_G ? '#ff5a5a' : '#eaf2f8';
  ctx.fillText(`${p.g.toFixed(1)} G`, W / 2 - 250, 68);
  ctx.font = '10px ui-monospace, monospace';
  const aoa = (p.pitch * 57.3 * 0.6).toFixed(1);
  ctx.fillStyle = 'rgba(234,242,248,0.85)';
  ctx.fillText(`AOA ${aoa}°`, W / 2 - 250, 82);
  ctx.fillText(`M ${(p.speed / 340).toFixed(2)}`, W / 2 - 250, 93);
  // mission readout
  if (mission) {
    ctx.fillStyle = 'rgba(10,20,30,0.55)';
    ctx.beginPath(); ctx.roundRect(W - 210, 14, 192, 46, 6); ctx.fill();
    ctx.fillStyle = '#ffd257'; ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText(mission.def.name, W - 198, 32);
    ctx.fillStyle = '#eaf2f8'; ctx.font = '10px ui-monospace, monospace';
    const ringTxt = mission.rings.length ? `RING ${Math.min(mission.idx + 1, mission.rings.length)}/${mission.rings.length}  T+${mission.time.toFixed(0)}s` : `FREE FLIGHT  T+${mission.time.toFixed(0)}s`;
    ctx.fillText(ringTxt, W - 198, 50);
    if (mission.def.foes) {
      const alive = foes.filter(f => f.alive).length;
      ctx.fillStyle = alive ? '#ffcf5a' : '#7be08a';
      ctx.fillText(`BANDITS ${alive}`, W - 96, 50);
    }
  }
  // bottom-left dials
  dial(ctx, 52, H - 58, 26, p.speed, spec.stall * 2.6, 'SPD', jitter);
  dial(ctx, 118, H - 58, 26, p.pos.y / 24, 10, 'VSI', jitter);
  dial(ctx, 184, H - 58, 26, p.g, 10, 'G', jitter);
  // fuel bar
  ctx.fillStyle = 'rgba(10,20,30,0.55)'; ctx.fillRect(220, H - 74, 120, 10);
  ctx.fillStyle = p.fuel < CFG.FUEL_WARN * 100 ? '#ff5a5a' : '#7be08a';
  ctx.fillRect(221, H - 73, 118 * (p.fuel / 100), 8);
  ctx.fillStyle = '#eaf2f8'; ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('FUEL', 224, H - 78);
  // damage bar
  ctx.fillStyle = 'rgba(10,20,30,0.55)'; ctx.fillRect(220, H - 54, 120, 10);
  ctx.fillStyle = p.damage > 60 ? '#ff5a5a' : p.damage > 25 ? '#ffcf5a' : '#7be08a';
  ctx.fillRect(221, H - 53, 118 * (p.damage / CFG.MAX_DAMAGE), 8);
  ctx.fillText('HULL', 224, H - 58);
  // warning lamps
  lamp(ctx, W - 110, H - 78, 'STALL', p.stalled, '#ff5a5a');
  lamp(ctx, W - 110, H - 52, 'ENGINE', p.fuel <= 0, '#ff5a5a');
  lamp(ctx, W - 200, H - 78, 'OVER-G', p.g > CFG.HARD_G, '#ffcf5a');
  lamp(ctx, W - 200, H - 52, 'FLARES', p.flaresLeft > 0, '#78d8a0');
  // radar scope (blips + 2 range rings)
  radar(ctx, W - 76, H - 130, 52, p, foes, p.heading);
  // corner panel: throttle / fuel / airframe vertical bars
  const bars = [
    { label: 'THR', v: p.throttle, c: '#ffd257' },
    { label: 'FUEL', v: p.fuel / 100, c: p.fuel < CFG.FUEL_WARN * 100 ? '#ff5a5a' : '#7be08a' },
    { label: 'HULL', v: 1 - p.damage / CFG.MAX_DAMAGE, c: p.damage > 60 ? '#ff5a5a' : p.damage > 25 ? '#ffcf5a' : '#7be08a' },
  ];
  const bx = W - 330, bh = 84;
  ctx.fillStyle = 'rgba(10,20,30,0.5)';
  ctx.beginPath(); ctx.roundRect(bx - 10, H - bh - 20, 96, bh + 14, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(230,240,250,0.45)'; ctx.stroke();
  bars.forEach((b, i) => {
    const x = bx + i * 30 + 4, yTop = H - bh - 8;
    ctx.strokeStyle = 'rgba(230,240,250,0.55)';
    ctx.strokeRect(x, yTop, 14, bh - 20);
    const fh = Math.max(0, Math.min(1, b.v)) * (bh - 22);
    ctx.fillStyle = b.c;
    ctx.fillRect(x + 2, yTop + (bh - 20) - fh, 10, fh);
    // 25% tick
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(x, yTop + (bh - 20) * 0.75); ctx.lineTo(x + 14, yTop + (bh - 20) * 0.75); ctx.stroke();
    ctx.fillStyle = 'rgba(230,240,250,0.85)'; ctx.font = '8px ui-monospace, monospace';
    ctx.fillText(b.label, x - 1, H - 10);
  });
  // waypoint gate marker: projected box around the next ring + distance
  if (mission && mission.rings.length && mission.idx < mission.rings.length) {
    const r = mission.rings[mission.idx];
    const pr = project(cam, W, H, r.x, r.y, r.z);
    if (pr && pr.x > -60 && pr.x < W + 60 && pr.y > -40 && pr.y < H + 40) {
      const g = Math.max(14, r.r * pr.scale * 0.55);
      ctx.strokeStyle = 'rgba(255,210,87,0.9)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(pr.x - g, pr.y - g, g * 2, g * 2);
      ctx.setLineDash([]);
      const d3 = Math.hypot(r.x - p.pos.x, r.y - p.pos.y, r.z - p.pos.z);
      ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(`G-${String(mission.idx + 1).padStart(2, '0')} ${Math.round(d3)}m`, pr.x + g + 5, pr.y - g + 2);
      // off-screen pointer arrow toward the gate
      if (pr.x < 40 || pr.x > W - 40 || pr.y < 40 || pr.y > H - 40) {
        const ang = Math.atan2(pr.y - H / 2, pr.x - W / 2);
        const ax = W / 2 + Math.cos(ang) * (W / 2 - 46), ay = H / 2 + Math.sin(ang) * (H / 2 - 46);
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
        ctx.fillStyle = 'rgba(255,210,87,0.9)';
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, 7); ctx.lineTo(-6, -7); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }
  // combat toasts / kill feed
  let ty = 84;
  for (const t of toasts) {
    const a = Math.min(1, t.t);
    ctx.fillStyle = t.kind === 'good' ? `rgba(123,224,138,${a})` : t.kind === 'warn' ? `rgba(255,207,90,${a})` : t.kind === 'bad' ? `rgba(255,90,90,${a})` : `rgba(234,242,248,${a})`;
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText(t.text, W / 2 - ctx.measureText(t.text).width / 2, ty);
    ty += 20;
  }
  // alarms center-screen
  for (const a of p.alarms) {
    ctx.fillStyle = a.kind === 'bad' ? 'rgba(255,80,80,0.95)' : a.kind === 'warn' ? 'rgba(255,207,90,0.9)' : 'rgba(234,242,248,0.8)';
    ctx.font = 'bold 14px ui-monospace, monospace';
    const tw = ctx.measureText(a.text).width;
    ctx.fillText(a.text, W / 2 - tw / 2, H * 0.3);
  }
  // missile inbound flash
  if (p.alarms.some(a => a.text.startsWith('MISSILE'))) {
    ctx.fillStyle = `rgba(255,60,60,${0.12 + 0.1 * Math.sin(tNow * 20)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // stall shake vignette
  if (p.stalled) {
    ctx.fillStyle = 'rgba(255,60,60,0.08)';
    ctx.fillRect(0, 0, W, H);
  }
  // night vignette
  const nightF = dayFactors(dayTime).night;
  if (nightF > 0.2) {
    const nv = Math.min(0.28, nightF * 0.8);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
    g.addColorStop(0, 'rgba(4,8,16,0)');
    g.addColorStop(1, `rgba(4,8,16,${nv})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

// pitch ladder + flight path marker (the feel of a real HUD)
export function drawLadder(ctx, p, cam, W, H) {
  const cx = W / 2, cy = H * 0.46;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-p.roll * 0.6);
  ctx.strokeStyle = 'rgba(190,230,255,0.9)'; ctx.lineWidth = 1.4;
  // flight path marker
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-6, 0); ctx.moveTo(6, 0); ctx.lineTo(12, 0); ctx.moveTo(0, -6); ctx.lineTo(0, -12); ctx.stroke();
  // pitch ladder
  const pitchDeg = p.pitch * 57.3;
  for (let d = -30; d <= 30; d += 10) {
    if (d === 0) continue;
    const y = (pitchDeg - d) * 4.2;
    if (Math.abs(y) > 130) continue;
    const wHalf = d > 0 ? 34 : 22;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(-wHalf, y); ctx.lineTo(-10, y); ctx.moveTo(10, y); ctx.lineTo(wHalf, y); ctx.stroke();
    if (d > 0) { ctx.beginPath(); ctx.moveTo(-10, y); ctx.lineTo(-10, y + 5); ctx.moveTo(10, y); ctx.lineTo(10, y + 5); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // horizon roll scale
  ctx.strokeStyle = 'rgba(190,230,255,0.8)';
  const cy2 = H * 0.46;
  ctx.beginPath(); ctx.arc(cx, cy2, 120, Math.PI * 0.7, Math.PI * 2.3); ctx.stroke();
  for (const a of [-45, -30, -15, 0, 15, 30, 45]) {
    const rad = (a - 90) * Math.PI / 180;
    const x1 = cx + Math.cos(rad) * 120, y1 = cy2 + Math.sin(rad) * 120;
    const x2 = cx + Math.cos(rad) * (a % 45 === 0 ? 130 : 126), y2 = cy2 + Math.sin(rad) * (a % 45 === 0 ? 130 : 126);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
}
