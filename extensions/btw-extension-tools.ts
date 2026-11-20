import { realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  DefaultPackageManager,
  DefaultResourceLoader,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { readConfig } from "./btw-config";

/** Project lists replace global lists, including an explicit empty list. */
export async function readBtwExtensionSources(options: {
  cwd: string;
  agentDir: string;
  projectTrusted: boolean;
}): Promise<string[]> {
  const globalSources = await readConfig(join(options.agentDir, "btw.json"));
  const projectSources = options.projectTrusted
    ? await readConfig(join(options.cwd, ".pi", "btw.json"))
    : undefined;
  return projectSources?.extensions ?? globalSources?.extensions ?? [];
}

/** Workspace selection is independent of extension tool loading, including ask mode. */
export async function readBtwWorkspaceMode(options: {
  cwd: string;
  agentDir: string;
  projectTrusted: boolean;
}): Promise<"local" | "ssh"> {
  const globalConfig = await readConfig(join(options.agentDir, "btw.json"), false);
  const projectConfig = options.projectTrusted ? await readConfig(join(options.cwd, ".pi", "btw.json"), false) : undefined;
  return projectConfig?.workspace ?? globalConfig?.workspace ?? "local";
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Resolve the allowlist before running any extension factories. Remote packages
 * have a BTW-owned install root so Pi's factory cache cannot reuse the parent's
 * module globals. Local sources already loaded by the parent are rejected.
 */
export async function loadBtwExtensionResources(options: {
  cwd: string;
  agentDir: string;
  sources: string[];
  parentExtensionPaths: string[];
}): Promise<ResourceLoader> {
  const agentDir = join(options.agentDir, "btw");
  const settingsManager = SettingsManager.inMemory();
  const packages = new DefaultPackageManager({ cwd: options.cwd, agentDir, settingsManager });
  const selectedPaths = new Set<string>();
  for (const source of options.sources) {
    const resolved = await packages.resolveExtensionSources([source], { temporary: true });
    const paths = resolved.extensions.filter((resource) => resource.enabled).map((resource) => resource.path);
    if (paths.length === 0) throw new Error(`BTW source ${source} did not resolve to any extensions.`);
    for (const path of paths) selectedPaths.add(path);
  }
  const paths = [...selectedPaths];
  const parentPaths = new Set(await Promise.all(options.parentExtensionPaths.map(canonicalPath)));
  for (const path of paths) {
    if (parentPaths.has(await canonicalPath(path))) {
      throw new Error(
        `BTW cannot reload the parent's extension ${path}: Pi can share its module state. Use an npm: or git: source for a separate BTW install.`,
      );
    }
  }
  const loader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: paths,
  });
  await loader.reload();
  return loader;
}
