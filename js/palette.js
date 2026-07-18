/* palette.js — builds a limited, moody palette from time of day / weather / season */
"use strict";

function buildPalette(p, rng) {
  const { timeOfDay, weather, season } = p;
  const pal = {};

  // ---- sky ramp: top -> horizon ----
  // each entry [h, s, l]
  let stops;
  const drift = rng.range(-8, 8); // per-seed hue variety
  switch (timeOfDay) {
    case "dawn":
      stops = [[248, 42, 22], [285, 34, 32], [330, 38, 46], [18, 55, 64], [32, 62, 72]];
      break;
    case "morning":
      stops = [[218, 44, 42], [212, 40, 55], [204, 36, 66], [196, 34, 75]];
      break;
    case "noon":
      stops = [[214, 46, 46], [209, 40, 60], [202, 34, 72], [190, 30, 79]];
      break;
    case "golden":
      stops = [[228, 34, 34], [250, 26, 42], [20, 44, 54], [36, 66, 62]];
      break;
    case "dusk":
      stops = [[252, 46, 15], [280, 40, 24], [320, 42, 34], [356, 48, 42], [16, 56, 48]];
      break;
    case "night":
    default:
      stops = [[230, 46, 6], [228, 42, 10], [226, 38, 15], [222, 32, 21]];
      break;
  }

  // weather adjustments
  let satMul = 1, lightAdd = 0;
  if (weather === "overcast") { satMul = 0.42; lightAdd = -4; }
  if (weather === "rain" || weather === "storm") { satMul = 0.38; lightAdd = -9; }
  if (weather === "mist") { satMul = 0.55; lightAdd = +3; }
  if (weather === "snow") { satMul = 0.4; lightAdd = +4; }
  if (season === "winter") satMul *= 0.85;

  pal.sky = stops.map(([h, s, l]) =>
    hsl(h + drift, s * satMul, clamp(l + lightAdd, 3, 88)));
  pal.horizon = pal.sky[pal.sky.length - 1];
  pal.zenith = pal.sky[0];

  // ---- sun / moon ----
  pal.sunVisible = timeOfDay !== "night" && weather !== "overcast" &&
                   weather !== "rain" && weather !== "storm" && weather !== "snow";
  if (timeOfDay === "dawn" || timeOfDay === "dusk") pal.sun = hsl(24, 78, 78);
  else if (timeOfDay === "golden") pal.sun = hsl(38, 85, 80);
  else pal.sun = hsl(48, 60, 92);
  pal.moon = hsl(52, 22, 88);
  pal.night = timeOfDay === "night";
  pal.dim = timeOfDay === "night" ? 1 : (timeOfDay === "dusk" || timeOfDay === "dawn") ? 0.55 : 0;

  // ---- clouds ----
  const cloudBase = mix(pal.horizon, rgb(255, 255, 255), pal.night ? 0.0 : 0.25);
  pal.cloudLight = pal.night ? shade(pal.horizon, 0.12) : cloudBase;
  pal.cloudDark = shade(pal.cloudLight, -0.28);
  if (timeOfDay === "dusk" || timeOfDay === "dawn" || timeOfDay === "golden") {
    pal.cloudLight = mix(pal.cloudLight, hsl(20, 70, 60), 0.35);
  }

  // ---- land hue by season ----
  let landHue, landSat, landLight;
  switch (season) {
    case "autumn": landHue = rng.range(22, 42); landSat = 34; landLight = 30; break;
    case "winter": landHue = rng.range(200, 225); landSat = 14; landLight = 46; break;
    case "moor":   landHue = rng.range(60, 90);  landSat = 22; landLight = 28; break;
    default:       landHue = rng.range(95, 145); landSat = 30; landLight = 28; break; // green
  }
  landSat *= clamp(satMul + 0.25, 0.3, 1);
  const dimF = pal.dim; // darken land at dusk/night
  landLight = clamp(landLight + lightAdd * 0.6 - dimF * (season === "winter" ? 14 : 16), 4, 70);

  const landBase = hsl(landHue, landSat, landLight);
  // night lands shift toward deep indigo — the s&s trick
  const nightTint = hsl(232, 40, 12);
  pal.land = dimF > 0 ? mix(landBase, nightTint, dimF * 0.65) : landBase;

  // murky / gloomy environments
  if (p.terrain === "swamp") pal.land = mix(pal.land, hsl(85, 26, 22), 0.5);
  if (p.terrain === "darkforest") pal.land = shade(mix(pal.land, hsl(150, 18, 16), 0.4), -0.12);

  // ridge layers: far ridges dissolve into the horizon haze
  pal.ridge = (depth) => { // depth 0 = farthest
    const hazeAmt = [0.88, 0.7, 0.48][depth] ?? 0.34;
    return mix(shade(pal.land, -0.2 - depth * 0.06), pal.horizon, hazeAmt);
  };
  pal.midLand = mix(shade(pal.land, -0.1), pal.horizon, 0.11);
  pal.midLandLit = shade(pal.midLand, 0.14);
  pal.foreLand = shade(pal.land, -0.6);
  pal.foreLandLit = shade(pal.foreLand, 0.26);
  pal.grass = shade(pal.land, 0.05);

  // ---- water ----
  pal.water = mix(shade(mix(pal.zenith, pal.horizon, 0.45), -0.25), pal.land, 0.12);
  pal.waterDeep = shade(pal.water, -0.45);
  pal.waterGlint = pal.night ? shade(pal.moon, -0.15) : shade(pal.horizon, 0.35);
  if (p.terrain === "swamp") {
    pal.water = mix(pal.water, hsl(82, 30, 20), 0.55);
    pal.waterDeep = shade(pal.water, -0.4);
    pal.waterGlint = mix(pal.waterGlint, hsl(80, 35, 48), 0.5);
  }

  // ---- castle ----
  const stoneHue = rng.pick([220, 226, 210, 250, 30]);
  const stoneBase = hsl(stoneHue, 12, clamp(34 - dimF * 20, 8, 40));
  const stone = dimF > 0 ? mix(stoneBase, nightTint, dimF * 0.5) : stoneBase;
  pal.castleDark = shade(stone, -0.42);
  pal.castleMid = stone;
  pal.castleLight = shade(stone, 0.2);
  pal.castleRoof = rng.chance(0.5)
    ? mix(hsl(215, 30, 24), nightTint, dimF * 0.5)   // slate
    : mix(hsl(8, 45, 30), nightTint, dimF * 0.55);   // terracotta
  pal.windowLit = hsl(36, 90, 62);
  pal.windowDark = shade(stone, -0.6);

  // ---- accent (flags, banners) — one striking color ----
  pal.accent = rng.pick([
    hsl(354, 68, 48), hsl(200, 75, 55), hsl(42, 80, 55),
    hsl(160, 55, 45), hsl(285, 45, 55), hsl(18, 75, 50),
  ]);
  if (dimF > 0.8) pal.accent = shade(pal.accent, -0.35);

  // ---- dark citadels: black stone, eerie light ----
  if (p.darkCastle) {
    const dstone = mix(hsl(272, 14, 11), nightTint, dimF * 0.4);
    pal.castleDark = shade(dstone, -0.45);
    pal.castleMid = dstone;
    pal.castleLight = shade(dstone, 0.15);
    pal.castleRoof = rng.pick([hsl(278, 28, 14), hsl(350, 45, 16), hsl(240, 20, 10)]);
    pal.windowLit = rng.pick([hsl(140, 90, 55), hsl(281, 85, 64)]);
    pal.windowDark = shade(dstone, -0.55);
    pal.accent = rng.pick([hsl(350, 70, 32), hsl(276, 60, 45), hsl(152, 65, 38)]);
  }

  // ---- creatures ----
  pal.sheepBody = pal.night ? hsl(45, 8, 42) : hsl(45, 14, 78);
  pal.sheepFace = shade(pal.foreLand, -0.3);
  pal.cowBody = rng.pick([hsl(20, 30, 26), hsl(30, 25, 45), hsl(0, 0, 82)]);
  pal.bird = pal.night ? shade(pal.horizon, 0.3) : shade(pal.zenith, -0.55);

  pal.snowGround = season === "winter";
  return pal;
}
