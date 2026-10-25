const GLYPHS = '▓▒░<>/\\|=+*:.01';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Types narration on like a transmission resolving: each character flickers
 * through noise for a moment before it locks.
 *
 * With `reserve`, the whole line is laid out from the start: untyped text is
 * invisible and each flickering glyph is drawn over the real character, so
 * nothing shifts. Centred text needs this; otherwise every glyph change would
 * re-centre the line.
 */
export class Narrator {
  constructor(titleEl, bodyEl, { reserve = false, speed = 1 } = {}) {
    // A narrator without a title line writes its title into a detached node.
    this.titleEl = titleEl ?? document.createElement('span');
    this.bodyEl = bodyEl;
    this.reserve = reserve;
    this.speed = speed;
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
    const titleRate = 38 * this.speed;
    const bodyRate = 62 * this.speed;
    const titleChars = q.t < 0 ? -1 : t * titleRate;
    const bodyChars = q.t < 0 ? -1 : Math.max(-1, (t - q.title.length / titleRate - 0.25) * bodyRate);
    const shown = this.titleEl.textContent.length + this.bodyEl.textContent.length;
    if (this.reserve) {
      placeInLayout(this.titleEl, q.title, titleChars);
      placeInLayout(this.bodyEl, q.body, bodyChars);
    } else {
      this.titleEl.textContent = resolve(q.title, titleChars);
      this.bodyEl.textContent = resolve(q.body, bodyChars);
      const now = this.titleEl.textContent.length + this.bodyEl.textContent.length;
      if (now > shown && this.onTick) this.onTick();
    }
    if (titleChars >= q.title.length + 3 && bodyChars >= q.body.length + 3) {
      this.titleEl.textContent = q.title;
      this.bodyEl.textContent = q.body;
      this.done = true;
    }
  }

  _write(el, full, visible) {
    if (this.reserve) placeInLayout(el, full, visible.length ? full.length + 3 : -1);
    else el.textContent = visible;
  }
}

/** Locked text, then up to three flickering glyphs over their real characters, then invisible text. */
function placeInLayout(el, text, progress) {
  if (progress >= text.length + 3) {
    el.textContent = text;
    return;
  }
  const locked = progress < 0 ? 0 : Math.floor(progress);
  const nodes = [text.slice(0, locked)];
  const scrambleEnd = progress < 0 ? 0 : Math.min(text.length, locked + 3);
  for (let i = locked; i < scrambleEnd; i++) {
    const span = document.createElement('span');
    span.className = 'pending';
    span.textContent = text[i];
    if (text[i] !== ' ') {
      span.classList.add('flicker');
      span.dataset.glyph = GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    nodes.push(span);
  }
  const rest = document.createElement('span');
  rest.className = 'pending';
  rest.textContent = text.slice(Math.max(locked, scrambleEnd));
  nodes.push(rest);
  el.replaceChildren(...nodes);
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
