// Keyboard / mouse input with rebindable actions and pointer lock.
import { settings } from './settings.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = new Set();
    this.mousePressed = new Set();
    this.locked = false;
    this.enabled = true;
    this.virtual = new Set(); // touch buttons + automated tests
    this.axisX = 0; // analog stick (touch), -1..1
    this.axisY = 0;
    this.touch = false;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown.add(e.button);
      this.mousePressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouseDown.delete(e.button));
    window.addEventListener('mousemove', (e) => {
      // pointer lock refused (iframe, browser policy): drag with the left button to look around
      if (!this.locked && !(this.mouseDown.has(0) && this.dragLook)) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockerror', () => { this.dragLook = true; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  requestLock() {
    if (this.canvas.requestPointerLock && !this.locked) {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => { this.dragLook = true; });
      } catch { this.dragLook = true; }
    }
  }

  releaseLock() {
    if (document.exitPointerLock && this.locked) document.exitPointerLock();
  }

  code(action) {
    return settings.bindings[action];
  }

  is(action) {
    return this.enabled && (this.down.has(this.code(action)) || this.virtual.has(action));
  }

  hit(action) {
    return this.enabled && (this.pressed.has(this.code(action)) || this.virtual.has('!' + action));
  }

  // virtual input (tests): hold(action) / tap(action)
  hold(action, on = true) { if (on) this.virtual.add(action); else this.virtual.delete(action); }
  tap(action) { this.virtual.add('!' + action); }

  consumeMouse() {
    const d = [this.mouseDX, this.mouseDY];
    this.mouseDX = this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
    for (const v of [...this.virtual]) if (v.startsWith('!')) this.virtual.delete(v);
  }
}
