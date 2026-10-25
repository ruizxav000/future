import * as THREE from 'three';
import { lapse } from '../physics/relativity.js';

const DEG = Math.PI / 180;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// The renderer can't show the sky circle smaller than a few pixels, so the
// picture stops descending here even though the physics (and the clocks) go on.
const VISUAL_MIN_RM1 = 3.5e-4;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The guided camera. It flies between story beats on authored paths; the
 * visitor can only look around a little with the mouse, like a passenger.
 */
export class Director {
  constructor(stages) {
    this.stages = stages;
    this.index = 0;
    this.from = null;
    this.progress = 1;
    this.state = this._frame(stages[0]);
    this.driftAngle = 0;

    this.look = new THREE.Vector2();
    this.camera = {
      pos: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      rm1: this.state.rm1,
      rm1Visual: this.state.rm1,
      lapseVisual: 1,
      exposure: 1,
    };
  }

  get stage() {
    return this.stages[this.index];
  }

  get moving() {
    return this.progress < 1;
  }

  /** 0..1, peaks mid-flight. Drives rumble and camera shake. */
  get motion() {
    return this.moving ? Math.sin(Math.PI * this.progress) : 0;
  }

  _frame(s) {
    return {
      logRm1: Math.log(s.rm1),
      rm1: s.rm1,
      incl: s.incl,
      phi: s.phi,
      look: s.look,
      pitch: s.pitch,
      drift: s.drift,
      exposure: s.exposure ?? 1,
    };
  }

  goTo(index, { instant = false } = {}) {
    this.index = index;
    const target = this.stages[index];
    if (instant || !target.travel) {
      this.state = this._frame(target);
      this.driftAngle = 0;
      this.progress = 1;
      this.from = null;
      return;
    }
    // Fold accumulated drift into the start pose so the flight starts where we are.
    this.from = { ...this.state, phi: this.state.phi + this.driftAngle };
    this.driftAngle = 0;
    this.progress = 0;
  }

  update(dt, time, pointer) {
    const target = this.stages[this.index];

    if (this.moving) {
      this.progress = Math.min(1, this.progress + dt / target.travel);
      const t = easeInOut(this.progress);
      const a = this.from;
      const b = this._frame(target);
      const logRm1 = lerp(a.logRm1, b.logRm1, t);
      this.state = {
        logRm1,
        rm1: Math.exp(logRm1),
        incl: lerp(a.incl, b.incl, t),
        phi: lerp(a.phi, b.phi, t),
        look: lerp(a.look, b.look, t),
        pitch: lerp(a.pitch, b.pitch, t),
        drift: lerp(a.drift, b.drift, t),
        exposure: lerp(a.exposure, b.exposure, t),
      };
    }
    this.driftAngle += this.state.drift * dt;

    // Passenger head movement: a little mouse look, breathing, and shake.
    const k = 1 - Math.exp(-dt * 2.5);
    this.look.x += (-pointer.x * 0.075 - this.look.x) * k;
    this.look.y += (pointer.y * 0.045 - this.look.y) * k;

    const { rm1 } = this.state;
    const rm1Visual = Math.max(rm1, VISUAL_MIN_RM1);
    const r = 1 + rm1Visual;
    const incl = this.state.incl * DEG;
    const phi = this.state.phi + this.driftAngle;

    const cam = this.camera;
    cam.rm1 = rm1;
    cam.rm1Visual = rm1Visual;
    cam.lapseVisual = lapse(rm1Visual);
    cam.exposure = this.state.exposure;
    cam.pos.set(r * Math.cos(incl) * Math.cos(phi), r * Math.sin(incl), r * Math.cos(incl) * Math.sin(phi));

    const outward = cam.pos.clone().normalize();
    const tangent = new THREE.Vector3().crossVectors(WORLD_UP, outward).normalize();
    const fwd = outward
      .clone()
      .multiplyScalar(-Math.cos(this.state.look))
      .addScaledVector(tangent, Math.sin(this.state.look));

    const shake = this.motion * (0.0015 + 0.004 / (0.6 + rm1Visual));
    const breathe = Math.sin(time * 0.83) * 0.0022;
    const yaw = this.look.x + Math.sin(time * 13.1) * Math.sin(time * 7.7) * shake;
    const pitch = this.state.pitch + this.look.y + breathe + Math.sin(time * 11.3 + 1.7) * shake;
    const roll = Math.sin(time * 0.37) * 0.004 + Math.sin(time * 9.1) * shake * 0.6;

    const right = new THREE.Vector3().crossVectors(fwd, WORLD_UP).normalize();
    fwd.applyAxisAngle(right, pitch);
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    fwd.applyAxisAngle(up, yaw);
    right.crossVectors(fwd, up).normalize();
    right.applyAxisAngle(fwd, roll);
    up.crossVectors(right, fwd).normalize();

    cam.fwd.copy(fwd);
    cam.right.copy(right);
    cam.up.copy(up);
    return cam;
  }
}
