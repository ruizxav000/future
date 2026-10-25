import { MAX_PANELS } from '../render/pipeline.js';

/**
 * Mirrors every [data-glass] element into the composite shader each frame:
 * position, size, corner radius and opacity. The DOM keeps the text and the
 * hit-testing; the GPU draws the glass.
 *
 * While a panel fades, the shader drains its glass inward. The panel's own
 * content is clipped to the same shrinking shape so the two stay in step.
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

// Same inset as the shader: (1 - alpha) of the smaller half-size.
function drainContent(entry, alpha, radius) {
  const { el } = entry;
  const inset = ((1 - alpha) * Math.min(el.offsetWidth, el.offsetHeight)) / 2;
  const clip = alpha > 0.995 ? '' : `inset(${inset.toFixed(1)}px round ${radius}px)`;
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
