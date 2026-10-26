/**
 * A droplet of glass that follows the pointer on an underdamped spring. It
 * stretches with speed, shrinks over controls, and (in the shader) merges with
 * any glass panel it touches.
 *
 * The shader draws it beneath the page's text. Where it should sit above the
 * text instead (the title screen), it is drawn by an HTML layer on top of
 * everything, with the same spring, size and stretch.
 */
export class Cursor {
  constructor(layer) {
    this.drop = layer.querySelector('.cursor-drop');
    this.dot = layer.querySelector('.cursor-dot');
    this.onTop = 0; // 0 = drawn in the shader, 1 = drawn above the text
    this.onTopTarget = 0;

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
    this.onTop += (this.onTopTarget - this.onTop) * (1 - Math.exp(-dt * 8));
  }

  /** Draw the cursor above the page's text (true) or in the shader (false). */
  setOnTop(onTop) {
    this.onTopTarget = onTop ? 1 : 0;
  }

  writeUniforms(u, dpr, viewportHeight) {
    const inShader = this.visible * (1 - this.onTop);
    u.uCursor.value.set(this.pos.x * dpr, (viewportHeight - this.pos.y) * dpr, this.radius * dpr, inShader);
    u.uCursorVel.value.set(this.vel.x * dpr, -this.vel.y * dpr);
    u.uPointer.value.set(this.target.x * dpr, (viewportHeight - this.target.y) * dpr, inShader);
    this._writeLayer();
  }

  // Same stretch as sdDroplet in the composite shader.
  _writeLayer() {
    const shown = (this.visible * this.onTop).toFixed(3);
    this.drop.style.opacity = shown;
    this.dot.style.opacity = shown;
    if (shown === '0.000') return;
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const stretch = 1 + Math.min(speed / 2600, 0.55);
    const angle = speed > 1 ? Math.atan2(this.vel.y, this.vel.x) : 0;
    const s = this.radius / 17;
    this.drop.style.transform =
      `translate(${this.pos.x}px, ${this.pos.y}px) rotate(${angle}rad) ` +
      `scale(${(stretch * s).toFixed(3)}, ${(s / Math.sqrt(stretch)).toFixed(3)})`;
    this.dot.style.transform = `translate(${this.target.x}px, ${this.target.y}px)`;
  }
}
