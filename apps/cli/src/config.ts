import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".nexus");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface CliConfig {
  apiUrl: string;
  accessToken?: string;
  refreshToken?: string;
}

const DEFAULT_CONFIG: CliConfig = {
  apiUrl: "http://localhost:3001",
};

export function getConfig(): CliConfig {
  if (!existsSync(CONFIG_FILE)) {
    return DEFAULT_CONFIG;
  }

  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Partial<CliConfig>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const current = getConfig();
  const merged = { ...current, ...config };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

export function getApiUrl(): string {
  return getConfig().apiUrl;
}

export function getToken(): string | undefined {
  return getConfig().accessToken;
}
