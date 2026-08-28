# LightGuide V1 — Risk Register

| ID | Risk | Impact | Likelihood | Current mitigation | Status |
|---|---|---:|---:|---|---|
| R-001 | Phone AR positioning is not repeatable enough | High | Medium | Phase 0 validation before hardware lock-in; UWB/sensor-fusion fallback | Open |
| R-002 | Visual marker is too large/awkward for studio use | Medium | Medium | Test marker sizes, viewing distances, angles and deployable marker concepts | Open |
| R-003 | Coordinate frame cannot be reliably re-established across sessions | High | Medium | Use a known subject/studio reference and test relocalisation explicitly | Open |
| R-004 | Orientation/yaw drifts or is ambiguous | High | Medium | Validate phone visual pose; defer final IMU choice until evidence exists | Open |
| R-005 | Light position tolerance that feels precise is not photographically useful | High | Low/Medium | Run recreation tests and compare image/setup outcomes, not geometry alone | Open |
| R-006 | Close-range product lighting requires tighter accuracy than portrait setups | Medium | Medium | Separate close-range acceptance targets and test at <1 m | Open |
| R-007 | Final node BOM becomes too expensive | Medium | Medium | Keep phone responsible for spatial compute; defer UWB and unnecessary displays | Open |
| R-008 | Node sensors add little value beyond phone AR | Medium | Medium | Require each sensor to support a validated use case before final BOM lock | Open |
| R-009 | Photographer workflow is too slow or technical | High | Medium | Hide AR internals; test save/recreate scan time and comprehension | Open |
| R-010 | Multi-light workflow creates identification/coordination problems | Medium | Medium | Stable node identity and sequential restore workflow in data model | Open |
| R-011 | Stale tracking or telemetry produces false “matched” state | High | Low/Medium | Explicit validity gating; never confirm using stale readings | Open |
| R-012 | Product overlaps existing lighting-diagram or AI-lighting tools too closely | Medium | Medium | Position around automatic physical capture + closed-loop recreation; maintain competitor review | Open |
| R-013 | Patent/prior-art overlap limits protectability | Medium/High | Medium | Maintain prior-art notes; professional patent/FTO review before commercial launch | Open |
| R-014 | Battery/enclosure design hurts portability | Medium | Medium | Set size/weight/runtime requirements after electronics architecture is frozen | Deferred |
| R-015 | BLE reliability in studio environment is inadequate | Medium | Low/Medium | Test after Phase 0 with prototype node; design reconnect/recovery behaviour | Deferred |

## Risk policy
A high-impact technical risk should be validated before dependent hardware/software work is treated as committed architecture.

The current highest-priority risk is **R-001: spatial positioning repeatability**. That is why Phase 0 AR positioning is the next engineering milestone.
