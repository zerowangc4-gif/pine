/**
 * Reads the active locale from the store and returns a memoized translator.
 *
 * Memoizing on the locale means a component re-renders when the language
 * changes and never because of an unstable function identity.
 */

import { useMemo } from "react";
import { useAppSelector } from "../store/hooks.ts";
import { selectLocale } from "../store/slices/ui.ts";
import { createTranslate, type Translate } from "./index.ts";

export function useTranslate(): Translate {
	const locale = useAppSelector(selectLocale);
	return useMemo(() => createTranslate(locale), [locale]);
}
