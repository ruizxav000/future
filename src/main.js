import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';

import { Pipeline } from './render/pipeline.js';
import { Director } from './story/director.js';
import { STAGES } from './story/stages.js';
import { MissionClock } from './physics/relativity.js';
import { AudioEngine } from './audio/engine.js';
import { GlassLayer } from './ui/glass.js';
import { Cursor } from './ui/cursor.js';
import { Narrator } from './ui/narrator.js';
import { Hud } from './ui/hud.js';

const IMAX_ASPECT = 2.39;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

if (supportsWebGL2()) {
  boot();
} else {
  document.body.classList.add('no-gl');
  $('ui').hidden = true;
  $('fallback').hidden = false;
}

function supportsWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

function boot() {
  const body = document.body;
  const fixedScale = params.has('scale') ? parseFloat(params.get('scale')) : null;
  const pipeline = new Pipeline($('gl'), { fixedScale });
  const U = pipeline.composite.uniforms;
  const B = pipeline.blackhole.uniforms;

  const director = new Director(STAGES);
  const clock = new MissionClock();
  const audio = new AudioEngine();
  const glass = new GlassLayer(U);
  const cursor = new Cursor();
  const hud = new Hud(document.querySelector('.telemetry'));
  const narrator = new Narrator($('narr-title'), $('narr-body'));

  const narration = $('narration');
  const proceedBtn = $('proceed');

  let started = false;
  let time = 0;
  let doppler = 1;
  let dopplerTarget = 1;
  let letterbox = 1; // 0..1, animated
  let letterboxTarget = 1;
  let fade = 0;
  let fadeTarget = 1;
  let pendingNarration = null;
  let lastBarPx = -1;

  // ---------------------------------------------------------- story flow

  function setStageUI(index) {
    const s = STAGES[index];
    $('chapter-num').textContent = s.chapter;
    $('chapter-name').textContent = s.name;
    $('narr-label').textContent = `${s.chapter} — ${s.name}`;
    $('proceed-label').textContent = s.proceedLabel || 'Proceed';
    [...$('pips').children].forEach((pip, i) => pip.classList.toggle('on', i < index));
  }

  function speak(index) {
    const s = STAGES[index];
    const title = typeof s.title === 'function' ? s.title(clock) : s.title;
    const text = typeof s.body === 'function' ? s.body(clock) : s.body;
    narration.classList.remove('is-out');
    narrator.say(title, text);
  }

  function go(index, { instant = false } = {}) {
    const s = STAGES[index];
    director.goTo(index, { instant });
    audio.setMode(s.audio);
    letterboxTarget = s.letterbox ? 1 : 0;
    setStageUI(index);
    narration.classList.add('is-out');
    if (instant) {
      speak(index);
      narrator.finish();
      pendingNarration = null;
    } else {
      // Narration lands as the flight settles.
      pendingNarration = { index, at: 0.62 };
    }
  }

  function begin() {
    if (started) return;
    started = true;
    audio.start();
    audio.blip(660);
    clock.reset();
    body.classList.replace('state-intro', 'state-story');
    go(1);
  }

  function replay() {
    fadeTarget = 0;
    narration.classList.add('is-out');
    setTimeout(() => {
      director.goTo(0, { instant: true });
      clock.reset();
      fadeTarget = 1;
      go(1);
    }, 1600);
  }

  function proceed() {
    if (!started) return begin();
    if (director.moving || fadeTarget === 0) return;
    if (!narrator.done) return narrator.finish();
    audio.blip(director.index === STAGES.length - 1 ? 440 : 880);
    const next = director.index + 1;
    if (next >= STAGES.length) replay();
    else go(next);
  }

  // ---------------------------------------------------------- controls

  $('begin').addEventListener('click', begin);
  proceedBtn.addEventListener('click', proceed);

  document.querySelectorAll('[data-doppler]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dopplerTarget = parseFloat(btn.dataset.doppler);
      document.querySelectorAll('[data-doppler]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      audio.blip(dopplerTarget ? 990 : 740);
    });
  });

  const soundBtn = $('sound');
  function toggleSound() {
    const muted = !audio.muted;
    audio.setMuted(muted);
    soundBtn.setAttribute('aria-checked', String(!muted));
    soundBtn.querySelector('b').textContent = muted ? 'Off' : 'On';
  }
  soundBtn.addEventListener('click', toggleSound);

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const onButton = e.target instanceof HTMLButtonElement;
    if ((e.key === ' ' || e.key === 'Enter') && onButton) return; // the button's own click handles it
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      proceed();
    } else if (e.key === 'h' || e.key === 'H') {
      body.classList.toggle('ui-hidden');
    } else if (e.key === 'm' || e.key === 'M') {
      toggleSound();
    }
  });

  // Browsers only allow audio after a gesture; deep links start it on first click.
  window.addEventListener('pointerdown', () => started && audio.start(), { once: false });

  // ---------------------------------------------------------- layout

  function resize() {
    pipeline.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  // Deep links for development: ?stage=3, ?ui=0, ?scale=0.5
  if (params.has('stage')) {
    const index = Math.max(1, Math.min(STAGES.length - 1, parseInt(params.get('stage'), 10) || 1));
    started = true;
    body.classList.replace('state-intro', 'state-story');
    go(index, { instant: true });
    letterbox = letterboxTarget;
    fade = 1;
  }
  if (params.get('ui') === '0') body.classList.add('ui-hidden');

  // ---------------------------------------------------------- frame loop

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const rawMs = now - last;
    last = now;
    const dt = Math.min(rawMs / 1000, 0.1);
    time += dt;

    cursor.update(dt);
    const cam = director.update(dt, time, cursor.normalized);

    if (started) {
      const days = clock.advance(dt, cam.rm1);
      if (days > 0) {
        audio.tick();
        hud.flashDay();
      }
    }

    if (pendingNarration && director.progress >= pendingNarration.at) {
      speak(pendingNarration.index);
      pendingNarration = null;
    }
    narrator.update(dt);
    proceedBtn.classList.toggle('waiting', director.moving || !narrator.done);

    // Smoothed state.
    const ease = (rate) => 1 - Math.exp(-dt * rate);
    doppler += (dopplerTarget - doppler) * ease(3);
    letterbox += (letterboxTarget - letterbox) * ease(1.1);
    fade += (fadeTarget - fade) * ease(fadeTarget ? 1.2 : 2.5);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const barFraction = Math.max(0, (1 - w / h / IMAX_ASPECT) / 2) * letterbox;
    const barPx = Math.round(barFraction * h);
    if (barPx !== lastBarPx) {
      document.documentElement.style.setProperty('--bar', `${barPx}px`);
      lastBarPx = barPx;
    }

    // Black hole uniforms.
    B.uTime.value = time;
    B.uDiskTime.value += dt;
    B.uCamPos.value.copy(cam.pos);
    B.uCamRight.value.copy(cam.right);
    B.uCamUp.value.copy(cam.up);
    B.uCamFwd.value.copy(cam.fwd);
    B.uLapse.value = cam.lapseVisual;
    B.uDoppler.value = doppler;

    // Composite uniforms.
    const dpr = pipeline.dpr;
    U.uTime.value = time;
    U.uBar.value = barFraction;
    U.uFade.value = fade;
    U.uExposure.value = cam.exposure;
    const lx = -0.55 + cursor.normalized.x * 0.35;
    const ly = 0.83 + cursor.normalized.y * 0.2;
    const ll = Math.hypot(lx, ly);
    U.uLight.value.set(lx / ll, ly / ll);
    glass.update(dpr, h);
    cursor.writeUniforms(U, dpr, h);

    hud.update(dt, { rm1: cam.rm1, clock, scale: pipeline.scale, steps: B.uMaxSteps.value });

    const proximity = Math.min(1, Math.max(0, 1 - Math.log10(cam.rm1 + 1) / 2));
    audio.update(proximity, director.motion);

    pipeline.render();
    pipeline.adapt(rawMs, now);
  }
  requestAnimationFrame(frame);

  // For debugging in the console.
  window.future = { pipeline, director, clock, audio, cursor, go };
}
