/**
 * Minimal typed i18n for exactly two locales.
 *
 * A dictionary lookup plus placeholder substitution is all this app needs, and
 * hand-rolling it buys two things a general-purpose library would not:
 * `t("does.not.exist")` is a compile error, and a locale missing a key fails
 * the build rather than falling back silently at runtime.
 *
 * The active locale lives in the Redux `ui` slice; `useTranslate` reads it.
 */

import { enUS, type Dictionary, type TranslationKey } from "./en-US.ts";
import { zhCN } from "./zh-CN.ts";

export type Locale = "en-US" | "zh-CN";

export const LOCALES: Locale[] = ["en-US", "zh-CN"];

export const LOCALE_LABELS: Record<Locale, string> = {
	"en-US": "English",
	"zh-CN": "中文",
};

const DICTIONARIES: Record<Locale, Dictionary> = {
	"en-US": enUS,
	"zh-CN": zhCN,
};

export type TranslateValues = Record<string, string | number>;

/** Signature every component receives from `useTranslate`. */
export type Translate = (key: TranslationKey, values?: TranslateValues) => string;

/** Replace `{name}` placeholders. An unknown placeholder is left in place, which makes it obvious in the UI. */
function interpolate(template: string, values?: TranslateValues): string {
	if (!values) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in values ? String(values[name]) : match,
	);
}

export function createTranslate(locale: Locale): Translate {
	const dictionary = DICTIONARIES[locale];
	return (key, values) => interpolate(dictionary[key], values);
}

/** Pick a starting locale from the browser, defaulting to English. */
export function detectLocale(): Locale {
	const languages = typeof navigator === "undefined" ? [] : [navigator.language, ...(navigator.languages ?? [])];
	return languages.some((language) => language?.toLowerCase().startsWith("zh")) ? "zh-CN" : "en-US";
}

export type { TranslationKey };
