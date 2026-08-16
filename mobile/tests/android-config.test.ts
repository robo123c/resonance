import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const appConfig = readFileSync(resolve(process.cwd(), "app.config.ts"), "utf8");

describe("Android build policy", () => {
  it("keeps Android 10 as the minimum supported platform", () => {
    expect(appConfig).toContain("minSdkVersion: 29");
  });

  it("supports common Android 10-era 32-bit and 64-bit devices", () => {
    expect(appConfig).toContain('buildArchs: ["armeabi-v7a", "arm64-v8a"]');
  });

  it("permits explicit trusted-LAN HTTP servers", () => {
    expect(appConfig).toContain("usesCleartextTraffic: true");
  });
});
