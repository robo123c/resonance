import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeServerUrl, ResonanceApi } from "../lib/resonance/api";

describe("normalizeServerUrl", () => {
  it("adds HTTP and removes a trailing path", () => {
    expect(normalizeServerUrl("192.168.1.50:8080/library")).toBe("http://192.168.1.50:8080");
  });

  it("keeps a secure origin", () => {
    expect(normalizeServerUrl("https://music.example.com/")).toBe("https://music.example.com");
  });

  it("rejects empty, malformed, and credential-bearing inputs", () => {
    expect(() => normalizeServerUrl("")).toThrow("Enter the address");
    expect(() => normalizeServerUrl("ftp://music.example.com")).toThrow("HTTP or HTTPS");
    expect(() => normalizeServerUrl("https://user:secret@music.example.com")).toThrow("embedded credentials");
  });
});

describe("ResonanceApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a bearer token to an authenticated endpoint", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ total_tracks: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const api = new ResonanceApi("https://music.example.com", "session-token");

    await api.stats();

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toBeInstanceOf(Headers);
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer session-token");
  });
});
