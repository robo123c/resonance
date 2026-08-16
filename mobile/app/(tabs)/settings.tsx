import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { COLORS } from "@/components/apple-music-ui";

function SettingRow({ icon, label, value, onPress, toggle, checked, onToggle }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; label: string; value?: string; onPress?: () => void; toggle?: boolean; checked?: boolean; onToggle?: (value: boolean) => void }) {
  return <Pressable disabled={!onPress && !toggle} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><View style={styles.rowIcon}><MaterialIcons name={icon} color={COLORS.pink} size={20} /></View><View style={styles.rowCopy}><Text style={styles.rowLabel}>{label}</Text>{value ? <Text numberOfLines={1} style={styles.rowValue}>{value}</Text> : null}</View>{toggle ? <Switch accessibilityLabel={label} value={checked} onValueChange={onToggle} trackColor={{ false: "#D6D6DA", true: "#F6A1B5" }} thumbColor={checked ? COLORS.pink : "#FFFFFF"} /> : onPress ? <MaterialIcons name="chevron-right" color={COLORS.faint} size={22} /> : null}</Pressable>;
}

function Group({ children }: { children: React.ReactNode }) { return <View style={styles.group}>{children}</View>; }

export default function SettingsScreen() {
  const [autoplay, setAutoplay] = useState(true);
  const [soundCheck, setSoundCheck] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  return <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><View style={styles.header}><View><Text style={styles.eyebrow}>APPLE MUSIC</Text><Text style={styles.title}>Settings</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>B</Text></View></View><Text style={styles.section}>ACCOUNT</Text><Group><SettingRow icon="person" label="Blake Z" value="Apple Music profile" onPress={() => undefined} /><SettingRow icon="card-membership" label="Subscription" value="Individual plan" onPress={() => undefined} /></Group><Text style={styles.section}>PLAYBACK</Text><Group><SettingRow icon="high-quality" label="Audio Quality" value="High Quality" onPress={() => undefined} /><SettingRow icon="tune" label="Crossfade" value="Off" onPress={() => undefined} /><SettingRow icon="autorenew" label="Autoplay" toggle checked={autoplay} onToggle={setAutoplay} /><SettingRow icon="volume-up" label="Sound Check" toggle checked={soundCheck} onToggle={setSoundCheck} /></Group><Text style={styles.section}>DOWNLOADS</Text><Group><SettingRow icon="download" label="Download Quality" value="High Quality" onPress={() => undefined} /><SettingRow icon="folder-open" label="Downloaded Music" value="2 songs · 14.8 MB" onPress={() => undefined} /><SettingRow icon="storage" label="Storage" value="14.8 MB used" /></Group><Text style={styles.section}>APPEARANCE</Text><Group><SettingRow icon="brightness-6" label="Appearance" value="System" onPress={() => undefined} /><SettingRow icon="palette" label="Animated Artwork" toggle checked onToggle={() => undefined} /></Group><Text style={styles.section}>ACCESSIBILITY</Text><Group><SettingRow icon="format-size" label="Text Size" value="Default" onPress={() => undefined} /><SettingRow icon="accessibility" label="Reduced Motion" toggle checked={reducedMotion} onToggle={setReducedMotion} /></Group><View style={styles.footer}><MaterialIcons name="music-note" color={COLORS.pink} size={20} /><Text style={styles.footerText}>Resonance Mobile · Android 10+</Text></View></ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 80, paddingHorizontal: 12, paddingTop: 18 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8 },
  eyebrow: { color: COLORS.pink, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.8, marginTop: 4 },
  avatar: { alignItems: "center", backgroundColor: "#E8DDFE", borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  avatarText: { color: COLORS.purple, fontSize: 16, fontWeight: "800" },
  section: { color: COLORS.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8, marginLeft: 8, marginTop: 28 },
  group: { backgroundColor: COLORS.surface, borderRadius: 12, overflow: "hidden" },
  row: { alignItems: "center", borderBottomColor: COLORS.divider, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 11, minHeight: 64, paddingHorizontal: 14 },
  rowIcon: { alignItems: "center", backgroundColor: "#FFF0F3", borderRadius: 10, height: 38, justifyContent: "center", width: 38 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { color: COLORS.ink, fontSize: 15, fontWeight: "600" },
  rowValue: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  footer: { alignItems: "center", flexDirection: "row", justifyContent: "center", marginTop: 36 },
  footerText: { color: COLORS.muted, fontSize: 12, marginLeft: 6 },
  pressed: { opacity: 0.65 },
});
