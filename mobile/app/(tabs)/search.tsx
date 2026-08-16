import { MaterialIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Artwork, COLORS, SectionHeader, TrackRow } from "@/components/apple-music-ui";
import { albums, artists, playlists, stations, tracks } from "@/lib/apple-music/mock-data";
import { useResonancePlayer } from "@/lib/resonance/player";

export default function SearchScreen() {
  const { playTrack } = useResonancePlayer();
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState(["The Coastline", "Focus", "New music"]);
  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => ({ tracks: tracks.filter((track) => !normalized || `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(normalized)), albums: albums.filter((item) => !normalized || `${item.title} ${item.subtitle}`.toLowerCase().includes(normalized)), artists: artists.filter((item) => !normalized || item.title.toLowerCase().includes(normalized)), playlists: playlists.filter((item) => !normalized || item.title.toLowerCase().includes(normalized)), stations: stations.filter((item) => !normalized || item.title.toLowerCase().includes(normalized)) }), [normalized]);
  const hasQuery = normalized.length > 0;
  const search = (value: string) => { setQuery(value); setRecentSearches((items) => [value, ...items.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 4)); };
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><View style={styles.header}><Text style={styles.title}>Search</Text><MaterialIcons name="mic-none" color={COLORS.pink} size={24} /></View><View style={styles.search}><MaterialIcons name="search" color={COLORS.muted} size={21} /><TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setQuery} placeholder="Artists, songs, lyrics, and more" placeholderTextColor={COLORS.faint} style={styles.input} value={query} /><Pressable onPress={() => setQuery("")} hitSlop={9}>{query ? <MaterialIcons name="cancel" color={COLORS.faint} size={19} /> : null}</Pressable></View>{!hasQuery ? <><SectionHeader title="Recent Searches" action="Clear" onAction={() => setRecentSearches([])} /><View style={styles.recent}>{recentSearches.map((item) => <Pressable key={item} onPress={() => search(item)} style={styles.recentRow}><MaterialIcons name="history" color={COLORS.faint} size={21} /><Text style={styles.recentText}>{item}</Text><MaterialIcons name="arrow-outward" color={COLORS.faint} size={18} /></Pressable>)}</View><SectionHeader title="Browse Categories" /><View style={styles.categories}>{["New Music", "Spatial Audio", "Hit the Gym", "Chill", "Made for You", "Music Videos"].map((item, index) => <Pressable key={item} onPress={() => search(item)} style={[styles.category, { backgroundColor: ["#E5D8FF", "#FFD8E1", "#CBEDE1", "#DDE9FF", "#FFE9C8", "#D9D9F9"][index] }]}><Text style={styles.categoryText}>{item}</Text><MaterialIcons name="arrow-forward" color={COLORS.ink} size={18} /></Pressable>)}</View></> : results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0 ? <View style={styles.empty}><MaterialIcons name="search-off" color={COLORS.pink} size={42} /><Text style={styles.emptyTitle}>No results for “{query}”</Text><Text style={styles.emptyCopy}>Try a different artist, song, or album.</Text></View> : <><SectionHeader title="Songs" action={`${results.tracks.length} results`} /><View style={styles.listCard}>{results.tracks.slice(0, 5).map((track) => <TrackRow key={track.id} track={track} onPress={() => void playTrack(track, results.tracks)} />)}</View>{results.albums.length > 0 && <><SectionHeader title="Albums" /><View style={styles.entityCard}>{results.albums.slice(0, 3).map((item) => <Pressable key={item.id} style={styles.entityRow}><Artwork uri={item.artwork} size={46} radius={5} /><View style={styles.entityCopy}><Text style={styles.entityTitle}>{item.title}</Text><Text style={styles.entityMeta}>{item.subtitle} · Album</Text></View><MaterialIcons name="chevron-right" color={COLORS.faint} size={23} /></Pressable>)}</View></>}{results.artists.length > 0 && <><SectionHeader title="Artists" /><View style={styles.entityCard}>{results.artists.slice(0, 3).map((item) => <Pressable key={item.id} style={styles.entityRow}><Artwork uri={item.artwork} size={46} radius={23} /><View style={styles.entityCopy}><Text style={styles.entityTitle}>{item.title}</Text><Text style={styles.entityMeta}>Artist</Text></View><MaterialIcons name="chevron-right" color={COLORS.faint} size={23} /></Pressable>)}</View></>}</>}</ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 154, paddingTop: 18 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.8 },
  search: { alignItems: "center", backgroundColor: COLORS.surface, borderColor: COLORS.divider, borderRadius: 12, borderWidth: 1, flexDirection: "row", marginHorizontal: 20, marginTop: 20, minHeight: 50, paddingHorizontal: 13 },
  input: { color: COLORS.ink, flex: 1, fontSize: 15, marginLeft: 9, paddingVertical: 9 },
  recent: { backgroundColor: COLORS.surface, borderRadius: 12, marginHorizontal: 12, overflow: "hidden" },
  recentRow: { alignItems: "center", borderBottomColor: COLORS.divider, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 54, paddingHorizontal: 16 },
  recentText: { color: COLORS.ink, flex: 1, fontSize: 15, marginLeft: 11 },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20 },
  category: { alignItems: "center", borderRadius: 12, flexDirection: "row", justifyContent: "space-between", minHeight: 62, paddingHorizontal: 13, width: "47.5%" },
  categoryText: { color: COLORS.ink, flex: 1, fontSize: 14, fontWeight: "800" },
  listCard: { backgroundColor: COLORS.surface, borderRadius: 12, marginHorizontal: 12, overflow: "hidden" },
  entityCard: { backgroundColor: COLORS.surface, borderRadius: 12, marginHorizontal: 12, overflow: "hidden" },
  entityRow: { alignItems: "center", borderBottomColor: COLORS.divider, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 68, paddingHorizontal: 16 },
  entityCopy: { flex: 1, marginLeft: 12 },
  entityTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "700" },
  entityMeta: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  empty: { alignItems: "center", marginHorizontal: 20, paddingTop: 80 },
  emptyTitle: { color: COLORS.ink, fontSize: 18, fontWeight: "800", marginTop: 15 },
  emptyCopy: { color: COLORS.muted, fontSize: 14, marginTop: 6 },
});
