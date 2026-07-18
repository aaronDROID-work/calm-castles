/* util.js — seeded rng, 1d noise, color helpers */
"use strict";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const f = mulberry32(seed);
  return {
    next: f,
    range: (a, b) => a + f() * (b - a),
    int: (a, b) => Math.floor(a + f() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    chance: (p) => f() < p,
    // pairs: [[value, weight], ...]
    weighted(pairs) {
      let total = 0;
      for (const p of pairs) total += p[1];
      let r = f() * total;
      for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
      return pairs[pairs.length - 1][0];
    },
  };
}

/* 1D value noise with fBm, seeded. Returns fn(x) in roughly [-1, 1]. */
function makeNoise1D(rng, octaves = 4) {
  const size = 256;
  const vals = new Float32Array(size);
  for (let i = 0; i < size; i++) vals[i] = rng.next() * 2 - 1;
  function smooth(t) { return t * t * (3 - 2 * t); }
  function base(x) {
    const xi = Math.floor(x);
    const t = smooth(x - xi);
    const a = vals[((xi % size) + size) % size];
    const b = vals[(((xi + 1) % size) + size) % size];
    return a + (b - a) * t;
  }
  return function (x) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += base(x * freq + o * 37.7) * amp;
      norm += amp;
      amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };
}

/* ---- colors: {r,g,b} objects ---- */

function rgb(r, g, b) { return { r: r | 0, g: g | 0, b: b | 0 }; }

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return rgb(r * 255, g * 255, b * 255);
}

function mix(c1, c2, t) {
  return rgb(c1.r + (c2.r - c1.r) * t, c1.g + (c2.g - c1.g) * t, c1.b + (c2.b - c1.b) * t);
}

function shade(c, f) { // f > 0 lighten toward white, f < 0 darken toward black
  return f >= 0 ? mix(c, rgb(255, 255, 255), f) : mix(c, rgb(0, 0, 0), -f);
}

function css(c, a) {
  if (a === undefined) return `rgb(${c.r},${c.g},${c.b})`;
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

/* 4x4 Bayer matrix, values 0..15 */
const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
