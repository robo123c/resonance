import type {
  LoginResponse,
  ResonanceStats,
  ResonanceUser,
  SearchResults,
  Track,
  TrackPage,
} from "./types";

export function normalizeServerUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("Enter the address of your Resonance server.");

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error("Resonance servers must use HTTP or HTTPS.");
  }
  const candidate = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS server address.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Resonance servers must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Server addresses cannot include embedded credentials.");
  }

  return parsed.origin;
}

export class ResonanceApi {
  constructor(
    readonly serverUrl: string,
    private readonly token?: string | null,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);

    let response: Response;
    try {
      response = await fetch(`${this.serverUrl}${path}`, {
        ...init,
        headers,
      });
    } catch {
      throw new Error("The Resonance server could not be reached. Check the address and local network.");
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : null;

    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body ? String(body.error) : "Request failed";
      throw new Error(message);
    }
    return body as T;
  }

  health() {
    return this.request<{ status: string }>("/api/health");
  }

  me() {
    return this.request<ResonanceUser>("/api/auth/me");
  }

  login(username: string, password: string) {
    return this.request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  }

  guest() {
    return this.request<LoginResponse>("/api/auth/guest", { method: "POST" });
  }

  logout() {
    return this.request<{ success: boolean }>("/api/auth/logout", { method: "POST" });
  }

  stats() {
    return this.request<ResonanceStats>("/api/stats");
  }

  tracks(search = "", page = 1, perPage = 100) {
    const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (search.trim()) query.set("search", search.trim());
    return this.request<TrackPage>(`/api/tracks?${query.toString()}`);
  }

  recentlyPlayed(limit = 8) {
    return this.request<Track[]>(`/api/tracks/recently-played?limit=${limit}`);
  }

  search(query: string) {
    return this.request<SearchResults>(`/api/search?q=${encodeURIComponent(query)}`);
  }

  recordPlay(trackId: string) {
    return this.request<{ success: boolean }>(`/api/tracks/${trackId}/play`, { method: "POST" });
  }

  streamUrl(trackId: string) {
    return `${this.serverUrl}/api/tracks/${trackId}/stream`;
  }

  artworkUrl(trackId: string) {
    return `${this.serverUrl}/api/tracks/${trackId}/artwork`;
  }

  authorizationHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }
}
