const GLYPHS = '▓▒░<>/\\|=+*:.01';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Types narration on like a transmission resolving: each character flickers
 * through noise for a moment before it locks.
 *
 * With `reserve`, the untyped remainder is laid out but invisible, so every
 * character appears exactly where it will end up (useful for centred text,
 * which would otherwise re-centre with each new character).
 */
export class Narrator {
  constructor(titleEl, bodyEl, { reserve = false } = {}) {
    // A narrator without a title line writes its title into a detached node.
    this.titleEl = titleEl ?? document.createElement('span');
    this.bodyEl = bodyEl;
    this.reserve = reserve;
    this.queue = null;
    this.done = true;
    this.onTick = null;
  }

  say(title, body, { delay = 0 } = {}) {
    this.queue = { title, body, t: -delay };
    this.done = false;
    this._write(this.titleEl, title, '');
    this._write(this.bodyEl, body, '');
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
    const t = Math.max(0, q.t);
    const titleChars = q.t < 0 ? -1 : t * 38;
    const bodyChars = q.t < 0 ? -1 : Math.max(-1, (t - q.title.length / 38 - 0.25) * 62);
    const shown = this.titleEl.textContent.length + this.bodyEl.textContent.length;
    const title = resolve(q.title, titleChars);
    const body = resolve(q.body, bodyChars);
    this._write(this.titleEl, q.title, title);
    this._write(this.bodyEl, q.body, body);
    if (!this.reserve && title.length + body.length > shown && this.onTick) this.onTick();
    if (titleChars >= q.title.length + 3 && bodyChars >= q.body.length + 3) {
      this._write(this.titleEl, q.title, q.title);
      this._write(this.bodyEl, q.body, q.body);
      this.done = true;
    }
  }

  _write(el, full, visible) {
    if (!this.reserve) {
      el.textContent = visible;
      return;
    }
    const rest = full.slice(visible.length);
    if (!rest) {
      el.textContent = visible;
      return;
    }
    const pending = document.createElement('span');
    pending.className = 'pending';
    pending.textContent = rest;
    el.replaceChildren(visible, pending);
  }
}

function resolve(text, progress) {
  if (progress < 0) return '';
  const locked = Math.floor(progress);
  if (locked >= text.length + 3) return text;
  let out = text.slice(0, locked);
  for (let i = locked; i < Math.min(text.length, locked + 3); i++) {
    out += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
  }
  return out;
}
