import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import vert from './shaders/fullscreen.vert.glsl?raw';
import common from './shaders/common.glsl?raw';
import blackholeFrag from './shaders/blackhole.frag.glsl?raw';
import compositeFrag from './shaders/composite.frag.glsl?raw';

export const MAX_PANELS = 14;

const withCommon = (src) => src.replace('#pragma future_common', common);

/**
 * Three passes per frame:
 *   1. the ray-traced black hole into a half-float target at a dynamic resolution,
 *   2. bloom on that target,
 *   3. a full-resolution composite that tone maps and renders the liquid glass.
 */
export class Pipeline {
  constructor(canvas, { fixedScale = null } = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);

    this.blackhole = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: withCommon(blackholeFrag),
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uDiskTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
        uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
        uTanHalfFov: { value: Math.tan(THREE.MathUtils.degToRad(26)) },
        uLapse: { value: 1 },
        uDoppler: { value: 1 },
        uMaxSteps: { value: 380 },
      },
    });

    this.composite = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uTime: { value: 0 },
        uExposure: { value: 1 },
        uBar: { value: 0 },
        uFade: { value: 0 },
        uLight: { value: new THREE.Vector2(-0.55, 0.83) },
        uPanelCount: { value: 0 },
        uPanels: { value: Array.from({ length: MAX_PANELS }, () => new THREE.Vector4()) },
        uPanelRadius: { value: new Array(MAX_PANELS).fill(0) },
        uPanelAlpha: { value: new Array(MAX_PANELS).fill(0) },
        uCursor: { value: new THREE.Vector4(0, 0, 0, 0) },
        uCursorVel: { value: new THREE.Vector2() },
        uPointer: { value: new THREE.Vector3() },
      },
    });

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.composite.uniforms.tScene.value = this.target.texture;

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.0, 0.95);
    // Keep the glow tight: the widest mips would otherwise fog the shadow.
    this.bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.65, 0.3, 0.12, 0.04];

    this.fixedScale = fixedScale;
    this.scale = fixedScale ?? 0.6;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;

    // Dynamic resolution bookkeeping.
    this._frameTimes = [];
    this._lastAdjust = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(width, height, false);
    this.composite.uniforms.uResolution.value.set(width * this.dpr, height * this.dpr);
    this.composite.uniforms.uDpr.value = this.dpr;
    this._resizeTarget();
  }

  _resizeTarget() {
    const w = Math.max(2, Math.round(this.width * this.dpr * this.scale));
    const h = Math.max(2, Math.round(this.height * this.dpr * this.scale));
    this.target.setSize(w, h);
    this.bloom.setSize(w, h);
    this.blackhole.uniforms.uResolution.value.set(w, h);
  }

  /** Nudge the internal render scale toward a steady frame rate. */
  adapt(frameMs, now) {
    if (this.fixedScale != null) return;
    const ft = this._frameTimes;
    ft.push(frameMs);
    if (ft.length > 40) ft.shift();
    if (ft.length < 40 || now - this._lastAdjust < 1500) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    let next = this.scale;
    if (avg > 21) next = Math.max(0.3, this.scale - 0.08);
    else if (avg < 17.5) next = Math.min(1.0, this.scale + 0.05);
    if (next !== this.scale) {
      this.scale = next;
      this._resizeTarget();
      this._lastAdjust = now;
      ft.length = 0;
    }
  }

  render() {
    const r = this.renderer;

    this.quad.material = this.blackhole;
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);

    this.bloom.render(r, null, this.target, 0, false);

    this.quad.material = this.composite;
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
