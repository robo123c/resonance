import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Artwork, COLORS } from "@/components/apple-music-ui";
import { formatDuration } from "@/lib/apple-music/mock-data";
import { useResonancePlayer } from "@/lib/resonance/player";

function formatTime(seconds: number) {
  return formatDuration(Math.max(0, Math.floor(seconds) * 1000));
}

export default function NowPlayingScreen() {
  const router = useRouter();
  const { currentTrack, duration, isPlaying, next, position, previous, queue, seek, toggle } = useResonancePlayer();
  const [seekWidth, setSeekWidth] = useState(0);
  const [mode, setMode] = useState<"player" | "lyrics" | "queue">("player");
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;

  if (!currentTrack) {
    return <View style={styles.emptyPage}><MaterialIcons name="queue-music" color={COLORS.pink} size={48} /><Text style={styles.emptyTitle}>Nothing is playing</Text><Text style={styles.emptyCopy}>Choose a song from Listen Now, Browse, Radio, or your Library.</Text><Pressable onPress={() => router.back()} style={styles.returnButton}><Text style={styles.returnText}>Back to music</Text></Pressable></View>;
  }

  const lyrics = currentTrack.lyrics ?? ["Lyrics will appear here when available.", "Connect a licensed lyrics provider to sync every line."];
  const currentIndex = queue.findIndex((item) => item.id === currentTrack.id);

  return <View style={styles.page}>
    <View style={styles.topBar}>
      <Pressable accessibilityLabel="Close now playing" onPress={() => router.back()} style={styles.iconButton}><MaterialIcons name="keyboard-arrow-down" color="#FFFFFF" size={30} /></Pressable>
      <Text style={styles.nowPlaying}>{mode === "lyrics" ? "LYRICS" : mode === "queue" ? "QUEUE" : "NOW PLAYING"}</Text>
      <Pressable accessibilityLabel="More options" style={styles.iconButton}><MaterialIcons name="more-horiz" color="#FFFFFF" size={25} /></Pressable>
    </View>

    {mode === "lyrics" ? <ScrollView contentContainerStyle={styles.lyricsPage} showsVerticalScrollIndicator={false}>
      <Artwork uri={currentTrack.artwork} size={94} radius={8} />
      <Text style={styles.lyricsTitle}>{currentTrack.title}</Text>
      <Text style={styles.lyricsArtist}>{currentTrack.artist}</Text>
      <View style={styles.lyricsBody}>{lyrics.map((line, index) => <Text key={`${line}-${index}`} style={[styles.lyricLine, index === Math.floor(position / 7) % lyrics.length && styles.lyricActive]}>{line}</Text>)}</View>
    </ScrollView> : mode === "queue" ? <ScrollView contentContainerStyle={styles.queuePage}>
      {queue.map((track, index) => <Pressable key={`${track.id}-${index}`} onPress={() => void seek(0)} style={[styles.queueRow, index === currentIndex && styles.queueActive]}><Text style={styles.queueIndex}>{index + 1}</Text><View style={styles.queueCopy}><Text style={styles.queueTitle}>{track.title}</Text><Text style={styles.queueMeta}>{track.artist}</Text></View>{index === currentIndex ? <MaterialIcons name="graphic-eq" color={COLORS.pink} size={20} /> : <MaterialIcons name="drag-handle" color="#77777F" size={21} />}</Pressable>)}
    </ScrollView> : <>
      <View style={styles.artworkWrap}><Artwork uri={currentTrack.artwork} size={320} radius={16} /></View>
      <View style={styles.copy}>
        <View style={styles.titleLine}><View style={styles.titleCopy}><Text numberOfLines={2} style={styles.title}>{currentTrack.title}</Text><Text numberOfLines={1} style={styles.artist}>{currentTrack.artist}</Text><Text numberOfLines={1} style={styles.album}>{currentTrack.album} · {currentTrack.year ?? "2024"}</Text></View><Pressable hitSlop={10}><MaterialIcons name="favorite-border" color="#FFFFFF" size={26} /></Pressable></View>
        <Pressable accessibilityLabel="Seek through track" onLayout={(event) => setSeekWidth(event.nativeEvent.layout.width)} onPress={(event) => void seek((event.nativeEvent.locationX / Math.max(seekWidth, 1)) * duration)} style={styles.seekArea}><View style={styles.seekTrack}><View style={[styles.seekProgress, { width: `${progress * 100}%` }]} /></View></Pressable>
        <View style={styles.times}><Text style={styles.time}>{formatTime(position)}</Text><Text style={styles.time}>-{formatTime(Math.max(0, duration - position))}</Text></View>
        <View style={styles.controls}><Pressable accessibilityLabel="Shuffle" style={styles.smallControl}><MaterialIcons name="shuffle" color="#FFFFFF" size={22} /></Pressable><Pressable accessibilityLabel="Previous track" onPress={() => void previous()} style={styles.secondaryControl}><MaterialIcons name="skip-previous" color="#FFFFFF" size={36} /></Pressable><Pressable accessibilityLabel={isPlaying ? "Pause" : "Play"} onPress={toggle} style={styles.primaryControl}><MaterialIcons name={isPlaying ? "pause" : "play-arrow"} color={COLORS.ink} size={43} /></Pressable><Pressable accessibilityLabel="Next track" onPress={() => void next()} style={styles.secondaryControl}><MaterialIcons name="skip-next" color="#FFFFFF" size={36} /></Pressable><Pressable accessibilityLabel="Repeat" style={styles.smallControl}><MaterialIcons name="repeat" color="#FFFFFF" size={22} /></Pressable></View>
      </View>
    </>}

    {mode === "player" && <View style={styles.bottomActions}><Pressable onPress={() => setMode("lyrics")} style={styles.bottomAction}><MaterialIcons name="lyrics" color="#FFFFFF" size={22} /><Text style={styles.bottomLabel}>Lyrics</Text></Pressable><Pressable onPress={() => setMode("queue")} style={styles.bottomAction}><MaterialIcons name="queue-music" color="#FFFFFF" size={22} /><Text style={styles.bottomLabel}>Queue</Text></Pressable><Pressable style={styles.bottomAction}><MaterialIcons name="airplay" color="#FFFFFF" size={22} /><Text style={styles.bottomLabel}>AirPlay</Text></Pressable></View>}
    {mode !== "player" && <Pressable onPress={() => setMode("player")} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#17131F", flex: 1, paddingHorizontal: 22, paddingTop: 51 },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  iconButton: { alignItems: "center", height: 42, justifyContent: "center", width: 42 },
  nowPlaying: { color: "#C0B8C8", fontSize: 11, fontWeight: "800", letterSpacing: 1.3 },
  artworkWrap: { alignItems: "center", flex: 1, justifyContent: "center", marginTop: 8, maxHeight: 380 },
  copy: { marginBottom: 18 },
  titleLine: { alignItems: "center", flexDirection: "row" },
  titleCopy: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", letterSpacing: -0.6, lineHeight: 32 },
  artist: { color: "#F4A6B8", fontSize: 17, fontWeight: "700", marginTop: 7 },
  album: { color: "#BFB5C5", fontSize: 13, marginTop: 3 },
  seekArea: { height: 25, justifyContent: "center", marginTop: 19 },
  seekTrack: { backgroundColor: "#524559", borderRadius: 4, height: 5, overflow: "hidden" },
  seekProgress: { backgroundColor: "#FFFFFF", borderRadius: 4, height: 5 },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  time: { color: "#BFB5C5", fontSize: 12, fontVariant: ["tabular-nums"] },
  controls: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  smallControl: { alignItems: "center", height: 46, justifyContent: "center", width: 32 },
  secondaryControl: { alignItems: "center", height: 58, justifyContent: "center", width: 55 },
  primaryControl: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 36, height: 70, justifyContent: "center", width: 70 },
  bottomActions: { alignItems: "center", flexDirection: "row", justifyContent: "space-around", marginBottom: 21, marginTop: 20 },
  bottomAction: { alignItems: "center", minWidth: 70 },
  bottomLabel: { color: "#C0B8C8", fontSize: 11, marginTop: 5 },
  lyricsPage: { alignItems: "center", paddingBottom: 70, paddingTop: 25 },
  lyricsTitle: { color: "#FFFFFF", fontSize: 21, fontWeight: "800", marginTop: 14 },
  lyricsArtist: { color: "#F4A6B8", fontSize: 14, marginTop: 4 },
  lyricsBody: { alignSelf: "stretch", paddingTop: 40 },
  lyricLine: { color: "#716878", fontSize: 24, fontWeight: "800", lineHeight: 37, marginBottom: 14 },
  lyricActive: { color: "#FFFFFF" },
  queuePage: { paddingBottom: 70, paddingTop: 24 },
  queueRow: { alignItems: "center", borderBottomColor: "#302735", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 68 },
  queueActive: { backgroundColor: "#251C2C", borderRadius: 8, paddingHorizontal: 9 },
  queueIndex: { color: "#8C8192", fontSize: 13, width: 28 },
  queueCopy: { flex: 1 },
  queueTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  queueMeta: { color: "#BFB5C5", fontSize: 13, marginTop: 3 },
  done: { alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 18, marginBottom: 28, paddingHorizontal: 22, paddingVertical: 9 },
  doneText: { color: COLORS.ink, fontSize: 14, fontWeight: "800" },
  emptyPage: { alignItems: "center", backgroundColor: "#17131F", flex: 1, justifyContent: "center", padding: 32 },
  emptyTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", marginTop: 18 },
  emptyCopy: { color: "#BFB5C5", fontSize: 15, lineHeight: 22, marginTop: 9, textAlign: "center" },
  returnButton: { backgroundColor: "#FFFFFF", borderRadius: 14, marginTop: 24, paddingHorizontal: 20, paddingVertical: 13 },
  returnText: { color: COLORS.ink, fontSize: 15, fontWeight: "800" },
});
