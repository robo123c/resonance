import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MiniPlayer } from "@/components/resonance/mini-player";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 8);
  return (
    <View style={styles.shell}>
      <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: "#5DE1B5", tabBarInactiveTintColor: "#7D9186", tabBarStyle: { backgroundColor: "#14211D", borderTopColor: "#294238", height: 58 + bottomPadding, paddingBottom: bottomPadding, paddingTop: 7 }, tabBarLabelStyle: { fontSize: 11, fontWeight: "700" } }}>
        <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <MaterialIcons name="home-filled" color={color} size={23} /> }} />
        <Tabs.Screen name="library" options={{ title: "Library", tabBarIcon: ({ color }) => <MaterialIcons name="library-music" color={color} size={23} /> }} />
        <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: ({ color }) => <MaterialIcons name="search" color={color} size={23} /> }} />
        <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color }) => <MaterialIcons name="settings" color={color} size={23} /> }} />
      </Tabs>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({ shell: { backgroundColor: "#0B1210", flex: 1 } });
