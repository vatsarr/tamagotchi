// ============================================================
// PUNCH TAMAGOTCHI — app.js
// ============================================================
// Sections (in order):
//   1. Constants & configuration
//   2. State (persistence, defaults, live state)
//   3. DOM references + digestion helpers
//   4. Render & UI helpers
//   5. Actions (feed, play, sleep, clean)
//   6. Day / night mechanic
//   7. Weather mechanic
//   8. Event listeners
//   9. Boot sequence
//
// Extracted modules:
//   simulation.js — moodLabel, computeDriftDeltas, applyOfflineDrift, driftStats
//   animations.js — triggerAnim, particles, wake-up system, idle scheduler
// ============================================================

import {
  initSimulation,
  moodLabel,
  applyOfflineDrift,
  driftStats,
  setDriftTickCallback,
} from "./simulation.js";
import {
  initAnimations,
  applyAnimSettings,
  triggerAnim,
  lockIdleForDuration,
  spawnStars,
  spawnZzz,
  spawnBubbles,
  checkPeriodWakeUp,
  checkInteractionWakeUp,
  checkEnergyWakeUp,
  startIdleScheduler,
  registerVisibilityWakeUp,
} from "./animations.js";

// ── 1. CONSTANTS & CONFIGURATION ────────────────────────────

const SAVE_KEY = "punch_tamagotchi_save";
const FEED_COOLDOWN_MS = 30000; // 30 s digestion cooldown
const DRIFT_INTERVAL_MS = 12000; // stat decay tick
const CIRC = 100; // SVG ring stroke-dasharray

const TIME_PERIODS = [
  { name: "latenight", label: "Late Night", start: 0, end: 5 },
  { name: "dawn", label: "Dawn", start: 5, end: 7 },
  { name: "morning", label: "Morning", start: 7, end: 10 },
  { name: "day", label: "Daytime", start: 10, end: 15 },
  { name: "afternoon", label: "Afternoon", start: 15, end: 18 },
  { name: "dusk", label: "Dusk", start: 18, end: 20 },
  { name: "evening", label: "Evening", start: 20, end: 22 },
  { name: "night", label: "Night", start: 22, end: 24 },
];

const WMO_MAP = {
  0: { label: "Clear \u2600\ufe0f", type: "clear" },
  1: { label: "Mostly Clear", type: "clear" },
  2: { label: "Partly Cloudy \u26c5", type: "cloudy" },
  3: { label: "Overcast \u2601\ufe0f", type: "cloudy" },
  45: { label: "Foggy \ud83c\udf2b\ufe0f", type: "fog" },
  48: { label: "Icy Fog \ud83c\udf2b\ufe0f", type: "fog" },
  51: { label: "Light Drizzle", type: "drizzle" },
  53: { label: "Drizzle \ud83c\udf26\ufe0f", type: "drizzle" },
  55: { label: "Heavy Drizzle", type: "drizzle" },
  61: { label: "Light Rain \ud83c\udf27\ufe0f", type: "rain" },
  63: { label: "Rain \ud83c\udf27\ufe0f", type: "rain" },
  65: { label: "Heavy Rain", type: "rain" },
  71: { label: "Light Snow \ud83c\udf28\ufe0f", type: "snow" },
  73: { label: "Snow \ud83c\udf28\ufe0f", type: "snow" },
  75: { label: "Heavy Snow \u2744\ufe0f", type: "snow" },
  77: { label: "Snow Grains", type: "snow" },
  80: { label: "Showers \ud83c\udf26\ufe0f", type: "rain" },
  81: { label: "Showers \ud83c\udf27\ufe0f", type: "rain" },
  82: { label: "Heavy Showers", type: "rain" },
  85: { label: "Snow Showers \ud83c\udf28\ufe0f", type: "snow" },
  86: { label: "Heavy Snow \u2744\ufe0f", type: "snow" },
  95: { label: "Thunderstorm \u26c8\ufe0f", type: "storm" },
  96: { label: "Hail Storm \u26c8\ufe0f", type: "storm" },
  99: { label: "Heavy Storm \u26c8\ufe0f", type: "storm" },
};

// ── 2. STATE ─────────────────────────────────────────────────

function loadState() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) return JSON.parse(s);
  } catch (e) {
    console.warn("[pikpika] loadState failed:", e);
  }
  return null;
}

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[pikpika] saveState failed:", e);
  }
}

const defaults = {
  name: "Punch",
  hunger: 78,
  energy: 72,
  joy: 80,
  clean: 76,
  theme: "light",
  showWeatherBadge: true,
  starIntensity: "normal",
  locationLat: null,
  locationLon: null,
  locationName: null,
  lastSaved: null,
};

const saved = loadState();
const state = saved ? { ...defaults, ...saved } : { ...defaults };

let currentWeatherType = null;
let currentTimePeriod = null;
let lastFeedTime = 0;

const clamp = (v) => Math.max(0, Math.min(100, v));

// ── 3. DOM REFERENCES ────────────────────────────────────────

const refs = {
  pet: document.getElementById("pet"),
  petStage: document.querySelector(".pet-stage"),
  nameInput: document.getElementById("petName"),
  moodText: document.getElementById("moodText"),
  message: document.getElementById("message"),
  hungerBar: document.getElementById("hungerBar"),
  energyBar: document.getElementById("energyBar"),
  joyBar: document.getElementById("joyBar"),
  cleanBar: document.getElementById("cleanBar"),
  statHunger: document.getElementById("statHunger"),
  statEnergy: document.getElementById("statEnergy"),
  statJoy: document.getElementById("statJoy"),
  statClean: document.getElementById("statClean"),
  renameBtn: document.getElementById("renameBtn"),
  themeToggle: document.getElementById("themeToggle"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsClose: document.getElementById("settingsClose"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  resetBtn: document.getElementById("resetBtn"),
  skyStars: document.getElementById("skyStars"),
  sunEl: document.querySelector(".sky-sun"),
  moonEl: document.querySelector(".sky-moon"),
  sunEl2: document.querySelector(".sky-sun"),
  weatherBadge: document.getElementById("weatherBadge"),
  weatherLayer: document.getElementById("weatherLayer"),
  feedBtn: document.getElementById("feedBtn"),
  appTitle: document.getElementById("appTitle"),
};

// ── FEED BUTTON BORDER RING (SVG arc) ───────────────────────
// Inject a rounded-rect SVG ring that traces the button border.
// Arc sweeps clockwise from top; progress = elapsed fraction.

const NS = "http://www.w3.org/2000/svg";
const feedRingSvg = document.createElementNS(NS, "svg");
feedRingSvg.classList.add("feed-ring-svg");
feedRingSvg.setAttribute("aria-hidden", "true");

const ringTrack = document.createElementNS(NS, "rect");
const ringFill = document.createElementNS(NS, "rect");

function setupRingRect(el, color, opacity) {
  el.setAttribute("x", "1.5");
  el.setAttribute("y", "1.5");
  el.setAttribute("rx", "20.5");
  el.setAttribute("ry", "20.5");
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", color);
  el.setAttribute("stroke-width", "2.5");
  el.setAttribute("stroke-opacity", opacity);
}
setupRingRect(ringTrack, "#ffffff", "0.18");
setupRingRect(ringFill, "#ff9500", "1");
ringFill.setAttribute("stroke-linecap", "round");

feedRingSvg.appendChild(ringTrack);
feedRingSvg.appendChild(ringFill);
refs.feedBtn.appendChild(feedRingSvg);

function updateRingArc(pct) {
  // Measure actual button size each tick (handles reflow)
  const w = refs.feedBtn.offsetWidth;
  const h = refs.feedBtn.offsetHeight;
  feedRingSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  ringTrack.setAttribute("width", w - 3);
  ringTrack.setAttribute("height", h - 3);
  ringFill.setAttribute("width", w - 3);
  ringFill.setAttribute("height", h - 3);
  // Perimeter of the rounded rect (approx)
  const r = 20.5;
  const perim = 2 * (w - 3 - 2 * r + (h - 3 - 2 * r)) + 2 * Math.PI * r;
  const dashLen = perim * pct;
  // Start arc from the top-center: offset = 1/4 of perimeter from start of path
  const offset = perim * 0.25;
  ringFill.setAttribute("stroke-dasharray", `${dashLen} ${perim}`);
  ringFill.setAttribute("stroke-dashoffset", offset);
  // Also set track perimeter
  ringTrack.setAttribute("stroke-dasharray", `${perim}`);
}

let digestTimer = null;
function startDigestCountdown() {
  if (digestTimer) clearInterval(digestTimer);
  refs.feedBtn.classList.add("digesting");
  digestTimer = setInterval(() => {
    const remaining = FEED_COOLDOWN_MS - (Date.now() - lastFeedTime);
    if (remaining <= 0) {
      clearInterval(digestTimer);
      digestTimer = null;
      updateRingArc(0);
      refs.feedBtn.classList.remove("digesting");
      return;
    }
    const elapsed = 1 - remaining / FEED_COOLDOWN_MS;
    updateRingArc(elapsed);
  }, 100);
}

// ── 4. RENDER & UI HELPERS ───────────────────────────────────

function setMessage(text) {
  refs.message.textContent = text;
}

function setBarState(barEl, statEl, value) {
  barEl.style.width = `${value}%`;
  barEl.classList.toggle("warning", value > 0 && value <= 30);
  barEl.classList.toggle("critical", value > 0 && value <= 15);
  if (statEl) statEl.classList.toggle("zero", value === 0);
}

function triggerFlash(type) {
  const el = document.createElement("div");
  el.className = `flash-overlay ${type}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 750);
}

function animatePet() {
  refs.pet.classList.add("bounce");
  setTimeout(() => refs.pet.classList.remove("bounce"), 180);
}

const prevZero = { hunger: false, energy: false, joy: false, clean: false };

function checkZeroCrossings() {
  const checks = [
    {
      key: "hunger",
      cls: "starving",
      flash: "hunger",
      msg: `${state.name} is STARVING! Feed me now! \ud83c\udf4c`,
    },
    {
      key: "energy",
      cls: "exhausted",
      flash: "energy",
      msg: `${state.name} collapsed from exhaustion! \ud83d\ude34`,
    },
    {
      key: "joy",
      cls: "sad",
      flash: "joy",
      msg: `${state.name} is completely miserable... \ud83d\ude22`,
    },
    {
      key: "clean",
      cls: "stinky",
      flash: "clean",
      msg: `${state.name} smells terrible! Give a bath! \ud83e\udd22`,
    },
  ];
  let crisisCount = 0;
  checks.forEach(({ key, cls, flash, msg }) => {
    const isZero = state[key] === 0;
    if (isZero && !prevZero[key]) {
      triggerFlash(flash);
      setMessage(msg);
    }
    prevZero[key] = isZero;
    refs.pet.classList.toggle(cls, isZero);
    if (isZero) crisisCount++;
  });
  const existingStink = refs.pet.querySelectorAll(".stink-line");
  if (state.clean === 0 && existingStink.length === 0) {
    [1, 2, 3].forEach(() => {
      const line = document.createElement("div");
      line.className = "stink-line";
      refs.pet.appendChild(line);
    });
  } else if (state.clean > 0) {
    existingStink.forEach((el) => el.remove());
  }
  refs.petStage.classList.toggle("in-crisis", crisisCount >= 2);
}

function syncPetClasses() {
  const period = currentTimePeriod || "day";
  refs.pet.classList.toggle(
    "is-night",
    period === "night" || period === "latenight",
  );
  refs.pet.classList.toggle("is-dawn", period === "dawn");
}

function render() {
  refs.nameInput.value = state.name;
  refs.appTitle.textContent = state.name;
  refs.moodText.textContent = moodLabel();
  // Defer bar width updates one frame so CSS transition plays from previous value
  requestAnimationFrame(() => {
    setBarState(refs.hungerBar, refs.statHunger, state.hunger);
    setBarState(refs.energyBar, refs.statEnergy, state.energy);
    setBarState(refs.joyBar, refs.statJoy, state.joy);
    setBarState(refs.cleanBar, refs.statClean, state.clean);
    checkZeroCrossings();
  });
  document.documentElement.setAttribute("data-theme", state.theme);
  state.lastSaved = Date.now();
  saveState();
}

// ── 5. ACTIONS ───────────────────────────────────────────────

function applyAction(action) {
  const n = state.name;
  const hour = new Date().getHours();
  const isNight = hour >= 22 || hour < 5;
  const isDaytime = hour >= 10 && hour < 18;
  const wx = currentWeatherType;

  if (action === "feed") {
    const now = Date.now();
    const cooldownLeft = Math.ceil(
      (FEED_COOLDOWN_MS - (now - lastFeedTime)) / 1000,
    );
    if (now - lastFeedTime < FEED_COOLDOWN_MS) {
      setMessage(`${n} turns away \u2014 still digesting! (${cooldownLeft}s)`);
      return;
    }
    if (state.hunger > 80) {
      state.hunger = clamp(state.hunger + 5);
      setMessage(`${n} sniffs the food and takes one bite. Not very hungry.`);
    } else if (state.hunger < 20) {
      state.hunger = clamp(state.hunger + 22);
      state.clean = clamp(state.clean - 10);
      setMessage(
        `${n} snatches the food and devours it frantically! \ud83c\udf4c`,
      );
    } else {
      state.hunger = clamp(state.hunger + 16);
      state.clean = clamp(state.clean - 4);
      setMessage(`${n} grabs a snack and munches happily.`);
    }
    lastFeedTime = now;
  }

  if (action === "play") {
    if (state.energy < 20) {
      setMessage(
        `${n} flops over. Too tired to play right now\u2026 \ud83d\ude34`,
      );
      return;
    }
    const hungerCost = state.hunger < 30 ? 14 : 6;
    const joyGain = isDaytime ? 20 : isNight ? 8 : 14;
    const weatherPenalty =
      wx === "storm" ? 6 : wx === "rain" || wx === "drizzle" ? 3 : 0;
    state.joy = clamp(state.joy + joyGain - weatherPenalty);
    state.energy = clamp(state.energy - 10);
    state.hunger = clamp(state.hunger - hungerCost);
    state.clean = clamp(state.clean - 5);
    if (isNight)
      setMessage(`${n} plays groggily. A bit too dark for full fun\u2026`);
    else if (wx === "storm")
      setMessage(`${n} tries to play but flinches at every thunderclap.`);
    else if (isDaytime)
      setMessage(`${n} leaps around and chatters with delight! \ud83c\udf34`);
    else setMessage(`${n} runs around and chatters with delight.`);
  }

  if (action === "sleep") {
    const isGoodTime = isNight || hour >= 20 || hour < 7;
    const hungerPenalty = state.hunger < 20 ? 0.5 : 1;
    const energyGain = Math.round((isGoodTime ? 24 : 14) * hungerPenalty);
    const joyGain = isGoodTime ? 6 : 2;
    state.energy = clamp(state.energy + energyGain);
    state.joy = clamp(state.joy + joyGain);
    if (!isGoodTime)
      setMessage(
        `${n} naps lightly. Midday sleep isn't as restful\u2026 \ud83d\ude34`,
      );
    else if (state.hunger < 20)
      setMessage(`${n} tries to sleep but a rumbling belly keeps waking them.`);
    else
      setMessage(`${n} curls up and hugs the stuffed orangutan. \ud83c\udf19`);
  }

  if (action === "clean") {
    if (state.clean > 85) {
      setMessage(`${n} squirms away \u2014 already clean enough! \ud83d\ude44`);
      return;
    }
    state.clean = clamp(state.clean + 22);
    state.joy = clamp(state.joy + 4);
    setMessage(`${n} is groomed and fluffy again. \ud83d�`);
  }

  animatePet();
  render();
}

// ── 6. DAY / NIGHT MECHANIC ──────────────────────────────────

for (let i = 0; i < 38; i++) {
  const s = document.createElement("span");
  const hi = (0.35 + Math.random() * 0.25).toFixed(2);
  const lo = (0.15 + Math.random() * 0.12).toFixed(2);
  const dur = (2.8 + Math.random() * 4).toFixed(2);
  const delay = (Math.random() * 6).toFixed(2);
  const size = Math.random() < 0.2 ? "3px" : "2px";
  s.style.cssText = [
    `left:${(Math.random() * 96).toFixed(1)}%`,
    `top:${(Math.random() * 82).toFixed(1)}%`,
    `width:${size}`,
    `height:${size}`,
    `--star-hi:${hi}`,
    `--star-lo:${lo}`,
    `--twinkle-dur:${dur}s`,
    `--twinkle-delay:${delay}s`,
  ].join(";");
  refs.skyStars.appendChild(s);
}

// ── Shooting star scheduler ────────────────────────────────
function spawnShootingStar() {
  const sky = document.querySelector(".sky");
  if (!sky) return;
  const el = document.createElement("div");
  el.className = "shooting-star";
  // Start from upper-left area, travel down-right
  const startX = (5 + Math.random() * 55).toFixed(1);
  const startY = (5 + Math.random() * 40).toFixed(1);
  const dx = (80 + Math.random() * 80).toFixed(0);
  const dy = (30 + Math.random() * 50).toFixed(0);
  const dur = (0.55 + Math.random() * 0.45).toFixed(2);
  const tail = (50 + Math.random() * 60).toFixed(0);
  el.style.cssText = [
    `--ss-x:${startX}%`,
    `--ss-y:${startY}%`,
    `--ss-dx:${dx}px`,
    `--ss-dy:${dy}px`,
    `--ss-dur:${dur}s`,
    `--ss-tail:${tail}px`,
  ].join(";");
  sky.appendChild(el);
  setTimeout(() => el.remove(), parseFloat(dur) * 1000 + 100);
}

function scheduleShootingStar() {
  // Only fire if it's a night period AND weather is clear
  const nightPeriods = ["evening", "night", "latenight"];
  const isNight = nightPeriods.includes(currentTimePeriod);
  const isClear = currentWeatherType === "clear" || currentWeatherType === null;
  if (isNight && isClear) spawnShootingStar();
  // Re-schedule randomly every 18–55 seconds
  setTimeout(scheduleShootingStar, 18000 + Math.random() * 37000);
}
// Kick off after a short delay so state is initialised
setTimeout(scheduleShootingStar, 8000);

function getTimePeriod(hour) {
  return (
    TIME_PERIODS.find((p) => hour >= p.start && hour < p.end) || TIME_PERIODS[0]
  );
}

function orbPosition(hour, minutes) {
  const frac = (hour * 60 + minutes) / (24 * 60);
  return Math.round(4 + frac * 88) + "%";
}

// Returns the correct moon phase emoji based on today's date
function getMoonPhaseEmoji() {
  // Known new moon reference: Jan 6 2000 (J2000 epoch)
  const knownNewMoon = new Date(2000, 0, 6).getTime();
  const lunarCycle = 29.530588853 * 24 * 60 * 60 * 1000; // ms
  const now = Date.now();
  const phase = (((now - knownNewMoon) % lunarCycle) + lunarCycle) % lunarCycle;
  const fraction = phase / lunarCycle; // 0 = new moon, 0.5 = full
  // 8 phases, each ~3.69 days wide
  const index = Math.round(fraction * 8) % 8;
  return [
    "\uD83C\uDF11",
    "\uD83C\uDF12",
    "\uD83C\uDF13",
    "\uD83C\uDF14",
    "\uD83C\uDF15",
    "\uD83C\uDF16",
    "\uD83C\uDF17",
    "\uD83C\uDF18",
  ][index];
}

function getCombinedMessage(period, wx) {
  const n = state.name;
  if ((period === "night" || period === "latenight") && wx === "storm")
    return `\u26c8\ufe0f\ud83c\udf19 Midnight thunder! ${n} is trembling in the dark!`;
  if ((period === "night" || period === "latenight") && wx === "rain")
    return `\ud83c\udf27\ufe0f\ud83c\udf19 Night rain... ${n} curls up tight and tries to sleep.`;
  if ((period === "night" || period === "latenight") && wx === "snow")
    return `\u2744\ufe0f\ud83c\udf19 Silent snowfall \u2014 ${n} peeks out, then burrows back in.`;
  if ((period === "night" || period === "latenight") && wx === "fog")
    return `\ud83c\udf2b\ufe0f\ud83c\udf19 Misty night \u2014 ${n} stares into nothing, ears perked.`;
  if (period === "night" || period === "latenight")
    return `\ud83c\udf19 ${n} yawns and curls up. Time to sleep.`;
  if (period === "dawn" && wx === "rain")
    return `\ud83c\udf04\ud83c\udf27\ufe0f Dawn rain \u2014 ${n} shivers but blinks awake.`;
  if (period === "dawn" && wx === "clear")
    return `\ud83c\udf04 The sun is rising! ${n} stretches long and yawns.`;
  if (period === "dawn" && wx === "snow")
    return `\ud83c\udf04\u2744\ufe0f Fresh snow at dawn \u2014 ${n} presses their nose to the cold air.`;
  if (period === "morning" && wx === "storm")
    return `\u26c8\ufe0f Morning storm! ${n} hugs a branch and waits it out.`;
  if (period === "morning" && wx === "snow")
    return `\ud83c\udf28\ufe0f Morning snow! ${n} cautiously sniffs a snowflake.`;
  if (period === "morning" && wx === "clear")
    return `\u2600\ufe0f Good morning! ${n} chatters cheerfully in the sunlight.`;
  if ((period === "day" || period === "afternoon") && wx === "storm")
    return `\u26c8\ufe0f A storm rolls in \u2014 ${n} scrambles for shelter!`;
  if ((period === "day" || period === "afternoon") && wx === "clear")
    return `\u2600\ufe0f ${n} is full of energy, hopping branch to branch!`;
  if ((period === "day" || period === "afternoon") && wx === "rain")
    return `\ud83c\udf27\ufe0f Afternoon rain. ${n} grumbles and hunches under a leaf.`;
  if (period === "dusk" && wx === "clear")
    return `\ud83c\udf07 ${n} watches the sunset, swaying contentedly.`;
  if (period === "dusk" && wx === "rain")
    return `\ud83c\udf07\ud83c\udf27\ufe0f Rainy dusk \u2014 ${n} is sleepy and soggy.`;
  if (period === "dusk" && wx === "storm")
    return `\ud83c\udf07\u26c8\ufe0f Storm at dusk! ${n} panics and scrambles inside.`;
  if (period === "evening" && wx === "clear")
    return `\ud83c\udf19 ${n} gazes at the first stars, calm and sleepy.`;
  if (period === "evening" && wx === "storm")
    return `\u26c8\ufe0f\ud83c\udf19 Evening thunder \u2014 ${n} jumps at every flash!`;
  return null;
}

let lastPeriodName = null;

const STAGE_PALETTES = {
  latenight: {
    base: "#07060f",
    skyTop: "#0a0818",
    skyBot: "#0d0620",
    ground: "#0e0c20",
    hill: "#090714",
  },
  dawn: {
    base: "#d4a97a",
    skyTop: "#e8925a",
    skyBot: "#f0b880",
    ground: "#9a6e42",
    hill: "#7a5430",
  },
  morning: {
    base: "#b8d8e8",
    skyTop: "#80c0e0",
    skyBot: "#c8e8d0",
    ground: "#5a9a40",
    hill: "#408030",
  },
  day: {
    base: "#90c8f0",
    skyTop: "#4ab0f0",
    skyBot: "#a0d0e8",
    ground: "#4a9830",
    hill: "#387020",
  },
  afternoon: {
    base: "#a0cce0",
    skyTop: "#60b8e8",
    skyBot: "#b8d8d0",
    ground: "#589838",
    hill: "#407828",
  },
  dusk: {
    base: "#c87840",
    skyTop: "#d05820",
    skyBot: "#d88040",
    ground: "#8a4820",
    hill: "#6a3415",
  },
  evening: {
    base: "#1a1440",
    skyTop: "#1e1850",
    skyBot: "#281840",
    ground: "#160f38",
    hill: "#100b28",
  },
  night: {
    base: "#0c0a22",
    skyTop: "#0e0c2e",
    skyBot: "#130a28",
    ground: "#0c0a22",
    hill: "#080618",
  },
};

function updateStageBackground(periodName) {
  const p = STAGE_PALETTES[periodName] || STAGE_PALETTES.day;
  const stage = refs.petStage;
  stage.style.background = [
    `radial-gradient(ellipse 160% 45% at 50% 110%, ${p.hill} 0%, transparent 65%)`,
    `radial-gradient(ellipse 180% 35% at 50% 118%, ${p.ground} 0%, transparent 60%)`,
    `linear-gradient(180deg, ${p.skyTop} 0%, ${p.skyBot} 100%)`,
    p.base,
  ].join(", ");
}

function updateDayNight() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const period = getTimePeriod(hour);

  document.documentElement.setAttribute("data-time", period.name);
  checkPeriodWakeUp(period.name);
  currentTimePeriod = period.name;
  syncPetClasses();
  updateStageBackground(period.name);

  const pos = orbPosition(hour, minute);
  refs.sunEl.style.left = pos;
  refs.moonEl.style.left = pos;
  refs.moonEl.textContent = getMoonPhaseEmoji();
  refs.timeBadge.textContent = period.label;

  if (period.name !== lastPeriodName) {
    lastPeriodName = period.name;
    const combined = getCombinedMessage(period.name, currentWeatherType);
    if (combined) setMessage(combined);
  }
}

// ── 7. WEATHER MECHANIC ──────────────────────────────────────

function applyWeatherToUI(code, temp) {
  const entry = WMO_MAP[code] || { label: "Unknown", type: null };
  currentWeatherType = entry.type;
  refs.weatherBadge.textContent = `${entry.label} ${temp !== null ? temp + "\u00b0C" : ""}`;
  refs.weatherLayer.className = "weather-layer";
  if (entry.type) refs.weatherLayer.classList.add(`wx-${entry.type}`);
}

async function fetchWeatherForCoords(lat, lon) {
  const wx = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=celsius`,
  ).then((r) => r.json());
  const code = wx.current.weather_code;
  const temp = Math.round(wx.current.temperature_2m);
  applyWeatherToUI(code, temp);
  const combined = getCombinedMessage(currentTimePeriod, currentWeatherType);
  if (combined) setMessage(combined);
}

function updateLocationLabel() {
  const el = document.getElementById("locationLabel");
  if (!el) return;
  if (state.locationName) {
    el.textContent = state.locationName;
  } else if (state.locationLat !== null) {
    el.textContent = `${Number(state.locationLat).toFixed(2)}, ${Number(state.locationLon).toFixed(2)}`;
  } else {
    el.textContent = "Not set";
  }
}

async function initWeather() {
  // Use saved coords if available — no permission prompt needed
  if (state.locationLat !== null && state.locationLon !== null) {
    try {
      await fetchWeatherForCoords(state.locationLat, state.locationLon);
    } catch (e) {
      console.warn("[pikpika] fetchWeather (saved coords) failed:", e);
      refs.weatherBadge.textContent = "";
    }
    return;
  }
  // Only use IP fallback if the user has never set a location at all.
  // Check both the live state AND localStorage directly so a failed
  // loadState() parse doesn't incorrectly trigger the overwrite.
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const persisted = raw ? JSON.parse(raw) : null;
    if (persisted?.locationLat != null) {
      // loadState() must have failed — restore coords from raw parse
      state.locationLat = persisted.locationLat;
      state.locationLon = persisted.locationLon;
      state.locationName = persisted.locationName ?? null;
      updateLocationLabel();
      await fetchWeatherForCoords(state.locationLat, state.locationLon);
      return;
    }
  } catch (e) {
    console.warn("[pikpika] initWeather raw-parse fallback failed:", e);
  }
  // No location ever set — fall back to IP geolocation
  try {
    const geo = await fetch("https://ipapi.co/json/").then((r) => r.json());
    const { latitude: lat, longitude: lon, city } = geo;
    if (!lat || !lon) throw new Error("no coords");
    state.locationLat = lat;
    state.locationLon = lon;
    state.locationName = city || null;
    saveState();
    updateLocationLabel();
    await fetchWeatherForCoords(lat, lon);
  } catch (e) {
    console.warn("[pikpika] IP geolocation fallback failed:", e);
    refs.weatherBadge.textContent = "";
  }
}

// ── 8. EVENT LISTENERS ───────────────────────────────────────

function openSettings() {
  refs.settingsBackdrop.classList.add("open");
  refs.settingsBackdrop.setAttribute("aria-hidden", "false");
  refs.nameInput.value = state.name;
  refs.themeToggle.setAttribute(
    "aria-checked",
    state.theme === "dark" ? "true" : "false",
  );
  updateLocationLabel();
}
function closeSettings() {
  const modal = refs.settingsBackdrop.querySelector(".modal");
  if (modal) {
    modal.style.transition =
      "transform 220ms cubic-bezier(0.4, 0, 1, 1), opacity 180ms ease";
    modal.style.transform = "translateY(100%) scale(0.97)";
    modal.style.opacity = "0";
    setTimeout(() => {
      refs.settingsBackdrop.classList.remove("open");
      refs.settingsBackdrop.setAttribute("aria-hidden", "true");
      modal.style.transition = "";
      modal.style.transform = "";
      modal.style.opacity = "";
    }, 220);
  } else {
    refs.settingsBackdrop.classList.remove("open");
    refs.settingsBackdrop.setAttribute("aria-hidden", "true");
  }
}

refs.settingsBtn.addEventListener("click", openSettings);
refs.settingsClose.addEventListener("click", closeSettings);
refs.settingsBackdrop.addEventListener("click", (e) => {
  if (e.target === refs.settingsBackdrop) closeSettings();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSettings();
});

refs.renameBtn.addEventListener("click", () => {
  const next = refs.nameInput.value.trim();
  if (!next) {
    setMessage("Your monkey is waiting for a proper name.");
    return;
  }
  state.name = next;
  saveState();
  setMessage(`${state.name} blinks curiously. Name updated.`);
  render();
  closeSettings();
});

refs.themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  refs.themeToggle.setAttribute(
    "aria-checked",
    state.theme === "dark" ? "true" : "false",
  );
  render();
  saveState();
});

function applyStarIntensity() {
  refs.skyStars.setAttribute("data-stars", state.starIntensity);
  document.querySelectorAll(".star-intensity-btn").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.dataset.intensity === state.starIntensity,
    );
  });
  saveState();
}

function applyBadgePrefs() {
  refs.weatherBadge.style.display = state.showWeatherBadge ? "" : "none";
  document
    .getElementById("weatherBadgeToggle")
    .setAttribute("aria-checked", state.showWeatherBadge ? "true" : "false");
  saveState();
}

// Location: GPS button
document.getElementById("geoLocateBtn").addEventListener("click", () => {
  const btn = document.getElementById("geoLocateBtn");
  btn.textContent = "📍 Locating…";
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      state.locationLat = lat;
      state.locationLon = lon;
      // Reverse-geocode city name via Open-Meteo geocoding
      try {
        const rg = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        ).then((r) => r.json());
        state.locationName =
          rg.address?.city || rg.address?.town || rg.address?.village || null;
      } catch (_) {}
      saveState();
      updateLocationLabel();
      btn.textContent = "✓ Location saved";
      btn.disabled = false;
      fetchWeatherForCoords(lat, lon).catch(() => {});
    },
    () => {
      btn.textContent = "📍 Use my current location";
      btn.disabled = false;
      alert("Location access denied. Try setting a city name manually above.");
    },
  );
});

// Location: city name search
document.getElementById("citySearchBtn").addEventListener("click", async () => {
  const query = document.getElementById("cityInput").value.trim();
  if (!query) return;
  const btn = document.getElementById("citySearchBtn");
  btn.textContent = "…";
  try {
    const results = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`,
    ).then((r) => r.json());
    const place = results.results?.[0];
    if (!place) throw new Error("not found");
    state.locationLat = place.latitude;
    state.locationLon = place.longitude;
    state.locationName =
      place.name + (place.country ? `, ${place.country}` : "");
    saveState();
    updateLocationLabel();
    document.getElementById("cityInput").value = "";
    btn.textContent = "✓";
    setTimeout(() => (btn.textContent = "Set"), 1500);
    fetchWeatherForCoords(place.latitude, place.longitude).catch(() => {});
  } catch (e) {
    btn.textContent = "Set";
    alert(`City "${query}" not found. Try a different spelling.`);
  }
});

document.getElementById("cityInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("citySearchBtn").click();
});

document.getElementById("weatherBadgeToggle").addEventListener("click", () => {
  state.showWeatherBadge = !state.showWeatherBadge;
  applyBadgePrefs();
});

document.querySelectorAll(".star-intensity-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.starIntensity = btn.dataset.intensity;
    applyStarIntensity();
    applyAnimSettings(); // sync particle scale + idle cadence to new intensity
    saveState();
  });
});

refs.resetBtn.addEventListener("click", () => {
  if (!confirm("Reset everything and start fresh? This cannot be undone."))
    return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
  Object.assign(state, { ...defaults, lastSaved: null });
  lastFeedTime = 0;
  setMessage(
    `${state.name} arrives, blinking in the light. A fresh start! \ud83c\udf31`,
  );
  render();
  updateLocationLabel();
  closeSettings();
});

refs.feedBtn.addEventListener("click", () => {
  checkInteractionWakeUp();
  const before = lastFeedTime;
  applyAction("feed");
  triggerAnim("action-munch", 850);
  lockIdleForDuration(850);
  if (lastFeedTime !== before) startDigestCountdown();
});

document
  .querySelectorAll("[data-action]:not([data-action='feed'])")
  .forEach((btn) => {
    btn.addEventListener("click", () => {
      checkInteractionWakeUp();
      applyAction(btn.dataset.action);
      if (btn.dataset.action === "play") {
        triggerAnim("action-excited", 900);
        lockIdleForDuration(900);
        spawnStars(7);
      }
      if (btn.dataset.action === "sleep") {
        triggerAnim("action-yawn", 1350);
        lockIdleForDuration(1350);
        spawnZzz(3);
      }
      if (btn.dataset.action === "clean") {
        triggerAnim("action-blink", 750);
        lockIdleForDuration(750);
        spawnBubbles(10);
      }
    });
  });

// ── 9. BOOT SEQUENCE ─────────────────────────────────────────

// Init extracted modules first
initSimulation({
  state,
  clamp,
  getWeatherType: () => currentWeatherType,
  DRIFT_INTERVAL_MS,
});
initAnimations({ state, petEl: refs.pet, stageEl: refs.petStage, setMessage });
setDriftTickCallback(() => {
  render();
  checkEnergyWakeUp();
});
registerVisibilityWakeUp(
  () => state,
  () => state.lastSaved,
);
startIdleScheduler();

// Apply offline drift
if (state.lastSaved) {
  applyOfflineDrift();
  const secondsAway = Math.floor((Date.now() - state.lastSaved) / 1000);
  if (secondsAway > 60) {
    const mins = Math.floor(secondsAway / 60);
    setMessage(
      `${state.name} missed you! You were away for ${mins} minute${mins !== 1 ? "s" : ""}.`,
    );
  }
}

refs.themeToggle.setAttribute(
  "aria-checked",
  state.theme === "dark" ? "true" : "false",
);

applyBadgePrefs();
applyStarIntensity();
render();
updateLocationLabel(); // restore label from saved state on every boot
updateDayNight();
setInterval(updateDayNight, 60 * 1000);
setInterval(driftStats, DRIFT_INTERVAL_MS);
initWeather();
