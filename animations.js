// ============================================================
// animations.js — Idle scheduler, action anims, wake-up system,
//                  particle spawners (stars, zzz, bubbles)
//
// Receives `state`, `petEl`, `stageEl`, and callbacks via
// initAnimations(). No direct DOM queries at module level.
// ============================================================

let _state, _petEl, _stageEl, _setMessage;

// ── Animation settings (derived from state + system prefs) ───
// Recomputed by applyAnimSettings() whenever state changes.
let _reducedMotion = false;
let _particleScale  = 1;   // 0 | 0.5 | 1 | 1.5  (off/low/normal/high)
let _idleMinMs      = 3000;
let _idleRangeMs    = 4000;

export function initAnimations({ state, petEl, stageEl, setMessage }) {
  _state    = state;
  _petEl    = petEl;
  _stageEl  = stageEl;
  _setMessage = setMessage;
  // Listen for OS-level reduced-motion changes
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  _reducedMotion = mq.matches;
  mq.addEventListener("change", (e) => {
    _reducedMotion = e.matches;
    applyAnimSettings();
  });
  applyAnimSettings();
  initEyeTracking(petEl);
}

/**
 * Re-reads state.starIntensity and prefers-reduced-motion,
 * then updates all animation rate/count knobs in one place.
 * Call from app.js whenever state.starIntensity changes.
 */
export function applyAnimSettings() {
  _reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (_reducedMotion) {
    _particleScale = 0;
    _idleMinMs     = 6000;
    _idleRangeMs   = 6000;
    return;
  }
  const intensity = _state?.starIntensity ?? "normal";
  switch (intensity) {
    case "off":
      _particleScale = 0;
      _idleMinMs     = 5000;
      _idleRangeMs   = 5000;
      break;
    case "low":
      _particleScale = 0.5;
      _idleMinMs     = 4000;
      _idleRangeMs   = 5000;
      break;
    case "high":
      _particleScale = 1.5;
      _idleMinMs     = 2000;
      _idleRangeMs   = 3000;
      break;
    default: // "normal"
      _particleScale = 1;
      _idleMinMs     = 3000;
      _idleRangeMs   = 4000;
  }
}

// ── Action animations ────────────────────────────────────────

const ACTION_CLASSES = [
  "action-munch",
  "action-excited",
  "action-yawn",
  "action-blink",
  "action-wakeup",
];

let _animTimer = null;
let _idleLockTimer = null;

export function triggerAnim(className, durationMs) {
  // Cancel any in-flight action animation timer
  if (_animTimer) { clearTimeout(_animTimer); _animTimer = null; }
  ACTION_CLASSES.forEach((c) => _petEl.classList.remove(c));
  void _petEl.offsetWidth; // force reflow to restart animation
  _petEl.classList.add(className);
  _animTimer = setTimeout(() => {
    _petEl.classList.remove(className);
    _animTimer = null;
  }, durationMs);
}

export function lockIdleForDuration(durationMs) {
  if (_idleLockTimer) { clearTimeout(_idleLockTimer); _idleLockTimer = null; }
  idleAnimLocked = true;
  _idleLockTimer = setTimeout(() => {
    idleAnimLocked = false;
    _idleLockTimer = null;
  }, durationMs + 150);
}

// ── Particle spawners ────────────────────────────────────────

export function spawnStars(baseCount = 6) {
  const count = Math.round(baseCount * _particleScale);
  if (count <= 0) return;
  const emojis = ["⭐", "✨", "💫", "🌟"];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "star-burst";
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
    const dist = 38 + Math.random() * 24;
    el.style.cssText = `left:50%;top:40%;--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist}px;animation-delay:${i * 0.04}s`;
    _stageEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
}

export function spawnZzz(baseCount = 3) {
  const count = Math.max(1, Math.round(baseCount * _particleScale));
  if (_particleScale <= 0) return;
  const letters = ["z", "Z", "z"];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "zzz-particle";
    el.textContent = letters[i % letters.length];
    const dx = Math.random() * 30 - 15;
    el.style.cssText = `left:${52 + dx}%;top:18%;font-size:${13 + i * 4}px;--dx:${dx}px;animation-delay:${i * 0.28}s`;
    _stageEl.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }
}

export function spawnBubbles(baseCount = 9) {
  const count = Math.round(baseCount * _particleScale);
  if (count <= 0) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "soap-bubble";
    const size = 10 + Math.random() * 18;
    const startX = 30 + Math.random() * 40;
    const dx = Math.random() * 40 - 20;
    const ddx = dx + (Math.random() * 20 - 10);
    const dur = 0.9 + Math.random() * 0.7;
    el.style.cssText = `width:${size}px;height:${size}px;left:${startX}%;bottom:20%;--dx:${dx}px;--ddx:${ddx}px;--dur:${dur}s;--sf:${0.7 + Math.random() * 0.6};animation-delay:${i * 0.08}s`;
    _stageEl.appendChild(el);
    setTimeout(() => el.remove(), (dur + i * 0.08 + 0.3) * 1000);
  }
}

// ── Wake-up system ───────────────────────────────────────────

let lastKnownPeriod = null;
let lastWakeTime = 0;
const WAKE_COOLDOWN_MS = 60000;

export function playWakeUp(reason) {
  const now = Date.now();
  if (now - lastWakeTime < WAKE_COOLDOWN_MS) return;
  lastWakeTime = now;

  if (_animTimer) { clearTimeout(_animTimer); _animTimer = null; }
  if (_idleLockTimer) { clearTimeout(_idleLockTimer); _idleLockTimer = null; }
  idleAnimLocked = true;
  IDLE_ANIMS.forEach((a) => _petEl.classList.remove(a.cls));
  ACTION_CLASSES.forEach((c) => _petEl.classList.remove(c));
  void _petEl.offsetWidth;

  _petEl.classList.add("action-wakeup");
  _animTimer = setTimeout(() => {
    _petEl.classList.remove("action-wakeup");
    idleAnimLocked = false;
    _animTimer = null;
  }, 1700);

  const n = _state.name;
  const msgs = {
    dawn: `${n} stirs at dawn, yawns widely, and stretches both arms. Good morning! 🌅`,
    morning: `${n} wakes up properly — eyes wide, arms out, ready for the day! ☀️`,
    lowEnergy: `${n} jolts awake after nearly dozing off. Those eyes snap open! 👀`,
    interaction: `${n} snaps out of a nap as you tap — arms up, big stretch! 🐒`,
    tabFocus: `${n} perks up as you return — a sleepy stretch and a curious look. 👋`,
    highEnergy: `${n} feels refreshed and leaps up with a full-body stretch! 💪`,
  };
  _setMessage(msgs[reason] || msgs.interaction);
}

export function checkPeriodWakeUp(newPeriod) {
  if (!lastKnownPeriod) {
    lastKnownPeriod = newPeriod;
    return;
  }
  if (newPeriod === lastKnownPeriod) return;
  const prev = lastKnownPeriod;
  lastKnownPeriod = newPeriod;

  if (newPeriod === "dawn" && (prev === "latenight" || prev === "night")) {
    playWakeUp("dawn");
    return;
  }
  if (newPeriod === "morning" && _state.energy > 55) {
    playWakeUp("morning");
  }
}

export function checkInteractionWakeUp() {
  if (_state.energy > 35) return;
  if (
    _petEl.classList.contains("idle-doze") ||
    _petEl.classList.contains("idle-yawn")
  ) {
    playWakeUp("interaction");
  }
}

let prevEnergy = null; // set lazily on first checkEnergyWakeUp call
export function checkEnergyWakeUp() {
  if (prevEnergy === null) {
    prevEnergy = _state.energy;
    return;
  }
  const e = _state.energy;
  if (prevEnergy < 25 && e >= 30) playWakeUp("lowEnergy");
  prevEnergy = e;
}

// ── Idle animation scheduler ─────────────────────────────────

export const IDLE_ANIMS = [
  { cls: "idle-tailwag", dur: 800,  baseWeight: 4 },
  { cls: "idle-scratch", dur: 1200, baseWeight: 3 },
  { cls: "idle-look",    dur: 1400, baseWeight: 3 },
  { cls: "idle-bounce", dur: 900,  baseWeight: 3 },
  { cls: "idle-groom",  dur: 1500, baseWeight: 3 },
  { cls: "idle-sniff",  dur: 1300, baseWeight: 2 },
  { cls: "idle-wave",   dur: 1100, baseWeight: 2 },
  { cls: "idle-yawn",   dur: 2200, baseWeight: 0 },
  { cls: "idle-doze",   dur: 2600, baseWeight: 0, onStart: () => spawnZzz(2) },
  { cls: "idle-shiver", dur: 1300, baseWeight: 1 },
];

function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function pickIdle() {
  const e = _state.energy;
  const tiredness = Math.max(0, (60 - e) / 60);

  const weighted = IDLE_ANIMS.map((a) => {
    let w = a.baseWeight;
    if (a.cls === "idle-yawn") w = Math.round(lerp(0, 5, tiredness));
    if (a.cls === "idle-doze")
      w = e < 35 ? Math.round(lerp(0, 4, (35 - e) / 35)) : 0;
    if ((a.cls === "idle-bounce" || a.cls === "idle-wave") && e < 25) w = 0;
    return { ...a, weight: w };
  });

  const pool = weighted.flatMap((a) => Array(Math.max(0, a.weight)).fill(a));
  if (!pool.length) return IDLE_ANIMS[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

export let idleAnimLocked = false;

function fireIdleAnim() {
  if (idleAnimLocked) return;
  if (ACTION_CLASSES.some((c) => _petEl.classList.contains(c))) return;

  const anim = pickIdle();
  _petEl.classList.add(anim.cls);
  if (anim.onStart) anim.onStart();
  idleAnimLocked = true;
  setTimeout(() => {
    _petEl.classList.remove(anim.cls);
    idleAnimLocked = false;
  }, anim.dur + 200);
}

export function startIdleScheduler() {
  function scheduleNext() {
    const delay = _idleMinMs + Math.random() * _idleRangeMs;
    setTimeout(() => {
      fireIdleAnim();
      scheduleNext();
    }, delay);
  }
  scheduleNext();
}

// ── Tab-focus wake hook (registered once at module load) ─────

export function registerVisibilityWakeUp(getState, getLastSaved) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - (getLastSaved() || 0) < 30000) return;
    const energy = getState().energy;
    if (energy < 30) playWakeUp("tabFocus");
    else if (energy > 70) playWakeUp("highEnergy");
  });
}

// ── Eye tracking ─────────────────────────────────────────────────

function initEyeTracking(petEl) {
  const eyes = Array.from(petEl.querySelectorAll(".eye"));
  const pupils = eyes.map((e) => e.querySelector(".pupil"));
  const MAX_DIST = 2.5; // max px translation — keeps pupil inside eyeball

  function isRestingState() {
    return (
      petEl.classList.contains("exhausted") ||
      petEl.classList.contains("action-yawn") ||
      petEl.classList.contains("idle-doze")
    );
  }

  function track(cx, cy) {
    if (isRestingState()) {
      pupils.forEach((p) => (p.style.transform = ""));
      return;
    }
    eyes.forEach((eye, i) => {
      const r = eye.getBoundingClientRect();
      const eyeCx = r.left + r.width / 2;
      const eyeCy = r.top + r.height / 2;
      const dx = cx - eyeCx;
      const dy = cy - eyeCy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const tx = (dx / dist) * Math.min(dist * 0.15, MAX_DIST);
      const ty = (dy / dist) * Math.min(dist * 0.15, MAX_DIST);
      pupils[i].style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`;
    });
  }

  // mousemove — coalesced to one rAF per frame to avoid layout thrashing
  let frameQueued = false;
  document.addEventListener("mousemove", (e) => {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(() => {
      track(e.clientX, e.clientY);
      frameQueued = false;
    });
  });

  // touch support
  document.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      track(t.clientX, t.clientY);
    },
    { passive: true },
  );

  // reset to centre when cursor leaves the window
  document.addEventListener("mouseleave", () => {
    pupils.forEach((p) => (p.style.transform = ""));
  });
}
