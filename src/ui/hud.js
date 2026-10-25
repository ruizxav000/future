import {
  formatShip,
  formatEarth,
  formatRadius,
  formatDistance,
  properDistance,
  formatDilation,
} from '../physics/relativity.js';

/** Mission telemetry, refreshed at a readable rate rather than every frame. */
export class Hud {
  constructor(root) {
    const q = (sel) => root.querySelector(sel);
    this.el = {
      radius: q('[data-t="radius"]'),
      distance: q('[data-t="distance"]'),
      dilation: q('[data-t="dilation"]'),
      meter: q('[data-t="meter"]'),
      blueshift: q('[data-t="blueshift"]'),
      ship: q('[data-t="ship"]'),
      earth: q('[data-t="earth"]'),
      earthRow: q('[data-t="earth-row"]'),
      perSecond: q('[data-t="per-second"]'),
      render: q('[data-t="render"]'),
    };
    this._accum = 1;
    this._fps = 60;
  }

  flashDay() {
    const row = this.el.earthRow;
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
  }

  update(dt, { rm1, clock, scale, steps }) {
    this._fps += (1 / Math.max(dt, 1e-3) - this._fps) * 0.05;
    this._accum += dt;
    if (this._accum < 1 / 20) return;
    this._accum = 0;

    const g = clock.gamma;
    const e = this.el;
    e.radius.textContent = formatRadius(rm1);
    e.distance.textContent = formatDistance(properDistance(rm1));
    e.dilation.textContent = `γ ${formatDilation(g)}`;
    e.meter.style.setProperty('--fill', Math.min(1, Math.log10(g) / 5).toFixed(4));
    e.blueshift.textContent = `×${formatDilation(g)}`;
    e.ship.textContent = formatShip(clock.ship);
    e.earth.textContent = formatEarth(clock.earth);
    e.perSecond.textContent = perSecondPhrase(g);
    e.render.textContent = `RENDER ${scale.toFixed(2)}× · ${steps} STEPS · ${Math.round(this._fps)} FPS`;
  }
}

function perSecondPhrase(g) {
  if (g < 1.0005) return '1 s here ≈ 1 s home';
  if (g < 60) return `1 s here = ${g.toFixed(2)} s home`;
  if (g < 3600) return `1 s here = ${(g / 60).toFixed(1)} min home`;
  if (g < 86400) return `1 s here = ${(g / 3600).toFixed(1)} h home`;
  return `1 s here = ${(g / 86400).toFixed(1)} days home`;
}
