import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useResonanceSession } from "@/lib/resonance/session";

function SettingRow({ icon, label, value, onPress, destructive = false }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; value?: string; onPress?: () => void; destructive?: boolean }) {
  return <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && onPress && styles.pressed]}><View style={[styles.rowIcon, destructive && styles.rowIconDanger]}><MaterialIcons name={icon} color={destructive ? "#FF8995" : "#5DE1B5"} size={21} /></View><View style={styles.rowCopy}><Text style={[styles.rowLabel, destructive && styles.dangerText]}>{label}</Text>{value ? <Text numberOfLines={1} style={styles.rowValue}>{value}</Text> : null}</View>{onPress ? <MaterialIcons name="chevron-right" color="#A3B5AC" size={22} /> : null}</Pressable>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { disconnect, logout, serverUrl, status, user } = useResonanceSession();
  const [busy, setBusy] = useState(false);
  if (status === "disconnected") return <Redirect href="/connect" />;
  if (status === "connected") return <Redirect href="/sign-in" />;

  const confirmDisconnect = () => Alert.alert("Change Resonance server?", "This removes the saved server address and signs you out of this device.", [
    { text: "Cancel", style: "cancel" },
    { text: "Change server", style: "destructive", onPress: () => { void (async () => { setBusy(true); await disconnect(); setBusy(false); router.replace("/connect"); })(); } },
  ]);

  const signOut = () => { void (async () => { setBusy(true); await logout(); setBusy(false); router.replace("/sign-in"); })(); };

  return <ScreenContainer style={styles.container}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.title}>Settings</Text>
    <Text style={styles.section}>ACCOUNT</Text>
    <View style={styles.group}><SettingRow icon="person" label={user?.username ?? "Signed in"} value={user?.role === "guest" ? "Guest session" : "Resonance account"} /><SettingRow icon="logout" label={busy ? "Working…" : "Sign out"} onPress={signOut} /></View>
    <Text style={styles.section}>SERVER</Text>
    <View style={styles.group}><SettingRow icon="dns" label="Connected server" value={serverUrl ?? "Not connected"} /><SettingRow icon="swap-horiz" label="Change server" onPress={confirmDisconnect} /></View>
    <Text style={styles.section}>ANDROID COMPATIBILITY</Text>
    <View style={styles.infoCard}><MaterialIcons name="verified-user" color="#5DE1B5" size={22} /><View style={styles.infoCopy}><Text style={styles.infoTitle}>Android 10 and newer</Text><Text style={styles.infoText}>Resonance Mobile streams from your server and does not require device-library storage access.</Text></View></View>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 132, paddingHorizontal: 18, paddingTop: 18 },
  title: { color: "#ECF8F2", fontSize: 30, fontWeight: "800", letterSpacing: -0.7 },
  section: { color: "#A3B5AC", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8, marginTop: 27 },
  group: { backgroundColor: "#14211D", borderColor: "#294238", borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  row: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 65, paddingHorizontal: 14 },
  rowIcon: { alignItems: "center", backgroundColor: "#1A2A24", borderRadius: 11, height: 40, justifyContent: "center", width: 40 },
  rowIconDanger: { backgroundColor: "#3A1C25" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { color: "#ECF8F2", fontSize: 15, fontWeight: "700" },
  rowValue: { color: "#A3B5AC", fontSize: 12, marginTop: 3 },
  dangerText: { color: "#FF8995" },
  infoCard: { alignItems: "flex-start", backgroundColor: "#132A22", borderColor: "#315A47", borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 12, padding: 16 },
  infoCopy: { flex: 1 },
  infoTitle: { color: "#ECF8F2", fontSize: 15, fontWeight: "800" },
  infoText: { color: "#A3B5AC", fontSize: 13, lineHeight: 19, marginTop: 5 },
  pressed: { opacity: 0.72 },
});
