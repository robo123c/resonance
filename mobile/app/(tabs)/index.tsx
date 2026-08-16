import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Artwork, Card, COLORS, SectionHeader, TrackRow } from "@/components/apple-music-ui";
import { albums, featuredTrack, madeForYou, recentlyPlayed, stations } from "@/lib/apple-music/mock-data";
import { useResonancePlayer } from "@/lib/resonance/player";

export default function ListenNowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playTrack } = useResonancePlayer();
  const [refreshing, setRefreshing] = useState(false);
  const play = (track = featuredTrack, queue = recentlyPlayed) => { void playTrack(track, queue); };
  const refresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 650); };
  return <ScrollView contentContainerStyle={{ paddingBottom: 154, paddingTop: Math.max(insets.top, 10) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.pink} />} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>LISTEN NOW</Text><Text style={styles.title}>Good evening, Blake</Text></View><Pressable accessibilityLabel="Open settings" onPress={() => router.push("/settings")} style={styles.avatar}><Text style={styles.avatarText}>B</Text></Pressable></View>
    <Pressable onPress={() => play()} style={({ pressed }) => [styles.hero, pressed && styles.pressed]}><Artwork uri={featuredTrack.artwork} size={190} radius={0} /><View style={styles.heroOverlay} /><View style={styles.heroCopy}><Text style={styles.heroEyebrow}>NEW MUSIC DAILY</Text><Text style={styles.heroTitle}>The songs you need to hear right now.</Text><Text style={styles.heroMeta}>A handpicked selection from Apple Music</Text><View style={styles.heroPlay}><MaterialIcons name="play-arrow" color={COLORS.pink} size={20} /><Text style={styles.heroPlayText}>PLAY</Text></View></View></Pressable>
    <SectionHeader title="Recently Played" action="See All" onAction={() => router.push("/library")} />
    <FlatList horizontal data={recentlyPlayed} keyExtractor={(item) => item.id} contentContainerStyle={styles.rowPad} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <Card item={{ id: item.id, title: item.title, subtitle: item.artist, artwork: item.artwork ?? "", kind: "album" }} onPress={() => play(item, recentlyPlayed)} width={142} />} />
    <SectionHeader title="Made For You" action="See All" />
    <FlatList horizontal data={madeForYou} keyExtractor={(item) => item.id} contentContainerStyle={styles.rowPad} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <Card item={item} width={164} onPress={() => play()} />} />
    <SectionHeader title="Recommended Albums" action="See All" />
    <FlatList horizontal data={albums} keyExtractor={(item) => item.id} contentContainerStyle={styles.rowPad} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <Card item={item} width={154} onPress={() => play(recentlyPlayed.find((track) => track.album === item.title) ?? featuredTrack, recentlyPlayed)} />} />
    <SectionHeader title="Heavy Rotation" />
    <View style={styles.listCard}>{recentlyPlayed.slice(0, 3).map((track, index) => <TrackRow key={track.id} track={track} index={index} onPress={() => play(track, recentlyPlayed)} />)}</View>
    <SectionHeader title="Stations for You" />
    <FlatList horizontal data={stations} keyExtractor={(item) => item.id} contentContainerStyle={styles.rowPad} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <Card item={item} width={168} onPress={() => play()} />} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 22 },
  eyebrow: { color: COLORS.pink, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: COLORS.ink, fontSize: 25, fontWeight: "800", letterSpacing: -0.7, marginTop: 5 },
  avatar: { alignItems: "center", backgroundColor: "#E8DDFE", borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  avatarText: { color: COLORS.purple, fontSize: 16, fontWeight: "800" },
  hero: { backgroundColor: COLORS.dark, borderRadius: 14, height: 190, marginHorizontal: 20, overflow: "hidden" },
  heroOverlay: { backgroundColor: "rgba(12,12,18,0.56)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  heroCopy: { bottom: 19, left: 20, position: "absolute", right: 18 },
  heroEyebrow: { color: "#F5B3C0", fontSize: 10, fontWeight: "800", letterSpacing: 1.15 },
  heroTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", letterSpacing: -0.5, lineHeight: 27, marginTop: 4, maxWidth: 280 },
  heroMeta: { color: "#E2E2E6", fontSize: 12, marginTop: 7 },
  heroPlay: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderRadius: 15, flexDirection: "row", marginTop: 12, paddingHorizontal: 11, paddingVertical: 6 },
  heroPlayText: { color: COLORS.pink, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginLeft: 3 },
  rowPad: { paddingLeft: 20, paddingRight: 6 },
  listCard: { backgroundColor: COLORS.surface, borderRadius: 12, marginHorizontal: 12, overflow: "hidden" },
  pressed: { opacity: 0.84 },
});
