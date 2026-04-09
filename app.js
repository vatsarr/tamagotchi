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
  nameInput: document.getElementById("petName"),
  moodText: document.getElementById("moodText"),
  message: document.getElementById("message"),
  hungerBar: document.getElementById("hungerBar"),
  energyBar: document.getElementById("energyBar"),
  joyBar: document.getElementById("joyBar"),
  cleanBar: document.getElementById("cleanBar"),
  renameBtn: document.getElementById("renameBtn"),
  themeToggle: document.getElementById("themeToggle"),
};

const clamp = (value) => Math.max(0, Math.min(100, value));

function setMessage(text) {
  refs.message.textContent = text;
}

function moodLabel() {
  const average = (state.hunger + state.energy + state.joy + state.clean) / 4;
  if (average > 82) return "Thriving";
  if (average > 65) return "Content";
  if (average > 45) return "Sleepy";
  return "Needs attention";
}

function render() {
  refs.nameInput.value = state.name;
  refs.moodText.textContent = moodLabel();
  refs.hungerBar.style.width = `${state.hunger}%`;
  refs.energyBar.style.width = `${state.energy}%`;
  refs.joyBar.style.width = `${state.joy}%`;
  refs.cleanBar.style.width = `${state.clean}%`;
  document.documentElement.setAttribute("data-theme", state.theme);
  state.lastSaved = Date.now();
  saveState();
}

function animatePet() {
  refs.pet.classList.add("bounce");
  setTimeout(() => refs.pet.classList.remove("bounce"), 180);
}

function applyAction(action) {
  if (action === "feed") {
    state.hunger = clamp(state.hunger + 16);
    state.clean = clamp(state.clean - 4);
    setMessage(`${state.name} grabs a snack and munches happily.`);
  }
  if (action === "play") {
    state.joy = clamp(state.joy + 18);
    state.energy = clamp(state.energy - 8);
    state.hunger = clamp(state.hunger - 6);
    setMessage(`${state.name} leaps around and chatters with delight.`);
  }
  if (action === "sleep") {
    state.energy = clamp(state.energy + 20);
    state.joy = clamp(state.joy + 4);
    setMessage(`${state.name} curls up and hugs the stuffed orangutan.`);
  }
  if (action === "clean") {
    state.clean = clamp(state.clean + 22);
    setMessage(`${state.name} is groomed and fluffy again.`);
  }
  animatePet();
  render();
}

function applyOfflineDrift() {
  if (!state.lastSaved) return;
  const elapsed = Math.floor((Date.now() - state.lastSaved) / 12000);
  if (elapsed <= 0) return;
  const ticks = Math.min(elapsed, 120);
  state.hunger = clamp(state.hunger - 3 * ticks);
  state.energy = clamp(state.energy - 2 * ticks);
  state.joy = clamp(state.joy - 2 * ticks);
  state.clean = clamp(state.clean - 1 * ticks);
}

function driftStats() {
  state.hunger = clamp(state.hunger - 3);
  state.energy = clamp(state.energy - 2);
  state.joy = clamp(state.joy - 2);
  state.clean = clamp(state.clean - 1);
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

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => applyAction(button.dataset.action));
});

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
    setMessage(`${state.name} missed you! You were away for ${mins} minute${mins !== 1 ? "s" : ""}.`);
  }
}

setInterval(driftStats, 12000);
render();
