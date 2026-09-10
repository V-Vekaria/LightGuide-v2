import type { PoseTransform } from '../domain/types';
import type { ObservationQuality } from '../guidance/guidance';

/**
 * Platform-neutral spatial contract (docs/V1_ARCHITECTURE.md "Spatial-engine
 * contract"). The app talks to this interface only - never to ARCore/ARKit
 * types directly - so a future native adapter is a drop-in implementation,
 * not a UI rewrite.
 *
 * Provenance is load-bearing, not decorative: a simulated observation must
 * never be persisted or displayed as if it were a real capture (M1: "Simulated
 * measurements must be visibly labelled and persisted with simulation
 * provenance"). Every screen that shows a SpatialObservation must show its
 * provenance next to it.
 */
export type SpatialProviderKind = 'native-android-arcore' | 'simulated' | 'unavailable';
export type SpatialProviderState = 'unavailable' | 'initializing' | 'tracking' | 'relocalising' | 'lost';

export interface SpatialObservation {
  provenance: 'native' | 'simulated';
  quality: ObservationQuality;
  referenceValid: boolean;
  pose: PoseTransform | null;
  capturedAt: string;
}

export interface SpatialProvider {
  readonly kind: SpatialProviderKind;
  getState(): SpatialProviderState;
  observe(): SpatialObservation;
}

/**
 * Default provider. No native Android/ARCore bridge exists in this delivery
 * (see docs/engineering/CLAUDE_BUILD_HANDOFF.md M3: "a thin Android spatial
 * adapter MAY be integrated... No sensor/BLE implementation is implied").
 * Using this provider is always honest about that rather than guessing.
 */
export class UnavailableSpatialProvider implements SpatialProvider {
  readonly kind: SpatialProviderKind = 'unavailable';

  getState(): SpatialProviderState {
    return 'unavailable';
  }

  observe(): SpatialObservation {
    return {
      provenance: 'native',
      quality: 'unavailable',
      referenceValid: false,
      pose: null,
      capturedAt: new Date().toISOString(),
    };
  }
}

/**
 * Deterministic, operator-controlled fake poses for exercising the guidance
 * and recreation screens without hardware. setCurrentPose is the only way
 * its observation changes - there is no autonomous drift/noise model, so a
 * test asserting on it is asserting on an exact, known value.
 */
export class SimulatedSpatialProvider implements SpatialProvider {
  readonly kind: SpatialProviderKind = 'simulated';

  private pose: PoseTransform | null = null;
  private quality: ObservationQuality = 'unavailable';
  private referenceValid = false;

  setCurrentPose(pose: PoseTransform | null, quality: ObservationQuality = 'fresh', referenceValid = true): void {
    this.pose = pose;
    this.quality = pose ? quality : 'unavailable';
    this.referenceValid = referenceValid;
  }

  getState(): SpatialProviderState {
    if (!this.referenceValid) return 'relocalising';
    if (!this.pose) return 'initializing';
    return this.quality === 'fresh' ? 'tracking' : 'lost';
  }

  observe(): SpatialObservation {
    return {
      provenance: 'simulated',
      quality: this.quality,
      referenceValid: this.referenceValid,
      pose: this.pose,
      capturedAt: new Date().toISOString(),
    };
  }
}
