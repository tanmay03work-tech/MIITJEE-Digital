# Web-First Workspace

This repository currently focuses on the Vite web app. The shared UI and client code remain in `src/`; do not move it into a web-only folder because the parked Android and desktop clients reuse it.

## Visible working set

For everyday web work, use these folders:

- `src/` for UI, screens, navigation, state, services, and shared types.
- `public/` for browser assets and release metadata.
- `supabase/` for schema and Edge Functions.
- `miitjee-backend/` for Worker endpoints.
- `scripts/` for supported build, deployment, and data operations.

## Parked folders

VS Code hides the following by default through `.vscode/settings.json`:

- `android/`: React Native Android project.
- `desktop/`: Electron Windows CBT project.
- `dist/` and `dist-electron/`: generated build outputs.
- Android caches, toolchains, and Metro cache.
- `scratch/` and extracted question-paper output: operational and import artifacts.

The folders still exist on disk, remain versioned where applicable, and can be restored without a code migration. To reveal one, remove its entry from `files.exclude` and `search.exclude` in `.vscode/settings.json`.

## Platform commands

Web commands are the default:

- `npm run web:dev`
- `npm run web:build`
- `npm run web:preview`

Parked platform commands remain available:

- `npm run android`
- `npm run android:build`
- `npm run desktop:dev`
- `npm run desktop:build`

Android setup patches execute only when an Android command runs. This avoids modifying native packages during a web-only `npm install`.
