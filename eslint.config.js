// ESLint 9 flat config for the Pine workspace (pnpm monorepo: packages/* + apps/*).
//
// Scope note: `pine` is a TypeScript monorepo (Tauri + Vite desktop, Node runtime
// sidecar). It is NOT React Native, so an RN-flavoured lint set does not apply
// wholesale. What we take from a sibling RN project are the transportable rules
// (no-console off, explicit-any visible, unused vars dropping `^_` names).
//
// Two deliberate limits keep this usable on an already-large, un-linted repo:
//   * Formatting is NOT linted here — it belongs to Prettier, so ESLint never
//     fights the formatter over quotes/width.
//   * `packages/agent` and `packages/ai` are a frozen core (cannot be changed) and
//     use schema-generic `any` on purpose; the strict type rules are OFF there
//     entirely so the freeze never shows noise it can't act on. Elsewhere `any` is
//     a warning (visible), so new non-core code can still see and avoid it.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/target/**",
			"**/.artifacts/**",
			"**/*.tsbuildinfo",
			"packages/ai/src/providers/data/**",
			"apps/desktop/src-tauri/resources/**",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,tsx}"],
		plugins: {
			// Registered (not enabled wholesale) so that legacy
			// `eslint-disable-next-line react/…` comments in the UI resolve
			// instead of tripping "rule not found". Modern React-jsx needs none
			// of the classic runtime/JSX-presence rules, so those stay off.
			react,
			"react-hooks": reactHooks,
		},
		languageOptions: {
			parserOptions: { jsx: true, ecmaVersion: 2022 },
			globals: {
				// Node runtime + browser UI live in the same repo; TypeScript owns
				// the precise types, so the compiler is the arbiter of globals.
				process: "readonly",
				console: "readonly",
				Buffer: "readonly",
			},
		},
		rules: {
			// ---- TypeScript owns these; the JS lints only produce noise ----
			"no-undef": "off",
			"no-unused-vars": "off",
			"no-unused-labels": "off",
			"no-redeclare": "off",

			// React plugin rules referenced by source `eslint-disable` comments
			// but not worth enabling repo-wide today.
			"react/no-array-index-key": "off",
			"react-hooks/exhaustive-deps": "off",

			// ---- Shared rules pulled from the sibling project ----
			"no-console": "off", // console is fine for tooling/dev logs
			// `any` is surfaced as a warning on the modifiable code (runtime, UI):
			// visible and discoverable without hard-blocking the schema-generic
			// tool layer, which also reaches runtime via `AgentTool<TDetails = any>`.
			// In the frozen core it is turned OFF entirely (see override below).
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-empty-object-type": "warn",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					args: "after-used",
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
		},
	},
	// Plain-JS and ESM/node tooling that lives outside the src/ trees still
	// exercises `no-undef`, so give it the ambient globals it runs under.
	// The TS side keeps no-undef off because the compiler already types globals.
	{
		files: ["**/*.{js,mjs,cjs}"],
		languageOptions: {
			globals: {
				// ECMAScript / web-visible
				console: "readonly",
				globalThis: "readonly",
				setTimeout: "readonly",
				setInterval: "readonly",
				clearTimeout: "readonly",
				clearInterval: "readonly",
				setImmediate: "readonly",
				clearImmediate: "readonly",
				fetch: "readonly",
				headers: "readonly",
				URL: "readonly",
				URLSearchParams: "readonly",
				AbortController: "readonly",
				AbortSignal: "readonly",
				TextEncoder: "readonly",
				TextDecoder: "readonly",
				// Node runtime
				process: "readonly",
				Buffer: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				require: "readonly",
				module: "readonly",
				exports: "readonly",
			},
		},
	},
	// ---------- Frozen core: not linted for type-visibility ----------
	{
		files: ["packages/agent/**/*.ts", "packages/ai/**/*.ts"],
		// `packages/agent` & `packages/ai` are a frozen core (cannot be changed) and
		// rely pervasively on schema-generic tool types (e.g. `AgentTool<TParameters
		// = TSchema, TDetails = any>`). Those `any`s are intentional, so the strict
		// type-visibility rules are switched OFF entirely here instead of left as
		// warnings. Everywhere outside the core the same rules still apply above.
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-empty-object-type": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-require-imports": "off",
			"prefer-const": "off",
			"no-var": "off",
			"no-empty": "off",
			"no-useless-escape": "off",
			"no-constant-binary-expression": "off",
			"no-constant-condition": "off",
			"no-fallthrough": "off",
			"no-cond-assign": "off",
			"no-control-regex": "off",
			"no-redeclare": "off",
			"no-unreachable": "off",
			"no-unused-expressions": "off",
		},
	},
);
