const SAVE_KEY = "punch_tamagotchi_save";

function loadState() {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return null;
}

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {}
}

const defaults = {
  name: "Punch",
  hunger: 78,
  energy: 72,
  joy: 80,
  clean: 76,
  theme: "light",
  lastSaved: null,
};

const saved = loadState();
const state = saved ? { ...defaults, ...saved } : { ...defaults };

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
  renameBtn: document.getElementById("renameBtn"),
  themeToggle: document.getElementById("themeToggle"),
  statHunger: document.getElementById("statHunger"),
  statEnergy: document.getElementById("statEnergy"),
  statJoy: document.getElementById("statJoy"),
  statClean: document.getElementById("statClean"),
};

const clamp = (value) => Math.max(0, Math.min(100, value));

// Global state for cross-system references (declared early to avoid ReferenceErrors)
let currentWeatherType = null;
let currentTimePeriod  = null;

// DOM refs for weather — declared here so all functions can access them
const weatherBadge = document.getElementById("weatherBadge");
const weatherLayer = document.getElementById("weatherLayer");

// Feed cooldown
let lastFeedTime = 0;
const FEED_COOLDOWN_MS = 30000;

function setMessage(text) {
  refs.message.textContent = text;
}

// ── MOOD: granular 7-state system ──
function moodLabel() {
  const { hunger, energy, joy, clean } = state;
  const hour = new Date().getHours();
  const isNight = hour >= 22 || hour < 5;

  // Crisis states first
  if (hunger <= 10 && energy <= 10) return "Desperate";
  if (hunger <= 15 || energy <= 15)  return "Struggling";

  // Stress from weather
  if (currentWeatherType === "storm" && joy < 50) return "Stressed";

  // Social loneliness at night
  if (isNight && joy < 40) return "Lonely";

  // Energy-joy combos
  if (energy > 70 && joy < 35)  return "Restless";
  if (joy > 60 && hunger < 30)  return "Hungry but Happy";
  if (energy < 25 && joy > 50)  return "Sleepy";
  if (clean === 0)               return "Uncomfortable";

  // General wellbeing
  const avg = (hunger + energy + joy + clean) / 4;
  if (avg > 82) return "Thriving";
  if (avg > 65) return "Content";
  if (avg > 45) return "Okay";
  return "Needs Attention";
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

const prevZero = { hunger: false, energy: false, joy: false, clean: false };

function checkZeroCrossings() {
  const checks = [
    {
      key: "hunger",
      cls: "starving",
      flash: "hunger",
      msg: `${state.name} is STARVING! Feed me now! 🍌`,
    },
    {
      key: "energy",
      cls: "exhausted",
      flash: "energy",
      msg: `${state.name} collapsed from exhaustion! 😴`,
    },
    {
      key: "joy",
      cls: "sad",
      flash: "joy",
      msg: `${state.name} is completely miserable... 😢`,
    },
    {
      key: "clean",
      cls: "stinky",
      flash: "clean",
      msg: `${state.name} smells terrible! Give a bath! 🤢`,
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

  // Stink lines: add/remove
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

function render() {
  refs.nameInput.value = state.name;
  refs.moodText.textContent = moodLabel();
  setBarState(refs.hungerBar, refs.statHunger, state.hunger);
  setBarState(refs.energyBar, refs.statEnergy, state.energy);
  setBarState(refs.joyBar, refs.statJoy, state.joy);
  setBarState(refs.cleanBar, refs.statClean, state.clean);
  checkZeroCrossings();
  document.documentElement.setAttribute("data-theme", state.theme);
  state.lastSaved = Date.now();
  saveState();
}

function animatePet() {
  refs.pet.classList.add("bounce");
  setTimeout(() => refs.pet.classList.remove("bounce"), 180);
}

function applyAction(action) {
  const n = state.name;
  const hour = new Date().getHours();
  const isNight   = hour >= 22 || hour < 5;
  const isDaytime = hour >= 10 && hour < 18;
  const wx = currentWeatherType;

  if (action === "feed") {
    const now = Date.now();
    const cooldownLeft = Math.ceil((FEED_COOLDOWN_MS - (now - lastFeedTime)) / 1000);
    if (now - lastFeedTime < FEED_COOLDOWN_MS) {
      setMessage(`${n} turns away — still digesting! (${cooldownLeft}s)`);
      return;
    }
    if (state.hunger > 80) {
      state.hunger = clamp(state.hunger + 5);
      setMessage(`${n} sniffs the food and takes one bite. Not very hungry.`);
    } else if (state.hunger < 20) {
      state.hunger = clamp(state.hunger + 22);
      state.clean  = clamp(state.clean - 10);
      setMessage(`${n} snatches the food and devours it frantically! 🍌`);
    } else {
      state.hunger = clamp(state.hunger + 16);
      state.clean  = clamp(state.clean - 4);
      setMessage(`${n} grabs a snack and munches happily.`);
    }
    lastFeedTime = now;
  }

  if (action === "play") {
    if (state.energy < 20) {
      setMessage(`${n} flops over. Too tired to play right now… 😴`);
      return;
    }
    const hungerCost = state.hunger < 30 ? 14 : 6;
    const joyGain = isDaytime ? 20 : isNight ? 8 : 14;
    const weatherPenalty = (wx === "storm") ? 6 : (wx === "rain" || wx === "drizzle") ? 3 : 0;
    state.joy    = clamp(state.joy + joyGain - weatherPenalty);
    state.energy = clamp(state.energy - 10);
    state.hunger = clamp(state.hunger - hungerCost);
    state.clean  = clamp(state.clean - 5);
    if (isNight)
      setMessage(`${n} plays groggily. A bit too dark for full fun…`);
    else if (wx === "storm")
      setMessage(`${n} tries to play but flinches at every thunderclap.`);
    else if (isDaytime)
      setMessage(`${n} leaps around and chatters with delight! 🌴`);
    else
      setMessage(`${n} runs around and chatters with delight.`);
  }

  if (action === "sleep") {
    const isGoodSleepTime = isNight || hour >= 20 || hour < 7;
    const hungerPenalty = state.hunger < 20 ? 0.5 : 1;
    const energyGain = Math.round((isGoodSleepTime ? 24 : 14) * hungerPenalty);
    const joyGain    = isGoodSleepTime ? 6 : 2;
    state.energy = clamp(state.energy + energyGain);
    state.joy    = clamp(state.joy + joyGain);
    if (!isGoodSleepTime)
      setMessage(`${n} naps lightly. Midday sleep isn’t as restful… 😴`);
    else if (state.hunger < 20)
      setMessage(`${n} tries to sleep but a rumbling belly keeps waking them.`);
    else
      setMessage(`${n} curls up and hugs the stuffed orangutan. 🌙`);
  }

  if (action === "clean") {
    if (state.clean > 85) {
      setMessage(`${n} squirms away — already clean enough! 🙄`);
      return;
    }
    state.clean = clamp(state.clean + 22);
    state.joy   = clamp(state.joy + 4);
    setMessage(`${n} is groomed and fluffy again. 👌`);
  }

  animatePet();
  render();
}

// ── REALISTIC DRIFT ENGINE ──
// Returns a drift delta object based on time-of-day, weather, and stat interdependencies.
// All values are per-tick (tick = 12s live, scaled for offline).
function computeDriftDeltas(hour, wx) {
  const isNight     = hour >= 22 || hour < 5;
  const isDawn      = hour >= 5  && hour < 7;
  const isMorning   = hour >= 7  && hour < 10;
  const isDaytime   = hour >= 10 && hour < 15;
  const isAfternoon = hour >= 15 && hour < 18;
  const isDusk      = hour >= 18 && hour < 20;
  const isEvening   = hour >= 20 && hour < 22;

  // Base rates
  let dH = -3;  // hunger drain
  let dE = -2;  // energy drain (negative = drain, positive = regen)
  let dJ = -2;  // joy drain
  let dC = -1;  // clean drain

  // ── TIME OF DAY modifiers ──
  if (isNight) {
    // Macaques sleep at night: energy regens, hunger barely moves
    dE = +1.5;   // slow natural energy recovery
    dH = -0.8;   // metabolism slows asleep
    dJ = -0.5;   // joy stable
    dC = -0.3;
  } else if (isDawn) {
    dH = -3.5;   // wake-up hunger spike
    dE = -1;     // still groggy
    dJ = -1;
  } else if (isMorning) {
    dH = -4;     // active foraging period: hunger spikes
    dE = -2.5;
    dJ = -1.5;
  } else if (isDaytime) {
    dH = -3;     // normal active period
    dE = -2.5;
    dJ = -2;     // social species: needs stimulation
  } else if (isAfternoon) {
    dH = -2.5;
    dE = -2;
    dJ = -1.5;
  } else if (isDusk) {
    dH = -2;     // winding down
    dE = -1.5;
    dJ = -1;
  } else if (isEvening) {
    dH = -1.5;
    dE = -1;
    dJ = -0.8;
  }

  // ── WEATHER modifiers ──
  if (wx === "storm") {
    dJ -= 3;     // storms stress macaques heavily
    dE -= 1;     // stress burns energy
    dH -= 1;     // stress eating
  } else if (wx === "rain" || wx === "drizzle") {
    dJ -= 1.5;
    dE -= 0.5;
  } else if (wx === "snow") {
    dH -= 1;     // cold = more calories burned
    dE -= 1;     // shivering costs energy
    dJ -= 0.5;
  } else if (wx === "fog") {
    dJ -= 0.5;   // disorienting
  } else if (wx === "clear") {
    if (isDaytime || isAfternoon) {
      dJ += 1;   // sunny days passively boost mood
    }
  }

  // ── STAT INTERDEPENDENCIES ──
  // Starving = energy drains faster
  if (state.hunger < 25) dE -= 1.5;
  // Exhausted = joy drains faster (cranky)
  if (state.energy < 20) dJ -= 1.5;
  // Dirty = joy drains faster (discomfort)
  if (state.clean < 20)  dJ -= 1;
  // Miserable = hunger spikes (stress eating)
  if (state.joy < 20)    dH -= 1;
  // Night alone: social species loses joy faster
  if (isNight && state.joy < 50) dJ -= 0.5;

  return { dH, dE, dJ, dC };
}

function applyOfflineDrift() {
  if (!state.lastSaved) return;
  const elapsed = Math.floor((Date.now() - state.lastSaved) / 12000);
  if (elapsed <= 0) return;
  const ticks = Math.min(elapsed, 120);
  // Use current hour as approximation for offline period
  const hour = new Date().getHours();
  const { dH, dE, dJ, dC } = computeDriftDeltas(hour, null);
  state.hunger = clamp(state.hunger + dH * ticks);
  state.energy = clamp(state.energy + dE * ticks);
  state.joy    = clamp(state.joy    + dJ * ticks);
  state.clean  = clamp(state.clean  + dC * ticks);
}

function driftStats() {
  const hour = new Date().getHours();
  const { dH, dE, dJ, dC } = computeDriftDeltas(hour, currentWeatherType);
  state.hunger = clamp(state.hunger + dH);
  state.energy = clamp(state.energy + dE);
  state.joy    = clamp(state.joy    + dJ);
  state.clean  = clamp(state.clean  + dC);
  render();
}

refs.renameBtn.addEventListener("click", () => {
  const next = refs.nameInput.value.trim();
  if (!next) {
    setMessage("Your monkey is waiting for a proper name.");
    return;
  }
  state.name = next;
  setMessage(`${state.name} blinks curiously. Name updated.`);
  render();
});

// Note: [data-action] button listeners are set up below, after the digest countdown UI is ready.

refs.themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "light" ? "dark" : "light";
  render();
});

// Apply stat decay for time spent away
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

setInterval(driftStats, 12000);
render();

// ── DIGESTION COUNTDOWN UI ──
const feedBtn       = document.getElementById("feedBtn");
const digestFill    = feedBtn.querySelector(".digest-ring-fill");
const digestCountEl = document.getElementById("digestCountdown");
const CIRC = 100; // matches stroke-dasharray
let digestInterval  = null;

function startDigestCountdown() {
  if (digestInterval) clearInterval(digestInterval);
  feedBtn.classList.add("digesting");
  feedBtn.classList.remove("digest-ready");

  function tick() {
    const remaining = Math.max(0, FEED_COOLDOWN_MS - (Date.now() - lastFeedTime));
    const secs      = Math.ceil(remaining / 1000);
    const progress  = remaining / FEED_COOLDOWN_MS; // 1.0 → 0.0
    digestFill.style.strokeDashoffset = (progress * CIRC).toFixed(1);
    digestCountEl.textContent = secs > 0 ? secs + "s" : "";
    if (remaining <= 0) {
      clearInterval(digestInterval);
      digestInterval = null;
      feedBtn.classList.remove("digesting");
      feedBtn.classList.add("digest-ready");
      digestCountEl.textContent = "";
      setTimeout(() => feedBtn.classList.remove("digest-ready"), 1500);
    }
  }

  tick();
  digestInterval = setInterval(tick, 1000);
}

// Wire all action buttons directly — no cloning needed
feedBtn.addEventListener("click", () => {
  const before = lastFeedTime;
  applyAction("feed");
  if (lastFeedTime !== before) startDigestCountdown();
});
document.querySelectorAll("[data-action]:not([data-action='feed'])").forEach(btn => {
  btn.addEventListener("click", () => applyAction(btn.dataset.action));
});

// ── DAY / NIGHT MECHANIC ──────────────────────────────────────────

const TIME_PERIODS = [
  { name: "latenight", label: "Late Night", start: 0,  end: 5  },
  { name: "dawn",      label: "Dawn",       start: 5,  end: 7  },
  { name: "morning",   label: "Morning",    start: 7,  end: 10 },
  { name: "day",       label: "Daytime",    start: 10, end: 15 },
  { name: "afternoon", label: "Afternoon",  start: 15, end: 18 },
  { name: "dusk",      label: "Dusk",       start: 18, end: 20 },
  { name: "evening",   label: "Evening",    start: 20, end: 22 },
  { name: "night",     label: "Night",      start: 22, end: 24 },
];

// Random stars — generate once
const skyStarsEl = document.getElementById("skyStars");
for (let i = 0; i < 28; i++) {
  const s = document.createElement("span");
  s.style.left = Math.random() * 96 + "%";
  s.style.top  = Math.random() * 80 + "%";
  s.style.opacity = (0.4 + Math.random() * 0.6).toFixed(2);
  skyStarsEl.appendChild(s);
}

const sunEl   = document.querySelector(".sky-sun");
const moonEl  = document.querySelector(".sky-moon");
const badgeEl = document.getElementById("timeBadge");

function getTimePeriod(hour) {
  return TIME_PERIODS.find(p => hour >= p.start && hour < p.end) || TIME_PERIODS[0];
}

// Map hour 0-24 → left % position across the sky strip
function orbPosition(hour, minutes) {
  const frac = (hour * 60 + minutes) / (24 * 60);
  // arc: rises from left edge, peaks at centre, sets at right
  return Math.round(4 + frac * 88) + "%";
}

let lastPeriodName = null;

// Combined time+weather message matrix
function getCombinedMessage(period, wx) {
  const n = state.name;
  // Night combos
  if ((period === "night" || period === "latenight") && wx === "storm")
    return `⛈️🌙 Midnight thunder! ${n} is trembling in the dark!`;
  if ((period === "night" || period === "latenight") && wx === "rain")
    return `🌧️🌙 Night rain... ${n} curls up tight and tries to sleep.`;
  if ((period === "night" || period === "latenight") && wx === "snow")
    return `❄️🌙 Silent snowfall — ${n} peeks out, then burrows back in.`;
  if ((period === "night" || period === "latenight") && wx === "fog")
    return `🌫️🌙 Misty night — ${n} stares into nothing, ears perked.`;
  if ((period === "night" || period === "latenight") && (wx === "clear" || !wx))
    return `🌙 ${n} yawns and curls up. Time to sleep.`;
  // Dawn combos
  if (period === "dawn" && wx === "rain")
    return `🌄🌧️ Dawn rain — ${n} shivers but blinks awake.`;
  if (period === "dawn" && wx === "clear")
    return `🌄 The sun is rising! ${n} stretches long and yawns.`;
  if (period === "dawn" && wx === "snow")
    return `🌄❄️ Fresh snow at dawn — ${n} presses their nose to the cold air.`;
  // Morning combos
  if (period === "morning" && wx === "storm")
    return `⛈️ Morning storm! ${n} hugs a branch and waits it out.`;
  if (period === "morning" && wx === "snow")
    return `🌨️ Morning snow! ${n} cautiously sniffs a snowflake.`;
  if (period === "morning" && wx === "clear")
    return `☀️ Good morning! ${n} chatters cheerfully in the sunlight.`;
  // Day combos
  if ((period === "day" || period === "afternoon") && wx === "storm")
    return `⛈️ A storm rolls in — ${n} scrambles for shelter!`;
  if ((period === "day" || period === "afternoon") && wx === "clear")
    return `☀️ ${n} is full of energy, hopping branch to branch!`;
  if ((period === "day" || period === "afternoon") && wx === "rain")
    return `🌧️ Afternoon rain. ${n} grumbles and hunches under a leaf.`;
  // Dusk combos
  if (period === "dusk" && wx === "clear")
    return `🌇 ${n} watches the sunset, swaying contentedly.`;
  if (period === "dusk" && wx === "rain")
    return `🌇🌧️ Rainy dusk — ${n} is sleepy and soggy.`;
  if (period === "dusk" && wx === "storm")
    return `🌇⛈️ Storm at dusk! ${n} panics and scrambles inside.`;
  // Evening combos
  if (period === "evening" && wx === "clear")
    return `🌙 ${n} gazes at the first stars, calm and sleepy.`;
  if (period === "evening" && wx === "storm")
    return `⛈️🌙 Evening thunder — ${n} jumps at every flash!`;
  return null; // no special combo, use default
}

function updateDayNight() {
  const now    = new Date();
  const hour   = now.getHours();
  const minute = now.getMinutes();
  const period = getTimePeriod(hour);

  document.documentElement.setAttribute("data-time", period.name);

  // Stamp time class on pet and re-sync combined CSS
  currentTimePeriod = period.name;
  syncPetClasses();

  // Move orbs
  const pos = orbPosition(hour, minute);
  sunEl.style.left  = pos;
  moonEl.style.left = pos;

  badgeEl.textContent = period.label;

  // Emit combined message once per period transition
  if (period.name !== lastPeriodName) {
    const combo = getCombinedMessage(period.name, currentWeatherType);
    if (combo) setMessage(combo);
    lastPeriodName = period.name;
  }
}

updateDayNight();
setInterval(updateDayNight, 60 * 1000);

// ── WEATHER MECHANIC ─────────────────────────────────────────────

// WMO weather code → { label, type }
// type: clear | cloudy | fog | drizzle | rain | snow | storm
const WMO_MAP = {
  0:  { label: "Clear ☀️",        type: "clear"   },
  1:  { label: "Mostly Clear",    type: "clear"   },
  2:  { label: "Partly Cloudy ⛅", type: "cloudy"  },
  3:  { label: "Overcast ☁️",     type: "cloudy"  },
  45: { label: "Foggy 🌫️",        type: "fog"     },
  48: { label: "Icy Fog 🌫️",      type: "fog"     },
  51: { label: "Light Drizzle",   type: "drizzle" },
  53: { label: "Drizzle 🌦️",      type: "drizzle" },
  55: { label: "Heavy Drizzle",   type: "drizzle" },
  61: { label: "Light Rain 🌧️",   type: "rain"    },
  63: { label: "Rain 🌧️",         type: "rain"    },
  65: { label: "Heavy Rain",      type: "rain"    },
  71: { label: "Light Snow 🌨️",   type: "snow"    },
  73: { label: "Snow 🌨️",         type: "snow"    },
  75: { label: "Heavy Snow ❄️",   type: "snow"    },
  77: { label: "Snow Grains",     type: "snow"    },
  80: { label: "Showers 🌦️",      type: "rain"    },
  81: { label: "Showers 🌧️",      type: "rain"    },
  82: { label: "Heavy Showers",   type: "rain"    },
  85: { label: "Snow Showers 🌨️", type: "snow"    },
  86: { label: "Heavy Snow ❄️",   type: "snow"    },
  95: { label: "Thunderstorm ⛈️", type: "storm"   },
  96: { label: "Hail Storm ⛈️",   type: "storm"   },
  99: { label: "Heavy Storm ⛈️",  type: "storm"   },
};

function clearWeatherLayer() {
  weatherLayer.innerHTML = "";
  // Remove fog
  const fog = document.querySelector(".fog-layer");
  if (fog) fog.remove();
}

function spawnRain(intensity) {
  // intensity: 1=drizzle 2=rain 3=storm
  const count = intensity === 1 ? 18 : intensity === 2 ? 38 : 60;
  for (let i = 0; i < count; i++) {
    const drop = document.createElement("div");
    drop.className = "raindrop";
    const h = 8 + Math.random() * 14;
    drop.style.left     = Math.random() * 100 + "%";
    drop.style.height   = h + "px";
    drop.style.animationDuration  = (0.35 + Math.random() * 0.4) + "s";
    drop.style.animationDelay     = (Math.random() * 0.8) + "s";
    drop.style.opacity  = (0.4 + Math.random() * 0.5).toFixed(2);
    weatherLayer.appendChild(drop);
  }
}

function spawnSnow() {
  for (let i = 0; i < 28; i++) {
    const flake = document.createElement("div");
    flake.className = "snowflake";
    const size = 2 + Math.random() * 4;
    flake.style.left   = Math.random() * 100 + "%";
    flake.style.width  = size + "px";
    flake.style.height = size + "px";
    flake.style.setProperty("--drift", (Math.random() * 20 - 10) + "px");
    flake.style.animationDuration = (1.2 + Math.random() * 1.8) + "s";
    flake.style.animationDelay    = (Math.random() * 2) + "s";
    weatherLayer.appendChild(flake);
  }
}

function spawnClouds(count) {
  for (let i = 0; i < count; i++) {
    const cloud = document.createElement("div");
    cloud.className = "cloud";
    const w = 55 + Math.random() * 50;
    cloud.style.width  = w + "px";
    cloud.style.height = (w * 0.35) + "px";
    cloud.style.top    = (8 + Math.random() * 48) + "px";
    cloud.style.animationDuration = (18 + Math.random() * 20) + "s";
    cloud.style.animationDelay    = -(Math.random() * 20) + "s";
    cloud.style.opacity = (0.5 + Math.random() * 0.4).toFixed(2);
    weatherLayer.appendChild(cloud);
  }
}

function spawnFog() {
  const fog = document.createElement("div");
  fog.className = "fog-layer";
  document.querySelector(".sky").appendChild(fog);
}

let thunderTimer = null;
function startThunder() {
  function flash() {
    const el = document.createElement("div");
    el.className = "lightning-flash";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 250);
  }
  // Flash randomly every 4-12 seconds
  function schedule() {
    const delay = 4000 + Math.random() * 8000;
    thunderTimer = setTimeout(() => { flash(); schedule(); }, delay);
  }
  schedule();
}

function stopThunder() {
  if (thunderTimer) { clearTimeout(thunderTimer); thunderTimer = null; }
}

// All classes that can be on .pet from weather or time
const WEATHER_PET_CLASSES = ["weather-rain","weather-snow","weather-storm","weather-clear","weather-fog"];
const TIME_PET_CLASSES    = TIME_PERIODS.map(p => "time-" + p.name);

function syncPetClasses() {
  // Remove all weather + time classes, then re-apply current ones
  WEATHER_PET_CLASSES.forEach(c => refs.pet.classList.remove(c));
  TIME_PET_CLASSES.forEach(c => refs.pet.classList.remove(c));
  if (currentWeatherType) refs.pet.classList.add("weather-" + currentWeatherType);
  if (currentTimePeriod)  refs.pet.classList.add("time-" + currentTimePeriod);
}

function setPetWeatherClass(type) {
  currentWeatherType = type || null;
  syncPetClasses();
}

// Spawn a raindrop/snowflake on the monkey itself
let furParticleTimer = null;
function startFurParticles(type) {
  stopFurParticles();
  function spawn() {
    // pick a random spot on the head or body
    const el = document.createElement("div");
    el.className = type === "rain" ? "rain-streak" : "snow-dot";
    el.style.left = (20 + Math.random() * 160) + "px";
    el.style.top  = (10 + Math.random() * 180) + "px";
    refs.pet.appendChild(el);
    setTimeout(() => el.remove(), type === "rain" ? 650 : 3100);
  }
  const interval = type === "rain" ? 220 : 800;
  spawn();
  furParticleTimer = setInterval(spawn, interval);
}
function stopFurParticles() {
  if (furParticleTimer) { clearInterval(furParticleTimer); furParticleTimer = null; }
  refs.pet.querySelectorAll(".rain-streak, .snow-dot").forEach(el => el.remove());
}

function applyWeather(code, temp) {
  clearWeatherLayer();
  stopThunder();
  stopFurParticles();
  const info = WMO_MAP[code] || { label: "Unknown", type: "clear" };
  weatherBadge.textContent = info.label + (temp !== null ? "  " + Math.round(temp) + "°C" : "");

  switch (info.type) {
    case "clear":
      spawnClouds(0);
      setPetWeatherClass("clear");
      break;
    case "cloudy":
      spawnClouds(3);
      setPetWeatherClass(null);
      break;
    case "fog":
      spawnClouds(4); spawnFog();
      setPetWeatherClass("fog");
      break;
    case "drizzle":
      spawnClouds(3); spawnRain(1);
      setPetWeatherClass("rain");
      startFurParticles("rain");
      break;
    case "rain":
      spawnClouds(4); spawnRain(2);
      setPetWeatherClass("rain");
      startFurParticles("rain");
      break;
    case "snow":
      spawnClouds(3); spawnSnow();
      setPetWeatherClass("snow");
      startFurParticles("snow");
      break;
    case "storm":
      spawnClouds(5); spawnRain(3); startThunder();
      setPetWeatherClass("storm");
      startFurParticles("rain");
      break;
  }

  // Try a time+weather combined message first, else fall back to weather-only
  const wx = info.type;
  const combo = getCombinedMessage(currentTimePeriod, wx);
  if (combo) {
    setMessage(combo);
  } else if (wx === "storm") {
    setMessage(`⛈️ Thunder! ${state.name} hides under a branch, fur on end!`);
  } else if (wx === "snow") {
    setMessage(`❄️ Snow! ${state.name} tries to eat a snowflake.`);
  } else if (wx === "rain" || wx === "drizzle") {
    setMessage(`🌧️ ${state.name} flattens their fur against the rain.`);
  } else if (wx === "fog") {
    setMessage(`🌫️ ${state.name} peers into the mist, puzzled.`);
  } else if (wx === "clear") {
    setMessage(`☀️ Beautiful day! ${state.name} basks in the warm sun.`);
  }
}

function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=auto`;
  fetch(url)
    .then(r => r.json())
    .then(data => {
      const code = data.current.weathercode;
      const temp = data.current.temperature_2m;
      applyWeather(code, temp);
      // Refresh weather every 15 minutes
      setTimeout(() => fetchWeather(lat, lon), 15 * 60 * 1000);
    })
    .catch(() => {
      weatherBadge.textContent = "";
    });
}

function initWeather() {
  if (!navigator.geolocation) {
    weatherBadge.textContent = "";
    return;
  }
  weatherBadge.textContent = "Locating… 📍";
  navigator.geolocation.getCurrentPosition(
    pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
    ()  => { weatherBadge.textContent = ""; }
  );
}

initWeather();
