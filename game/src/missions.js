// SkyForge — missions: objectives, ring tracking, combat wave control, scoring, lifecycle.
import { CFG, MISSIONS } from './config.js';
import { buildRings } from './world.js';

export function newMission(id, terrain, rng) {
  const m = MISSIONS.find(x => x.id === id) || MISSIONS[0];
  return {
    def: m, rings: buildRings(terrain, m, rng),
    idx: 0, time: 0, score: 0, state: m.free ? 'free' : 'active', cargo: m.cargo || 0,
    ringTimes: [], best: null, kills: 0, shotsHit: 0, shotsFired: 0,
    flaresUsed: 0, damageTaken: 0, lightning: 0,
  };
}

export function stepMission(ms, p, dt) {
  if (ms.state === 'complete') return;
  ms.time += dt;
  if (ms.state === 'free') return;
  const r = ms.rings[ms.idx];
  if (!r) return;
  const d = Math.hypot(p.pos.x - r.x, p.pos.y - r.y, p.pos.z - r.z);
  if (d < r.r + 26) {
    r.passed = true; ms.ringTimes.push(ms.time);
    ms.idx++; ms.score += 100 + Math.max(0, Math.round(60 - ms.ringTimes[ms.ringTimes.length - 1] * 2));
    if (ms.idx >= ms.rings.length) {
      ms.state = 'rings-done';
    }
  }
  // fuel empty far from home = abort warn
  if (p.fuel <= 0 && ms.state === 'active') ms.lowFuelTimer = (ms.lowFuelTimer || 0) + dt;
}

export function missionGrade(ms) {
  if (ms.state !== 'complete') return null;
  const t = ms.time;
  // combat missions grade on kills + time; pure races on time
  let stars;
  if (ms.def.foes > 0) {
    const killRate = ms.kills / ms.def.foes;
    stars = killRate >= 1 && t < 220 ? 3 : killRate >= 0.6 && t < 320 ? 2 : 1;
  } else {
    stars = t < 150 ? 3 : t < 240 ? 2 : 1;
  }
  const killBonus = ms.kills * 250 + ms.shotsHit * 15;
  return { time: t, stars, score: ms.score + killBonus + Math.max(0, Math.round(900 - t * 2)) };
}

export function missionOutcome(ms, p, landedHome, terrain) {
  const rw = terrain.runway;
  const home = Math.hypot(p.pos.x - rw.x, p.pos.z - rw.z) < rw.len / 2 + 60;
  if (ms.def.free) {
    ms.state = 'complete';
    return { ok: true, grade: { time: ms.time, stars: 0, score: 0 } };
  }
  if (ms.idx >= ms.rings.length && landedHome && home) {
    ms.state = 'complete';
    return { ok: true, grade: missionGrade(ms) };
  }
  return { ok: false, reason: ms.idx >= ms.rings.length ? 'land-on-runway' : 'rings-remaining' };
}
