import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(root, "apps/desktop/src-tauri/resources/runtime");
mkdirSync(runtimeDir, { recursive: true });

const bundle = spawnSync(process.execPath, [join(root, "scripts/bundle-runtime.mjs")], {
	cwd: root,
	stdio: "inherit",
});
if (bundle.status !== 0) {
	process.exit(bundle.status ?? 1);
}

const nodeDest = join(runtimeDir, process.platform === "win32" ? "node.exe" : "node");
copyFileSync(process.execPath, nodeDest);
console.log(`vendored node -> ${nodeDest}`);

const script = join(runtimeDir, "pine-runtime.cjs");
if (!existsSync(script)) {
	console.error("missing bundled runtime script");
	process.exit(1);
}

console.log("sidecar ready");
