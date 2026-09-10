import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet } from 'react-native';
import { getDb } from '@/db/client';

/**
 * Runs migrations once at app start. If they fail (disk full, corrupt file),
 * the whole app shows a clear error screen rather than half-initialising -
 * OFFLINE_SYNC.md 10: "Disk full: fail local save visibly; never show Saved."
 * applies just as much to startup as to a single save.
 */
export default function RootLayout() {
  const [dbError, setDbError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      getDb();
      setReady(true);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  if (dbError) {
    return (
      <SafeAreaProvider>
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>LightGuide could not open its local database</Text>
          <Text style={styles.errorBody}>{dbError}</Text>
          <Text style={styles.errorBody}>
            Your saved setups have not been touched. Restart the app; if this keeps happening, check the device has
            free storage.
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingScreen}>
          <Text>Opening LightGuide...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerTitleAlign: 'center' }}>
        <Stack.Screen name="index" options={{ title: 'LightGuide' }} />
        <Stack.Screen name="setups/index" options={{ title: 'Setups' }} />
        <Stack.Screen name="setups/new" options={{ title: 'New setup' }} />
        <Stack.Screen name="setups/[id]/index" options={{ title: 'Setup' }} />
        <Stack.Screen name="setups/[id]/recreate" options={{ title: 'Recreate' }} />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  errorBody: { fontSize: 14, textAlign: 'center', color: '#555' },
});
