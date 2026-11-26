// SkyForge — screens: menu (with pilot profile + medals), hangar (8 airframes, tech-tree parts),
// livery shop, mission select (8 sorties, level-gated), results.
import { AIRFRAMES, UPGRADES, MISSIONS, MEDALS, LIVERY_PALETTES, RANKS } from './config.js';
import { specOf, levelOf, xpForLevel, rankOf, missionUnlocked, partState } from './hangar.js';
import { shade } from './render.js';

export const SCREEN = { MENU: 'menu', HANGAR: 'hangar', LIVERY: 'livery', MISSIONS: 'missions', FLIGHT: 'flight', RESULTS: 'results' };

export function drawMenu(ctx, W, H, save, tNow) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#101c2e'); g.addColorStop(1, '#1d3350');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // drifting clouds
  for (let i = 0; i < 6; i++) {
    const x = ((tNow * 12 + i * 260) % (W + 300)) - 150;
    const y = 60 + i * 74;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.ellipse(x, y, 150, 26, 0, 0, 7); ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd257';
  ctx.font = 'bold 54px Georgia, serif';
  ctx.fillText('SKYFORGE', W / 2, 130);
  ctx.fillStyle = '#9fc3e8'; ctx.font = 'italic 15px Georgia, serif';
  ctx.fillText('Forge your wings. Own the sky.', W / 2, 160);
  // aircraft silhouette parade
  AIRFRAMES.slice(0, 4).forEach((a, i) => {
    const x = W / 2 - 180 + i * 120, y = 240 + Math.sin(tNow * 2 + i) * 6;
    ctx.save(); ctx.translate(x, y); ctx.scale(0.9, 0.9);
    ctx.fillStyle = save.owned.includes(a.id) ? a.color : 'rgba(120,140,160,0.35)';
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(7, 0); ctx.lineTo(0, 19); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
    ctx.fillRect(-28, 4, 56, 5);
    ctx.restore();
    ctx.fillStyle = '#7d9cbf'; ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(a.id.toUpperCase(), x, y + 40);
  });
  // pilot profile strip
  const lv = levelOf(save.xp);
  ctx.fillStyle = '#eaf2f8'; ctx.font = 'bold 14px ui-monospace, monospace';
  ctx.fillText(`${rankOf(save.xp)} — PILOT LV ${lv}`, W / 2, 336);
  ctx.font = '12px ui-monospace, monospace'; ctx.fillStyle = '#9fc3e8';
  const kills = save.stats.kills, landings = save.stats.landings;
  ctx.fillText(`CR ¢${save.credits}   SORTIES ${save.stats.sorties}   KILLS ${kills}   LANDINGS ${landings}`, W / 2, 360);
  // medals row
  const medalList = MEDALS.filter(m => save.stats.medals.includes(m.id));
  ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = '#c9a53f';
  const names = medalList.length ? medalList.map(m => m.name).join(' · ') : 'no medals yet — go earn some';
  ctx.fillText(names.slice(0, 110), W / 2, 384);
  ctx.font = 'bold 17px ui-monospace, monospace';
  ctx.fillStyle = (tNow % 1.2) < 0.75 ? '#ffd257' : 'rgba(255,210,87,0.4)';
  ctx.fillText('CLICK / SPACE — ENTER THE FLIGHT LINE', W / 2, 448);
  ctx.fillStyle = '#7d9cbf'; ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('H — HANGAR     M — MISSIONS     P — LIVERY', W / 2, 486);
  ctx.textAlign = 'left';
}

export function drawHangar(ctx, W, H, save, hover, tNow) {
  ctx.fillStyle = '#141d2b'; ctx.fillRect(0, 0, W, H);
  // hangar backdrop
  ctx.fillStyle = '#1b2739'; ctx.fillRect(0, 0, W, 130);
  ctx.strokeStyle = '#31435f';
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(40 + i * 105, 0); ctx.lineTo(40 + i * 105, 130); ctx.stroke(); }
  ctx.fillStyle = '#ffd257'; ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText('HANGAR', 26, 52);
  ctx.fillStyle = '#9fc3e8'; ctx.font = '12px ui-monospace, monospace';
  const spec = specOf(save);
  ctx.fillText(`CR ¢${save.credits}   LV ${levelOf(save.xp)} (${Math.max(0, xpForLevel(levelOf(save.xp) + 1) - save.xp)} XP to next)   P — LIVERY SHOP`, 26, 80);
  ctx.fillStyle = '#eaf2f8'; ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(`FLYING: ${spec.name} — thrust ${spec.thrust.toFixed(2)}× lift ${spec.lift.toFixed(2)}× agility ${spec.agility.toFixed(2)}× stall ${spec.stall} kts hull ${spec.hp} flares ${spec.flares}`, 26, 104);
  if (spec.parts.length) ctx.fillText(`PARTS: ${spec.parts.join(', ')}`, 26, 120);

  // airframe cards (8, 2-col)
  ctx.fillStyle = '#c9d6e8'; ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.fillText('— AIRFRAMES (click to buy / equip) —', W / 2 - 170, 156);
  AIRFRAMES.forEach((a, i) => {
    const x = 24 + (i % 2) * 462, y = 168 + Math.floor(i / 2) * 72;
    const owned = save.owned.includes(a.id);
    const active = save.loadout.airframe === a.id;
    const hov = hover && hover.id === a.id && hover.kind === 'air';
    ctx.fillStyle = active ? 'rgba(255,210,87,0.12)' : hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)';
    ctx.strokeStyle = active ? '#ffd257' : '#31435f'; ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(x, y, 440, 62, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = owned ? a.color : shade(a.color, -60);
    ctx.beginPath(); ctx.moveTo(x + 40, y + 18); ctx.lineTo(x + 52, y + 34); ctx.lineTo(x + 40, y + 50); ctx.lineTo(x + 28, y + 34); ctx.closePath(); ctx.fill();
    ctx.fillRect(x + 14, y + 32, 52, 5);
    ctx.fillStyle = '#eaf2f8'; ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillText(a.name, x + 84, y + 18);
    ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = '#9fc3e8';
    ctx.fillText(a.desc, x + 84, y + 34);
    ctx.fillStyle = '#7d9cbf';
    ctx.fillText(`T${a.tier} ${a.cls}  thrust ${a.thrust}×  agi ${a.agility}  hull ${a.hp}`, x + 84, y + 50);
    ctx.fillStyle = owned ? (active ? '#ffd257' : '#7be08a') : (save.credits >= a.cost ? '#ffd257' : '#ff5a5a');
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText(owned ? (active ? '● ACTIVE' : `BUY ¢${a.cost}`) : `BUY ¢${a.cost}`, x + 356, y + 18);
  });

  // tech-tree parts grid
  ctx.fillStyle = '#c9d6e8'; ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.fillText('— PARTS: WINGS / ENGINE / ARMOR / AVIONICS (tech tree) —', W / 2 - 220, 452);
  UPGRADES.forEach((u, i) => {
    const x = 24 + (i % 5) * 186, y = 460 + Math.floor(i / 5) * 58;
    const st = partState(save, u);
    const fitted = Object.values(save.loadout).includes(u.id);
    const hov = hover && hover.id === u.id && hover.kind === 'upg';
    ctx.fillStyle = fitted ? 'rgba(255,210,87,0.12)' : hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)';
    ctx.strokeStyle = fitted ? '#ffd257' : '#31435f';
    ctx.beginPath(); ctx.roundRect(x, y, 172, 54, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eaf2f8'; ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText(u.name.slice(0, 26), x + 8, y + 14);
    ctx.font = '8px ui-monospace, monospace'; ctx.fillStyle = '#9fc3e8';
    
    ctx.fillStyle = u.slot === 'wings' ? '#7bc0e8' : u.slot === 'engine' ? '#ffcf5a' : u.slot === 'armor' ? '#7be08a' : '#d9a0e8';
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillText(`T${u.tier} ${u.slot.toUpperCase()}`, x + 8, y + 30);
    ctx.fillStyle = st.owned ? (fitted ? '#ffd257' : '#7be08a') : st.reason ? '#8899aa' : (save.credits >= u.cost ? '#ffd257' : '#ff5a5a');
    ctx.font = 'bold 10px ui-monospace, monospace';
    if (st.owned) ctx.fillText(fitted ? '● FITTED' : 'FIT [F]', x + 96, y + 30);
    else if (st.reason) ctx.fillText(st.reason === 'insufficient credits' ? `BUY ¢${u.cost}` : 'LOCKED', x + 96, y + 30);
    else ctx.fillText(`BUY ¢${u.cost}`, x + 96, y + 30);
  });
  ctx.fillStyle = '#7d9cbf'; ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('ESC — BACK', 26, H - 16);
}

export function drawLivery(ctx, W, H, save, hover) {
  ctx.fillStyle = '#101622'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd257'; ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText('LIVERY SHOP', 26, 54);
  ctx.fillStyle = '#9fc3e8'; ctx.font = '12px ui-monospace, monospace';
  ctx.fillText(`CR ¢${save.credits}   new paint ¢150   click to preview / buy`, 26, 80);
  LIVERY_PALETTES.forEach((p, i) => {
    const x = 30 + (i % 4) * 228, y = 110 + Math.floor(i / 4) * 150;
    const unlocked = save.livery.unlocked.includes(p.id);
    const active = save.livery.palette === p.id;
    const hov = hover && hover.id === p.id;
    ctx.fillStyle = active ? 'rgba(255,210,87,0.12)' : hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)';
    ctx.strokeStyle = active ? '#ffd257' : '#31435f';
    ctx.beginPath(); ctx.roundRect(x, y, 208, 130, 10); ctx.fill(); ctx.stroke();
    // paint chip: fuselage swatch in the palette
    const body = p.body || '#5f8fd9', trim = p.trim || '#eaf2f8';
    ctx.fillStyle = unlocked ? body : shade(body, -70);
    ctx.beginPath(); ctx.moveTo(x + 104, y + 26); ctx.lineTo(x + 118, y + 66); ctx.lineTo(x + 104, y + 96); ctx.lineTo(x + 90, y + 66); ctx.closePath(); ctx.fill();
    ctx.fillStyle = unlocked ? trim : shade(trim, -70);
    ctx.fillRect(x + 44, y + 60, 120, 6);
    ctx.fillStyle = '#eaf2f8'; ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText(p.name, x + 14, y + 114);
    ctx.fillStyle = unlocked ? (active ? '#ffd257' : '#7be08a') : (save.credits >= 150 ? '#ffd257' : '#ff5a5a');
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText(unlocked ? (active ? '● WEARING' : 'WEAR') : '¢150', x + 150, y + 114);
  });
  ctx.fillStyle = '#7d9cbf'; ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('ESC — BACK TO HANGAR', 26, H - 16);
}

export function drawMissions(ctx, W, H, save, hover, tNow = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0f1a29'); g.addColorStop(1, '#16283f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd257'; ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText('FLIGHT LINE — PICK A SORTIE', 26, 48);
  const lv = levelOf(save.xp);
  ctx.fillStyle = '#9fc3e8'; ctx.font = '12px ui-monospace, monospace';
  ctx.fillText(`LV ${lv} ${rankOf(save.xp)} — locked sorties unlock as you rank up`, 26, 70);
  MISSIONS.forEach((m, i) => {
    const x = 26, y = 88 + i * 66;
    const hov = hover && hover.id === m.id && hover.kind === 'mis';
    const unlocked = missionUnlocked(save, m);
    const best = save.stats.bestScore[m.id];
    ctx.fillStyle = !unlocked ? 'rgba(255,255,255,0.02)' : hov ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';
    ctx.strokeStyle = unlocked ? '#31435f' : '#22304a';
    ctx.beginPath(); ctx.roundRect(x, y, W - 52, 56, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = unlocked ? '#eaf2f8' : '#5a6a80'; ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillText(unlocked ? m.name : `${m.name}  [LV ${m.unlock?.level} REQUIRED]`, x + 18, y + 24);
    ctx.fillStyle = unlocked ? '#9fc3e8' : '#5a6a80'; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(m.goal, x + 18, y + 44);
    if (unlocked) {
      ctx.fillStyle = '#7d9cbf';
      ctx.fillText(`rings ${m.rings || '∞'}   ${m.foes ? `bandits ${m.foes}   ` : ''}reward ¢${m.reward}`, x + 520, y + 24);
      if (best) { ctx.fillStyle = '#ffd257'; ctx.fillText(`best ★${best.stars}  ${best.score}`, x + 520, y + 44); }
      ctx.fillStyle = '#ffd257'; ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText('FLY [ENTER]', x + W - 150, y + 36);
    }
  });
  ctx.fillStyle = '#7d9cbf'; ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('ESC — BACK', 26, H - 16);
}

export function drawResults(ctx, W, H, result, save) {
  ctx.fillStyle = 'rgba(8,14,22,0.86)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = result.ok ? '#ffd257' : '#ff5a5a';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText(result.ok ? 'SORTIE COMPLETE' : 'SORTIE FAILED', W / 2, 150);
  ctx.fillStyle = '#eaf2f8'; ctx.font = '14px ui-monospace, monospace';
  const lines = result.lines || [];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 210 + i * 26));
  // medals cabinet
  const got = MEDALS.filter(m => save.stats.medals.includes(m.id));
  if (got.length) {
    ctx.fillStyle = '#c9a53f'; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`MEDALS ${got.length}/${MEDALS.length}`, W / 2, H - 140);
  }
  ctx.fillStyle = (Date.now() / 600 % 2) < 1 ? '#ffd257' : 'rgba(255,210,87,0.4)';
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.fillText('SPACE — FLIGHT LINE', W / 2, H - 90);
  ctx.textAlign = 'left';
}

export function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

// hit-test helper for hangar clicks (airframes, parts with slots, liveries)
export function hangarHit(mx, my, save) {
  for (let i = 0; i < AIRFRAMES.length; i++) {
    const x = 24 + (i % 2) * 462, y = 168 + Math.floor(i / 2) * 72;
    if (mx >= x && mx <= x + 440 && my >= y && my <= y + 76) return { kind: 'air', id: AIRFRAMES[i].id };
  }
  for (let i = 0; i < UPGRADES.length; i++) {
    const x = 24 + (i % 5) * 186, y = 460 + Math.floor(i / 5) * 58;
    if (mx >= x && mx <= x + 172 && my >= y && my <= y + 72) return { kind: 'upg', id: UPGRADES[i].id, slot: UPGRADES[i].slot };
  }
  return null;
}
export function liveryHit(mx, my) {
  for (let i = 0; i < LIVERY_PALETTES.length; i++) {
    const x = 30 + (i % 4) * 228, y = 110 + Math.floor(i / 4) * 150;
    if (mx >= x && mx <= x + 208 && my >= y && my <= y + 130) return { kind: 'liv', id: LIVERY_PALETTES[i].id };
  }
  return null;
}
export function missionHit(mx, my) {
  for (let i = 0; i < MISSIONS.length; i++) {
    const y = 88 + i * 66;
    if (my >= y && my <= y + 56) return { kind: 'mis', id: MISSIONS[i].id };
  }
  return null;
}
