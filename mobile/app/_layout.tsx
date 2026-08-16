import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ResonancePlayerProvider } from "@/lib/resonance/player";
import { ResonanceSessionProvider } from "@/lib/resonance/session";
import { ThemeProvider } from "@/lib/theme-provider";

export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  const content = useMemo(() => <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /><Stack.Screen name="connect" /><Stack.Screen name="sign-in" /><Stack.Screen name="now-playing" options={{ presentation: "modal", animation: "slide_from_bottom" }} /></Stack>, []);
  return <GestureHandlerRootView style={{ flex: 1 }}><QueryClientProvider client={queryClient}><ThemeProvider><SafeAreaProvider><ResonanceSessionProvider><ResonancePlayerProvider>{content}<StatusBar style="light" /></ResonancePlayerProvider></ResonanceSessionProvider></SafeAreaProvider></ThemeProvider></QueryClientProvider></GestureHandlerRootView>;
}
