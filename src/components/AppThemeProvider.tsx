import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AppThemeContext } from "@/lib/app-theme-context";
import {
  applyAppTheme,
  readAppTheme,
  saveAppTheme,
  APP_THEME_KEY,
  type AppTheme,
} from "@/lib/app-theme";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = (): AppTheme =>
  document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
const serverSnapshot = (): AppTheme => "dark";
const setTheme = (theme: AppTheme) => {
  saveAppTheme(theme);
  notify();
};

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === APP_THEME_KEY || event.key === null) {
        applyAppTheme(readAppTheme());
        notify();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return (
    <AppThemeContext.Provider
      value={{ theme, setTheme, toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark") }}
    >
      {children}
    </AppThemeContext.Provider>
  );
}
