import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readConfig, setConfigValue, toggleConfigValue, writeConfig } from "../src/core/config.js";

describe("config", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ctx-config-test-"));
    process.env.CTX_STORE_DIR = tempDir;
  });

  afterEach(async () => {
    delete process.env.CTX_STORE_DIR;
    await fs.remove(tempDir);
  });

  it("returns an empty config when no file exists", async () => {
    expect(await readConfig()).toEqual({});
  });

  it("sets boolean settings from on/off strings", async () => {
    await setConfigValue("tools", "off");
    await setConfigValue("files", "on");
    expect(await readConfig()).toEqual({ tools: false, files: true });
  });

  it("sets messages as a positive integer", async () => {
    await setConfigValue("messages", "20");
    expect(await readConfig()).toEqual({ messages: 20 });
  });

  it("rejects unknown keys and bad values", async () => {
    await expect(setConfigValue("bogus", "on")).rejects.toThrow(/Unknown setting/);
    await expect(setConfigValue("tools", "maybe")).rejects.toThrow(/expects on or off/);
    await expect(setConfigValue("messages", "-3")).rejects.toThrow(/positive integer/);
  });

  it("survives a corrupt config file", async () => {
    await fs.writeFile(path.join(tempDir, "config.json"), "not json", "utf8");
    expect(await readConfig()).toEqual({});
  });

  it("toggles boolean settings from their effective value", async () => {
    expect(await toggleConfigValue("tools")).toBe(false); // default on -> off
    expect(await toggleConfigValue("tools")).toBe(true); // off -> on
    expect((await readConfig()).tools).toBe(true);
  });

  it("reset clears saved settings", async () => {
    await setConfigValue("tools", "off");
    await writeConfig({});
    expect(await readConfig()).toEqual({});
  });
});
