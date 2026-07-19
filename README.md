# calm castles

A meditative web toy: every visit conjures a new, gently animated fantasy vista —
procedurally generated pixel-art castles and landscapes, scored by an endlessly generative
80s dark-fantasy synth soundtrack. Nothing to do but watch, listen, and breathe.

## Running it

It's a fully static site — no build step, no dependencies, no audio files.

```sh
python3 -m http.server 8642
# then open http://localhost:8642
```

(Or use any static file server. Opening `index.html` directly from disk also works
in most browsers.)

## Controls

| key / button | action |
| --- | --- |
| `space` / `n` / ⟳ | conjure a new vista |
| `c` / ⧉ | copy a permalink to the current vista |
| `m` / ♪ | mute / unmute |
| `f` / ⛶ | fullscreen |
| `?seed=12345` URL param | revisit a specific vista |

The UI fades away after a few seconds of stillness.

## What gets rolled each visit

- **Time of day** — dawn, morning, noon, golden hour, dusk, night (moon with phases, twinkling stars, shooting stars)
- **Season** — spring, summer, autumn, winter (snowy ground), moorland
- **Weather** — clear, breezy, overcast, mist, rain, snow, or a storm with lightning and (delayed) thunder
- **Terrain** — lake, coast, valley, hills, plains, foggy swamp, or dark forest, plus four monumental environment families: Moonwood, where enormous trunks and rounded foliage enclose shrines and ruins; Cloud Highlands, whose inhabited summits rise through layered fog; Sacred Ruin Peaks built from eroded steps, rune-panels, and ancient stairs; and asymmetric Mirrorwater Cliffs reflected in a broad, nearly empty lake. All retain parallax ridgelines and dithered skies; some vistas raise a range of snow-capped mountains behind everything
- **Structure** — a castle (on a hill, island, or sea-cliff), a ruin, a lone wizard's tower, a cottage with chimney smoke, a windmill with turning sails, standing stones, or nothing at all — always seated on ground flattened to its true footprint, never floating or overhanging. Some keeps are black-stoned dark citadels with eerie green or violet window-light and grim banners, more often found in swamps and dark woods
- **Landscape details** — pine forests and groves, great round-crowned oaks (bare-limbed in winter), rocky crags, and animated waterfalls that tumble into lakes and seas; most land is generously strewn with shrubs, stones, boulders, and stray trees, and cave mouths gape with stalactites, rubble, pitch-black depths — and, once in a while, a pair of blinking eyes
- **Monuments** — weathered statues, obelisks, ruined arches, broken columns, and cairns
- **Life** — bird flocks, grazing sheep or cows, and fireflies on warm nights, plus restrained wildlife vignettes suited to their surroundings: deer with an occasional fawn, small groups of rabbits, lone mountain eagles, jumping fish, ducks on calm water, or one or two wolves in remote country. Only one wildlife vignette can appear in a scene, and busy or inhabited vistas strongly suppress them
- **Folk** — most vistas are empty or nearly so, but sometimes the land is peopled: farmers hoeing the fields under straw hats, druids raising their arms around a crackling bonfire, townsfolk milling at the castle gate, merchants leading pack mules toward the keep, soldiers on patrol with spears, knights riding through on horseback, wizards wandering with glowing staffs, and now and then royalty walking with their retinue, cape in the vista's accent color
- **Omens** — about one vista in five carries a single rare happening (never two at once): a great articulated dragon crossing the sky on a staged profile-flight cycle, its separate near and far wings passing through raised, open, power, and recovery poses while tucked legs, body lift, and a counter-swaying barbed tail sell the weight of every beat; it casts a moving shadow before breathing a long gout of fire. Other omens include an orc horde marching under a ragged banner; a sea serpent raising its head from the deep; a village in flames beneath a column of black smoke; a viking fleet of two to four long-ships, each under a different colored sail; the silent aftermath of a battle with crows picking over it; one to four colossal statues of the old kings, crowned and weathered with raised palms and stone swords; a distant volcano trailing a quiet ash column with a glowing crater, or a separate catastrophic eruption with a mushrooming plume, a smoke-gray sky, lava bombs, falling ash, and ember rain; a quiet graveyard of tilted headstones under a dead tree; lone watchtowers — sometimes whole, sometimes crumbling; a column of dwarves marching single file with picks on their shoulders and a lantern at the front; two wizards dueling with arcing bolts of colored fire; a deep elven wood walked by slender bow-carrying fair folk; foxes trotting and sitting in the meadow; a spear-bearing centaur; translucent ghosts that drift, fade, and reappear; or an unkindness of ravens wheeling over the towers. The caption usually whispers what's happening ("harloch burns", "wings over dunmere", "dorwick remembers"), and grim or fey omens empty the land of ordinary folk
- **Details** — waving pennants in a per-vista accent color, lit windows after dark, water reflections that ripple, drifting clouds and mist, framing pines
- **A name** — every vista gets a small poetic caption ("the pale mere of caerdale…")

## The music

Generated live with the Web Audio API — every vista also rolls its own key
(aeolian / dorian / phrygian) and mood, in a deep 80s dark-fantasy synth style:

- a seeded four-chord progression unique to each vista, moving through a slow
  arc of blooms, retreats, and returns with smoothly voiced detuned pads
- dark minor voicings over a deep E2–B2 root, grounded by sub, root, and
  fifth drones
- a short recurring melodic motif that returns in varied lead phrases and bells
- scene-aware orchestration: glassier winter music, darker forests and storms,
  warmer dawns, wider watery echoes, and especially spacious nights
- wind that follows the weather, soft rain hiss, thunder after lightning
- faint tape hiss, stereo drift, cavernous reverb, and a warm lowpass over everything
- seamless six-second musical crossfades whenever a new vista appears

## Code layout

| file | role |
| --- | --- |
| `js/util.js` | seeded RNG, 1-D fBm noise, color math, Bayer dither matrix |
| `js/palette.js` | builds the limited mood palette from time/weather/season |
| `js/scene.js` | rolls all scene parameters + the poetic caption |
| `js/castle.js` | procedural castles, ruins, towers, cottages, windmills, stones |
| `js/characters.js` | the folk: farmers, druids, townsfolk, merchants, soldiers, knights, wizards, royalty |
| `js/omens.js` | rare happenings: dragon, orcs, sea monster, burning village, long-ship fleet, battlefield, duel, elves, foxes, centaur, ghosts, ravens, argonath, volcano, graveyard, turrets, dwarves |
| `js/render.js` | static layer painting + per-frame animation |
| `js/music.js` | the generative soundtrack |
| `js/main.js` | boot, sizing, input, main loop |

The scene renders at ~270px internal height and upscales with crisp pixels
(`image-rendering: pixelated`), cover-fit to the window. The internal width
follows the window's aspect ratio so nothing important gets cropped.

Dev tricks: `?seed=N` reproduces a vista; `?wildlife=<animal>` forces deer,
rabbits, eagle, fish, ducks, or wolves; `?terrain=<terrain>` (moonwood,
highlands, ruinpeak, mirrorwater, or any original terrain) forces an environment;
`?force=<feature>` (waterfall, cave,
statue, obelisk, archRuin, columns, cairn, crag, greatTree, forest, grove)
guarantees that decoration appears; `?folk=<troupe>` (farmers, druids, townsfolk,
merchant, soldiers, knight, wizard, royalty) guarantees that troupe appears;
`?omen=<omen>` (dragon, orcs, seamonster, village, ship, battlefield, duel,
elves, foxes, centaur, ghosts, ravens, argonath, volcano, graveyard, turrets,
ruinturrets, dwarves) forces a rare happening;
`window.CC.newVista(seed)` in the console regenerates in place.
