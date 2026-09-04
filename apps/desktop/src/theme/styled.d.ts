/**
 * Teaches styled-components about our theme, so `props.theme` is fully typed
 * inside every template literal and a missing token is a compile error.
 */

import type { AppTheme } from "./themes.ts";

declare module "styled-components" {
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	export interface DefaultTheme extends AppTheme {}
}
