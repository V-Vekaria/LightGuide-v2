import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "./Store";
import { photoUri } from "../media/media";
import { colors as c } from "./theme";

export type PhotoItem = { id: string; label: string };
function usePhoto(id: string) {
  const { repo, revision } = useStore();
  const [state, setState] = useState<{
    id: string;
    uri: string | null;
    loading: boolean;
  }>({ id, uri: null, loading: true });
  useEffect(() => {
    let active = true;
    setState({ id, uri: null, loading: true });
    photoUri(repo, id)
      .then((uri) => {
        if (active) setState({ id, uri, loading: false });
      })
      .catch(() => {
        if (active) setState({ id, uri: null, loading: false });
      });
    return () => {
      active = false;
    };
  }, [id, repo, revision]);
  const record = repo.image(id);
  return {
    uri: state.id === id ? state.uri : null,
    loading: state.id !== id || state.loading,
    ratio: record ? record.width_px / record.height_px : 1,
  };
}
function Control({
  title,
  onPress,
  disabled = false,
  selected = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 46,
        padding: 12,
        borderRadius: 10,
        backgroundColor: selected ? c.accent : c.raised,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ color: selected ? c.accentInk : c.text, fontSize: 15 }}>
        {title}
      </Text>
    </Pressable>
  );
}
function ExpandedPhoto({ item, zoom }: { item: PhotoItem; zoom: number }) {
  const { uri, loading, ratio } = usePhoto(item.id);
  const [size, setSize] = useState({ width: 300, height: 400 });
  const w = Math.min(size.width, size.height * ratio);
  const h = w / ratio;
  return (
    <View
      style={{ flex: 1, minHeight: 120 }}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
      {uri ? (
        <ScrollView
          key={`${item.id}:${zoom}`}
          horizontal
          contentContainerStyle={{ minWidth: size.width }}
        >
          <ScrollView
            contentContainerStyle={{
              minHeight: size.height,
              justifyContent: "center",
              alignItems: "center",
              width: Math.max(size.width, w * zoom),
            }}
          >
            <Image
              source={{ uri }}
              accessibilityLabel={`${item.label} full photograph`}
              resizeMode="contain"
              style={{ width: w * zoom, height: h * zoom }}
            />
          </ScrollView>
        </ScrollView>
      ) : (
        <Text accessibilityRole="alert" style={{ color: c.text, padding: 24 }}>
          {loading
            ? "Loading photograph…"
            : "Photo unavailable on this device."}
        </Text>
      )}
    </View>
  );
}
export function PhotoViewer({
  items,
  initial = 0,
  onClose,
}: {
  items: PhotoItem[];
  initial?: number;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(initial);
  const [zoom, setZoom] = useState(1);
  const { height } = useWindowDimensions();
  const item = items[selected] ?? items[0];
  if (!item) return null;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: c.bg }}
        accessibilityViewIsModal
      >
        <ScrollView
          style={{ flexGrow: 0, maxHeight: height * 0.45 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
        >
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
              justifyContent: "space-between",
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ color: c.text, fontSize: 20 }}
            >
              Compare photographs
            </Text>
            <Control title="Close photo viewer" onPress={onClose} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {items.map((p, i) => (
              <Control
                key={`${p.id}:${i}`}
                title={p.label}
                selected={i === selected}
                onPress={() => {
                  setSelected(i);
                  setZoom(1);
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Control
              title="Zoom out"
              disabled={zoom === 1}
              onPress={() => setZoom((v) => Math.max(1, v - 1))}
            />
            <Control
              title="Zoom in"
              disabled={zoom === 4}
              onPress={() => setZoom((v) => Math.min(4, v + 1))}
            />
            <Control title="Fit whole photo" onPress={() => setZoom(1)} />
          </View>
          <Text style={{ color: c.muted }}>
            {zoom}× · Use zoom buttons, then scroll to inspect detail. Switching
            photos resets to the whole image.
          </Text>
        </ScrollView>
        <ExpandedPhoto item={item} zoom={zoom} />
      </SafeAreaView>
    </Modal>
  );
}
export function PhotoPreview({
  id,
  label = "Saved photograph",
  compact = false,
  interactive = true,
  light = false,
}: {
  id: string;
  label?: string;
  compact?: boolean;
  interactive?: boolean;
  light?: boolean;
}) {
  const { uri, loading } = usePhoto(id);
  const [open, setOpen] = useState(false);
  const content = (
    <View style={{ gap: 6, width: "100%" }}>
      {uri ? (
        <Image
          accessibilityLabel={label}
          source={{ uri }}
          resizeMode="contain"
          style={{
            width: "100%",
            height: compact ? 110 : 220,
            borderRadius: 12,
            backgroundColor: c.bg,
          }}
        />
      ) : (
        <View
          style={{
            minHeight: compact ? 80 : 120,
            padding: 14,
            justifyContent: "center",
            backgroundColor: c.raised,
          }}
        >
          <Text style={{ color: c.muted }}>
            {loading ? "Loading photograph…" : "Photo unavailable"}
          </Text>
        </View>
      )}
      <Text style={{ color: light ? "#52686C" : c.muted, fontSize: 13 }}>
        {label}
        {interactive && uri ? " · Tap to enlarge" : ""}
      </Text>
    </View>
  );
  return (
    <>
      {interactive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Enlarge ${label}`}
          disabled={!uri}
          onPress={() => setOpen(true)}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
      {open && (
        <PhotoViewer items={[{ id, label }]} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
export function PhotoComparison({
  originals,
  results,
}: {
  originals: PhotoItem[];
  results: PhotoItem[];
}) {
  const [open, setOpen] = useState(false);
  const items = [...originals, ...results];
  if (!items.length)
    return (
      <Text style={{ color: c.muted }}>
        No photographs yet. Add a test photograph below to record the result.
      </Text>
    );
  return (
    <View style={{ gap: 10 }}>
      <Control
        title="Compare original and new photos"
        onPress={() => setOpen(true)}
      />
      {!results.length && (
        <Text style={{ color: c.muted }}>
          Add a test photograph to compare it with the original.
        </Text>
      )}
      {!originals.length && (
        <Text style={{ color: c.muted }}>
          No original photograph was saved. You can inspect your new result.
        </Text>
      )}
      {open && <PhotoViewer items={items} onClose={() => setOpen(false)} />}
    </View>
  );
}
