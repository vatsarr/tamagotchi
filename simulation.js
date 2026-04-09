// ============================================================
// simulation.js — Stat drift, mood label, offline catch-up
//
// No imports. Receives `state`, `clamp`, and live context
// variables by reference from app.js via init().
// ============================================================

let _state, _clamp, _getWeatherType, _getDriftInterval;

export function initSimulation({
  state,
  clamp,
  getWeatherType,
  DRIFT_INTERVAL_MS,
}) {
  _state = state;
  _clamp = clamp;
  _getWeatherType = getWeatherType;
  _getDriftInterval = () => DRIFT_INTERVAL_MS;
}

export function moodLabel() {
  const { hunger, energy, joy, clean } = _state;
  const hour = new Date().getHours();
  const isNight = hour >= 22 || hour < 5;
  const wx = _getWeatherType();

  if (hunger <= 10 && energy <= 10) return "Desperate";
  if (hunger <= 15 || energy <= 15) return "Struggling";
  if (wx === "storm" && joy < 50) return "Stressed";
  if (isNight && joy < 40) return "Lonely";
  if (energy > 70 && joy < 35) return "Restless";
  if (joy > 60 && hunger < 30) return "Hungry but Happy";
  if (energy < 25 && joy > 50) return "Sleepy";
  if (clean === 0) return "Uncomfortable";

  const avg = (hunger + energy + joy + clean) / 4;
  if (avg > 82) return "Thriving";
  if (avg > 65) return "Content";
  if (avg > 45) return "Okay";
  return "Needs Attention";
}

export function computeDriftDeltas(hour, wx) {
  const isNight = hour >= 22 || hour < 5;
  const isDawn = hour >= 5 && hour < 7;
  const isMorning = hour >= 7 && hour < 10;
  const isDaytime = hour >= 10 && hour < 15;
  const isAfternoon = hour >= 15 && hour < 18;
  const isDusk = hour >= 18 && hour < 20;
  const isEvening = hour >= 20 && hour < 22;

  let dH = -3,
    dE = -2,
    dJ = -2,
    dC = -1;

  if (isNight) {
    dE = +1.5;
    dH = -0.8;
    dJ = -0.5;
    dC = -0.3;
  } else if (isDawn) {
    dH = -3.5;
    dE = -1;
    dJ = -1;
  } else if (isMorning) {
    dH = -4;
    dE = -2.5;
    dJ = -1.5;
  } else if (isDaytime) {
    dH = -3;
    dE = -2.5;
    dJ = -2;
  } else if (isAfternoon) {
    dH = -2.5;
    dE = -2;
    dJ = -1.5;
  } else if (isDusk) {
    dH = -2;
    dE = -1.5;
    dJ = -1;
  } else if (isEvening) {
    dH = -1.5;
    dE = -1;
    dJ = -0.8;
  }

  if (wx === "storm") {
    dJ -= 3;
    dE -= 1;
    dH -= 1;
  } else if (wx === "rain" || wx === "drizzle") {
    dJ -= 1.5;
    dE -= 0.5;
  } else if (wx === "snow") {
    dH -= 1;
    dE -= 1;
    dJ -= 0.5;
  } else if (wx === "fog") {
    dJ -= 0.5;
  } else if (wx === "clear" && (isDaytime || isAfternoon)) {
    dJ += 1;
  }

  if (_state.hunger < 25) dE -= 1.5;
  if (_state.energy < 20) dJ -= 1.5;
  if (_state.clean < 20) dJ -= 1;
  if (_state.joy < 20) dH -= 1;
  if (isNight && _state.joy < 50) dJ -= 0.5;

  return { dH, dE, dJ, dC };
}

export function applyOfflineDrift() {
  if (!_state.lastSaved) return;
  const ticks = Math.min(
    Math.floor((Date.now() - _state.lastSaved) / _getDriftInterval()),
    120,
  );
  if (ticks <= 0) return;
  const hour = new Date().getHours();
  const { dH, dE, dJ, dC } = computeDriftDeltas(hour, null);
  _state.hunger = _clamp(_state.hunger + dH * ticks);
  _state.energy = _clamp(_state.energy + dE * ticks);
  _state.joy = _clamp(_state.joy + dJ * ticks);
  _state.clean = _clamp(_state.clean + dC * ticks);
}

// onTick callbacks injected by app.js to avoid circular dependency
let _onDriftTick = null;
export function setDriftTickCallback(fn) {
  _onDriftTick = fn;
}

export function driftStats(currentWeatherType) {
  const hour = new Date().getHours();
  const { dH, dE, dJ, dC } = computeDriftDeltas(hour, currentWeatherType);
  _state.hunger = _clamp(_state.hunger + dH);
  _state.energy = _clamp(_state.energy + dE);
  _state.joy = _clamp(_state.joy + dJ);
  _state.clean = _clamp(_state.clean + dC);
  if (_onDriftTick) _onDriftTick(); // calls render() + checkEnergyWakeUp() in app.js
}
