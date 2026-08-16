import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatDuration, type MusicCard } from "@/lib/apple-music/mock-data";
import type { Track } from "@/lib/resonance/types";

export const COLORS = {
  background: "#F7F7F8",
  surface: "#FFFFFF",
  ink: "#17171A",
  muted: "#77777F",
  faint: "#AEAEB4",
  divider: "#E5E5E8",
  pink: "#FA2D55",
  purple: "#6F45E8",
  dark: "#121214",
  darkSurface: "#1D1D20",
  darkMuted: "#A2A2A9",
};

export function Artwork({ uri, size = 150, radius = 8, testID }: { uri?: string; size?: number; radius?: number; testID?: string }) {
  return uri ? <Image testID={testID} source={{ uri }} contentFit="cover" style={{ width: size, height: size, borderRadius: radius }} /> : <View style={[styles.fallback, { width: size, height: size, borderRadius: radius }]}><MaterialIcons name="music-note" color="#FFFFFF" size={Math.round(size * 0.28)} /></View>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{action && <Pressable onPress={onAction} hitSlop={10}><Text style={styles.sectionAction}>{action}</Text></Pressable>}</View>;
}

export function Card({ item, onPress, width = 150 }: { item: MusicCard; onPress?: () => void; width?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.subtitle}`} onPress={onPress} style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}><Artwork uri={item.artwork} size={width} radius={9} /><Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.cardSubtitle}>{item.subtitle}</Text></Pressable>;
}

export function CircularCard({ item, onPress, size = 128 }: { item: MusicCard; onPress?: () => void; size?: number }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, { width: size }, pressed && styles.pressed]}><Artwork uri={item.artwork} size={size} radius={size / 2} /><Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.cardSubtitle}>{item.subtitle}</Text></Pressable>;
}

export function TrackRow({ track, onPress, onMore, showNumber = false, index = 0 }: { track: Track; onPress?: () => void; onMore?: () => void; showNumber?: boolean; index?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Play ${track.title} by ${track.artist}`} onPress={onPress} style={({ pressed }) => [styles.trackRow, pressed && styles.pressed]}><View style={styles.trackLeading}>{showNumber ? <Text style={styles.trackNumber}>{index + 1}</Text> : <Artwork uri={track.artwork} size={48} radius={5} />}</View><View style={styles.trackCopy}><Text numberOfLines={1} style={styles.trackTitle}>{track.title}</Text><Text numberOfLines={1} style={styles.trackMeta}>{track.artist} · {track.album}</Text></View><Text style={styles.trackDuration}>{formatDuration(track.duration_ms)}</Text><Pressable accessibilityLabel={`More actions for ${track.title}`} onPress={onMore} hitSlop={12} style={styles.moreButton}><MaterialIcons name="more-horiz" size={22} color={COLORS.muted} /></Pressable></Pressable>;
}

export function PlayButton({ onPress, size = 58, filled = true }: { onPress?: () => void; size?: number; filled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Play" onPress={onPress} style={({ pressed }) => [{ alignItems: "center", backgroundColor: filled ? COLORS.pink : "transparent", borderColor: COLORS.pink, borderRadius: size / 2, borderWidth: filled ? 0 : 1, height: size, justifyContent: "center", width: size }, pressed && styles.pressed]}><MaterialIcons name="play-arrow" size={Math.round(size * 0.5)} color={filled ? "#FFFFFF" : COLORS.pink} /></Pressable>;
}

const styles = StyleSheet.create({
  sectionHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginBottom: 13, marginTop: 29, paddingHorizontal: 20 },
  sectionTitle: { color: COLORS.ink, fontSize: 21, fontWeight: "800", letterSpacing: -0.4 },
  sectionAction: { color: COLORS.pink, fontSize: 14, fontWeight: "700" },
  card: { marginRight: 14 },
  cardTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "700", marginTop: 9 },
  cardSubtitle: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  fallback: { alignItems: "center", backgroundColor: COLORS.purple, justifyContent: "center" },
  trackRow: { alignItems: "center", flexDirection: "row", minHeight: 68, paddingHorizontal: 20 },
  trackLeading: { alignItems: "center", justifyContent: "center", width: 50 },
  trackNumber: { color: COLORS.muted, fontSize: 15, fontVariant: ["tabular-nums"] },
  trackCopy: { flex: 1, marginLeft: 13 },
  trackTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "600" },
  trackMeta: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  trackDuration: { color: COLORS.faint, fontSize: 12, fontVariant: ["tabular-nums"], marginLeft: 6 },
  moreButton: { alignItems: "center", height: 34, justifyContent: "center", marginLeft: 2, width: 30 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.985 }] },
});
