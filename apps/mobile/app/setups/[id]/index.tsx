import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getDb } from '@/db/client';
import { archiveSetup, getSetup, listVersions, restoreSetup, trashSetup, unarchiveSetup } from '@/repositories/setups';
import type { Setup, SetupVersion } from '@/domain/types';

/** M06/M2 item 4: current version summary, full immutable history, and archive/Trash actions. */
export default function SetupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [setup, setSetup] = useState<Setup | undefined>();
  const [versions, setVersions] = useState<SetupVersion[]>([]);

  const reload = useCallback(() => {
    const db = getDb();
    setSetup(getSetup(db, id));
    setVersions(listVersions(db, id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  if (!setup) {
    return (
      <View style={styles.center}>
        <Text>This setup could not be found. It may have been permanently deleted.</Text>
      </View>
    );
  }

  const current = versions.find((v) => v.id === setup.currentVersionId);
  const light = current?.snapshot.objects[0];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{setup.title}</Text>
      <Text style={styles.meta}>
        {setup.category}
        {setup.archivedAt ? ' - archived' : ''}
        {setup.deletedAt ? ' - in Trash' : ''}
      </Text>

      {!current ? (
        <Text style={styles.emptyText}>No saved version yet.</Text>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Current saved state</Text>
          {light ? (
            <>
              {light.role && <Text style={styles.cardLine}>Role: {light.role}</Text>}
              {measurementLine(light, 'distance', 'Distance')}
              {measurementLine(light, 'height', 'Height')}
              {measurementLine(light, 'orientation', 'Direction/tilt')}
              {light.measurements.length === 0 && <Text style={styles.cardLine}>No measurements recorded.</Text>}
            </>
          ) : (
            <Text style={styles.cardLine}>No light details recorded.</Text>
          )}
          <Text style={styles.cardMeta}>Saved {new Date(current.createdAt).toLocaleString()}</Text>
        </View>
      )}

      {setup.currentVersionId && (
        <Link href={{ pathname: '/setups/[id]/recreate', params: { id: setup.id } }} asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Start recreation</Text>
          </Pressable>
        </Link>
      )}

      <Text style={styles.sectionLabel}>Version history ({versions.length})</Text>
      {versions.map((v) => (
        <View key={v.id} style={styles.versionRow}>
          <Text style={styles.versionLine}>
            {v.id === setup.currentVersionId ? 'CURRENT - ' : ''}
            {new Date(v.createdAt).toLocaleString()}
          </Text>
        </View>
      ))}

      <View style={styles.actions}>
        {setup.deletedAt ? (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              restoreSetup(getDb(), setup.id);
              reload();
            }}
          >
            <Text style={styles.secondaryButtonText}>Restore from Trash</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                if (setup.archivedAt) {
                  unarchiveSetup(getDb(), setup.id);
                } else {
                  archiveSetup(getDb(), setup.id);
                }
                reload();
              }}
            >
              <Text style={styles.secondaryButtonText}>{setup.archivedAt ? 'Unarchive' : 'Archive'}</Text>
            </Pressable>
            <Pressable
              style={styles.dangerButton}
              onPress={() => {
                Alert.alert('Move to Trash?', 'You can restore it from Trash for 30 days.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Move to Trash',
                    style: 'destructive',
                    onPress: () => {
                      trashSetup(getDb(), setup.id);
                      router.back();
                    },
                  },
                ]);
              }}
            >
              <Text style={styles.dangerButtonText}>Move to Trash</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function measurementLine(light: NonNullable<SetupVersion['snapshot']['objects']>[number], kind: string, label: string) {
  const m = light.measurements.find((meas) => meas.kind === kind);
  if (!m || m.value === null || typeof m.value !== 'number') return null;
  return (
    <Text style={styles.cardLine}>
      {label}: {m.value}
      {m.unit}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700' },
  meta: { fontSize: 13, color: '#888', textTransform: 'capitalize' },
  card: { backgroundColor: '#f4f6fb', borderRadius: 10, padding: 14, gap: 4 },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#555' },
  cardLine: { fontSize: 15 },
  cardMeta: { fontSize: 12, color: '#999', marginTop: 6 },
  emptyText: { color: '#777' },
  primaryButton: { backgroundColor: '#1a73e8', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 12 },
  versionRow: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  versionLine: { fontSize: 13, color: '#444' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#333', fontWeight: '600' },
  dangerButton: { flex: 1, borderWidth: 1, borderColor: '#d33', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  dangerButtonText: { color: '#d33', fontWeight: '600' },
});
