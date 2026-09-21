# LightGuide Documentation Map

Use this file to find the authoritative document for each type of decision.

## Start here
- [Maintained application](../apps/mobile/README.md) — Codex implementation selected for main.
- [Consolidation and branch cleanup](validation/BRANCH_CLEANUP_2026-09-14.md) — supersedes active comparison-branch instructions.
- [README overview](../README.md) — workflow, architecture summary, branch/run entry points and key documents.
- [Branch/CI evidence](validation/BRANCH_STATUS_2026-09-14.md) — both application implementations and their verification boundaries.
- [Current build handoff](../CLAUDE.md) — next task and platform/hardware boundaries.
- [Current project status](STATUS.md) — what is documented, implemented and unvalidated.
- [Software delivery handoff](engineering/CLAUDE_BUILD_HANDOFF.md) — autonomous implementation milestones, automated tests and user device handover.
- [Recovered Android source audit](validation/AR_SOURCE_AUDIT_2026-09-10.md) — branch provenance and remaining code corrections.

## Product
- [product/PRODUCT_VISION.md](product/PRODUCT_VISION.md) — long-term purpose, target user and product principles.
- [product/PRD.md](product/PRD.md) — what V1 must achieve and what is explicitly out of scope.
- [product/USER_WORKFLOWS.md](product/USER_WORKFLOWS.md) — photographer-facing save/recreate/recovery flows.
- [product/APP_MVP_PLAN.md](product/APP_MVP_PLAN.md) — application experience decisions, MoSCoW backlog, user stories and sprint plan aligned with V1.
- [product/ROADMAP.md](product/ROADMAP.md) — development phases and exit gates.
- [product/COMPETITIVE_LANDSCAPE.md](product/COMPETITIVE_LANDSCAPE.md) — substitutes, adjacent competitors and differentiation hypothesis.
- [Reuse research](product/COMPETITOR_REUSE_RESEARCH_2026-09-10.md) — verified competitor exports, AR/sensor libraries and later datasets.

## Engineering
- [Application acceptance](engineering/APP_ACCEPTANCE.md) — eleven app checks, release evidence and software/physical completion boundaries.
- [product/DATABASE_DESIGN.md](product/DATABASE_DESIGN.md) — agreed seven-table prototype data model, versioned scene snapshots, preservation rules and links to the detailed implementation specifications.
- [product/DATABASE_SCHEMA.md](product/DATABASE_SCHEMA.md) — seven-table field/type/constraint specification and structured snapshot format.
- [product/OFFLINE_SYNC.md](product/OFFLINE_SYNC.md) — save/sync transactions, conflicts, media, deletion recovery and acceptance tests.
- [V1_PRODUCT_SPEC.md](V1_PRODUCT_SPEC.md) — current detailed V1 product specification.
- [V1_ARCHITECTURE.md](V1_ARCHITECTURE.md) — current system architecture.
- [engineering/ENGINEERING_REQUIREMENTS.md](engineering/ENGINEERING_REQUIREMENTS.md) — measurable technical requirements and targets.
- [POSITIONING_RESEARCH.md](POSITIONING_RESEARCH.md) — spatial-positioning research and rationale.
- [V1_BOM.md](V1_BOM.md) — provisional/final component decisions and status.
- [DECISIONS.md](DECISIONS.md) — confirmed, hypothesis and deferred architecture decisions.

## Validation
- [TEST_PLAN.md](TEST_PLAN.md) — planned verification methodology.
- [validation/VALIDATION_LOG.md](validation/VALIDATION_LOG.md) — actual evidence and experiment outcomes.
- [validation/ESP32S3_SENSOR_BENCH_2026-09-21.md](validation/ESP32S3_SENSOR_BENCH_2026-09-21.md) — received evaluation parts, verified pin map and combined-sensor bench results; firmware in [experiments/esp32s3-sensor-bench/](../experiments/esp32s3-sensor-bench/README.md).
- [validation/RISK_REGISTER.md](validation/RISK_REGISTER.md) — current product/technical risks and mitigations.

## Current development priority
The highest-priority open risk is phone-based spatial positioning. The selected Codex app and hardened harness now live on main. Resolve evidence through [STATUS.md](STATUS.md) and continue the existing implementation. Per ADR-015, remaining software work may continue alongside physical testing. The user's selection in ADR-017 retires the earlier two-app comparison requirement.

Do not lock the final commercial node electronics until Phase 0 produces sufficient evidence.

## Later-stage documents
These should be created when the project reaches the relevant maturity, not before:
- business case / pricing and unit economics;
- industrial design requirements;
- custom PCB specification;
- manufacturing/test plan;
- supplier and production BOM;
- compliance/certification plan;
- service/support plan;
- launch/marketing plan.

## Historical material — not current instructions
- [Legacy companion archive](archive/legacy-companion/README.md) — superseded plans and app/firmware handover history.
- The retained root web app and device/ source are legacy engineering; their tests do not validate the Android AR or N8R8 BLE product.
