# LightGuide Application Discovery and MVP Backlog

**Status:** Working product plan  
**Brand:** LightGuide is a temporary codename  
**Relationship to V1:** This document expands the application experience without replacing the current Measure → Save → Recreate architecture or Phase-0 AR positioning gate.

## 1. Scope decision

The current engineering source of truth remains:

- V1 proves reliable capture and recreation of a real lighting setup.
- Phone AR/visual references are tested before commercial electronics are locked.
- One node is implemented first, while the data model supports multiple nodes.
- AI-generated artistic recommendations are a later product layer and must not delay V1 recreation validation.

The broader application can be designed now, but only the V1 Must backlog should be implemented before the physical recreation loop is proven.

### Delivery-platform decision

- Phase 0 and first physical positioning validation use native Android/Kotlin with ARCore.
- The available Windows development environment and ARCore-compatible phone support this route.
- Per ADR-015, implement the React Native/TypeScript + Expo Development Builds offline shell alongside physical testing, with platform-specific spatial modules behind a shared interface. Live measured positioning still requires the Phase-0 evidence. Follow [the implementation handoff](../engineering/CLAUDE_BUILD_HANDOFF.md) for execution order.
- Expo Go is not a valid AR/BLE test environment.
- iPhone remains a commercial requirement, but Swift/ARKit implementation and validation are deferred until Mac/Xcode and physical iPhone test access exist.
- The five-photographer beta must not be advertised as iPhone-compatible until that implementation is genuinely tested.

## 2. Product experience decisions

### Target users

Studio/location photographers working with controlled portrait or product lighting.

### Main navigation

1. **Home** — active work, recent setups and quick actions.
2. **Shoots** — references, camera, equipment, setup and results.
3. **Create** — save a current setup; later build from reference or request recommendations.
4. **Setups** — saved lighting library and Recreation Mode.
5. **Equipment** — cameras, lenses, lights, modifiers, kits and nodes.

Profile, help, notifications and settings do not need primary navigation positions.

### Low-friction capture

Quick Capture should require only:

- result photograph;
- behind-the-scenes setup photograph;
- portrait or product;
- generated or editable setup name.

Power, modifier, distance, height, direction, tilt, colour temperature and notes are optional. Save first; enrich later.

### Camera workflow

- users add multiple cameras and lenses once;
- a planned camera/lens is selected per shoot;
- available EXIF verifies actual equipment/settings after an image is captured;
- a mismatch offers update, keep planned, add secondary camera or ignore;
- camera brand alone does not trigger a new lighting layout.

### Equipment workflow

The inventory grows progressively rather than requiring full studio cataloguing during onboarding. In the initial lean application prototype, select equipment individually; reusable kits remain a deferred Should feature. Capability data matters more than brand names for future substitutions.

### Database design decision

The agreed logical prototype model uses seven core application tables and structured setup-version snapshots. See [Lean Prototype Database Design](DATABASE_DESIGN.md) and ADR-012 in [DECISIONS.md](../DECISIONS.md). Measurement provenance, historical versions, ownership and offline-sync safeguards remain required. This is a documented design, not an implemented database, and does not change the Phase-0 positioning priority.

### Device workflow

- BLE is the preferred local node connection;
- the node is portable and temporarily assigned to Key, Fill, Rim or another role;
- it is never permanently assigned to a physical stand;
- a different compatible stand can be used during recreation;
- consistent mount alignment and calibration are required;
- the node continues the current target if the phone disconnects;
- selecting another light can require phone reconnection in the first version.

### Offline, accounts and privacy

- active shoots, saved setups, equipment and already-generated guidance remain available offline;
- one setup can be tried before account creation;
- planned authentication: Google, Apple and email magic link;
- optimised cloud images are the default; originals remain local unless enabled;
- customer photographs are excluded from model training by default;
- any training consent is separate, explicit and revocable.

### Commercial principles

- the free application remains useful with limited setups and later limited AI;
- buying a node permanently includes its essential operation;
- subscriptions pay for ongoing services such as greater AI usage, storage, collaboration and multi-node orchestration;
- do not promise unlimited AI or storage before unit economics are known.

## 3. MoSCoW priorities

### Must — V1 prototype

| ID | Requirement | Acceptance summary |
|---|---|---|
| M01 | Fast first-use explanation | User understands Measure → Save → Recreate without registration or technical AR terminology. |
| M02 | Local setup creation | A named setup is created and persists across app restarts. |
| M03 | Subject/studio reference | User establishes a repeatable reference frame with clear tracking-quality feedback. |
| M04 | One-light capture | One light pose is captured only when tracking is valid and stable. |
| M05 | Optional setup metadata | Role, camera, lens, light, modifier, power and photographs can be added without blocking capture. |
| M06 | Setup library | Saved setups can be found, opened, edited and archived offline. |
| M07 | Manual fallback | Setup photographs/metadata remain usable when live positioning is unavailable. |
| M08 | Recreation preparation | User re-establishes the saved reference and selects the target light. |
| M09 | Live guidance | App gives left/right, forward/back, raise/lower, rotate and tilt guidance. |
| M10 | Valid match state | Matched appears only when required dimensions are current, valid and inside tolerance. |
| M11 | Tracking-loss recovery | Stale data cannot confirm a match; the app gives a clear reacquisition action. |
| M12 | Recreation outcome | User records success, adjustment and comparison evidence. |
| M13 | Offline core | Save and recreate do not require internet. |
| M14 | Multi-node-ready identity | Data model supports stable node IDs even though one node is tested first. |
| M15 | Validation logging | Position, orientation, relocalisation, completion time and failures can be exported/analysed. |
| M16 | Five-user evidence | Five photographers complete a real capture-to-recreation trial before MVP claims. |

### Should — after the core recreation loop works

- guest Quick Capture with two photographs;
- camera/lens inventory and EXIF mismatch handling;
- equipment kits;
- account creation and optimised cloud backup;
- one-node BLE telemetry and independent current-target guidance;
- setup readiness labels and basic version history;
- accessible non-colour guidance;
- private sharing with Viewer/Operator/Editor permissions.

### Could — later product expansion

- subject/reference-photo analysis;
- equipment-aware substitutions;
- artistic setup recommendations;
- collaborative studio workspace;
- simultaneous multi-node orchestration;
- advanced comparison, exports and analytics;
- equipment catalogue, barcode scanning and calendar integrations.

### Won't — V1

- automatic “perfect lighting” claims;
- exact reconstruction from one ordinary photograph;
- cloud dependency;
- browser-only Bluetooth;
- mandatory long forms;
- permanent node-to-stand assignment;
- autonomous motorised stands;
- full CRM, social feed or setup marketplace;
- customer-image training by default;
- subscription requirement for essential purchased-device use.

## 4. Must-have user stories

### US01 — Understand the product

As a first-time photographer, I want a short guided example so that I understand what the product records and recreates.

**Acceptance:** The flow communicates Measure → Save → Recreate without requiring an account or exposing AR/SLAM jargon.

### US02 — Establish a reusable reference

As a photographer, I want to scan a subject/studio reference so that measurements can be compared across sessions.

**Acceptance:** The app confirms valid reference establishment and provides a recovery instruction when quality is insufficient.

### US03 — Capture one light

As a photographer, I want to capture a real light pose so that I do not manually record every spatial value.

**Acceptance:** Current X/Y/Z and required orientation are saved only after validity/stability checks pass.

### US04 — Add only useful context

As a photographer, I want optional photographs and equipment details so that documentation does not interrupt the shoot.

**Acceptance:** Setup saving succeeds without completing optional metadata.

### US05 — Find a setup offline

As a photographer, I want to reopen previous setups without internet so that studio connectivity cannot block work.

**Acceptance:** Local search/open/edit/archive works after restarting in airplane mode.

### US06 — Re-establish the scene

As a photographer, I want guidance to reacquire the original reference so that current and saved positions are comparable.

**Acceptance:** Recreation cannot begin with an invalid coordinate frame.

### US07 — Receive physical corrections

As a photographer, I want one clear movement instruction at a time so that I can reposition the light efficiently.

**Acceptance:** Guidance updates with current pose and covers translation, height and orientation without requiring coordinate knowledge.

### US08 — Trust the match state

As a photographer, I want Match to depend on fresh valid measurements so that stale or uncertain tracking never creates false confidence.

**Acceptance:** Loss of tracking immediately removes Match and requests reacquisition.

### US09 — Record recreation evidence

As a photographer, I want to record time, outcome and photographs so that the product can be compared with manual recreation.

**Acceptance:** A trial stores completion time, final deltas, failures, outcome and optional image evidence.

### US10 — Use a portable node later

As a photographer, I want a node associated with a light role rather than a particular stand so that any compatible stand can recreate the setup.

**Acceptance:** Device identity and temporary Key/Fill/Rim assignment are separate fields.

### US11 — Continue through disconnection

As a photographer, I want the node to retain its current target if the phone disconnects so that an interruption does not stop physical adjustment.

**Acceptance:** The current target remains available locally; stale measurements are never synced as fresh after reconnection.

### US12 — Provide real-user feedback

As a beta photographer, I want a short post-trial feedback step so that I can report difficulty and usefulness quickly.

**Acceptance:** Completion, comprehension, perceived accuracy, time saved and optional comments are recorded.

## 5. Sprint plan

Sprint lengths are estimates for one developer. Exit criteria control progression.

### Sprint 0 — Reconcile and prototype the critical flow (3–5 days)

- preserve current V1 architecture and legacy code boundaries;
- map the minimal Measure → Save → Recreate screens;
- verify local persistence and mock pose/device interfaces;
- define analytics fields needed for Phase-0 validation.

**Exit:** A clickable/working shell demonstrates the complete V1 journey with simulated pose data.

### Sprint 1 — Phase-0 AR capture

- establish subject/studio reference;
- detect known marker/reference;
- capture X/Y/Z and orientation;
- implement stability and validity gating;
- log trial data.

**Exit:** 20–30+ measured trials produce repeatability, range and failure evidence.

### Sprint 2 — Local setup library

- save named setups locally;
- add optional photographs/equipment metadata;
- list, search, open, edit and archive;
- prove restart and offline recovery.

**Exit:** A saved setup remains usable after restart with internet disabled.

### Sprint 3 — Recreation guidance

- re-establish reference frame;
- calculate saved-versus-current deltas;
- present photographer-friendly corrections;
- implement tolerance and tracking-loss states;
- record completion time and final error.

**Exit:** One light can be moved and restored using phone-led guidance.

### Sprint 4 — Usability and manual fallback

- Quick Capture photographs;
- optional camera/lens/equipment context;
- manual recreation reference when tracking is unavailable;
- accessibility and error-state refinement;
- compact feedback prompts.

**Exit:** A photographer completes the journey without developer explanation.

### Sprint 5 — One-node integration

Begins only after Phase 0 supports the positioning direction and actual hardware/protocol are known.

- BLE device identity and connection;
- temporary role assignment;
- telemetry validity;
- current-target storage and reconnect behaviour;
- calibration and mount-alignment flow.

**Exit:** One physical node participates in a complete offline capture/recreation trial.

### Sprint 6 — Five-photographer validation

- benchmark against memory/manual placement;
- run portrait and product scenarios;
- collect setup time, error, image outcome and comprehension;
- document failures and update decisions.

**Exit:** Evidence supports continuing, changing or stopping the product direction. Only a supported result should be called an MVP.

## 6. Definition of Done

A story is complete only when:

- acceptance criteria pass on the target platform;
- relevant work functions offline;
- interrupted work recovers safely;
- stale/invalid pose or telemetry cannot confirm a match;
- error and empty states provide a recovery action;
- mock data is clearly labelled;
- validation evidence is recorded.

## 7. Open decisions

- final Vedic/Sanskrit-rooted commercial brand;
- outcome of React Native/Expo offline-shell implementation and eventual native spatial integration;
- iPhone ARKit implementation and validation once Mac/Xcode access exists;
- result of Phase-0 AR positioning validation;
- commercial MCU, IMU, sensors, battery, enclosure and mount;
- BLE GATT services, security and firmware-update path;
- backend/sync provider;
- final AI provider and recommendation method;
- pricing, allowances and storage limits;
- beta photographer recruitment.

## 8. Scope control

Do not implement AI recommendation, collaboration or productisation work while the Measure → Save → Recreate exit gate is failing. Recruit photographers during development rather than waiting for a polished product.
