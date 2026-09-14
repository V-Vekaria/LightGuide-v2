import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePose, type Pose } from "../src/domain/spatial";
const p: Pose = {
  referenceId: "reference",
  objectId: "light",
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  observedAtMs: 1000,
  quality: "valid",
  source: "phone_ar",
};
test("fresh pose below three centimetres matches; four centimetres does not", () => {
  assert.equal(
    evaluatePose(p, { ...p, position: [0.029, 0, 0] }, 1100).result,
    "matched",
  );
  assert.equal(
    evaluatePose(p, { ...p, position: [0.04, 0, 0] }, 1100).result,
    "not_matched",
  );
});
test("invalid tracking, clock reversal and expired samples cannot confirm a match", () => {
  for (const quality of ["lost", "stale", "uncertain"] as const)
    assert.equal(
      evaluatePose(p, { ...p, quality }, 1100).result,
      "unverifiable",
    );
  assert.equal(evaluatePose(p, p, 1751).result, "unverifiable");
  assert.equal(evaluatePose(p, p, 900).result, "unverifiable");
  assert.equal(evaluatePose(p, null, 1100).result, "unverifiable");
});
test("wrong object or reference is not comparable", () => {
  assert.equal(
    evaluatePose(p, { ...p, referenceId: "other" }, 1100).result,
    "unverifiable",
  );
  assert.equal(
    evaluatePose(p, { ...p, objectId: "other" }, 1100).result,
    "unverifiable",
  );
});
test("simulation cannot establish a real measured match even at the exact target", () => {
  const result = evaluatePose(p, { ...p, source: "simulation" }, 1100);
  assert.equal(result.result, "unverifiable");
  assert.match(result.label, /Simulated/);
});
test("nonfinite positions and unnormalised quaternions are rejected", () => {
  assert.equal(
    evaluatePose(p, { ...p, position: [NaN, 0, 0] }, 1100).result,
    "unverifiable",
  );
  assert.equal(
    evaluatePose(p, { ...p, quaternion: [0, 0, 0, 2] }, 1100).result,
    "unverifiable",
  );
});
test("quaternion sign ambiguity gives identical orientation", () => {
  assert.equal(
    evaluatePose(p, { ...p, quaternion: [0, 0, 0, -1] }, 1100).result,
    "matched",
  );
});

test("nonfinite clocks cannot bypass freshness validation", () => {
  const target: Pose = {
    referenceId: "r",
    objectId: "o",
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    observedAtMs: 100,
    quality: "valid",
    source: "phone_ar",
  };
  assert.equal(evaluatePose(target, target, NaN).result, "unverifiable");
  assert.equal(
    evaluatePose(target, { ...target, observedAtMs: NaN }, 100).result,
    "unverifiable",
  );
});
