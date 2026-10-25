import { MAX_PANELS } from '../render/pipeline.js';

/**
 * Mirrors every [data-glass] element into the composite shader each frame:
 * position, size, corner radius and opacity. The DOM keeps the text and the
 * hit-testing; the GPU draws the glass.
 *
 * While a panel fades, the shader gathers its glass into a drop. The panel's
 * own content is clipped to the same shape so the two stay in step.
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
      clip: '',
    }));
  }

  update(dpr, viewportHeight) {
    const { uPanels, uPanelRadius, uPanelAlpha } = this.u;
    let n = 0;
    for (const entry of this.elements) {
      const { el, style } = entry;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || style.visibility === 'hidden' || style.display === 'none') continue;
      const alpha = effectiveOpacity(el);
      const radius = parseFloat(style.borderTopLeftRadius) || 0;
      drainContent(entry, alpha, radius);
      if (alpha < 0.01) continue;
      uPanels.value[n].set(
        (rect.left + rect.width / 2) * dpr,
        (viewportHeight - (rect.top + rect.height / 2)) * dpr,
        (rect.width / 2) * dpr,
        (rect.height / 2) * dpr
      );
      uPanelRadius.value[n] = radius * dpr;
      uPanelAlpha.value[n] = alpha;
      n++;
    }
    this.u.uPanelCount.value = n;
  }
}

const DROP_RADIUS = 14; // CSS px; keep in sync with composite.frag.glsl

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The same drop shape as the shader, as a clip on the panel's content.
function drainContent(entry, alpha, radius) {
  const { el } = entry;
  const t = 1 - alpha;
  const w = el.offsetWidth / 2;
  const h = el.offsetHeight / 2;
  const drop = Math.min(DROP_RADIUS, w, h);
  const gather = smoothstep(0, 0.75, t);
  const vanish = 1 - smoothstep(0.6, 1, t);
  const hx = (w + (drop - w) * gather) * vanish;
  const hy = (h + (drop - h) * gather) * vanish;
  const round = radius + (1e4 - radius) * smoothstep(0, 0.5, t);
  // Keep the text inside the glass's bright rim, which sits just inside its edge.
  const rim = 6 * smoothstep(0, 0.15, t);
  const clip =
    alpha > 0.995
      ? ''
      : `inset(${(h - hy + rim).toFixed(1)}px ${(w - hx + rim).toFixed(1)}px round ${round.toFixed(0)}px)`;
  if (clip !== entry.clip) {
    el.style.clipPath = clip;
    entry.clip = clip;
  }
}

function effectiveOpacity(el) {
  let a = 1;
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    a *= parseFloat(getComputedStyle(node).opacity);
    if (a < 0.01) break;
  }
  return a;
}
