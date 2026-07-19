/* main.js — boot, sizing, input, loop */
"use strict";

(() => {
  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const captionEl = document.getElementById("caption");
  const overlay = document.getElementById("overlay");
  const welcomeCastle = document.getElementById("welcomeCastle");
  const toastEl = document.getElementById("toast");
  const muteButton = document.getElementById("btnMute");
  const fullButton = document.getElementById("btnFull");

  let scene = null;
  let seed = 0;
  let lastT = 0;
  let captionTimer = null;
  let idleTimer = null;
  let toastTimer = null;

  function drawWelcomeCastle() {
    const g = welcomeCastle.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, welcomeCastle.width, welcomeCastle.height);

    const pal = {
      dim: 0.72,
      castleDark: hsl(226, 25, 11),
      castleMid: hsl(225, 18, 25),
      castleLight: hsl(216, 19, 39),
      castleRoof: hsl(235, 28, 13),
      windowLit: hsl(39, 78, 64),
      windowDark: hsl(230, 32, 7),
    };
    const sprite = buildStructure(makeRng(0xca1cca57), pal, "castle", true);

    g.fillStyle = css(hsl(224, 20, 20), 0.55);
    g.fillRect(8, 58, 96, 1);
    g.fillStyle = css(hsl(216, 21, 34), 0.4);
    g.fillRect(19, 57, 23, 1);
    g.fillRect(70, 57, 31, 1);
    g.drawImage(sprite.canvas, 14, 50, 112, 60, 0, 0, 112, 60);
  }

  function computeSize() {
    // the window can report 0x0 before first layout — fall back to 16:9
    const vw = window.innerWidth || 480;
    const vh = window.innerHeight || 270;
    let W = Math.round(270 * (vw / vh)), H = 270;
    if (W < 240) { // very tall window: keep width workable, grow the sky instead
      W = 240;
      H = clamp(Math.round(240 * (vh / vw)), 270, 460);
    }
    W = Math.min(W, 660);
    return { W, H, vw, vh };
  }

  function fitCanvas() {
    // cover-fit with square pixels (internal aspect may be clamped)
    const { vw, vh } = computeSize();
    const scale = Math.max(vw / canvas.width, vh / canvas.height);
    canvas.style.width = Math.ceil(canvas.width * scale) + "px";
    canvas.style.height = Math.ceil(canvas.height * scale) + "px";
  }

  function newVista(fixedSeed) {
    seed = fixedSeed !== undefined ? fixedSeed : (Math.random() * 0xffffffff) >>> 0;
    buildVista();
  }

  function buildVista() {
    const { W, H } = computeSize();
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    scene = generateScene(seed, W, H);
    Render.build(scene);
    if (Music.started) Music.setScene(scene);
    fitCanvas();
    showCaption(scene.caption);
    document.title = scene.caption + " · calm castles";
  }

  function showCaption(text) {
    captionEl.textContent = text;
    captionEl.classList.remove("show");
    clearTimeout(captionTimer);
    // fade in after a beat, fade out later
    setTimeout(() => captionEl.classList.add("show"), 1200);
    captionTimer = setTimeout(() => captionEl.classList.remove("show"), 11000);
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function updateMuteButton(muted) {
    muteButton.classList.toggle("off", muted);
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    muteButton.title = muted ? "Unmute sound (M)" : "Mute sound (M)";
  }

  function updateFullscreenButton() {
    const active = Boolean(document.fullscreenElement);
    fullButton.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
    fullButton.title = active ? "Exit fullscreen (F)" : "Enter fullscreen (F)";
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else showToast("fullscreen unavailable");
    } catch (error) {
      console.warn("fullscreen request failed", error);
      showToast("fullscreen unavailable");
    }
  }

  async function shareVista() {
    const url = new URL(location.href);
    url.searchParams.set("seed", String(seed));
    url.searchParams.delete("force");
    url.searchParams.delete("folk");
    url.searchParams.delete("omen");
    try {
      await navigator.clipboard.writeText(url.href);
      showToast("vista link copied");
    } catch (error) {
      console.warn("clipboard write failed", error);
      window.prompt("Copy this vista link:", url.href);
    }
  }

  /* ---- loop ---- */
  let sizeCheck = 0;
  function loop(ms) {
    const t = ms / 1000;
    let dt = t - lastT;
    lastT = t;
    if (dt > 0.1) dt = 0.1; // tab was hidden
    if (scene) Render.frame(ctx, t, dt);
    // self-heal if the window size settled after boot (e.g. pane animation)
    if (t - sizeCheck > 1.5) {
      sizeCheck = t;
      const { W, H } = computeSize();
      if (!scene || Math.abs(W - scene.W) > 14 || Math.abs(H - scene.H) > 14) buildVista();
    }
    requestAnimationFrame(loop);
  }

  /* ---- input ---- */
  function begin() {
    Music.start(scene);
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    document.getElementById("btnNew").focus({ preventScroll: true });
    resetIdle();
  }

  document.getElementById("begin").addEventListener("click", begin);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) begin(); });

  document.getElementById("btnNew").addEventListener("click", () => newVista());
  document.getElementById("btnShare").addEventListener("click", shareVista);
  muteButton.addEventListener("click", () => updateMuteButton(Music.toggleMute()));
  fullButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", updateFullscreenButton);

  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "n" || e.key === "N") { e.preventDefault(); newVista(); }
    else if (e.key === "m" || e.key === "M") {
      updateMuteButton(Music.toggleMute());
    } else if (e.key === "f" || e.key === "F") {
      toggleFullscreen();
    } else if (e.key === "c" || e.key === "C") shareVista();
  });

  /* ---- idle-hide UI ---- */
  function resetIdle() {
    document.body.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add("idle"), 4000);
  }
  window.addEventListener("mousemove", resetIdle);
  window.addEventListener("touchstart", resetIdle);
  window.addEventListener("focusin", resetIdle);

  /* ---- resize ---- */
  let resizeDebounce = null;
  window.addEventListener("resize", () => {
    fitCanvas();
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      const { W, H } = computeSize();
      if (scene && (Math.abs(W - scene.W) > 14 || Math.abs(H - scene.H) > 14)) buildVista(); // same seed, re-laid out
    }, 350);
  });

  /* ---- lightning -> thunder ---- */
  Render.onLightning = (delay) => Music.thunder(delay);

  /* ---- boot ---- */
  drawWelcomeCastle();
  const params = new URLSearchParams(location.search);
  const urlSeed = params.get("seed");
  seed = urlSeed !== null ? (parseInt(urlSeed, 10) >>> 0) : (Math.random() * 0xffffffff) >>> 0;
  try {
    buildVista();
  } catch (e) {
    console.error("boot build failed, will retry from loop", e);
  }
  requestAnimationFrame(loop);

  // console helpers
  window.CC = { newVista, get scene() { return scene; }, get seed() { return seed; } };
})();
