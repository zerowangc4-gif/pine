import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import {
  createEventBus,
  createExtensionRuntime,
  discoverAndLoadExtensions,
  loadProjectContextFiles,
  loadSkillsFromDir,
  type LoadExtensionsResult,
  type ResourceLoader,
  type Skill,
} from "../core/pi";
import { SYSTEM_PROMPT } from "../core/prompt";

export interface ProjectResourceLoader {
  loader: ResourceLoader;
  loadExtensions: () => Promise<void>;
}

/** Load skills from the project's `.pi/skills` and `.agents/skills`. */
export function loadProjectSkills(root: string): Skill[] {
  const skills: Skill[] = [];
  for (const dir of [path.join(root, ".pi", "skills"), path.join(root, ".agents", "skills")]) {
    if (!existsSync(dir)) {
      continue;
    }
    try {
      skills.push(...loadSkillsFromDir({ dir, source: dir }).skills);
    } catch {
      // A malformed skill directory must not block the session from starting.
    }
  }
  return skills;
}

/**
 * Write a human/model-readable index of all project skills to
 * `.pi/skills/README.md`. Re-run after creating a skill so the list stays in
 * sync. The SDK also injects skills into the system prompt directly; this file
 * is the on-disk, browsable record.
 */
export async function writeSkillsIndex(root: string): Promise<void> {
  const skills = loadProjectSkills(root);
  const lines = [
    "# Skills",
    "",
    "Project skills (auto-generated list). The agent also sees these in its system prompt.",
    "",
  ];
  for (const skill of skills) {
    lines.push(`## ${skill.name}`, "", skill.description || "No description.", "");
  }
  const dir = path.join(root, ".pi", "skills");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "README.md"), lines.join("\n"), "utf8");
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
    getSkills: () => ({ skills: loadProjectSkills(root), diagnostics: [] }),
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
