# LightGuide Documentation Map

Use this file to find the authoritative document for each type of decision.

## Product
- `product/PRODUCT_VISION.md` — long-term purpose, target user and product principles.
- `product/PRD.md` — what V1 must achieve and what is explicitly out of scope.
- `product/USER_WORKFLOWS.md` — photographer-facing save/recreate/recovery flows.
- `product/APP_MVP_PLAN.md` — application experience decisions, MoSCoW backlog, user stories and sprint plan aligned with V1.
- `product/ROADMAP.md` — development phases and exit gates.
- `product/COMPETITIVE_LANDSCAPE.md` — substitutes, adjacent competitors and differentiation hypothesis.

## Engineering
- [product/DATABASE_DESIGN.md](product/DATABASE_DESIGN.md) — agreed seven-table prototype data model, versioned scene snapshots, preservation rules and links to the detailed implementation specifications.
- [product/DATABASE_SCHEMA.md](product/DATABASE_SCHEMA.md) — seven-table field/type/constraint specification and structured snapshot format.
- [product/OFFLINE_SYNC.md](product/OFFLINE_SYNC.md) — save/sync transactions, conflicts, media, deletion recovery and acceptance tests.
- `V1_PRODUCT_SPEC.md` — current detailed V1 product specification.
- `V1_ARCHITECTURE.md` — current system architecture.
- `engineering/ENGINEERING_REQUIREMENTS.md` — measurable technical requirements and targets.
- `POSITIONING_RESEARCH.md` — spatial-positioning research and rationale.
- `V1_BOM.md` — provisional/final component decisions and status.
- `DECISIONS.md` — confirmed, hypothesis and deferred architecture decisions.

## Validation
- `TEST_PLAN.md` — planned verification methodology.
- `validation/VALIDATION_LOG.md` — actual evidence and experiment outcomes.
- `validation/RISK_REGISTER.md` — current product/technical risks and mitigations.

## Current development priority
The highest-priority open risk is phone-based spatial positioning. Work should therefore begin in:

`../experiments/phase-0-ar-positioning/`

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
