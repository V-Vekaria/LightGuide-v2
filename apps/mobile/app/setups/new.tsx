import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDb } from '@/db/client';
import { saveQuickCapture } from '@/services/captureService';
import type { ShootCategory } from '@/domain/types';

function parseOptionalNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * M02-M05: name a setup, optionally add manual precision fields - save
 * succeeds with none of them filled in (M2 acceptance: "Setup saving
 * succeeds without completing optional metadata").
 */
export default function NewSetupScreen() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ShootCategory>('portrait');
  const [role, setRole] = useState('');
  const [distanceM, setDistanceM] = useState('');
  const [heightM, setHeightM] = useState('');
  const [directionDeg, setDirectionDeg] = useState('');
  const [tiltDeg, setTiltDeg] = useState('');
  const [saving, setSaving] = useState(false);

  const onSave = () => {
    if (!title.trim()) {
      Alert.alert('Name this setup', 'Give the setup a short name so you can find it later.');
      return;
    }
    setSaving(true);
    try {
      const setup = saveQuickCapture(getDb(), {
        title: title.trim(),
        category,
        light: {
          role: role.trim() || undefined,
          distanceM: parseOptionalNumber(distanceM),
          heightM: parseOptionalNumber(heightM),
          directionDeg: parseOptionalNumber(directionDeg),
          tiltDeg: parseOptionalNumber(tiltDeg),
        },
      });
      router.replace({ pathname: '/setups/[id]', params: { id: setup.id } });
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Setup name</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Window light portrait" style={styles.input} />

      <Text style={styles.label}>Category</Text>
      <View style={styles.tabs}>
        {(['portrait', 'product'] as ShootCategory[]).map((c) => (
          <Pressable
            key={c}
            onPress={() => setCategory(c)}
            style={[styles.tab, category === c && styles.tabActive]}
          >
            <Text style={[styles.tabText, category === c && styles.tabTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Light (optional - fill in only what you measured)</Text>

      <Text style={styles.label}>Role (key, fill, rim...)</Text>
      <TextInput value={role} onChangeText={setRole} placeholder="key" style={styles.input} />

      <Text style={styles.label}>Distance from subject (m)</Text>
      <TextInput value={distanceM} onChangeText={setDistanceM} keyboardType="decimal-pad" style={styles.input} />

      <Text style={styles.label}>Height (m)</Text>
      <TextInput value={heightM} onChangeText={setHeightM} keyboardType="decimal-pad" style={styles.input} />

      <Text style={styles.label}>Direction (deg from subject-facing)</Text>
      <TextInput value={directionDeg} onChangeText={setDirectionDeg} keyboardType="numbers-and-punctuation" style={styles.input} />

      <Text style={styles.label}>Tilt (deg)</Text>
      <TextInput value={tiltDeg} onChangeText={setTiltDeg} keyboardType="numbers-and-punctuation" style={styles.input} />

      <Pressable onPress={onSave} disabled={saving} style={styles.saveButton}>
        <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save setup'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 8, paddingBottom: 48 },
  label: { fontSize: 13, color: '#555', marginTop: 8 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: '#eee' },
  tabActive: { backgroundColor: '#1a73e8' },
  tabText: { color: '#333', fontWeight: '600', textTransform: 'capitalize' },
  tabTextActive: { color: 'white' },
  saveButton: { backgroundColor: '#1a73e8', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
