# Warehouse Game – MVP Plan

**Working title:** Pompwagen Tycoon (placeholder, pick a real name later)
**Team:** Alex (lead, builds with Claude Code / Codex, iOS tester) · Arturs (game design, Android tester)
**Goal of the MVP:** A web game that runs smoothly on iPhone and Samsung, where the player spawns with a pompwagen (hand pallet truck), finishes a short tutorial, and gets hooked on the move → deliver → earn → upgrade loop.

> Note: the Dutch word is **pompwagen** (hand pallet truck). Electric version = elektrische pompwagen, forklift = heftruck.

---

## 1. Game concept (MVP scope)

**Genre:** "Idle arcade" / tycoon. The player controls a character directly with a joystick, carries pallets between zones, earns money, and buys upgrades and helpers that eventually do the work for them.

**Core loop:**
1. A truck arrives at the **Inbound Dock** and drops pallets.
2. The player drives the pompwagen over the pallets to pick one up.
3. The player drops it in the **Storage Rack** zone.
4. Orders appear at the **Shipping Dock**. The player takes stock from the rack to shipping.
5. Shipped order = money.
6. Money buys upgrades: faster pompwagen, more capacity, more rack space, hired workers.

**Vehicle progression (Arturs's idea):**
| Stage | Vehicle | Carries | Speed | MVP? |
|---|---|---|---|---|
| 1 | Pompwagen | 1 pallet | slow | ✅ |
| 2 | Electric pompwagen | 2 pallets | medium | ✅ |
| 3 | Forklift | 3 pallets + low racks | fast | ❌ Milestone after MVP (show it locked with "Coming soon") |
| 4 | Reach truck | high racks | fast | ❌ Later |

**In the MVP:**
- 1 warehouse (small hall), 3 zones: Inbound, Storage, Shipping
- Pompwagen + electric pompwagen upgrade
- 4 upgrade types (see Economy)
- 1 hireable worker type (auto-carries pallets between zones)
- Tutorial (~60–90 seconds)
- Night shift offline earnings with a "shift report" screen
- Local save

**NOT in the MVP (write these down, don't build them yet):**
Forklift and high racks, certifications/training timers, safety rating, contracts, cold storage, events, ads, prestige, multiplayer, first-person view, accounts/cloud save.

---

## 2. Tech stack

Chosen for: good graphics, strong mobile performance, easy path to App Store / Play Store, and AI coding tools know it very well.

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript | Catches bugs early, AI tools write it well |
| Build tool | Vite | Fast, simple |
| 3D engine | Three.js | Huge ecosystem, runs in mobile browsers, first-person later is just a camera change |
| UI / HUD | HTML + CSS overlay on top of the canvas | Crisp text, easy buttons, handles iPhone notch safe areas |
| Joystick | Custom floating joystick (or nipplejs) | Appears where the thumb touches |
| Animation/tweens | GSAP or tween.js | Money pop-ups, UI bounce |
| Audio | Howler.js | Handles iOS audio unlock quirks |
| Save | localStorage (versioned JSON) | Fine for MVP, cloud save later |
| Hosting | Vercel | Free, every git push gives a test link for both phones |
| Version control | Git + GitHub | Alex and Arturs work on the same repo |
| Mobile app (later) | Capacitor | Wraps the same web game into iOS + Android apps, supports AdMob plugins |

**Alternative if 3D gets too heavy:** Phaser (2D). Not recommended as the first choice because graphics and a later first-person mode are priorities.

---

## 3. Graphics direction

- **Style:** Low-poly, bright flat colors, soft lighting. Think cozy toy warehouse, not realistic.
- **Camera:** Angled top-down (about 55°), perspective, smoothly follows the player. Slight zoom-out as the warehouse grows.
- **Orientation:** Portrait first (one-handed play on phones). Must still work in landscape and on desktop.
- **Dutch flavor:** Orange/yellow safety vests, blue-white sky through dock doors, bikes parked outside, Dutch-style truck plates, pallet labels.
- **Juice (makes it feel good):** Pallets bounce onto the pompwagen, money floats up with a "cha-ching", zones pulse when you can interact, dust puffs when driving.
- **Assets:** Start with free CC0 low-poly packs (e.g. Kenney, Quaternius, KayKit) as placeholders. Replace with custom models later. Always check each asset's license.
- **Format:** glTF/GLB models, compressed.

### Performance budget (must hold on Arturs's Samsung)
- 60 fps target, never below 30
- Under ~100 draw calls on screen
- Use instanced meshes for pallets, boxes, and rack pieces
- One shadow-casting light, small shadow map (or fake blob shadows)
- Textures max 1024×1024
- Cap pixel ratio at 2 (lower automatically if fps drops)
- Initial download under ~15 MB
- Show an fps counter in dev builds

---

## 4. Mobile controls & quirks

**Controls:**
- Floating joystick: touch anywhere on the lower part of the screen, drag to move
- No action button in the MVP: pick up / drop happens automatically when standing in a zone (classic idle-arcade feel, great for one thumb)
- Desktop: WASD / arrow keys + mouse drag as fallback

**iPhone / Safari checklist:**
- Disable pinch-zoom and double-tap zoom
- Respect safe areas (notch, home bar) with `env(safe-area-inset-*)`
- Use `100dvh`, not `100vh`
- Unlock audio on first touch
- Vibration API doesn't work on iOS Safari (haptics only later in the native app)
- Support "Add to Home Screen" (PWA manifest) so it opens fullscreen

**Android / Samsung checklist:**
- Test in Chrome and Samsung Internet
- Haptic feedback via vibration on pickup/drop
- Check performance with battery saver ON
- Handle the back gesture (don't accidentally leave the game)

---

## 5. Tutorial (first 60–90 seconds)

Each step shows a bouncing arrow on the ground + a short text bubble. The next step only starts when the current one is done.

| # | Text | Trigger to continue |
|---|---|---|
| 1 | "Welcome to your first shift! Drag anywhere to drive your pompwagen." | Player moves a short distance |
| 2 | "A truck just arrived. Drive to the inbound dock." | Player enters Inbound zone |
| 3 | (auto pickup, pallet bounces onto pompwagen) "Nice! Bring it to the racks." | Player enters Storage zone |
| 4 | (auto drop) "Stored! An order just came in." | Order appears at Shipping |
| 5 | "Grab the goods from the racks and bring them to shipping." | Order shipped |
| 6 | (money pop) "You got paid! Let's spend it." | Upgrade button highlighted |
| 7 | "Buy your first upgrade: Faster pompwagen." | Upgrade bought |
| 8 | "You're ready. Grow your warehouse!" | Tutorial complete, saved |

Rules: player can't fail, first truck and order are free and instant, skip button appears after step 2 for returning testers.

---

## 6. Economy (starter numbers, tune during playtests)

| Item | Start value | Upgrade effect | Cost formula |
|---|---|---|---|
| Pallet payout | €5 per shipped pallet | – | – |
| Pompwagen speed | 3 m/s | +8% per level | €20 × 1.15^level |
| Rack capacity | 6 pallets | +2 per level | €40 × 1.20^level |
| Truck frequency | 1 truck / 20 s | −8% time per level | €30 × 1.18^level |
| Hire worker | – | +1 worker (auto-carries) | €150 × 1.5^workers |
| Electric pompwagen | – | carries 2, faster base speed | €500 one-time |

**Night shift (offline earnings):**
- Only hired workers earn while offline
- Cap at 4 hours in MVP
- On return: "Night Shift Report" screen showing pallets moved and money earned
- (Later with ads: "Watch ad to double")

**Target feel:** First upgrade within 1 minute, electric pompwagen within ~15–20 minutes, first worker within ~5 minutes.

---

## 7. Code architecture

Keep **game logic separate from graphics**. This makes saving easy, lets workers run offline, and makes a first-person camera possible later without rewriting the game.

```
src/
  main.ts              # boot, loading screen
  core/
    GameState.ts       # money, upgrades, inventory (pure data)
    SaveSystem.ts      # versioned localStorage save/load
    Economy.ts         # cost formulas, payouts
    OfflineEarnings.ts # night shift calculation
    EventBus.ts        # "palletPicked", "orderShipped", etc.
  config/
    upgrades.json      # all numbers live here, not in code
    vehicles.json
    tutorial.json
  world/
    Scene.ts           # Three.js renderer, lights, camera
    CameraRig.ts       # follow camera (first-person later)
    Warehouse.ts       # floor, walls, zones
    Player.ts          # character + vehicle
    Worker.ts          # AI helper
    Zones.ts           # inbound, storage, shipping triggers
    Truck.ts
  input/
    Joystick.ts
    Keyboard.ts
  ui/
    Hud.ts             # money, buttons
    UpgradePanel.ts
    TutorialOverlay.ts
    ShiftReport.ts
  audio/
    Sound.ts
  debug/
    DevPanel.ts        # fps, add money, reset save
public/
  models/ sounds/ textures/
```

**Rules for the AI coding agent** (put these in `CLAUDE.md` for Claude Code, `AGENTS.md` for Codex):
- TypeScript strict mode
- No gameplay numbers hardcoded, always read from `config/`
- Game logic never imports Three.js
- Every new feature must be testable on a phone-sized viewport
- Keep files small and focused
- After each feature: run the build, fix all errors

---

## 8. Milestones

Each milestone ends with both phones testing the Vercel link.

### M0 – Setup (1 evening)
- GitHub repo, Arturs invited
- Vite + TypeScript + Three.js project
- `CLAUDE.md` / `AGENTS.md` with rules above
- Deployed to Vercel, spinning cube opens on iPhone and Samsung
- **Done when:** both of you open the link on your phones

### M1 – Movement feels good (2–4 days)
- Warehouse floor + walls (simple boxes are fine)
- Character with pompwagen (placeholder model)
- Floating joystick + keyboard
- Follow camera
- Wall collisions (simple box collisions, no physics engine)
- Dev panel with fps counter
- **Done when:** driving around is fun on both phones for 2 minutes with nothing else in the game

### M2 – Core loop (4–6 days)
- Truck arrives and drops pallets at Inbound
- Auto pickup / drop in zones with bounce animation
- Storage rack fills visually
- Orders appear at Shipping, shipping gives money
- HUD with money counter
- **Done when:** you can play the loop and money goes up

### M3 – Upgrades & helpers (3–5 days)
- Upgrade panel (bottom sheet on mobile)
- 4 upgrades from the economy table
- Electric pompwagen unlock (visible model change)
- Hire worker (simple AI walks between zones)
- Forklift shown locked "Coming soon"
- **Done when:** buying upgrades noticeably speeds things up

### M4 – Tutorial + save + night shift (3–4 days)
- Tutorial steps from section 5
- Save/load with version number
- Offline earnings + Shift Report screen
- Reset save button in dev panel
- **Done when:** a new player (someone who's never seen it) finishes the tutorial without help

### M5 – Polish (4–7 days)
- Replace placeholders with a consistent low-poly asset pack
- Sounds: engine hum, pallet clunk, cash register, UI clicks
- Particles, money pop-ups, zone pulse
- Android haptics
- Loading screen, settings (sound on/off)
- PWA manifest (home screen icon)
- **Done when:** it looks like a real game in a screenshot

### M6 – Playtest week (7 days)
- Share the link with 5–10 friends
- Watch someone play without explaining anything
- Track: finished tutorial? Came back next day? Where did they stop?
- **Done when:** you decide what to fix or build next based on what testers actually did

**Rough total:** 4–6 weeks of evenings, depending on shifts.

---

## 9. After the MVP (roadmap)

1. **Forklift + low racks**, then **reach truck + high racks**
2. **Certifications:** workers need training time before driving vehicles (main grind wall)
3. **Contracts** with deadlines and reputation
4. **Mobile apps** with Capacitor (iOS build from the MacBook with Xcode, Android build with Android Studio)
5. **Rewarded ads** (optional only): skip training, double night shift, temp workers during rush
6. **Cold storage** zone, **peak season** events
7. **Safety rating**
8. **Prestige:** sell the company, restart in a bigger city with permanent bonus
9. **First-person mode** (Arturs's idea): camera swap on the same world, needs its own mobile controls (left joystick move, right side drag to look)
10. **Cloud save** + accounts

App store accounts will be needed at step 4: Apple Developer Program (yearly fee) and Google Play Console (one-time fee). Check current prices when you get there.

---

## 10. Team workflow

- **Alex:** runs Claude Code / Codex, merges code, iOS testing
- **Arturs:** game design notes, balancing numbers in `config/`, Android testing, finding assets
- Work on branches, one feature per branch, Vercel gives each branch its own test link
- Shared test checklist after every milestone:
  - [ ] Loads in under 5 seconds on 4G
  - [ ] 60 fps while driving (check dev panel)
  - [ ] Joystick responsive, no accidental zoom/scroll
  - [ ] Text readable, nothing hidden under notch
  - [ ] Save survives closing the browser
  - [ ] Works in portrait and landscape
- Keep a `docs/ideas.md` file for everything that's NOT in the current milestone, so ideas don't get lost and scope doesn't explode

---

## 11. First prompt for Claude Code / Codex

Copy this to start M0 + M1:

```
We're building a mobile-first 3D web game: a warehouse idle-arcade tycoon.
Read the plan in docs/mvp-plan.md.

Start with Milestone 0 and Milestone 1 only:
- Set up Vite + TypeScript (strict) + Three.js
- Create CLAUDE.md with the coding rules from section 7 of the plan
- Use the folder structure from section 7
- Build a simple warehouse floor with walls
- A placeholder character on a pompwagen (hand pallet truck) made of simple shapes
- Floating touch joystick on the lower screen + WASD fallback
- Angled top-down follow camera, portrait-first, responsive
- Simple box collisions with walls
- Dev panel with fps counter
- Handle iOS Safari quirks: no pinch/double-tap zoom, safe areas, 100dvh
- Cap pixel ratio at 2

Do not build any gameplay beyond movement yet.
When finished, tell me how to run it locally and how to deploy to Vercel.
```

Save this plan in the repo as `docs/mvp-plan.md` so the agent can always re-read it.
