# MIITJEE Classes

React Native CLI Android-first rebuild of the existing MIITJEE web prototype.

## Stack

- React Native CLI
- React Navigation
- Zustand
- Supabase Auth + Postgres
- React Native Reanimated

## Run

1. Install Node.js 22.11+ and JDK 17.
2. Install dependencies with `npm install`.
3. Copy `.env.example` into your local env setup and provide real Supabase values.
4. Apply `supabase/migrations/20260405_backend_rebuild.sql` to your Supabase project.
5. Configure Google Auth in Supabase with redirect URL `com.miitjee.digital://auth/callback`.
6. Start an Android emulator in Android Studio Device Manager, or connect a real phone with USB debugging enabled.
7. Verify the device is visible with `adb devices`.
8. Run Android with `npm run android`.

## Build Debug APK

- Run `npm run android:build`
- Output APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Notes

- The app keeps the same card-based MIITJEE visual style from the web prototype.
- API services are centralized under `src/services/api` and talk directly to Supabase.
- Backend schema, RLS policies, analytics models, and admin RPCs live under [supabase/](./supabase).
- `npm run android` now checks for a connected emulator or phone first, starts Metro if needed, and configures `adb reverse` automatically for USB-connected phones.
