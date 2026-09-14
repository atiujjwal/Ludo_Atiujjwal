export type AppTheme = "light" | "dark";
export const APP_THEME_KEY = "ludo:app-theme:v1";
export const THEME_COLORS = { dark: "#171815", light: "#f6f0e4" };

export function readAppTheme(): AppTheme {
  try {
    return window.localStorage.getItem(APP_THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyAppTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.dataset["theme"] = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

export function saveAppTheme(theme: AppTheme) {
  applyAppTheme(theme);
  try {
    window.localStorage.setItem(APP_THEME_KEY, theme);
  } catch {
    /* Switching still works without storage. */
  }
}

// Runs before body paint, including on cached offline HTML and fallback pages.
export const THEME_BOOTSTRAP = `(function(){var t='dark';try{if(localStorage.getItem('${APP_THEME_KEY}')==='light')t='light'}catch(e){}var r=document.documentElement;r.dataset.theme=t;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t==='light'?'${THEME_COLORS.light}':'${THEME_COLORS.dark}'})();`;
