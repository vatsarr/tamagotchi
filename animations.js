// ============================================================
// animations.js — Idle scheduler, action anims, wake-up system,
//                  particle spawners (stars, zzz, bubbles)
//
// Receives `state`, `petEl`, `stageEl`, and callbacks via
// initAnimations(). No direct DOM queries at module level.
// ============================================================

let _state, _petEl, _stageEl, _setMessage;

export function initAnimations({ state, petEl, stageEl, setMessage }) {
  _state = state;
  _petEl = petEl;
  _stageEl = stageEl;
  _setMessage = setMessage;
}

// ── Action animations ────────────────────────────────────────

export function triggerAnim(className, durationMs) {
  _petEl.classList.remove(
    "action-munch",
    "action-excited",
    "action-yawn",
    "action-blink",
  );
  void _petEl.offsetWidth; // force reflow to restart animation
  _petEl.classList.add(className);
  setTimeout(() => _petEl.classList.remove(className), durationMs);
}

export function lockIdleForDuration(durationMs) {
  idleAnimLocked = true;
  setTimeout(() => {
    idleAnimLocked = false;
  }, durationMs + 100);
}

// ── Particle spawners ────────────────────────────────────────

export function spawnStars(count = 6) {
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

export function spawnZzz(count = 3) {
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

export function spawnBubbles(count = 9) {
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

  idleAnimLocked = true;
  IDLE_ANIMS.forEach((a) => _petEl.classList.remove(a.cls));

  _petEl.classList.add("action-wakeup");
  setTimeout(() => {
    _petEl.classList.remove("action-wakeup");
    idleAnimLocked = false;
  }, 1500);

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
  { cls: "idle-tailwag", dur: 600, baseWeight: 4 },
  { cls: "idle-scratch", dur: 950, baseWeight: 3 },
  { cls: "idle-look", dur: 1050, baseWeight: 3 },
  { cls: "idle-bounce", dur: 700, baseWeight: 3 },
  { cls: "idle-groom", dur: 1150, baseWeight: 3 },
  { cls: "idle-sniff", dur: 1050, baseWeight: 2 },
  { cls: "idle-wave", dur: 900, baseWeight: 2 },
  { cls: "idle-yawn", dur: 1650, baseWeight: 0 },
  { cls: "idle-doze", dur: 2050, baseWeight: 0, onStart: () => spawnZzz(2) },
  { cls: "idle-shiver", dur: 1150, baseWeight: 1 },
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
  const actionClasses = [
    "action-munch",
    "action-excited",
    "action-yawn",
    "action-blink",
    "action-wakeup",
  ];
  if (actionClasses.some((c) => _petEl.classList.contains(c))) return;

  const anim = pickIdle();
  _petEl.classList.add(anim.cls);
  if (anim.onStart) anim.onStart();
  idleAnimLocked = true;
  setTimeout(() => {
    _petEl.classList.remove(anim.cls);
    idleAnimLocked = false;
  }, anim.dur + 80);
}

export function startIdleScheduler() {
  function scheduleNext() {
    setTimeout(
      () => {
        fireIdleAnim();
        scheduleNext();
      },
      3000 + Math.random() * 4000,
    );
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
