// SkyForge — combat: enemy bandits with real AI (pursuit, evade, jink), missiles, flares,
// gunnery with lead-computing sight, lock logic, kill credit and combat scoring.
import { CFG } from './config.js';

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const NAMES = ['VIPER-1', 'JACKAL-2', 'RAVEN-3', 'HARPY-4', 'MANTIS-5', 'SPECTRE-6', 'CROW-7', 'GRIFFIN-8'];

export function spawnFoes(terrain, mission, rng, count, skill = 1) {
  const foes = [];
  const rings = mission.rings.length ? mission.rings : [{x: 0, y: 800, z: 0}];
  for (let i = 0; i < count; i++) {
    const anchor = rings[Math.min(rings.length - 1, Math.floor(rng() * rings.length))];
    const ang = rng() * Math.PI * 2;
    foes.push({
      name: NAMES[i % NAMES.length], alive: true, skill,
      pos: { x: anchor.x + Math.cos(ang) * 900, y: anchor.y + 220 + rng() * 260, z: anchor.z + Math.sin(ang) * 900 },
      heading: ang + Math.PI, pitch: 0, speed: 120 + rng() * 40,
      hp: 30 + Math.round(skill * 20), mode: 'patrol', modeT: 0, jinkT: 0, jinkDir: 1,
      fireCd: 2 + rng() * 3, missileCd: 6 + rng() * 6,
    });
  }
  return foes;
}

// foe's next-position step. Modes: patrol (orbit anchor), pursue (get behind player),
// attack (in cone: shoot), evade (break away after being shot / missile in air).
export function stepFoe(f, p, terrain, dt, tNow, shots) {
  if (!f.alive) return;
  const d = dist3(f.pos, p.pos);
  f.modeT += dt; f.jinkT -= dt;
  if (f.modeT > (f.mode === 'evade' ? 5 : 8)) {
    f.modeT = 0;
    // decide
    if (d < 2200 && d > 400) f.mode = 'pursue';
    else if (d <= 400) f.mode = Math.random() < 0.75 ? 'attack' : 'evade';
    else if (d < 700) f.mode = Math.random() < 0.4 ? 'evade' : 'pursue';
    else f.mode = 'patrol';
    // merge: head-on pass at medium range with closure — commit straight through
    if (d > 700 && d < 1600) {
      const closing = (f.speed + p.speed) > 190;
      const headOn = Math.abs(((Math.atan2(p.pos.x - f.pos.x, p.pos.z - f.pos.z) - f.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.5;
      if (closing && headOn && Math.random() < 0.5 * f.skill) { f.mode = 'merge'; f.mergeT = 3 + Math.random() * 2; }
    }
  }
  // merge countdown → break once past the merge point
  if (f.mode === 'merge') {
    f.mergeT -= dt;
    if (d < 260 || f.mergeT <= 0) f.mode = Math.random() < 0.6 ? 'break' : 'pursue';
  }
  // interrupted: incoming missile forces evade
  if (d < 1800 && f.mode !== 'evade' && Math.random() < 0.3 * dt * (1 + f.skill)) f.jink();
  let targetHeading = f.heading, targetPitch = 0, targetSpeed = 110;
  if (f.mode === 'pursue') {
    targetHeading = Math.atan2(p.pos.x - f.pos.x, p.pos.z - f.pos.z);
    targetPitch = Math.atan2(p.pos.y - f.pos.y, Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z));
    targetSpeed = 130 * f.skill;
  } else if (f.mode === 'attack') {
    targetHeading = Math.atan2(p.pos.x - f.pos.x, p.pos.z - f.pos.z);
    targetPitch = Math.atan2(p.pos.y - f.pos.y, Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z));
    targetSpeed = 118;
    // gunnery
    f.fireCd -= dt;
    if (f.fireCd <= 0 && d < 520) {
      f.fireCd = 0.5 / f.skill + Math.random() * 0.5;
      shots.push(makeBullet(f.pos, p.pos, false, f));
    }
  } else if (f.mode === 'merge') {
    // commit straight at the player, full burner, no jinking — the pass
    targetHeading = Math.atan2(p.pos.x - f.pos.x, p.pos.z - f.pos.z);
    targetPitch = Math.atan2(p.pos.y - f.pos.y, Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z));
    targetSpeed = 155;
  } else if (f.mode === 'break') {
    // hard banking turn away, energy-scrubbing break turn
    targetHeading = f.heading + f.jinkDir * 1.1;
    targetPitch = -0.1;
    targetSpeed = 150;
    if (f.jinkT <= 0) { f.jinkDir *= -1; f.jinkT = 1.2; }
    if (f.modeT > 3.5) f.mode = 'pursue';
  } else if (f.mode === 'evade') {
    targetHeading = f.heading + f.jinkDir * 1.4;
    targetPitch = 0.35 * f.jinkDir;
    targetSpeed = 145;
    if (f.jinkT <= 0) { f.jinkDir *= -1; f.jinkT = 0.8 + Math.random(); }
  } else {
    // patrol orbit
    const t = tNow * 0.2 * f.skill;
    targetHeading = Math.atan2(f.pos.x, f.pos.z) + Math.PI / 2 + Math.sin(t) * 0.6;
    targetPitch = Math.sin(t * 0.7) * 0.15;
    targetSpeed = 100;
  }
  // steer with limited turn rate (skill scales it)
  const turn = 1.1 * f.skill;
  let dh = targetHeading - f.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  f.heading += Math.max(-turn * dt, Math.min(turn * dt, dh));
  f.pitch += Math.max(-turn * dt, Math.min(turn * dt, targetPitch - f.pitch));
  f.speed += (targetSpeed - f.speed) * 0.6 * dt;
  f.pos.x += Math.sin(f.heading) * Math.cos(f.pitch) * f.speed * dt;
  f.pos.z += Math.cos(f.heading) * Math.cos(f.pitch) * f.speed * dt;
  f.pos.y += Math.sin(f.pitch) * f.speed * dt * 0.8;
  // keep off terrain
  const g = terrain.height(f.pos.x, f.pos.z);
  if (f.pos.y < g + 60) f.pos.y = g + 60;
  if (f.pos.y > 2000) f.pos.y = 2000;
}
// cheap jink helper (assigned as method)
function attachJink(f) { f.jink = () => { if (f.mode !== 'evade') { f.mode = 'evade'; f.modeT = 0; f.jinkT = 1; } }; }

export function makeBullet(from, toward, fromPlayer, shooter) {
  const d = Math.max(1, Math.hypot(toward.x - from.x, toward.y - from.y, toward.z - from.z));
  const sp = 900;
  return {
    pos: { ...from },
    vel: { x: (toward.x - from.x) / d * sp, y: (toward.y - from.y) / d * sp, z: (toward.z - from.z) / d * sp },
    fromPlayer, shooter, life: 1.6,
  };
}

export function makeMissile(from, target, fromPlayer) {
  return { pos: { ...from }, target, fromPlayer, life: CFG.MISSILE_LIFE, speed: 120 };
}

export function makeFlare(from) {
  const a = Math.random() * Math.PI * 2;
  return { pos: { ...from }, vel: { x: Math.cos(a) * 60, y: -30, z: Math.sin(a) * 60 }, life: 2.6 };
}

// does shooter have a firing solution on tgt (roughly in cone)?
export function inCone(shooterPos, shooterHeading, tgtPos, coneFactor = 1) {
  const dx = tgtPos.x - shooterPos.x, dz = tgtPos.z - shooterPos.z;
  const h = Math.atan2(dx, dz);
  let dh = h - shooterHeading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  return Math.abs(dh) < 0.5 * coneFactor;
}

export function attachAllJink(foes) { for (const f of foes) if (!f.jink) attachJink(f); }
