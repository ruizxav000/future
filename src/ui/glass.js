import { MAX_PANELS } from '../render/pipeline.js';

/**
 * Mirrors every [data-glass] element into the composite shader each frame:
 * position, size, corner radius and opacity. The DOM keeps the text and the
 * hit-testing; the GPU draws the glass.
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
    }));
  }

  update(dpr, viewportHeight) {
    const { uPanels, uPanelRadius, uPanelAlpha } = this.u;
    let n = 0;
    for (const { el, style } of this.elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || style.visibility === 'hidden' || style.display === 'none') continue;
      const alpha = effectiveOpacity(el);
      if (alpha < 0.01) continue;
      uPanels.value[n].set(
        (rect.left + rect.width / 2) * dpr,
        (viewportHeight - (rect.top + rect.height / 2)) * dpr,
        (rect.width / 2) * dpr,
        (rect.height / 2) * dpr
      );
      uPanelRadius.value[n] = (parseFloat(style.borderTopLeftRadius) || 0) * dpr;
      uPanelAlpha.value[n] = alpha;
      n++;
    }
    this.u.uPanelCount.value = n;
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
