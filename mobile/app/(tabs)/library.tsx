import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import { TrackRow } from "@/components/resonance/track-row";
import { ScreenContainer } from "@/components/screen-container";
import { useResonanceSession } from "@/lib/resonance/session";
import type { Track } from "@/lib/resonance/types";

export default function LibraryScreen() {
  const { api, status } = useResonanceSession();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (!api) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await api.tracks(query, 1, 100);
      setTracks(response.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load tracks.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 260);
    return () => clearTimeout(timer);
  }, [load]);

  if (status === "disconnected") return <Redirect href="/connect" />;
  if (status === "connected") return <Redirect href="/sign-in" />;

  return (
    <ScreenContainer style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        data={tracks}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Library</Text>
            <View style={styles.search}><MaterialIcons name="search" color="#A3B5AC" size={20} /><TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setQuery} placeholder="Filter tracks, artists, albums" placeholderTextColor="#70877C" style={styles.input} value={query} /></View>
            {loading ? <ActivityIndicator color="#5DE1B5" style={styles.loader} /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && !error && tracks.length === 0 ? <View style={styles.empty}><MaterialIcons name="queue-music" color="#5DE1B5" size={34} /><Text style={styles.emptyText}>No matching tracks</Text></View> : null}
          </>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#5DE1B5" />}
        renderItem={({ item }) => <TrackRow track={item} queue={tracks} />}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 132, paddingTop: 16 },
  title: { color: "#ECF8F2", fontSize: 30, fontWeight: "800", letterSpacing: -0.7, paddingHorizontal: 18 },
  search: { alignItems: "center", backgroundColor: "#14211D", borderColor: "#294238", borderRadius: 14, borderWidth: 1, flexDirection: "row", marginHorizontal: 18, marginTop: 18, minHeight: 50, paddingHorizontal: 14 },
  input: { color: "#ECF8F2", flex: 1, fontSize: 15, marginLeft: 9, paddingVertical: 10 },
  loader: { marginTop: 30 },
  error: { color: "#FF8995", marginHorizontal: 18, marginTop: 20, textAlign: "center" },
  empty: { alignItems: "center", backgroundColor: "#14211D", borderRadius: 18, marginHorizontal: 18, marginTop: 22, padding: 26 },
  emptyText: { color: "#A3B5AC", fontSize: 14, marginTop: 9 },
});
