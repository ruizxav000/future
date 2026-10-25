// Schwarzschild bookkeeping for a hovering (static) observer.
//
// Radii are in units of the Schwarzschild radius Rs. Close to the horizon r - 1
// gets far smaller than double precision can resolve next to 1, so everything
// here takes `rm1` (r minus one) directly.

/** Mass of the black hole in solar masses. */
export const SOLAR_MASSES = 1e8;

/** Schwarzschild radius in km (2.953 km per solar mass). */
export const RS_KM = 2.953 * SOLAR_MASSES;

/** Time-dilation factor for "one hour here is seven years at home". */
export const SEVEN_YEARS_PER_HOUR = (7 * 365.25 * 24 * 3600) / 3600;

/** sqrt(1 - Rs/r): how fast a clock ticks here relative to one far away. */
export function lapse(rm1) {
  return Math.sqrt(rm1 / (1 + rm1));
}

/** Seconds that pass far away for every second here. */
export function dilation(rm1) {
  return 1 / lapse(rm1);
}

/** The radius (as r - 1) where the dilation factor equals `gamma`. */
export function rm1ForDilation(gamma) {
  return 1 / (gamma * gamma - 1);
}

export class MissionClock {
  constructor() {
    this.reset();
  }

  reset() {
    this.ship = 0;
    this.earth = 0;
    this.gamma = 1;
    this._lastDay = 0;
  }

  /**
   * Advance by `dt` seconds of the traveller's proper time at radius `rm1`.
   * Returns the number of whole Earth days that rolled over this step.
   */
  advance(dt, rm1) {
    this.gamma = dilation(rm1);
    this.ship += dt;
    this.earth += dt * this.gamma;
    const day = Math.floor(this.earth / 86400);
    const rolled = day - this._lastDay;
    this._lastDay = day;
    return rolled;
  }
}

// ---------------------------------------------------------------- formatting

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');

export function formatShip(seconds) {
  const h = seconds / 3600;
  const m = (seconds / 60) % 60;
  const s = seconds % 60;
  return `T+ ${pad(h)}:${pad(m)}:${pad(s)}.${Math.floor((seconds % 1) * 10)}`;
}

export function formatEarth(seconds) {
  const year = 365.25 * 86400;
  const y = Math.floor(seconds / year);
  const rest = seconds - y * year;
  const d = rest / 86400;
  const h = (rest / 3600) % 24;
  const m = (rest / 60) % 60;
  const s = rest % 60;
  return `${y}Y ${pad(d, 3)}D ${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** A human phrase for a duration, used in narration ("3 weeks", "14 hours"). */
export function describeDuration(seconds) {
  const units = [
    ['year', 365.25 * 86400],
    ['month', 30.44 * 86400],
    ['week', 7 * 86400],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  for (const [name, size] of units) {
    if (seconds >= size * 1.5 || name === 'second') {
      const n = Math.round(seconds / size);
      return `${n} ${name}${n === 1 ? '' : 's'}`;
    }
  }
  return '';
}

export function formatRadius(rm1) {
  if (rm1 >= 1e-3) return `${(1 + rm1).toFixed(3)} Rs`;
  // Show the digits that matter: 1.000 000 000 266 Rs
  const digits = Math.min(15, Math.ceil(-Math.log10(rm1)) + 2);
  const frac = rm1.toFixed(digits).slice(2); // drop "0."
  const grouped = frac.replace(/(\d{3})(?=\d)/g, '$1 ');
  return `1.${grouped} Rs`;
}

export function formatAltitude(rm1) {
  const km = rm1 * RS_KM;
  if (km < 1) return `${(km * 1000).toFixed(1)} m`;
  if (km < 1e6) return `${Math.round(km).toLocaleString('en-US')} km`;
  const exp = Math.floor(Math.log10(km));
  const mant = km / 10 ** exp;
  const sup = String(exp).replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
  return `${mant.toFixed(2)} × 10${sup} km`;
}

export function formatDilation(gamma) {
  if (gamma < 10) return gamma.toFixed(4);
  if (gamma < 1000) return gamma.toFixed(1);
  return Math.round(gamma).toLocaleString('en-US');
}
