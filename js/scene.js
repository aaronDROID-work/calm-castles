/* scene.js — rolls the parameters of a vista from a seed */
"use strict";

function generateScene(seed, W, H) {
  const rng = makeRng(seed);
  const s = { seed, W, H };

  // ---- time & weather ----
  s.timeOfDay = rng.weighted([
    ["dawn", 12], ["morning", 18], ["noon", 14],
    ["golden", 14], ["dusk", 15], ["night", 27],
  ]);

  s.season = rng.weighted([
    ["summer", 40], ["spring", 18], ["autumn", 22], ["winter", 14], ["moor", 6],
  ]);

  // ---- terrain (rolled early — weather leans on it) ----
  s.terrain = rng.weighted([
    ["lake", 24], ["valley", 17], ["coast", 15], ["hills", 15], ["plains", 13],
    ["swamp", 8], ["darkforest", 8],
  ]);
  s.hasWater = s.terrain === "lake" || s.terrain === "coast" || s.terrain === "swamp";

  let weatherPool = [
    ["clear", 34], ["breezy", 24], ["overcast", 12],
    ["mist", 11], ["rain", 10], ["storm", 4],
  ];
  if (s.season === "winter") weatherPool = [
    ["clear", 30], ["breezy", 18], ["overcast", 14], ["mist", 10], ["snow", 28],
  ];
  if (s.terrain === "swamp") weatherPool.push(["mist", 26]);
  if (s.terrain === "darkforest") weatherPool.push(["mist", 10]);
  s.weather = rng.weighted(weatherPool);
  if (s.timeOfDay === "night" && s.weather === "storm" && rng.chance(0.3)) s.weather = "rain";

  s.cloudCover = { clear: rng.range(0, 0.25), breezy: rng.range(0.35, 0.65),
    overcast: 1, mist: rng.range(0.2, 0.5), rain: 0.9, storm: 1, snow: 0.8 }[s.weather];
  s.windLevel = { clear: 0.15, breezy: 0.45, overcast: 0.3, mist: 0.1,
    rain: 0.55, storm: 0.9, snow: 0.35 }[s.weather];

  // ---- structure ----
  s.structure = rng.weighted([
    ["castle", 60], ["ruin", 10], ["tower", 8], ["cottage", 9], ["stones", 4], ["none", 9],
  ]);
  s.hasWindmill = s.terrain === "plains" && rng.chance(0.35);
  if (s.hasWindmill && s.structure !== "castle") s.structure = "windmill";
  // gloomy lands prefer gloomier keeps
  if ((s.terrain === "swamp" || s.terrain === "darkforest") && s.structure === "castle" && rng.chance(0.35))
    s.structure = rng.pick(["ruin", "tower"]);
  // some castles are black, home to users of dark magic
  s.darkCastle = ["castle", "tower", "ruin"].includes(s.structure) &&
    rng.chance(s.terrain === "swamp" || s.terrain === "darkforest" ? 0.5 : 0.15);

  // ---- distant high mountains behind some vistas ----
  s.mountains = rng.chance(["valley", "hills", "lake", "darkforest"].includes(s.terrain) ? 0.4 : 0.15);

  // castle sits on: hill (default), island (lake only), cliff (coast)
  s.castleSite = "hill";
  if (s.terrain === "lake" && rng.chance(0.4)) s.castleSite = "island";
  if (s.terrain === "coast") s.castleSite = "cliff";
  s.castleX = rng.range(0.24, 0.76); // fraction of W

  // ---- celestial ----
  s.sunX = rng.range(0.15, 0.85);
  s.moonPhase = rng.range(0, 1);
  s.moonX = rng.range(0.15, 0.85);
  s.showMoonAtDusk = s.timeOfDay === "dusk" && rng.chance(0.5);

  // ---- fauna ----
  const day = s.timeOfDay !== "night";
  s.birdFlocks = day && s.weather !== "storm" && s.weather !== "rain"
    ? rng.int(0, 2) + (s.weather === "clear" ? 1 : 0) : 0;
  const meadow = !["coast", "swamp", "darkforest"].includes(s.terrain);
  s.livestock = "none";
  if (meadow && day && s.weather !== "storm" && rng.chance(0.55)) {
    s.livestock = rng.weighted([["sheep", 60], ["cows", 40]]);
    s.livestockCount = s.livestock === "sheep" ? rng.int(3, 7) : rng.int(2, 4);
  }
  const duskyNight = s.timeOfDay === "night" || s.timeOfDay === "dusk";
  s.fireflies = duskyNight && s.weather !== "rain" && s.weather !== "storm" &&
    (s.terrain === "swamp" ? rng.chance(0.95)
      : s.season !== "winter" && rng.chance(0.7));

  // ---- characters ----
  // usually nobody or a few souls; occasionally a busy day
  s.characterDensity = rng.weighted([["none", 32], ["few", 46], ["many", 22]]);

  // ---- rare omens: at most one per vista, ~20% of seeds ----
  const omenPool = ["dragon", "orcs", "battlefield", "village", "duel",
    "foxes", "centaur", "ghosts", "ravens", "argonath", "volcano", "eruption",
    "graveyard", "turrets", "ruinturrets", "dwarves"];
  if (s.hasWater) omenPool.push("seamonster", "ship");
  if (s.terrain !== "coast" && s.terrain !== "swamp") omenPool.push("elves");
  s.omen = rng.chance(0.2) ? rng.pick(omenPool) : null;
  if (typeof location !== "undefined") {
    const forcedOmen = new URLSearchParams(location.search).get("omen");
    if (forcedOmen !== null) s.omen = forcedOmen || null;
  }
  // The old kings may stand alone, guard a gate, or form a weathered council.
  s.argonathCount = s.omen === "argonath"
    ? rng.weighted([[1, 28], [2, 38], [3, 22], [4, 12]])
    : 0;
  // A full eruption is its own omen: the quiet volcano remains untouched.
  // Ash chokes the sky and sends wildlife and ordinary travellers to shelter.
  if (s.omen === "eruption") {
    s.weather = "overcast";
    s.cloudCover = 1;
    s.windLevel = Math.max(0.45, s.windLevel);
    s.birdFlocks = 0;
    s.livestock = "none";
    s.fireflies = false;
    s.characterDensity = "none";
  }
  // grim or fey omens empty the land of ordinary folk
  if (["orcs", "village", "battlefield", "ghosts", "elves", "eruption"].includes(s.omen))
    s.characterDensity = "none";

  // ---- palette ----
  s.pal = buildPalette(s, rng);

  // ---- caption ----
  s.caption = makeCaption(s, rng);
  return s;
}

/* ---- poetic caption ---- */
function makeCaption(s, rng) {
  const adjs = ["pale", "quiet", "ashen", "gilded", "sleeping", "misty", "solemn",
    "amber", "silver", "forgotten", "patient", "windswept", "hollow", "elder",
    "wandering", "still", "distant", "nameless"];
  const nounsBy = {
    lake: ["mere", "loch", "stillwater", "tarn"],
    coast: ["strand", "headland", "grey shore", "sound"],
    valley: ["vale", "hollow", "glen", "dell"],
    hills: ["tor", "moor", "downs", "fells"],
    plains: ["heath", "lea", "field", "steppe"],
    swamp: ["fen", "mire", "marsh", "bog"],
    darkforest: ["wood", "weald", "thicket", "dark wood"],
  };
  const timeword = { dawn: "dawn", morning: "morning", noon: "noon",
    golden: "golden hour", dusk: "dusk", night: "night" }[s.timeOfDay];

  const starts = ["Dun", "Caer", "Ael", "Mor", "Bryn", "Fen", "Gal", "Har",
    "Skel", "Tir", "Vael", "Wyn", "Dor", "Eth", "Lorn", "Umber"];
  const ends = ["more", "wick", "dale", "holt", "mere", "fell", "garth",
    "combe", "loch", "wyn", "rath", "by"];
  const name = rng.pick(starts) + rng.pick(ends);

  const adj = rng.pick(adjs);
  const noun = rng.pick(nounsBy[s.terrain]);

  // an omen usually colors the caption
  if (s.omen && rng.chance(0.75)) {
    const omenT = {
      dragon: [`wings over ${name}`, `the dragon of ${name}`, `a shadow crosses ${name}`],
      orcs: [`the horde marches on ${name}`, `drums beyond the ${noun}`],
      seamonster: [`something stirs beneath ${name}`, `the deep of ${name} wakes`],
      village: [`${name} burns`, `smoke over ${name}`],
      ship: [`raiders pass ${name}`, `a long-ship off ${name}`],
      battlefield: [`after the battle of ${name}`, `the silent ${noun} of ${name}`],
      duel: [`wizards quarrel at ${name}`, `sparks over ${name}`],
      elves: [`the fair folk of ${name}`, `elves walk the ${noun}`],
      foxes: [`the foxes of ${name}`, `small hunters in the ${noun}`],
      centaur: [`the centaur of ${name}`, `strange hoofprints near ${name}`],
      ghosts: [`the unquiet dead of ${name}`, `${name} remembers`],
      ravens: [`the ravens gather at ${name}`, `an unkindness over ${name}`],
      argonath: s.argonathCount === 1
        ? [`the silent king of ${name}`, `the stone warden of ${name}`]
        : [`the silent kings of ${name}`, `the stone wardens of ${name}`, `the gates of ${name}`],
      volcano: [`the mountain of fire near ${name}`, `${name}, under the burning peak`],
      eruption: [`the fire mountain wakes above ${name}`, `ashfall over ${name}`, `${name}, beneath the burning sky`],
      graveyard: [`the sleepers of ${name}`, `quiet stones near ${name}`],
      turrets: [`the watchtowers of ${name}`, `the silent watch over ${name}`],
      ruinturrets: [`the broken towers of ${name}`, `old watchfires of ${name}`],
      dwarves: [`the delvers pass ${name}`, `dwarves on the road through the ${noun}`],
    }[s.omen];
    if (omenT) return rng.pick(omenT).toLowerCase();
  }

  const templates = [
    `the ${adj} ${noun} of ${name}`,
    `${name}, at ${timeword}`,
    `beneath a ${adj} sky · ${name}`,
    `the ${noun} of ${name}, at ${timeword}`,
  ];
  return rng.pick(templates).toLowerCase();
}
