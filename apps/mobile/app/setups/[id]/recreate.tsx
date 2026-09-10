import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDb } from '@/db/client';
import { DEFAULT_TOLERANCES } from '@/domain/types';
import type { EvaluationMetric, Measurement, RecreationOutcome } from '@/domain/types';
import { computeGuidance, computeMatchState, type MatchState, type ObservationQuality } from '@/guidance/guidance';
import { computeDelta } from '@/guidance/guidance';
import { getCurrentVersion } from '@/repositories/setups';
import { beginRecreation, recordOutcome } from '@/services/recreationService';
import { SimulatedSpatialProvider } from '@/spatial/SpatialProvider';

const METRIC_LABELS: Record<'distance' | 'height' | 'direction' | 'tilt', string> = {
  distance: 'Distance (m)',
  height: 'Height (m)',
  direction: 'Direction (deg)',
  tilt: 'Tilt (deg)',
};

function findMeasurement(measurements: Measurement[] | undefined, kind: string): number | undefined {
  const m = measurements?.find((meas) => (kind === 'direction' || kind === 'tilt' ? meas.kind === 'orientation' : meas.kind === kind));
  return typeof m?.value === 'number' ? m.value : undefined;
}

function metricStatus(target: number | undefined, current: number | undefined, tolerance: number): EvaluationMetric['status'] {
  if (target === undefined || current === undefined) return 'unavailable';
  return Math.abs(current - target) <= tolerance ? 'within' : 'outside';
}

/**
 * M08-M12: re-establish (here: manual re-measurement, since no live AR
 * provider is wired up yet), live guidance, valid Match state, and outcome
 * recording. Two sections:
 *  - "Manual recreation" uses the setup's real saved scalar measurements -
 *    this is the actual fallback path every setup has today.
 *  - "Simulated guidance demo" exercises the pose-based guidance/MatchState
 *    pipeline with an operator-controlled SimulatedSpatialProvider, clearly
 *    labelled as a demo so it is never mistaken for the saved setup's real
 *    geometry (which manual captures do not have a 3D pose for).
 */
export default function RecreateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recreationId, setRecreationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number>(Date.now());

  const target = useMemo(() => {
    const version = getCurrentVersion(getDb(), id);
    return version?.snapshot.objects[0]?.measurements;
  }, [id]);

  const [currentDistance, setCurrentDistance] = useState('');
  const [currentHeight, setCurrentHeight] = useState('');
  const [currentDirection, setCurrentDirection] = useState('');
  const [currentTilt, setCurrentTilt] = useState('');

  useEffect(() => {
    try {
      const recreation = beginRecreation(getDb(), id, DEFAULT_TOLERANCES);
      setRecreationId(recreation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  // --------------------------------------------------- simulated demo --
  const provider = useMemo(() => new SimulatedSpatialProvider(), []);
  const [demoQuality, setDemoQuality] = useState<ObservationQuality>('fresh');
  const [demoReferenceValid, setDemoReferenceValid] = useState(true);
  const [demoOffsetCm, setDemoOffsetCm] = useState(5);

  const demoTarget = { positionM: [0, 0, 0] as [number, number, number], quaternionXyzw: [0, 0, 0, 1] as [number, number, number, number] };
  provider.setCurrentPose(
    { positionM: [demoOffsetCm / 100, 0, 0], quaternionXyzw: [0, 0, 0, 1] },
    demoQuality,
    demoReferenceValid,
  );
  const observation = provider.observe();
  const demoDelta = observation.pose ? computeDelta({ positionM: demoTarget.positionM, quaternionXyzw: demoTarget.quaternionXyzw }, observation.pose) : null;
  const demoMatchState: MatchState = computeMatchState({
    delta: demoDelta,
    observationQuality: observation.quality,
    referenceValid: observation.referenceValid,
    tolerances: DEFAULT_TOLERANCES,
  });

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const targetDistance = findMeasurement(target, 'distance');
  const targetHeight = findMeasurement(target, 'height');
  const targetDirection = findMeasurement(target, 'direction');
  const targetTilt = findMeasurement(target, 'tilt');

  const onFinish = (outcome: RecreationOutcome) => {
    if (!recreationId) return;
    const parsed = {
      distance: currentDistance.trim() ? Number(currentDistance) : undefined,
      height: currentHeight.trim() ? Number(currentHeight) : undefined,
      direction: currentDirection.trim() ? Number(currentDirection) : undefined,
      tilt: currentTilt.trim() ? Number(currentTilt) : undefined,
    };
    const measuredMetrics: EvaluationMetric[] = (['distance', 'height', 'direction', 'tilt'] as const)
      .map((kind): EvaluationMetric | null => {
        const t = kind === 'distance' ? targetDistance : kind === 'height' ? targetHeight : kind === 'direction' ? targetDirection : targetTilt;
        const c = parsed[kind];
        if (t === undefined && c === undefined) return null;
        const tolerance = kind === 'distance' || kind === 'height' ? DEFAULT_TOLERANCES.distanceM : DEFAULT_TOLERANCES.directionDeg;
        return {
          objectId: 'light',
          metric: kind,
          target: t ?? null,
          actual: c ?? null,
          delta: t !== undefined && c !== undefined ? c - t : null,
          unit: kind === 'distance' || kind === 'height' ? 'm' : 'deg',
          tolerance,
          status: metricStatus(t, c, tolerance),
        };
      })
      .filter((m): m is EvaluationMetric => m !== null);

    recordOutcome(getDb(), {
      recreationId,
      outcome,
      durationMs: Date.now() - startedAt.current,
      measuredMetrics: measuredMetrics.length > 0 ? measuredMetrics : undefined,
    });
    Alert.alert('Recreation recorded', undefined, [{ text: 'OK', onPress: () => router.back() }]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>Manual recreation</Text>
      <Text style={styles.hint}>Re-measure the light and enter what you find. Anything you leave blank stays unknown, not zero.</Text>

      {(['distance', 'height', 'direction', 'tilt'] as const).map((kind) => {
        const t = kind === 'distance' ? targetDistance : kind === 'height' ? targetHeight : kind === 'direction' ? targetDirection : targetTilt;
        const value =
          kind === 'distance' ? currentDistance : kind === 'height' ? currentHeight : kind === 'direction' ? currentDirection : currentTilt;
        const setValue =
          kind === 'distance' ? setCurrentDistance : kind === 'height' ? setCurrentHeight : kind === 'direction' ? setCurrentDirection : setCurrentTilt;
        return (
          <View key={kind} style={styles.metricRow}>
            <Text style={styles.metricLabel}>
              {METRIC_LABELS[kind]} - target: {t !== undefined ? t : 'not recorded'}
            </Text>
            <TextInput value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="current" style={styles.input} />
          </View>
        );
      })}

      <Text style={styles.sectionLabel}>Simulated guidance demo</Text>
      <Text style={styles.hint}>
        Exercises the live-guidance display with a synthetic pose - not this setup&apos;s real geometry. Provenance:{' '}
        {observation.provenance}.
      </Text>
      <View style={styles.demoRow}>
        <Pressable style={styles.smallButton} onPress={() => setDemoOffsetCm((v) => v - 1)}>
          <Text>-1cm</Text>
        </Pressable>
        <Text style={styles.demoValue}>{demoOffsetCm} cm off</Text>
        <Pressable style={styles.smallButton} onPress={() => setDemoOffsetCm((v) => v + 1)}>
          <Text>+1cm</Text>
        </Pressable>
      </View>
      <View style={styles.demoRow}>
        <Pressable style={styles.smallButton} onPress={() => setDemoQuality(demoQuality === 'fresh' ? 'inferred' : 'fresh')}>
          <Text>Observation: {demoQuality}</Text>
        </Pressable>
        <Pressable style={styles.smallButton} onPress={() => setDemoReferenceValid((v) => !v)}>
          <Text>Reference: {demoReferenceValid ? 'valid' : 'lost'}</Text>
        </Pressable>
      </View>
      <Text style={[styles.matchState, matchStateStyle(demoMatchState)]}>{demoMatchState.replace('_', ' ').toUpperCase()}</Text>
      {demoDelta && demoMatchState !== 'unverifiable' && (
        <Text style={styles.hint}>
          {computeGuidance(demoDelta, DEFAULT_TOLERANCES).steps.map((s) => `${s.direction} ${(s.magnitudeM ?? s.magnitudeDeg ?? 0).toFixed(2)}`).join(' / ')}
        </Text>
      )}

      <Text style={styles.sectionLabel}>Outcome</Text>
      <View style={styles.outcomeRow}>
        {(['matched', 'close_enough', 'adapted', 'unsuccessful'] as RecreationOutcome[]).map((outcome) => (
          <Pressable key={outcome} style={styles.outcomeButton} onPress={() => onFinish(outcome)}>
            <Text style={styles.outcomeButtonText}>{outcome.replace('_', ' ')}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function matchStateStyle(state: MatchState) {
  if (state === 'in_tolerance') return { color: '#1a8a3c' };
  if (state === 'out_of_tolerance') return { color: '#c94b1f' };
  return { color: '#888' };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 8, paddingBottom: 64 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#c94b1f', textAlign: 'center' },
  sectionLabel: { fontSize: 15, fontWeight: '700', marginTop: 16 },
  hint: { fontSize: 12, color: '#777' },
  metricRow: { gap: 4, marginTop: 6 },
  metricLabel: { fontSize: 13, color: '#444' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, fontSize: 15 },
  demoRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 6 },
  smallButton: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  demoValue: { fontSize: 14 },
  matchState: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  outcomeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  outcomeButton: { backgroundColor: '#1a73e8', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  outcomeButtonText: { color: 'white', fontWeight: '600', textTransform: 'capitalize' },
});
