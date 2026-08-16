import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MiniPlayer } from "@/components/resonance/mini-player";
import { COLORS } from "@/components/apple-music-ui";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 8);
  return <View style={styles.shell}><Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: COLORS.pink, tabBarInactiveTintColor: "#8A8A91", tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.divider, height: 59 + bottomPadding, paddingBottom: bottomPadding, paddingTop: 7 }, tabBarLabelStyle: { fontSize: 10, fontWeight: "700" } }}><Tabs.Screen name="index" options={{ title: "Listen Now", tabBarIcon: ({ color }) => <MaterialIcons name="play-circle-outline" color={color} size={23} /> }} /><Tabs.Screen name="browse" options={{ title: "Browse", tabBarIcon: ({ color }) => <MaterialIcons name="grid-view" color={color} size={21} /> }} /><Tabs.Screen name="radio" options={{ title: "Radio", tabBarIcon: ({ color }) => <MaterialIcons name="radio" color={color} size={22} /> }} /><Tabs.Screen name="library" options={{ title: "Library", tabBarIcon: ({ color }) => <MaterialIcons name="library-music" color={color} size={22} /> }} /><Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: ({ color }) => <MaterialIcons name="search" color={color} size={23} /> }} /><Tabs.Screen name="settings" options={{ href: null }} /></Tabs><MiniPlayer /></View>;
}

const styles = StyleSheet.create({ shell: { backgroundColor: COLORS.background, flex: 1 } });
