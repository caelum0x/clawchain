import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigManager } from "../config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Tests for ConfigManager.resolveWorkspace() focusing on:
 * - allowExternalWorkspaces flag behavior
 * - External absolute paths (outside baseDir)
 * - Named workspace paths (relative)
 * - Tilde paths inside/outside baseDir
 */
describe("ConfigManager.resolveWorkspace", () => {
  let tmpDir: string;
  let configPath: string;
  let baseDir: string;
  let externalDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openacp-cfg-test-"));
    configPath = path.join(tmpDir, "config.json");
    baseDir = path.join(tmpDir, "workspace");
    externalDir = path.join(tmpDir, "external-project");
    fs.mkdirSync(baseDir, { recursive: true });
    fs.mkdirSync(externalDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeManager(allowExternalWorkspaces: boolean): ConfigManager {
    const config = {
      defaultAgent: "claude",
      workspace: {
        baseDir,
        allowExternalWorkspaces,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config));
    const mgr = new ConfigManager(configPath);
    // Bypass load() — directly inject config for unit testing
    (mgr as any).config = {
      defaultAgent: "claude",
      workspace: {
        baseDir,
        allowExternalWorkspaces,
        security: { allowedPaths: [], envWhitelist: [] },
      },
      logging: {
        level: "info",
        logDir: "~/.openacp/logs",
        maxFileSize: "10m",
        maxFiles: 7,
        sessionLogRetentionDays: 30,
      },
      runMode: "foreground",
      autoStart: false,
      sessionStore: { ttlDays: 30 },
      integrations: {},
      agentSwitch: { labelHistory: true },
    };
    return mgr;
  }

  describe("allowExternalWorkspaces: true (default)", () => {
    it("allows absolute path inside baseDir", () => {
      const mgr = makeManager(true);
      const subDir = path.join(baseDir, "my-project");
      fs.mkdirSync(subDir, { recursive: true });
      expect(mgr.resolveWorkspace(subDir)).toBe(subDir);
    });

    it("allows absolute path outside baseDir", () => {
      const mgr = makeManager(true);
      const result = mgr.resolveWorkspace(externalDir);
      expect(result).toBe(externalDir);
    });

    it("throws when external absolute path does not exist", () => {
      const mgr = makeManager(true);
      const nonExistent = path.join(tmpDir, "does-not-exist");
      expect(() => mgr.resolveWorkspace(nonExistent)).toThrow(/does not exist/);
    });

    it("allows baseDir itself as absolute path", () => {
      const mgr = makeManager(true);
      expect(mgr.resolveWorkspace(baseDir)).toBe(baseDir);
    });

    it("resolves named workspace to subdirectory under baseDir", () => {
      const mgr = makeManager(true);
      const result = mgr.resolveWorkspace("my-project");
      expect(result).toBe(path.join(baseDir, "my-project"));
    });

    it("returns baseDir when no input given", () => {
      const mgr = makeManager(true);
      const result = mgr.resolveWorkspace();
      expect(result).toBe(baseDir);
    });
  });

  describe("allowExternalWorkspaces: false", () => {
    it("allows absolute path inside baseDir", () => {
      const mgr = makeManager(false);
      const subDir = path.join(baseDir, "my-project");
      fs.mkdirSync(subDir, { recursive: true });
      expect(mgr.resolveWorkspace(subDir)).toBe(subDir);
    });

    it("throws when absolute path is outside baseDir", () => {
      const mgr = makeManager(false);
      expect(() => mgr.resolveWorkspace(externalDir)).toThrow(
        /outside base directory/,
      );
    });

    it("throws when tilde path is outside baseDir", () => {
      const mgr = makeManager(false);
      // Use a home-relative path that isn't under baseDir
      expect(() => mgr.resolveWorkspace("~/some-other-project")).toThrow(
        /outside base directory/,
      );
    });
  });

  describe("named workspaces", () => {
    it("rejects names with special characters", () => {
      const mgr = makeManager(true);
      expect(() => mgr.resolveWorkspace("my project")).toThrow(
        /Invalid workspace name/,
      );
    });

    it("rejects names with path separators", () => {
      const mgr = makeManager(true);
      expect(() => mgr.resolveWorkspace("my/project")).toThrow(
        /Invalid workspace name/,
      );
    });

    it("converts name to lowercase", () => {
      const mgr = makeManager(true);
      const result = mgr.resolveWorkspace("MyProject");
      expect(result).toBe(path.join(baseDir, "myproject"));
    });
  });
});
