/* omens.js — rare happenings. At most one per vista, in ~20% of seeds:
   dragon, orc horde, sea monster, burning village, long-ship fleet, battlefield,
   dueling wizards, elven wood, foxes, centaur, ghosts, ravens, silent kings,
   distant volcano, full eruption, graveyard, watchtowers (whole or broken), dwarven column. */
"use strict";

const Omens = (() => {
  let S = null, geo = null;
  let dragon = null, orcs = [], monster = null, ship = null, villageFx = null, crows = [];
  let duel = null, elves = [], foxes = [], centaur = null, ghosts = [], ravens = null;
  let volcanoFx = null, dwarves = null;

  function nightDim(c, f = 0.55) {
    return S.pal.dim > 0 ? mix(c, hsl(232, 40, 12), S.pal.dim * f) : c;
  }
  function fy(x) { return geo.foreYs[clamp(Math.round(x), 0, S.W - 1)]; }

  /* ---------- pixel geometry shared by the articulated dragon ---------- */
  function pixelLine(ctx, x0, y0, x1, y1, col, thick = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    ctx.fillStyle = css(col);
    while (true) {
      ctx.fillRect(x0 - Math.floor((thick - 1) / 2), y0, thick, thick);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function fillPixelPoly(ctx, points, col, alpha = 1) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    ctx.fillStyle = css(col, alpha);
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const hits = [];
      const scan = y + 0.5;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a.y <= scan && b.y > scan) || (b.y <= scan && a.y > scan))
          hits.push(a.x + (scan - a.y) * (b.x - a.x) / (b.y - a.y));
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const left = Math.ceil(hits[i]), right = Math.floor(hits[i + 1]);
        if (right >= left) ctx.fillRect(left, y, right - left + 1, 1);
      }
    }
  }

  const DRAGON_SCALE = 0.7;

  // Original profile-flight silhouettes informed by the timing principles of
  // traditional sprite animation: raised, opening, power stroke, recovery.
  // Every pose shares the same vertices so the membranes can interpolate
  // smoothly while retaining deliberate, stepped pixel geometry.
  const DRAGON_WING_POSES = [
    [[3, 0], [6, -7], [10, -17], [16, -19], [14, -8], [8, 4]],
    [[3, 0], [7, -8], [14, -11], [18, -4], [10, 2], [8, 4]],
    [[3, 0], [8, -3], [19, 0], [15, 7], [8, 8], [8, 4]],
    [[3, 0], [6, 7], [10, 19], [17, 21], [14, 11], [8, 4]],
    [[3, 0], [8, 3], [16, 8], [12, 15], [7, 12], [8, 4]],
  ];
  // The far wing is not a scaled duplicate. It opens toward the tail while the
  // near wing opens toward the head, putting one complete wing mass on either
  // side of the torso without turning the dragon into a head-on view.
  const DRAGON_FAR_WING_POSES = [
    [[-5, 1], [-8, -5], [-15, -14], [-21, -14], [-17, -4], [-1, 5]],
    [[-5, 1], [-10, -6], [-21, -7], [-23, 0], [-14, 5], [-1, 5]],
    [[-5, 1], [-12, -1], [-25, 3], [-20, 10], [-12, 10], [-1, 5]],
    [[-5, 1], [-9, 8], [-12, 20], [-5, 23], [1, 13], [-1, 5]],
    [[-5, 1], [-11, 5], [-20, 12], [-15, 18], [-6, 14], [-1, 5]],
  ];
  const DRAGON_WING_TIMES = [0, 0.24, 0.44, 0.65, 0.82, 1];

  function dragonWingPhase(t, d) {
    const phase = t * 0.34 + d.ph / (Math.PI * 2);
    return phase - Math.floor(phase);
  }

  function sampleDragonWing(phase, poses = DRAGON_WING_POSES) {
    let segment = DRAGON_WING_TIMES.length - 2;
    for (let i = 0; i < DRAGON_WING_TIMES.length - 1; i++) {
      if (phase < DRAGON_WING_TIMES[i + 1]) { segment = i; break; }
    }
    const a = poses[segment % poses.length];
    const b = poses[(segment + 1) % poses.length];
    const lo = DRAGON_WING_TIMES[segment], hi = DRAGON_WING_TIMES[segment + 1];
    let f = clamp((phase - lo) / (hi - lo), 0, 1);
    f = f * f * (3 - 2 * f);
    return a.map((p, i) => [p[0] + (b[i][0] - p[0]) * f, p[1] + (b[i][1] - p[1]) * f]);
  }

  function dragonPoint(x, y, dir, lx, ly) {
    return {
      x: Math.round(x + lx * DRAGON_SCALE * dir),
      y: Math.round(y + ly * DRAGON_SCALE),
    };
  }

  function dragonLine(ctx, x, y, dir, ax, ay, bx, by, col, thick = 1) {
    const a = dragonPoint(x, y, dir, ax, ay);
    const b = dragonPoint(x, y, dir, bx, by);
    pixelLine(ctx, a.x, a.y, b.x, b.y, col, thick);
  }

  /* ============ static bakes ============ */

  function bakeMid(scene, geoRef, g, groundCols, rng) {
    S = scene; geo = geoRef;
    if (S.omen === "village") return bakeVillage(g, groundCols, rng);
    if (S.omen === "elves") { bakeElfWood(g, groundCols, rng); return null; }
    if (S.omen === "argonath") return bakeArgonath(g, groundCols, rng);
    if (S.omen === "turrets" || S.omen === "ruinturrets") {
      bakeTurrets(g, groundCols, rng, S.omen === "ruinturrets");
      return null;
    }
    return null;
  }

  function bakeArgonath(g, groundCols, rng) {
    if (!groundCols.length) return null;
    const map = new Map(groundCols.map(c => [c.x, c]));
    let minX = Infinity, maxX = -Infinity;
    for (const c of groundCols) { if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x; }
    let count = clamp(S.argonathCount || rng.int(1, 4), 1, 4);
    const spacing = rng.int(24, 31);
    while (count > 1 && maxX - minX < (count - 1) * spacing + 34) count--;
    let totalW = (count - 1) * spacing + 20;
    let half = Math.ceil(totalW / 2) + 4;
    if (maxX - minX < totalW + 10) return null;
    const avoid = geo.structGround;
    const usableSegments = () => {
      const edgeL = minX + 8, edgeR = maxX - 8;
      if (!avoid) return [{ l: edgeL, r: edgeR }];
      return [
        { l: edgeL, r: Math.min(edgeR, avoid.l - 10) },
        { l: Math.max(edgeL, avoid.r + 10), r: edgeR },
      ].filter(seg => seg.r > seg.l);
    };
    let eligible = usableSegments().filter(seg => seg.r - seg.l >= half * 2);
    while (!eligible.length && count > 1) {
      count--;
      totalW = (count - 1) * spacing + 20;
      half = Math.ceil(totalW / 2) + 4;
      eligible = usableSegments().filter(seg => seg.r - seg.l >= half * 2);
    }
    if (!eligible.length) return null;
    const segment = rng.pick(eligible);
    let cx = null;
    for (let tries = 0; tries < 40; tries++) {
      const candidate = Math.round(rng.range(segment.l + half, segment.r - half));
      const start = candidate - ((count - 1) * spacing) / 2;
      let supported = true;
      for (let i = 0; i < count && supported; i++) {
        const sx = Math.round(start + i * spacing);
        let minY = Infinity, maxY = -Infinity;
        for (let xx = sx - 10; xx <= sx + 10; xx++) {
          const cc = map.get(xx);
          if (!cc) { supported = false; break; }
          minY = Math.min(minY, cc.y); maxY = Math.max(maxY, cc.y);
        }
        if (maxY - minY > 10) supported = false;
      }
      if (supported) { cx = candidate; break; }
    }
    if (cx === null) return null;

    const startX = cx - ((count - 1) * spacing) / 2;
    for (let i = 0; i < count; i++) {
      const sx = clamp(Math.round(startX + i * spacing), minX + 10, maxX - 10);
      const col = map.get(sx);
      if (!col) continue;
      let supportY = col.y;
      for (let xx = sx - 10; xx <= sx + 10; xx++) supportY = Math.max(supportY, map.get(xx).y);
      let facing;
      if (count === 1) facing = sx < S.W / 2 ? 1 : -1;
      else if (count === 2) facing = i === 0 ? 1 : -1;
      else facing = i < (count - 1) / 2 ? 1 : -1;
      drawOldKing(g, sx, supportY + 2, rng, facing, i);
    }
    return [cx - half, cx + half];
  }

  function drawOldKing(g, x, baseY, rng, dir, index) {
    const p = S.pal;
    const height = rng.int(40, 47);
    const top = baseY - height;
    const stone = mix(p.castleMid, p.horizon, 0.08);
    const light = shade(stone, 0.2);
    const dark = shade(stone, -0.34);
    const deep = shade(stone, -0.55);
    const litSide = geo.lightFromLeft ? -1 : 1;

    // Raised arm and open hand, placed behind the torso so the silhouette is
    // unmistakably humanoid even when the monument is seen at a distance.
    const shoulderX = x + dir * 5;
    const shoulderY = top + 13;
    g.fillStyle = css(dark);
    for (let i = 0; i < 6; i++) {
      const ax = shoulderX + dir * Math.floor(i * 0.55);
      const ay = shoulderY - i;
      g.fillRect(ax + (dir < 0 ? -1 : 0), ay, 2, 2);
    }
    const foreX = shoulderX + dir * 3;
    for (let i = 0; i < 8; i++)
      g.fillRect(foreX + (dir < 0 ? -1 : 0), shoulderY - 5 - i, 2, 1);
    const palmX = foreX + dir;
    const palmY = shoulderY - 14;
    g.fillStyle = css(stone);
    g.fillRect(palmX + (dir < 0 ? -2 : 0), palmY, 3, 4);
    // Three separate fingers and a thumb keep the gesture readable.
    for (let f = 0; f < 3; f++)
      g.fillRect(palmX + (dir < 0 ? -2 + f : f), palmY - 2 + (f === 1 ? -1 : 0), 1, 3);
    g.fillRect(palmX - dir, palmY + 2, 2, 1);
    g.fillStyle = css(light, 0.75);
    g.fillRect(palmX + (litSide < 0 ? -2 : 2), palmY, 1, 3);

    // Long sword on the opposite side: pommel, crossguard, and blade.
    const swordX = x - dir * 5;
    g.fillStyle = css(deep);
    g.fillRect(swordX, top + 20, 2, baseY - top - 25);
    g.fillRect(swordX - 2, top + 21, 6, 1);
    g.fillRect(swordX, top + 18, 2, 3);
    g.fillStyle = css(light, 0.65);
    g.fillRect(swordX + (litSide > 0 ? 1 : 0), top + 23, 1, baseY - top - 29);

    // Crown, head, neck, and a directional nose make the face legible.
    g.fillStyle = css(stone);
    g.fillRect(x - 3, top + 2, 7, 2);
    g.fillRect(x - 2, top + 4, 5, 6);
    g.fillRect(x - 1, top + 10, 3, 2);
    g.fillStyle = css(light);
    g.fillRect(x - 2, top + 4, 1, 5);
    g.fillRect(x + dir * 3, top + 6, 1, 2);
    g.fillStyle = css(dark);
    g.fillRect(x + 2, top + 5, 1, 5);
    g.fillRect(x + dir, top + 6, 1, 1);
    // Crown points vary slightly from king to king.
    g.fillStyle = css(light);
    g.fillRect(x - 3, top, 1, 3);
    g.fillRect(x, top - 1 - (index % 2), 1, 4 + (index % 2));
    g.fillRect(x + 3, top, 1, 3);

    // Broad shoulders, tapered torso, and a flaring robe establish the body.
    g.fillStyle = css(stone);
    g.fillRect(x - 6, top + 11, 13, 3);
    for (let y = top + 14; y < top + 24; y++) {
      const halfW = y < top + 19 ? 5 : 4;
      g.fillRect(x - halfW, y, halfW * 2 + 1, 1);
    }
    for (let y = top + 24; y < baseY - 5; y++) {
      const f = (y - (top + 24)) / Math.max(1, baseY - 29 - top);
      const halfW = Math.round(4 + f * 3);
      g.fillRect(x - halfW, y, halfW * 2 + 1, 1);
    }

    // Sculpted cape edges and robe folds break up the stone mass.
    g.fillStyle = css(light);
    g.fillRect(x + litSide * 5, top + 12, 1, 11);
    for (let y = top + 25; y < baseY - 6; y += 3)
      g.fillRect(x + litSide * Math.max(2, Math.round((y - top) * 0.12)), y, 1, 2);
    g.fillStyle = css(dark);
    g.fillRect(x - litSide * 5, top + 14, 1, 9);
    for (let y = top + 25; y < baseY - 6; y += 4)
      g.fillRect(x - litSide * rng.int(1, 4), y, 1, 2);

    // Bent resting arm and hand over the sword hilt.
    g.fillStyle = css(dark);
    for (let i = 0; i < 7; i++)
      g.fillRect(x - dir * (4 + Math.floor(i * 0.25)), top + 14 + i, 2, 1);
    g.fillStyle = css(deep);
    g.fillRect(swordX, top + 22, 1, baseY - top - 28);
    g.fillRect(swordX - 2, top + 21, 5, 1);
    g.fillStyle = css(light, 0.7);
    g.fillRect(swordX + litSide, top + 23, 1, Math.max(2, baseY - top - 31));
    g.fillStyle = css(light);
    g.fillRect(swordX - 1, top + 19, 3, 2);

    // Layered plinth, chipped corners, cracks, and occasional moss.
    g.fillStyle = css(deep);
    g.fillRect(x - 9, baseY - 5, 19, 2);
    g.fillRect(x - 10, baseY - 3, 21, 3);
    g.fillStyle = css(stone);
    g.fillRect(x - 8, baseY - 6, 17, 1);
    g.fillStyle = css(light);
    g.fillRect(x - 9, baseY - 3, 15, 1);
    g.fillStyle = css(deep);
    const crackX = x + rng.int(-3, 3);
    for (let i = 0; i < rng.int(4, 7); i++)
      g.fillRect(crackX + Math.round(i * rng.pick([-0.35, 0.25])), top + 18 + i * 3, 1, 2);
    if (S.season !== "winter" && rng.chance(0.55)) {
      g.fillStyle = css(mix(shade(p.land, -0.25), stone, 0.35), 0.8);
      for (let i = 0; i < rng.int(3, 7); i++)
        g.fillRect(x + rng.int(-9, 9), baseY - rng.int(1, 5), rng.int(1, 2), 1);
    }
  }

  /* lone watchtowers, whole or crumbling */
  function bakeTurrets(g, groundCols, rng, ruined) {
    if (!groundCols.length) return;
    const map = new Map(groundCols.map(c => [c.x, c]));
    let minX = Infinity, maxX = -Infinity;
    for (const c of groundCols) { if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x; }
    const avoid = geo.structGround;
    const placed = [];
    let damagedSmoke = 0;
    const p = S.pal;
    const lit = p.dim > 0.3;
    for (let i = 0, n = rng.int(2, 3); i < n; i++) {
      let tx = null;
      for (let tries = 0; tries < 26; tries++) {
        const x = rng.int(minX + 8, maxX - 8);
        if (avoid && x > avoid.l - 12 && x < avoid.r + 12) continue;
        let ok = true;
        for (const px2 of placed) if (Math.abs(px2 - x) < 26) { ok = false; break; }
        if (ok) { tx = x; break; }
      }
      if (tx === null) continue;
      const tw = rng.int(6, 8);
      const col = map.get(tx);
      if (!col) continue;
      let supportY = col.y, minSupportY = col.y, supported = true;
      for (let xx = tx - Math.ceil(tw / 2); xx <= tx + Math.ceil(tw / 2); xx++) {
        const cc = map.get(xx);
        if (!cc) { supported = false; break; }
        minSupportY = Math.min(minSupportY, cc.y);
        supportY = Math.max(supportY, cc.y);
      }
      if (!supported || supportY - minSupportY > 6) continue;
      placed.push(tx);
      const baseY = supportY + 2;
      const th = Math.round(rng.int(20, 30) * (ruined ? rng.range(0.45, 0.7) : 1));
      const x0 = tx - (tw >> 1);
      for (let c2 = 0; c2 < tw; c2++) {
        const bite = ruined ? rng.int(0, 4) : 0;
        g.fillStyle = css(p.castleMid);
        g.fillRect(x0 + c2, baseY - th + bite, 1, th - bite);
      }
      g.fillStyle = css(p.castleLight);
      g.fillRect(geo.lightFromLeft ? x0 : x0 + tw - 2, baseY - th + (ruined ? 3 : 0), 2, th - (ruined ? 3 : 0));
      g.fillStyle = css(p.castleDark);
      g.fillRect(geo.lightFromLeft ? x0 + tw - 1 : x0, baseY - th + (ruined ? 2 : 0), 1, th - (ruined ? 2 : 0));
      if (!ruined) {
        for (let k = 0; k < tw; k += 3) {
          g.fillStyle = css(p.castleMid);
          g.fillRect(x0 + k, baseY - th - 2, 2, 2);
        }
      } else {
        // a crack up the wall and rubble at the foot
        g.fillStyle = css(p.castleDark);
        const cs = tx + rng.int(-2, 2);
        for (let k = 0, ck = rng.int(4, Math.max(5, th - 4)); k < ck; k++)
          g.fillRect(cs + Math.round(k * 0.3), baseY - 2 - k, 1, 1);
        for (let k = 0, nR = rng.int(3, 5); k < nR; k++)
          g.fillRect(tx + rng.int(-tw, tw), baseY - rng.int(0, 2), rng.int(1, 2), 1);
        if (damagedSmoke < 2) {
          geo.anchors.smoke.push({ x: tx, y: baseY - th + 2, damaged: true });
          damagedSmoke++;
        }
      }
      for (let wy = baseY - th + 4; wy < baseY - 5; wy += rng.int(6, 9)) {
        const isLit = lit && !ruined && rng.chance(0.5);
        g.fillStyle = css(isLit ? p.windowLit : p.windowDark);
        g.fillRect(tx, wy, 1, 2);
      }
      g.fillStyle = css(p.windowDark);
      g.fillRect(tx, baseY - 4, 2, 4);
    }
  }

  /* a distant volcano baked behind the ridges */
  function bakeBackdrop(scene, geoRef, g, rng) {
    S = scene; geo = geoRef;
    if (S.omen !== "volcano" && S.omen !== "eruption") return;
    const erupting = S.omen === "eruption";
    const W = S.W;
    const cx = Math.round(W * rng.range(0.2, 0.8));
    const hz = geo.horizonY;
    const h = rng.int(45, 66);
    const baseHalf = Math.round(h * rng.range(0.75, 0.95));
    const topY = hz + 4 - h;
    const craterHalf = rng.int(3, 5);
    const col = mix(shade(S.pal.land, -0.4), S.pal.horizon, 0.48);
    const colLit = mix(shade(col, 0.24), S.pal.horizon, 0.12);
    const colShadow = mix(shade(col, -0.32), S.pal.zenith, 0.1);
    const colDeep = shade(colShadow, -0.24);
    const ash = mix(shade(col, -0.14), rgb(62, 54, 54), 0.35);
    const lightLeft = geo.lightFromLeft;

    // Stepped light and shadow fields turn the cone into several overlapping
    // rock planes instead of one flat triangular fill.
    for (let dy = 0; dy < h + 6; dy++) {
      const f = dy / h;
      const half = Math.round(lerp(craterHalf, baseHalf, Math.pow(f, 1.15))) + rng.int(-1, 1);
      g.fillStyle = css(col);
      g.fillRect(cx - half, topY + dy, half * 2, 1);
      const plane = Math.max(1, Math.round(half * (0.3 + Math.sin(f * Math.PI) * 0.12)));
      g.fillStyle = css(colLit, 0.78);
      g.fillRect(lightLeft ? cx - half : cx + half - plane, topY + dy, plane, 1);
      g.fillStyle = css(colShadow, 0.86);
      g.fillRect(lightLeft ? cx + half - Math.max(1, plane - 1) : cx - half,
        topY + dy, Math.max(1, plane - 1), 1);

      // Broken strata become more frequent toward the broad, older base.
      if (dy > h * 0.28 && dy % 7 === 0) {
        g.fillStyle = css(dy % 14 === 0 ? colDeep : ash, 0.68);
        const inset = Math.max(2, Math.round(half * 0.18));
        for (let xx = cx - half + inset; xx < cx + half - inset; xx += 4)
          if (rng.chance(0.68)) g.fillRect(xx, topY + dy, rng.int(1, 2), 1);
      }
    }

    // Major radial faces and smaller erosion channels converge on the crater.
    const litDir = lightLeft ? -1 : 1;
    pixelLine(g, cx + litDir * craterHalf, topY + 2,
      cx + litDir * Math.round(baseHalf * 0.68), hz + 4, colLit);
    pixelLine(g, cx - litDir * craterHalf, topY + 2,
      cx - litDir * Math.round(baseHalf * 0.72), hz + 4, colDeep);
    for (let channel = 0; channel < 5; channel++) {
      let gx = cx + rng.int(-craterHalf, craterHalf), gy = topY + rng.int(3, 7);
      const drift = rng.chance(0.5) ? -1 : 1;
      for (let segment = 0; segment < 3; segment++) {
        const ny = Math.min(hz + 2, gy + rng.int(7, 13));
        const f = (ny - topY) / h;
        const allowed = Math.max(craterHalf, Math.round(lerp(craterHalf, baseHalf, Math.pow(f, 1.15))) - 2);
        const nx = clamp(gx + drift * rng.int(2, 6) + rng.int(-2, 2), cx - allowed, cx + allowed);
        pixelLine(g, gx, gy, nx, ny, channel < 2 ? colDeep : ash);
        gx = nx; gy = ny;
      }
    }

    // Raised crater lips, a recessed ash bowl, and a hot inner seam.
    g.fillStyle = css(colDeep);
    g.fillRect(cx - craterHalf - 2, topY, craterHalf * 2 + 4, 2);
    g.fillRect(cx - craterHalf - 2, topY - 1, 3, 1);
    g.fillRect(cx + craterHalf, topY - 1, 3, 1);
    g.fillStyle = css(ash);
    g.fillRect(cx - craterHalf + 1, topY + 1, craterHalf * 2 - 2, 1);
    g.fillStyle = css(hsl(16, 92, 48));
    g.fillRect(cx - 2, topY + 1, 5, 1);
    g.fillStyle = css(hsl(42, 100, 68));
    g.fillRect(cx - 1, topY + 1, 2, 1);

    // A branching lava run cools from yellow-orange at the vent to dark
    // crimson pixels lower on the flank.
    const sDir = rng.chance(0.5) ? 1 : -1;
    let lavaX = cx + sDir;
    for (let i = 0; i < Math.round(h * 0.46); i++) {
      if (i % 4 === 0) lavaX += sDir * rng.int(0, 1);
      if (rng.chance(i < h * 0.2 ? 0.92 : 0.68)) {
        const heat = 1 - i / (h * 0.46);
        g.fillStyle = css(heat > 0.68 ? hsl(34, 100, 62) : heat > 0.32 ? hsl(14, 88, 46) : hsl(4, 60, 28), 0.9);
        g.fillRect(lavaX, topY + 2 + i, heat > 0.72 && i % 3 === 0 ? 2 : 1, 1);
        if (i > 9 && i % 8 === 0) {
          g.fillStyle = css(hsl(4, 55, 24), 0.82);
          g.fillRect(lavaX - sDir, topY + 2 + i, 1, 1);
        }
      }
    }

    // The catastrophic version has several incandescent fractures. This is
    // deliberately separate so the original, quietly smoking volcano keeps
    // exactly its established silhouette and detailing.
    if (erupting) {
      for (let run = -1; run <= 1; run++) {
        let lx = cx + run * 2;
        const dir = run === 0 ? (lightLeft ? -1 : 1) : run;
        for (let i = 0; i < Math.round(h * (0.34 + Math.abs(run) * 0.12)); i++) {
          if (i % 5 === 0) lx += dir;
          const heat = 1 - i / (h * 0.5);
          g.fillStyle = css(heat > 0.65 ? hsl(38, 100, 66) : heat > 0.25 ? hsl(14, 94, 48) : hsl(2, 66, 29), 0.92);
          if (i % 3 !== 1 || run === 0) g.fillRect(lx, topY + 2 + i, heat > 0.74 ? 2 : 1, 1);
        }
      }
    }

    // A narrow veil at the foot settles the cone into the distant ridges.
    g.fillStyle = css(S.pal.horizon, 0.13);
    g.fillRect(cx - baseHalf, hz + 1, baseHalf * 2, 3);
    geo.volcano = { x: cx, topY, craterHalf, h, baseHalf, erupting };
  }

  function bakeVillage(g, groundCols, rng) {
    if (!groundCols.length) return null;
    const map = new Map(groundCols.map(c => [c.x, c]));
    let minX = Infinity, maxX = -Infinity;
    for (const c of groundCols) { if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x; }
    const half = 26;
    if (maxX - minX < half * 2 + 10) return null;
    const avoid = geo.structGround;
    let cx = null;
    for (let tries = 0; tries < 30; tries++) {
      const x = Math.round(minX + half + rng.next() * (maxX - minX - half * 2));
      if (avoid && x + half > avoid.l - 10 && x - half < avoid.r + 10) continue;
      cx = x; break;
    }
    if (cx === null) cx = Math.round((minX + maxX) / 2);

    const hearths = [];
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const hx = clamp(cx + Math.round((i - (n - 1) / 2) * rng.range(9, 13)), minX + 6, maxX - 6);
      const col = map.get(hx);
      if (!col) continue;
      drawBurntHouse(g, hx, col.y + 2, rng);
      hearths.push({ x: hx, y: col.y - rng.int(3, 5), ph: rng.range(0, 6), scale: rng.range(0.8, 1.3) });
    }
    geo.omenVillage = { x: cx, hearths };
    return [cx - half, cx + half];
  }

  function drawBurntHouse(g, x, gy, rng) {
    const p = S.pal;
    const bw = rng.int(7, 10), bh = rng.int(4, 6);
    const bx = Math.round(x - bw / 2), by = gy - bh;
    const wall = shade(p.castleMid, -0.35);
    const soot = shade(wall, -0.55);
    g.fillStyle = css(wall);
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = css(soot);
    for (let i = 0; i < bw; i++) {
      if (rng.chance(0.7)) g.fillRect(bx + i, by - rng.int(0, 2), 1, 2);
    }
    g.fillRect(bx + rng.int(1, bw - 2), by - 3, 1, 3);
    g.fillStyle = css(hsl(24, 95, 55));
    g.fillRect(bx + rng.int(1, bw - 3), by + bh - 3, rng.int(1, 2), 2);
  }

  /* deep woods for the elven omen */
  function bakeElfWood(g, groundCols, rng) {
    if (!groundCols.length) return;
    const map = new Map(groundCols.map(c => [c.x, c]));
    let minX = Infinity, maxX = -Infinity;
    for (const c of groundCols) { if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x; }
    const avoid = geo.structGround;
    for (let pass = 0; pass < 2; pass++) {
      const shadeF = pass === 0 ? -0.2 : -0.34;
      let x = minX + rng.int(0, 3);
      while (x <= maxX) {
        if (!(avoid && x > avoid.l - 4 && x < avoid.r + 4) && rng.chance(0.8)) {
          const col = map.get(x);
          if (col) drawPineO(g, x, col.y + 2 + pass, rng.int(8, pass ? 19 : 13), shade(col.col, shadeF));
        }
        x += 3 + rng.int(0, 3);
      }
    }
  }

  function drawPineO(g, x, baseY, h, col) {
    g.fillStyle = css(col);
    g.fillRect(x, baseY - 2, 1, 2);
    for (let i = 0; i < h; i++) {
      let w = Math.max(1, Math.round((i / h) * h * 0.42));
      if (i % 3 === 2) w = Math.max(1, w - 1);
      g.fillRect(x - (w >> 1), baseY - h + i - 2, w, 1);
    }
  }

  function bakeFore(scene, geoRef, g, rng) {
    S = scene; geo = geoRef;
    if (S.omen === "graveyard") { bakeGraveyard(g, rng); return; }
    if (S.omen !== "battlefield") return;
    const W = S.W;
    const half = rng.int(28, 42);
    const cx = rng.int(Math.max(30, half + 10), Math.max(half + 12, W - half - 30));
    const fyv = (x) => geoRef.foreYs[clamp(x, 0, W - 1)];
    const steel = nightDim(hsl(215, 12, 60), 0.4);
    const wood = nightDim(hsl(28, 25, 25));

    g.fillStyle = css(shade(S.pal.foreLand, -0.3), 0.55);
    for (let i = 0; i < half * 1.4; i++) {
      const x = cx + rng.int(-half, half);
      g.fillRect(x, fyv(x) + rng.int(2, 12), rng.int(1, 3), 1);
    }
    for (let i = 0, n = rng.int(4, 8); i < n; i++) {
      const x = cx + rng.int(-half, half);
      const y = fyv(x) + rng.int(3, 11);
      g.fillStyle = css(nightDim(hsl(rng.pick([350, 215, 30]), 25, 35)));
      g.fillRect(x - 2, y - 1, 4, 1);
      g.fillStyle = css(steel);
      g.fillRect(x + rng.pick([-3, 2]), y - 1, 1, 1);
    }
    for (let i = 0, n = rng.int(3, 6); i < n; i++) {
      const x = cx + rng.int(-half, half);
      const y = fyv(x) + rng.int(2, 10);
      const lean = rng.pick([-1, 1]);
      g.fillStyle = css(wood);
      for (let k = 0; k < 4; k++) g.fillRect(x + Math.round(k * 0.45) * lean, y - 1 - k, 1, 1);
      g.fillStyle = css(steel);
      g.fillRect(x + 2 * lean, y - 6, 1, 1);
    }
    for (let i = 0, n = rng.int(2, 5); i < n; i++) {
      const x = cx + rng.int(-half, half);
      const y = fyv(x) + rng.int(2, 10);
      g.fillStyle = css(steel);
      g.fillRect(x, y - 3, 1, 3);
      g.fillRect(x - 1, y - 2, 3, 1);
    }
    for (let i = 0, n = rng.int(2, 4); i < n; i++) {
      const x = cx + rng.int(-half, half);
      const y = fyv(x) + rng.int(3, 11);
      g.fillStyle = css(nightDim(shade(S.pal.accent, -0.2)));
      g.fillRect(x - 1, y - 2, 2, 2);
      g.fillStyle = css(steel);
      g.fillRect(x, y - 2, 1, 1);
    }
    {
      const x = cx + rng.int(-8, 8);
      const y = fyv(x) + rng.int(3, 8);
      g.fillStyle = css(wood);
      for (let k = 0; k < 7; k++) g.fillRect(x + Math.round(k * 0.3), y - k, 1, 1);
      g.fillStyle = css(nightDim(S.pal.accent, 0.4));
      g.fillRect(x + 2, y - 6, 3, 2);
      g.fillRect(x + 5, y - 5, 1, 1);
    }
    geoRef.omenField = { x: cx, half };
  }

  /* a quiet graveyard on the meadow */
  function bakeGraveyard(g, rng) {
    const W = S.W;
    const half = rng.int(18, 30);
    const cx = rng.int(Math.max(26, half + 8), Math.max(half + 10, W - half - 26));
    const fyv = (x) => geo.foreYs[clamp(x, 0, W - 1)];
    const stone = nightDim(hsl(220, 8, 52), 0.45);
    const stoneD = shade(stone, -0.3);
    // older, darker earth
    g.fillStyle = css(shade(S.pal.foreLand, -0.22), 0.5);
    for (let i = 0; i < half; i++) {
      const x = cx + rng.int(-half, half);
      g.fillRect(x, fyv(x) + rng.int(2, 10), rng.int(1, 3), 1);
    }
    // headstones in loose rows — tablets, crosses, fallen slabs
    for (let i = 0, n = rng.int(6, 12); i < n; i++) {
      const x = cx + rng.int(-half, half);
      const y = fyv(x) + rng.int(2, 11);
      const kind = rng.next();
      const tilt = rng.chance(0.3) ? rng.pick([-1, 1]) : 0;
      if (kind < 0.5) {
        g.fillStyle = css(stone);
        g.fillRect(x - 1, y - 3, 2, 3);
        g.fillRect(x - 1 + tilt, y - 4, 2, 1);
        g.fillStyle = css(stoneD);
        g.fillRect(x, y - 2, 1, 1);
      } else if (kind < 0.8) {
        g.fillStyle = css(stone);
        g.fillRect(x + tilt, y - 5, 1, 5);
        g.fillRect(x - 1 + tilt, y - 4, 3, 1);
      } else {
        g.fillStyle = css(stoneD);
        g.fillRect(x - 1, y - 1, 3, 1);
      }
    }
    // a dead tree keeping watch
    const tx = clamp(cx + rng.pick([-1, 1]) * (half + rng.int(2, 6)), 6, W - 7);
    drawDeadTreeO(g, tx, fyv(tx) + rng.int(3, 8), rng.int(9, 14), shade(S.pal.foreLand, -0.35), rng);
  }

  function drawDeadTreeO(g, x, baseY, h, col, rng) {
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

  /* ============ dynamic actors ============ */
  function init(scene, geoRef, rng) {
    S = scene; geo = geoRef;
    dragon = null; orcs = []; monster = null; ship = null; villageFx = null; crows = [];
    duel = null; elves = []; foxes = []; centaur = null; ghosts = []; ravens = null;
    volcanoFx = null; dwarves = null;
    const W = S.W, H = S.H;

    switch (S.omen) {
      case "dragon": {
        const dir = rng.chance(0.5) ? 1 : -1;
        dragon = {
          x: dir > 0 ? -70 : W + 70, y: H * rng.range(0.13, 0.28), dir,
          speed: rng.range(8, 11), ph: rng.range(0, 6),
          flameT: rng.range(5, 11), flame: 0, respawnT: 0,
          fireParticles: [], bank: rng.range(-0.5, 0.5),
        };
        break;
      }
      case "orcs": {
        const dir = rng.chance(0.5) ? 1 : -1;
        const n = rng.int(9, 15);
        const startX = dir > 0 ? -rng.int(20, 50) : W + rng.int(20, 50);
        const speed = rng.range(4, 5.5);
        for (let i = 0; i < n; i++) {
          orcs.push({
            x: startX - dir * rng.int(0, 42), dir,
            speed: speed * rng.range(0.94, 1.06),
            yOff: rng.int(3, 11), ph: rng.range(0, 6),
            banner: i === Math.floor(n / 2), respawnT: 0,
          });
        }
        break;
      }
      case "seamonster":
        if (geo.waterY !== null) {
          monster = {
            state: "hidden", t: rng.range(2, 6), x: W / 2, baseY: geo.waterY + 8,
            neckH: rng.int(10, 15), ph: rng.range(0, 6),
          };
        }
        break;
      case "ship":
        if (geo.waterY !== null) {
          // a raiding fleet in loose formation, each ship under its own sail
          const dir = rng.chance(0.5) ? 1 : -1;
          const lo = geo.waterY + 6;
          const hi = Math.max(lo + 2, Math.min(H - 20, geo.foreBase - 14));
          const SAILS = [
            [hsl(0, 55, 42), hsl(42, 25, 78)],    // red / cream stripes
            [hsl(215, 45, 40), hsl(42, 25, 78)],  // blue / cream
            [hsl(42, 60, 50), hsl(28, 25, 28)],   // gold / dark
            [hsl(150, 35, 35), hsl(42, 25, 78)],  // green / cream
            [hsl(0, 45, 33), hsl(0, 45, 33)],     // solid dark red
            [hsl(270, 30, 40), hsl(42, 25, 78)],  // purple / cream
          ];
          const n = rng.int(2, 4);
          const members = [];
          let off = 0;
          for (let i = 0; i < n; i++) {
            members.push({ off, yOff: rng.int(-3, 3), ph: rng.range(0, 6), sail: rng.pick(SAILS) });
            off += rng.int(22, 34);
          }
          ship = {
            x: dir > 0 ? -40 : W + 40, dir, speed: rng.range(3, 4.5),
            y: clamp(rng.int(lo, hi), lo + 3, Math.max(lo + 3, hi - 3)),
            members, span: off, respawnT: 0,
          };
        }
        break;
      case "volcano":
        if (geo.volcano) volcanoFx = { smoke: [], smokeT: 0, ph: rng.range(0, 6), erupting: false };
        break;
      case "eruption":
        if (geo.volcano) {
          const ash = [], fallingEmbers = [];
          for (let i = 0, n = Math.round(W * 0.24); i < n; i++) {
            ash.push({ x: rng.range(0, W), y: rng.range(0, H), sp: rng.range(5, 15), sway: rng.range(0, 6), size: rng.chance(0.16) ? 2 : 1 });
          }
          for (let i = 0, n = Math.round(W * 0.065); i < n; i++) {
            fallingEmbers.push({ x: rng.range(0, W), y: rng.range(0, H), sp: rng.range(7, 19), ph: rng.range(0, 6), hot: rng.chance(0.25) });
          }
          volcanoFx = {
            smoke: [], smokeT: 0, ph: rng.range(0, 6), erupting: true,
            eruptionSmoke: [], plumeT: 0, bombs: [], bombT: rng.range(0.5, 1.8),
            ash, fallingEmbers, flash: 0,
          };
        }
        break;
      case "dwarves": {
        // a column of delvers on the road, single file
        const dir = rng.chance(0.5) ? 1 : -1;
        const BEARDS = [hsl(20, 60, 55), hsl(0, 0, 80), hsl(28, 45, 40), hsl(0, 0, 55)];
        const TUNICS = [hsl(215, 20, 35), hsl(20, 30, 30), hsl(280, 15, 32), hsl(120, 18, 28)];
        const n = rng.int(4, 7);
        const members = [];
        let off = 0;
        for (let i = 0; i < n; i++) {
          members.push({
            off, ph: rng.range(0, 6), yJit: rng.int(-1, 1),
            beard: nightDim(rng.pick(BEARDS), 0.4),
            tunic: nightDim(rng.pick(TUNICS)),
          });
          off += rng.int(6, 9);
        }
        dwarves = {
          x: dir > 0 ? -20 : W + 20, dir, speed: rng.range(2.6, 3.4),
          yOff: rng.int(4, 9), members, span: off, respawnT: 0,
        };
        break;
      }
      case "village":
        if (geo.omenVillage) villageFx = { embers: [], smoke: [], smokeT: 0 };
        break;
      case "battlefield":
        if (geo.omenField) {
          for (let i = 0, n = rng.int(2, 4); i < n; i++) {
            crows.push({
              x: geo.omenField.x + rng.int(-geo.omenField.half, geo.omenField.half),
              yOff: rng.int(3, 10), ph: rng.range(0, 6), hopT: rng.range(1, 5),
            });
          }
        }
        break;
      case "duel": {
        const cx = W * rng.range(0.3, 0.7);
        const gap = rng.int(11, 16);
        const yOff = rng.int(4, 9);
        duel = {
          a: { x: cx - gap, dir: 1, col: hsl(200, 85, 60), robe: nightDim(hsl(215, 25, 38)) },
          b: { x: cx + gap, dir: -1, col: hsl(354, 85, 58), robe: nightDim(hsl(276, 22, 36)) },
          yOff, bolts: [], sparks: [], nextBolt: rng.range(1, 3), turn: 0,
          flashA: 0, flashB: 0, ph: rng.range(0, 6),
        };
        break;
      }
      case "elves": {
        const n = rng.int(3, 6);
        for (let i = 0; i < n; i++) {
          const cx = W * rng.range(0.12, 0.88);
          elves.push({
            x: cx, x0: cx - rng.int(10, 20), x1: cx + rng.int(10, 20),
            dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(1.6, 2.6),
            yOff: rng.int(3, 10), ph: rng.range(0, 6), pauseT: rng.range(0, 3),
            cloak: nightDim(rng.pick([hsl(140, 30, 32), hsl(150, 22, 44), hsl(210, 10, 62)])),
          });
        }
        break;
      }
      case "foxes": {
        const n = rng.int(2, 3);
        for (let i = 0; i < n; i++) {
          const cx = W * rng.range(0.15, 0.85);
          foxes.push({
            x: cx, x0: Math.max(14, cx - 34), x1: Math.min(W - 14, cx + 34),
            dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(8, 13),
            yOff: rng.int(3, 10), ph: rng.range(0, 6),
            mode: "trot", t: rng.range(1, 4),
          });
        }
        break;
      }
      case "centaur": {
        const cx = W * rng.range(0.25, 0.75);
        centaur = {
          x: cx, x0: Math.max(16, cx - 26), x1: Math.min(W - 16, cx + 26),
          dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(2.6, 3.6),
          yOff: rng.int(4, 9), ph: rng.range(0, 6), pauseT: 0,
          body: nightDim(hsl(24, 40, 34)), skin: nightDim(hsl(27, 40, 58)),
        };
        break;
      }
      case "ghosts": {
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) {
          const cx = W * rng.range(0.12, 0.88);
          ghosts.push({
            x: cx, x0: Math.max(12, cx - 24), x1: Math.min(W - 12, cx + 24),
            dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(0.8, 1.8),
            yOff: rng.int(2, 9), ph: rng.range(0, 6),
            visT: rng.range(4, 12), fading: false,
          });
        }
        break;
      }
      case "ravens": {
        const sg = geo.structGround;
        const center = sg
          ? { x: (sg.l + sg.r) / 2, y: Math.max(22, sg.y - 46) }
          : { x: W * rng.range(0.25, 0.75), y: H * 0.3 };
        ravens = { cx: center.x, cy: center.y, birds: [] };
        for (let i = 0, n = rng.int(8, 13); i < n; i++) {
          ravens.birds.push({
            ang: rng.range(0, 6.28), rx: rng.range(7, 24),
            spd: rng.range(0.25, 0.7) * (rng.chance(0.5) ? 1 : -1),
            ph: rng.range(0, 6),
          });
        }
        break;
      }
    }
  }

  /* ---------- dragon ---------- */
  function updateDragon(ctx, t, dt) {
    const d = dragon, W = S.W;
    if (d.respawnT > 0) {
      d.respawnT -= dt;
      if (d.respawnT <= 0) {
        d.dir = Math.random() < 0.5 ? 1 : -1;
        d.x = d.dir > 0 ? -70 : W + 70;
        d.y = S.H * (0.13 + Math.random() * 0.17);
        d.ph = Math.random() * 6;
        d.flameT = 5 + Math.random() * 10;
        d.flame = 0;
        d.fireParticles.length = 0;
      } else return;
    }
    d.x += d.speed * d.dir * dt;
    if ((d.dir > 0 && d.x > W + 75) || (d.dir < 0 && d.x < -75)) {
      d.respawnT = 38 + Math.random() * 34;
      return;
    }
    const x = Math.round(d.x);
    const wingPhase = dragonWingPhase(t, d);
    const wingLift = Math.cos(wingPhase * Math.PI * 2);
    const wingSpread = 1 - Math.abs(wingLift);
    const bodyLift = Math.sin(wingPhase * Math.PI * 2);
    const y = Math.round(d.y + Math.sin(t * 0.43 + d.ph) * 4 - bodyLift * 1.4);
    const headCounter = bodyLift * 1.8;

    if (geo.waterY === null) drawDragonShadow(ctx, x, d.dir, wingSpread, false);
    drawArticulatedDragon(ctx, x, y, d, t, wingPhase, wingLift, headCounter);

    // A long, staged gout of flame, triggered only while the dragon is well
    // inside the frame so the entire moment can be seen.
    d.flameT -= dt;
    const centered = x > W * 0.16 && x < W * 0.84;
    if (d.flameT <= 0 && centered) {
      d.flame = 2.4;
      d.flameT = 14 + Math.random() * 22;
    }
    if (d.flame > 0) {
      d.flame -= dt;
      drawDragonFire(ctx, x, y, d, t, dt, headCounter);
    }
    updateDragonEmbers(ctx, d, dt);
  }

  function drawArticulatedDragon(ctx, x, y, d, t, wingPhase, lift, headCounter) {
    // Charcoal-violet body and muted wine membranes: related to the vista's
    // palette, but deliberately darker and less saturated than the reference.
    const base = mix(shade(S.pal.bird, -0.14), hsl(272, 24, 17), S.pal.night ? 0.22 : 0.38);
    const deep = shade(base, -0.48);
    const shadow = shade(base, -0.28);
    const light = shade(base, 0.2);
    const scale = mix(light, hsl(338, 28, 38), 0.2);
    const membrane = mix(shade(base, 0.11), hsl(334, 32, 31), 0.34);
    const farMembrane = mix(shade(membrane, -0.2), hsl(286, 24, 25), 0.16);
    const farRim = mix(shadow, membrane, 0.3);
    const nearPose = sampleDragonWing(wingPhase);
    const farPose = sampleDragonWing(wingPhase, DRAGON_FAR_WING_POSES);
    const farWing = farPose.map(p => dragonPoint(x, y, d.dir, p[0], p[1]));
    fillPixelPoly(ctx, farWing, farMembrane, 1);
    dragonLine(ctx, x, y, d.dir, farPose[0][0], farPose[0][1], farPose[1][0], farPose[1][1], deep, 2);
    dragonLine(ctx, x, y, d.dir, farPose[1][0], farPose[1][1], farPose[2][0], farPose[2][1], farRim);
    dragonLine(ctx, x, y, d.dir, farPose[1][0], farPose[1][1], farPose[4][0], farPose[4][1], deep);
    dragonLine(ctx, x, y, d.dir, farPose[2][0], farPose[2][1], farPose[3][0], farPose[3][1], deep);
    dragonLine(ctx, x, y, d.dir, farPose[3][0], farPose[3][1], farPose[4][0], farPose[4][1], farRim);
    dragonLine(ctx, x, y, d.dir, farPose[4][0], farPose[4][1], farPose[5][0], farPose[5][1], deep);

    // Small trailing legs tuck during the upstroke and loosen on the power
    // stroke, adding life without competing with the much larger wing shapes.
    const legReach = 2.5 + (1 - lift) * 1.2;
    dragonLine(ctx, x, y, d.dir, -3, 2, -5, 5 + legReach, shadow, 2);
    dragonLine(ctx, x, y, d.dir, -5, 5 + legReach, -8, 7 + legReach, deep);
    dragonLine(ctx, x, y, d.dir, -8, 7 + legReach, -10, 7 + legReach, deep);
    dragonLine(ctx, x, y, d.dir, 5, 2, 6, 5 + legReach * 0.75, base, 2);
    dragonLine(ctx, x, y, d.dir, 6, 5 + legReach * 0.75, 3, 8 + legReach * 0.75, deep);
    dragonLine(ctx, x, y, d.dir, 3, 8 + legReach * 0.75, 1, 8 + legReach * 0.75, deep);

    // Long articulated tail with a travelling wave and a barbed tip.
    let prev = dragonPoint(x, y, d.dir, -8, 1);
    for (let i = 1; i <= 7; i++) {
      const lx = -8 - i * 4;
      const ly = 1 + Math.sin(wingPhase * Math.PI * 2 + i * 0.67) * (1 + i * 0.42);
      const next = dragonPoint(x, y, d.dir, lx, ly);
      pixelLine(ctx, prev.x, prev.y, next.x, next.y, i < 3 ? shadow : base, i < 3 ? 3 : i < 6 ? 2 : 1);
      prev = next;
    }
    const barb = dragonPoint(x, y, d.dir, -38, 1 + Math.sin(wingPhase * Math.PI * 2 + 4.7) * 4);
    const barbA = dragonPoint(x, y, d.dir, -34, barb.y - y - 3);
    const barbB = dragonPoint(x, y, d.dir, -34, barb.y - y + 3);
    fillPixelPoly(ctx, [barb, barbA, barbB], deep);

    // Slim, long body built from shaded scanlines. It covers the far wing root,
    // establishing that wing on the opposite side of the dragon.
    for (let dy = -3; dy <= 3; dy++) {
      const half = Math.max(1, Math.round(Math.sqrt(Math.max(0, 1 - (dy * dy) / 9)) * 8));
      ctx.fillStyle = css(dy < -2 ? light : dy > 2 ? shadow : base);
      const wx = x + (-half * d.dir);
      ctx.fillRect(Math.min(wx, x + half * d.dir), y + dy, half * 2 + 1, 1);
    }

    // The near wing is deliberately painted over the torso. This z-order—not
    // just a positional offset—is what makes it read as attached to the near
    // flank while the first wing remains visibly behind the body.
    const nearWing = nearPose.map(p => dragonPoint(x, y, d.dir, p[0], p[1]));
    fillPixelPoly(ctx, nearWing, membrane, 0.98);
    dragonLine(ctx, x, y, d.dir, nearPose[0][0], nearPose[0][1], nearPose[1][0], nearPose[1][1], deep, 2);
    dragonLine(ctx, x, y, d.dir, nearPose[1][0], nearPose[1][1], nearPose[2][0], nearPose[2][1], light);
    dragonLine(ctx, x, y, d.dir, nearPose[1][0], nearPose[1][1], nearPose[4][0], nearPose[4][1], shadow);
    dragonLine(ctx, x, y, d.dir, nearPose[2][0], nearPose[2][1], nearPose[3][0], nearPose[3][1], deep);
    dragonLine(ctx, x, y, d.dir, nearPose[3][0], nearPose[3][1], nearPose[4][0], nearPose[4][1], deep);
    dragonLine(ctx, x, y, d.dir, nearPose[4][0], nearPose[4][1], nearPose[5][0], nearPose[5][1], deep);

    // Separate shoulder caps reinforce which socket is behind and which is on
    // the visible flank.
    const farShoulder = dragonPoint(x, y, d.dir, -4, -2);
    const nearShoulder = dragonPoint(x, y, d.dir, 3, 0);
    ctx.fillStyle = css(farRim);
    ctx.fillRect(farShoulder.x - 1, farShoulder.y, 2, 1);
    ctx.fillStyle = css(light);
    ctx.fillRect(nearShoulder.x, nearShoulder.y, 3, 2);
    // Belly plates and individual scale glints.
    ctx.fillStyle = css(deep, 0.72);
    for (let i = -5; i <= 5; i += 3) ctx.fillRect(x + i * d.dir, y + 2 + ((i / 3) & 1), 2, 1);
    ctx.fillStyle = css(scale, 0.78);
    for (let i = -6; i <= 6; i += 4) ctx.fillRect(x + i * d.dir, y - 3 + ((i + 6) % 3), 1, 1);

    // Arched neck, horned head, snout, lower jaw, nostril, and bright eye.
    dragonLine(ctx, x, y, d.dir, 7, -1, 14, -6 + headCounter, base, 3);
    const head = [dragonPoint(x, y, d.dir, 12, -10 + headCounter), dragonPoint(x, y, d.dir, 21, -9 + headCounter),
      dragonPoint(x, y, d.dir, 25, -6 + headCounter), dragonPoint(x, y, d.dir, 22, -3 + headCounter), dragonPoint(x, y, d.dir, 14, -4 + headCounter)];
    fillPixelPoly(ctx, head, base);
    dragonLine(ctx, x, y, d.dir, 14, -9 + headCounter, 20, -9 + headCounter, light);
    dragonLine(ctx, x, y, d.dir, 15, -9 + headCounter, 11, -15 + headCounter, deep, 2);
    dragonLine(ctx, x, y, d.dir, 18, -9 + headCounter, 17, -15 + headCounter, deep, 2);
    dragonLine(ctx, x, y, d.dir, 18, -3 + headCounter, 24, -3 + headCounter, deep);
    const nostril = dragonPoint(x, y, d.dir, 23, -6 + headCounter);
    ctx.fillStyle = css(deep); ctx.fillRect(nostril.x, nostril.y, 1, 1);
    const eye = dragonPoint(x, y, d.dir, 19, -7 + headCounter);
    ctx.fillStyle = css(d.flame > 0 ? hsl(42, 100, 78) : hsl(18, 90, 58));
    ctx.fillRect(eye.x, eye.y, 1, 1);
  }

  function drawDragonFire(ctx, x, y, d, t, dt, headCounter) {
    const age = 2.4 - d.flame;
    const envelope = Math.sin(Math.PI * clamp(age / 2.4, 0, 1));
    const length = Math.max(4, Math.round(5 + envelope * 18));
    const mouth = dragonPoint(x, y, d.dir, 25, -5 + headCounter);
    for (let i = 0; i < length; i++) {
      const f = i / Math.max(1, length - 1);
      const width = Math.max(1, Math.round(Math.sin(f * Math.PI) * (2 + envelope * 3)));
      const center = mouth.y + Math.round(Math.sin(t * 12 + i * 1.7) * (0.5 + f * 1.5));
      for (let yy = -width; yy <= width; yy++) {
        const heat = 1 - Math.abs(yy) / (width + 1);
        const px = mouth.x + i * d.dir;
        if (BAYER4[(px & 3) + ((center + yy & 3) << 2)] / 16 > heat * envelope) continue;
        const col = heat > 0.72 ? hsl(50, 100, 82) : heat > 0.38 ? hsl(32, 100, 58) : hsl(12, 92, 48);
        ctx.fillStyle = css(col, 0.72 + envelope * 0.28);
        ctx.fillRect(px, center + yy, 1, 1);
      }
    }
    if (Math.random() < dt * 15) {
      d.fireParticles.push({
        x: mouth.x + length * d.dir, y: mouth.y + (Math.random() - 0.5) * 4,
        vx: d.dir * (5 + Math.random() * 10), vy: -2 - Math.random() * 6,
        life: 0.7 + Math.random() * 0.8,
      });
    }
  }

  function updateDragonEmbers(ctx, d, dt) {
    for (let i = d.fireParticles.length - 1; i >= 0; i--) {
      const p = d.fireParticles[i];
      p.life -= dt;
      if (p.life <= 0) { d.fireParticles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 5 * dt;
      ctx.fillStyle = css(p.life > 0.45 ? hsl(28, 100, 58) : shade(S.pal.horizon, -0.35), clamp(p.life, 0, 0.75));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  }

  function drawDragonShadow(ctx, x, dir, lift, onWater) {
    if (x < -35 || x > S.W + 35) return;
    const sy = onWater ? geo.waterY + 4 : geo.foreBase - 5;
    if (sy === null || sy === undefined) return;
    const col = onWater ? S.pal.waterDeep : shade(S.pal.foreLand, -0.55);
    const width = 16 + Math.round(Math.abs(lift) * 5);
    ctx.fillStyle = css(col, onWater ? 0.16 : 0.12);
    for (let row = -2; row <= 2; row++) {
      const half = Math.max(4, width - Math.abs(row) * 6);
      for (let dx = -half; dx <= half; dx += 2)
        ctx.fillRect(x - dir * 7 + dx, sy + row, 1, 1);
    }
  }

  /* ---------- burning village fx ---------- */
  function drawVillageFire(ctx, t, dt) {
    const v = geo.omenVillage;
    if (!v || !v.hearths.length) return;
    const fx = villageFx;
    const flick = 0.8 + 0.2 * Math.sin(t * 7 + Math.sin(t * 17));
    const a = (S.pal.night ? 0.16 : S.pal.dim > 0 ? 0.12 : 0.07) * flick;
    const gy = v.hearths[0].y + 4;
    ctx.fillStyle = css(hsl(24, 90, 52), a);
    const R = 15;
    for (let dy = -R; dy <= R; dy++) {
      const w = Math.floor(Math.sqrt(R * R - dy * dy) * 2.2);
      ctx.fillRect(Math.round(v.x - w), Math.round(gy + dy * 0.45) - 4, w * 2, 1);
    }
    for (const h of v.hearths) {
      const fh = Math.max(2, Math.round((2.5 + Math.sin(t * 8 + h.ph) + Math.sin(t * 12.7 + h.ph * 2) * 0.8) * h.scale));
      ctx.fillStyle = css(hsl(22, 90, 52));
      for (let i = 0; i < fh; i++) {
        const w = Math.max(1, Math.round((1 - i / fh) * 3));
        ctx.fillRect(Math.round(h.x - w / 2), h.y - i, w, 1);
      }
      ctx.fillStyle = css(hsl(45, 95, 65));
      for (let i = 0; i < Math.max(1, fh - 2); i++) ctx.fillRect(h.x, h.y - i, 1, 1);
    }
    if (Math.random() < dt * 8) {
      const h = v.hearths[(Math.random() * v.hearths.length) | 0];
      fx.embers.push({
        x: h.x + (Math.random() * 4 - 2), y: h.y - 2,
        vx: (Math.random() - 0.5) * 5 + (geo.windDir || 1) * 2,
        vy: -(8 + Math.random() * 10), life: 0.6 + Math.random(),
      });
    }
    for (let i = fx.embers.length - 1; i >= 0; i--) {
      const e = fx.embers[i];
      e.life -= dt;
      if (e.life <= 0) { fx.embers.splice(i, 1); continue; }
      e.x += e.vx * dt; e.y += e.vy * dt;
      ctx.fillStyle = css(hsl(35, 92, 60), Math.min(1, e.life * 1.5));
      ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1);
    }
    fx.smokeT -= dt;
    if (fx.smokeT <= 0) {
      const h = v.hearths[(Math.random() * v.hearths.length) | 0];
      fx.smoke.push({ x: h.x, y: h.y - 3, age: 0, ph: Math.random() * 6 });
      fx.smokeT = 0.18;
    }
    const sCol = mix(shade(S.pal.zenith, -0.3), rgb(30, 24, 22), 0.6);
    const wd = geo.windDir || 1;
    for (let i = fx.smoke.length - 1; i >= 0; i--) {
      const sm = fx.smoke[i];
      sm.age += dt;
      if (sm.age > 7) { fx.smoke.splice(i, 1); continue; }
      const yy = sm.y - sm.age * 7;
      const xx = sm.x + Math.sin(sm.age * 1.3 + sm.ph) * (1 + sm.age * 0.6) + wd * sm.age * (1.5 + S.windLevel * 4);
      const sz = sm.age > 4 ? 3 : sm.age > 1.5 ? 2 : 1;
      ctx.fillStyle = css(sCol, 0.4 * (1 - sm.age / 7));
      ctx.fillRect(Math.round(xx), Math.round(yy), sz, sz);
    }
  }

  /* ---------- sea monster ---------- */
  function updateMonster(ctx, t, dt) {
    const m = monster, W = S.W, wy = geo.waterY;
    m.t -= dt;
    if (m.state === "hidden") {
      if (m.t <= 0) {
        m.state = "rising"; m.t = 2;
        m.x = 20 + Math.random() * (W - 40);
        const lo = wy + 5, hi = Math.max(lo + 1, geo.foreBase - 8);
        m.baseY = lo + Math.random() * (hi - lo);
      } else return;
    }
    let p = 1;
    if (m.state === "rising") {
      p = 1 - m.t / 2;
      if (m.t <= 0) { m.state = "up"; m.t = 6 + Math.random() * 8; }
    } else if (m.state === "up") {
      if (m.t <= 0) { m.state = "sinking"; m.t = 2; }
    } else if (m.state === "sinking") {
      p = m.t / 2;
      if (m.t <= 0) { m.state = "hidden"; m.t = 8 + Math.random() * 14; return; }
    }
    p = clamp(p, 0, 1);
    const x = Math.round(m.x), by = Math.round(m.baseY);
    const vis = Math.round(m.neckH * p);
    if (vis < 1) return;
    const ink = mix(S.pal.waterDeep, rgb(8, 22, 20), 0.55);
    const rim = shade(ink, 0.2);
    const sway = Math.sin(t * 0.8 + m.ph) * 1.5;
    let hx = x, hy = by;
    for (let i = 0; i < vis; i++) {
      const cx2 = x + Math.round(Math.sin(i * 0.22 + t * 0.5 + m.ph) * 1.4 + sway * (i / m.neckH));
      ctx.fillStyle = css(ink);
      ctx.fillRect(cx2 - 1, by - i, 2, 1);
      ctx.fillStyle = css(rim);
      ctx.fillRect(cx2 - 1, by - i, 1, 1);
      if (i === vis - 1) { hx = cx2; hy = by - i; }
    }
    if (p > 0.6) {
      const dir2 = sway > 0 ? 1 : -1;
      ctx.fillStyle = css(ink);
      ctx.fillRect(hx - 1, hy - 2, 3, 2);
      ctx.fillRect(hx + dir2 * 2, hy - 2, 1, 1);
      ctx.fillRect(hx, hy - 3, 1, 1);
      ctx.fillStyle = css(hsl(48, 85, 60));
      ctx.fillRect(hx + dir2, hy - 2, 1, 1);
    }
    if (p > 0.4) {
      for (const off of [-9, 8]) {
        const hh = Math.round(3 * p);
        for (let i = 0; i < hh; i++) {
          const w = Math.round((hh - i) * 1.6);
          ctx.fillStyle = css(ink);
          ctx.fillRect(x + off - w, by - i, w * 2, 1);
        }
      }
    }
    ctx.fillStyle = css(S.pal.waterGlint, 0.4 * p);
    const rr = 5 + Math.round(Math.sin(t * 2) * 2);
    ctx.fillRect(x - rr, by + 1, 3, 1);
    ctx.fillRect(x + rr - 2, by + 1, 3, 1);
  }

  /* ---------- viking long-ship fleet ---------- */
  function drawShip(ctx, x, y, dir, sail) {
    const hull = nightDim(hsl(22, 35, 22), 0.5);
    ctx.fillStyle = css(hull);
    ctx.fillRect(x - 6, y - 1, 13, 2);
    ctx.fillRect(x + dir * 6, y - 2, 1, 1);
    ctx.fillRect(x + dir * 7, y - 3, 1, 2);
    ctx.fillRect(x + dir * 7, y - 4, 1, 1);        // dragon-head prow
    ctx.fillRect(x - dir * 6, y - 2, 1, 1);        // stern curl
    const shields = [nightDim(S.pal.accent, 0.4), nightDim(hsl(48, 30, 62), 0.4), nightDim(hsl(215, 25, 48), 0.4)];
    for (let i = -4; i <= 4; i += 2) {
      ctx.fillStyle = css(shields[((i + 4) / 2) % 3]);
      ctx.fillRect(x + i, y - 2, 1, 1);
    }
    ctx.fillStyle = css(hull);
    ctx.fillRect(x, y - 9, 1, 7);                  // mast
    for (let i = -3; i <= 3; i++) {                // this ship's own sail colors
      ctx.fillStyle = css(nightDim(i % 2 ? sail[0] : sail[1], 0.45));
      ctx.fillRect(x + i, y - 8, 1, 4);
    }
    ctx.fillStyle = css(S.pal.waterGlint, 0.35);
    ctx.fillRect(x - dir * 8, y, 3, 1);
    ctx.fillRect(x - dir * 11, y + 1, 2, 1);
  }

  function updateShips(ctx, t, dt) {
    const s = ship, W = S.W;
    if (s.respawnT > 0) {
      s.respawnT -= dt;
      if (s.respawnT <= 0) {
        if (Math.random() < 0.5) s.dir *= -1;
        s.x = s.dir > 0 ? -40 : W + 40 + s.span;
      } else return;
    }
    s.x += s.speed * s.dir * dt;
    if ((s.dir > 0 && s.x > W + s.span + 60) || (s.dir < 0 && s.x < -s.span - 60)) {
      s.respawnT = 20 + Math.random() * 40;
      return;
    }
    for (const m of s.members) {
      const mx = Math.round(s.x - s.dir * m.off);
      if (mx < -20 || mx > W + 20) continue;
      const my = Math.round(s.y + m.yOff + Math.sin(t * 1.1 + m.ph) * 0.8);
      drawShip(ctx, mx, my, s.dir, m.sail);
    }
  }

  /* ---------- distant volcano fx ---------- */
  function drawVolcano(ctx, t, dt) {
    const v = geo.volcano, fx = volcanoFx;
    // breathing crater glow
    const pulse = 0.7 + 0.3 * Math.sin(t * 0.8 + fx.ph) * Math.sin(t * 2.3);
    const a = (S.pal.night ? 0.22 : 0.1) * pulse;
    ctx.fillStyle = css(hsl(14, 90, 50), a);
    const R = 5 + v.craterHalf;
    for (let dy = -R; dy <= R; dy++) {
      const w = Math.floor(Math.sqrt(R * R - dy * dy) * 1.6);
      ctx.fillRect(v.x - w, v.topY + 1 + Math.round(dy * 0.5), w * 2, 1);
    }
    ctx.fillStyle = css(hsl(18, 95, 55), 0.5 + 0.35 * pulse);
    ctx.fillRect(v.x - 2, v.topY + 1, 5, 1);
    ctx.fillStyle = css(hsl(44, 100, 72), 0.45 + 0.4 * pulse);
    ctx.fillRect(v.x - 1, v.topY + 1, 2, 1);
    // ash column leaning downwind
    fx.smokeT -= dt;
    if (fx.smokeT <= 0) {
      fx.smoke.push({ x: v.x + (Math.random() * 3 - 1.5), y: v.topY, age: 0, ph: Math.random() * 6 });
      fx.smokeT = 0.22;
    }
    const wd = geo.windDir || 1;
    const sCol = mix(shade(S.pal.zenith, -0.25), rgb(38, 32, 32), 0.6);
    for (let i = fx.smoke.length - 1; i >= 0; i--) {
      const sm = fx.smoke[i];
      sm.age += dt;
      if (sm.age > 9) { fx.smoke.splice(i, 1); continue; }
      const yy = sm.y - sm.age * 6;
      const xx = sm.x + Math.sin(sm.age * 1.1 + sm.ph) * (1 + sm.age * 0.5) + wd * sm.age * (1 + S.windLevel * 3);
      const sz = sm.age > 5 ? 3 : sm.age > 2 ? 2 : 1;
      const fade = 1 - sm.age / 9;
      ctx.fillStyle = css(shade(sCol, -0.22), 0.27 * fade);
      ctx.fillRect(Math.round(xx) - 1, Math.round(yy), sz + 1, sz + 1);
      ctx.fillStyle = css(sCol, 0.36 * fade);
      ctx.fillRect(Math.round(xx), Math.round(yy) - 1, sz, sz);
    }
    // embers spat into the dark
    if (S.pal.dim > 0.4 && Math.random() < dt * 2) {
      ctx.fillStyle = css(hsl(20, 95, 55), 0.8);
      ctx.fillRect(v.x + ((Math.random() * 6 - 3) | 0), v.topY - ((Math.random() * 5) | 0), 1, 1);
    }
  }

  function drawEruption(ctx, t, dt) {
    const v = geo.volcano, fx = volcanoFx;
    const wd = geo.windDir || 1;

    // Dense rolling plume: a narrow black stem mushrooms into a broad,
    // wind-torn crown. Particles grow in chunky pixel steps as they rise.
    fx.plumeT -= dt;
    while (fx.plumeT <= 0) {
      for (let i = 0; i < 2; i++) {
        fx.eruptionSmoke.push({
          x: v.x + (Math.random() * 6 - 3), y: v.topY - 1,
          age: 0, life: 10 + Math.random() * 6, rise: 8 + Math.random() * 4,
          side: Math.random() < 0.5 ? -1 : 1, ph: Math.random() * 6,
        });
      }
      fx.plumeT += 0.1;
    }
    const soot = mix(rgb(27, 25, 27), S.pal.zenith, 0.22);
    const ash = mix(rgb(91, 86, 82), S.pal.horizon, 0.28);
    for (let i = fx.eruptionSmoke.length - 1; i >= 0; i--) {
      const sm = fx.eruptionSmoke[i];
      sm.age += dt;
      if (sm.age > sm.life) { fx.eruptionSmoke.splice(i, 1); continue; }
      const crown = Math.max(0, sm.age - 3.2);
      const spread = sm.side * crown * crown * 0.48;
      const xx = sm.x + wd * sm.age * (1.5 + S.windLevel * 2.2) + spread + Math.sin(sm.age * 1.7 + sm.ph) * (1 + sm.age * 0.42);
      const yy = sm.y - sm.age * sm.rise + crown * 0.62;
      const sz = clamp(2 + Math.floor(sm.age * 0.72), 2, 10);
      const fade = clamp(1 - sm.age / sm.life, 0, 1);
      ctx.fillStyle = css(soot, 0.58 * fade);
      ctx.fillRect(Math.round(xx) - 1, Math.round(yy), sz + 2, sz + 2);
      ctx.fillStyle = css(ash, 0.34 * fade);
      ctx.fillRect(Math.round(xx), Math.round(yy) - 1, sz, Math.max(1, sz - 2));
      if (sm.age < 2.2) {
        ctx.fillStyle = css(hsl(12, 82, 36), 0.24 * (1 - sm.age / 2.2));
        ctx.fillRect(Math.round(xx), Math.round(yy) + sz - 1, Math.max(1, sz - 2), 2);
      }
    }

    // Periodic pressure bursts illuminate the crater and throw lava bombs.
    fx.flash = Math.max(0, fx.flash - dt * 1.8);
    fx.bombT -= dt;
    if (fx.bombT <= 0) {
      fx.flash = 1;
      fx.bombT = 2.8 + Math.random() * 4.8;
      for (let i = 0; i < 14; i++) {
        fx.bombs.push({ x: v.x + Math.random() * 4 - 2, y: v.topY,
          vx: (Math.random() * 20 - 10) + wd * 3, vy: -(18 + Math.random() * 24), age: 0 });
      }
    }
    if (fx.flash > 0) {
      ctx.fillStyle = css(hsl(20, 94, 54), 0.08 * fx.flash);
      ctx.fillRect(0, 0, S.W, geo.horizonY + 8);
    }
    const glow = 0.72 + 0.24 * Math.sin(t * 5.4 + fx.ph) + fx.flash * 0.25;
    ctx.fillStyle = css(hsl(15, 100, 52), 0.22 * glow);
    const gr = v.craterHalf + 10;
    for (let dy = -gr; dy <= gr; dy++) {
      const ww = Math.floor(Math.sqrt(Math.max(0, gr * gr - dy * dy)) * 1.8);
      ctx.fillRect(v.x - ww, v.topY + Math.round(dy * 0.45), ww * 2, 1);
    }
    for (let i = fx.bombs.length - 1; i >= 0; i--) {
      const b = fx.bombs[i];
      b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 28 * dt;
      if (b.age > 4 || b.y > S.H + 4) { fx.bombs.splice(i, 1); continue; }
      const hot = b.age < 1.2;
      ctx.fillStyle = css(hot ? hsl(42, 100, 70) : hsl(12, 92, 48), 0.92);
      ctx.fillRect(Math.round(b.x), Math.round(b.y), hot ? 2 : 1, hot ? 2 : 1);
      ctx.fillStyle = css(hsl(8, 86, 39), 0.5);
      ctx.fillRect(Math.round(b.x - b.vx * 0.035), Math.round(b.y - b.vy * 0.035), 1, 1);
    }
  }

  function drawEruptionOverlay(ctx, t, dt) {
    const fx = volcanoFx;
    if (!fx || !fx.erupting) return;
    const wd = geo.windDir || 1;
    const ashCol = mix(rgb(152, 148, 143), S.pal.horizon, 0.52);
    ctx.fillStyle = css(ashCol, 0.48);
    for (const a of fx.ash) {
      a.y += a.sp * dt;
      a.x += (wd * (1.5 + S.windLevel * 3) + Math.sin(t * 0.8 + a.sway) * 1.2) * dt;
      if (a.y > S.H + 2) { a.y = -2; a.x = Math.random() * S.W; }
      if (a.x > S.W + 2) a.x = -2; else if (a.x < -2) a.x = S.W + 2;
      ctx.fillRect(Math.round(a.x), Math.round(a.y), a.size, a.size);
    }
    for (const e of fx.fallingEmbers) {
      e.y += e.sp * dt;
      e.x += wd * (2.5 + S.windLevel * 5) * dt;
      if (e.y > S.H + 3 || e.x > S.W + 3 || e.x < -3) {
        e.y = -Math.random() * S.H * 0.35;
        e.x = Math.random() * S.W;
        e.hot = Math.random() < 0.25;
      }
      const flicker = 0.58 + 0.42 * Math.sin(t * 7 + e.ph);
      ctx.fillStyle = css(e.hot ? hsl(45, 100, 72) : hsl(17, 96, 54), 0.42 + flicker * 0.48);
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.hot ? 2 : 1, 1);
      if (e.hot) {
        ctx.fillStyle = css(hsl(8, 88, 42), 0.42);
        ctx.fillRect(Math.round(e.x - wd), Math.round(e.y - 1), 1, 1);
      }
    }
  }

  /* ---------- dwarven column ---------- */
  function updateDwarves(ctx, t, dt) {
    const d = dwarves, W = S.W;
    if (d.respawnT > 0) {
      d.respawnT -= dt;
      if (d.respawnT <= 0) {
        if (Math.random() < 0.5) d.dir *= -1;
        d.x = d.dir > 0 ? -20 : W + 20 + d.span;
      } else return;
    }
    d.x += d.speed * d.dir * dt;
    if ((d.dir > 0 && d.x > W + d.span + 40) || (d.dir < 0 && d.x < -d.span - 40)) {
      d.respawnT = 30 + Math.random() * 40;
      return;
    }
    const steel = nightDim(hsl(215, 12, 55), 0.4);
    for (let i = 0; i < d.members.length; i++) {
      const m = d.members[i];
      const mx = Math.round(d.x - d.dir * m.off);
      if (mx < -10 || mx > W + 10) continue;
      const y = fy(mx) + d.yOff + m.yJit;
      const frame = Math.floor((t * 6 + m.ph) % 2);
      // stumpy legs
      ctx.fillStyle = css(shade(m.tunic, -0.35));
      if (frame) { ctx.fillRect(mx - 1, y - 1, 1, 1); ctx.fillRect(mx + 1, y - 1, 1, 1); }
      else { ctx.fillRect(mx, y - 1, 1, 1); }
      // broad little body
      ctx.fillStyle = css(m.tunic);
      ctx.fillRect(mx - 1, y - 3, 3, 2);
      // beard in front, helmet on top
      ctx.fillStyle = css(m.beard);
      ctx.fillRect(mx + d.dir, y - 3, 1, 1);
      ctx.fillStyle = css(steel);
      ctx.fillRect(mx - (d.dir > 0 ? 0 : 1), y - 4, 2, 1);
      // pick over the shoulder
      ctx.fillStyle = css(shade(m.tunic, -0.45));
      ctx.fillRect(mx - d.dir, y - 5, 1, 1);
      ctx.fillRect(mx - d.dir * 2, y - 6, 1, 1);
      ctx.fillStyle = css(steel);
      ctx.fillRect(mx - d.dir * 3, y - 6, 1, 1);
      // the leader carries a little lantern
      if (i === 0 && S.pal.dim > 0.2) {
        ctx.fillStyle = css(hsl(40, 90, 60), 0.8 + 0.2 * Math.sin(t * 4));
        ctx.fillRect(mx + d.dir * 2, y - 2, 1, 1);
      }
    }
  }

  /* ---------- orc horde ---------- */
  function updateOrc(ctx, o, t, dt) {
    const W = S.W;
    if (o.respawnT > 0) {
      o.respawnT -= dt;
      if (o.respawnT <= 0) o.x = o.dir > 0 ? -20 - Math.random() * 42 : W + 20 + Math.random() * 42;
      else return;
    }
    o.x += o.speed * o.dir * dt;
    if ((o.dir > 0 && o.x > W + 30) || (o.dir < 0 && o.x < -30)) {
      o.respawnT = 45 + Math.random() * 45;
      return;
    }
    const x = Math.round(o.x);
    const y = fy(x) + o.yOff;
    const skin = nightDim(hsl(95, 20, 26));
    const gear = shade(skin, -0.35);
    const frame = Math.floor((t * 5 + o.ph) % 2);
    ctx.fillStyle = css(gear);
    if (frame) { ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x + 1, y - 2, 1, 2); }
    else { ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x, y - 2, 1, 2); }
    ctx.fillStyle = css(skin);
    ctx.fillRect(x - 1, y - 4, 3, 2);
    ctx.fillRect(x + o.dir, y - 5, 1, 1);
    ctx.fillStyle = css(gear);
    ctx.fillRect(x + o.dir * 2, y - 7, 1, 4);
    ctx.fillStyle = css(shade(skin, 0.3));
    ctx.fillRect(x + o.dir * 2, y - 7, 1, 1);
    if (o.banner) {
      ctx.fillStyle = css(gear);
      ctx.fillRect(x - o.dir, y - 10, 1, 7);
      ctx.fillStyle = css(nightDim(hsl(0, 55, 35), 0.4));
      ctx.fillRect(x - o.dir + (o.dir > 0 ? -2 : 1), y - 10, 2, 2);
    }
  }

  /* ---------- battlefield crows ---------- */
  function updateCrow(ctx, c, t, dt) {
    c.hopT -= dt;
    if (c.hopT <= 0) {
      c.x += (Math.random() < 0.5 ? -1 : 1) * 2;
      c.hopT = 2 + Math.random() * 4;
    }
    const x = Math.round(c.x);
    const y = fy(x) + c.yOff;
    const peck = Math.sin(t * 3 + c.ph) > 0.55;
    ctx.fillStyle = css(rgb(12, 12, 16));
    ctx.fillRect(x, y - 1, 2, 1);
    ctx.fillRect(x + (peck ? 2 : 1), y - (peck ? 1 : 2), 1, 1);
  }

  /* ---------- dueling wizards ---------- */
  function drawWizardO(ctx, x, y, dir, robe, staffCol, castPose, t, ph) {
    // robe
    ctx.fillStyle = css(robe);
    ctx.fillRect(x - 1, y - 5, 2, 5);
    // head + hat
    ctx.fillStyle = css(nightDim(hsl(27, 45, 68)));
    ctx.fillRect(dir > 0 ? x : x - 1, y - 6, 1, 1);
    ctx.fillStyle = css(shade(robe, -0.15));
    ctx.fillRect(x - 1, y - 7, 3, 1);
    ctx.fillRect(dir > 0 ? x : x - 1, y - 8, 1, 1);
    // staff thrust toward the foe when casting, planted otherwise
    ctx.fillStyle = css(shade(robe, -0.4));
    if (castPose) {
      ctx.fillRect(x + dir, y - 6, 1, 1);
      ctx.fillRect(x + dir * 2, y - 6, 1, 1);
      ctx.fillRect(x + dir * 3, y - 7, 1, 1);
      ctx.fillStyle = css(staffCol);
      ctx.fillRect(x + dir * 3, y - 8, 1, 1);
    } else {
      ctx.fillRect(x + dir * 2, y - 7, 1, 6);
      ctx.fillStyle = css(staffCol);
      ctx.fillRect(x + dir * 2, y - 8, 1, 1);
    }
  }

  function updateDuel(ctx, t, dt) {
    const d = duel;
    const ya = fy(d.a.x) + d.yOff, yb = fy(d.b.x) + d.yOff;
    d.nextBolt -= dt;
    if (d.nextBolt <= 0) {
      const from = d.turn % 2 === 0 ? d.a : d.b;
      const to = d.turn % 2 === 0 ? d.b : d.a;
      d.turn++;
      d.nextBolt = 1.6 + Math.random() * 3.4;
      const fromY = fy(from.x) + d.yOff - 7;
      d.bolts.push({
        x: from.x + from.dir * 4, y: fromY, vx: from.dir * 34,
        col: from.col, target: to, castT: 0.5, caster: from,
      });
    }
    // casters flash a casting pose briefly
    const aCasting = d.bolts.some(b => b.caster === d.a && b.castT > 0);
    const bCasting = d.bolts.some(b => b.caster === d.b && b.castT > 0);
    drawWizardO(ctx, Math.round(d.a.x), ya, 1, d.a.robe, d.a.col, aCasting || d.turn % 2 === 1, t, 0);
    drawWizardO(ctx, Math.round(d.b.x), yb, -1, d.b.robe, d.b.col, bCasting || d.turn % 2 === 0, t, 3);
    // bolts
    for (let i = d.bolts.length - 1; i >= 0; i--) {
      const b = d.bolts[i];
      b.castT -= dt;
      b.x += b.vx * dt;
      const wob = Math.sin(b.x * 0.4 + t * 6) * 1.2;
      const by = fy(b.x) + d.yOff - 7 + wob;
      const arrived = (b.vx > 0 && b.x >= b.target.x - 2) || (b.vx < 0 && b.x <= b.target.x + 2);
      if (arrived) {
        for (let k = 0; k < 6; k++) {
          d.sparks.push({
            x: b.x, y: by, vx: (Math.random() - 0.5) * 24,
            vy: -Math.random() * 16, life: 0.3 + Math.random() * 0.4, col: b.col,
          });
        }
        d.bolts.splice(i, 1);
        continue;
      }
      ctx.fillStyle = css(b.col);
      ctx.fillRect(Math.round(b.x), Math.round(by), 2, 1);
      ctx.fillStyle = css(b.col, 0.5);
      ctx.fillRect(Math.round(b.x - b.vx * 0.04), Math.round(by), 1, 1);
    }
    for (let i = d.sparks.length - 1; i >= 0; i--) {
      const sp = d.sparks[i];
      sp.life -= dt;
      if (sp.life <= 0) { d.sparks.splice(i, 1); continue; }
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      ctx.fillStyle = css(sp.col, Math.min(1, sp.life * 2.5));
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y), 1, 1);
    }
  }

  /* ---------- woodland elves ---------- */
  function updateElf(ctx, e, t, dt) {
    if (e.pauseT > 0) e.pauseT -= dt;
    else {
      e.x += e.speed * e.dir * dt;
      if (e.x < e.x0) { e.x = e.x0; e.dir = 1; }
      if (e.x > e.x1) { e.x = e.x1; e.dir = -1; }
      if (Math.random() < dt * 0.2) e.pauseT = 1.5 + Math.random() * 3;
    }
    const x = Math.round(e.x);
    const y = fy(x) + e.yOff;
    const moving = e.pauseT <= 0;
    const frame = moving ? Math.floor((t * 4 + e.ph) % 2) : 0;
    const skin = nightDim(hsl(30, 30, 74));
    // slender legs
    ctx.fillStyle = css(shade(e.cloak, -0.3));
    if (frame) { ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x + 1, y - 2, 1, 2); }
    else { ctx.fillRect(x, y - 2, 1, 2); }
    // cloak
    ctx.fillStyle = css(e.cloak);
    ctx.fillRect(x - 1, y - 5, 2, 3);
    // head with pointed hood
    ctx.fillStyle = css(skin);
    ctx.fillRect(e.dir > 0 ? x : x - 1, y - 6, 1, 1);
    ctx.fillStyle = css(shade(e.cloak, 0.12));
    ctx.fillRect(e.dir > 0 ? x - 1 : x, y - 7, 1, 1);
    // bow: a small arc carried in front
    ctx.fillStyle = css(shade(e.cloak, -0.42));
    ctx.fillRect(x + e.dir * 2, y - 6, 1, 1);
    ctx.fillRect(x + e.dir * 3, y - 5, 1, 2);
    ctx.fillRect(x + e.dir * 2, y - 3, 1, 1);
  }

  /* ---------- foxes ---------- */
  function updateFox(ctx, f, t, dt) {
    f.t -= dt;
    if (f.t <= 0) {
      if (f.mode === "trot") { f.mode = "sit"; f.t = 2 + Math.random() * 4; }
      else { f.mode = "trot"; f.t = 2 + Math.random() * 4; f.dir = Math.random() < 0.5 ? -1 : 1; }
    }
    if (f.mode === "trot") {
      f.x += f.speed * f.dir * dt;
      if (f.x < f.x0) { f.x = f.x0; f.dir = 1; }
      if (f.x > f.x1) { f.x = f.x1; f.dir = -1; }
    }
    const x = Math.round(f.x);
    const y = fy(x) + f.yOff;
    const russet = nightDim(hsl(20, 65, 42));
    const cream = nightDim(hsl(35, 40, 80));
    const dir = f.dir;
    ctx.fillStyle = css(russet);
    if (f.mode === "sit") {
      ctx.fillRect(x - 1, y - 3, 2, 3);              // seated body
      ctx.fillRect(x + dir, y - 4, 1, 1);            // head
      ctx.fillRect(x + dir, y - 5, 1, 1);            // ears
      ctx.fillStyle = css(cream);
      ctx.fillRect(x - dir, y - 1, 1, 1);            // tail curled, white tip
    } else {
      const frame = Math.floor((t * 8 + f.ph) % 2);
      ctx.fillRect(x - 2, y - 3, 4, 2);              // body
      ctx.fillRect(x + dir * 2, y - 4, 1, 1);        // head
      ctx.fillRect(x + dir * 2, y - 5, 1, 1);        // ears
      ctx.fillRect(x - dir * 3, y - 4, 1, 1);        // tail root
      ctx.fillStyle = css(cream);
      ctx.fillRect(x - dir * 4, y - 4, 1, 1);        // white tail tip
      ctx.fillRect(x + dir, y - 2, 1, 1);            // chest
      ctx.fillStyle = css(shade(russet, -0.35));
      if (frame) { ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); }
      else { ctx.fillRect(x, y - 1, 1, 1); }
    }
  }

  /* ---------- centaur ---------- */
  function updateCentaur(ctx, t, dt) {
    const c = centaur;
    if (c.pauseT > 0) c.pauseT -= dt;
    else {
      c.x += c.speed * c.dir * dt;
      if (c.x < c.x0) { c.x = c.x0; c.dir = 1; }
      if (c.x > c.x1) { c.x = c.x1; c.dir = -1; }
      if (Math.random() < dt * 0.15) c.pauseT = 1.5 + Math.random() * 3.5;
    }
    const x = Math.round(c.x);
    const y = fy(x) + c.yOff;
    const dir = c.dir;
    const moving = c.pauseT <= 0;
    const frame = moving ? Math.floor((t * 6 + c.ph) % 2) : 0;
    // horse half
    ctx.fillStyle = css(c.body);
    ctx.fillRect(x - 2, y - 4, 5, 2);
    if (frame) { ctx.fillRect(x - 2, y - 2, 1, 2); ctx.fillRect(x + 2, y - 2, 1, 2); }
    else { ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x + 1, y - 2, 1, 2); }
    ctx.fillStyle = css(shade(c.body, -0.3));
    ctx.fillRect(x - dir * 3, y - 4, 1, 2);          // tail
    // human half rising from the front
    ctx.fillStyle = css(c.skin);
    ctx.fillRect(x + dir * 2, y - 7, 2, 3);          // torso
    ctx.fillRect(x + dir * 2, y - 8, 1, 1);          // head
    // spear
    ctx.fillStyle = css(shade(c.body, -0.45));
    ctx.fillRect(x + dir * 4, y - 10, 1, 7);
    ctx.fillStyle = css(nightDim(hsl(215, 15, 65), 0.4));
    ctx.fillRect(x + dir * 4, y - 11, 1, 1);
  }

  /* ---------- ghosts ---------- */
  function updateGhost(ctx, gh, t, dt) {
    gh.visT -= dt;
    if (gh.visT <= 0) {
      gh.fading = !gh.fading;
      gh.visT = gh.fading ? 3 + Math.random() * 5 : 6 + Math.random() * 9;
      if (!gh.fading) gh.x = gh.x0 + Math.random() * (gh.x1 - gh.x0); // reappear elsewhere
    }
    const fade = gh.fading
      ? clamp(gh.visT / 2, 0, 1)
      : clamp(1 - Math.max(0, gh.visT - (6 + 3)) , 0.2, 1); // ease in
    if (fade <= 0.02) return;
    gh.x += gh.speed * gh.dir * dt * 0.6;
    if (gh.x < gh.x0) { gh.x = gh.x0; gh.dir = 1; }
    if (gh.x > gh.x1) { gh.x = gh.x1; gh.dir = -1; }
    const x = Math.round(gh.x);
    const y = fy(x) + gh.yOff - 2 + Math.round(Math.sin(t * 0.9 + gh.ph) * 1.5); // hovers
    const pale = mix(S.pal.horizon, rgb(235, 240, 245), S.pal.night ? 0.75 : 0.5);
    const a = (0.34 + 0.14 * Math.sin(t * 0.7 + gh.ph)) * fade;
    ctx.globalAlpha = Math.max(0.05, a);
    ctx.fillStyle = css(pale);
    ctx.fillRect(x - 1, y - 6, 2, 5);                 // shroud
    ctx.fillRect(x - 1 + ((t * 2 + gh.ph) % 2 | 0), y - 1, 1, 1); // trailing hem
    ctx.fillRect(x - 1, y - 7, 2, 1);                 // head
    ctx.globalAlpha = Math.max(0.05, a * 1.6);
    ctx.fillStyle = css(shade(pale, -0.6));
    ctx.fillRect(x - 1, y - 6, 1, 1);                 // hollow eyes
    ctx.fillRect(x, y - 6, 1, 1);
    ctx.globalAlpha = 1;
  }

  /* ---------- wheeling ravens ---------- */
  function updateRavens(ctx, t, dt) {
    const rv = ravens;
    ctx.fillStyle = css(rgb(14, 14, 20));
    for (const b of rv.birds) {
      b.ang += b.spd * dt;
      const x = Math.round(rv.cx + Math.cos(b.ang) * b.rx);
      const y = Math.round(rv.cy + Math.sin(b.ang) * b.rx * 0.4 + Math.sin(t * 1.3 + b.ph) * 2);
      const up = Math.sin(t * 7 + b.ph) > 0;
      ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(x - 1, y + (up ? -1 : 0), 1, 1);
      ctx.fillRect(x + 1, y + (up ? -1 : 0), 1, 1);
    }
  }

  /* ---------- per-frame entry points ---------- */
  function drawScene(ctx, t, dt) {
    if (volcanoFx && geo.volcano) {
      drawVolcano(ctx, t, dt);
      if (volcanoFx.erupting) drawEruption(ctx, t, dt);
    }
    if (dragon) updateDragon(ctx, t, dt);
    if (villageFx) drawVillageFire(ctx, t, dt);
    if (ravens) updateRavens(ctx, t, dt);
  }
  function drawOverlay(ctx, t, dt) { drawEruptionOverlay(ctx, t, dt); }
  function drawWater(ctx, t, dt) {
    if (dragon && geo.waterY !== null) {
      const lift = Math.cos(dragonWingPhase(t, dragon) * Math.PI * 2);
      drawDragonShadow(ctx, Math.round(dragon.x), dragon.dir, 1 - Math.abs(lift), true);
    }
    if (monster) updateMonster(ctx, t, dt);
    if (ship) updateShips(ctx, t, dt);
  }
  function drawFore(ctx, t, dt) {
    for (const o of orcs) updateOrc(ctx, o, t, dt);
    for (const c of crows) updateCrow(ctx, c, t, dt);
    if (duel) updateDuel(ctx, t, dt);
    for (const e of elves) updateElf(ctx, e, t, dt);
    for (const f of foxes) updateFox(ctx, f, t, dt);
    if (centaur) updateCentaur(ctx, t, dt);
    for (const gh of ghosts) updateGhost(ctx, gh, t, dt);
    if (dwarves) updateDwarves(ctx, t, dt);
  }

  return { bakeMid, bakeFore, bakeBackdrop, init, drawScene, drawWater, drawFore, drawOverlay };
})();
