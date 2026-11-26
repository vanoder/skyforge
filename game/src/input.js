// SkyForge — input: keyboard/mouse edge & state, virtual controls for shots.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();   // edge, cleared each frame
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseDown = false;
    this._onKey = (e) => {
      const k = e.code;
      if (e.type === 'keydown') {
        if (!this.keys.has(k)) this.pressed.add(k);
        this.keys.add(k);
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyS','KeyA','KeyD','ShiftLeft'].includes(k)) e.preventDefault();
      } else this.keys.delete(k);
    };
    this._onMove = (e) => { if (document.pointerLockElement) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } };
    this._onDown = () => { this.mouseDown = true; };
    this._onUp = () => { this.mouseDown = false; };
    addEventListener('keydown', this._onKey);
    addEventListener('keyup', this._onKey);
    addEventListener('mousemove', this._onMove);
    addEventListener('mousedown', this._onDown);
    addEventListener('mouseup', this._onUp);
  }
  lock(el) { if (!document.pointerLockElement) el.requestPointerLock?.(); }
  down(...codes) { return codes.some(c => this.keys.has(c)); }
  hit(...codes) { return codes.some(c => this.pressed.has(c)); }
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  // shot mode: scripted key sequence driver
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; }
}
