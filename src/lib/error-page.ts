export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#171815" />
    <link rel="icon" href="/favicon.png" />
    <style>
      * { box-sizing: border-box; }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #171815; color: #f2e8d2; display: grid; place-items: center; min-height: 100dvh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; border: 1px solid #63543a; border-radius: 1.5rem; background: #24251f; }
      h1 { font: 1.5rem Georgia, serif; margin: 0 0 0.5rem; }
      p { color: #bdb49f; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { min-height: 44px; padding: 0.5rem 1rem; border-radius: 0.75rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #d6b879; color: #241a0b; }
      .secondary { background: #343326; color: #f2e8d2; border-color: #63543a; }
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
