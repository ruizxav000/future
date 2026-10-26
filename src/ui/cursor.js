/**
 * A droplet of glass that follows the pointer on an underdamped spring. It
 * stretches with speed, shrinks over controls, and (in the shader) merges with
 * any glass panel it touches.
 */
export class Cursor {
  constructor() {
    this.target = { x: -100, y: -100 };
    this.pos = { x: -100, y: -100 };
    this.vel = { x: 0, y: 0 };
    this.radius = 0;
    this.visible = 0;
    this.inside = false;
    this.overControl = false;
    this.normalized = { x: 0, y: 0 };

    window.addEventListener('pointermove', (e) => {
      if (!this.inside) {
        this.pos.x = e.clientX;
        this.pos.y = e.clientY;
      }
      this.inside = true;
      this.target.x = e.clientX;
      this.target.y = e.clientY;
      this.normalized.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.normalized.y = -((e.clientY / window.innerHeight) * 2 - 1);
      this.overControl = !!e.target.closest?.('button, a, [role="switch"]');
    });
    document.documentElement.addEventListener('pointerleave', () => (this.inside = false));
  }

  update(dt) {
    const k = 260;
    const c = 19;
    // Fixed substeps with semi-implicit Euler keep the spring stable even when
    // the frame rate collapses.
    const steps = Math.ceil(dt / (1 / 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const axis of ['x', 'y']) {
        const a = (this.target[axis] - this.pos[axis]) * k - this.vel[axis] * c;
        this.vel[axis] += a * h;
        this.pos[axis] += this.vel[axis] * h;
      }
    }
    const goalR = this.overControl ? 9 : 17;
    this.radius += (goalR - this.radius) * (1 - Math.exp(-dt * 12));
    this.visible += ((this.inside ? 1 : 0) - this.visible) * (1 - Math.exp(-dt * 10));
  }

  writeUniforms(u, dpr, viewportHeight) {
    u.uCursor.value.set(this.pos.x * dpr, (viewportHeight - this.pos.y) * dpr, this.radius * dpr, this.visible);
    u.uCursorVel.value.set(this.vel.x * dpr, -this.vel.y * dpr);
    u.uPointer.value.set(this.target.x * dpr, (viewportHeight - this.target.y) * dpr, this.visible);
  }
}
