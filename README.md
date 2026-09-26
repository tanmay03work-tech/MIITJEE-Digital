# MIITJEE Classes

The current development target is the web app. It uses the shared TypeScript UI in `src/`, React Native Web, Vite, Supabase, and the Cloudflare Worker backend.

## Web development

1. Install Node.js 22.11+.
2. Run `npm install`.
3. Copy `.env.example` to your local environment and provide the required public configuration.
4. Run `npm run web:dev`.
5. Open the local Vite URL shown in the terminal.

Useful commands:

- `npm run web:build` builds the deployable site into `dist/`.
- `npm run web:preview` previews the production build.
- `npm run lint` performs the TypeScript check.
- `npm test` runs Jest tests.
- `npm run deploy` builds and deploys the Vercel site.

## Parked platforms

Android and Windows CBT support are intentionally kept in the repository for later work, but are hidden from VS Code Explorer and search by default. Their source has not been removed.

- Android: `android/`, `scripts/run-android.js`, and `scripts/build-android.js`.
- Windows CBT: `desktop/` and `dist-electron/`.

When mobile work resumes, use the existing `npm run android`, `npm run android:build`, or `npm run desktop:dev` commands. Android compatibility patches now run only with Android commands, so regular web installs stay web-focused.

See [docs/WEB_FIRST_WORKSPACE.md](./docs/WEB_FIRST_WORKSPACE.md) for the workspace layout and how to reveal parked folders.

## Backend

- App data, auth, RLS policies, and database migrations: `supabase/`.
- Worker endpoints for PDF, assets, CBT, and app updates: `miitjee-backend/`.
- Shared client data services: `src/services/`.
