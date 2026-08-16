import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Artwork, COLORS } from "@/components/apple-music-ui";
import { useResonancePlayer } from "@/lib/resonance/player";

export function MiniPlayer() {
  const router = useRouter();
  const { currentTrack, isPlaying, position, duration, toggle } = useResonancePlayer();
  if (!currentTrack) return null;
  const progress = duration ? Math.min(1, position / duration) : 0;
  return <View style={styles.shell}><View style={[styles.progress, { width: `${progress * 100}%` }]} /><Pressable onPress={() => router.push("/now-playing")} style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}><Artwork uri={currentTrack.artwork} size={42} radius={5} /><View style={styles.copy}><Text numberOfLines={1} style={styles.title}>{currentTrack.title}</Text><Text numberOfLines={1} style={styles.artist}>{currentTrack.artist}</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? "Pause" : "Play"} onPress={toggle} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}><MaterialIcons name={isPlaying ? "pause" : "play-arrow"} color={COLORS.ink} size={25} /></Pressable><Pressable accessibilityLabel="Open queue" onPress={() => router.push("/now-playing")} hitSlop={12} style={styles.queueButton}><MaterialIcons name="queue-music" color={COLORS.ink} size={22} /></Pressable></View>;
}

const styles = StyleSheet.create({
  shell: { alignItems: "center", backgroundColor: COLORS.surface, borderColor: COLORS.divider, borderRadius: 10, borderWidth: 1, bottom: 65, flexDirection: "row", left: 10, minHeight: 62, position: "absolute", right: 10, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, zIndex: 10 },
  progress: { backgroundColor: COLORS.pink, height: 2, left: 0, position: "absolute", top: 0 },
  copyButton: { alignItems: "center", flex: 1, flexDirection: "row", minWidth: 0, paddingLeft: 10, paddingVertical: 8 },
  copy: { flex: 1, marginLeft: 10, minWidth: 0 },
  title: { color: COLORS.ink, fontSize: 14, fontWeight: "700" },
  artist: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  playButton: { alignItems: "center", borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  queueButton: { alignItems: "center", height: 42, justifyContent: "center", marginRight: 6, width: 36 },
  pressed: { opacity: 0.62, transform: [{ scale: 0.96 }] },
});
