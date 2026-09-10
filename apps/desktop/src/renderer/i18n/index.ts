import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enUS from "./locales/en-US.json";
import zhCN from "./locales/zh-CN.json";

type AppLanguage = "zh-CN" | "en-US";

function detectLanguage(): AppLanguage {
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

export { i18n };
