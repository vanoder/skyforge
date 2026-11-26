// SkyForge — flight model: forces, attitude integration, stall, G, damage,
// weather (wind push, turbulence, storm lightning damage), stall-recovery tracking.
import { CFG } from './config.js';

export function newPlane(spec, pos, headingDeg) {
  return {
    pos: { ...pos }, vel: { x: 0, y: 0, z: 0 },
    pitch: 0, roll: 0, heading: headingDeg * Math.PI / 180,
    throttle: 0.65, speed: 0, ias: 0, g: 1,
    fuel: spec.fuelMax, damage: 0, stalled: false, onGround: true,
    smoke: 0, alarms: [], wasStalled: false, flaresLeft: spec.flares,
    flareCd: 0, missileCd: 0, lockPulse: 0,
  };
}

export function stepFlight(p, spec, ctl, terrain, dt, tNow) {
  const A = spec.agility;
  // fly-by-wire input filtering: smoothed rate limiter on pitch/roll commands
  p.fbwPitch = p.fbwPitch === undefined ? ctl.pitch : p.fbwPitch + (ctl.pitch - p.fbwPitch) * Math.min(1, dt * 9);
  p.fbwRoll = p.fbwRoll === undefined ? ctl.roll : p.fbwRoll + (ctl.roll - p.fbwRoll) * Math.min(1, dt * 11);
  // G-limiter: bleed off commanded pitch as predicted G approaches HARD_G (soft wall, not hard clamp)
  const predictedG = 1 + Math.abs(p.fbwPitch) * CFG.PITCH_RATE * A * p.speed / 28;
  let gTrim = 1;
  if (predictedG > CFG.HARD_G * 0.92) gTrim = Math.max(0.12, (CFG.HARD_G * 0.92) / predictedG);
  const ctlF = { pitch: p.fbwPitch * gTrim, roll: p.fbwRoll, yaw: ctl.yaw, throttle: ctl.throttle };
  p.gLimiting = gTrim < 0.98;
  // controls: pitch [-1..1], roll, yaw, throttle delta
  p.throttle = Math.max(0, Math.min(CFG.MAX_THROTTLE, p.throttle + ctlF.throttle * CFG.THROTTLE_RATE * dt));
  if (!p.onGround) {
    p.pitch += ctlF.pitch * CFG.PITCH_RATE * A * dt;
    p.roll += ctlF.roll * CFG.ROLL_RATE * A * dt;
    p.heading += (ctlF.yaw + Math.sin(p.roll) * 0.8) * CFG.YAW_RATE * A * dt;
  } else {
    p.heading += ctl.yaw * CFG.YAW_RATE * 0.5 * A * dt;
  }
  p.pitch = Math.max(-1.35, Math.min(1.35, p.pitch));
  p.roll = Math.max(-3.1, Math.min(3.1, p.roll));
  // auto-center roll slightly (static stability)
  if (Math.abs(ctl.roll) < 0.05) p.roll *= Math.pow(0.6, dt);

  // forward basis
  const fx = Math.sin(p.heading) * Math.cos(p.pitch);
  const fy = Math.sin(p.pitch);
  const fz = Math.cos(p.heading) * Math.cos(p.pitch);

  // weather: wind push + turbulence near storm cells
  const wind = terrain.wind(p.pos.x, p.pos.y, p.pos.z, tNow);
  let turbAcc = 0;
  if (wind.turb > 0 && !p.onGround) {
    turbAcc = wind.turb * 34 * Math.sin(tNow * 13.7 + p.pos.x) * Math.cos(tNow * 9.1);
    if (wind.turb > 0.5) p.alarms.push({ t: 0.3, text: 'TURBULENCE', kind: 'warn' });
  }

  // thrust & fuel
  const thrust = spec.thrust * p.throttle * 52 * (p.damage > 60 ? 0.7 : 1);
  const burn = CFG.FUEL_BURN * spec.burn * (0.35 + p.throttle * 0.9) * (spec.leak ?? 1);
  p.fuel = Math.max(0, p.fuel - burn * dt * (p.onGround ? 0.25 : 1));
  if (p.fuel <= 0) thrust *= 0.05;

  // speed along nose + gravity component
  const acc = thrust - Math.sin(p.pitch) * CFG.GRAVITY;
  p.speed += acc * dt;
  // drag rises with AoA proxy (|pitch - flightpath|) and G
  const drag = CFG.DRAG * p.speed * p.speed * spec.drag + CFG.INDUCED_DRAG * Math.abs(ctlF.pitch) * p.speed;
  p.speed -= drag * dt * (p.speed > 0 ? 1 : 0);

  // stall envelope
  p.ias = p.speed;
  const lift = spec.lift * p.speed * p.speed * CFG.LIFT_K / 1200;
  p.stalled = !p.onGround && p.speed < spec.stall * (1 - 0.25 * Math.min(1, lift));
  if (p.stalled) {
    p.wasStalled = true;
    p.pitch -= 0.9 * dt;           // nose drops
    p.vel.y -= 26 * dt;
    p.roll += Math.sin(p.heading * 7) * 0.6 * dt;
  } else if (p.wasStalled) {
    p.wasStalled = false;
    p.stallRecovered = true;       // for the STALLION medal
  }

  // vertical: climb from pitch & lift, sink otherwise
  const climb = fy * p.speed * 0.72 + (lift - 1) * 14;
  p.vel.x = fx * p.speed; p.vel.z = fz * p.speed;
  p.vel.y += (climb - CFG.GRAVITY * (1 - Math.min(1, lift)) - p.vel.y * 0.8 + turbAcc) * dt;
  if (p.onGround) p.vel.y = Math.max(0, p.vel.y);

  // wind drift
  p.pos.x += (p.vel.x + wind.x * (p.onGround ? 0 : 0.4)) * dt;
  p.pos.y += p.vel.y * dt;
  p.pos.z += (p.vel.z + wind.z * (p.onGround ? 0 : 0.4)) * dt;

  // G estimate
  p.g = 1 + Math.abs(ctlF.pitch) * CFG.PITCH_RATE * A * p.speed / 28 + Math.abs(turbAcc) / 40;
  p.maxGSeen = Math.max(p.maxGSeen || 0, p.g);
  if (p.g > CFG.HARD_G && !p.onGround) {
    p.damage += (p.g - CFG.HARD_G) * 9 * dt;
    p.alarms.push({ t: 0.6, text: 'OVER-G', kind: 'warn' });
  }

  // storm lightning hazard: rare strikes inside cells at low altitude
  const st = terrain.inStorm(p.pos.x, p.pos.y, p.pos.z);
  if (st && !p.onGround && Math.random() < 0.02 * st.intensity * dt * 60 / 60) {
    // chance per second scaled by intensity
    if (Math.random() < 0.06 * st.intensity) {
      p.damage += 14;
      p.lightningHit = (p.lightningHit || 0) + 1;
      p.alarms.push({ t: 1.0, text: 'LIGHTNING STRIKE', kind: 'bad' });
    }
  }

  // cooldowns
  p.flareCd = Math.max(0, p.flareCd - dt);
  p.missileCd = Math.max(0, p.missileCd - dt);
  p.lockPulse = Math.max(0, p.lockPulse - dt * 2);

  // ground interaction
  const ground = terrain.height(p.pos.x, p.pos.z);
  if (p.pos.y <= ground + 1.2) {
    const level = Math.abs(p.pitch) < 0.12 && Math.abs(p.roll) < 0.18;
    const vs = Math.abs(p.vel.y);
    if (p.onGround || (level && vs < 14 && p.speed < spec.stall + 60)) {
      p.pos.y = ground + 1.2; p.vel.y = 0; p.onGround = true;
      p.pitch *= 0.5; p.roll = 0;
      // rolling resistance only: brakes bite when the pilot pulls the throttle back,
      // otherwise the aircraft is free to accelerate to takeoff speed.
      const braking = ctl.throttle < 0 || p.throttle < 0.05;
      p.speed = Math.max(0, p.speed - (braking ? 95 : 3.5) * dt);
    } else {
      const impact = Math.hypot(p.speed, vs);
      p.damage += impact * 2.4;
      p.smoke = 1;
      if (impact > CFG.CRASH_SPEED || p.damage >= CFG.MAX_DAMAGE) return 'crash';
      p.pos.y = ground + 1.2; p.vel.y = 0; p.onGround = true;
      p.speed *= 0.6;
    }
  } else if (p.pos.y > ground + 6) p.onGround = false;

  // takeoff: rotate once flying speed is reached (or hold pitch and be patient)
  if (p.onGround && p.speed > spec.stall * 0.78 && ctl.pitch > 0.15) { p.vel.y = 11; p.onGround = false; p.rotateAt = tNow; }
  if (p.onGround && p.speed < 2 && ctl.throttle <= 0) p.speed = Math.max(0, p.speed - 20 * dt);

  // world bounds
  const B = terrain.size / 2 - 100;
  p.pos.x = Math.max(-B, Math.min(B, p.pos.x));
  p.pos.z = Math.max(-B, Math.min(B, p.pos.z));
  if (p.pos.y > 2400) { p.vel.y = Math.min(p.vel.y, 0); p.alarms.push({ t: 0.4, text: 'CEILING', kind: 'info' }); }
  return p.damage >= CFG.MAX_DAMAGE ? 'crash' : 'ok';
}

export function takeoffReady(p) { return p.speed > 0 && p.onGround; }
