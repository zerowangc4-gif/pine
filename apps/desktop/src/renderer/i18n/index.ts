import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enUS from "./locales/en-US.json";
import zhCN from "./locales/zh-CN.json";

const STORAGE_KEY = "pine.language";

export type AppLanguage = "zh-CN" | "en-US";

export const defaultLanguage: AppLanguage = "zh-CN";

function detectLanguage(): AppLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en-US") {
    return stored;
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

void i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS },
  },
  lng: detectLanguage(),
  fallbackLng: "zh-CN",
  interpolation: {
    escapeValue: false,
  },
});

i18n.on("languageChanged", (language) => {
  localStorage.setItem(STORAGE_KEY, language);
});

export { i18n };
export type { TFunction } from "i18next";
