import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";

import { TrackRow } from "@/components/resonance/track-row";
import { ScreenContainer } from "@/components/screen-container";
import { useResonanceSession } from "@/lib/resonance/session";
import type { SearchResults } from "@/lib/resonance/types";

export default function SearchScreen() {
  const { api, status } = useResonanceSession();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!api || query.trim().length < 2) {
      setResults(null);
      setError("");
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        try { setResults(await api.search(query.trim())); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "Search failed."); }
        finally { setLoading(false); }
      })();
    }, 320);
    return () => clearTimeout(timer);
  }, [api, query]);

  if (status === "disconnected") return <Redirect href="/connect" />;
  if (status === "connected") return <Redirect href="/sign-in" />;

  const tracks = results?.tracks ?? [];
  return (
    <ScreenContainer style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        data={tracks}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Search</Text>
            <View style={styles.search}><MaterialIcons name="search" color="#5DE1B5" size={21} /><TextInput autoCapitalize="none" autoCorrect={false} autoFocus onChangeText={setQuery} placeholder="Search your entire library" placeholderTextColor="#70877C" style={styles.input} value={query} /></View>
            {loading ? <ActivityIndicator color="#5DE1B5" style={styles.loader} /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!query.trim() ? <View style={styles.prompt}><MaterialIcons name="manage-search" color="#5DE1B5" size={38} /><Text style={styles.promptTitle}>Find anything</Text><Text style={styles.promptCopy}>Search by track, artist, or album name.</Text></View> : null}
            {query.trim().length === 1 ? <Text style={styles.helper}>Type one more character to search.</Text> : null}
            {!loading && query.trim().length >= 2 && !error ? <Text style={styles.resultCount}>{tracks.length} {tracks.length === 1 ? "track" : "tracks"} found</Text> : null}
          </>
        }
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
  search: { alignItems: "center", backgroundColor: "#14211D", borderColor: "#355847", borderRadius: 14, borderWidth: 1, flexDirection: "row", marginHorizontal: 18, marginTop: 18, minHeight: 52, paddingHorizontal: 14 },
  input: { color: "#ECF8F2", flex: 1, fontSize: 16, marginLeft: 9, paddingVertical: 10 },
  loader: { marginTop: 28 },
  error: { color: "#FF8995", marginHorizontal: 18, marginTop: 20, textAlign: "center" },
  prompt: { alignItems: "center", backgroundColor: "#14211D", borderRadius: 18, marginHorizontal: 18, marginTop: 25, padding: 30 },
  promptTitle: { color: "#ECF8F2", fontSize: 18, fontWeight: "800", marginTop: 12 },
  promptCopy: { color: "#A3B5AC", fontSize: 14, marginTop: 5 },
  helper: { color: "#A3B5AC", marginHorizontal: 18, marginTop: 24, textAlign: "center" },
  resultCount: { color: "#A3B5AC", fontSize: 13, fontWeight: "700", marginBottom: 6, marginLeft: 18, marginTop: 22 },
});
