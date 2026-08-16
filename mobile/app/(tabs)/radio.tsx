import { MaterialIcons } from "@expo/vector-icons";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Artwork, Card, COLORS, SectionHeader } from "@/components/apple-music-ui";
import { featuredTrack, recentlyPlayed, stations } from "@/lib/apple-music/mock-data";
import { useResonancePlayer } from "@/lib/resonance/player";

export default function RadioScreen() {
  const { playTrack } = useResonancePlayer();
  const play = () => { void playTrack(featuredTrack, recentlyPlayed); };
  return <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>RADIO</Text><Text style={styles.title}>Tune in</Text></View><Pressable style={styles.cast}><MaterialIcons name="cast" color={COLORS.ink} size={20} /></Pressable></View>
    <Pressable onPress={play} style={({ pressed }) => [styles.liveCard, pressed && styles.pressed]}><View style={styles.liveGlow} /><View style={styles.liveCopy}><View style={styles.livePill}><View style={styles.dot} /><Text style={styles.liveText}>LIVE NOW</Text></View><Text style={styles.liveTitle}>Alt CTRL Radio</Text><Text style={styles.liveMeta}>The best new alternative music, all day.</Text><View style={styles.listen}><MaterialIcons name="play-arrow" color={COLORS.pink} size={19} /><Text style={styles.listenText}>LISTEN NOW</Text></View></View><Artwork uri={stations[0].artwork} size={132} radius={66} /> </Pressable>
    <SectionHeader title="Featured Stations" action="See All" />
    <FlatList horizontal data={stations} keyExtractor={(item) => item.id} contentContainerStyle={styles.rowPad} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <Card item={item} width={168} onPress={play} />} />
    <SectionHeader title="Shows" action="See All" />
    <View style={styles.showList}>{["The Zane Lowe Show", "Time Crisis", "Rap Life Radio"].map((show, index) => <Pressable key={show} onPress={play} style={styles.showRow}><Artwork uri={stations[index % stations.length].artwork} size={58} radius={29} /><View style={styles.showCopy}><Text style={styles.showTitle}>{show}</Text><Text style={styles.showMeta}>{index === 0 ? "New episode · Today" : "Available now"}</Text></View><MaterialIcons name="play-circle-outline" color={COLORS.pink} size={28} /></Pressable>)}</View>
    <SectionHeader title="Recently Played" />
    <View style={styles.recentCard}>{recentlyPlayed.slice(0, 3).map((track) => <Pressable key={track.id} onPress={play} style={styles.recentRow}><Artwork uri={track.artwork} size={46} radius={6} /><View style={styles.showCopy}><Text style={styles.showTitle}>{track.title}</Text><Text style={styles.showMeta}>{track.artist} Radio</Text></View><MaterialIcons name="more-horiz" color={COLORS.muted} size={22} /></Pressable>)}</View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 154, paddingTop: 18 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20 },
  eyebrow: { color: COLORS.pink, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: COLORS.ink, fontSize: 27, fontWeight: "800", letterSpacing: -0.8, marginTop: 4 },
  cast: { alignItems: "center", backgroundColor: COLORS.surface, borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  liveCard: { alignItems: "center", backgroundColor: "#17131F", borderRadius: 14, flexDirection: "row", justifyContent: "space-between", marginHorizontal: 20, marginTop: 21, minHeight: 174, overflow: "hidden", paddingHorizontal: 16 },
  liveGlow: { backgroundColor: "#8F2B62", borderRadius: 150, height: 280, opacity: 0.64, position: "absolute", right: -85, top: -82, width: 280 },
  liveCopy: { flex: 1, paddingVertical: 20 },
  livePill: { alignItems: "center", flexDirection: "row" },
  dot: { backgroundColor: "#F34E6E", borderRadius: 4, height: 7, width: 7 },
  liveText: { color: "#F3AFC0", fontSize: 10, fontWeight: "800", letterSpacing: 1, marginLeft: 6 },
  liveTitle: { color: "#FFFFFF", fontSize: 23, fontWeight: "800", letterSpacing: -0.5, marginTop: 7 },
  liveMeta: { color: "#C4BAC8", fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 175 },
  listen: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 15, flexDirection: "row", marginTop: 13, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" },
  listenText: { color: COLORS.pink, fontSize: 10, fontWeight: "900", letterSpacing: 0.6, marginLeft: 3 },
  rowPad: { paddingLeft: 20, paddingRight: 6 },
  showList: { backgroundColor: COLORS.surface, borderRadius: 12, marginHorizontal: 12, overflow: "hidden" },
  showRow: { alignItems: "center", borderBottomColor: COLORS.divider, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 79, paddingHorizontal: 16 },
  showCopy: { flex: 1, marginLeft: 12 },
  showTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "700" },
  showMeta: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  recentCard: { backgroundColor: COLORS.surface, borderRadius: 12, marginHorizontal: 12, overflow: "hidden" },
  recentRow: { alignItems: "center", borderBottomColor: COLORS.divider, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 69, paddingHorizontal: 16 },
  pressed: { opacity: 0.75 },
});
