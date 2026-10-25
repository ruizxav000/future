// Real-time Schwarzschild black hole.
//
// Units: the Schwarzschild radius Rs = 1 (so M = 0.5). Each pixel's photon is
// traced backwards from the camera by integrating
//
//     x'' = -1.5 h^2 x / |x|^5,     h = |x × x'|
//
// which reproduces null geodesics of the Schwarzschild metric exactly
// (it is the Binet equation u'' + u = 1.5 u^2 in Cartesian form).
// The thin accretion disk lies in the y = 0 plane between the ISCO (3 Rs)
// and R_OUT, orbits Keplerian-ly, and is shaded with relativistic Doppler
// beaming and gravitational redshift.

precision highp float;

#pragma future_common

varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;
uniform float uDiskTime;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanHalfFov;
uniform float uLapse;      // sqrt(1 - Rs/r) at the camera: < 1 deep in the well
uniform float uDoppler;    // 1 = physical, 0 = cinematic (no beaming)
uniform float uMaxSteps;

#define R_IN 3.0
#define R_OUT 12.0
#define MAX_STEPS 480

// ---------------------------------------------------------------- sky

vec3 starLayer(vec3 d, float scale, float threshold, float size) {
  vec3 p = d * scale;
  vec3 cell = floor(p);
  vec3 f = fract(p);
  float h = hash13(cell);
  if (h < threshold) return vec3(0.0);
  vec3 centre = hash33(cell) * 0.6 + 0.2;
  float dist = length(f - centre);
  float core = exp(-dist * dist / (size * size));
  float k = fract(h * 113.7);
  float temp = mix(3200.0, 14000.0, k * k);
  float mag = 0.35 + pow(fract(h * 17.31), 8.0) * 9.0;
  return blackbody(temp) * core * mag;
}

vec3 sky(vec3 d) {
  vec3 col = vec3(0.0);
  col += starLayer(d, 70.0, 0.978, 0.09) * 1.4;
  col += starLayer(d, 160.0, 0.962, 0.13) * 0.55;
  col += starLayer(d, 340.0, 0.945, 0.18) * 0.22;

  // A galactic band with dust lanes.
  vec3 gn = normalize(vec3(0.32, 1.0, -0.42));
  float lat = dot(d, gn);
  float band = exp(-lat * lat * 22.0);
  float core = exp(-lat * lat * 120.0);
  float neb = fbm(d * 3.2 + 4.0);
  float dust = fbm(d * 9.0 + 11.0);
  float lanes = smoothstep(0.35, 0.75, dust) * core;
  vec3 mw = mix(vec3(0.42, 0.50, 0.75), vec3(0.95, 0.74, 0.52), core) * band * (0.25 + neb * neb * 1.6);
  mw *= 1.0 - 0.85 * lanes;
  col += mw * 0.045;

  // Faint deep-field glow so the void is never perfectly flat.
  col += vec3(0.004, 0.005, 0.009) * fbm(d * 1.7 + 1.3);
  return col;
}

// ---------------------------------------------------------------- disk

float diskDensity(float r, float a, float seed) {
  vec2 q = vec2(cos(a), sin(a));
  float clumps = fbm(vec3(q * 3.1, r * 0.9) + seed);
  float streaks = fbm(vec3(q * 1.2 + seed * 0.37, r * 3.4));
  float d = clumps * 0.8 + streaks * 0.5 - 0.36;
  return clamp(d * 1.9, 0.0, 1.0);
}

// Returns premultiplied emission (rgb) and opacity (a) where the ray crosses the disk.
vec4 shadeDisk(vec3 hit, vec3 rayVel) {
  float r = length(hit.xz);
  float ang = atan(hit.z, hit.x);

  // Differential (Keplerian) rotation. Two texture layers on offset cycles
  // keep the shear from winding the noise up into thin threads forever.
  const float CYCLE = 16.0;
  const float SPEED = 1.7;
  float omega = SPEED * pow(r, -1.5);
  float p0 = fract(uDiskTime / CYCLE);
  float p1 = fract(uDiskTime / CYCLE + 0.5);
  float w0 = 1.0 - abs(2.0 * p0 - 1.0);
  float d0 = diskDensity(r, ang - omega * p0 * CYCLE, 0.0);
  float d1 = diskDensity(r, ang - omega * p1 * CYCLE, 5.31);
  float dens = mix(d1, d0, w0);

  float edge = smoothstep(R_IN, R_IN + 0.35, r) * (1.0 - smoothstep(R_OUT - 5.0, R_OUT, r));
  dens *= edge;

  // Temperature falls off roughly as r^-3/4.
  float tn = pow(R_IN / r, 0.75);
  float temp = 7400.0 * tn;

  // Relativistic shifts. Gas on a circular orbit, seen by a static observer.
  float beta = clamp(sqrt(0.5 / max(r - 1.0, 1e-3)), 0.0, 0.98);
  float gamma = inversesqrt(1.0 - beta * beta);
  vec3 orbitDir = vec3(-hit.z, 0.0, hit.x) / r;
  vec3 towardCamera = -normalize(rayVel);
  float gDoppler = 1.0 / (gamma * (1.0 - beta * dot(orbitDir, towardCamera)));
  float gGravity = sqrt(1.0 - 1.0 / r) / uLapse;
  float g = gGravity * mix(1.0, gDoppler, uDoppler);

  float intensity = pow(tn, 2.6) * min(pow(g, 4.0), 16.0) * 1.35;
  vec3 emission = blackbody(temp * g) * intensity;

  float alpha = clamp(dens * 1.15, 0.0, 0.97);
  return vec4(emission * alpha, alpha);
}

// ---------------------------------------------------------------- main

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  ndc.x *= uResolution.x / uResolution.y;
  vec3 dirLocal = normalize(uCamFwd + (ndc.x * uCamRight + ndc.y * uCamUp) * uTanHalfFov);

  // Convert the direction measured by a static observer into the coordinate
  // direction the integrator uses: tan(a_coord) = tan(a_local) / lapse.
  // This is what squeezes the sky into a shrinking circle near the horizon.
  vec3 radial = normalize(uCamPos);
  float dr = dot(dirLocal, radial);
  vec3 dt = dirLocal - dr * radial;
  vec3 vel = normalize(dr * uLapse * radial + dt);

  vec3 pos = uCamPos;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);

  float camR = length(uCamPos);
  float escapeR = max(camR * 1.05, 32.0);

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool escaped = false;
  bool captured = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (float(i) >= uMaxSteps) break;

    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    // Smaller steps near the disk plane and around the photon sphere, where
    // the thinnest lensed images live.
    float nearDisk = 0.35 + 0.65 * smoothstep(0.0, 1.5, abs(pos.y));
    float nearRing = 0.45 + 0.55 * smoothstep(1.2, 3.5, r);
    float stepLen = clamp(0.065 * r * nearDisk * nearRing, 0.004, 4.0);

    // Kick-drift-kick leapfrog.
    vec3 prev = pos;
    vel += (-1.5 * h2 * pos / (r2 * r2 * r)) * (0.5 * stepLen);
    pos += vel * stepLen;
    r2 = dot(pos, pos);
    r = sqrt(r2);
    vel += (-1.5 * h2 * pos / (r2 * r2 * r)) * (0.5 * stepLen);

    if (prev.y * pos.y < 0.0) {
      float t = prev.y / (prev.y - pos.y);
      vec3 hit = mix(prev, pos, t);
      float hr = length(hit.xz);
      if (hr > R_IN && hr < R_OUT) {
        vec4 d = shadeDisk(hit, vel);
        col += (1.0 - alpha) * d.rgb;
        alpha += (1.0 - alpha) * d.a;
        if (alpha > 0.99) break;
      }
    }

    if (r < 1.0) { captured = true; break; }
    if (r > escapeR && dot(pos, vel) > 0.0) { escaped = true; break; }
  }

  if (!captured && !escaped && dot(pos, vel) > 0.0 && length(pos) > 8.0) escaped = true;

  if (escaped) {
    // Starlight falling into the well is blueshifted for a hovering observer.
    float boost = 1.0 / uLapse;
    vec3 s = sky(normalize(vel));
    s *= min(boost * boost, 9.0);
    s = mix(s, s * vec3(0.65, 0.85, 1.45), smoothstep(1.2, 12.0, boost));
    col += (1.0 - alpha) * s;
  }

  // Soft-clip extreme highlights (stacked images at the photon ring) so the
  // bloom stays a glow instead of a fog.
  float peak = max(col.r, max(col.g, col.b));
  col *= 1.0 / (1.0 + max(peak - 6.0, 0.0) * 0.12);
  gl_FragColor = vec4(col, 1.0);
}
