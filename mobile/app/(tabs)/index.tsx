import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { TrackRow } from "@/components/resonance/track-row";
import { ScreenContainer } from "@/components/screen-container";
import { useResonanceSession } from "@/lib/resonance/session";
import type { ResonanceStats, Track } from "@/lib/resonance/types";

export default function HomeScreen() {
  const router = useRouter();
  const { api, status, user } = useResonanceSession();
  const [stats, setStats] = useState<ResonanceStats | null>(null);
  const [recent, setRecent] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (!api) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [nextStats, nextRecent] = await Promise.all([api.stats(), api.recentlyPlayed()]);
      setStats(nextStats);
      setRecent(nextRecent);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your library.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (status === "booting") return <ScreenContainer style={styles.center}><ActivityIndicator color="#5DE1B5" /></ScreenContainer>;
  if (status === "disconnected") return <Redirect href="/connect" />;
  if (status === "connected") return <Redirect href="/sign-in" />;

  return (
    <ScreenContainer containerClassName="bg-background" style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        data={recent}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View><Text style={styles.eyebrow}>RESONANCE</Text><Text style={styles.greeting}>Good listening, {user?.username ?? "friend"}.</Text></View>
              <Pressable accessibilityLabel="Open settings" onPress={() => router.push("/settings")} style={({ pressed }) => [styles.settings, pressed && styles.pressed]}><MaterialIcons name="settings" color="#ECF8F2" size={22} /></Pressable>
            </View>
            <View style={styles.statCard}>
              <View><Text style={styles.statValue}>{stats?.total_tracks ?? "—"}</Text><Text style={styles.statLabel}>TRACKS IN YOUR LIBRARY</Text></View>
              <MaterialIcons name="library-music" color="#0B1210" size={40} />
            </View>
            <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Recently played</Text><Pressable onPress={() => router.push("/library")}><Text style={styles.link}>See library</Text></Pressable></View>
            {loading ? <ActivityIndicator color="#5DE1B5" style={styles.loader} /> : null}
            {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
            {!loading && !error && recent.length === 0 ? <View style={styles.empty}><MaterialIcons name="history" color="#5DE1B5" size={30} /><Text style={styles.emptyTitle}>No listening history yet</Text><Text style={styles.emptyCopy}>Pick a track from your library to begin.</Text></View> : null}
          </>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#5DE1B5" />}
        renderItem={({ item }) => <TrackRow track={item} queue={recent} />}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  container: { flex: 1 },
  content: { paddingBottom: 132, paddingTop: 6 },
  header: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 12 },
  eyebrow: { color: "#5DE1B5", fontSize: 11, fontWeight: "800", letterSpacing: 1.3 },
  greeting: { color: "#ECF8F2", fontSize: 24, fontWeight: "800", letterSpacing: -0.4, marginTop: 6 },
  settings: { alignItems: "center", backgroundColor: "#14211D", borderRadius: 20, height: 42, justifyContent: "center", width: 42 },
  statCard: { alignItems: "center", backgroundColor: "#5DE1B5", borderRadius: 22, flexDirection: "row", justifyContent: "space-between", marginHorizontal: 18, marginTop: 26, padding: 20 },
  statValue: { color: "#0B1210", fontSize: 32, fontVariant: ["tabular-nums"], fontWeight: "900" },
  statLabel: { color: "#1C4B3B", fontSize: 11, fontWeight: "800", letterSpacing: 0.7, marginTop: 3 },
  sectionHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 5, marginTop: 30, paddingHorizontal: 18 },
  sectionTitle: { color: "#ECF8F2", fontSize: 19, fontWeight: "800" },
  link: { color: "#5DE1B5", fontSize: 14, fontWeight: "700" },
  loader: { marginTop: 28 },
  errorCard: { backgroundColor: "#3A1C25", borderColor: "#70333F", borderRadius: 15, borderWidth: 1, marginHorizontal: 18, marginTop: 14, padding: 14 },
  errorText: { color: "#FFB4BE", fontSize: 14, lineHeight: 20 },
  retry: { color: "#ECF8F2", fontSize: 14, fontWeight: "800", marginTop: 8 },
  empty: { alignItems: "center", backgroundColor: "#14211D", borderRadius: 18, marginHorizontal: 18, marginTop: 14, padding: 24 },
  emptyTitle: { color: "#ECF8F2", fontSize: 16, fontWeight: "800", marginTop: 10 },
  emptyCopy: { color: "#A3B5AC", fontSize: 14, marginTop: 4, textAlign: "center" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
