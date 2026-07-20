/* castle.js — procedural castles, ruins, towers, cottages, windmills.
   Returns { canvas, w, h, flags:[{x,y}], smoke:[{x,y}], litWindows:[{x,y}] }
   with anchor coords local to the canvas; baseline is the bottom edge. */
"use strict";

function buildStructure(rng, pal, kind, lightFromLeft) {
  const CW = 140, CH = 110;
  const cv = makeCanvas(CW, CH);
  const g = cv.getContext("2d");
  const out = { canvas: cv, w: CW, h: CH, flags: [], smoke: [], litWindows: [] };
  const lit = pal.dim > 0.3; // windows glow at dawn/dusk/night

  const px = (x, y, w, h, c) => { g.fillStyle = css(c); g.fillRect(x | 0, y | 0, w | 0, h | 0); };

  function crenels(x, y, w) {
    for (let i = 0; i < w; i += 3) px(x + i, y - 2, 2, 2, pal.castleMid);
  }

  function windows(x, y, w, h, chanceLit) {
    // columns of small windows on a tower/keep face
    const cols = w >= 11 ? 2 : 1;
    const cx0 = x + Math.floor(w / (cols + 1));
    for (let c = 0; c < cols; c++) {
      const wx = cx0 + c * Math.floor(w / (cols + 1)) + (cols === 2 ? 1 : 0);
      for (let wy = y + 4; wy < y + h - 5; wy += rng.int(6, 9)) {
        const isLit = lit && rng.chance(chanceLit);
        px(wx, wy, 1, 2, isLit ? pal.windowLit : pal.windowDark);
        if (isLit) out.litWindows.push({ x: wx, y: wy });
      }
    }
  }

  function towerBody(x, w, top, base, broken) {
    px(x, top, w, base - top, pal.castleMid);
    // lit / shadow faces
    const litW = Math.max(1, Math.floor(w * 0.35));
    if (lightFromLeft) {
      px(x, top, litW, base - top, pal.castleLight);
      px(x + w - 1, top, 1, base - top, pal.castleDark);
    } else {
      px(x + w - litW, top, litW, base - top, pal.castleLight);
      px(x, top, 1, base - top, pal.castleDark);
    }
    if (broken) {
      // jagged broken rim
      for (let i = 0; i < w; i++) {
        const bite = rng.int(0, 3);
        if (bite) px(x + i, top, 1, bite, { r: 0, g: 0, b: 0 });
      }
      g.save();
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < w; i++) g.fillRect(x + i, top, 1, rng.int(0, 3));
      g.restore();
    }
  }

  function coneRoof(x, w, top) {
    const h = Math.round(w * rng.range(0.9, 1.4));
    for (let i = 0; i < h; i++) {
      const rw = Math.max(1, Math.round(w * (i / h)));
      px(x + Math.round((w - rw) / 2), top - h + i, rw, 1, pal.castleRoof);
    }
    // rim light on roof
    px(x + Math.round(w / 2) - (lightFromLeft ? 1 : 0), top - h, 1, 1, shade(pal.castleRoof, 0.3));
    return top - h;
  }

  function flagPole(x, y) {
    px(x, y - 4, 1, 4, pal.castleDark);
    out.flags.push({ x: x, y: y - 4 });
  }

  const baseY = CH; // baseline at bottom
  const cx = CW / 2;

  if (kind === "castle" || kind === "ruin") {
    const ruined = kind === "ruin";
    const ruinSmoke = [];
    const nTowers = rng.int(2, 4);
    const keepW = rng.int(16, 26);
    const keepH = rng.int(30, 46) * (ruined ? 0.7 : 1);
    const keepX = Math.round(cx - keepW / 2);
    const keepTop = baseY - keepH;

    // curtain wall behind everything
    const wallH = rng.int(12, 18);
    const wallSpan = rng.int(46, 66);
    const wallX = Math.round(cx - wallSpan / 2);
    px(wallX, baseY - wallH, wallSpan, wallH, shade(pal.castleMid, -0.12));
    if (!ruined) crenels(wallX, baseY - wallH, wallSpan);
    else for (let i = 0; i < wallSpan; i += rng.int(2, 5))
      px(wallX + i, baseY - wallH - rng.int(0, 2), 1, 2, shade(pal.castleMid, -0.12));

    // side towers
    const positions = [];
    for (let i = 0; i < nTowers; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const dist = rng.int(14, 30) + Math.floor(i / 2) * 12;
      positions.push(Math.round(cx + side * dist));
    }
    for (let towerI = 0; towerI < positions.length; towerI++) {
      const tx = positions[towerI];
      const tw = rng.int(7, 11);
      const th = rng.int(22, 42) * (ruined ? rng.range(0.4, 0.8) : 1);
      const top = baseY - th;
      towerBody(Math.round(tx - tw / 2), tw, top, baseY, ruined && rng.chance(0.7));
      if (ruined && (towerI === 0 || (towerI === 1 && positions.length > 2)))
        ruinSmoke.push({ x: tx, y: Math.round(top + 2), damaged: true });
      if (!ruined) {
        if (rng.chance(0.55)) {
          const roofTop = coneRoof(Math.round(tx - tw / 2), tw, top);
          if (rng.chance(0.5)) flagPole(tx, roofTop);
        } else {
          crenels(Math.round(tx - tw / 2), top, tw);
          if (rng.chance(0.3)) flagPole(tx, top - 2);
        }
      }
      windows(Math.round(tx - tw / 2), top, tw, th, 0.5);
    }

    // keep (front and center, tallest)
    towerBody(keepX, keepW, keepTop, baseY, ruined && rng.chance(0.5));
    if (!ruined) {
      if (rng.chance(0.4)) {
        const roofTop = coneRoof(keepX, keepW, keepTop);
        flagPole(Math.round(cx), roofTop);
      } else {
        crenels(keepX, keepTop, keepW);
        flagPole(Math.round(cx), keepTop - 2);
      }
    }
    windows(keepX, keepTop, keepW, keepH, 0.6);

    if (ruined) out.smoke.push(...ruinSmoke.slice(0, 2));

    // gate arch
    if (!ruined) {
      const gw = 3;
      px(Math.round(cx - gw / 2), baseY - 6, gw, 6, pal.windowDark);
      px(Math.round(cx - gw / 2) + 1, baseY - 7, 1, 1, pal.windowDark);
      if (lit && rng.chance(0.5)) {
        px(Math.round(cx), baseY - 4, 1, 2, pal.windowLit);
        out.litWindows.push({ x: Math.round(cx), y: baseY - 4 });
      }
    }
    out.footW = wallSpan + 20;
  }

  else if (kind === "tower") {
    // lone wizard tower
    const tw = rng.int(8, 11);
    const th = rng.int(40, 60);
    const top = baseY - th;
    towerBody(Math.round(cx - tw / 2), tw, top, baseY, false);
    const roofTop = coneRoof(Math.round(cx - tw / 2), tw, top);
    if (rng.chance(0.6)) flagPole(Math.round(cx), roofTop);
    windows(Math.round(cx - tw / 2), top, tw, th, 0.7);
    out.footW = tw + 8;
  }

  else if (kind === "cottage") {
    // a humble hut — small next to any keep
    const bw = rng.int(8, 12), bh = rng.int(4, 6);
    const bx = Math.round(cx - bw / 2), by = baseY - bh;
    px(bx, by, bw, bh, pal.castleMid);
    px(bx, by, lightFromLeft ? 1 : 0, bh, pal.castleLight);
    // pitched roof — narrow at the ridge, wide at the eaves
    const rh = rng.int(3, 5);
    for (let i = 0; i < rh; i++) {
      const inset = Math.round(((rh - 1 - i) / rh) * (bw / 2));
      px(bx + inset - 1, by - rh + i, bw - inset * 2 + 2, 1, pal.castleRoof);
    }
    // chimney
    const chx = bx + (rng.chance(0.5) ? 1 : bw - 2);
    px(chx, by - rh - 2, 1, rh + 2, pal.castleDark);
    out.smoke.push({ x: chx, y: by - rh - 2 });
    // warm window + door
    const wx = bx + Math.round(bw * 0.3);
    px(wx, by + 1, 1, 2, lit ? pal.windowLit : pal.windowDark);
    if (lit) out.litWindows.push({ x: wx, y: by + 1 });
    px(bx + bw - 3, by + bh - 3, 1, 3, pal.windowDark);
    out.footW = bw + 4;
  }

  else if (kind === "windmill") {
    const tw = rng.int(7, 9);
    const th = rng.int(18, 26);
    const top = baseY - th;
    // tapered body
    for (let i = 0; i < th; i++) {
      const w = Math.round(lerp(tw, tw * 0.65, i / th));
      px(Math.round(cx - w / 2), baseY - 1 - i, w, 1, pal.castleMid);
      if (lightFromLeft) px(Math.round(cx - w / 2), baseY - 1 - i, 1, 1, pal.castleLight);
    }
    // cap
    px(Math.round(cx - tw * 0.4), top - 2, Math.round(tw * 0.8), 3, pal.castleRoof);
    const wx = Math.round(cx);
    px(wx, baseY - Math.round(th * 0.5), 1, 2, lit ? pal.windowLit : pal.windowDark);
    if (lit) out.litWindows.push({ x: wx, y: baseY - Math.round(th * 0.5) });
    out.mill = { x: Math.round(cx), y: top - 1, r: rng.int(9, 12) };
    out.footW = tw + 4;
  }

  else if (kind === "stones") {
    // standing stones circle
    for (let i = -2; i <= 2; i++) {
      const sx = Math.round(cx + i * rng.range(5, 8));
      const sh = rng.int(5, 10);
      px(sx, baseY - sh, 2, sh, pal.castleDark);
      if (lightFromLeft) px(sx, baseY - sh, 1, sh, pal.castleMid);
    }
    out.footW = 40;
  }

  return out;
}
