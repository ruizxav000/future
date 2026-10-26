import * as THREE from 'three';

// Matches the .intro-title text-shadow in styles.css.
const SHADOW = { blur: 24, offsetY: 2, color: 'rgba(0, 0, 0, 0.7)' };

/**
 * Draws the title screen's text into a texture the composite shader puts
 * beneath the glass, so the cursor droplet (drawn in the shader) sits above
 * the title and refracts it like everything else.
 *
 * The HTML title stays in the page for layout and screen readers, with its
 * glyphs made invisible. Every [data-gl-text] element inside the root is
 * redrawn from its live position and computed style; the root's opacity
 * (which CSS animates) fades the drawn text.
 */
export class TitleLayer {
  constructor(root, uniforms) {
    this.root = root;
    this.u = uniforms;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.u.tTitle.value = this.texture;
    root.classList.add('drawn-in-gl');

    this.dirty = true;
    const redraw = () => (this.dirty = true);
    window.addEventListener('resize', redraw);
    document.fonts?.ready.then(redraw);
    document.fonts?.addEventListener('loadingdone', redraw);
  }

  update(dpr) {
    const alpha = parseFloat(getComputedStyle(this.root).opacity);
    this.u.uTitleAlpha.value = alpha;
    if (!this.dirty || alpha <= 0) return;
    this.dirty = false;

    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    for (const el of this.root.querySelectorAll('[data-gl-text]')) drawLine(ctx, el, dpr);
    this.texture.needsUpdate = true;
  }
}

/** One line of text, laid out character by character with its letter-spacing. */
function drawLine(ctx, el, dpr) {
  const cs = getComputedStyle(el);
  const range = document.createRange();
  range.selectNodeContents(el);
  const rect = range.getBoundingClientRect();
  if (!rect.width) return;

  const text = cs.textTransform === 'uppercase' ? el.textContent.toUpperCase() : el.textContent;
  const spacing = (parseFloat(cs.letterSpacing) || 0) * dpr;
  ctx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * dpr}px ${cs.fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = cs.color;
  ctx.shadowColor = SHADOW.color;
  ctx.shadowBlur = SHADOW.blur * dpr;
  ctx.shadowOffsetY = SHADOW.offsetY * dpr;

  let x = rect.left * dpr;
  const y = (rect.top + rect.height / 2) * dpr;
  for (const ch of text.trim()) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
}
