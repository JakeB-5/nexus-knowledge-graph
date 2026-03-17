import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryProvider } from "../providers/memory.js";
import { EnvProvider } from "../providers/env.js";
import { ConfigSource } from "../types.js";

describe("MemoryProvider", () => {
  it("loads provided values", async () => {
    const provider = new MemoryProvider({ values: { "app.name": "Nexus", "app.port": 3000 } });
    const loaded = await provider.load();
    expect(loaded["app.name"]).toBe("Nexus");
    expect(loaded["app.port"]).toBe(3000);
  });

  it("loads empty object when no values given", async () => {
    const provider = new MemoryProvider();
    const loaded = await provider.load();
    expect(Object.keys(loaded)).toHaveLength(0);
  });

  it("uses Default source by default", () => {
    const provider = new MemoryProvider();
    expect(provider.source).toBe(ConfigSource.Default);
  });

  it("accepts custom source", () => {
    const provider = new MemoryProvider({ source: ConfigSource.Override });
    expect(provider.source).toBe(ConfigSource.Override);
  });

  it("set() updates value and notifies watcher", async () => {
    const provider = new MemoryProvider({ values: { x: 1 } });
    const onChange = vi.fn();
    provider.watch(onChange);

    provider.set("x", 99);

    expect(onChange).toHaveBeenCalledWith({ x: 99 });

    // load() should return updated value
    const loaded = await provider.load();
    expect(loaded.x).toBe(99);
  });

  it("delete() removes value and notifies watcher", async () => {
    const provider = new MemoryProvider({ values: { x: 1 } });
    const onChange = vi.fn();
    provider.watch(onChange);

    provider.delete("x");

    expect(onChange).toHaveBeenCalledWith({ x: undefined });
    const loaded = await provider.load();
    expect(loaded.x).toBeUndefined();
  });

  it("setAll() replaces all values", async () => {
    const provider = new MemoryProvider({ values: { a: 1, b: 2 } });
    provider.setAll({ c: 3 });
    const loaded = await provider.load();
    expect(loaded.a).toBeUndefined();
    expect(loaded.c).toBe(3);
  });

  it("unwatch() stops notifications", () => {
    const provider = new MemoryProvider({ values: { x: 1 } });
    const onChange = vi.fn();
    provider.watch(onChange);
    provider.unwatch();
    provider.set("x", 99);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("EnvProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads env vars with default NEXUS_ prefix", async () => {
    process.env["NEXUS_APP_NAME"] = "TestApp";
    const provider = new EnvProvider();
    const loaded = await provider.load();
    expect(loaded["app_name"]).toBe("TestApp");
  });

  it("strips prefix by default", async () => {
    process.env["NEXUS_FOO"] = "bar";
    const provider = new EnvProvider();
    const loaded = await provider.load();
    expect(loaded["foo"]).toBe("bar");
    expect("nexus_foo" in loaded).toBe(false);
  });

  it("uses custom prefix", async () => {
    process.env["MYAPP_HOST"] = "db.example.com";
    const provider = new EnvProvider({ prefix: "MYAPP_" });
    const loaded = await provider.load();
    expect(loaded["host"]).toBe("db.example.com");
  });

  it("coerces 'true' to boolean", async () => {
    process.env["NEXUS_DEBUG"] = "true";
    const provider = new EnvProvider();
    const loaded = await provider.load();
    expect(loaded["debug"]).toBe(true);
  });

  it("coerces 'false' to boolean", async () => {
    process.env["NEXUS_DEBUG"] = "false";
    const provider = new EnvProvider();
    const loaded = await provider.load();
    expect(loaded["debug"]).toBe(false);
  });

  it("coerces numeric string to number", async () => {
    process.env["NEXUS_PORT"] = "5432";
    const provider = new EnvProvider();
    const loaded = await provider.load();
    expect(loaded["port"]).toBe(5432);
  });

  it("parses JSON string values", async () => {
    process.env["NEXUS_FEATURES"] = '{"darkMode":true}';
    const provider = new EnvProvider();
    const loaded = await provider.load();
    expect(loaded["features"]).toEqual({ darkMode: true });
  });

  it("uses double-underscore for nesting", async () => {
    process.env["NEXUS_DATABASE__HOST"] = "db.prod";
    const provider = new EnvProvider();
    const loaded = await provider.load();
    expect(loaded["database.host"]).toBe("db.prod");
  });

  it("ignores env vars without prefix", async () => {
    process.env["UNRELATED_VAR"] = "should-be-ignored";
    const provider = new EnvProvider();
    const loaded = await provider.load();
    expect("unrelated_var" in loaded).toBe(false);
  });

  it("has Env source", () => {
    const provider = new EnvProvider();
    expect(provider.source).toBe(ConfigSource.Env);
  });

  it("returns string for non-parseable value", async () => {
    process.env["NEXUS_LABEL"] = "hello world";
    const provider = new EnvProvider();
    const loaded = await provider.load();
    expect(loaded["label"]).toBe("hello world");
  });
});
