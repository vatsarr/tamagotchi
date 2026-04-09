# Pikpika 🐒

A browser-based pocket companion — a tiny tamagotchi-style pet that lives in your tab.

[**Live demo →**](https://vatsarr.github.io/tamagotchi/)

---

## What it does

You adopt a little monkey named **Punch** (rename them in settings). Keep them alive and happy by tending to four stats that slowly decay while the page is open:

| Stat            | Decays when…                    | Restored by |
| --------------- | ------------------------------- | ----------- |
| **Hunger**      | Always ticking down             | Feed 🍌     |
| **Energy**      | Always ticking down             | Nap 💤      |
| **Joy**         | Always ticking down             | Play 🌿     |
| **Cleanliness** | Feeding and playing make a mess | Clean 🛁    |

---

## Features

### 🐵 Animated character

Punch is a pure-CSS monkey with idle animations — blinking, grooming, dozing, sniffing, waving — that fire on a randomised schedule. Actions trigger dedicated animations (eating, bouncing, sleeping, bathing).

### 🌤 Live weather & time of day

The sky panel pulls real weather from [Open-Meteo](https://open-meteo.com/) based on your location and updates every 30 minutes. Rain, snow, storms, and fog each spawn animated particles. The background shifts through eight time periods from late night to dusk, with a moving sun/moon and twinkling stars at night.

### 🍌 Feed cooldown ring

After feeding, an orange arc traces the button border as the 30-second digestion cooldown counts down — no number, just the sweep.

### 📊 Smooth stat bars

All four stat bars animate smoothly when values change, with colour shifts from green → amber → red as stats get critical.

### 🌗 Dark mode

Full dark/light mode with a toggle in Settings, defaulting to system preference.

### 💾 Auto-save

State is persisted to `localStorage` and offline drift is calculated on return — if you leave for an hour, Punch will be hungrier and sleepier when you come back.

---

## Tech

Vanilla JS (ES modules), CSS only for all animations and the character. No framework, no build step — open `pika.html` directly or serve from any static host.
