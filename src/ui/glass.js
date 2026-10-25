import { MAX_PANELS } from '../render/pipeline.js';

/** A hidden panel gathers into a drop this size (CSS px) before vanishing. */
const DROP_RADIUS = 14;

/**
 * Width and height each ride their own underdamped spring, like the cursor
 * droplet. Width is a little stiffer, so a panel spreads sideways slightly
 * ahead of growing tall and wobbles as it settles, the way liquid does.
 * Showing is unhurried (about 0.45s to open, 1.3s to settle, 6% overshoot);
 * hiding is quicker, but still slow enough for the gathering drop to be seen.
 */
const spring = (k, zeta) => ({ k, c: 2 * zeta * Math.sqrt(k) });
const SHOW = { x: spring(31, 0.66), y: spring(23, 0.66) };
const HIDE = { x: { k: 85, c: 11 }, y: { k: 65, c: 10 } };

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Mirrors every [data-glass] element into the composite shader each frame.
 * The DOM keeps the text and the hit-testing; the GPU draws the glass.
 *
 * CSS says whether a panel should be showing through the inherited --shown
 * property (1 or 0, with an optional --shown-delay in seconds). Each panel
 * then springs toward that state: this class computes its shape every frame
 * and hands the same shape to the shader and to the panel's content (as a
 * clip and an opacity), so glass and text always move together.
 */
export class GlassLayer {
  constructor(uniforms) {
    this.u = uniforms;
    this.refresh();
  }

  refresh() {
    this.elements = [...document.querySelectorAll('[data-glass]')].slice(0, MAX_PANELS).map((el) => ({
      el,
      style: getComputedStyle(el),
      x: null, // spring positions: 0 hidden, 1 shown (overshoot allowed)
      y: null,
      vx: 0,
      vy: 0,
      target: null,
      wait: 0,
      clip: '',
      opacity: '',
    }));
  }

  update(dt, dpr, viewportHeight) {
    const { uPanels, uPanelRadius, uPanelAlpha } = this.u;
    let n = 0;
    for (const entry of this.elements) {
      const { el, style } = entry;
      if (style.display === 'none' || style.visibility === 'hidden') {
        entry.x = null; // settle straight into place if it comes back
        continue;
      }

      const shown = parseFloat(style.getPropertyValue('--shown'));
      const target = Number.isNaN(shown) ? 1 : shown;
      if (entry.x === null) {
        entry.x = entry.y = entry.target = target;
        entry.vx = entry.vy = 0;
      }
      if (target !== entry.target) {
        entry.target = target;
        entry.wait = target > 0 ? parseFloat(style.getPropertyValue('--shown-delay')) || 0 : 0;
      }
      this._step(entry, dt);

      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const shape = dropShape(rect.width / 2, rect.height / 2, parseFloat(style.borderTopLeftRadius) || 0, entry);
      applyToContent(entry, shape, rect);
      if (shape.glass < 0.01) continue;

      uPanels.value[n].set(
        (rect.left + rect.width / 2) * dpr,
        (viewportHeight - (rect.top + rect.height / 2)) * dpr,
        shape.hx * dpr,
        shape.hy * dpr
      );
      uPanelRadius.value[n] = shape.radius * dpr;
      uPanelAlpha.value[n] = shape.glass;
      n++;
    }
    this.u.uPanelCount.value = n;
  }

  _step(entry, dt) {
    if (reducedMotion.matches) {
      entry.x = entry.y = entry.target;
      entry.vx = entry.vy = 0;
      return;
    }
    if (entry.wait > 0) {
      entry.wait -= dt;
      return;
    }
    // Fixed substeps keep the springs stable when the frame rate drops.
    const { x: sx, y: sy } = entry.target > 0 ? SHOW : HIDE;
    const steps = Math.ceil(dt / (1 / 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      entry.vx += ((entry.target - entry.x) * sx.k - entry.vx * sx.c) * h;
      entry.x += entry.vx * h;
      entry.vy += ((entry.target - entry.y) * sy.k - entry.vy * sy.c) * h;
      entry.y += entry.vy * h;
    }
    const resting =
      Math.abs(entry.x - entry.target) < 1e-3 &&
      Math.abs(entry.y - entry.target) < 1e-3 &&
      Math.abs(entry.vx) < 1e-2 &&
      Math.abs(entry.vy) < 1e-2;
    if (resting) {
      entry.x = entry.y = entry.target;
      entry.vx = entry.vy = 0;
    }
  }
}

/**
 * Below 1 a side draws in toward the drop and then shrinks away; above 1
 * (spring overshoot) it bulges a little past its resting size.
 */
function side(half, drop, s) {
  if (s >= 1) return half * (1 + (s - 1) * 0.5);
  const t = 1 - Math.max(0, s);
  return (half + (drop - half) * smoothstep(0, 0.75, t)) * (1 - smoothstep(0.6, 1, t));
}

function dropShape(w, h, radius, { x, y }) {
  const drop = Math.min(DROP_RADIUS, w, h);
  const least = Math.min(x, y);
  return {
    hx: side(w, drop, x),
    hy: side(h, drop, y),
    // Corners round off as the panel gathers, so the drop is round.
    radius: radius + (1e4 - radius) * smoothstep(0, 0.5, 1 - Math.min(1, least)),
    // The glass stays solid while it gathers, so the drop reads as a drop.
    glass: smoothstep(0, 0.35, Math.max(0, (x + y) / 2)),
    text: smoothstep(0.35, 0.9, least),
  };
}

function applyToContent(entry, shape, rect) {
  const { el } = entry;
  const settled = entry.x === 1 && entry.y === 1 && entry.target === 1;

  const opacity = settled ? '' : shape.text.toFixed(3);
  if (opacity !== entry.opacity) {
    el.style.opacity = opacity;
    entry.opacity = opacity;
  }

  let clip = '';
  if (!settled) {
    // The clip is in the element's own (untransformed) pixels; the rect may be
    // scaled by a hover transform.
    const scale = rect.width / el.offsetWidth || 1;
    const w = el.offsetWidth / 2;
    const h = el.offsetHeight / 2;
    // Keep text inside the glass's bright rim, which sits just inside its edge.
    const rim = 6 * smoothstep(0.85, 0.5, Math.min(entry.x, entry.y));
    const ix = Math.max(0, w - shape.hx / scale + rim);
    const iy = Math.max(0, h - shape.hy / scale + rim);
    clip = `inset(${iy.toFixed(1)}px ${ix.toFixed(1)}px round ${Math.round(shape.radius / scale)}px)`;
  }
  if (clip !== entry.clip) {
    el.style.clipPath = clip;
    entry.clip = clip;
  }
}
