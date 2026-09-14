import { createContext, useContext } from "react";
import type { AppTheme } from "./app-theme";

export const AppThemeContext = createContext<{
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}>({ theme: "dark", setTheme: () => {}, toggleTheme: () => {} });

export const useAppTheme = () => useContext(AppThemeContext);
