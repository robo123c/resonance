import { MaterialIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card, COLORS, SectionHeader, TrackRow } from "@/components/apple-music-ui";
import { albums, artists, playlists, recentlyPlayed, tracks } from "@/lib/apple-music/mock-data";
import { useResonancePlayer } from "@/lib/resonance/player";

const filters = ["Recently Added", "Artists", "Albums", "Songs", "Playlists", "Downloaded"];

export default function LibraryScreen() {
  const { playTrack } = useResonancePlayer();
  const [selected, setSelected] = useState(filters[0]);
  const [favorites, setFavorites] = useState<string[]>(["t1", "t3"]);
  const [downloaded] = useState<string[]>(["t1", "t5"]);
  const play = (track = tracks[0], queue = tracks) => { void playTrack(track, queue); };
  const list = useMemo(() => selected === "Downloaded" ? tracks.filter((track) => downloaded.includes(track.id)) : selected === "Songs" ? tracks : selected === "Recently Added" ? recentlyPlayed : tracks, [downloaded, selected]);
  return <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><View style={styles.header}><View><Text style={styles.eyebrow}>YOUR MUSIC</Text><Text style={styles.title}>Library</Text></View><Pressable style={styles.edit}><Text style={styles.editText}>Edit</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{filters.map((filter) => <Pressable key={filter} onPress={() => setSelected(filter)} style={[styles.filter, selected === filter && styles.filterSelected]}><Text style={[styles.filterText, selected === filter && styles.filterTextSelected]}>{filter}</Text></Pressable>)}</ScrollView>{selected === "Artists" ? <><SectionHeader title="Artists" /><View style={styles.grid}>{artists.map((artist) => <View key={artist.id} style={styles.gridItem}><Card item={artist} width={145} /></View>)}</View></> : selected === "Albums" ? <><SectionHeader title="Albums" /><View style={styles.grid}>{albums.map((album) => <View key={album.id} style={styles.gridItem}><Card item={album} width={145} onPress={() => play(tracks.find((track) => track.album === album.title))} /></View>)}</View></> : selected === "Playlists" ? <><SectionHeader title="Playlists" /><View style={styles.grid}>{playlists.map((playlist) => <View key={playlist.id} style={styles.gridItem}><Card item={playlist} width={145} onPress={() => play()} /></View>)}</View></> : <><SectionHeader title={selected} action="Sort" /><View style={styles.listCard}>{list.map((track, index) => <View key={track.id} style={styles.trackWrap}><TrackRow track={track} index={index} showNumber={selected === "Songs"} onPress={() => play(track, list)} onMore={() => setFavorites((values) => values.includes(track.id) ? values.filter((id) => id !== track.id) : [...values, track.id])} />{favorites.includes(track.id) && <MaterialIcons name="favorite" size={15} color={COLORS.pink} style={styles.favorite} />}{downloaded.includes(track.id) && <MaterialIcons name="download-done" size={16} color="#46A37D" style={styles.downloaded} />}</View>)}</View><SectionHeader title="Quick actions" /><View style={styles.actionCard}><Pressable style={styles.actionRow}><MaterialIcons name="add" color={COLORS.pink} size={23} /><Text style={styles.actionText}>New playlist</Text><MaterialIcons name="chevron-right" color={COLORS.faint} size={22} /></Pressable><Pressable style={styles.actionRow}><MaterialIcons name="cloud-download" color={COLORS.pink} size={23} /><Text style={styles.actionText}>Downloaded music</Text><MaterialIcons name="chevron-right" color={COLORS.faint} size={22} /></Pressable></View></>}</ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 154, paddingTop: 18 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20 },
  eyebrow: { color: COLORS.pink, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.8, marginTop: 4 },
  edit: { paddingHorizontal: 4, paddingVertical: 7 },
  editText: { color: COLORS.pink, fontSize: 15, fontWeight: "700" },
  filters: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 2 },
  filter: { backgroundColor: COLORS.surface, borderColor: COLORS.divider, borderRadius: 17, borderWidth: 1, marginRight: 8, paddingHorizontal: 13, paddingVertical: 8 },
  filterSelected: { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  filterText: { color: COLORS.ink, fontSize: 12, fontWeight: "700" },
  filterTextSelected: { color: "#FFFFFF" },
  listCard: { backgroundColor: COLORS.surface, borderRadius: 12, marginHorizontal: 12, overflow: "hidden" },
  trackWrap: { position: "relative" },
  favorite: { bottom: 15, position: "absolute", right: 53 },
  downloaded: { bottom: 14, position: "absolute", right: 30 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20 },
  gridItem: { marginBottom: 24, width: "50%" },
  actionCard: { backgroundColor: COLORS.surface, borderRadius: 12, marginHorizontal: 12, overflow: "hidden" },
  actionRow: { alignItems: "center", borderBottomColor: COLORS.divider, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 55, paddingHorizontal: 17 },
  actionText: { color: COLORS.ink, flex: 1, fontSize: 15, fontWeight: "600", marginLeft: 13 },
});
