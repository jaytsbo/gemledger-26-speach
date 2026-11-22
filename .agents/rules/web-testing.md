---
trigger: always_on
---

- Web Testing & Cloudflare Pages Deployment:
  - Fixed Production URL: `https://gemledger-26.pages.dev/` (Cloudflare Pages project: `gemledger-26`, Production branch: `main`, Direct Upload mode).
  - Default Workflow: Whenever the user asks for web testing ("網頁測試"), do NOT start a local `localhost` dev server unless explicitly requested. Instead:
    1. Run `npm run typecheck` and `npm test` and confirm both pass.
    2. Build the static web bundle with `npx expo export --platform web`.
    3. Deploy `dist/` to the `main` branch using `.\node_modules\.bin\wrangler.cmd pages deploy dist --project-name gemledger-26 --branch main` (never deploy to `no-transcribe`).
    4. Provide `https://gemledger-26.pages.dev/` (and the deployment-specific URL if helpful) for mobile/browser testing.
  - Git Sync Policy: Do NOT run `git commit` or `git push` automatically during web testing unless the user explicitly asks to commit or push.
