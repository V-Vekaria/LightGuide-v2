import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { openRepository } from "../data/open";
import type { Repository } from "../data/repository";
import { colors } from "./theme";
type Value = { repo: Repository; revision: number; refresh: () => void };
const Context = createContext<Value | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [result, setResult] = useState<{
    repo: Repository | null;
    error: string | null;
  }>({ repo: null, error: null });
  const [revision, setRevision] = useState(0),
    [retry, setRetry] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    setResult({ repo: null, error: null });
    openRepository()
      .then((repo) => {
        if (active) setResult({ repo, error: null });
      })
      .catch((e) => {
        if (active)
          setResult({
            repo: null,
            error:
              e instanceof Error ? e.message : "Storage could not be opened",
          });
      });
    return () => {
      active = false;
    };
  }, [retry]);
  if (!result.repo)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: 32,
          justifyContent: "center",
        }}
      >
        {result.error ? (
          <>
            <Text style={{ color: colors.text, fontSize: 24 }}>
              Your data has not been changed
            </Text>
            <Text style={{ color: colors.muted, marginTop: 12 }}>
              {result.error}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRetry((v) => v + 1)}
            >
              <Text style={{ color: colors.accent, marginTop: 24 }}>
                Retry opening storage
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.text, marginTop: 16 }}>
              Opening your workspace…
            </Text>
          </>
        )}
      </View>
    );
  return (
    <Context.Provider
      value={{
        repo: result.repo,
        revision,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing local workspace");
  return value;
}
