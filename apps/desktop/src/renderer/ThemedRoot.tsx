import { HashRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { App } from "./App";
import { useAppSelector } from "./store/hooks";
import { getTheme } from "./theme";

export function ThemedRoot() {
  const themeName = useAppSelector((state) => state.theme.name);

  return (
    <ThemeProvider theme={getTheme(themeName)}>
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  );
}
