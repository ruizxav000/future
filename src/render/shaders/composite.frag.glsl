// Final composite: tone mapping, liquid glass, letterbox, film grain.
//
// The HTML interface is transparent. Every element marked [data-glass] is
// mirrored here as a signed-distance shape, and the glass is rendered in the
// same pass as the black hole, so it genuinely refracts the live scene. Shapes
// are joined with a smooth minimum, so panels that come close (or the cursor
// droplet) melt into each other like liquid.

precision highp float;

#define MAX_PANELS 14

varying vec2 vUv;

uniform sampler2D tScene;
uniform vec2 uResolution;      // drawing-buffer pixels
uniform float uDpr;
uniform float uTime;
uniform float uExposure;
uniform float uBar;            // letterbox bar height as a fraction of the screen
uniform float uFade;           // global fade from black
uniform vec2 uLight;           // direction of the glass key light

uniform int uPanelCount;
uniform vec4 uPanels[MAX_PANELS];    // centre.xy, half-size.xy (pixels, origin bottom-left)
uniform float uPanelRadius[MAX_PANELS];
uniform float uPanelAlpha[MAX_PANELS];

uniform vec4 uCursor;          // droplet centre.xy, radius, visibility
uniform vec2 uCursorVel;       // pixels per second
uniform vec3 uPointer;         // raw pointer.xy, visibility

// ---------------------------------------------------------------- colour

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 sceneAt(vec2 px) {
  vec3 hdr = texture2D(tScene, clamp(px / uResolution, 0.0, 1.0)).rgb;
  return pow(aces(hdr * uExposure), vec3(1.0 / 2.2));
}

vec3 frosted(vec2 px, float radius) {
  // Golden-angle spiral blur.
  vec3 acc = sceneAt(px);
  float wsum = 1.0;
  for (int i = 1; i < 12; i++) {
    float fi = float(i);
    float a = fi * 2.39996;
    float rr = sqrt(fi / 11.0) * radius;
    float w = 1.0 - fi / 14.0;
    acc += sceneAt(px + vec2(cos(a), sin(a)) * rr) * w;
    wsum += w;
  }
  return acc / wsum;
}

// ---------------------------------------------------------------- shapes

float sdRoundBox(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float sdDroplet(vec2 p) {
  float r = uCursor.z * uCursor.w;
  if (r < 0.5) return 1e5;
  float speed = length(uCursorVel);
  vec2 dir = speed > 1.0 ? uCursorVel / speed : vec2(1.0, 0.0);
  float stretch = 1.0 + min(speed / (2600.0 * uDpr), 0.55);
  vec2 local = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
  vec2 ab = vec2(r * stretch, r / sqrt(stretch));
  float k = length(local / ab);
  return (k - 1.0) * min(ab.x, ab.y);
}

// Returns signed distance in pixels. `alpha` is the opacity of the nearest shape.
float glassField(vec2 p, out float alpha) {
  float k = 22.0 * uDpr;
  float d = sdDroplet(p - uCursor.xy);
  float best = d;
  alpha = 1.0;
  for (int i = 0; i < MAX_PANELS; i++) {
    if (i >= uPanelCount) break;
    vec4 pr = uPanels[i];
    float a = uPanelAlpha[i];
    // Fading panels drain inward like liquid. GlassLayer clips each panel's
    // content to the same shrinking shape, so the text drains with its glass.
    float di = sdRoundBox(p - pr.xy, pr.zw, uPanelRadius[i]) + (1.0 - a) * min(pr.z, pr.w);
    d = smin(d, di, k);
    if (di < best) { best = di; alpha = a; }
  }
  return d;
}

float glassFieldOnly(vec2 p) {
  float a;
  return glassField(p, a);
}

// ---------------------------------------------------------------- main

void main() {
  vec2 px = vUv * uResolution;
  vec3 col = sceneAt(px);

  float alpha;
  float d = glassField(px, alpha);

  // Soft contact shadow just outside the glass.
  if (d > 0.0 && d < 40.0 * uDpr) {
    col *= 1.0 - 0.22 * alpha * pow(1.0 - d / (40.0 * uDpr), 2.0);
  }

  if (d < 1.5) {
    float e = 1.0;
    vec2 n = vec2(
      glassFieldOnly(px + vec2(e, 0.0)) - glassFieldOnly(px - vec2(e, 0.0)),
      glassFieldOnly(px + vec2(0.0, e)) - glassFieldOnly(px - vec2(0.0, e))
    );
    n = length(n) > 1e-4 ? normalize(n) : vec2(0.0);

    float bevel = 26.0 * uDpr;
    float x = clamp(-d / bevel, 0.0, 1.0);      // 0 at the rim, 1 on the flat top
    float rim = pow(1.0 - x, 2.4);

    // Refraction: the curved rim bends light from just outside the panel inward.
    vec2 offset = n * rim * 42.0 * uDpr;
    float blurR = 9.0 * uDpr;
    vec3 g = vec3(
      frosted(px + offset * 1.18, blurR).r,
      frosted(px + offset, blurR).g,
      frosted(px + offset * 0.82, blurR).b
    );

    // Adaptive tint: darken more over bright content so text stays legible.
    float lum = dot(g, vec3(0.299, 0.587, 0.114));
    g = mix(g, vec3(0.055, 0.06, 0.075), 0.30 + 0.30 * smoothstep(0.25, 0.85, lum));
    g += 0.035;

    // Environment light: the rim picks up colour from what's around the panel.
    vec3 env = sceneAt(px - n * (24.0 + 40.0 * rim) * uDpr);
    g += env * rim * 0.45;

    // Specular highlights on the bevel, key and fill.
    float key = pow(max(dot(n, uLight), 0.0), 3.0) * rim;
    float fill = pow(max(dot(n, -uLight), 0.0), 4.0) * rim;
    g += vec3(1.0, 0.97, 0.92) * key * 0.55 + vec3(0.7, 0.8, 1.0) * fill * 0.18;

    // Hairline edge.
    g += smoothstep(1.6 * uDpr, 0.0, abs(d + 0.9 * uDpr)) * 0.16;

    float mask = smoothstep(0.75, -0.75, d) * alpha;
    col = mix(col, g, mask);
  }

  // Precise pointer dot (the droplet trails behind on a spring).
  if (uPointer.z > 0.0) {
    float pd = length(px - uPointer.xy);
    col = mix(col, vec3(1.0), smoothstep(2.6 * uDpr, 1.4 * uDpr, pd) * 0.9 * uPointer.z);
  }

  // Vignette and grain.
  vec2 v = vUv - 0.5;
  col *= 1.0 - 0.38 * pow(length(v * vec2(1.0, 1.25)) * 1.25, 2.6);
  float grain = fract(sin(dot(px + fract(uTime * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += grain * 0.045 * (1.0 - 0.6 * dot(col, vec3(0.333)));

  col *= uFade;

  // Letterbox.
  float bar = uBar * uResolution.y;
  if (px.y < bar || px.y > uResolution.y - bar) col = vec3(0.0);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
