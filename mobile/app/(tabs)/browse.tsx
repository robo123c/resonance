import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card, COLORS, SectionHeader } from "@/components/apple-music-ui";
import { albums, artists, featuredTrack, genres, playlists, tracks } from "@/lib/apple-music/mock-data";
import { useResonancePlayer } from "@/lib/resonance/player";

export default function BrowseScreen() {
  const { playTrack } = useResonancePlayer();
  const [selectedGenre, setSelectedGenre] = useState("Alternative");
  const play = (track = featuredTrack) => { void playTrack(track, tracks); };
  return <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.top}><Text style={styles.eyebrow}>BROWSE</Text><Text style={styles.title}>What’s new</Text><Pressable style={styles.search}><MaterialIcons name="search" size={22} color={COLORS.ink} /></Pressable></View>
    <Pressable onPress={() => play()} style={({ pressed }) => [styles.feature, pressed && styles.pressed]}><View style={styles.featureTint} /><View style={styles.featureText}><Text style={styles.featureLabel}>EDITORIAL FEATURE</Text><Text style={styles.featureTitle}>A world of sound, waiting to be discovered.</Text><Text style={styles.featureMeta}>Explore the best of today’s music.</Text></View><MaterialIcons name="arrow-forward" color="#FFFFFF" size={25} style={styles.arrow} /></Pressable>
    <SectionHeader title="New Music" action="See All" />
    <FlatList horizontal data={albums} keyExtractor={(item) => item.id} contentContainerStyle={styles.rowPad} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <Card item={item} width={155} onPress={() => play(tracks.find((track) => track.album === item.title))} />} />
    <SectionHeader title="Playlists" action="See All" />
    <FlatList horizontal data={playlists} keyExtractor={(item) => item.id} contentContainerStyle={styles.rowPad} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <Card item={item} width={165} onPress={() => play()} />} />
    <SectionHeader title="Browse by Genre" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreRow}>{genres.map((genre) => <Pressable key={genre} onPress={() => setSelectedGenre(genre)} style={[styles.genre, selectedGenre === genre && styles.genreSelected]}><Text style={[styles.genreText, selectedGenre === genre && styles.genreTextSelected]}>{genre}</Text></Pressable>)}</ScrollView>
    <SectionHeader title={`${selectedGenre} charts`} action="See All" />
    <View style={styles.chartCard}>{tracks.slice(0, 4).map((track, index) => <Pressable key={track.id} onPress={() => play(track)} style={styles.chartRow}><Text style={styles.rank}>{String(index + 1).padStart(2, "0")}</Text><View style={styles.chartCopy}><Text style={styles.chartTitle}>{track.title}</Text><Text style={styles.chartMeta}>{track.artist}</Text></View><MaterialIcons name="play-circle-outline" color={COLORS.pink} size={25} /></Pressable>)}</View>
    <SectionHeader title="Artists to watch" />
    <FlatList horizontal data={artists} keyExtractor={(item) => item.id} contentContainerStyle={styles.rowPad} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <Card item={item} width={135} onPress={() => play()} />} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 154, paddingTop: 18 },
  top: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20 },
  eyebrow: { color: COLORS.pink, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: COLORS.ink, flex: 1, fontSize: 27, fontWeight: "800", letterSpacing: -0.8, marginLeft: 12 },
  search: { alignItems: "center", backgroundColor: COLORS.surface, borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  feature: { backgroundColor: "#6D45DA", borderRadius: 14, height: 194, marginHorizontal: 20, marginTop: 21, overflow: "hidden" },
  featureTint: { backgroundColor: "#D75A88", borderRadius: 130, height: 250, opacity: 0.72, position: "absolute", right: -65, top: -60, width: 250 },
  featureText: { bottom: 22, left: 20, position: "absolute", right: 60 },
  featureLabel: { color: "#F1D9FF", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  featureTitle: { color: "#FFFFFF", fontSize: 25, fontWeight: "800", letterSpacing: -0.7, lineHeight: 28, marginTop: 5 },
  featureMeta: { color: "#E8DFFF", fontSize: 13, marginTop: 7 },
  arrow: { position: "absolute", right: 19, top: 21 },
  rowPad: { paddingLeft: 20, paddingRight: 6 },
  genreRow: { paddingLeft: 20, paddingRight: 10 },
  genre: { backgroundColor: COLORS.surface, borderColor: COLORS.divider, borderRadius: 18, borderWidth: 1, marginRight: 8, paddingHorizontal: 14, paddingVertical: 9 },
  genreSelected: { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  genreText: { color: COLORS.ink, fontSize: 13, fontWeight: "700" },
  genreTextSelected: { color: "#FFFFFF" },
  chartCard: { backgroundColor: COLORS.surface, borderRadius: 12, marginHorizontal: 12, overflow: "hidden" },
  chartRow: { alignItems: "center", borderBottomColor: COLORS.divider, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 66, paddingHorizontal: 16 },
  rank: { color: COLORS.pink, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "800", width: 34 },
  chartCopy: { flex: 1 },
  chartTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "700" },
  chartMeta: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  pressed: { opacity: 0.75 },
});
