// SkyForge — camera: chase and cockpit rigs, projection matrix, ground clamp.
export function newCamera() {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 1.15, mode: 'chase', shake: 0, shakeT: 0 };
}

// Chase rig: sits behind and above the aircraft, lags heading for a fluid feel.
export function updateChase(cam, p, dt) {
  const back = 26, up = 7.5;
  const tx = p.pos.x - Math.sin(p.heading) * back;
  const tz = p.pos.z - Math.cos(p.heading) * back;
  const ty = p.pos.y + up + Math.sin(p.pitch) * -6;
  const k = 1 - Math.pow(1e-7, dt); // taut chase: camera never loses the aircraft
  cam.x = cam.x + (tx - cam.x) * k;
  cam.y = cam.y + (ty - cam.y) * k;
  cam.z = cam.z + (tz - cam.z) * k;
  cam.yaw = p.heading;
  cam.pitch = p.pitch * 0.55 - 0.10; // bias down so nose+terrain stay framed
  cam.roll = p.roll * 0.35;
}

// Cockpit rig: pilot eye point, full attitude coupling.
export function updateCockpit(cam, p) {
  cam.x = p.pos.x + Math.sin(p.heading) * 3.2;
  cam.y = p.pos.y + 1.35;
  cam.z = p.pos.z + Math.cos(p.heading) * 3.2;
  cam.yaw = p.heading;
  cam.pitch = p.pitch;
  cam.roll = p.roll;
}

// Project a world point into screen space. Returns {x,y,depth,scale} or null when behind.
export function project(cam, W, H, wx, wy, wz) {
  let dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
  // yaw: camera forward is (sin yaw, cos yaw); camera-space z = dot(d, forward)
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  let rx = dx * cy - dz * sy;
  let rz = dx * sy + dz * cy;
  // pitch
  const cp = Math.cos(-cam.pitch), sp = Math.sin(-cam.pitch);
  let ry = dy * cp - rz * sp;
  let rz2 = dy * sp + rz * cp;
  // roll
  const cr = Math.cos(-cam.roll), sr = Math.sin(-cam.roll);
  const fx = rx * cr - ry * sr;
  const fy = rx * sr + ry * cr;
  if (rz2 < 1.2) return null;
  const f = (H * 0.5) / Math.tan(cam.fov * 0.5);
  return {
    x: W * 0.5 + (fx / rz2) * f,
    y: H * 0.5 - (fy / rz2) * f,
    depth: rz2,
    scale: f / rz2,
  };
}
