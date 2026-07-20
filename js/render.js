/* render.js — builds static layers and draws animated frames */
"use strict";

const Render = (() => {
  let S = null;          // scene
  let W = 0, H = 0;
  let sky, layers, above, fore, front;   // canvases: sky, ridges+mid, composite, foreground, front-most framing
  let geo = {};          // geometry & anchors
  let dyn = {};          // dynamic state
  let grainFrames = [], vignette;
  let onLightning = null;

  /* ================= BUILD ================= */

  function build(scene) {
    S = scene; W = S.W; H = S.H;
    const rng = makeRng(S.seed ^ 0x9e3779b9);
    geo = {}; dyn = {};

    geo.horizonY = Math.round(H * rng.range(0.5, 0.6));
    geo.lightFromLeft = S.sunX < 0.5;

    buildSky(rng);
    buildLayers(rng);   // ridges + mid terrain + structure -> `layers`
    buildFore(rng);
    buildComposite();
    buildOverlays(rng);
    initDynamics(rng);
  }

  /* ---------- sky ---------- */
  function buildSky(rng) {
    sky = makeCanvas(W, H);
    const g = sky.getContext("2d");
    // resample the ramp to more steps so dither transition bands stay narrow
    const ramp0 = S.pal.sky;
    const ramp = [];
    for (let i = 0; i < ramp0.length - 1; i++)
      for (let k = 0; k < 3; k++) ramp.push(mix(ramp0[i], ramp0[i + 1], k / 3));
    ramp.push(ramp0[ramp0.length - 1]);
    const n = ramp.length;
    const img = g.createImageData(W, H);
    const d = img.data;
    const gradEnd = geo.horizonY * 1.12;

    // sun / moon placement
    const p = S.pal;
    let lightX = -999, lightY = -999, glowStr = 0, glowR = W * 0.5;
    if (p.sunVisible) {
      lightX = S.sunX * W;
      const t = S.timeOfDay;
      if (t === "dawn" || t === "dusk") { lightY = geo.horizonY - rng.range(6, 18); glowStr = 0.75; glowR = W * 0.42; }
      else if (t === "golden") { lightY = geo.horizonY - rng.range(16, 34); glowStr = 0.6; glowR = W * 0.4; }
      else { lightY = H * rng.range(0.12, 0.3); glowStr = 0.35; }
      geo.sun = { x: lightX, y: lightY };
    }
    const showMoon = S.omen !== "eruption" && (p.night || S.showMoonAtDusk);
    if (showMoon) {
      geo.moon = { x: S.moonX * W, y: H * rng.range(0.1, 0.32) };
      if (!p.sunVisible) { lightX = geo.moon.x; lightY = geo.moon.y; glowStr = 0.12; glowR = W * 0.3; }
    }
    geo.lightX = lightX >= 0 ? lightX : W * S.sunX;

    const glowCol = mix(p.sunVisible ? p.sun : p.moon, p.horizon, 0.25);
    const sig2 = 2 * glowR * glowR * 0.18;

    for (let y = 0; y < H; y++) {
      const t = clamp(y / gradEnd, 0, 1) * (n - 1);
      const i0 = Math.min(n - 2, Math.floor(t));
      const frac = t - i0;
      for (let x = 0; x < W; x++) {
        const th = BAYER4[(x & 3) + ((y & 3) << 2)] / 16;
        let c = frac > th ? ramp[i0 + 1] : ramp[i0];
        if (glowStr > 0) {
          const dx = x - lightX, dyy = (y - lightY) * 1.4;
          const gl = Math.exp(-(dx * dx + dyy * dyy) / sig2) * glowStr;
          const gq = Math.floor(gl * 8 + th) / 8;
          if (gq > 0) c = mix(c, glowCol, Math.min(0.85, gq));
        }
        const idx = (y * W + x) * 4;
        d[idx] = c.r; d[idx + 1] = c.g; d[idx + 2] = c.b; d[idx + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    // sun disc
    if (p.sunVisible) {
      const r = (S.timeOfDay === "dawn" || S.timeOfDay === "dusk") ? rng.int(7, 9) : rng.int(4, 6);
      fillCircle(g, geo.sun.x, geo.sun.y, r, p.sun);
      fillCircle(g, geo.sun.x, geo.sun.y, r - 2, shade(p.sun, 0.25));
    }
    // moon disc with phase (shadow clipped to the disc)
    if (showMoon) {
      const r = rng.int(4, 6);
      const mc = makeCanvas(r * 2 + 3, r * 2 + 3);
      const mg = mc.getContext("2d");
      fillCircle(mg, r + 1, r + 1, r, p.moon);
      const off = Math.round((S.moonPhase * 2 - 1) * r * 1.6);
      if (Math.abs(off) < r * 1.4) {
        mg.globalCompositeOperation = "source-atop";
        fillCircle(mg, r + 1 + off, r + 1 - Math.round(r * 0.2), r, S.pal.sky[1]);
      }
      g.drawImage(mc, Math.round(geo.moon.x - r - 1), Math.round(geo.moon.y - r - 1));
    }
  }

  function fillCircle(g, cx, cy, r, col) {
    g.fillStyle = css(col);
    for (let yy = -r; yy <= r; yy++) {
      const w = Math.floor(Math.sqrt(Math.max(0, r * r - yy * yy)));
      g.fillRect((cx - w) | 0, (cy + yy) | 0, w * 2 + 1, 1);
    }
  }

  function drawMoonwoodBackdrop(g, rng, p, hz) {
    const far = mix(shade(p.land, -0.38), p.horizon, 0.52);
    const rim = mix(far, p.horizon, 0.22);
    const n = Math.max(9, Math.round(W / 34));
    for (let i = 0; i < n; i++) {
      const x = Math.round((i + rng.range(-0.25, 0.25)) * W / Math.max(1, n - 1));
      const w = rng.int(3, 7);
      const base = hz + rng.int(14, 34);
      const top = rng.int(-18, Math.round(H * 0.12));
      g.fillStyle = css(far, rng.range(0.66, 0.9));
      g.fillRect(x - (w >> 1), top, w, base - top);
      g.fillStyle = css(rim, 0.5);
      g.fillRect(x - (w >> 1), top, 1, base - top);
      // High branches disappear into a continuous, rounded ceiling.
      const crownY = top + rng.int(0, 14);
      fillCircle(g, x + rng.int(-7, 7), crownY, rng.int(12, 24), far);
    }
    g.fillStyle = css(far, 0.92);
    for (let x = 0; x < W; x += rng.int(12, 22))
      fillCircle(g, x, rng.int(-6, 8), rng.int(14, 28), far);
  }

  function drawCloudSea(g, rng, p, hz, noise) {
    const fog = mix(p.horizon, rgb(245, 246, 250), p.night ? 0.06 : 0.34);
    for (let band = 0; band < 3; band++) {
      const by = hz + 4 + band * rng.int(8, 13);
      const off = rng.range(0, 400);
      for (let x = 0; x < W; x++) {
        const crest = Math.round(by + noise(x * (0.012 + band * 0.003) + off) * (3 + band * 2));
        const depth = 7 + band * 4;
        for (let yy = 0; yy < depth; yy++) {
          const a = Math.sin((yy / depth) * Math.PI) * (0.2 + band * 0.045);
          g.fillStyle = css(fog, a);
          g.fillRect(x, crest + yy, 1, 1);
        }
      }
    }
  }

  /* ---------- ridges + mid terrain + structures ---------- */
  function buildLayers(rng) {
    layers = makeCanvas(W, H);
    const g = layers.getContext("2d");
    const p = S.pal;
    const hz = geo.horizonY;
    const noise = makeNoise1D(rng, 4);

    // water level per terrain
    geo.waterY = null;
    if (S.terrain === "lake" || S.terrain === "swamp") geo.waterY = Math.round(H * rng.range(0.68, 0.76));
    if (S.terrain === "mirrorwater") geo.waterY = Math.round(H * rng.range(0.64, 0.7));
    if (S.terrain === "coast") geo.waterY = hz + 2;
    geo.foreBase = Math.round(H * (S.hasWater ? rng.range(0.86, 0.9) : rng.range(0.82, 0.87)));

    if (S.terrain === "moonwood") drawMoonwoodBackdrop(g, rng, p, hz);

    // --- distant high mountains (some vistas) ---
    if (S.mountains) {
      const rearCol = mix(shade(p.land, -0.18), p.horizon, 0.94);
      const mCol = mix(shade(p.land, -0.34), p.horizon, 0.8);
      const mLit = mix(shade(mCol, 0.24), p.horizon, 0.18);
      const mShadow = mix(shade(mCol, -0.34), p.zenith, 0.12);
      const mDeep = shade(mShadow, -0.18);
      const mSnow = mix(rgb(235, 240, 245), p.horizon, 0.46);
      const mSnowShade = mix(shade(mSnow, -0.24), mCol, 0.2);
      const mRim = shade(mSnow, 0.13);
      const amp = rng.range(34, 58);
      const mBase = hz + 2;
      const msc = rng.range(0.018, 0.03);
      const moff = rng.range(0, 500);
      const snowOff = rng.range(0, 100);

      // A paler rear chain gives the range atmospheric depth before the
      // sharper foreground summits are laid over it.
      for (let x = 0; x < W; x++) {
        const rearRidge = Math.pow(clamp(1 - Math.abs(noise(x * msc * 0.72 + moff + 91)) * 1.2, 0, 1), 1.35);
        const rearY = Math.round(mBase - amp * (0.18 + rearRidge * 0.53));
        g.fillStyle = css(rearCol);
        g.fillRect(x, rearY, 1, mBase - rearY + 2);
        g.fillStyle = css(shade(rearCol, 0.09));
        g.fillRect(x, rearY, 1, 1);
      }

      const tops = new Int16Array(W);
      for (let x = 0; x < W; x++) {
        const ridge = Math.pow(clamp(1 - Math.abs(noise(x * msc + moff)) * 1.18, 0, 1), 1.22);
        const crag = noise(x * msc * 4.6 + moff + 173) * amp * 0.055;
        tops[x] = Math.round(mBase - ridge * amp - crag);
      }
      for (let x = 0; x < W; x++) {
        const y = tops[x];
        const slope = tops[Math.min(W - 1, x + 2)] - tops[Math.max(0, x - 2)];
        const lightDir = geo.lightFromLeft ? 1 : -1;
        const sunward = slope * lightDir > 0;
        g.fillStyle = css(mCol);
        g.fillRect(x, y, 1, mBase - y + 4);

        // Stepped diagonal facets follow the apparent rock planes. Sampling a
        // laterally drifting slope at each depth prevents a summit's light and
        // shadow boundary from dropping as a perfectly vertical screen line.
        const faceDepth = Math.max(2, Math.round((mBase - y) * (0.28 + Math.abs(noise(x * 0.045 + moff + 33)) * 0.18)));
        for (let depth = 1; depth <= faceDepth; depth++) {
          const stepDepth = Math.floor(depth / 3) * 3;
          const drift = Math.round(stepDepth * lightDir * 0.22 + noise(stepDepth * 0.12 + moff + 401) * 2);
          const sampleX = clamp(x + drift, 2, W - 3);
          const facetSlope = tops[sampleX + 2] - tops[sampleX - 2];
          const fracture = noise((x + stepDepth * 0.7) * 0.075 + moff + 449) * 2.4;
          const facetLit = facetSlope * lightDir + fracture > 0;
          g.fillStyle = css(facetLit ? mLit : mShadow, 0.82);
          g.fillRect(x, y + depth, 1, 1);
        }

        const snowLine = mBase - amp * 0.48 + noise(x * 0.09 + snowOff) * 4;
        if (y < snowLine) {
          const finger = Math.max(0, noise(x * 0.15 + snowOff + 71)) * 7;
          const snowBottom = Math.min(mBase - 1, Math.round(snowLine + finger));
          const snowDepth = Math.max(1, snowBottom - y);
          for (let depth = 0; depth < snowDepth; depth++) {
            const stepDepth = Math.floor(depth / 2) * 2;
            const drift = Math.round(stepDepth * lightDir * 0.2 + noise(stepDepth * 0.16 + snowOff + 307) * 2);
            const sampleX = clamp(x + drift, 2, W - 3);
            const snowSlope = tops[sampleX + 2] - tops[sampleX - 2];
            const fracture = noise((x + stepDepth * 0.62) * 0.09 + snowOff + 353) * 2.1;
            g.fillStyle = css(snowSlope * lightDir + fracture > 0 ? mSnow : mSnowShade);
            g.fillRect(x, y + depth, 1, 1);
          }

          // Sparse rock windows interrupt the cap instead of leaving a single
          // smooth white slab across every summit.
          const outcrop = noise(x * 0.24 + snowOff + 211);
          if (outcrop > 0.43 && snowBottom - y > 5) {
            const oy = y + 2 + Math.round((snowBottom - y) * 0.42);
            g.fillStyle = css(sunward ? mCol : mDeep);
            g.fillRect(x, oy, 1, Math.min(3, snowBottom - oy));
          }
        }

        // Broken, gently diagonal gullies continue below the snow fields.
        if (noise(x * 0.115 + moff + 287) > 0.52) {
          const gy = Math.max(y + 5, Math.round(snowLine));
          const gl = Math.min(mBase - gy, 5 + Math.round(Math.abs(noise(x * 0.07 + moff)) * 10));
          const gullyDir = noise(x * 0.055 + moff + 509) > 0 ? 1 : -1;
          g.fillStyle = css(mDeep, 0.7);
          for (let yy = 0; yy < gl; yy += 2) {
            const gx = x + Math.round(yy * 0.16 * gullyDir + noise(yy * 0.2 + x + moff) * 0.8);
            g.fillRect(gx, gy + yy, 1, 1);
          }
        }
        g.fillStyle = css(y < snowLine ? mRim : (sunward ? mLit : mShadow));
        g.fillRect(x, y, 1, 1);
      }

      // Distance veil: retain crisp summit silhouettes while progressively
      // dissolving lower rock, snow, and gullies into the horizon color. Damp
      // and snowy weather carries a little more suspended atmosphere.
      const weatherHaze = ({ mist: 0.08, snow: 0.055, storm: 0.045,
        rain: 0.035, overcast: 0.03 })[S.weather] || 0;
      for (let x = 0; x < W; x++) {
        const top = tops[x];
        const height = Math.max(1, mBase - top);
        for (let yy = top; yy < mBase; yy++) {
          const depth = (yy - top) / height;
          const drift = 0.94 + noise(x * 0.035 + yy * 0.018 + moff + 613) * 0.06;
          const veil = (0.025 + depth * 0.12 + weatherHaze * (0.45 + depth * 0.55)) * drift;
          g.fillStyle = css(p.horizon, veil);
          g.fillRect(x, yy, 1, 1);
        }
      }
    }

    // --- rare omen: a distant volcano behind the ridges ---
    Omens.bakeBackdrop(S, geo, g, rng);

    // --- far ridges ---
    const nRidges = { lake: 2, coast: 1, valley: 3, hills: 2, plains: 1, swamp: 1,
      darkforest: 2, moonwood: 2, highlands: 4, ruinpeak: 2, mirrorwater: 2 }[S.terrain];
    for (let i = 0; i < nRidges; i++) {
      const baseY = hz + i * rng.range(5, 9) + 2;
      const amp = (S.terrain === "plains" ? 6 : 12 + i * 7) * rng.range(0.8, 1.3);
      const sc = rng.range(0.008, 0.016);
      const off = rng.range(0, 500);
      const col = p.ridge(i);
      const rim = shade(col, 0.13);
      for (let x = 0; x < W; x++) {
        const y = Math.round(baseY - (noise(x * sc + off) * 0.5 + 0.5) * amp);
        g.fillStyle = css(col);
        g.fillRect(x, y, 1, (geo.waterY ?? H) - y + 2);
        g.fillStyle = css(rim);
        g.fillRect(x, y, 1, 1);
      }
    }

    if (S.terrain === "highlands") drawCloudSea(g, rng, p, hz, noise);

    // distant isles for coast
    if (S.terrain === "coast" && rng.chance(0.6)) {
      const nI = rng.int(1, 2);
      for (let k = 0; k < nI; k++) {
        const ix = rng.range(0.1, 0.9) * W, iw = rng.range(14, 36), ih = rng.range(3, 7);
        g.fillStyle = css(p.ridge(0));
        for (let dx = -iw; dx <= iw; dx++) {
          const hgt = ih * (1 - (dx / iw) * (dx / iw));
          g.fillRect((ix + dx) | 0, Math.round(geo.waterY - hgt), 1, Math.ceil(hgt) + 1);
        }
      }
    }

    // A thin veil between the far silhouettes and the playable landscape.
    // Drawing it here means the nearer ground and structure remain crisp.
    const hazeTop = Math.max(0, hz - rng.int(7, 12));
    const hazeBottom = Math.min(H, hz + rng.int(16, 25));
    for (let y = hazeTop; y < hazeBottom; y++) {
      const f = (y - hazeTop) / Math.max(1, hazeBottom - hazeTop - 1);
      const a = Math.sin(f * Math.PI) * (S.weather === "mist" ? 0.2 : 0.11);
      g.fillStyle = css(p.horizon, a);
      g.fillRect(0, y, W, 1);
    }

    // --- mid terrain (ground the structure stands on) ---
    const kind = S.structure === "none" ? null : S.structure;
    let struct = null;
    if (kind) struct = buildStructure(rng, p, kind, geo.lightFromLeft);
    // true footprint so no tower ever overhangs its ground
    let footL = 18, footR = 18;
    if (struct) {
      const f = measureFoot(struct.canvas);
      footL = Math.max(2, Math.ceil(struct.w / 2 - f.left) + 2);
      footR = Math.max(2, Math.ceil(f.right - struct.w / 2) + 2);
    }
    let siteX = clamp(Math.round(S.castleX * W), footL + 4, W - footR - 4);
    geo.anchors = { flags: [], smoke: [], litWindows: [], mill: null };
    geo.waterfalls = [];
    geo.structGround = null;
    geo.caves = [];

    const stampStructure = (baseline) => {
      if (!struct) return;
      const ox = siteX - Math.round(struct.w / 2);
      const oy = Math.round(baseline) - struct.h;
      g.drawImage(struct.canvas, ox, oy);
      for (const f of struct.flags) geo.anchors.flags.push({ x: ox + f.x, y: oy + f.y, ph: rng.range(0, 6) });
      for (const sm of struct.smoke) geo.anchors.smoke.push({ ...sm, x: ox + sm.x, y: oy + sm.y });
      for (const lw of struct.litWindows) geo.anchors.litWindows.push({ x: ox + lw.x, y: oy + lw.y, ph: rng.range(0, 6) });
      if (struct.mill) geo.anchors.mill = { x: ox + struct.mill.x, y: oy + struct.mill.y, r: struct.mill.r, ph: rng.range(0, 6) };
      // walkable ground in front of the structure, for characters
      geo.structGround = { l: siteX - footL, r: siteX + footR, y: Math.round(baseline) - 1 };
    };

    let flat = struct ? { l: siteX - footL, r: siteX + footR, apron: rng.int(10, 16) } : null;
    const groundCols = []; // decoration surface: {x, y, col}

    if (S.terrain === "lake" || S.terrain === "swamp") {
      // far shore between ridges and waterline (swamps lie low and flat)
      const swamp = S.terrain === "swamp";
      const off = rng.range(0, 500), sc = rng.range(0.006, 0.012);
      const amp = (geo.waterY - hz - 4) * (swamp ? 0.35 : 0.9);
      const isIsland = !swamp && S.castleSite === "island" && struct;
      const shoreCol = p.midLand;
      const natural = (x) => geo.waterY - 3 - (noise(x * sc + off) * 0.5 + 0.5) * amp;
      const gr = makeGround(natural, 0, W - 1, isIsland ? null : flat);
      for (let x = 0; x < W; x++) {
        const y = gr.ys[x];
        g.fillStyle = css(shoreCol);
        g.fillRect(x, y, 1, geo.waterY - y + 1);
        g.fillStyle = css(shade(shoreCol, 0.12));
        g.fillRect(x, y, 1, 1);
        groundCols.push({ x, y, col: shoreCol });
      }
      if (swamp) {
        // gnarled dead trees along the far shore
        const dead = shade(shoreCol, -0.45);
        for (let i = 0, n = rng.int(3, 6); i < n; i++) {
          const tx = rng.int(6, W - 7);
          if (struct && Math.abs(tx - siteX) < footL + 10) continue;
          drawDeadTree(g, tx, groundCols[tx].y + 2, rng.int(8, 15), dead, rng);
        }
      }
      if (isIsland) {
        // flat-topped mound wide enough for the whole footprint
        const peak = Math.round(geo.waterY - rng.range(10, 18));
        const iCol = shade(p.midLand, -0.1);
        const fallL = rng.int(8, 16), fallR = rng.int(8, 16);
        for (let x = siteX - footL - fallL; x <= siteX + footR + fallR; x++) {
          if (x < 0 || x >= W) continue;
          let y = peak;
          if (x < siteX - footL) { const f2 = (siteX - footL - x) / fallL; y = lerp(peak, geo.waterY + 4, f2 * f2); }
          else if (x > siteX + footR) { const f2 = (x - siteX - footR) / fallR; y = lerp(peak, geo.waterY + 4, f2 * f2); }
          y = Math.round(y);
          g.fillStyle = css(iCol);
          g.fillRect(x, y, 1, geo.waterY + 5 - y);
          g.fillStyle = css(shade(iCol, 0.1));
          g.fillRect(x, y, 1, 1);
        }
        stampStructure(peak + 1);
      } else if (struct) {
        stampStructure(gr.plateauY + 1);
      }
    }

    else if (S.terrain === "coast" || S.terrain === "mirrorwater") {
      // cliff mass on one side
      const mirror = S.terrain === "mirrorwater";
      const leftSide = S.castleX < 0.5;
      let inner = Math.round(W * (mirror ? rng.range(0.38, 0.56) : rng.range(0.32, 0.46)));
      inner = Math.max(inner, Math.round((footL + footR) * 1.6) + 24);
      inner = Math.min(inner, W - 20);
      const cliffHigh = geo.waterY - rng.range(mirror ? 38 : 26, mirror ? 62 : 44);
      const cCol = shade(p.midLand, -0.12);
      const smoothstep = (f) => f * f * (3 - 2 * f);
      const localF = (x) => (leftSide ? x : W - 1 - x) / inner;
      const natural = (x) => lerp(cliffHigh, geo.waterY + 10, smoothstep(clamp(localF(x), 0, 1))) + noise(x * 0.03) * 5;
      if (struct) {
        // keep the whole footprint on the high part of the cliff, fully on rock
        const hiEnd = Math.round(inner * 0.68);
        const nearFoot = leftSide ? footL : footR;
        const farFoot = leftSide ? footR : footL;
        let sx = Math.round(inner * rng.range(0.28, 0.5));
        sx = clamp(sx, nearFoot + 4, Math.max(nearFoot + 4, hiEnd - farFoot));
        siteX = leftSide ? sx : W - 1 - sx;
        flat = { l: siteX - footL, r: siteX + footR, apron: 10 };
      }
      const x0 = leftSide ? 0 : W - 1 - inner;
      const x1 = leftSide ? inner : W - 1;
      const gr = makeGround(natural, x0, x1, flat);
      for (let x = x0; x <= x1; x++) {
        const y = gr.ys[x];
        g.fillStyle = css(cCol);
        g.fillRect(x, y, 1, H - y);
        g.fillStyle = css(shade(cCol, 0.14));
        g.fillRect(x, y, 1, 1);
        if (localF(x) < 0.66) groundCols.push({ x, y, col: cCol });
      }
      if (struct) stampStructure(gr.plateauY + 1);
    }

    else if (S.terrain === "highlands") {
      // A single inhabited summit rises through broken banks of cloud.
      const baseY = H * rng.range(0.72, 0.79);
      const span = Math.max(footL + footR + 34, W * rng.range(0.22, 0.34));
      const peakH = H * rng.range(0.2, 0.29);
      const off = rng.range(0, 400);
      const natural = (x) => baseY - Math.pow(Math.max(0, 1 - Math.abs(x - siteX) / span), 1.45) * peakH + noise(x * 0.035 + off) * 3;
      const gr = makeGround(natural, 0, W - 1, flat);
      const body = shade(p.midLand, -0.12), lit = shade(body, 0.16), deep = shade(body, -0.3);
      for (let x = 0; x < W; x++) {
        const y = gr.ys[x];
        g.fillStyle = css(body); g.fillRect(x, y, 1, H - y);
        g.fillStyle = css((x < siteX) === geo.lightFromLeft ? lit : deep, 0.52);
        if ((x + Math.round(y)) % 4 !== 0) g.fillRect(x, y + 1, 1, Math.min(12, H - y));
        g.fillStyle = css(lit); g.fillRect(x, y, 1, 1);
        groundCols.push({ x, y, col: body });
      }
      // Cloud gaps cut across the lower slopes and make the peak feel airborne.
      drawCloudSea(g, rng, p, Math.round(baseY - 18), noise);
      if (struct) stampStructure(gr.plateauY + 1);
    }

    else if (S.terrain === "ruinpeak") {
      // Monumental stepped masonry: part mountain, part structure, old enough
      // that its geometry has softened into the landscape.
      const baseY = H * rng.range(0.75, 0.82);
      const span = Math.max(footL + footR + 30, W * rng.range(0.27, 0.39));
      const peakH = H * rng.range(0.24, 0.34);
      const natural = (x) => {
        const rise = Math.max(0, 1 - Math.abs(x - siteX) / span) * peakH;
        return baseY - Math.floor(rise / 5) * 5 + noise(x * 0.055 + 81) * 1.5;
      };
      const gr = makeGround(natural, 0, W - 1, flat);
      const stone = mix(p.midLand, p.castleMid, 0.42);
      const light = shade(stone, 0.18), dark = shade(stone, -0.34);
      for (let x = 0; x < W; x++) {
        const y = gr.ys[x];
        g.fillStyle = css(stone); g.fillRect(x, y, 1, H - y);
        g.fillStyle = css((x < siteX) === geo.lightFromLeft ? light : dark, 0.58);
        if (Math.abs(x - siteX) % 9 < 2) g.fillRect(x, y + 2, 1, Math.min(18, H - y));
        g.fillStyle = css(light); g.fillRect(x, y, 1, 1);
        if ((Math.round(y) + x) % 11 === 0) {
          g.fillStyle = css(dark, 0.72); g.fillRect(x, y + rng.int(4, 16), rng.int(2, 4), 1);
        }
        groundCols.push({ x, y, col: stone });
      }
      // A narrow stair and sparse rune-panels lead toward the summit.
      const stairDir = geo.lightFromLeft ? -1 : 1;
      g.fillStyle = css(light, 0.66);
      for (let i = 0; i < 12; i++) {
        const sx = siteX + stairDir * (footL + 4 + i * 2);
        const sy = gr.ys[clamp(Math.round(sx), 0, W - 1)] + 2;
        g.fillRect(Math.round(sx), sy, 4, 1);
      }
      g.fillStyle = css(dark, 0.82);
      for (let i = 0; i < rng.int(2, 4); i++) {
        const rx = clamp(siteX + rng.int(-Math.round(span * 0.55), Math.round(span * 0.55)), 3, W - 4);
        const ry = gr.ys[Math.round(rx)] + rng.int(5, 14);
        g.fillRect(rx - 2, ry - 3, 5, 4);
        g.fillStyle = css(p.accent, 0.34); g.fillRect(rx, ry - 2, 1, 2);
        g.fillStyle = css(dark, 0.82);
      }
      if (struct) stampStructure(gr.plateauY + 1);
    }

    else { // valley / hills / plains / moonwood — stacked ground bands, no water
      const bands = S.terrain === "valley" ? 2 : 1;
      const structBand = struct ? (S.terrain === "valley" ? rng.int(0, 1) : 0) : -1;
      for (let b = 0; b < bands; b++) {
        const isLast = b === bands - 1;
        const bCol = b === 0 ? p.midLand : shade(p.midLand, -0.16);
        const baseY = bands === 2
          ? (b === 0 ? hz + rng.range(8, 14) : H * rng.range(0.66, 0.72))
          : H * (S.terrain === "plains" ? rng.range(0.6, 0.66) : rng.range(0.58, 0.66));
        const amp = S.terrain === "plains" ? 3 : S.terrain === "hills" ? rng.range(14, 22) : rng.range(8, 16);
        const off = rng.range(0, 500), sc = rng.range(0.006, 0.014);
        const natural = (x) => baseY - (noise(x * sc + off) * 0.5 + 0.5) * amp;
        const gr = makeGround(natural, 0, W - 1, b === structBand ? flat : null);
        if (b === structBand) stampStructure(gr.plateauY + 1);
        for (let x = 0; x < W; x++) {
          g.fillStyle = css(bCol);
          g.fillRect(x, gr.ys[x], 1, H - gr.ys[x]);
          g.fillStyle = css(shade(bCol, 0.12));
          g.fillRect(x, gr.ys[x], 1, 1);
          if (isLast) groundCols.push({ x, y: gr.ys[x], col: bCol });
        }
      }
    }

    // --- rare omen: a burning village baked into this band ---
    const omenZone = Omens.bakeMid(S, geo, g, groundCols, rng);

    // --- landscape decorations ---
    decorate(g, rng, groundCols, flat, p, omenZone);
  }

  function drawPine(g, x, baseY, h, col, rng) {
    g.fillStyle = css(col);
    g.fillRect(x, baseY - 2, 1, 2);
    for (let i = 0; i < h; i++) {
      let w = Math.max(1, Math.round((i / h) * h * 0.42));
      if (i % 3 === 2) w = Math.max(1, w - 1);
      g.fillRect(x - (w >> 1), baseY - h + i - 2, w, 1);
    }
  }

  function drawDeadTree(g, x, baseY, h, col, rng) {
    g.fillStyle = css(col);
    const lean = rng.range(-1.5, 1.5);
    for (let i = 0; i < h; i++) {
      g.fillRect(x + Math.round(lean * (i / h)), baseY - i, 1, 1);
    }
    for (let b = 0, n = rng.int(2, 4); b < n; b++) {
      const bh = rng.int(Math.round(h * 0.4), h - 1);
      const bdir = rng.chance(0.5) ? 1 : -1;
      const len = rng.int(2, 4);
      const bx = x + Math.round(lean * (bh / h));
      for (let i = 1; i <= len; i++)
        g.fillRect(bx + i * bdir, baseY - bh - Math.round(i * 0.6), 1, 1);
    }
  }

  /* measure the true opaque footprint of a structure sprite (bottom rows) */
  function measureFoot(cv) {
    const img = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let left = cv.width, right = 0;
    for (let x = 0; x < cv.width; x++) {
      for (let y = cv.height - 8; y < cv.height; y++) {
        if (img[(y * cv.width + x) * 4 + 3] > 10) {
          if (x < left) left = x;
          if (x > right) right = x;
          break;
        }
      }
    }
    if (right < left) { left = 0; right = cv.width - 1; }
    return { left, right };
  }

  /* natural ground line, held perfectly flat under a structure footprint,
     eased back to natural over an apron on each side */
  function makeGround(naturalFn, x0, x1, flat) {
    const ys = new Int16Array(W);
    let plateauY = Infinity;
    if (flat) {
      for (let x = Math.max(x0, flat.l); x <= Math.min(x1, flat.r); x++)
        plateauY = Math.min(plateauY, naturalFn(x));
    }
    for (let x = x0; x <= x1; x++) {
      let y = naturalFn(x);
      if (flat) {
        if (x >= flat.l && x <= flat.r) y = plateauY;
        else {
          const d = x < flat.l ? flat.l - x : x - flat.r;
          if (d < flat.apron) {
            const tt = d / flat.apron;
            y = lerp(plateauY, y, tt * tt * (3 - 2 * tt));
          }
        }
      }
      ys[x] = Math.round(y);
    }
    return { ys, plateauY: flat ? Math.round(plateauY) : 0 };
  }

  /* ---------- landscape decorations ---------- */
  function decorate(g, rng, cols, avoid, p, extraAvoid) {
    if (!cols.length) return;
    const map = new Map();
    let minX = Infinity, maxX = -Infinity;
    for (const c of cols) {
      map.set(c.x, c);
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
    }
    const placed = [];
    if (avoid) placed.push([avoid.l - 8, avoid.r + 8]);
    if (extraAvoid) placed.push(extraAvoid);
    const maxCaveY = geo.waterY !== null ? geo.waterY - 2 : geo.foreBase - 4;

    // sparse vegetation/soil speckle so wide fields aren't dead flat
    for (const c of cols) {
      if (!rng.chance(0.07)) continue;
      const depth = (geo.waterY !== null ? geo.waterY : geo.foreBase) - c.y;
      if (depth < 5) continue;
      g.fillStyle = css(shade(c.col, rng.chance(0.7) ? -0.14 : 0.09), 0.8);
      g.fillRect(c.x, c.y + rng.int(2, Math.min(14, depth - 2)), 1, 1);
    }

    function groundSupport(x, halfW, maxRelief = Infinity) {
      let minY = Infinity, maxY = -Infinity;
      for (let xx = x - halfW; xx <= x + halfW; xx++) {
        const cc = map.get(xx);
        if (!cc) return null;
        minY = Math.min(minY, cc.y);
        maxY = Math.max(maxY, cc.y);
      }
      if (maxY - minY > maxRelief) return null;
      return { minY, maxY };
    }

    function tryPlace(halfW, need, maxRelief = Infinity) {
      if (maxX - minX < halfW * 2 + 8) return null;
      for (let tries = 0; tries < 26; tries++) {
        const x = rng.int(minX + halfW + 2, maxX - halfW - 2);
        const c = map.get(x);
        if (!c) continue;
        if (need && !need(c)) continue;
        const support = groundSupport(x, halfW, maxRelief);
        if (!support) continue;
        let ok = true;
        for (const iv of placed) if (x + halfW > iv[0] && x - halfW < iv[1]) { ok = false; break; }
        if (!ok) continue;
        placed.push([x - halfW, x + halfW]);
        // Broad objects sit on the lowest point beneath their footprint. On a
        // gentle slope this embeds a pixel or two instead of leaving daylight
        // under the downhill edge.
        return { ...c, y: Number.isFinite(maxRelief) ? support.maxY : c.y };
      }
      return null;
    }

    // loose scatter of shrubs, stones, boulders and small trees — most land is lived-in
    const scatterN = Math.round(W / 26);
    for (let i = 0; i < scatterN; i++) {
      const c = cols[rng.int(0, cols.length - 1)];
      if (avoid && c.x > avoid.l - 6 && c.x < avoid.r + 6) continue;
      const roll = rng.next();
      const clearance = roll < 0.38 ? 3 : roll < 0.58 ? 2 : roll < 0.7 ? 4 : roll < 0.9 ? 3 : 7;
      if (!groundSupport(c.x, clearance)) continue;
      if (roll < 0.38) drawShrub(g, c.x, c.y + rng.int(1, 4), rng, c.col);
      else if (roll < 0.58) {
        g.fillStyle = css(shade(c.col, -0.25));
        g.fillRect(c.x, c.y + rng.int(1, 5), rng.int(1, 2), 1);
      }
      else if (roll < 0.7) drawBoulder(g, c.x, c.y + rng.int(2, 5), rng, c.col);
      else if (roll < 0.9) drawPine(g, c.x, c.y + 2, rng.int(5, 9), shade(c.col, -0.3), rng);
      else drawOak(g, c.x, c.y + 2, rng.int(8, 12), c.col, rng);
    }

    const picks = [];
    if (new URLSearchParams(location.search).has("force")) picks.push(new URLSearchParams(location.search).get("force"));
    if (S.terrain === "darkforest") { picks.push("forest", "forest"); } // the wood is the point
    if (S.terrain === "moonwood") picks.push("forest", "forest", "forest", "grove", "columns");
    if (S.terrain === "ruinpeak") picks.push("columns", "archRuin", "cairn");
    if (S.terrain === "highlands") picks.push("crag", "obelisk");
    if (geo.waterY !== null && rng.chance(0.4)) picks.push("waterfall");
    if (rng.chance(0.55)) picks.push("forest");
    if (rng.chance(0.5)) picks.push("grove");
    if (rng.chance(0.3)) picks.push("grove");
    if (rng.chance(0.5)) picks.push("greatTree");
    if (rng.chance(0.45)) picks.push("crag");
    if (S.terrain !== "plains" && rng.chance(0.25)) picks.push("cave");
    if (rng.chance(0.35)) picks.push(rng.pick(["statue", "obelisk", "archRuin", "columns", "cairn"]));
    if (rng.chance(0.2)) picks.push(rng.pick(["statue", "obelisk", "columns", "cairn"]));
    if (!picks.length) picks.push(rng.pick(["grove", "greatTree", "crag"]));

    for (const kind of picks) {
      let c;
      switch (kind) {
        case "waterfall":
          c = tryPlace(9, (cc) => geo.waterY - cc.y > 14);
          if (c) buildWaterfall(g, c.x, c.y, rng, p);
          break;
        case "forest": {
          const half = S.terrain === "darkforest" || S.terrain === "moonwood"
            ? rng.int(40, Math.max(44, Math.round(W * 0.2)))
            : rng.int(26, Math.max(28, Math.round(W * 0.13)));
          c = tryPlace(half);
          if (c) drawForest(g, c.x, half, map, rng, false);
          break;
        }
        case "grove": {
          const half = rng.int(10, 18);
          c = tryPlace(half);
          if (c) drawForest(g, c.x, half, map, rng, true);
          break;
        }
        case "greatTree":
          c = tryPlace(18);
          if (c) drawOak(g, c.x, c.y + 2, rng.int(20, 32), c.col, rng);
          break;
        case "crag":
          c = tryPlace(15);
          if (c) drawCrag(g, c.x, c.y, rng, c.col);
          break;
        case "cave":
          c = tryPlace(9);
          if (c) drawCave(g, c.x, c.y, maxCaveY, rng, c.col);
          break;
        case "statue": c = tryPlace(5, null, 10); if (c) drawStatue(g, c.x, c.y + 1, rng, p); break;
        case "obelisk": c = tryPlace(4, null, 10); if (c) drawObelisk(g, c.x, c.y + 1, rng, p); break;
        case "archRuin": c = tryPlace(8, null, 10); if (c) drawArchRuin(g, c.x, c.y + 1, rng, p); break;
        case "columns": c = tryPlace(8, null, 10); if (c) drawColumns(g, c.x, c.y + 1, rng, p); break;
        case "cairn": c = tryPlace(4, null, 10); if (c) drawCairn(g, c.x, c.y + 1, rng, p); break;
      }
    }
  }

  function drawForest(g, cx, half, map, rng, sparse) {
    const bare = S.season === "winter";
    const edgeInset = sparse ? 4 : 6;
    for (let pass = 0; pass < 2; pass++) {
      const shadeF = pass === 0 ? -0.22 : -0.36;
      let x = cx - half + edgeInset + rng.int(0, 2);
      while (x <= cx + half - edgeInset) {
        const c = map.get(x);
        if (c) {
          const h = rng.int(6, pass === 0 ? 12 : 16);
          if (!bare && rng.chance(0.15)) drawOak(g, x, c.y + 2 + pass, rng.int(9, 14), c.col, rng);
          else drawPine(g, x, c.y + 2 + pass, h, shade(c.col, shadeF), rng);
        }
        x += (sparse ? 5 : 3) + rng.int(0, 3);
      }
    }
  }

  function drawOak(g, x, baseY, h, groundCol, rng) {
    const trunkCol = shade(groundCol, -0.45);
    const th = Math.round(h * 0.45);
    g.fillStyle = css(trunkCol);
    g.fillRect(x, baseY - th - 2, h > 16 ? 2 : 1, th + 2);
    if (h > 16) {
      g.fillRect(x - 1, baseY - th - 3, 1, 2);
      g.fillRect(x + 2, baseY - th - 4, 1, 2);
    }
    if (S.season === "winter") {
      // bare limbs
      const nL = Math.round(h * 0.6);
      for (let i = 0; i < nL; i++) {
        const ang = rng.range(-1.2, 1.2);
        const len = rng.range(2, h * 0.35);
        g.fillRect(Math.round(x + Math.sin(ang) * len), Math.round(baseY - th - 2 - Math.cos(ang) * len * 0.9), 1, 1);
      }
      return;
    }
    const leaf = shade(groundCol, -0.18);
    const lit = shade(groundCol, -0.02);
    const under = shade(groundCol, -0.4);
    const cw = Math.max(4, Math.round(h * 0.42));
    const blobs = rng.int(3, 5);
    for (let i = 0; i < blobs; i++) {
      const bx = Math.round(x + rng.int(-cw + 3, cw - 3) * 0.6);
      const by = baseY - th - 3 - rng.int(0, Math.round(h * 0.28));
      const rx = rng.int(3, cw - 1), ry = Math.max(2, Math.round(rx * 0.6));
      for (let dy = -ry; dy <= ry; dy++) {
        const w2 = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
        if (!w2) continue;
        g.fillStyle = css(dy > ry * 0.3 ? under : dy < -ry * 0.3 ? lit : leaf);
        g.fillRect(bx - w2, by + dy, w2 * 2, 1);
      }
    }
  }

  function drawCrag(g, x, gy, rng, groundCol) {
    const body = shade(groundCol, -0.3);
    const litC = shade(groundCol, -0.1);
    const dark = shade(groundCol, -0.5);
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const bx = x + rng.int(-8, 8);
      const bw = rng.int(5, 11);
      const bh = rng.int(7, 16);
      const wTop = Math.max(1, Math.round(bw * 0.3));
      for (let dy = 0; dy < bh; dy++) {
        const w2 = Math.max(1, Math.round(lerp(wTop, bw, dy / bh)) + rng.int(-1, 1));
        const lx = bx - (w2 >> 1);
        g.fillStyle = css(body);
        g.fillRect(lx, gy + 2 - bh + dy, w2, 1);
        g.fillStyle = css(geo.lightFromLeft ? litC : dark);
        g.fillRect(lx, gy + 2 - bh + dy, 1, 1);
        g.fillStyle = css(geo.lightFromLeft ? dark : litC);
        g.fillRect(lx + w2 - 1, gy + 2 - bh + dy, 1, 1);
      }
      g.fillStyle = css(litC);
      g.fillRect(bx - (wTop >> 1), gy + 1 - bh, wTop, 1);
    }
  }

  function drawCave(g, x, gy, maxY, rng, groundCol) {
    const ch = rng.int(5, 7);
    const cw = rng.int(5, 8);
    const floor = Math.min(gy + ch + rng.int(4, 9), maxY);
    if (floor - ch <= gy + 1) return;
    const rim = shade(groundCol, -0.42);
    const rimLit = shade(groundCol, -0.15);
    const dark = shade(groundCol, -0.72);
    const black = shade(groundCol, -0.9);
    // outer rocky rim arch
    for (let dy = 0; dy <= ch; dy++) {
      const u = dy / ch;
      const w2 = Math.max(1, Math.round((cw + 1) * Math.sqrt(Math.max(0, 1 - u * u))));
      g.fillStyle = css(rim);
      g.fillRect(x - w2, floor - dy - 1, w2 * 2 + 1, 1);
    }
    // mouth
    for (let dy = 0; dy < ch; dy++) {
      const u = dy / (ch - 1);
      const w2 = Math.max(1, Math.round(cw * Math.sqrt(Math.max(0, 1 - u * u))));
      g.fillStyle = css(dark);
      g.fillRect(x - w2, floor - dy, w2 * 2 + 1, 1);
    }
    // pitch-black depths
    for (let dy = 0; dy < ch - 1; dy++) {
      const u = dy / Math.max(1, ch - 2);
      const w2 = Math.max(1, Math.round((cw - 2) * Math.sqrt(Math.max(0, 1 - u * u))));
      g.fillStyle = css(black);
      g.fillRect(x - w2, floor - dy, w2 * 2 + 1, 1);
    }
    // stalactites hanging in the mouth
    g.fillStyle = css(rim);
    for (let i = 0, n = rng.int(2, 3); i < n; i++) {
      g.fillRect(x + rng.int(-cw + 2, cw - 2), floor - ch + 1, 1, rng.int(1, 2));
    }
    // craggy highlights around the rim
    g.fillStyle = css(rimLit);
    g.fillRect(x + rng.int(-3, 1), floor - ch - 1, rng.int(1, 3), 1);
    g.fillRect(x - cw - 1, floor - rng.int(0, 2), 1, 1);
    g.fillRect(x + cw, floor - rng.int(0, 2), 1, 1);
    // rubble spilling from the entrance
    g.fillStyle = css(rim);
    for (let i = 0, nR = rng.int(3, 5); i < nR; i++)
      g.fillRect(x + rng.int(-cw - 2, cw + 2), floor + rng.int(1, 3), rng.int(1, 2), 1);
    geo.caves.push({ x, y: floor - 1 });
  }

  function drawShrub(g, x, gy, rng, groundCol) {
    if (S.season === "winter") { // bare twiggy scrub
      g.fillStyle = css(shade(groundCol, -0.35));
      g.fillRect(x, gy - 2, 1, 2);
      g.fillRect(x - 1, gy - 3, 1, 1);
      g.fillRect(x + 1, gy - 3, 1, 1);
      return;
    }
    const w = rng.int(3, 5);
    g.fillStyle = css(shade(groundCol, -0.22));
    g.fillRect(x - (w >> 1), gy - 1, w, 2);
    g.fillRect(x - (w >> 1) + 1, gy - 2, w - 2, 1);
    g.fillStyle = css(shade(groundCol, -0.08));
    g.fillRect(x - (w >> 1) + 1, gy - 2, 1, 1);
  }

  function drawBoulder(g, x, gy, rng, groundCol) {
    const w = rng.int(4, 7), h = rng.int(2, 4);
    const body = shade(groundCol, -0.3);
    for (let dy = 0; dy < h; dy++) {
      const ww = Math.max(2, w - dy * 2);
      g.fillStyle = css(body);
      g.fillRect(x - (ww >> 1), gy - dy, ww, 1);
    }
    g.fillStyle = css(shade(groundCol, -0.08));
    g.fillRect(x - (geo.lightFromLeft ? 1 : 0), gy - h + 1, 1, 1);
    g.fillStyle = css(shade(groundCol, -0.55));
    g.fillRect(x + rng.int(-1, 1), gy, 1, 1);
  }

  function drawStatue(g, x, gy, rng, p) {
    g.fillStyle = css(p.castleDark);
    g.fillRect(x - 3, gy - 2, 6, 2);                    // base
    g.fillStyle = css(p.castleMid);
    g.fillRect(x - 2, gy - 4, 4, 2);                    // plinth
    g.fillRect(x - 1, gy - 9, 2, 5);                    // robed figure
    g.fillRect(x + (geo.lightFromLeft ? -2 : 2), gy - 9, 1, 2); // raised arm
    g.fillRect(x - 1, gy - 11, 2, 2);                   // head
    g.fillStyle = css(p.castleLight);
    g.fillRect(x - 1, gy - 9, 1, 5);
    g.fillRect(x - 1, gy - 11, 1, 1);
  }

  function drawObelisk(g, x, gy, rng, p) {
    const h = rng.int(11, 17);
    g.fillStyle = css(p.castleDark);
    g.fillRect(x - 2, gy - 2, 5, 2);
    g.fillStyle = css(p.castleMid);
    g.fillRect(x - 1, gy - 2 - h, 2, h);
    g.fillRect(x, gy - 3 - h, 1, 1); // pyramidion tip
    g.fillStyle = css(p.castleLight);
    g.fillRect(x - 1, gy - 2 - h, 1, h);
  }

  function drawArchRuin(g, x, gy, rng, p) {
    const gap = rng.int(5, 8), ph = rng.int(8, 12);
    for (const side of [-1, 1]) {
      const px2 = x + side * ((gap >> 1) + 1);
      g.fillStyle = css(p.castleMid);
      g.fillRect(px2 - 1, gy - ph, 2, ph);
      g.fillStyle = css(p.castleLight);
      g.fillRect(px2 - 1, gy - ph, 1, ph);
    }
    // broken lintel springing from the left pillar
    g.fillStyle = css(p.castleMid);
    g.fillRect(x - (gap >> 1) - 2, gy - ph - 2, rng.int(Math.round(gap * 0.5), gap) + 2, 2);
    g.fillStyle = css(p.castleDark);
    g.fillRect(x + rng.int(-2, 2), gy - 2, rng.int(2, 3), 2); // fallen block
  }

  function drawColumns(g, x, gy, rng, p) {
    const n = rng.int(2, 4);
    const startX = x - Math.round(((n - 1) * 5) / 2);
    for (let i = 0; i < n; i++) {
      const h = rng.int(4, 12);
      const px2 = startX + i * 5;
      g.fillStyle = css(p.castleMid);
      g.fillRect(px2 - 1, gy - h, 2, h);
      g.fillStyle = css(p.castleLight);
      g.fillRect(px2 - 1, gy - h, 1, h);
      g.fillStyle = css(p.castleDark);
      g.fillRect(px2 - 1, gy - h, 2, 1); // broken top
    }
  }

  function drawCairn(g, x, gy, rng, p) {
    g.fillStyle = css(shade(p.castleMid, -0.1));
    g.fillRect(x - 3, gy - 2, 6, 2);
    g.fillRect(x - 2, gy - 4, 4, 2);
    g.fillRect(x - 1, gy - 5, 2, 1);
    g.fillStyle = css(p.castleLight);
    g.fillRect(x - 1, gy - 5, 1, 1);
  }

  function buildWaterfall(g, x, gy, rng, p) {
    const top = gy - rng.int(1, 3);
    const bottom = geo.waterY;
    const rock = shade(p.midLand, -0.32);
    const rockLit = shade(p.midLand, -0.12);
    // flanking rocks at the lip
    for (const side of [-1, 1]) {
      const bx = x + side * 4;
      const bh = rng.int(4, 7);
      for (let dy = 0; dy < bh; dy++) {
        const w2 = Math.round(lerp(2, 4, dy / bh));
        g.fillStyle = css(rock);
        g.fillRect(bx - (w2 >> 1), top - bh + dy + 2, w2, 1);
      }
      g.fillStyle = css(rockLit);
      g.fillRect(bx - 1, top - bh + 2, 2, 1);
    }
    // the fall itself (static column is baked, so it reflects in the water)
    const fall = mix(p.horizon, rgb(255, 255, 255), 0.25);
    for (let y = top; y <= bottom; y++) {
      g.fillStyle = css(fall, 0.75);
      g.fillRect(x - 1, y, 3, 1);
      if ((x + y) % 2) {
        g.fillStyle = css(fall, 0.4);
        g.fillRect(x - 2, y, 1, 1);
        g.fillRect(x + 2, y, 1, 1);
      }
    }
    geo.waterfalls.push({ x, top, bottom });
  }

  /* ---------- foreground ---------- */
  function buildFore(rng) {
    fore = makeCanvas(W, H);
    const g = fore.getContext("2d");
    const p = S.pal;
    const noise = makeNoise1D(rng, 3);
    const base = geo.foreBase;
    geo.foreYs = new Int16Array(W);

    for (let x = 0; x < W; x++) {
      const y = Math.round(base - (noise(x * 0.02) * 0.5 + 0.5) * 6);
      geo.foreYs[x] = y;
      g.fillStyle = css(p.foreLand);
      g.fillRect(x, y, 1, H - y);
      g.fillStyle = css(p.foreLandLit);
      g.fillRect(x, y, 1, 1);
    }

    // grass tufts
    const tufts = Math.round(W * 0.2);
    for (let i = 0; i < tufts; i++) {
      const x = rng.int(0, W - 1);
      const y = geo.foreYs[x] + rng.int(1, H - geo.foreYs[x] - 1);
      g.fillStyle = css(p.foreLandLit, rng.range(0.4, 0.9));
      g.fillRect(x, y - 1, 1, rng.int(1, 2));
    }
    // rocks
    for (let i = 0, n = rng.int(1, 4); i < n; i++) {
      const x = rng.int(10, W - 10);
      const y = geo.foreYs[x] + rng.int(3, 10);
      const rw = rng.int(3, 6);
      g.fillStyle = css(shade(p.foreLand, -0.25));
      g.fillRect(x, y, rw, rng.int(2, 3));
      g.fillStyle = css(shade(p.foreLand, 0.1));
      g.fillRect(x, y, rw - 1, 1);
    }
    // flowers
    const fair = S.weather !== "rain" && S.weather !== "storm" && S.weather !== "overcast";
    if ((S.season === "spring" || S.season === "summer") && S.pal.dim < 0.4 && fair && rng.chance(0.6)) {
      for (let i = 0, n = rng.int(6, 16); i < n; i++) {
        const x = rng.int(0, W - 1);
        const y = geo.foreYs[x] + rng.int(2, 12);
        g.fillStyle = css(shade(S.pal.accent, 0.25), 0.8);
        g.fillRect(x, y, 1, 1);
      }
    }
    // fence
    if (!S.hasWater && !["moonwood", "highlands", "ruinpeak"].includes(S.terrain) && rng.chance(0.35)) {
      const fy = rng.int(4, 9);
      const fCol = shade(p.foreLand, -0.4);
      g.fillStyle = css(fCol);
      const x0 = rng.int(0, W / 3), x1 = rng.int(x0 + 60, W);
      for (let x = x0; x < x1; x += 7) {
        const py = geo.foreYs[x] + fy;
        g.fillRect(x, py - 4, 1, 4);
      }
      for (let x = x0; x < x1 - 7; x++) {
        const py = geo.foreYs[x] + fy;
        g.fillRect(x, py - 3, 1, 1);
      }
    }
    // bushes and boulders in the near field
    for (let i = 0, n = rng.int(2, 5); i < n; i++) {
      const x = rng.int(6, W - 6);
      drawShrub(g, x, geo.foreYs[x] + rng.int(2, 10), rng, p.foreLand);
    }
    for (let i = 0, n = rng.int(1, 3); i < n; i++) {
      const x = rng.int(8, W - 8);
      drawBoulder(g, x, geo.foreYs[x] + rng.int(3, 10), rng, p.foreLand);
    }

    // swamp: drowned trees standing in the water (fore plane, in front of reflections)
    if (S.terrain === "swamp" && geo.waterY !== null) {
      const dead = shade(p.foreLand, -0.3);
      for (let i = 0, n = rng.int(4, 8); i < n; i++) {
        const x = rng.int(8, W - 8);
        const yBase = rng.int(geo.waterY + 6, Math.max(geo.waterY + 8, geo.foreBase - 3));
        drawDeadTree(g, x, yBase, rng.int(9, 17), dead, rng);
      }
    }

    // rare omen: remnants of a battle strewn across the meadow
    Omens.bakeFore(S, geo, g, rng);

    // big framing pines at edges — nearest plane, so they get their own
    // canvas drawn in front of every creature and character
    front = makeCanvas(W, H);
    const fg = front.getContext("2d");
    if (S.terrain !== "moonwood" && rng.chance(0.62)) {
      const sides = rng.chance(0.25) ? [true, true] : [rng.chance(0.5), false];
      const dark = shade(p.foreLand, -0.52);
      if (sides[0]) drawPine(fg, rng.int(6, Math.round(W * 0.09)), H + 6, rng.int(46, 85), dark, rng);
      if (sides[1] || (!sides[0] && rng.chance(0.5)))
        drawPine(fg, W - rng.int(6, Math.round(W * 0.09)), H + 6, rng.int(46, 85), dark, rng);
    }

    // Near silhouettes make the world feel observed from within, rather than
    // presented as a flat backdrop. Keep their density low to preserve calm.
    const nearDark = shade(p.foreLand, -0.64);
    if (S.terrain === "moonwood") drawMoonwoodFrame(fg, rng, nearDark);
    drawNearGrass(fg, rng, nearDark);
    if (["lake", "coast", "swamp", "mirrorwater"].includes(S.terrain)) {
      drawReedFrame(fg, rng, nearDark, rng.chance(0.5));
      if (rng.chance(S.terrain === "swamp" ? 0.55 : 0.22))
        drawReedFrame(fg, rng, nearDark, false);
    }
    if (S.terrain === "darkforest" || S.terrain === "moonwood" || S.terrain === "swamp" || S.season === "winter") {
      if (rng.chance(S.terrain === "darkforest" || S.terrain === "moonwood" ? 0.7 : 0.36))
        drawFramingBough(fg, rng, nearDark, rng.chance(0.5));
    }
  }

  function drawMoonwoodFrame(g, rng, col) {
    const lit = shade(col, 0.13);
    const sides = rng.chance(0.45) ? [-1, 1] : [rng.chance(0.5) ? -1 : 1];
    for (const side of sides) {
      const count = rng.int(2, 4);
      for (let i = 0; i < count; i++) {
        const x = side < 0 ? rng.int(-4, Math.round(W * 0.13)) : rng.int(Math.round(W * 0.87), W + 4);
        const w = rng.int(5, 11);
        const lean = rng.pick([-1, 0, 0, 1]);
        g.fillStyle = css(col);
        for (let y = -8; y < H + 6; y++)
          g.fillRect(x + Math.round(lean * y / H) - (w >> 1), y, w, 1);
        g.fillStyle = css(lit, 0.55);
        g.fillRect(x - (w >> 1), 0, 1, H);
        const branchY = rng.int(Math.round(H * 0.12), Math.round(H * 0.38));
        const dir = side < 0 ? 1 : -1;
        g.fillStyle = css(col);
        g.fillRect(x, branchY, dir * rng.int(18, 42), 3);
      }
    }
    // Rounded leaves make a dark ceiling while leaving a deliberate window
    // of open sky near the center of the composition.
    for (let x = -10; x <= W + 10; x += rng.int(18, 34)) {
      if (x > W * 0.3 && x < W * 0.7 && rng.chance(0.7)) continue;
      fillCircle(g, x, rng.int(-5, 12), rng.int(18, 34), col);
    }
  }

  function drawNearGrass(g, rng, col) {
    g.fillStyle = css(col);
    const clusters = Math.max(5, Math.round(W / 48));
    for (let i = 0; i < clusters; i++) {
      const x = rng.int(0, W - 1);
      const span = rng.int(4, 10);
      for (let dx = 0; dx < span; dx += rng.int(1, 3)) {
        const h = rng.int(3, 10);
        const lean = rng.pick([-1, 0, 0, 1]);
        g.fillRect(x + dx, H - h, 1, h);
        if (lean) g.fillRect(x + dx + lean, H - h, 1, 1);
      }
    }
  }

  function drawReedFrame(g, rng, col, fromLeft) {
    const edge = fromLeft ? rng.int(0, Math.round(W * 0.12)) : rng.int(Math.round(W * 0.88), W - 1);
    const dir = fromLeft ? 1 : -1;
    const n = rng.int(5, 10);
    g.fillStyle = css(col);
    for (let i = 0; i < n; i++) {
      const x = edge + dir * rng.int(0, 18);
      const h = rng.int(10, 28);
      g.fillRect(x, H - h, 1, h);
      if (rng.chance(0.7)) g.fillRect(x + dir, H - h + rng.int(2, 7), rng.int(2, 4), 1);
      if (rng.chance(0.35)) g.fillRect(x - 1, H - h, 3, 2);
    }
  }

  function drawFramingBough(g, rng, col, fromLeft) {
    const dir = fromLeft ? 1 : -1;
    let x = fromLeft ? -2 : W + 1;
    let y = rng.int(Math.round(H * 0.06), Math.round(H * 0.32));
    const len = rng.int(22, 52);
    g.fillStyle = css(col);
    for (let i = 0; i < len; i++) {
      x += dir;
      if (i % rng.int(4, 8) === 0) y += rng.pick([-1, 0, 1]);
      const thick = i < len * 0.36 ? 2 : 1;
      g.fillRect(Math.round(x), y, 1, thick);
      if (i > 5 && i % rng.int(6, 10) === 0) {
        const twig = rng.int(3, 8);
        const up = rng.chance(0.65) ? -1 : 1;
        for (let j = 1; j <= twig; j++)
          g.fillRect(Math.round(x - dir * j * 0.35), y + up * j, 1, 1);
      }
    }
  }

  /* ---------- composite for reflections ---------- */
  function buildComposite() {
    above = makeCanvas(W, H);
    const g = above.getContext("2d");
    g.drawImage(sky, 0, 0);
    g.drawImage(layers, 0, 0);
  }

  /* ---------- overlays: vignette, grain, water gradient, mist strips ---------- */
  function buildOverlays(rng) {
    vignette = makeCanvas(W, H);
    {
      const g = vignette.getContext("2d");
      const gr = g.createRadialGradient(W / 2, H * 0.52, H * 0.45, W / 2, H * 0.52, Math.max(W, H) * 0.78);
      gr.addColorStop(0, "rgba(4,6,16,0)");
      gr.addColorStop(1, "rgba(4,6,16,0.42)");
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    grainFrames = [];
    for (let f = 0; f < 3; f++) {
      const c = makeCanvas(W, H);
      const g = c.getContext("2d");
      const img = g.createImageData(W, H);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.random() * 16;
      }
      g.putImageData(img, 0, 0);
      grainFrames.push(c);
    }
    // water depth overlay
    if (geo.waterY !== null) {
      const wh = H - geo.waterY;
      geo.waterOverlay = makeCanvas(W, wh);
      const g = geo.waterOverlay.getContext("2d");
      const gr = g.createLinearGradient(0, 0, 0, wh);
      gr.addColorStop(0, css(S.pal.waterDeep, 0));
      gr.addColorStop(1, css(S.pal.waterDeep, 0.55));
      g.fillStyle = gr;
      g.fillRect(0, 0, W, wh);
    }
    // mist strip
    if (S.weather === "mist" || S.terrain === "swamp" || S.terrain === "highlands" ||
        S.terrain === "mirrorwater" ||
        (S.terrain === "darkforest" && rng.chance(0.5)) ||
        (S.terrain === "moonwood" && rng.chance(0.72)) ||
        (S.terrain === "lake" && rng.chance(0.3))) {
      const mh = 22;
      const strip = makeCanvas(W * 2, mh);
      const g = strip.getContext("2d");
      const img = g.createImageData(W * 2, mh);
      const noise = makeNoise1D(rng, 3);
      const mCol = mix(S.pal.horizon, rgb(255, 255, 255), S.pal.night ? 0.05 : 0.3);
      for (let y = 0; y < mh; y++) {
        const vf = Math.sin((y / mh) * Math.PI); // fade at band edges
        for (let x = 0; x < W * 2; x++) {
          const nv = noise(x * 0.02 + y * 0.15) * 0.5 + 0.5;
          const idx = (y * W * 2 + x) * 4;
          img.data[idx] = mCol.r; img.data[idx + 1] = mCol.g; img.data[idx + 2] = mCol.b;
          img.data[idx + 3] = vf * nv * 255;
        }
      }
      g.putImageData(img, 0, 0);
      geo.mistStrip = strip;
      const nBands = S.weather === "mist" || S.terrain === "highlands" ? 3
        : S.terrain === "swamp" || S.terrain === "mirrorwater" ? 2 : 1;
      geo.mistBands = [];
      for (let i = 0; i < nBands; i++) {
        geo.mistBands.push({
          y: rng.range(geo.horizonY - 6, geo.foreBase - 14),
          alpha: S.weather === "mist" || S.terrain === "highlands"
            ? rng.range(0.2, 0.38) : rng.range(0.14, 0.22),
          speed: rng.range(1.5, 4), off: rng.range(0, W),
        });
      }
    }
  }

  /* ---------- dynamic state ---------- */
  function initDynamics(rng) {
    const p = S.pal;
    dyn.windDir = rng.chance(0.5) ? 1 : -1;

    // Merge nearby glowing windows into a few restrained light sources. This
    // avoids turning large castles into one uniform halo.
    dyn.localLights = [];
    for (const lw of geo.anchors.litWindows) {
      const near = dyn.localLights.find(l => Math.abs(l.x - lw.x) < 5 && Math.abs(l.y - lw.y) < 5);
      if (near) {
        near.x = Math.round((near.x * near.count + lw.x) / (near.count + 1));
        near.y = Math.round((near.y * near.count + lw.y) / (near.count + 1));
        near.count++;
      } else if (dyn.localLights.length < 10) {
        dyn.localLights.push({ x: lw.x, y: lw.y, ph: lw.ph, count: 1 });
      }
    }

    // stars
    dyn.stars = [];
    if (p.night || S.timeOfDay === "dusk") {
      const nS = p.night ? 130 : 40;
      for (let i = 0; i < nS; i++) {
        dyn.stars.push({
          x: rng.int(0, W - 1), y: rng.int(0, geo.horizonY),
          b: rng.range(0.25, 1), tw: rng.range(0.5, 2.5), ph: rng.range(0, 6),
        });
      }
    }

    // clouds
    dyn.clouds = [];
    const nC = Math.round(S.cloudCover * 8);
    for (let i = 0; i < nC; i++) {
      dyn.clouds.push({
        sprite: buildCloudSprite(rng, p),
        x: rng.range(-60, W), y: rng.range(H * 0.04, geo.horizonY * 0.75),
        speed: rng.range(1.5, 4.5) * (0.5 + S.windLevel),
      });
    }
    dyn.overcastDeck = (S.weather === "overcast" || S.weather === "storm") ? buildDeck(rng, p) : null;

    // birds
    dyn.flocks = [];
    dyn.nextFlock = rng.range(1, 6);

    // something blinks in the caves
    dyn.caveEyes = (geo.caves || []).map(c => ({
      x: c.x, y: c.y, t: rng.range(4, 18), on: false,
    }));

    // livestock
    dyn.animals = [];
    if (S.livestock !== "none") {
      for (let i = 0; i < S.livestockCount; i++) {
        const x = rng.int(Math.round(W * 0.12), Math.round(W * 0.88));
        dyn.animals.push({
          kind: S.livestock, x, y: geo.foreYs[x] + rng.int(4, Math.max(5, H - geo.foreBase - 12)),
          dir: rng.chance(0.5) ? 1 : -1, grazing: rng.chance(0.6),
          timer: rng.range(2, 7),
        });
      }
      dyn.animals.sort((a, b) => a.y - b.y);
    }

    // One small wildlife vignette at most. Land animals share a loose cluster;
    // water animals and the eagle use their own depth-appropriate layers.
    dyn.wildlife = [];
    dyn.eagle = null;
    dyn.fish = null;
    dyn.ducks = [];
    if (["deer", "rabbits", "wolves"].includes(S.wildlife)) {
      const center = rng.int(Math.round(W * 0.2), Math.round(W * 0.8));
      const count = S.wildlifeCount + (S.wildlife === "deer" && S.wildlifeYoung ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const x = clamp(center + (i - (count - 1) / 2) * rng.int(6, 10), 12, W - 12);
        dyn.wildlife.push({
          kind: S.wildlife === "deer" ? (i === 1 && S.wildlifeYoung ? "fawn" : "deer")
            : S.wildlife === "rabbits" ? "rabbit" : "wolf",
          x, yOff: rng.int(4, 10), dir: rng.chance(0.5) ? 1 : -1,
          timer: rng.range(1.5, 6), grazing: rng.chance(0.45), moving: false,
          hop: 0, antlers: rng.chance(0.38), ph: rng.range(0, 6),
        });
      }
    } else if (S.wildlife === "eagle") {
      const dir = rng.chance(0.5) ? 1 : -1;
      dyn.eagle = { x: rng.range(W * 0.12, W * 0.88), y: rng.range(H * 0.12, H * 0.3),
        dir, speed: rng.range(8, 12), ph: rng.range(0, 6), wait: 0 };
    } else if (S.wildlife === "fish" && geo.waterY !== null) {
      dyn.fish = { timer: rng.range(1, 7), active: null, ripple: 0, rippleX: W / 2 };
    } else if (S.wildlife === "ducks" && geo.waterY !== null) {
      const baseY = geo.waterY + rng.int(4, Math.max(5, Math.min(14, H - geo.waterY - 8)));
      const center = rng.range(W * 0.25, W * 0.75);
      const dir = rng.chance(0.5) ? 1 : -1;
      for (let i = 0; i < S.wildlifeCount; i++) dyn.ducks.push({
        x: center - dir * i * rng.range(5, 8), y: baseY + rng.int(-1, 1),
        dir, speed: rng.range(0.45, 0.85), ph: rng.range(0, 6),
      });
    }

    // fireflies
    dyn.fireflies = [];
    if (S.fireflies) for (let i = 0, n = rng.int(8, 16); i < n; i++) {
      const x = rng.int(0, W - 1);
      dyn.fireflies.push({ x, y: geo.foreYs[Math.min(x, W - 1)] - rng.range(0, 14), ph: rng.range(0, 6), sp: rng.range(0.5, 1.4), wx: rng.range(0, 6), wy: rng.range(0, 6) });
    }

    // precipitation
    dyn.drops = [];
    if (S.weather === "rain" || S.weather === "storm") {
      const n = S.weather === "storm" ? 190 : 120;
      for (let i = 0; i < n; i++) dyn.drops.push({ x: rng.range(0, W), y: rng.range(0, H), sp: rng.range(150, 230) });
    }
    dyn.flakes = [];
    if (S.weather === "snow") {
      for (let i = 0; i < 110; i++) dyn.flakes.push({ x: rng.range(0, W), y: rng.range(0, H), sp: rng.range(9, 22), ph: rng.range(0, 6), amp: rng.range(4, 14) });
    }

    // water glints
    dyn.glints = [];
    if (geo.waterY !== null) {
      const lx = geo.lightX;
      const nGlints = S.terrain === "swamp" ? 14 : 34;
      for (let i = 0; i < nGlints; i++) {
        const nearLight = rng.chance(0.6);
        const x = nearLight ? clamp(lx + rng.range(-30, 30), 0, W - 6) : rng.range(0, W - 6);
        dyn.glints.push({
          x, y: rng.int(geo.waterY + 1, H - 4),
          len: rng.int(2, 5), ph: rng.range(0, 6), sp: rng.range(0.4, 1.4),
        });
      }
    }

    dyn.smoke = [];
    dyn.smokeTimer = 0;
    dyn.shooting = null;
    dyn.nextShoot = rng.range(6, 20);
    dyn.lightning = { flash: 0, next: rng.range(4, 14), bolt: null };
    dyn.rng = rng;

    // characters + omens
    geo.windDir = dyn.windDir;
    Characters.init(S, geo, makeRng(S.seed ^ 0x5bd1e995));
    Omens.init(S, geo, makeRng(S.seed ^ 0x2545f491));
  }

  function buildCloudSprite(rng, p) {
    const cw = rng.int(26, 70), ch = rng.int(9, 16);
    const c = makeCanvas(cw, ch);
    const g = c.getContext("2d");
    const nP = rng.int(3, 6);
    for (let i = 0; i < nP; i++) {
      const px = rng.range(cw * 0.15, cw * 0.85);
      const rx = rng.range(cw * 0.12, cw * 0.3);
      const ry = rng.range(ch * 0.25, ch * 0.48);
      const cy = ch - ry - 1;
      for (let yy = -Math.round(ry); yy <= Math.round(ry * 0.55); yy++) {
        const w = rx * Math.sqrt(Math.max(0, 1 - (yy / ry) * (yy / ry)));
        g.fillStyle = css(yy > ry * 0.15 ? p.cloudDark : p.cloudLight);
        g.fillRect(Math.round(px - w), Math.round(cy + yy), Math.round(w * 2), 1);
      }
    }
    return c;
  }

  function buildDeck(rng, p) {
    const dh = Math.round(H * 0.16);
    const c = makeCanvas(W, dh);
    const g = c.getContext("2d");
    const noise = makeNoise1D(rng, 3);
    // stay tonally tied to the upper sky so the deck never floats brighter than it
    const col = shade(mix(p.cloudDark, p.zenith, 0.6), -0.1);
    for (let x = 0; x < W; x++) {
      const y = dh - 4 - (noise(x * 0.02) * 0.5 + 0.5) * (dh * 0.5);
      g.fillStyle = css(col);
      g.fillRect(x, 0, 1, Math.round(y));
      g.fillStyle = css(shade(col, -0.1));
      g.fillRect(x, Math.round(y) - 1, 1, 1);
    }
    return c;
  }

  /* ================= FRAME ================= */

  function frame(ctx, t, dt) {
    const p = S.pal;

    // sky
    ctx.drawImage(sky, 0, 0);

    // stars
    if (S.omen !== "eruption" && dyn.stars.length) {
      const dim = 1 - S.cloudCover * 0.7;
      for (const st of dyn.stars) {
        const a = st.b * (0.65 + 0.35 * Math.sin(t * st.tw + st.ph)) * dim * (p.night ? 1 : 0.45);
        if (a <= 0.05) continue;
        ctx.fillStyle = css(rgb(235, 238, 245), a);
        ctx.fillRect(st.x, st.y, 1, 1);
        if (st.b > 0.9) {
          ctx.fillStyle = css(rgb(235, 238, 245), a * 0.4);
          ctx.fillRect(st.x - 1, st.y, 1, 1); ctx.fillRect(st.x + 1, st.y, 1, 1);
          ctx.fillRect(st.x, st.y - 1, 1, 1); ctx.fillRect(st.x, st.y + 1, 1, 1);
        }
      }
      // shooting star
      if (p.night) {
        dyn.nextShoot -= dt;
        if (dyn.nextShoot <= 0 && !dyn.shooting) {
          dyn.shooting = { x: dyn.rng.range(W * 0.2, W * 0.8), y: dyn.rng.range(5, geo.horizonY * 0.4), vx: dyn.rng.range(-1, 1) > 0 ? 90 : -90, vy: 32, life: 0.8 };
          dyn.nextShoot = dyn.rng.range(10, 30);
        }
        if (dyn.shooting) {
          const sh = dyn.shooting;
          sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt;
          const a = clamp(sh.life / 0.8, 0, 1);
          for (let i = 0; i < 5; i++) {
            ctx.fillStyle = css(rgb(240, 242, 250), a * (1 - i / 5) * 0.9);
            ctx.fillRect(Math.round(sh.x - sh.vx * i * 0.012), Math.round(sh.y - sh.vy * i * 0.012), 1, 1);
          }
          if (sh.life <= 0) dyn.shooting = null;
        }
      }
    }

    // clouds (behind the ridges)
    for (const c of dyn.clouds) {
      c.x += c.speed * dyn.windDir * dt;
      if (dyn.windDir > 0 && c.x > W + 10) c.x = -c.sprite.width - 10;
      if (dyn.windDir < 0 && c.x < -c.sprite.width - 10) c.x = W + 10;
      ctx.drawImage(c.sprite, Math.round(c.x), Math.round(c.y));
    }
    if (dyn.overcastDeck) ctx.drawImage(dyn.overcastDeck, 0, 0);

    // land layers + structure
    ctx.drawImage(layers, 0, 0);

    if (dyn.eagle) updateEagle(ctx, t, dt);

    // Warm, pixel-clustered light around inhabited windows and a faint pool at
    // the castle threshold. No blur is used, so the low-resolution character
    // of the image remains intact.
    drawLocalLights(ctx, t);

    // something blinks in the caves
    for (const e of dyn.caveEyes) {
      e.t -= dt;
      if (e.t <= 0) {
        e.on = !e.on;
        e.t = e.on ? 2 + Math.random() * 2.5 : 8 + Math.random() * 22;
      }
      if (e.on) {
        ctx.fillStyle = css(hsl(52, 90, 62), 0.7 + 0.2 * Math.sin(t * 3));
        ctx.fillRect(e.x - 1, e.y, 1, 1);
        ctx.fillRect(e.x + 1, e.y, 1, 1);
      }
    }

    // window flicker (dims baked-lit windows subtly)
    for (const lw of geo.anchors.litWindows) {
      const a = 0.12 + 0.14 * Math.sin(t * 2.1 + lw.ph);
      if (a > 0) {
        ctx.fillStyle = css(S.pal.windowDark, a);
        ctx.fillRect(lw.x, lw.y, 1, 2);
      }
    }

    // flags
    for (const f of geo.anchors.flags) {
      const len = 5;
      ctx.fillStyle = css(p.accent);
      for (let i = 0; i < len; i++) {
        const yo = Math.round(Math.sin(t * (3 + S.windLevel * 3) + i * 0.9 + f.ph) * (i / len) * 1.5);
        const hgt = Math.max(1, Math.round(3 * (1 - i / len)));
        ctx.fillRect(f.x + (i + 1) * dyn.windDir, f.y + yo, 1, hgt);
      }
    }

    // windmill blades
    if (geo.anchors.mill) {
      const m = geo.anchors.mill;
      const ang = t * (0.25 + S.windLevel * 0.6) + m.ph;
      ctx.fillStyle = css(p.castleDark);
      for (let b = 0; b < 4; b++) {
        const a = ang + b * Math.PI / 2;
        const dx = Math.cos(a), dyv = Math.sin(a);
        for (let r = 1; r <= m.r; r++) {
          ctx.fillRect(Math.round(m.x + dx * r), Math.round(m.y + dyv * r), 1, 1);
          if (r > m.r * 0.35 && r % 2 === 0)
            ctx.fillRect(Math.round(m.x + dx * r - dyv), Math.round(m.y + dyv * r + dx), 1, 1);
        }
      }
      ctx.fillRect(m.x, m.y, 1, 1);
    }

    // Chimney smoke and sparse wisps from recently damaged masonry.
    if (geo.anchors.smoke.length) {
      dyn.smokeTimer -= dt;
      if (dyn.smokeTimer <= 0) {
        for (const src of geo.anchors.smoke) {
          if (src.damaged && Math.random() > 0.28) continue;
          dyn.smoke.push({
            x: src.x, y: src.y, age: 0, ph: Math.random() * 6,
            damaged: Boolean(src.damaged), life: src.damaged ? 4.2 + Math.random() * 1.4 : 6,
          });
        }
        dyn.smokeTimer = 0.45;
      }
      for (let i = dyn.smoke.length - 1; i >= 0; i--) {
        const sm = dyn.smoke[i];
        sm.age += dt;
        if (sm.age > sm.life) { dyn.smoke.splice(i, 1); continue; }
        const rise = sm.damaged ? 3.3 : 4.5;
        const yy = sm.y - sm.age * rise;
        const xx = sm.x + Math.sin(sm.age * 1.5 + sm.ph) * (1 + sm.age * 0.42) + dyn.windDir * sm.age * S.windLevel * 3;
        const a = (sm.damaged ? 0.22 : 0.3) * (1 - sm.age / sm.life);
        const sz = sm.age > (sm.damaged ? 3.6 : 3) ? 2 : 1;
        const sCol = sm.damaged
          ? mix(p.horizon, rgb(72, 70, 72), 0.36)
          : mix(p.horizon, rgb(255, 255, 255), 0.15);
        ctx.fillStyle = css(sCol, a);
        ctx.fillRect(Math.round(xx), Math.round(yy), sz, sz);
      }
    }

    // characters near the structure (behind the water/foreground planes)
    Characters.drawMid(ctx, t, dt);

    // omens in the sky and on the land: dragon, burning village
    Omens.drawScene(ctx, t, dt);

    // water
    if (geo.waterY !== null) drawWater(ctx, t, dt);

    // waterfall motion: falling streaks + foam at the plunge
    if (geo.waterfalls && geo.waterfalls.length) {
      for (const wf of geo.waterfalls) {
        const h = wf.bottom - wf.top;
        if (h <= 4) continue;
        ctx.fillStyle = css(S.pal.waterGlint, 0.55);
        for (let i = 0; i < 6; i++) {
          const yy = wf.top + ((t * 26 + i * (h / 6) + i * 3) % h);
          ctx.fillRect(wf.x - 1 + (i % 3), Math.round(yy), 1, 2);
        }
        ctx.fillStyle = css(S.pal.waterGlint, 0.45);
        for (let i = 0; i < 3; i++)
          ctx.fillRect(wf.x - 3 + ((Math.random() * 7) | 0), wf.bottom + ((Math.random() * 2) | 0), 1, 1);
      }
    }

    // omens on the water: sea monster, long-ship
    if (geo.waterY !== null) Omens.drawWater(ctx, t, dt);

    // mist bands
    if (geo.mistBands) {
      for (const b of geo.mistBands) {
        b.off += b.speed * dt * dyn.windDir;
        let ox = -(((b.off % W) + W) % W);
        ctx.globalAlpha = b.alpha;
        ctx.drawImage(geo.mistStrip, Math.round(ox), Math.round(b.y - 11));
        ctx.drawImage(geo.mistStrip, Math.round(ox + W * 2), Math.round(b.y - 11));
        ctx.globalAlpha = 1;
      }
    }

    // foreground
    ctx.drawImage(fore, 0, 0);

    // livestock
    for (const a of dyn.animals) {
      a.timer -= dt;
      if (a.timer <= 0) {
        const r = Math.random();
        if (r < 0.45) a.grazing = !a.grazing;
        else if (r < 0.7) { a.dir *= -1; }
        else { a.x = clamp(a.x + a.dir * 2, W * 0.08, W * 0.92); }
        a.timer = 2 + Math.random() * 6;
      }
      drawAnimal(ctx, a, t);
    }

    updateLandWildlife(ctx, t, dt);

    // characters in the meadow
    Characters.drawFore(ctx, t, dt);

    // omens on the meadow: orc horde, battlefield crows
    Omens.drawFore(ctx, t, dt);

    // fireflies
    for (const f of dyn.fireflies) {
      const a = Math.max(0, Math.sin(t * f.sp + f.ph));
      if (a < 0.25) continue;
      const fx = f.x + Math.sin(t * 0.4 + f.wx) * 5;
      const fy = f.y + Math.sin(t * 0.3 + f.wy) * 3;
      ctx.fillStyle = css(hsl(52, 90, 66), a * 0.85);
      ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
    }

    // birds
    updateBirds(ctx, t, dt);

    // front-most framing pines occlude everything that lives in the scene
    ctx.drawImage(front, 0, 0);

    // precipitation
    if (dyn.drops.length) {
      ctx.fillStyle = css(mix(p.horizon, rgb(255, 255, 255), 0.2), 0.4);
      const slant = dyn.windDir * S.windLevel * 40;
      for (const d of dyn.drops) {
        d.y += d.sp * dt; d.x += slant * dt;
        if (d.y > H) { d.y = -3; d.x = Math.random() * W; }
        if (d.x > W) d.x -= W; if (d.x < 0) d.x += W;
        ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
      }
    }
    if (dyn.flakes.length) {
      ctx.fillStyle = css(rgb(235, 238, 245), 0.75);
      for (const f of dyn.flakes) {
        f.y += f.sp * dt;
        const fx = f.x + Math.sin(t * 0.7 + f.ph) * f.amp * 0.3 + dyn.windDir * S.windLevel * 8 * (f.y / H);
        if (f.y > H) { f.y = -2; f.x = Math.random() * W; }
        ctx.fillRect(Math.round(((fx % W) + W) % W), Math.round(f.y), 1, 1);
      }
    }

    // Ash and embers sit above every landscape plane, like true weather.
    Omens.drawOverlay(ctx, t, dt);

    // lightning
    if (S.weather === "storm") updateLightning(ctx, t, dt);

    // vignette + grain
    ctx.drawImage(vignette, 0, 0);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(grainFrames[Math.floor(t * 8) % 3], 0, 0);
    ctx.globalAlpha = 1;
  }

  function drawLocalLights(ctx, t) {
    if (!dyn.localLights.length) return;
    const col = S.pal.windowLit;
    for (const l of dyn.localLights) {
      const pulse = 0.82 + Math.sin(t * 1.7 + l.ph) * 0.12;
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const d = Math.sqrt((dx * dx) / 36 + (dy * dy) / 16);
          if (d > 1) continue;
          const strength = (1 - d) * pulse;
          const threshold = BAYER4[((l.x + dx) & 3) + (((l.y + dy) & 3) << 2)] / 16;
          if (strength * 0.9 <= threshold) continue;
          ctx.fillStyle = css(col, 0.035 + strength * 0.075);
          ctx.fillRect(l.x + dx, l.y + dy, 1, 1);
        }
      }
    }

    const ground = geo.structGround;
    if (!ground) return;
    const nearGround = dyn.localLights.filter(l => l.x >= ground.l - 4 && l.x <= ground.r + 4);
    if (!nearGround.length) return;
    const cx = Math.round(nearGround.reduce((sum, l) => sum + l.x, 0) / nearGround.length);
    const width = Math.min(18, Math.max(7, Math.round((ground.r - ground.l) * 0.32)));
    for (let dx = -width; dx <= width; dx++) {
      const strength = 1 - Math.abs(dx) / width;
      if (BAYER4[((cx + dx) & 3) + ((ground.y & 3) << 2)] / 16 > strength * 0.72) continue;
      ctx.fillStyle = css(col, 0.04 + strength * 0.08);
      ctx.fillRect(cx + dx, ground.y, 1, Math.abs(dx) < width * 0.45 ? 2 : 1);
    }
  }

  /* ---------- water ---------- */
  function drawWater(ctx, t, dt) {
    const wy = geo.waterY;
    ctx.fillStyle = css(S.pal.water);
    ctx.fillRect(0, wy, W, H - wy);

    const refH = Math.min(wy - 1, H - wy);
    ctx.globalAlpha = S.terrain === "swamp" ? 0.22 : S.terrain === "mirrorwater" ? 0.52 : 0.42; // murk barely mirrors
    for (let y = 0; y < refH; y++) {
      const srcY = wy - 1 - y;
      const off = Math.round(Math.sin(t * 1.2 + y * 0.5) * (0.5 + y * 0.045));
      ctx.drawImage(above, 0, srcY, W, 1, off, wy + y, W, 1);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(geo.waterOverlay, 0, wy);

    // shimmer
    for (const gl of dyn.glints) {
      const a = Math.sin(t * gl.sp + gl.ph);
      if (a < 0.25) continue;
      ctx.fillStyle = css(S.pal.waterGlint, a * 0.5);
      ctx.fillRect(Math.round(gl.x), gl.y, gl.len, 1);
    }

    // Warm vertical glints below inhabited shores interrupt the cool reflected
    // palette and visually connect the castle to the water.
    for (const l of dyn.localLights) {
      if (l.y >= wy || Math.abs(l.x - W / 2) > W) continue;
      const pulse = 0.7 + 0.3 * Math.sin(t * 1.4 + l.ph);
      for (let i = 0; i < 5; i++) {
        if ((i + l.x) % 2) continue;
        const yy = wy + 2 + i * 3;
        if (yy >= H) break;
        const drift = Math.round(Math.sin(t * 1.8 + i + l.ph) * (1 + i * 0.35));
        const len = Math.max(1, 4 - Math.floor(i / 2));
        ctx.fillStyle = css(S.pal.windowLit, pulse * (0.22 - i * 0.03));
        ctx.fillRect(l.x + drift - Math.floor(len / 2), yy, len, 1);
      }
    }
    // horizon waterline
    ctx.fillStyle = css(shade(S.pal.horizon, 0.1), 0.5);
    ctx.fillRect(0, wy, W, 1);

    drawWaterWildlife(ctx, t, dt);

    // rain ripple sparks
    if (dyn.drops.length) {
      ctx.fillStyle = css(S.pal.waterGlint, 0.35);
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(Math.floor(Math.random() * W), wy + Math.floor(Math.random() * (H - wy)), 2, 1);
      }
    }
  }

  /* ---------- creatures ---------- */
  function drawAnimal(ctx, a, t) {
    const p = S.pal;
    const x = Math.round(a.x), y = Math.round(a.y);
    if (a.kind === "sheep") {
      ctx.fillStyle = css(p.sheepBody);
      ctx.fillRect(x - 2, y - 3, 4, 2);
      ctx.fillStyle = css(p.sheepFace);
      const hx = x + (a.dir > 0 ? 2 : -3);
      ctx.fillRect(hx, a.grazing ? y - 2 : y - 4, 1, 2);
      ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1);
    } else {
      ctx.fillStyle = css(p.cowBody);
      ctx.fillRect(x - 3, y - 4, 6, 3);
      const hx = x + (a.dir > 0 ? 3 : -4);
      ctx.fillRect(hx, a.grazing ? y - 3 : y - 5, 2, 2);
      ctx.fillStyle = css(shade(p.cowBody, -0.35));
      ctx.fillRect(x - 2, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1);
      ctx.fillRect(x - 1, y - 4, 2, 2);
    }
  }

  function wildColor(c, strength = 0.55) {
    return S.pal.dim > 0 ? mix(c, hsl(232, 40, 12), S.pal.dim * strength) : c;
  }

  function updateLandWildlife(ctx, t, dt) {
    if (!dyn.wildlife.length) return;
    for (const a of dyn.wildlife) {
      a.timer -= dt;
      if (a.kind === "rabbit") {
        if (a.hop > 0) {
          a.hop -= dt;
          a.x += a.dir * 7 * dt;
        } else if (a.timer <= 0) {
          if (Math.random() < 0.42) a.dir *= -1;
          a.hop = 0.72;
          a.timer = 2.5 + Math.random() * 6;
        }
      } else if (a.kind === "wolf") {
        if (a.timer <= 0) {
          a.moving = !a.moving;
          if (Math.random() < 0.36) a.dir *= -1;
          a.timer = a.moving ? 2 + Math.random() * 4 : 3 + Math.random() * 7;
        }
        if (a.moving) a.x += a.dir * 2.2 * dt;
      } else if (a.timer <= 0) {
        const choice = Math.random();
        if (choice < 0.5) a.grazing = !a.grazing;
        else if (choice < 0.72) a.dir *= -1;
        else a.x += a.dir * 2;
        a.timer = 2.5 + Math.random() * 7;
      }
      if (a.x < W * 0.1 || a.x > W * 0.9) {
        a.x = clamp(a.x, W * 0.1, W * 0.9);
        a.dir *= -1;
      }
      const gx = clamp(Math.round(a.x), 0, W - 1);
      let y = geo.foreYs[gx] + a.yOff;
      if (a.kind === "rabbit" && a.hop > 0) {
        const progress = 1 - clamp(a.hop / 0.72, 0, 1);
        y -= Math.sin(progress * Math.PI) * 4;
      }
      drawWildAnimal(ctx, a, Math.round(a.x), Math.round(y), t);
    }
  }

  function drawWildAnimal(ctx, a, x, y, t) {
    if (a.kind === "deer" || a.kind === "fawn") {
      const young = a.kind === "fawn";
      const body = wildColor(young ? hsl(28, 38, 43) : hsl(27, 34, 34));
      const light = shade(body, 0.2), dark = shade(body, -0.34);
      const dir = a.dir;
      const grazing = a.grazing && !young;
      const bw = young ? 3 : 5;
      ctx.fillStyle = css(body);
      ctx.fillRect(x - Math.floor(bw / 2), y - (young ? 4 : 5), bw, 2);
      const neckX = x + dir * 2;
      if (grazing) {
        ctx.fillRect(neckX, y - 4, 1, 2);
        ctx.fillRect(neckX + dir, y - 2, 2, 1);
      } else {
        ctx.fillRect(neckX, y - (young ? 6 : 8), 1, young ? 3 : 4);
        ctx.fillRect(neckX + dir, y - (young ? 7 : 9), 2, 2);
        ctx.fillStyle = css(light);
        ctx.fillRect(neckX + dir, y - (young ? 7 : 9), 1, 1);
        ctx.fillStyle = css(dark);
        ctx.fillRect(neckX, y - (young ? 8 : 10), 1, 1);
        if (!young && a.antlers) {
          ctx.fillRect(neckX, y - 11, 1, 2);
          ctx.fillRect(neckX - dir, y - 11, 1, 1);
          ctx.fillRect(neckX + dir, y - 12, 1, 2);
        }
      }
      ctx.fillStyle = css(dark);
      const legShift = Math.sin(t * 2 + a.ph) > 0 ? 1 : 0;
      ctx.fillRect(x - (young ? 1 : 2), y - 3, 1, 3);
      ctx.fillRect(x + 1 + legShift, y - 3, 1, 3);
      ctx.fillStyle = css(light);
      ctx.fillRect(x - dir * (Math.floor(bw / 2) + 1), y - (young ? 4 : 5), 1, 1);
      return;
    }

    if (a.kind === "rabbit") {
      const body = wildColor(hsl(28, 16, S.season === "winter" ? 61 : 38));
      const dark = shade(body, -0.35);
      ctx.fillStyle = css(body);
      ctx.fillRect(x - 1, y - 3, 3, 2);
      const hx = x + (a.dir > 0 ? 2 : -2);
      ctx.fillRect(hx, y - 4, 2, 2);
      ctx.fillRect(hx, y - 7, 1, 3);
      ctx.fillRect(hx + (a.dir > 0 ? 1 : -1), y - 6, 1, 2);
      ctx.fillStyle = css(dark);
      ctx.fillRect(hx + (a.dir > 0 ? 1 : 0), y - 4, 1, 1);
      ctx.fillStyle = css(shade(body, 0.35));
      ctx.fillRect(x + (a.dir > 0 ? -2 : 2), y - 3, 1, 1);
      return;
    }

    const body = wildColor(hsl(215, 12, 31));
    const light = shade(body, 0.2), dark = shade(body, -0.42);
    ctx.fillStyle = css(body);
    ctx.fillRect(x - 3, y - 5, 6, 2);
    const hx = x + a.dir * 3;
    ctx.fillRect(hx + (a.dir < 0 ? -1 : 0), y - 7, 2, 3);
    ctx.fillRect(hx + a.dir, y - 6, 2, 1);
    ctx.fillStyle = css(dark);
    ctx.fillRect(hx, y - 8, 1, 1);
    ctx.fillRect(x - 2, y - 3, 1, 3); ctx.fillRect(x + 2, y - 3, 1, 3);
    ctx.fillRect(x - a.dir * 3, y - 5, 1, 1);
    ctx.fillRect(x - a.dir * 4, y - 6, 1, 1);
    ctx.fillStyle = css(light); ctx.fillRect(x - 1, y - 5, 2, 1);
  }

  function updateEagle(ctx, t, dt) {
    const e = dyn.eagle;
    if (e.wait > 0) {
      e.wait -= dt;
      if (e.wait <= 0) {
        e.dir = Math.random() < 0.5 ? 1 : -1;
        e.x = e.dir > 0 ? -16 : W + 16;
        e.y = H * (0.12 + Math.random() * 0.2);
      } else return;
    }
    e.x += e.dir * e.speed * dt;
    if ((e.dir > 0 && e.x > W + 18) || (e.dir < 0 && e.x < -18)) {
      e.wait = 24 + Math.random() * 42;
      return;
    }
    const x = Math.round(e.x), y = Math.round(e.y + Math.sin(t * 0.45 + e.ph) * 3);
    const flap = Math.round(Math.sin(t * 2.6 + e.ph) * 2);
    const body = wildColor(hsl(25, 18, 24), 0.42), light = shade(body, 0.38);
    ctx.fillStyle = css(body);
    ctx.fillRect(x - 2, y - 1, 5, 2);
    for (let i = 2; i <= 7; i++) {
      const wy = y - 1 + Math.round((i - 2) * flap / 6);
      ctx.fillRect(x - i, wy, 1, i > 5 ? 2 : 1);
      ctx.fillRect(x + i, wy, 1, i > 5 ? 2 : 1);
    }
    ctx.fillRect(x - e.dir * 4, y, 2, 1);
    ctx.fillStyle = css(light);
    ctx.fillRect(x + e.dir * 2, y - 2, 2, 2);
    ctx.fillStyle = css(hsl(42, 72, 57));
    ctx.fillRect(x + e.dir * 4, y - 1, 1, 1);
  }

  function drawWaterWildlife(ctx, t, dt) {
    if (dyn.fish) {
      const f = dyn.fish;
      f.timer -= dt;
      if (!f.active && f.timer <= 0) {
        f.active = { x: W * (0.2 + Math.random() * 0.6), age: 0,
          duration: 0.85 + Math.random() * 0.25, dir: Math.random() < 0.5 ? 1 : -1 };
      }
      if (f.active) {
        const j = f.active;
        j.age += dt;
        const q = clamp(j.age / j.duration, 0, 1);
        const x = Math.round(j.x + j.dir * q * 7);
        const y = Math.round(geo.waterY + 2 - Math.sin(q * Math.PI) * 10);
        ctx.fillStyle = css(wildColor(mix(S.pal.waterGlint, hsl(205, 26, 38), 0.55)));
        ctx.fillRect(x - 1, y, 3, 2);
        ctx.fillRect(x - j.dir * 2, y - 1, 1, 1);
        ctx.fillRect(x - j.dir * 2, y + 2, 1, 1);
        if (q >= 1) {
          f.ripple = 1; f.rippleX = x; f.active = null;
          f.timer = 7 + Math.random() * 15;
        }
      }
      if (f.ripple > 0) {
        f.ripple = Math.max(0, f.ripple - dt * 1.5);
        const rw = 2 + Math.round((1 - f.ripple) * 6);
        ctx.fillStyle = css(S.pal.waterGlint, f.ripple * 0.45);
        ctx.fillRect(f.rippleX - rw, geo.waterY + 2, rw * 2, 1);
      }
    }

    for (const d of dyn.ducks) {
      d.x += d.dir * d.speed * dt;
      if (d.x < 4 || d.x > W - 4) { d.x = clamp(d.x, 4, W - 4); d.dir *= -1; }
      const x = Math.round(d.x), y = Math.round(d.y + Math.sin(t * 1.2 + d.ph) * 0.6);
      const body = wildColor(hsl(35, 22, 38)), head = wildColor(hsl(142, 18, 29));
      ctx.fillStyle = css(S.pal.waterGlint, 0.2);
      ctx.fillRect(d.dir > 0 ? x - 3 : x + 2, y + 1, 2, 1);
      ctx.fillStyle = css(body);
      ctx.fillRect(x - (d.dir > 0 ? 1 : 0), y, 2, 1);
      const hx = x + d.dir;
      ctx.fillStyle = css(head);
      ctx.fillRect(hx, y - 1, 1, 1);
      ctx.fillStyle = css(hsl(32, 82, 56));
      ctx.fillRect(hx + d.dir, y - 1, 1, 1);
    }
  }

  function updateBirds(ctx, t, dt) {
    // spawn
    if (S.birdFlocks > 0 && dyn.flocks.length < S.birdFlocks) {
      dyn.nextFlock -= dt;
      if (dyn.nextFlock <= 0) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const n = 3 + Math.floor(Math.random() * 6);
        const members = [];
        for (let i = 0; i < n; i++)
          members.push({ ox: -i * 4 * dir + (Math.random() * 4 - 2), oy: Math.abs(i - n / 2) * 2.2 + Math.random() * 2, ph: Math.random() * 6 });
        dyn.flocks.push({
          x: dir > 0 ? -30 : W + 30, y: H * (0.1 + Math.random() * 0.3),
          vx: dir * (7 + Math.random() * 8), members,
        });
        dyn.nextFlock = 6 + Math.random() * 18;
      }
    }
    ctx.fillStyle = css(S.pal.bird);
    for (let i = dyn.flocks.length - 1; i >= 0; i--) {
      const fl = dyn.flocks[i];
      fl.x += fl.vx * dt;
      if ((fl.vx > 0 && fl.x > W + 60) || (fl.vx < 0 && fl.x < -60)) { dyn.flocks.splice(i, 1); continue; }
      for (const m of fl.members) {
        const bx = Math.round(fl.x + m.ox);
        const by = Math.round(fl.y + m.oy + Math.sin(t * 1.2 + m.ph) * 2);
        const up = Math.sin(t * 7 + m.ph) > 0;
        ctx.fillRect(bx, by, 1, 1);
        ctx.fillRect(bx - 1, by + (up ? -1 : 0), 1, 1);
        ctx.fillRect(bx + 1, by + (up ? -1 : 0), 1, 1);
      }
    }
  }

  /* ---------- lightning ---------- */
  function updateLightning(ctx, t, dt) {
    const L = dyn.lightning;
    L.next -= dt;
    if (L.next <= 0) {
      L.flash = 1;
      L.next = 6 + Math.random() * 16;
      // build a bolt
      const pts = [];
      let bx = W * (0.15 + Math.random() * 0.7), by = H * 0.1;
      pts.push([bx, by]);
      while (by < geo.horizonY + 10) {
        by += 6 + Math.random() * 10;
        bx += (Math.random() - 0.5) * 14;
        pts.push([bx, by]);
      }
      L.bolt = pts;
      L.boltAge = 0;
      if (onLightning) onLightning(1 + Math.random() * 2.5);
    }
    if (L.flash > 0) {
      L.boltAge += dt;
      if (L.bolt && L.boltAge < 0.14) {
        ctx.fillStyle = "rgba(235,240,255,0.95)";
        for (let i = 0; i < L.bolt.length - 1; i++) {
          const [x0, y0] = L.bolt[i], [x1, y1] = L.bolt[i + 1];
          const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
          for (let sI = 0; sI <= steps; sI++) {
            ctx.fillRect(Math.round(lerp(x0, x1, sI / steps)), Math.round(lerp(y0, y1, sI / steps)), 1, 1);
          }
        }
      }
      ctx.fillStyle = `rgba(220,228,255,${0.28 * L.flash})`;
      ctx.fillRect(0, 0, W, H);
      L.flash = Math.max(0, L.flash - dt * 5);
    }
  }

  return {
    build, frame,
    set onLightning(fn) { onLightning = fn; },
  };
})();
