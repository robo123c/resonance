import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useResonancePlayer } from "@/lib/resonance/player";
import type { Track } from "@/lib/resonance/types";

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function TrackRow({ track, queue }: { track: Track; queue?: Track[] }) {
  const { currentTrack, isPlaying, playTrack } = useResonancePlayer();
  const active = currentTrack?.id === track.id;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.title} by ${track.artist}`}
      onPress={() => void playTrack(track, queue)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.artwork, active && styles.artworkActive]}>
        <MaterialIcons name={active && isPlaying ? "graphic-eq" : "music-note"} size={22} color={active ? "#0B1210" : "#A3B5AC"} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, active && styles.activeText]}>{track.title || track.file_name}</Text>
        <Text numberOfLines={1} style={styles.meta}>{track.artist || "Unknown artist"} · {track.album || "Unknown album"}</Text>
      </View>
      <Text style={styles.duration}>{formatDuration(track.duration_ms)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 68, alignItems: "center", flexDirection: "row", gap: 12, paddingHorizontal: 18, paddingVertical: 8 },
  rowPressed: { opacity: 0.68 },
  artwork: { alignItems: "center", backgroundColor: "#1A2A24", borderRadius: 12, height: 44, justifyContent: "center", width: 44 },
  artworkActive: { backgroundColor: "#5DE1B5" },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  title: { color: "#ECF8F2", fontSize: 15, fontWeight: "600" },
  activeText: { color: "#5DE1B5" },
  meta: { color: "#A3B5AC", fontSize: 13 },
  duration: { color: "#A3B5AC", fontSize: 12, fontVariant: ["tabular-nums"] },
});
