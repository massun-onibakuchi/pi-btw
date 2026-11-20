import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Resolve local paths relative to the config that owns them, not process.cwd(). */
function resolveSource(source: string, configPath: string): string {
  if (source.startsWith("npm:") || source.startsWith("git:")) return source;
  if (source.startsWith("~/")) return join(homedir(), source.slice(2));
  return resolve(dirname(configPath), source);
}

type BtwConfig = { extensions?: string[]; workspace?: "local" | "ssh"; fullscreen?: boolean; quietTranscript?: boolean };

export async function readConfig(path: string, includeExtensions = true): Promise<BtwConfig | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Cannot read BTW config ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch {
    throw new Error(`Invalid BTW config ${path}: expected JSON.`);
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Invalid BTW config ${path}: expected an object.`);
  }
  const fields = Object.keys(config);
  if (fields.some((field) => field !== "extensions" && field !== "workspace" && field !== "fullscreen" && field !== "quietTranscript")) {
    throw new Error(`Invalid BTW config ${path}: only "extensions", "workspace", "fullscreen", and "quietTranscript" keys are supported.`);
  }
  if ("workspace" in config && config.workspace !== "local" && config.workspace !== "ssh") {
    throw new Error(`Invalid BTW config ${path}: "workspace" must be "local" or "ssh".`);
  }
  if ("fullscreen" in config && typeof config.fullscreen !== "boolean") {
    throw new Error(`Invalid BTW config ${path}: "fullscreen" must be a boolean.`);
  }
  if ("quietTranscript" in config && typeof config.quietTranscript !== "boolean") {
    throw new Error(`Invalid BTW config ${path}: "quietTranscript" must be a boolean.`);
  }
  if (includeExtensions && "extensions" in config && (!Array.isArray(config.extensions) || config.extensions.some((source) => typeof source !== "string" || !source.trim()))) {
    throw new Error(`Invalid BTW config ${path}: "extensions" must be an array of nonempty source strings.`);
  }
  return {
    ...(includeExtensions && "extensions" in config && Array.isArray(config.extensions) ? { extensions: [...new Set(config.extensions.map((source: string) => resolveSource(source.trim(), path)))] } : {}),
    ...("workspace" in config ? { workspace: config.workspace as "local" | "ssh" } : {}),
    ...("fullscreen" in config && typeof config.fullscreen === "boolean" ? { fullscreen: config.fullscreen } : {}),
    ...("quietTranscript" in config && typeof config.quietTranscript === "boolean" ? { quietTranscript: config.quietTranscript } : {}),
  };
}
