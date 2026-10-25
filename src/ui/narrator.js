const GLYPHS = '▓▒░<>/\\|=+*:.01';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Types narration on like a transmission resolving: each character flickers
 * through noise for a moment before it locks.
 */
export class Narrator {
  constructor(titleEl, bodyEl) {
    this.titleEl = titleEl;
    this.bodyEl = bodyEl;
    this.queue = null;
    this.done = true;
    this.onTick = null;
  }

  say(title, body) {
    this.queue = { title, body, t: 0 };
    this.done = false;
    this.titleEl.textContent = '';
    this.bodyEl.textContent = '';
    if (reducedMotion.matches) this.finish();
  }

  finish() {
    if (!this.queue) return;
    this.queue.t = 1e9;
  }

  clear() {
    this.queue = null;
    this.done = true;
    this.titleEl.textContent = '';
    this.bodyEl.textContent = '';
  }

  update(dt) {
    const q = this.queue;
    if (!q || this.done) return;
    q.t += dt;
    const titleChars = q.t * 38;
    const bodyChars = Math.max(0, (q.t - q.title.length / 38 - 0.25) * 62);
    const before = this.titleEl.textContent.length + this.bodyEl.textContent.length;
    this.titleEl.textContent = resolve(q.title, titleChars);
    this.bodyEl.textContent = resolve(q.body, bodyChars);
    const after = this.titleEl.textContent.length + this.bodyEl.textContent.length;
    if (after > before && this.onTick) this.onTick();
    if (titleChars >= q.title.length + 3 && bodyChars >= q.body.length + 3) {
      this.titleEl.textContent = q.title;
      this.bodyEl.textContent = q.body;
      this.done = true;
    }
  }
}

function resolve(text, progress) {
  const locked = Math.floor(progress);
  if (locked >= text.length + 3) return text;
  let out = text.slice(0, Math.max(0, locked));
  for (let i = Math.max(0, locked); i < Math.min(text.length, locked + 3); i++) {
    out += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
  }
  return out;
}
