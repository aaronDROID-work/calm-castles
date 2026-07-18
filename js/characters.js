/* characters.js — tiny folk who live in the vistas.
   Farmers, druids at bonfires, townsfolk, merchants, soldiers,
   knights on horseback, wandering wizards, royalty. */
"use strict";

const Characters = (() => {
  let S = null, geo = null;
  let foreChars = [], midChars = [], fires = [], props = [];

  /* ---------- colors ---------- */
  function dimmed(c) {
    const d = S.pal.dim;
    return d > 0 ? mix(c, hsl(232, 40, 12), d * 0.6) : c;
  }
  const CLOTH = [[18, 32, 38], [32, 38, 45], [205, 18, 40], [95, 22, 35],
    [268, 15, 38], [350, 30, 40], [45, 30, 50], [0, 0, 55], [0, 0, 30]];
  function cloth(rng) {
    const [h, s, l] = rng.pick(CLOTH);
    return dimmed(hsl(h, s, l + rng.int(-5, 5)));
  }
  const ROBES = [[0, 0, 74], [0, 0, 45], [140, 15, 30], [270, 12, 35]];

  function fy(x) { return geo.foreYs[clamp(Math.round(x), 0, S.W - 1)]; }

  /* ---------- setup ---------- */
  function init(scene, geoRef, rng) {
    S = scene; geo = geoRef;
    foreChars = []; midChars = []; fires = []; props = [];
    const forced = new URLSearchParams(location.search).get("folk");
    if (forced) spawnTroupe(forced, rng, true, []);
    const density = S.characterDensity || "few";
    if (density === "none") return;
    const many = density === "many";

    const day = !S.pal.night;
    const dusky = S.timeOfDay === "dusk" || S.timeOfDay === "dawn";
    const meadow = !["coast", "swamp", "darkforest", "moonwood", "highlands", "ruinpeak", "mirrorwater"].includes(S.terrain);
    const calm = S.weather !== "storm";
    const dry = calm && S.weather !== "rain";
    const nearStruct = !!geo.structGround;

    const pool = [];
    if (day && meadow && dry) pool.push(["farmers", 6]);
    if (dry || S.weather === "snow") pool.push(["druids", S.pal.night || dusky ? 5 : 1.5]);
    if (nearStruct && day && ["castle", "cottage", "windmill"].includes(S.structure)) pool.push(["townsfolk", 5]);
    if (day && calm) pool.push(["merchant", 4]);
    if ((S.structure === "castle" || S.structure === "ruin") && calm) pool.push(["soldiers", 4]);
    if (day || dusky) pool.push(["knight", 3]);
    pool.push(["wizard", S.pal.night ? 4 : 2.5]);
    if (S.structure === "castle" && day) pool.push(["royalty", 2]);

    const zones = [];
    let n = many ? rng.int(3, 5) : rng.int(1, 2);
    while (n-- > 0 && pool.length) {
      let total = 0;
      for (const p of pool) total += p[1];
      let r = rng.next() * total, idx = 0;
      for (let i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) { idx = i; break; } }
      const kind = pool[idx][0];
      pool.splice(idx, 1);
      spawnTroupe(kind, rng, many, zones);
    }
  }

  function claimZone(rng, half, zones) {
    const margin = Math.max(24, Math.round(S.W * 0.1));
    const lo = margin + half, hi = S.W - margin - half;
    if (hi <= lo) return null;
    for (let tries = 0; tries < 20; tries++) {
      const x = rng.int(lo, hi);
      let ok = true;
      for (const [a, b] of zones) if (x + half > a - 6 && x - half < b + 6) { ok = false; break; }
      if (ok) { zones.push([x - half, x + half]); return x; }
    }
    return null;
  }

  function baseChar(rng, over) {
    return Object.assign({
      zone: "fore", h: 7, x: 0, dir: rng.chance(0.5) ? 1 : -1,
      yOff: rng.int(3, 10), yFix: 0,
      mode: "stand", speed: rng.range(2, 3.5),
      x0: 0, x1: S.W, pauseT: 0, phase: rng.range(0, 6),
      skin: dimmed(hsl(27, 45, 68)), tunic: null,
      follow: null, gap: 0, respawnT: 0, sparkles: [],
    }, over);
  }

  function spawnTroupe(kind, rng, many, zones) {
    const W = S.W;
    const sg = geo.structGround;

    if (kind === "farmers") {
      const cx = claimZone(rng, 18, zones);
      if (cx === null) return;
      const count = many ? rng.int(3, 6) : rng.int(1, 3);
      for (let i = 0; i < count; i++) {
        foreChars.push(baseChar(rng, {
          kind: "farmer", mode: "work", x: cx + rng.int(-15, 15),
          tunic: dimmed(hsl(rng.pick([35, 90, 20]), 30, rng.int(32, 42))),
          strawHat: rng.chance(0.5), tool: rng.chance(0.5) ? "hoe" : "fork",
          speed: rng.range(1.5, 2.5),
        }));
      }
      if (rng.chance(0.6)) props.push({ kind: "hay", x: cx + rng.int(-18, 18), yOff: rng.int(3, 9) });
    }

    else if (kind === "druids") {
      const cx = claimZone(rng, 13, zones);
      if (cx === null) return;
      const fire = { x: cx, yOff: rng.int(4, 9), phase: rng.range(0, 6), sparks: [], smoke: [], smokeT: 0 };
      fires.push(fire);
      const count = many ? rng.int(3, 5) : rng.int(2, 3);
      for (let i = 0; i < count; i++) {
        const off = (i % 2 ? 1 : -1) * (4 + (i >> 1) * 3);
        const [h, s, l] = rng.pick(ROBES);
        foreChars.push(baseChar(rng, {
          kind: "druid", mode: "ritual", x: cx + off, dir: off > 0 ? -1 : 1,
          yOff: fire.yOff + rng.int(-1, 1),
          tunic: dimmed(hsl(h, s, l)), armsT: rng.range(0, 8),
        }));
      }
    }

    else if (kind === "townsfolk" && sg) {
      // stay strictly on the flat plateau — the ground drops away past it
      const l = sg.l + 1, r = sg.r - 1;
      if (r - l < 10) return;
      const count = many ? rng.int(3, 6) : rng.int(2, 3);
      for (let i = 0; i < count; i++) {
        midChars.push(baseChar(rng, {
          kind: "folk", zone: "mid", h: 5, mode: rng.chance(0.6) ? "walk" : "stand",
          x: rng.int(l, r), x0: l, x1: r, yFix: sg.y + 1,
          tunic: cloth(rng), speed: rng.range(1.2, 2.4),
        }));
      }
    }

    else if (kind === "merchant") {
      // traveling toward the castle's side of the world
      const dir = S.castleX > 0.5 ? 1 : -1;
      const startX = dir > 0 ? -rng.int(10, 60) : W + rng.int(10, 60);
      const leader = baseChar(rng, {
        kind: "merchant", mode: "cross", x: startX, dir,
        tunic: dimmed(hsl(30, 40, 40)), yOff: rng.int(4, 9),
        speed: rng.range(3, 4.2),
      });
      foreChars.push(leader);
      foreChars.push(baseChar(rng, {
        kind: "mule", mode: "cross", x: startX, dir, yOff: leader.yOff,
        follow: leader, gap: 6,
        tunic: dimmed(hsl(30, 25, 38)), pack: dimmed(hsl(42, 35, 55)),
      }));
      if (many || rng.chance(0.4)) {
        foreChars.push(baseChar(rng, {
          kind: "folk", mode: "cross", x: startX, dir, yOff: leader.yOff,
          follow: leader, gap: 11, tunic: cloth(rng),
        }));
      }
    }

    else if (kind === "soldiers") {
      const count = many ? rng.int(3, 4) : 2;
      const steel = dimmed(hsl(215, 12, 42));
      if (sg && sg.r - sg.l > 14 && rng.chance(0.6)) {
        const l = sg.l + 1, r = sg.r - 1;
        const lead = baseChar(rng, {
          kind: "soldier", zone: "mid", h: 5, mode: "walk",
          x: rng.int(l, r), x0: l, x1: r, yFix: sg.y + 1,
          tunic: steel, speed: rng.range(1.8, 2.6),
        });
        midChars.push(lead);
        for (let i = 1; i < count; i++)
          midChars.push(baseChar(rng, {
            kind: "soldier", zone: "mid", h: 5, mode: "walk", x: lead.x,
            x0: l, x1: r, yFix: sg.y + 1, follow: lead, gap: 3 * i, tunic: steel,
          }));
      } else {
        const cx = claimZone(rng, 16, zones);
        if (cx === null) return;
        const lead = baseChar(rng, {
          kind: "soldier", mode: "walk", x: cx, x0: cx - 16, x1: cx + 16,
          tunic: steel, speed: rng.range(2, 3), yOff: rng.int(4, 9),
        });
        foreChars.push(lead);
        for (let i = 1; i < count; i++)
          foreChars.push(baseChar(rng, {
            kind: "soldier", mode: "walk", x: cx, yOff: lead.yOff,
            follow: lead, gap: 4 * i, tunic: steel,
          }));
      }
    }

    else if (kind === "knight") {
      const dir = rng.chance(0.5) ? 1 : -1;
      foreChars.push(baseChar(rng, {
        kind: "knight", mode: "cross", dir,
        x: dir > 0 ? -rng.int(10, 50) : W + rng.int(10, 50),
        yOff: rng.int(4, 9), speed: rng.range(6, 9),
        tunic: dimmed(hsl(210, 12, 62)),
        horse: dimmed(rng.pick([hsl(20, 35, 25), hsl(25, 20, 15), hsl(0, 0, 45), hsl(30, 30, 38)])),
      }));
    }

    else if (kind === "wizard") {
      const cx = claimZone(rng, 15, zones);
      if (cx === null) return;
      const [h, s, l] = rng.pick([[210, 25, 40], [270, 20, 38], [0, 0, 60], [0, 0, 35]]);
      foreChars.push(baseChar(rng, {
        kind: "wizard", h: 8, mode: "wander", x: cx, x0: cx - 18, x1: cx + 18,
        tunic: dimmed(hsl(h, s, l)), speed: rng.range(1.4, 2.2),
        yOff: rng.int(4, 9), sparkleT: rng.range(2, 8),
      }));
    }

    else if (kind === "royalty") {
      const royalTunic = dimmed(hsl(282, 30, 34));
      const cape = dimmed(S.pal.accent);
      const crown = dimmed(hsl(46, 85, 60));
      if (sg && sg.r - sg.l > 14 && rng.chance(0.5)) {
        const l = sg.l + 1, r = sg.r - 1;
        const lead = baseChar(rng, {
          kind: "royal", zone: "mid", h: 5, mode: "walk",
          x: rng.int(l, r), x0: l, x1: r, yFix: sg.y + 1,
          tunic: royalTunic, cape, crown, speed: 1.2,
        });
        midChars.push(lead);
        midChars.push(baseChar(rng, {
          kind: "folk", zone: "mid", h: 5, mode: "walk", x: lead.x,
          x0: l, x1: r, yFix: sg.y + 1, follow: lead, gap: 4, tunic: cloth(rng),
        }));
      } else {
        const cx = claimZone(rng, 14, zones);
        if (cx === null) return;
        const lead = baseChar(rng, {
          kind: "royal", mode: "walk", x: cx, x0: cx - 12, x1: cx + 12,
          tunic: royalTunic, cape, crown, speed: 1.4, yOff: rng.int(4, 9),
        });
        foreChars.push(lead);
        const nRet = many ? 2 : rng.int(1, 2);
        for (let i = 0; i < nRet; i++)
          foreChars.push(baseChar(rng, {
            kind: "folk", mode: "walk", x: cx, yOff: lead.yOff,
            follow: lead, gap: 4 + i * 3, tunic: cloth(rng),
          }));
      }
    }
  }

  /* ---------- behavior ---------- */
  function update(c, t, dt) {
    if (c.respawnT > 0) {
      c.respawnT -= dt;
      if (c.respawnT <= 0) {
        c.x = c.dir > 0 ? -20 - Math.random() * 30 : S.W + 20 + Math.random() * 30;
      } else return false;
    }
    if (c.follow) {
      if (c.follow.respawnT > 0) return false;
      c.x = c.follow.x - c.follow.dir * c.gap;
      if (c.zone === "mid") c.x = clamp(c.x, c.x0, c.x1); // never trail off the plateau
      c.dir = c.follow.dir;
      return c.x > -25 && c.x < S.W + 25;
    }
    if (c.mode === "walk" || c.mode === "wander") {
      if (c.pauseT > 0) c.pauseT -= dt;
      else {
        c.x += c.speed * c.dir * dt;
        if (c.x < c.x0) { c.x = c.x0; c.dir = 1; }
        if (c.x > c.x1) { c.x = c.x1; c.dir = -1; }
        if (Math.random() < dt * (c.mode === "wander" ? 0.3 : 0.12))
          c.pauseT = 1 + Math.random() * (c.mode === "wander" ? 4 : 2);
      }
    } else if (c.mode === "cross") {
      c.x += c.speed * c.dir * dt;
      if ((c.dir > 0 && c.x > S.W + 30) || (c.dir < 0 && c.x < -30))
        c.respawnT = 25 + Math.random() * 50;
      if (c.respawnT > 0) return false;
    } else if (c.mode === "work") {
      if (c.pauseT > 0) { c.pauseT -= dt; c.x += c.speed * c.dir * dt; }
      else if (Math.random() < dt * 0.05) {
        c.dir = Math.random() < 0.5 ? -1 : 1;
        c.pauseT = 0.9;
      }
    }
    return true;
  }

  function isMoving(c) {
    if (c.follow) return isMoving(c.follow);
    if (c.mode === "cross") return true;
    if (c.mode === "walk" || c.mode === "wander") return c.pauseT <= 0;
    if (c.mode === "work") return c.pauseT > 0;
    return false;
  }

  /* ---------- sprites ---------- */
  function figure(ctx, x, y, o) {
    const big = o.h >= 7;
    const legH = big ? 2 : 1;
    const torsoH = big ? 3 : 2;
    const bend = o.bend ? 1 : 0;
    const torsoTop = y - legH - torsoH;
    const legs = shade(o.tunic, -0.35);
    if (o.robe) {
      ctx.fillStyle = css(o.tunic);
      ctx.fillRect(x - 1, torsoTop + bend, 2, legH + torsoH - bend);
      if (o.frame === 1) ctx.fillRect(o.dir > 0 ? x + 1 : x - 2, y - 1, 1, 1); // hem swing
    } else {
      ctx.fillStyle = css(legs);
      if (o.frame === 1) {
        ctx.fillRect(x - 1, y - legH, 1, legH);
        ctx.fillRect(x + 1, y - legH, 1, legH);
      } else {
        ctx.fillRect(x - 1, y - legH, 1, legH);
        ctx.fillRect(x, y - legH, 1, legH);
      }
      ctx.fillStyle = css(o.tunic);
      ctx.fillRect(x - 1, torsoTop + bend, 2, torsoH - bend);
    }
    if (o.cape) {
      ctx.fillStyle = css(o.cape);
      ctx.fillRect(o.dir > 0 ? x - 2 : x + 1, torsoTop + bend, 1, torsoH);
    }
    const hy = torsoTop - 1 + bend;
    const hx = o.dir > 0 ? x : x - 1;
    ctx.fillStyle = css(o.hood ? o.tunic : o.skin);
    ctx.fillRect(hx, hy, 1, 1);
    if (o.strawHat) {
      ctx.fillStyle = css(dimmed(hsl(48, 45, 55)));
      ctx.fillRect(hx - 1, hy - 1, 3, 1);
    }
    if (o.hat) { // pointed wizard hat
      ctx.fillStyle = css(o.hat);
      ctx.fillRect(hx - 1, hy - 1, 3, 1);
      ctx.fillRect(hx, hy - 2, 1, 1);
    }
    if (o.crown) {
      ctx.fillStyle = css(o.crown);
      ctx.fillRect(hx, hy - 1, 1, 1);
    }
    if (o.armsUp) {
      ctx.fillStyle = css(o.tunic);
      ctx.fillRect(x - 2, hy, 1, 1);
      ctx.fillRect(x + 1, hy, 1, 1);
    }
    return { torsoTop, hy };
  }

  function drawChar(ctx, c, t) {
    const moving = isMoving(c);
    const x = Math.round(c.x);
    const y = c.zone === "mid" ? c.yFix : fy(c.x) + c.yOff;
    const frame = moving ? Math.floor((t * 4 + c.phase) % 2) : -1;

    if (c.kind === "knight") {
      const dir = c.dir;
      const hframe = moving ? Math.floor((t * 7 + c.phase) % 2) : 0;
      ctx.fillStyle = css(c.horse);
      ctx.fillRect(x - 2, y - 4, 5, 2);                    // body
      if (hframe === 0) {
        ctx.fillRect(x - 2, y - 2, 1, 2); ctx.fillRect(x + 2, y - 2, 1, 2);
      } else {
        ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x + 1, y - 2, 1, 2);
      }
      ctx.fillRect(x + dir * 2, y - 5, 1, 1);              // neck
      ctx.fillRect(x + dir * 3, y - 6, 1, 2);              // head
      ctx.fillStyle = css(shade(c.horse, -0.3));
      ctx.fillRect(x - dir * 3, y - 4, 1, 1);              // tail
      ctx.fillStyle = css(c.tunic);                        // armored rider
      ctx.fillRect(x, y - 6, 1, 2);
      ctx.fillRect(x, y - 7, 1, 1);
      ctx.fillStyle = css(dimmed(S.pal.accent));
      ctx.fillRect(x, y - 8, 1, 1);                        // plume
      return;
    }

    if (c.kind === "mule") {
      const dir = c.dir;
      const mframe = moving ? Math.floor((t * 5 + c.phase) % 2) : 0;
      ctx.fillStyle = css(c.tunic);
      ctx.fillRect(x - 1, y - 3, 3, 2);                    // body
      if (mframe === 0) { ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); }
      else { ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); }
      ctx.fillRect(x + dir * 2, y - 3, 1, 1);              // lowered head
      ctx.fillRect(x + dir * 2, y - 4, 1, 1);              // ears
      ctx.fillStyle = css(c.pack);
      ctx.fillRect(x - 1, y - 4, 2, 1);                    // packs
      return;
    }

    if (c.kind === "farmer") {
      const workF = Math.floor((t * 1.6 + c.phase) % 2);
      const bend = !moving && workF === 1;
      figure(ctx, x, y, { h: c.h, dir: c.dir, frame, tunic: c.tunic, skin: c.skin, strawHat: c.strawHat, bend });
      // tool: raised or striking
      ctx.fillStyle = css(shade(c.tunic, -0.45));
      if (bend) {
        ctx.fillRect(x + c.dir, y - 2, 1, 1);
        ctx.fillRect(x + c.dir * 2, y - 1, 1, 1);
      } else {
        ctx.fillRect(x + c.dir, y - 4, 1, 1);
        ctx.fillRect(x + c.dir * 2, y - 5, 1, 1);
      }
      return;
    }

    if (c.kind === "druid") {
      const armsUp = ((t + c.armsT) % 14) < 3; // periodic raised-arms ritual
      figure(ctx, x, y, { h: c.h, dir: c.dir, frame: -1, tunic: c.tunic, skin: c.skin, robe: true, hood: true, armsUp });
      return;
    }

    if (c.kind === "wizard") {
      figure(ctx, x, y, { h: c.h, dir: c.dir, frame, tunic: c.tunic, skin: c.skin, robe: true, hat: shade(c.tunic, -0.15) });
      // staff with a faintly glowing tip
      const sx = x + c.dir * 2;
      ctx.fillStyle = css(shade(c.tunic, -0.4));
      ctx.fillRect(sx, y - 5, 1, 5);
      ctx.fillStyle = css(dimmed(S.pal.accent));
      ctx.fillRect(sx, y - 6, 1, 1);
      // occasional sparkle
      c.sparkleT -= 1 / 60;
      if (c.sparkleT <= 0) {
        c.sparkleT = 3 + Math.random() * 9;
        for (let i = 0; i < 3; i++)
          c.sparkles.push({ x: sx + (Math.random() * 3 - 1.5), y: y - 6 - Math.random() * 2, vy: -3 - Math.random() * 4, life: 0.5 + Math.random() * 0.4 });
      }
      for (let i = c.sparkles.length - 1; i >= 0; i--) {
        const sp = c.sparkles[i];
        sp.life -= 1 / 60;
        if (sp.life <= 0) { c.sparkles.splice(i, 1); continue; }
        sp.y += sp.vy / 60;
        ctx.fillStyle = css(S.pal.accent, Math.min(1, sp.life * 2));
        ctx.fillRect(Math.round(sp.x), Math.round(sp.y), 1, 1);
      }
      return;
    }

    if (c.kind === "soldier") {
      figure(ctx, x, y, { h: c.h, dir: c.dir, frame, tunic: c.tunic, skin: c.skin });
      const sx = x + c.dir;
      const top = c.h >= 7 ? 7 : 5;
      ctx.fillStyle = css(shade(c.tunic, -0.35));
      ctx.fillRect(sx, y - top, 1, top - 1);               // spear shaft
      ctx.fillStyle = css(shade(c.tunic, 0.35));
      ctx.fillRect(sx, y - top - 1, 1, 1);                 // spearhead
      return;
    }

    // royal / folk / merchant walker
    figure(ctx, x, y, {
      h: c.h, dir: c.dir, frame, tunic: c.tunic, skin: c.skin,
      cape: c.cape, crown: c.crown,
    });
    if (c.kind === "merchant") { // bundle on the back
      ctx.fillStyle = css(shade(c.tunic, 0.25));
      ctx.fillRect(c.dir > 0 ? x - 2 : x + 1, y - (c.h >= 7 ? 5 : 4), 1, 1);
    }
  }

  /* ---------- bonfire ---------- */
  function drawFireGlow(ctx, f, t) {
    const x = Math.round(f.x), y = fy(f.x) + f.yOff;
    const flick = 0.8 + 0.2 * Math.sin(t * 9 + f.phase + Math.sin(t * 23));
    const a = (S.pal.night ? 0.13 : S.pal.dim > 0 ? 0.09 : 0.05) * flick;
    ctx.fillStyle = css(hsl(28, 85, 55), a);
    const R = 9;
    for (let dy = -R; dy <= R; dy++) {
      const w = Math.floor(Math.sqrt(R * R - dy * dy) * 1.7);
      ctx.fillRect(x - w, y - 1 + Math.round(dy * 0.5), w * 2, 1);
    }
  }

  function drawFireBody(ctx, f, t, dt) {
    const x = Math.round(f.x), y = fy(f.x) + f.yOff;
    ctx.fillStyle = css(dimmed(hsl(20, 30, 18)));
    ctx.fillRect(x - 2, y - 1, 4, 1);                      // logs
    const fh = 2 + Math.round(1.5 + Math.sin(t * 8 + f.phase) + Math.sin(t * 13.3) * 0.7);
    ctx.fillStyle = css(hsl(22, 90, 52));
    for (let i = 0; i < fh; i++) {
      const w = Math.max(1, Math.round((1 - i / fh) * 3));
      ctx.fillRect(x - (w >> 1), y - 2 - i, w, 1);
    }
    ctx.fillStyle = css(hsl(45, 95, 65));
    for (let i = 0; i < Math.max(1, fh - 2); i++) ctx.fillRect(x, y - 2 - i, 1, 1);
    // rising embers
    if (Math.random() < dt * 5)
      f.sparks.push({ x: x + (Math.random() * 3 - 1.5), y: y - 3, vx: (Math.random() - 0.5) * 4, vy: -(6 + Math.random() * 8), life: 0.4 + Math.random() * 0.7 });
    for (let i = f.sparks.length - 1; i >= 0; i--) {
      const sp = f.sparks[i];
      sp.life -= dt;
      if (sp.life <= 0) { f.sparks.splice(i, 1); continue; }
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      ctx.fillStyle = css(hsl(38, 92, 62), Math.min(1, sp.life * 1.6));
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y), 1, 1);
    }
    // woodsmoke
    f.smokeT -= dt;
    if (f.smokeT <= 0) {
      f.smoke.push({ x: f.x, y: y - 3 - fh, age: 0, ph: Math.random() * 6 });
      f.smokeT = 0.55;
    }
    const sCol = mix(S.pal.horizon, rgb(255, 255, 255), 0.15);
    const wd = geo.windDir || 1;
    for (let i = f.smoke.length - 1; i >= 0; i--) {
      const sm = f.smoke[i];
      sm.age += dt;
      if (sm.age > 5) { f.smoke.splice(i, 1); continue; }
      const yy = sm.y - sm.age * 5;
      const xx = sm.x + Math.sin(sm.age * 1.5 + sm.ph) * (1 + sm.age * 0.5) + wd * sm.age * S.windLevel * 3;
      ctx.fillStyle = css(sCol, 0.3 * (1 - sm.age / 5));
      ctx.fillRect(Math.round(xx), Math.round(yy), sm.age > 2.5 ? 2 : 1, 1);
    }
  }

  /* ---------- per-frame entry points ---------- */
  function drawMid(ctx, t, dt) {
    for (const c of midChars) {
      if (update(c, t, dt)) drawChar(ctx, c, t);
    }
  }

  function drawFore(ctx, t, dt) {
    for (const f of fires) drawFireGlow(ctx, f, t);
    // hay piles and other props
    for (const pr of props) {
      if (pr.kind === "hay") {
        const x = Math.round(pr.x), y = fy(pr.x) + pr.yOff;
        ctx.fillStyle = css(dimmed(hsl(46, 40, 48)));
        ctx.fillRect(x - 2, y - 1, 4, 1);
        ctx.fillRect(x - 1, y - 2, 2, 1);
        ctx.fillStyle = css(dimmed(hsl(48, 45, 58)));
        ctx.fillRect(x - 1, y - 3, 1, 1);
      }
    }
    for (const c of foreChars) {
      if (update(c, t, dt)) drawChar(ctx, c, t);
    }
    for (const f of fires) drawFireBody(ctx, f, t, dt);
  }

  return { init, drawMid, drawFore };
})();
