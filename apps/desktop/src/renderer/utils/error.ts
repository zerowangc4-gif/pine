import { i18n } from "../i18n";

/**
 * Renders an error message for display. Known i18n keys are translated;
 * raw technical messages (e.g. SDK/network errors) pass through unchanged.
 */
export function errorText(message: string | undefined): string {
  if (!message) {
    return "";
  }
  return i18n.exists(message) ? i18n.t(message) : message;
}
