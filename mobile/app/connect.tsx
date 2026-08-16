import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useResonanceSession } from "@/lib/resonance/session";

export default function ConnectScreen() {
  const router = useRouter();
  const { connect } = useResonanceSession();
  const [serverUrl, setServerUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      await connect(serverUrl);
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/sign-in");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not connect to the server.";
      setError(message);
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
      <View style={styles.heroMark}><MaterialIcons name="graphic-eq" size={42} color="#0B1210" /></View>
      <Text style={styles.eyebrow}>YOUR LIBRARY, ON YOUR DEVICE</Text>
      <Text style={styles.title}>Connect Resonance</Text>
      <Text style={styles.subtitle}>Enter the address of your self-hosted Resonance server. A trusted local HTTP address is supported on Android 10+.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>SERVER ADDRESS</Text>
        <TextInput
          accessibilityLabel="Resonance server address"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setServerUrl}
          onSubmitEditing={() => void submit()}
          placeholder="http://192.168.1.50:8080"
          placeholderTextColor="#70877C"
          returnKeyType="done"
          style={styles.input}
          value={serverUrl}
        />
        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.hint}>The app verifies the server before saving this address.</Text>}
        <Pressable disabled={loading} onPress={() => void submit()} style={({ pressed }) => [styles.primary, (pressed || loading) && styles.pressed, loading && styles.disabled]}>
          <Text style={styles.primaryText}>{loading ? "Checking server…" : "Continue"}</Text>
          <MaterialIcons name="arrow-forward" size={19} color="#0B1210" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#0B1210", flex: 1, justifyContent: "center", padding: 24 },
  heroMark: { alignItems: "center", backgroundColor: "#5DE1B5", borderRadius: 28, height: 84, justifyContent: "center", marginBottom: 28, width: 84 },
  eyebrow: { color: "#5DE1B5", fontSize: 12, fontWeight: "800", letterSpacing: 1.2, marginBottom: 12 },
  title: { color: "#ECF8F2", fontSize: 34, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: "#A3B5AC", fontSize: 16, lineHeight: 24, marginTop: 12 },
  card: { backgroundColor: "#14211D", borderColor: "#294238", borderRadius: 20, borderWidth: 1, marginTop: 34, padding: 18 },
  label: { color: "#A3B5AC", fontSize: 11, fontWeight: "800", letterSpacing: 0.9, marginBottom: 9 },
  input: { backgroundColor: "#0B1210", borderColor: "#355847", borderRadius: 13, borderWidth: 1, color: "#ECF8F2", fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  hint: { color: "#A3B5AC", fontSize: 13, lineHeight: 18, marginTop: 11 },
  error: { color: "#FF8995", fontSize: 13, lineHeight: 18, marginTop: 11 },
  primary: { alignItems: "center", backgroundColor: "#5DE1B5", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 20, minHeight: 52 },
  primaryText: { color: "#0B1210", fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.55 },
});
