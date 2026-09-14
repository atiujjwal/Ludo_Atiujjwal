import palettes from "../app-palettes.css?raw";
import { THEME_BOOTSTRAP, THEME_COLORS } from "./app-theme";

export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en" data-appearance="royal" data-theme="dark" class="dark">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="${THEME_COLORS.dark}" />
    <script>${THEME_BOOTSTRAP}</script>
    <link rel="icon" href="/favicon.png" />
    <style>
      ${palettes}
      * { box-sizing: border-box; }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: var(--background); color: var(--foreground); display: grid; place-items: center; min-height: 100dvh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; border: 1px solid var(--border); border-radius: 1.5rem; background: var(--card); }
      h1 { font: 1.5rem Georgia, serif; margin: 0 0 0.5rem; }
      p { color: var(--muted-foreground); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { min-height: 44px; padding: 0.5rem 1rem; border-radius: 0.75rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: var(--primary); color: var(--primary-foreground); }
      .secondary { background: var(--secondary); color: var(--secondary-foreground); border-color: var(--border); }
      a:focus-visible,button:focus-visible { outline: 3px solid var(--ring); outline-offset: 3px; }
    </style>
  </head>
  <body>
    <div class="card">
      <img src="/logo.png" alt="Ludo" width="64" height="64" style="border-radius:16px;margin-bottom:20px" />
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
