import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { getDb } from '@/db/client';
import { listSetups } from '@/repositories/setups';
import type { Setup } from '@/domain/types';

/** M01/US01: a short, jargon-free explanation of Measure -> Save -> Recreate, no account required. */
export default function HomeScreen() {
  const [recent, setRecent] = useState<Setup[]>([]);

  useFocusEffect(
    useCallback(() => {
      setRecent(listSetups(getDb()).slice(0, 5));
    }, []),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.intro}>
        <Text style={styles.title}>LightGuide</Text>
        <Text style={styles.subtitle}>Measure a lighting setup, save it, and get guided back to it later.</Text>
        <View style={styles.steps}>
          <Text style={styles.step}>1. Measure - note where your light is.</Text>
          <Text style={styles.step}>2. Save - give the setup a name.</Text>
          <Text style={styles.step}>3. Recreate - come back to it any time, with step-by-step corrections.</Text>
        </View>
        <Text style={styles.disclaimer}>
          Works fully offline. Live camera-guided positioning is still being validated - every setup can always be
          saved and recreated manually with your own measurements and photos.
        </Text>
      </View>

      <Link href="/setups/new" asChild>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Save a new setup</Text>
        </Pressable>
      </Link>

      <Link href="/setups" asChild>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Browse all setups</Text>
        </Pressable>
      </Link>

      <Text style={styles.sectionLabel}>Recent</Text>
      {recent.length === 0 ? (
        <Text style={styles.emptyText}>No setups saved yet. Save your first one above.</Text>
      ) : (
        <FlatList
          data={recent}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/setups/[id]', params: { id: item.id } }} asChild>
              <Pressable style={styles.recentRow}>
                <Text style={styles.recentTitle}>{item.title}</Text>
                <Text style={styles.recentMeta}>{item.category}</Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 16 },
  intro: { gap: 8, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 16, color: '#333' },
  steps: { gap: 4, marginTop: 8 },
  step: { fontSize: 14, color: '#333' },
  disclaimer: { fontSize: 12, color: '#777', marginTop: 8 },
  primaryButton: { backgroundColor: '#1a73e8', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  secondaryButton: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  secondaryButtonText: { color: '#333', fontSize: 16, fontWeight: '600' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 8 },
  emptyText: { color: '#777' },
  recentRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  recentTitle: { fontSize: 16 },
  recentMeta: { fontSize: 12, color: '#888', textTransform: 'capitalize' },
});
