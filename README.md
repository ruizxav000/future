# Twin Paradox

A first-person, guided journey to a black hole, ray traced live in the browser.

This is **proof of concept 01**: one scene, five story beats, and the interface
language (liquid glass, mission telemetry, a cinematic letterbox) that the rest
of the experience will be built on. Desktop only for now.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

## Controls

| Input | Action |
| --- | --- |
| `Space` / `Enter` / `→` | Proceed (or finish the line being typed) |
| Mouse | Look around a little; the glass highlights follow it |
| `H` | Hide the interface |
| `M` | Mute |

Dev links: `?stage=1…5` jumps to a beat, `?ui=0` hides the interface,
`?scale=0.5` pins the internal render resolution.

## What's real

- **Light paths.** Every pixel integrates a photon backwards through the
  Schwarzschild metric (`x'' = -1.5 h² x / r⁵`, the Binet equation in Cartesian
  form). Lensing, the lifted far side of the disk, the photon ring and the
  Einstein ring of the galaxy are not authored. They fall out of the maths.
- **The view of a hovering observer.** Camera directions are converted from
  the local static frame (`tan a_coord = tan a_local / √(1 − Rs/r)`), which is
  what shrinks the sky into a single circle near the horizon.
- **Doppler beaming and gravitational shift** of the disk (`g⁴` intensity,
  blackbody colour shifted by `g`). Toggle **Cinematic** to remove the beaming,
  as most films do.
- **Time dilation.** The Earth clock integrates `dt / √(1 − Rs/r)` along the
  path you actually fly. Beat 04 holds you at the radius where one hour is
  seven years (γ = 61,362), about 78 m above the horizon of a 10⁸ solar-mass
  hole. The ticks you hear there are generated each time a day passes on Earth.

## Where it bends

- The picture stops descending at `r − 1 = 3.5 × 10⁻⁴`. Deeper than that, the
  circle of sky is smaller than a pixel. The telemetry and clocks keep the true
  value.
- The hole doesn't spin (Schwarzschild, not Kerr), the disk is a thin emitter
  with procedural turbulence, and the observer is static rather than orbiting.

## How it's built

```
src/
  render/
    shaders/blackhole.frag.glsl  geodesic ray tracer, disk, sky
    shaders/composite.frag.glsl  tone mapping, liquid glass, letterbox, grain
    pipeline.js                  scene → bloom → composite, dynamic resolution
  story/
    stages.js                    the five beats: framing, copy, audio cues
    director.js                  guided camera: flights, head motion, shake
  physics/relativity.js          lapse, dilation, mission clocks, readouts
  audio/engine.js                procedural drone, organ pad, reverb, ticks
  ui/
    glass.js                     mirrors [data-glass] elements into the shader
    cursor.js                    spring-driven glass droplet
    narrator.js                  transmission-style typing
    hud.js                       telemetry panel
```

**Liquid glass.** The HTML interface is transparent. Every `[data-glass]`
element's rect, corner radius and opacity are sent to the composite shader
each frame. The glass is rendered as signed-distance shapes that refract,
frost and pick up light from the live black hole behind them. Shapes are
joined with a smooth minimum, so a button beside a panel (or the cursor
droplet) melts into it like liquid.

**Performance.** The ray tracer renders into a half-float target whose
resolution adapts to hold the frame rate (shown in the telemetry footer). The
glass composite always runs at full resolution, so text and edges stay sharp.
