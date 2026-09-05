import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "apps/desktop/src-tauri/resources/runtime/pine-runtime.cjs");

mkdirSync(dirname(outfile), { recursive: true });

await esbuild.build({
	absWorkingDir: root,
	entryPoints: [join(root, "packages/runtime/src/cli.ts")],
	outfile,
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node22",
	sourcemap: false,
	legalComments: "none",
	logLevel: "info",
	packages: "bundle",
	external: [],
	banner: {
		js: "/* Pine bundled runtime */",
	},
});

console.log(`bundled runtime -> ${outfile}`);
