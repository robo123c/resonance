import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useResonanceSession } from "@/lib/resonance/session";

export default function SignInScreen() {
  const router = useRouter();
  const { serverUrl, login, guest } = useResonanceSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"login" | "guest" | null>(null);

  const complete = () => {
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  };

  const submit = async () => {
    if (!username.trim() || !password) {
      setError("Enter both your username and password.");
      return;
    }
    setLoading("login");
    setError("");
    try {
      await login(username, password);
      complete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(null);
    }
  };

  const enterGuestMode = async () => {
    setLoading("guest");
    setError("");
    try {
      await guest();
      complete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Guest access is unavailable on this server.");
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
      <Pressable onPress={() => router.replace("/connect")} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <MaterialIcons name="chevron-left" color="#ECF8F2" size={24} />
        <Text style={styles.backText}>Change server</Text>
      </Pressable>
      <Text style={styles.eyebrow}>CONNECTED TO</Text>
      <Text numberOfLines={1} style={styles.server}>{serverUrl}</Text>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to access your library and keep your listening history together.</Text>
      <View style={styles.card}>
        <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setUsername} placeholder="Username" placeholderTextColor="#70877C" returnKeyType="next" style={styles.input} value={username} />
        <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setPassword} onSubmitEditing={() => void submit()} placeholder="Password" placeholderTextColor="#70877C" returnKeyType="done" secureTextEntry style={[styles.input, styles.password]} value={password} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={loading !== null} onPress={() => void submit()} style={({ pressed }) => [styles.primary, (pressed || loading) && styles.pressed, loading && styles.disabled]}>
          <Text style={styles.primaryText}>{loading === "login" ? "Signing in…" : "Sign in"}</Text>
        </Pressable>
        <Pressable disabled={loading !== null} onPress={() => void enterGuestMode()} style={({ pressed }) => [styles.secondary, (pressed || loading) && styles.pressed]}>
          <Text style={styles.secondaryText}>{loading === "guest" ? "Starting guest session…" : "Continue as guest"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#0B1210", flex: 1, justifyContent: "center", padding: 24 },
  back: { alignItems: "center", flexDirection: "row", left: 18, position: "absolute", top: 62 },
  backText: { color: "#ECF8F2", fontSize: 14, fontWeight: "700" },
  eyebrow: { color: "#5DE1B5", fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginBottom: 7 },
  server: { color: "#A3B5AC", fontSize: 14, marginBottom: 26 },
  title: { color: "#ECF8F2", fontSize: 34, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: "#A3B5AC", fontSize: 16, lineHeight: 24, marginTop: 12 },
  card: { backgroundColor: "#14211D", borderColor: "#294238", borderRadius: 20, borderWidth: 1, marginTop: 32, padding: 18 },
  input: { backgroundColor: "#0B1210", borderColor: "#355847", borderRadius: 13, borderWidth: 1, color: "#ECF8F2", fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  password: { marginTop: 12 },
  error: { color: "#FF8995", fontSize: 13, lineHeight: 18, marginTop: 11 },
  primary: { alignItems: "center", backgroundColor: "#5DE1B5", borderRadius: 14, justifyContent: "center", marginTop: 20, minHeight: 52 },
  primaryText: { color: "#0B1210", fontSize: 16, fontWeight: "800" },
  secondary: { alignItems: "center", borderColor: "#355847", borderRadius: 14, borderWidth: 1, justifyContent: "center", marginTop: 10, minHeight: 52 },
  secondaryText: { color: "#ECF8F2", fontSize: 15, fontWeight: "700" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.55 },
});
