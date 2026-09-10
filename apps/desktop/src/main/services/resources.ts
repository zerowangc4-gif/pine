import path from "node:path";
import {
  createEventBus,
  createExtensionRuntime,
  discoverAndLoadExtensions,
  loadProjectContextFiles,
  type LoadExtensionsResult,
  type ResourceLoader,
} from "../core";
import { SYSTEM_PROMPT } from "../core";

export interface ProjectResourceLoader {
  loader: ResourceLoader;
  loadExtensions: () => Promise<void>;
}

/**
 * Build the resource loader for a workspace. Keeps the "zero default config"
 * guarantee: `agentDir` is the project root, so nothing under `~/.pi/agent` is
 * discovered. Extensions are loaded asynchronously before session creation.
 */
export function createProjectResourceLoader(root: string): ProjectResourceLoader {
  let extensionsResult: LoadExtensionsResult = {
    extensions: [],
    errors: [],
    runtime: createExtensionRuntime(),
  };
  const eventBus = createEventBus();

  const loader: ResourceLoader = {
    getExtensions: () => extensionsResult,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: loadProjectContextFiles({ cwd: root, agentDir: root }) }),
    getSystemPrompt: () => SYSTEM_PROMPT,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };

  return {
    loader,
    loadExtensions: async () => {
      try {
        extensionsResult = await discoverAndLoadExtensions(
          [path.join(root, ".agents", "extensions")],
          root,
          root,
          eventBus,
        );
      } catch {
        // A broken extension must not block the session from starting.
      }
    },
  };
}
