import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { ResonanceUser } from "./types";

const SERVER_URL_KEY = "resonance.server.url";
const TOKEN_KEY = "resonance.auth.token";
const USER_KEY = "resonance.auth.user";

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function readStoredSession() {
  const [serverUrl, token, userString] = await Promise.all([
    getItem(SERVER_URL_KEY),
    getItem(TOKEN_KEY),
    getItem(USER_KEY),
  ]);

  let user: ResonanceUser | null = null;
  try {
    user = userString ? (JSON.parse(userString) as ResonanceUser) : null;
  } catch {
    await removeItem(USER_KEY);
  }

  return { serverUrl, token, user };
}

export async function saveServerUrl(serverUrl: string) {
  await setItem(SERVER_URL_KEY, serverUrl);
}

export async function saveSession(token: string, user: ResonanceUser) {
  await Promise.all([setItem(TOKEN_KEY, token), setItem(USER_KEY, JSON.stringify(user))]);
}

export async function clearSession({ includeServer = false } = {}) {
  const keys = [removeItem(TOKEN_KEY), removeItem(USER_KEY)];
  if (includeServer) keys.push(removeItem(SERVER_URL_KEY));
  await Promise.all(keys);
}
