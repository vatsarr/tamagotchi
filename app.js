// ============================================================
// PUNCH TAMAGOTCHI — app.js
// ============================================================
// Sections (in order):
//   1. Constants & configuration
//   2. State (persistence, defaults, live state)
//   3. DOM references
//   4. Render & UI helpers
//   5. Simulation engine (drift, mood, offline)
//   6. Actions (feed, play, sleep, clean)
//   7. Day / night mechanic
//   8. Weather mechanic
//   9. Digestion countdown UI
//  10. Event listeners
//  11. Boot sequence
// ============================================================


// ── 1. CONSTANTS & CONFIGURATION ────────────────────────────

const SAVE_KEY        = "punch_tamagotchi_save";
const FEED_COOLDOWN_MS = 30000;   // 30 s digestion cooldown
const DRIFT_INTERVAL_MS = 12000;  // stat decay tick
const CIRC = 100;                 // SVG ring stroke-dasharray

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


// ── 2. STATE ─────────────────────────────────────────────────

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

// Cross-system live state (hoisted so every function can read them safely)
let currentWeatherType = null;
let currentTimePeriod  = null;
let lastFeedTime       = 0;

const clamp = (v) => Math.max(0, Math.min(100, v));


// ── 3. DOM REFERENCES ────────────────────────────────────────

const refs = {
  // Pet
  pet:        document.getElementById("pet"),
  petStage:   document.querySelector(".pet-stage"),
  // Stats
  nameInput:  document.getElementById("petName"),
  moodText:   document.getElementById("moodText"),
  message:    document.getElementById("message"),
  hungerBar:  document.getElementById("hungerBar"),
  energyBar:  document.getElementById("energyBar"),
  joyBar:     document.getElementById("joyBar"),
  cleanBar:   document.getElementById("cleanBar"),
  statHunger: document.getElementById("statHunger"),
  statEnergy: document.getElementById("statEnergy"),
  statJoy:    document.getElementById("statJoy"),
  statClean:  document.getElementById("statClean"),
  // Controls
  renameBtn:    document.getElementById("renameBtn"),
  themeToggle:  document.getElementById("themeToggle"),
  settingsBtn:  document.getElementById("settingsBtn"),
  settingsClose: document.getElementById("settingsClose"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  resetBtn:     document.getElementById("resetBtn"),
  // Sky
  skyStars:    document.getElementById("skyStars"),
  timeBadge:   document.getElementById("timeBadge"),
  sunEl:       document.querySelector(".sky-sun"),
  moonEl:      document.querySelector(".sky-moon"),
  // Weather
  weatherBadge: document.getElementById("weatherBadge"),
  weatherLayer: document.getElementById("weatherLayer"),
  // Feed button / digestion
  feedBtn:      document.getElementById("feedBtn"),
};

// Extra refs that need querySelector on feedBtn (available after refs is built)
const digestFill    = refs.feedBtn.querySelector(".digest-ring-fill");
const digestCountEl = document.getElementById("digestCountdown");


// ── 4. RENDER & UI HELPERS ───────────────────────────────────

function setMessage(text) {
  refs.message.textContent = text;
}

function setBarState(barEl, statEl, value) {
  barEl.style.width = `${value}%`;
  barEl.classList.toggle("warning",  value > 0 && value <= 30);
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
    { key: "hunger", cls: "starving",  flash: "hunger", msg: `${state.name} is STARVING! Feed me now! 🍌`         },
    { key: "energy", cls: "exhausted", flash: "energy", msg: `${state.name} collapsed from exhaustion! 😴`        },
    { key: "joy",    cls: "sad",       flash: "joy",    msg: `${state.name} is completely miserable... 😢`        },
    { key: "clean",  cls: "stinky",    flash: "clean",  msg: `${state.name} smells terrible! Give a bath! 🤢`    },
  ];

  let crisisCount = 0;
  checks.forEach(({ key, cls, flash, msg }) => {
    const isZero = state[key] === 0;
    if (isZero && !prevZero[key]) { triggerFlash(flash); setMessage(msg); }
    prevZero[key] = isZero;
    refs.pet.classList.toggle(cls, isZero);
    if (isZero) crisisCount++;
  });

  // Stink lines
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
  refs.nameInput.value        = state.name;
  refs.moodText.textContent   = moodLabel();
  setBarState(refs.hungerBar, refs.statHunger, state.hunger);
  setBarState(refs.energyBar, refs.statEnergy, state.energy);
  setBarState(refs.joyBar,    refs.statJoy,    state.joy);
  setBarState(refs.cleanBar,  refs.statClean,  state.clean);
  checkZeroCrossings();
  document.documentElement.setAttribute("data-theme", state.theme);
  state.lastSaved = Date.now();
  saveState();
}


// ── 5. SIMULATION ENGINE ─────────────────────────────────────

function moodLabel() {
  const { hunger, energy, joy, clean } = state;
  const hour    = new Date().getHours();
  const isNight = hour >= 22 || hour < 5;

  if (hunger <= 10 && energy <= 10)              return "Desperate";
  if (hunger <= 15 || energy <= 15)              return "Struggling";
  if (currentWeatherType === "storm" && joy < 50) return "Stressed";
  if (isNight && joy < 40)                       return "Lonely";
  if (energy > 70 && joy < 35)                   return "Restless";
  if (joy > 60 && hunger < 30)                   return "Hungry but Happy";
  if (energy < 25 && joy > 50)                   return "Sleepy";
  if (clean === 0)                               return "Uncomfortable";

  const avg = (hunger + energy + joy + clean) / 4;
  if (avg > 82) return "Thriving";
  if (avg > 65) return "Content";
  if (avg > 45) return "Okay";
  return "Needs Attention";
}

// Returns per-tick stat deltas based on time-of-day, weather, and stat interdependencies.
// tick = 12 s live; scaled for offline catch-up.
function computeDriftDeltas(hour, wx) {
  const isNight     = hour >= 22 || hour < 5;
  const isDawn      = hour >= 5  && hour < 7;
  const isMorning   = hour >= 7  && hour < 10;
  const isDaytime   = hour >= 10 && hour < 15;
  const isAfternoon = hour >= 15 && hour < 18;
  const isDusk      = hour >= 18 && hour < 20;
  const isEvening   = hour >= 20 && hour < 22;

  let dH = -3, dE = -2, dJ = -2, dC = -1;

  // Time-of-day rates
  if      (isNight)     { dE = +1.5; dH = -0.8; dJ = -0.5; dC = -0.3; } // sleeping
  else if (isDawn)      { dH = -3.5; dE = -1;   dJ = -1;               } // waking up
  else if (isMorning)   { dH = -4;   dE = -2.5; dJ = -1.5;            } // foraging peak
  else if (isDaytime)   { dH = -3;   dE = -2.5; dJ = -2;              } // active
  else if (isAfternoon) { dH = -2.5; dE = -2;   dJ = -1.5;            }
  else if (isDusk)      { dH = -2;   dE = -1.5; dJ = -1;              } // winding down
  else if (isEvening)   { dH = -1.5; dE = -1;   dJ = -0.8;            }

  // Weather modifiers
  if      (wx === "storm")                      { dJ -= 3; dE -= 1; dH -= 1; }
  else if (wx === "rain" || wx === "drizzle")    { dJ -= 1.5; dE -= 0.5;     }
  else if (wx === "snow")                        { dH -= 1; dE -= 1; dJ -= 0.5; }
  else if (wx === "fog")                         { dJ -= 0.5;                 }
  else if (wx === "clear" && (isDaytime || isAfternoon)) { dJ += 1;          }

  // Stat interdependencies
  if (state.hunger < 25)             dE -= 1.5; // starving → no fuel
  if (state.energy < 20)             dJ -= 1.5; // exhausted → cranky
  if (state.clean  < 20)             dJ -= 1;   // dirty → uncomfortable
  if (state.joy    < 20)             dH -= 1;   // miserable → stress eating
  if (isNight && state.joy < 50)     dJ -= 0.5; // lonely at night

  return { dH, dE, dJ, dC };
}

function applyOfflineDrift() {
  if (!state.lastSaved) return;
  const ticks = Math.min(Math.floor((Date.now() - state.lastSaved) / DRIFT_INTERVAL_MS), 120);
  if (ticks <= 0) return;
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
  checkEnergyWakeUp();
}


// ── 6. ACTIONS ───────────────────────────────────────────────

function applyAction(action) {
  const n   = state.name;
  const hour = new Date().getHours();
  const isNight   = hour >= 22 || hour < 5;
  const isDaytime = hour >= 10 && hour < 18;
  const wx  = currentWeatherType;

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
      state.clean  = clamp(state.clean  - 10);
      setMessage(`${n} snatches the food and devours it frantically! 🍌`);
    } else {
      state.hunger = clamp(state.hunger + 16);
      state.clean  = clamp(state.clean  - 4);
      setMessage(`${n} grabs a snack and munches happily.`);
    }
    lastFeedTime = now;
  }

  if (action === "play") {
    if (state.energy < 20) {
      setMessage(`${n} flops over. Too tired to play right now… 😴`);
      return;
    }
    const hungerCost     = state.hunger < 30 ? 14 : 6;
    const joyGain        = isDaytime ? 20 : isNight ? 8 : 14;
    const weatherPenalty = wx === "storm" ? 6 : (wx === "rain" || wx === "drizzle") ? 3 : 0;
    state.joy    = clamp(state.joy    + joyGain - weatherPenalty);
    state.energy = clamp(state.energy - 10);
    state.hunger = clamp(state.hunger - hungerCost);
    state.clean  = clamp(state.clean  - 5);
    if      (isNight)       setMessage(`${n} plays groggily. A bit too dark for full fun…`);
    else if (wx === "storm") setMessage(`${n} tries to play but flinches at every thunderclap.`);
    else if (isDaytime)     setMessage(`${n} leaps around and chatters with delight! 🌴`);
    else                    setMessage(`${n} runs around and chatters with delight.`);
  }

  if (action === "sleep") {
    const isGoodTime    = isNight || hour >= 20 || hour < 7;
    const hungerPenalty = state.hunger < 20 ? 0.5 : 1;
    const energyGain    = Math.round((isGoodTime ? 24 : 14) * hungerPenalty);
    const joyGain       = isGoodTime ? 6 : 2;
    state.energy = clamp(state.energy + energyGain);
    state.joy    = clamp(state.joy    + joyGain);
    if      (!isGoodTime)        setMessage(`${n} naps lightly. Midday sleep isn't as restful… 😴`);
    else if (state.hunger < 20)  setMessage(`${n} tries to sleep but a rumbling belly keeps waking them.`);
    else                         setMessage(`${n} curls up and hugs the stuffed orangutan. 🌙`);
  }

  if (action === "clean") {
    if (state.clean > 85) {
      setMessage(`${n} squirms away — already clean enough! 🙄`);
      return;
    }
    state.clean = clamp(state.clean + 22);
    state.joy   = clamp(state.joy   + 4);
    setMessage(`${n} is groomed and fluffy again. 👌`);
  }

  animatePet();
  render();
}


// ── 7. DAY / NIGHT MECHANIC ──────────────────────────────────

// Generate stars once
for (let i = 0; i < 28; i++) {
  const s = document.createElement("span");
  s.style.left    = Math.random() * 96 + "%";
  s.style.top     = Math.random() * 80 + "%";
  s.style.opacity = (0.4 + Math.random() * 0.6).toFixed(2);
  refs.skyStars.appendChild(s);
}

function getTimePeriod(hour) {
  return TIME_PERIODS.find(p => hour >= p.start && hour < p.end) || TIME_PERIODS[0];
}

// Map hour 0–24 → left % across the sky strip
function orbPosition(hour, minutes) {
  const frac = (hour * 60 + minutes) / (24 * 60);
  return Math.round(4 + frac * 88) + "%";
}

function getCombinedMessage(period, wx) {
  const n = state.name;
  if ((period === "night" || period === "latenight") && wx === "storm") return `⛈️🌙 Midnight thunder! ${n} is trembling in the dark!`;
  if ((period === "night" || period === "latenight") && wx === "rain")  return `🌧️🌙 Night rain... ${n} curls up tight and tries to sleep.`;
  if ((period === "night" || period === "latenight") && wx === "snow")  return `❄️🌙 Silent snowfall — ${n} peeks out, then burrows back in.`;
  if ((period === "night" || period === "latenight") && wx === "fog")   return `🌫️🌙 Misty night — ${n} stares into nothing, ears perked.`;
  if ((period === "night" || period === "latenight"))                   return `🌙 ${n} yawns and curls up. Time to sleep.`;
  if (period === "dawn"  && wx === "rain")   return `🌄🌧️ Dawn rain — ${n} shivers but blinks awake.`;
  if (period === "dawn"  && wx === "clear")  return `🌄 The sun is rising! ${n} stretches long and yawns.`;
  if (period === "dawn"  && wx === "snow")   return `🌄❄️ Fresh snow at dawn — ${n} presses their nose to the cold air.`;
  if (period === "morning" && wx === "storm") return `⛈️ Morning storm! ${n} hugs a branch and waits it out.`;
  if (period === "morning" && wx === "snow")  return `🌨️ Morning snow! ${n} cautiously sniffs a snowflake.`;
  if (period === "morning" && wx === "clear") return `☀️ Good morning! ${n} chatters cheerfully in the sunlight.`;
  if ((period === "day" || period === "afternoon") && wx === "storm") return `⛈️ A storm rolls in — ${n} scrambles for shelter!`;
  if ((period === "day" || period === "afternoon") && wx === "clear") return `☀️ ${n} is full of energy, hopping branch to branch!`;
  if ((period === "day" || period === "afternoon") && wx === "rain")  return `🌧️ Afternoon rain. ${n} grumbles and hunches under a leaf.`;
  if (period === "dusk" && wx === "clear")  return `🌇 ${n} watches the sunset, swaying contentedly.`;
  if (period === "dusk" && wx === "rain")   return `🌇🌧️ Rainy dusk — ${n} is sleepy and soggy.`;
  if (period === "dusk" && wx === "storm")  return `🌇⛈️ Storm at dusk! ${n} panics and scrambles inside.`;
  if (period === "evening" && wx === "clear") return `🌙 ${n} gazes at the first stars, calm and sleepy.`;
  if (period === "evening" && wx === "storm") return `⛈️🌙 Evening thunder — ${n} jumps at every flash!`;
  return null;
}

let lastPeriodName = null;

function updateDayNight() {
  const now    = new Date();
  const hour   = now.getHours();
  const minute = now.getMinutes();
  const period = getTimePeriod(hour);

  document.documentElement.setAttribute("data-time", period.name);
  if (!lastKnownPeriod) lastKnownPeriod = period.name;
  checkPeriodWakeUp(period.name);
  currentTimePeriod = period.name;
  syncPetClasses();

  const pos = orbPosition(hour, minute);
  refs.sunEl.style.left  = pos;
  refs.moonEl.style.left = pos;
  refs.timeBadge.textContent = period.label;

  if (period.name !== lastPeriodName) {
    const combo = getCombinedMessage(period.name, currentWeatherType);
    if (combo) setMessage(combo);
    lastPeriodName = period.name;
  }
}


// ── 8. WEATHER MECHANIC ──────────────────────────────────────

const WEATHER_PET_CLASSES = ["weather-rain", "weather-snow", "weather-storm", "weather-clear", "weather-fog"];
const TIME_PET_CLASSES    = TIME_PERIODS.map(p => "time-" + p.name);

function syncPetClasses() {
  WEATHER_PET_CLASSES.forEach(c => refs.pet.classList.remove(c));
  TIME_PET_CLASSES.forEach(c    => refs.pet.classList.remove(c));
  if (currentWeatherType) refs.pet.classList.add("weather-" + currentWeatherType);
  if (currentTimePeriod)  refs.pet.classList.add("time-"    + currentTimePeriod);
}

function setPetWeatherClass(type) {
  currentWeatherType = type || null;
  syncPetClasses();
}

function clearWeatherLayer() {
  refs.weatherLayer.innerHTML = "";
  const fog = document.querySelector(".fog-layer");
  if (fog) fog.remove();
}

function spawnRain(intensity) {
  const count = intensity === 1 ? 18 : intensity === 2 ? 38 : 60;
  for (let i = 0; i < count; i++) {
    const drop = document.createElement("div");
    drop.className = "raindrop";
    const h = 8 + Math.random() * 14;
    drop.style.left              = Math.random() * 100 + "%";
    drop.style.height            = h + "px";
    drop.style.animationDuration = (0.35 + Math.random() * 0.4) + "s";
    drop.style.animationDelay    = (Math.random() * 0.8) + "s";
    drop.style.opacity           = (0.4 + Math.random() * 0.5).toFixed(2);
    refs.weatherLayer.appendChild(drop);
  }
}

function spawnSnow() {
  for (let i = 0; i < 28; i++) {
    const flake = document.createElement("div");
    flake.className = "snowflake";
    const size = 2 + Math.random() * 4;
    flake.style.left             = Math.random() * 100 + "%";
    flake.style.width            = size + "px";
    flake.style.height           = size + "px";
    flake.style.setProperty("--drift", (Math.random() * 20 - 10) + "px");
    flake.style.animationDuration = (1.2 + Math.random() * 1.8) + "s";
    flake.style.animationDelay   = (Math.random() * 2) + "s";
    refs.weatherLayer.appendChild(flake);
  }
}

function spawnClouds(count) {
  for (let i = 0; i < count; i++) {
    const cloud = document.createElement("div");
    cloud.className = "cloud";
    const w = 55 + Math.random() * 50;
    cloud.style.width            = w + "px";
    cloud.style.height           = (w * 0.35) + "px";
    cloud.style.top              = (8 + Math.random() * 48) + "px";
    cloud.style.animationDuration = (18 + Math.random() * 20) + "s";
    cloud.style.animationDelay   = -(Math.random() * 20) + "s";
    cloud.style.opacity          = (0.5 + Math.random() * 0.4).toFixed(2);
    refs.weatherLayer.appendChild(cloud);
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
  function schedule() {
    const delay = 4000 + Math.random() * 8000;
    thunderTimer = setTimeout(() => { flash(); schedule(); }, delay);
  }
  schedule();
}
function stopThunder() {
  if (thunderTimer) { clearTimeout(thunderTimer); thunderTimer = null; }
}

let furParticleTimer = null;
function startFurParticles(type) {
  stopFurParticles();
  function spawn() {
    const el = document.createElement("div");
    el.className   = type === "rain" ? "rain-streak" : "snow-dot";
    el.style.left  = (20 + Math.random() * 160) + "px";
    el.style.top   = (10 + Math.random() * 180) + "px";
    refs.pet.appendChild(el);
    setTimeout(() => el.remove(), type === "rain" ? 650 : 3100);
  }
  spawn();
  furParticleTimer = setInterval(spawn, type === "rain" ? 220 : 800);
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
  refs.weatherBadge.textContent = info.label + (temp !== null ? "  " + Math.round(temp) + "°C" : "");

  switch (info.type) {
    case "clear":   spawnClouds(0);              setPetWeatherClass("clear");  break;
    case "cloudy":  spawnClouds(3);              setPetWeatherClass(null);     break;
    case "fog":     spawnClouds(4); spawnFog();  setPetWeatherClass("fog");    break;
    case "drizzle": spawnClouds(3); spawnRain(1); setPetWeatherClass("rain"); startFurParticles("rain"); break;
    case "rain":    spawnClouds(4); spawnRain(2); setPetWeatherClass("rain"); startFurParticles("rain"); break;
    case "snow":    spawnClouds(3); spawnSnow();  setPetWeatherClass("snow"); startFurParticles("snow"); break;
    case "storm":   spawnClouds(5); spawnRain(3); startThunder(); setPetWeatherClass("storm"); startFurParticles("rain"); break;
  }

  const wx    = info.type;
  const combo = getCombinedMessage(currentTimePeriod, wx);
  if      (combo)                          setMessage(combo);
  else if (wx === "storm")                 setMessage(`⛈️ Thunder! ${state.name} hides under a branch, fur on end!`);
  else if (wx === "snow")                  setMessage(`❄️ Snow! ${state.name} tries to eat a snowflake.`);
  else if (wx === "rain" || wx === "drizzle") setMessage(`🌧️ ${state.name} flattens their fur against the rain.`);
  else if (wx === "fog")                   setMessage(`🌫️ ${state.name} peers into the mist, puzzled.`);
  else if (wx === "clear")                 setMessage(`☀️ Beautiful day! ${state.name} basks in the warm sun.`);
}

function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=auto`;
  fetch(url)
    .then(r => r.json())
    .then(data => {
      applyWeather(data.current.weathercode, data.current.temperature_2m);
      setTimeout(() => fetchWeather(lat, lon), 15 * 60 * 1000);
    })
    .catch(() => { refs.weatherBadge.textContent = ""; });
}

function initWeather() {
  if (!navigator.geolocation) { refs.weatherBadge.textContent = ""; return; }
  refs.weatherBadge.textContent = "Locating… 📍";
  navigator.geolocation.getCurrentPosition(
    pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
    ()  => { refs.weatherBadge.textContent = ""; }
  );
}


// ── 9. DIGESTION COUNTDOWN UI ────────────────────────────────

let digestInterval = null;

function startDigestCountdown() {
  if (digestInterval) clearInterval(digestInterval);
  refs.feedBtn.classList.add("digesting");
  refs.feedBtn.classList.remove("digest-ready");

  function tick() {
    const remaining = Math.max(0, FEED_COOLDOWN_MS - (Date.now() - lastFeedTime));
    const secs      = Math.ceil(remaining / 1000);
    const progress  = remaining / FEED_COOLDOWN_MS; // 1.0 → 0.0
    digestFill.style.strokeDashoffset = (progress * CIRC).toFixed(1);
    digestCountEl.textContent = secs > 0 ? secs + "s" : "";
    if (remaining <= 0) {
      clearInterval(digestInterval);
      digestInterval = null;
      refs.feedBtn.classList.remove("digesting");
      refs.feedBtn.classList.add("digest-ready");
      digestCountEl.textContent = "";
      setTimeout(() => refs.feedBtn.classList.remove("digest-ready"), 1500);
    }
  }

  tick();
  digestInterval = setInterval(tick, 1000);
}


// ── 9b. ANIMATION HELPERS ────────────────────────────────────

const petEl    = document.getElementById("pet");
const stageEl  = petEl.closest(".pet-stage") || petEl.parentElement;

function triggerAnim(className, durationMs) {
  petEl.classList.remove("action-munch","action-excited","action-yawn","action-blink");
  void petEl.offsetWidth; // force reflow so re-adding the class restarts animation
  petEl.classList.add(className);
  setTimeout(() => petEl.classList.remove(className), durationMs);
}

function spawnStars(count = 6) {
  const emojis = ["⭐","✨","💫","🌟"];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "star-burst";
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const angle = (Math.PI * 2 * i / count) + (Math.random() * 0.4 - 0.2);
    const dist  = 38 + Math.random() * 24;
    el.style.cssText = `left:50%;top:40%;--dx:${Math.cos(angle)*dist}px;--dy:${Math.sin(angle)*dist}px;animation-delay:${i*0.04}s`;
    stageEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
}

function spawnZzz(count = 3) {
  const letters = ["z","Z","z"];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "zzz-particle";
    el.textContent = letters[i % letters.length];
    const dx = (Math.random() * 30 - 15);
    el.style.cssText = `left:${52 + dx}%;top:18%;font-size:${13+i*4}px;--dx:${dx}px;animation-delay:${i*0.28}s`;
    stageEl.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }
}

function spawnBubbles(count = 9) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "soap-bubble";
    const size = 10 + Math.random() * 18;
    const startX = 30 + Math.random() * 40;
    const dx  = (Math.random() * 40 - 20);
    const ddx = dx + (Math.random() * 20 - 10);
    const dur = 0.9 + Math.random() * 0.7;
    el.style.cssText = `width:${size}px;height:${size}px;left:${startX}%;bottom:20%;--dx:${dx}px;--ddx:${ddx}px;--dur:${dur}s;--sf:${0.7+Math.random()*0.6};animation-delay:${i*0.08}s`;
    stageEl.appendChild(el);
    setTimeout(() => el.remove(), (dur + i * 0.08 + 0.3) * 1000);
  }
}


// ── 9b-ii. WAKE-UP SYSTEM ────────────────────────────────────

// Track last known time period so we detect transitions
let lastKnownPeriod = null;
// Prevent duplicate wake events firing too close together
let lastWakeTime = 0;
const WAKE_COOLDOWN_MS = 60000; // at most one wake event per minute

function playWakeUp(reason) {
  const now = Date.now();
  if (now - lastWakeTime < WAKE_COOLDOWN_MS) return;
  lastWakeTime = now;

  // Stop any current idle animation before waking
  idleAnimLocked = true;
  const allIdle = IDLE_ANIMS.map(a => a.cls);
  allIdle.forEach(c => petEl.classList.remove(c));

  // Trigger the stretch animation
  petEl.classList.add("action-wakeup");
  setTimeout(() => {
    petEl.classList.remove("action-wakeup");
    idleAnimLocked = false;
  }, 1500);

  // Message varies by reason
  const n = state.name;
  const msgs = {
    dawn:        `${n} stirs at dawn, yawns widely, and stretches both arms. Good morning! 🌅`,
    morning:     `${n} wakes up properly — eyes wide, arms out, ready for the day! ☀️`,
    lowEnergy:   `${n} jolts awake after nearly dozing off. Those eyes snap open! 👀`,
    interaction: `${n} snaps out of a nap as you tap — arms up, big stretch! 🐒`,
    tabFocus:    `${n} perks up as you return — a sleepy stretch and a curious look. 👋`,
    highEnergy:  `${n} feels refreshed and leaps up with a full-body stretch! 💪`,
  };
  setMessage(msgs[reason] || msgs.interaction);
}

// Called from updateDayNight when time period changes
function checkPeriodWakeUp(newPeriod) {
  if (!lastKnownPeriod || newPeriod === lastKnownPeriod) return;
  const prev = lastKnownPeriod;
  lastKnownPeriod = newPeriod;

  // Dawn: always wake (night → dawn transition)
  if (newPeriod === "dawn" && (prev === "latenight" || prev === "night")) {
    playWakeUp("dawn");
    return;
  }
  // Morning: wake if energy was restored overnight
  if (newPeriod === "morning" && state.energy > 55) {
    playWakeUp("morning");
    return;
  }
  // Evening winding down: light doze nudge handled by idle scheduler
}

// Called whenever any button is pressed while pet looks sleepy
function checkInteractionWakeUp() {
  // Only trigger if pet was visually dozed / very low energy
  if (state.energy > 35) return;
  if (petEl.classList.contains("idle-doze") || petEl.classList.contains("idle-yawn")) {
    playWakeUp("interaction");
  }
}

// Page visibility: wake up when user returns to tab after being away
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const now = Date.now();
  // Only trigger if we were hidden for at least 30 seconds
  if (now - (state.lastSaved || 0) < 30000) return;

  if (state.energy < 30) {
    // Pet was exhausted while away — may have recovered a bit via offline drift
    playWakeUp("tabFocus");
  } else if (state.energy > 70) {
    playWakeUp("highEnergy");
  }
});

// Low-energy auto-wake: if pet dozes while energy < 20 and then
// a drift tick pushes energy back above 30 (e.g. after sleeping)
let prevEnergy = state.energy;
function checkEnergyWakeUp() {
  const e = state.energy;
  if (prevEnergy < 25 && e >= 30) {
    // Energy just crossed the 30 threshold upward
    playWakeUp("lowEnergy");
  }
  prevEnergy = e;
}


// ── 9c. IDLE ANIMATION SCHEDULER ──────────────────────────────

// All idle classes + their durations in ms
// Base anim definitions — weights are overridden dynamically by pickIdle()
const IDLE_ANIMS = [
  { cls: "idle-tailwag", dur:  600, baseWeight: 4 },
  { cls: "idle-scratch", dur:  950, baseWeight: 3 },
  { cls: "idle-look",    dur: 1050, baseWeight: 3 },
  { cls: "idle-bounce",  dur:  700, baseWeight: 3 },
  { cls: "idle-groom",   dur: 1150, baseWeight: 3 },
  { cls: "idle-sniff",   dur: 1050, baseWeight: 2 },
  { cls: "idle-wave",    dur:  900, baseWeight: 2 },
  { cls: "idle-yawn",    dur: 1650, baseWeight: 0 }, // weight set by energy
  { cls: "idle-doze",    dur: 2050, baseWeight: 0, onStart: () => spawnZzz(2) }, // weight set by energy
  { cls: "idle-shiver",  dur: 1150, baseWeight: 1 },
];

// Weighted random pick — yawn/doze weights scale with tiredness
function pickIdle() {
  const e = state.energy;          // 0–100
  const tiredness = Math.max(0, (60 - e) / 60); // 0 at e≥60, 1 at e=0

  const weighted = IDLE_ANIMS.map(a => {
    let w = a.baseWeight;
    if (a.cls === "idle-yawn") {
      // starts appearing at energy < 60, peaks at 0
      w = Math.round(lerp(0, 5, tiredness));
    }
    if (a.cls === "idle-doze") {
      // only at energy < 35, max weight 4
      w = e < 35 ? Math.round(lerp(0, 4, (35 - e) / 35)) : 0;
    }
    // Suppress energetic anims when exhausted
    if ((a.cls === "idle-bounce" || a.cls === "idle-wave") && e < 25) w = 0;
    return { ...a, weight: w };
  });

  const pool = weighted.flatMap(a => Array(Math.max(0, a.weight)).fill(a));
  if (!pool.length) return IDLE_ANIMS[0]; // fallback to tailwag
  return pool[Math.floor(Math.random() * pool.length)];
}

function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }

let idleAnimLocked = false; // don't interrupt action animations

function fireIdleAnim() {
  if (idleAnimLocked) return;
  // Don't play idle while an action anim class is active
  const actionClasses = ["action-munch","action-excited","action-yawn","action-blink"];
  if (actionClasses.some(c => petEl.classList.contains(c))) return;

  const anim = pickIdle();
  petEl.classList.add(anim.cls);
  if (anim.onStart) anim.onStart();
  idleAnimLocked = true;
  setTimeout(() => {
    petEl.classList.remove(anim.cls);
    idleAnimLocked = false;
  }, anim.dur + 80);
}

// Lock idle during action anims so they don't clash
// triggerAnim is defined elsewhere; we wrap it by patching idleAnimLocked around calls.
// The actual triggerAnim call sites now call lockIdleAround() instead.
function lockIdleForDuration(durationMs) {
  idleAnimLocked = true;
  setTimeout(() => { idleAnimLocked = false; }, durationMs + 100);
}

// Schedule idle animations: fire one every 3-7 seconds at random
function scheduleNextIdle() {
  const delay = 3000 + Math.random() * 4000;
  setTimeout(() => {
    fireIdleAnim();
    scheduleNextIdle();
  }, delay);
}
scheduleNextIdle();


// ── 10. EVENT LISTENERS ──────────────────────────────────────

// Settings modal open / close
function openSettings() {
  refs.settingsBackdrop.classList.add("open");
  refs.settingsBackdrop.setAttribute("aria-hidden", "false");
  refs.nameInput.value = state.name;
  refs.themeToggle.setAttribute("aria-checked", state.theme === "dark" ? "true" : "false");
}
function closeSettings() {
  refs.settingsBackdrop.classList.remove("open");
  refs.settingsBackdrop.setAttribute("aria-hidden", "true");
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
  if (!next) { setMessage("Your monkey is waiting for a proper name."); return; }
  state.name = next;
  setMessage(`${state.name} blinks curiously. Name updated.`);
  render();
  closeSettings();
});

refs.themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  refs.themeToggle.setAttribute("aria-checked", state.theme === "dark" ? "true" : "false");
  render();
});

refs.resetBtn.addEventListener("click", () => {
  if (!confirm("Reset everything and start fresh? This cannot be undone.")) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  Object.assign(state, { ...defaults, lastSaved: null });
  lastFeedTime = 0;
  setMessage(`${state.name} arrives, blinking in the light. A fresh start! 🌱`);
  render();
  closeSettings();
});

refs.feedBtn.addEventListener("click", () => {
  checkInteractionWakeUp();
  const before = lastFeedTime;
  applyAction("feed");
  triggerAnim("action-munch", 700);
  lockIdleForDuration(700);
  if (lastFeedTime !== before) startDigestCountdown();
});

document.querySelectorAll("[data-action]:not([data-action='feed'])").forEach(btn => {
  btn.addEventListener("click", () => {
    checkInteractionWakeUp();
    applyAction(btn.dataset.action);
    if (btn.dataset.action === "play") {
      triggerAnim("action-excited", 750);
      lockIdleForDuration(750);
      spawnStars(7);
    }
    if (btn.dataset.action === "sleep") {
      triggerAnim("action-yawn", 1100);
      lockIdleForDuration(1100);
      spawnZzz(3);
    }
    if (btn.dataset.action === "clean") {
      triggerAnim("action-blink", 600);
      lockIdleForDuration(600);
      spawnBubbles(10);
    }
  });
});


// ── 11. BOOT SEQUENCE ────────────────────────────────────────

// Apply decay for time spent away before rendering
if (state.lastSaved) {
  applyOfflineDrift();
  const secondsAway = Math.floor((Date.now() - state.lastSaved) / 1000);
  if (secondsAway > 60) {
    const mins = Math.floor(secondsAway / 60);
    setMessage(`${state.name} missed you! You were away for ${mins} minute${mins !== 1 ? "s" : ""}.`);
  }
}

// Sync toggle switch visual state with persisted theme
refs.themeToggle.setAttribute("aria-checked", state.theme === "dark" ? "true" : "false");

render();                                      // initial paint
updateDayNight();                              // set sky + time badge
setInterval(updateDayNight, 60 * 1000);        // update sky every minute
setInterval(driftStats, DRIFT_INTERVAL_MS);    // stat decay every 12 s
initWeather();                                 // fetch real weather
