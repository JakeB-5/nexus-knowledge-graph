import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfigManager } from "../config-manager.js";
import { MemoryProvider } from "../providers/memory.js";
import { ConfigSource } from "../types.js";
import type { ConfigSchema } from "../types.js";

const schema: ConfigSchema = {
  "database.host": { type: "string", default: "localhost", description: "DB host" },
  "database.port": { type: "number", default: 5432, description: "DB port" },
  "database.password": { type: "string", secret: true, description: "DB password" },
  "app.debug": { type: "boolean", default: false },
  "app.name": { type: "string", required: true, description: "App name" },
  "app.maxConnections": { type: "number", constraints: { min: 1, max: 100 }, default: 10 },
};

async function makeManager(overrides?: Record<string, unknown>): Promise<ConfigManager> {
  const mgr = new ConfigManager({ schema });
  if (overrides) {
    const provider = new MemoryProvider({ values: overrides, source: ConfigSource.Override });
    await mgr.addProvider(provider);
  }
  return mgr;
}

describe("ConfigManager", () => {
  describe("get() / getOrThrow() / getWithDefault()", () => {
    it("returns schema default when no provider set", async () => {
      const mgr = new ConfigManager({ schema });
      expect(mgr.get("database.host")).toBe("localhost");
      expect(mgr.get("database.port")).toBe(5432);
    });

    it("returns undefined for unknown key", async () => {
      const mgr = new ConfigManager({ schema });
      expect(mgr.get("nonexistent")).toBeUndefined();
    });

    it("getOrThrow throws for missing required key", async () => {
      const mgr = await makeManager();
      expect(() => mgr.getOrThrow("app.name")).toThrow("Required config key");
    });

    it("getOrThrow returns value when present", async () => {
      const mgr = await makeManager({ "app.name": "Nexus" });
      expect(mgr.getOrThrow("app.name")).toBe("Nexus");
    });

    it("getWithDefault returns fallback for missing key", async () => {
      const mgr = new ConfigManager({});
      expect(mgr.getWithDefault("missing", "fallback")).toBe("fallback");
    });

    it("getWithDefault returns actual value when present", async () => {
      const mgr = await makeManager({ "database.host": "prod-db" });
      expect(mgr.getWithDefault("database.host", "localhost")).toBe("prod-db");
    });
  });

  describe("type-specific getters", () => {
    it("getString coerces to string", async () => {
      const mgr = await makeManager({ "database.port": 5432 });
      expect(mgr.getString("database.port")).toBe("5432");
    });

    it("getNumber coerces string to number", async () => {
      const mgr = await makeManager({ "database.port": "5433" });
      expect(mgr.getNumber("database.port")).toBe(5433);
    });

    it("getBoolean coerces string 'true'", async () => {
      const mgr = await makeManager({ "app.debug": "true" });
      expect(mgr.getBoolean("app.debug")).toBe(true);
    });

    it("getBoolean returns false for 'false'", async () => {
      const mgr = await makeManager({ "app.debug": "false" });
      expect(mgr.getBoolean("app.debug")).toBe(false);
    });
  });

  describe("layered priority", () => {
    it("override takes precedence over default", async () => {
      const mgr = new ConfigManager({ schema });
      const provider = new MemoryProvider({
        values: { "database.host": "override-db" },
        source: ConfigSource.Override,
      });
      await mgr.addProvider(provider);
      expect(mgr.get("database.host")).toBe("override-db");
    });

    it("higher-priority layer wins", async () => {
      const mgr = new ConfigManager({ schema });

      const fileProvider = new MemoryProvider({ values: { "database.host": "file-db" }, source: ConfigSource.File });
      const envProvider = new MemoryProvider({ values: { "database.host": "env-db" }, source: ConfigSource.Env });

      await mgr.addProvider(fileProvider);
      await mgr.addProvider(envProvider);

      // Env should win over file
      expect(mgr.get("database.host")).toBe("env-db");
    });

    it("default layer is lowest priority", async () => {
      const mgr = new ConfigManager({ schema });
      const provider = new MemoryProvider({ values: { "database.host": "from-provider" }, source: ConfigSource.Default });
      await mgr.addProvider(provider);

      // schema default + provider default: provider wins since schema default is used as fallback
      expect(mgr.get("database.host")).toBe("from-provider");
    });
  });

  describe("set() / delete()", () => {
    it("set updates value", async () => {
      const mgr = new ConfigManager({ schema });
      mgr.set("database.host", "new-host");
      expect(mgr.get("database.host")).toBe("new-host");
    });

    it("delete reverts to lower priority value", async () => {
      const mgr = new ConfigManager({ schema });
      mgr.set("database.host", "override");
      mgr.delete("database.host");
      // Should fall back to schema default
      expect(mgr.get("database.host")).toBe("localhost");
    });

    it("throws when frozen", async () => {
      const mgr = new ConfigManager({ schema });
      mgr.freeze();
      expect(() => mgr.set("database.host", "x")).toThrow("frozen");
    });

    it("validates on set when validateOnSet is true", async () => {
      const mgr = new ConfigManager({ schema, validateOnSet: true });
      expect(() =>
        mgr.set("app.maxConnections", 999, ConfigSource.Override)
      ).toThrow("Validation failed");
    });
  });

  describe("change listeners", () => {
    it("fires key-specific listener on set()", async () => {
      const mgr = new ConfigManager({ schema });
      const listener = vi.fn();
      mgr.on("database.host", listener);
      mgr.set("database.host", "changed");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0]![0].newValue).toBe("changed");
    });

    it("fires global listener on set()", async () => {
      const mgr = new ConfigManager({ schema });
      const listener = vi.fn();
      mgr.onAny(listener);
      mgr.set("database.host", "changed");

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("does not fire when value unchanged", async () => {
      const mgr = await makeManager({ "database.host": "same" });
      const listener = vi.fn();
      mgr.on("database.host", listener);
      mgr.set("database.host", "same");

      expect(listener).not.toHaveBeenCalled();
    });

    it("unsubscribe removes listener", async () => {
      const mgr = new ConfigManager({ schema });
      const listener = vi.fn();
      const unsub = mgr.on("database.host", listener);
      unsub();
      mgr.set("database.host", "changed");

      expect(listener).not.toHaveBeenCalled();
    });

    it("fires listener when provider hot-reloads", async () => {
      const mgr = new ConfigManager({ schema });
      const provider = new MemoryProvider({ values: { "database.host": "initial" }, source: ConfigSource.File });
      await mgr.addProvider(provider);

      const listener = vi.fn();
      mgr.on("database.host", listener);

      provider.set("database.host", "reloaded");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(mgr.get("database.host")).toBe("reloaded");
    });
  });

  describe("validate()", () => {
    it("passes when all required keys present", async () => {
      const mgr = await makeManager({ "app.name": "Nexus" });
      const result = mgr.validate();
      expect(result.valid).toBe(true);
    });

    it("fails when required key missing", async () => {
      const mgr = new ConfigManager({ schema });
      const result = mgr.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.key === "app.name")).toBe(true);
    });

    it("returns valid when no schema", async () => {
      const mgr = new ConfigManager({});
      const result = mgr.validate();
      expect(result.valid).toBe(true);
    });
  });

  describe("snapshot() and diffSnapshots()", () => {
    it("snapshot captures current values", async () => {
      const mgr = await makeManager({ "database.host": "snap-host" });
      const snap = mgr.snapshot();
      expect(snap.values["database.host"]).toBe("snap-host");
      expect(snap.timestamp).toBeInstanceOf(Date);
    });

    it("masks secrets in snapshot", async () => {
      const mgr = await makeManager({ "database.password": "hunter2" });
      const snap = mgr.snapshot();
      expect(snap.values["database.password"]).toBe("[SECRET]");
    });

    it("diffSnapshots finds changed keys", async () => {
      const mgr = await makeManager({ "database.host": "v1" });
      const snap1 = mgr.snapshot();
      mgr.set("database.host", "v2");
      const snap2 = mgr.snapshot();

      const diff = mgr.diffSnapshots(snap1, snap2);
      expect(diff["database.host"]).toBeDefined();
      expect(diff["database.host"]!.before).toBe("v1");
      expect(diff["database.host"]!.after).toBe("v2");
    });
  });

  describe("getMasked()", () => {
    it("masks secret values", async () => {
      const mgr = await makeManager({ "database.password": "supersecret" });
      const masked = mgr.getMasked();
      expect(masked["database.password"]).toBe("[SECRET]");
    });

    it("preserves non-secret values", async () => {
      const mgr = await makeManager({ "database.host": "myhost" });
      const masked = mgr.getMasked();
      expect(masked["database.host"]).toBe("myhost");
    });
  });
});
