// SkyForge — main: state machine, update loop, input wiring, combat loop, shot staging.
import { CFG, MISSIONS } from './config.js';
import { Terrain } from './world.js';
import { Input } from './input.js';
import { loadSave, persist, specOf, buyAirframe, buyUpgrade, equip, levelOf, rankOf,
         missionUnlocked, partState, checkMedals, buyLivery, setLivery } from './hangar.js';
import { newPlane, stepFlight } from './flight.js';
import { newMission, stepMission, missionOutcome } from './missions.js';
import { newCamera, updateChase, updateCockpit } from './camera.js';
import { spawnFoes, stepFoe, attachAllJink, makeBullet, makeMissile, makeFlare, inCone } from './combat.js';
import { drawSky, drawTerrain, drawRunway, drawRings, drawAircraft, drawFoe, drawTracers, drawStorm, drawClouds, drawScatter, shade } from './render.js';
import { drawHUD, drawLadder } from './hud.js';
import { drawMenu, drawHangar, drawMissions, drawResults, drawLivery, hangarHit, missionHit, liveryHit, SCREEN } from './screens.js';
import { Audio } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const W = CFG.W, H = CFG.H;
canvas.width = W; canvas.height = H;
const status = document.getElementById('status');

const q = new URLSearchParams(location.search);
const SHOT = q.get('shot') || null;
const SEED = parseInt(q.get('seed') || '7', 10) || 7;

// seeded rng for deterministic spawns
function mulberry32(a) { return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const input = new Input();
const audio = new Audio();
const save = loadSave();
const terrain = new Terrain(SEED);
const cam = newCamera();

let screen = SCREEN.MENU;
let plane = null, spec = specOf(save), mission = null, result = null;
let hover = null, last = performance.now(), tNow = 0;
let mouse = { x: 0, y: 0 };
let selectedMission = 0;
let lastRingIdx = 0;
let foes = [], bullets = [], missiles = [], flares = [], toasts = [];
let dayTime = 0.3; // 0..1 through the day cycle
const freeze = SHOT ? 3.2 : 0; // staged screenshots hold pose briefly

const SLOT_OF = (id) => {
  const u = { wing:'wings', eng:'engine', arm:'armor', av:'avionics' };
  for (const [k, slot] of Object.entries(u)) if (id.startsWith(k)) return slot;
  return null;
};

function toast(text, kind = 'info') { toasts.push({ text, kind, t: 2.6 }); }

function startMission(id) {
  spec = specOf(save);
  const def = MISSIONS.find(m => m.id === id);
  if (!missionUnlocked(save, def)) { toast('Locked — level up first.', 'warn'); return; }
  const rw = terrain.runway;
  plane = newPlane(spec, { x: rw.x, y: terrain.height(rw.x, rw.z) + 1.2, z: rw.z - rw.len / 2 + 40 }, 0);
  mission = newMission(id, terrain, SEED);
  const rng = mulberry32(SEED * 31 + 7);
  foes = def.foes ? spawnFoes(terrain, mission, rng, def.foes, def.aceSkill || 1) : [];
  attachAllJink(foes);
  bullets = []; missiles = []; flares = []; toasts = [];
  result = null; lastRingIdx = 0;
  dayTime = def.night ? 0.98 : 0.3;
  screen = SCREEN.FLIGHT;
  save.stats.sorties++; persist(save);
  if (def.foes) toast(`${def.foes} bandits airborne. Weapons free.`, 'warn');
  audio.init();
}

function finish(crashed) {
  const out = crashed ? { ok: false } : missionOutcome(mission, plane, plane.onGround, terrain);
  if (crashed) { save.stats.crashes++; audio.crash(); }
  else audio.chime();
  const lines = [];
  if (crashed) {
    lines.push(`Hull failure. ${mission.idx}/${mission.rings.length || 0} rings, ${mission.kills} kills.`);
  } else if (out.ok) {
    const g = out.grade;
    const reward = mission.def.reward + Math.round(g.score / 10) + mission.kills * 120;
    save.credits += reward;
    const xpGain = (CFG.XP_PER_MISSION[mission.def.id] || 150) + g.stars * 60 + mission.kills * CFG.XP_PER_KILL;
    save.xp += xpGain;
    if (mission.kills) save.stats.kills += mission.kills;
    if (!crashed && plane.damage < 5 && mission.kills >= 1) save.stats.noDamageSorties++;
    if (plane.stallRecovered) { save.stats.stallsRecovered++; plane.stallRecovered = false; }
    save.stats.maxG = Math.max(save.stats.maxG, plane.maxGSeen || 0);
    if (plane.onGround) { save.stats.landings++; save.stats.rings += mission.idx; }
    save.stats.timeFlown += mission.time;
    const prev = save.stats.bestScore[mission.def.id];
    if (!prev || g.score > prev.score) save.stats.bestScore[mission.def.id] = g;
    const newMedals = checkMedals(save);
    lines.push(`Time ${g.time.toFixed(1)}s   bandits down ${mission.kills}/${mission.def.foes || 0}`);
    lines.push(`★ ${'★'.repeat(g.stars)}${'☆'.repeat(3 - g.stars)}   score ${g.score}`);
    lines.push(`+¢${reward}   +${xpGain} XP   LV ${levelOf(save.xp)} ${rankOf(save.xp)}`);
    for (const m of newMedals) lines.push(`MEDAL EARNED — ${m.name}`);
    save.stats.medals.forEach(id => {}); // medals live in stats; list screen shows them
  } else {
    lines.push(mission.def.free ? 'Sortie ended.' :
      `Rings ${mission.idx}/${mission.rings.length} — ${out.reason === 'land-on-runway' ? 'fly back to the runway' : 'complete the chain first'}.`);
  }
  persist(save);
  result = { ...out, lines };
  screen = SCREEN.RESULTS;
}

// ---- combat helpers ----
function playerFire(dt) {
  if (!spec.gun || mission.state !== 'free' && mission.def.foes === 0) return;
  plane.gunCd = (plane.gunCd || 0) - dt;
  if (input.down('KeyF') && plane.gunCd <= 0) {
    plane.gunCd = 1 / (CFG.GUN_RATE * spec.gun);
    mission.shotsFired++;
    const ahead = {
      x: plane.pos.x + Math.sin(plane.heading) * 260,
      y: plane.pos.y + Math.sin(plane.pitch) * 260,
      z: plane.pos.z + Math.cos(plane.heading) * 260,
    };
    // aim assist: snap to nearest foe roughly in cone
    let tgt = null, best = 1e9;
    for (const f of foes) {
      if (!f.alive) continue;
      const d = Math.hypot(f.pos.x - plane.pos.x, f.pos.y - plane.pos.y, f.pos.z - plane.pos.z);
      if (d < 900 && inCone(plane.pos, plane.heading, f.pos, 1.8 * spec.lockCone) && d < best) { tgt = f; best = d; }
    }
    const aim = tgt ? tgt.pos : ahead;
    bullets.push(makeBullet(plane.pos, aim, true, null));
    audio.blip(880);
  }
  if (input.hit('KeyR') && plane.missileCd <= 0) {
    let tgt = null, best = 1e9;
    for (const f of foes) {
      if (!f.alive) continue;
      const d = Math.hypot(f.pos.x - plane.pos.x, f.pos.y - plane.pos.y, f.pos.z - plane.pos.z);
      if (d < 1600 && inCone(plane.pos, plane.heading, f.pos, spec.lockCone) && d < best) { tgt = f; best = d; }
    }
    if (tgt) {
      missiles.push(makeMissile(plane.pos, tgt, true));
      plane.missileCd = 5; plane.lockPulse = 1;
      audio.blip(300); toast(`FOX 2 — ${tgt.name}`, 'info');
    } else { toast('No lock — get in the cone (R).', 'warn'); }
  }
  if (input.hit('KeyX') && plane.flaresLeft > 0 && plane.flareCd <= 0) {
    plane.flaresLeft--; plane.flareCd = CFG.FLARE_COOLDOWN;
    for (let i = 0; i < 4; i++) flares.push(makeFlare(plane.pos));
    mission.flaresUsed++;
    for (const m of missiles) if (!m.fromPlayer && m.target === plane) m.decoyed = Math.random() < 0.75;
    audio.blip(220); toast('FLARES OUT', 'info');
  }
}

function stepCombat(dt) {
  // foes
  for (const f of foes) {
    if (!f.alive) continue;
    stepFoe(f, plane, terrain, dt, tNow, bullets);
    // foe missile launch at player
    f.missileCd -= dt;
    if (f.missileCd <= 0 && Math.hypot(f.pos.x - plane.pos.x, f.pos.z - plane.pos.z) < 1400 && inCone(f.pos, f.heading, plane.pos)) {
      f.missileCd = 10 / f.skill;
      missiles.push(makeMissile(f.pos, plane, false));
      plane.alarms.push({ t: 1.2, text: 'MISSILE INBOUND — X FLARES', kind: 'bad' });
    }
  }
  // bullets
  for (const b of bullets) {
    b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt; b.pos.z += b.vel.z * dt;
    b.life -= dt;
    if (b.fromPlayer) {
      for (const f of foes) {
        if (!f.alive) continue;
        if (Math.hypot(f.pos.x - b.pos.x, f.pos.y - b.pos.y, f.pos.z - b.pos.z) < 34) {
          f.hp -= 12; b.life = 0; mission.shotsHit++;
          f.jink();
          if (f.hp <= 0) {
            f.alive = false; mission.kills++; mission.score += 250;
            audio.blip(140); toast(`${f.name} SPLASHED`, 'good');
          }
          break;
        }
      }
    } else {
      if (Math.hypot(plane.pos.x - b.pos.x, plane.pos.y - b.pos.y, plane.pos.z - b.pos.z) < 30) {
        plane.damage += 7; plane.smoke = 1; mission.damageTaken += 7; b.life = 0;
        plane.alarms.push({ t: 0.5, text: 'TAKING FIRE', kind: 'bad' });
      }
    }
  }
  bullets = bullets.filter(b => b.life > 0);
  // missiles
  for (const m of missiles) {
    m.life -= dt;
    const tgt = m.decoyed && m.flareTarget ? m.flareTarget : null;
    let aim = tgt ? tgt.pos : (m.target && (m.target.alive !== false) ? m.target.pos : null);
    // player missiles lose lock if target dies
    if (!m.fromPlayer && m.target === plane) {
      // flares may decoy
      if (m.decoyed) {
        if (!m.flareTarget && flares.length) m.flareTarget = flares[flares.length - 1];
        aim = m.flareTarget ? m.flareTarget.pos : null;
      }
    }
    if (aim) {
      const d = Math.max(1, Math.hypot(aim.x - m.pos.x, aim.y - m.pos.y, aim.z - m.pos.z));
      m.speed = Math.min(CFG.MISSILE_SPEED, m.speed + 400 * dt);
      m.pos.x += (aim.x - m.pos.x) / d * m.speed * dt;
      m.pos.y += (aim.y - m.pos.y) / d * m.speed * dt;
      m.pos.z += (aim.z - m.pos.z) / d * m.speed * dt;
      const hitD = m.fromPlayer ? 40 : 26;
      if (d < hitD) {
        m.life = 0;
        if (m.fromPlayer && m.target && m.target.alive) {
          m.target.hp -= 60; m.target.jink();
          if (m.target.hp <= 0) { m.target.alive = false; mission.kills++; mission.score += 250; toast(`${m.target.name} SPLASHED — MISSILE`, 'good'); audio.blip(140); }
        } else if (!m.fromPlayer) {
          plane.damage += 45; plane.smoke = 1; mission.damageTaken += 45;
          plane.alarms.push({ t: 1.2, text: 'HIT — MISSILE', kind: 'bad' });
          if (plane.damage >= CFG.MAX_DAMAGE) { finish(true); return; }
        }
      }
    }
  }
  missiles = missiles.filter(m => m.life > 0);
  // flares
  for (const fl of flares) {
    fl.life -= dt;
    fl.pos.x += fl.vel.x * dt; fl.pos.y += fl.vel.y * dt; fl.pos.z += fl.vel.z * dt;
  }
  flares = flares.filter(f => f.life > 0);
  for (const t of toasts) t.t -= dt;
  toasts = toasts.filter(t => t.t > 0);
}

const KEYS = {
  pitchUp: ['ArrowDown', 'KeyS'], pitchDn: ['ArrowUp', 'KeyW'],
  rollL: ['ArrowLeft', 'KeyA'], rollR: ['ArrowRight', 'KeyD'],
  yawL: ['KeyQ'], yawR: ['KeyE'],
  thrUp: ['ShiftLeft', 'Space'], thrDn: ['ControlLeft', 'KeyZ'],
};

function controls() {
  const pitch = input.axis(...KEYS.pitchDn, ...KEYS.pitchUp); // W/Up = pitch up
  const roll = input.axis(...KEYS.rollL, ...KEYS.rollR);
  const yaw = input.axis(...KEYS.yawL, ...KEYS.yawR);
  const throttle = (input.down(...KEYS.thrUp) ? 1 : 0) - (input.down(...KEYS.thrDn) ? 1 : 0);
  return { pitch, roll, yaw, throttle: Math.max(-1, Math.min(1, throttle + input.mouseDY * -0.002)) };
}

function update(dt) {
  if (SHOT && screen === SCREEN.FLIGHT) { tNow += dt; return; } // staged shot: render the composed pose
  tNow += dt;
  if (screen === SCREEN.MENU) {
    if (input.hit('Space', 'Enter') || input.mouseDown) { screen = SCREEN.MISSIONS; audio.init(); }
    if (input.hit('KeyH')) screen = SCREEN.HANGAR;
    if (input.hit('KeyM')) screen = SCREEN.MISSIONS;
    if (input.hit('KeyP')) screen = SCREEN.LIVERY;
  } else if (screen === SCREEN.HANGAR) {
    hover = hangarHit(mouse.x, mouse.y, save);
    if (input.mouseDown && hover) {
      if (hover.kind === 'air') {
        const owned = save.owned.includes(hover.id);
        if (owned) equip(save, 'airframe', hover.id); else buyAirframe(save, hover.id);
        audio.blip(owned ? 520 : 660);
      } else if (hover.kind === 'liv') {
        const unlocked = save.livery.unlocked.includes(hover.id);
        if (unlocked) setLivery(save, hover.id); else buyLivery(save, hover.id);
        audio.blip(700);
      } else {
        const owned = save.ownedUpgrades.includes(hover.id);
        if (owned) equip(save, hover.slot, hover.id);
        else if (!buyUpgrade(save, hover.id)) audio.blip(180);
        else audio.blip(660);
      }
      input.mouseDown = false;
    }
    if (input.hit('Escape')) screen = SCREEN.MENU;
    if (input.hit('KeyP')) screen = SCREEN.LIVERY;
  } else if (screen === SCREEN.LIVERY) {
    hover = liveryHit(mouse.x, mouse.y);
    if (input.mouseDown && hover) {
      const unlocked = save.livery.unlocked.includes(hover.id);
      if (unlocked) setLivery(save, hover.id); else buyLivery(save, hover.id);
      audio.blip(700); input.mouseDown = false;
    }
    if (input.hit('Escape')) screen = SCREEN.HANGAR;
  } else if (screen === SCREEN.MISSIONS) {
    hover = missionHit(mouse.x, mouse.y);
    if (hover) selectedMission = MISSIONS.findIndex(m => m.id === hover.id);
    if (input.hit('ArrowDown')) selectedMission = (selectedMission + 1) % MISSIONS.length;
    if (input.hit('ArrowUp')) selectedMission = (selectedMission + MISSIONS.length - 1) % MISSIONS.length;
    if (input.hit('Enter') || (input.mouseDown && hover)) {
      startMission(hover ? hover.id : MISSIONS[selectedMission].id);
      input.mouseDown = false;
    }
    if (input.hit('Escape')) screen = SCREEN.MENU;
  } else if (screen === SCREEN.FLIGHT) {
    const ctl = controls();
    const r = stepFlight(plane, spec, ctl, terrain, dt, tNow);
    if (r === 'crash') { finish(true); return; }
    stepMission(mission, plane, dt);
    if (mission.idx > lastRingIdx) { audio.ring(); lastRingIdx = mission.idx; }
    playerFire(dt);
    stepCombat(dt);
    if (foes.length && foes.every(f => !f.alive) && !mission.allDown) { mission.allDown = true; toast('AIRSPACE CLEAN', 'good'); }
    for (const a of plane.alarms) { if (a.t > 0) { a.t -= dt; if (a.t > 0.55) audio.warn(); } }
    plane.alarms = plane.alarms.filter(a => a.t > 0);
    plane.smoke = Math.max(0, plane.smoke - dt * 0.4);
    audio.engine(plane.throttle, plane.speed, terrain.wind(plane.pos.x, plane.pos.y, plane.pos.z, tNow).turb);
    if (cam.mode === 'cockpit') updateCockpit(cam, plane); else updateChase(cam, plane, dt);
    if (input.hit('KeyV')) cam.mode = cam.mode === 'chase' ? 'cockpit' : 'chase';
    if (input.hit('KeyL') || (mission.idx >= mission.rings.length && plane.onGround && plane.speed < 6)) finish(false);
    if (input.hit('Escape')) { cam.mode = 'chase'; screen = SCREEN.MENU; }
    if (mission.def.free) { dayTime = (dayTime + dt / CFG.DAY_CYCLE) % 1; }
  } else if (screen === SCREEN.RESULTS) {
    if (input.hit('Space', 'Enter')) screen = SCREEN.MISSIONS;
  }
}

function render() {
  if (screen === SCREEN.MENU) { drawMenu(ctx, W, H, save, tNow); }
  else if (screen === SCREEN.HANGAR) { drawHangar(ctx, W, H, save, hover, tNow); }
  else if (screen === SCREEN.LIVERY) { drawLivery(ctx, W, H, save, hover); }
  else if (screen === SCREEN.MISSIONS) { drawMissions(ctx, W, H, save, hover, tNow); }
  else {
    drawSky(ctx, cam, W, H, dayTime);
    drawClouds(ctx, W, H, dayTime, cam, tNow);
    drawTerrain(ctx, cam, terrain, W, H, dayTime);
    drawScatter(ctx, cam, terrain, W, H, dayTime);
    drawRunway(ctx, cam, terrain, W, H);
    drawStorm(ctx, cam, terrain, W, H, tNow);
    drawRings(ctx, cam, mission, W, H);
    drawAircraft(ctx, cam, plane, spec, W, H);
    for (const f of foes) if (f.alive) drawFoe(ctx, cam, f, W, H);
    drawTracers(ctx, cam, bullets, missiles, flares, W, H);
    drawLadder(ctx, plane, cam, W, H);
    drawHUD(ctx, plane, spec, mission, cam, W, H, tNow, foes, toasts, dayTime);
    if (screen === SCREEN.RESULTS) drawResults(ctx, W, H, result, save);
  }
  // title watermark — original identity
  ctx.fillStyle = 'rgba(255,210,87,0.82)'; ctx.font = 'bold 11px Georgia, serif';
  ctx.fillText('SKYFORGE', W - 84, H - 8);
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt); render(); input.endFrame();
  requestAnimationFrame(loop);
}

addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * W / r.width;
  mouse.y = (e.clientY - r.top) * H / r.height;
});
canvas.addEventListener('click', () => { audio.init(); input.lock(canvas); });
addEventListener('keydown', () => audio.init());
status.textContent = 'SkyForge: WASD fly, Shift/Ctrl throttle, F guns, R missile, X flares, V camera, L land, Esc menu.';
// debug hook (dev convenience, used by maker's tests, harmless in play)
window.__sf = {
  get state() { return { screen, speed: plane?.speed, pos: plane && { ...plane.pos }, cam: { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch }, ring: mission && mission.rings[mission.idx], foes: foes.filter(f => f.alive).length, dayTime }; }
};

// shot staging: deterministic scenes for real screenshots of the game itself.
if (SHOT) stage(SHOT);
function stage(which) {
  audio.init();
  if (which === 'menu') { screen = SCREEN.MENU; tNow = 3.4; return; }
  if (which === 'hangar') { screen = SCREEN.HANGAR; save.credits = 4200; save.ownedUpgrades.push('wing-foil','eng-super'); tNow = 2.1; return; }
  if (which === 'missions') { screen = SCREEN.MISSIONS; save.xp = 5200; tNow = 2.1; return; }
  screen = SCREEN.FLIGHT;
  spec = specOf(save);
  // staged screenshots use golden-hour light unless the scene is explicitly night
  if (which !== 'night') dayTime = 0.5;
  const rw = terrain.runway;
  plane = newPlane(spec, { x: rw.x, y: terrain.height(rw.x, rw.z) + 1.2, z: rw.z - rw.len / 2 + 40 }, 0);
  const whichMission = (which === 'combat' || which === 'dogfight') ? 'intercept' : 'patrol';
  mission = newMission(whichMission, terrain, SEED);
  const rng = mulberry32(SEED * 31 + 7);
  foes = mission.def.foes ? spawnFoes(terrain, mission, rng, mission.def.foes, 1) : [];
  attachAllJink(foes);
  if (which === 'flight' || which === 'play') {
    mission.idx = 2; mission.time = 47.3; mission.score = 340;
    const rg = mission.rings[2];
    const back = 420, drop = 46; // ring ahead, plane lower-center of frame
    plane.pos = { x: rg.x - Math.sin(0.5) * back, y: rg.y + drop, z: rg.z - Math.cos(0.5) * back };
    plane.heading = 0.5; plane.pitch = 0.08; plane.roll = -0.22;
    plane.speed = 96; plane.throttle = 0.82; plane.fuel = 76; plane.damage = 12; plane.onGround = false;
    plane.vel.x = Math.sin(plane.heading) * plane.speed; plane.vel.z = Math.cos(plane.heading) * plane.speed;
    updateChase(cam, plane, 1);
    cam.mode = 'chase';
  } else if (which === 'combat' || which === 'dogfight') {
    // dramatic merge: bandit crossing close ahead (visible), tracers in the air.
    // NOTE: move the plane FIRST, then place the bandit relative to it.
    mission.idx = 3; mission.time = 61.2; mission.kills = 1; mission.score = 640;
    plane.pos = { x: -150, y: 480, z: 900 };
    plane.heading = 0.3; plane.pitch = 0.05; plane.roll = -0.35;
    plane.speed = 118; plane.throttle = 0.95; plane.fuel = 64; plane.damage = 21; plane.onGround = false;
    plane.vel.x = Math.sin(plane.heading) * plane.speed; plane.vel.z = Math.cos(plane.heading) * plane.speed;
    const f0 = foes[0];
    f0.pos = { x: plane.pos.x + 78, y: plane.pos.y + 30, z: plane.pos.z + 128 };
    f0.heading = Math.PI + 0.55; f0.mode = 'attack'; f0.alive = true;
    bullets.push(makeBullet(plane.pos, f0.pos, true, null));
    bullets.push({ ...makeBullet(plane.pos, f0.pos, true, null), pos: { x: plane.pos.x + 40, y: plane.pos.y + 12, z: plane.pos.z + 60 } });
    if (foes[1]) { foes[1].pos = { x: plane.pos.x - 190, y: plane.pos.y + 60, z: plane.pos.z + 330 }; foes[1].mode = 'pursue'; }
    if (foes[2]) { foes[2].pos = { x: plane.pos.x + 260, y: plane.pos.y + 100, z: plane.pos.z + 420 }; }
    updateChase(cam, plane, 1);
    cam.mode = 'chase';
    cam.shake = 1;
  } else if (which === 'cockpit') {
    plane.pos = { x: -80, y: 260, z: 1200 };
    plane.heading = 0.05; plane.pitch = -0.04; plane.roll = 0.08;
    plane.speed = 74; plane.throttle = 0.9; plane.fuel = 48; plane.damage = 4; plane.onGround = false;
    mission.idx = 5; mission.time = 88.1;
    cam.mode = 'cockpit'; updateCockpit(cam, plane);
  } else if (which === 'night') {
    dayTime = 0.72;    plane.pos = { x: 300, y: 380, z: 200 };
    plane.heading = -0.4; plane.pitch = 0.04; plane.roll = 0.15;
    plane.speed = 88; plane.throttle = 0.8; plane.fuel = 58; plane.damage = 8; plane.onGround = false;
    mission.idx = 4; mission.time = 102.7; mission.score = 480;
    updateChase(cam, plane, 1);
    cam.mode = 'chase';
  } else if (which === 'final') {
    plane.pos = { x: 20, y: 60, z: 2920 };
    plane.heading = 0; plane.pitch = 0.02; plane.roll = 0; plane.speed = 41; plane.throttle = 0.4;
    plane.fuel = 22; plane.damage = 3; plane.onGround = false;
    mission.idx = mission.rings.length; mission.time = 163.2;
    cam.mode = 'chase'; updateChase(cam, plane, 1);
  }
}

requestAnimationFrame(loop);
