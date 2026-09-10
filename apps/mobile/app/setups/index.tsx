import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDb } from '@/db/client';
import { listSetups } from '@/repositories/setups';
import type { Setup } from '@/domain/types';

type ViewMode = 'active' | 'archived' | 'trash';

/** M06: find/open/edit/archive saved setups offline, with archive kept visibly distinct from Trash. */
export default function SetupsListScreen() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ViewMode>('active');
  const [setups, setSetups] = useState<Setup[]>([]);

  const reload = useCallback(() => {
    const db = getDb();
    const results = listSetups(db, {
      query: query.trim() || undefined,
      includeArchived: mode === 'archived',
      onlyTrashed: mode === 'trash',
    }).filter((s) => (mode === 'archived' ? s.archivedAt !== null : true));
    setSetups(results);
  }, [query, mode]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return (
    <View style={styles.screen}>
      <TextInput
        placeholder="Search setups"
        value={query}
        onChangeText={(text) => {
          setQuery(text);
        }}
        onSubmitEditing={reload}
        style={styles.search}
      />

      <View style={styles.tabs}>
        {(['active', 'archived', 'trash'] as ViewMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.tab, mode === m && styles.tabActive]}
          >
            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
              {m === 'active' ? 'Active' : m === 'archived' ? 'Archived' : 'Trash'}
            </Text>
          </Pressable>
        ))}
      </View>

      {setups.length === 0 ? (
        <Text style={styles.emptyText}>
          {mode === 'trash' ? 'Trash is empty.' : mode === 'archived' ? 'No archived setups.' : 'No setups match.'}
        </Text>
      ) : (
        <FlatList
          data={setups}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/setups/[id]', params: { id: item.id } }} asChild>
              <Pressable style={styles.row}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowMeta}>
                  {item.category}
                  {item.archivedAt ? ' - archived' : ''}
                  {item.deletedAt ? ' - in Trash' : ''}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 12 },
  search: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: '#eee' },
  tabActive: { backgroundColor: '#1a73e8' },
  tabText: { color: '#333', fontWeight: '600' },
  tabTextActive: { color: 'white' },
  emptyText: { color: '#777', marginTop: 12 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 12, color: '#888', textTransform: 'capitalize' },
});
