import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useResonancePlayer } from "@/lib/resonance/player";

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export default function NowPlayingScreen() {
  const router = useRouter();
  const { currentTrack, duration, isPlaying, next, position, previous, seek, toggle } = useResonancePlayer();
  const [seekWidth, setSeekWidth] = useState(0);
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;

  if (!currentTrack) {
    return (
      <View style={styles.emptyPage}>
        <MaterialIcons name="queue-music" color="#5DE1B5" size={48} />
        <Text style={styles.emptyTitle}>Nothing is playing</Text>
        <Text style={styles.emptyCopy}>Choose a track from your library to start listening.</Text>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.returnButton, pressed && styles.pressed]}><Text style={styles.returnText}>Back to library</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="Close now playing" onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MaterialIcons name="keyboard-arrow-down" color="#ECF8F2" size={30} /></Pressable>
        <Text style={styles.nowPlaying}>NOW PLAYING</Text>
        <View style={styles.iconButton} />
      </View>
      <View style={styles.artwork}><MaterialIcons name="graphic-eq" color="#0B1210" size={104} /></View>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.title}>{currentTrack.title}</Text>
        <Text numberOfLines={1} style={styles.artist}>{currentTrack.artist || "Unknown artist"}</Text>
        <Text numberOfLines={1} style={styles.album}>{currentTrack.album || "Unknown album"}</Text>
      </View>
      <Pressable
        accessibilityLabel="Seek through track"
        onLayout={(event) => setSeekWidth(event.nativeEvent.layout.width)}
        onPress={(event) => {
          const nextPosition = (event.nativeEvent.locationX / Math.max(seekWidth, 1)) * duration;
          void seek(nextPosition);
        }}
        style={styles.seekArea}
      >
        <View style={styles.seekTrack}><View style={[styles.seekProgress, { width: `${progress * 100}%` }]} /></View>
      </Pressable>
      <View style={styles.times}><Text style={styles.time}>{formatTime(position)}</Text><Text style={styles.time}>{formatTime(duration)}</Text></View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous track" onPress={() => void previous()} style={({ pressed }) => [styles.secondaryControl, pressed && styles.pressed]}><MaterialIcons name="skip-previous" color="#ECF8F2" size={34} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? "Pause" : "Play"} onPress={toggle} style={({ pressed }) => [styles.primaryControl, pressed && styles.pressed]}><MaterialIcons name={isPlaying ? "pause" : "play-arrow"} color="#0B1210" size={44} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next track" onPress={() => void next()} style={({ pressed }) => [styles.secondaryControl, pressed && styles.pressed]}><MaterialIcons name="skip-next" color="#ECF8F2" size={34} /></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#0B1210", flex: 1, paddingHorizontal: 24, paddingTop: 58 },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  iconButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  nowPlaying: { color: "#A3B5AC", fontSize: 11, fontWeight: "800", letterSpacing: 1.3 },
  artwork: { alignItems: "center", backgroundColor: "#5DE1B5", borderRadius: 34, flex: 1, justifyContent: "center", marginBottom: 32, marginTop: 28, maxHeight: 370 },
  copy: { marginBottom: 28 },
  title: { color: "#ECF8F2", fontSize: 27, fontWeight: "800", letterSpacing: -0.5, lineHeight: 34 },
  artist: { color: "#5DE1B5", fontSize: 17, fontWeight: "700", marginTop: 8 },
  album: { color: "#A3B5AC", fontSize: 14, marginTop: 4 },
  seekArea: { height: 26, justifyContent: "center" },
  seekTrack: { backgroundColor: "#294238", borderRadius: 3, height: 5, overflow: "hidden" },
  seekProgress: { backgroundColor: "#5DE1B5", borderRadius: 3, height: 5 },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  time: { color: "#A3B5AC", fontSize: 12, fontVariant: ["tabular-nums"] },
  controls: { alignItems: "center", flexDirection: "row", justifyContent: "space-around", marginBottom: 42, marginTop: 28 },
  secondaryControl: { alignItems: "center", height: 56, justifyContent: "center", width: 56 },
  primaryControl: { alignItems: "center", backgroundColor: "#5DE1B5", borderRadius: 36, height: 72, justifyContent: "center", width: 72 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  emptyPage: { alignItems: "center", backgroundColor: "#0B1210", flex: 1, justifyContent: "center", padding: 32 },
  emptyTitle: { color: "#ECF8F2", fontSize: 24, fontWeight: "800", marginTop: 18 },
  emptyCopy: { color: "#A3B5AC", fontSize: 15, lineHeight: 22, marginTop: 9, textAlign: "center" },
  returnButton: { backgroundColor: "#5DE1B5", borderRadius: 14, marginTop: 24, paddingHorizontal: 20, paddingVertical: 13 },
  returnText: { color: "#0B1210", fontSize: 15, fontWeight: "800" },
});
