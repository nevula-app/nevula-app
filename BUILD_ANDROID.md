# Android native build

NEVULA is Android-only. Expo Go is not sufficient because messaging needs native WebCrypto.

1. Pull the latest `main`/feature branch.
2. Run `npm install` so the lockfile is refreshed for the pinned native crypto dependencies.
3. Copy `.env.example` to `.env` and set the NEVULA Supabase publishable key.
4. Run `npx expo prebuild --platform android`.
5. Run `npx expo run:android` with the Android device connected or an emulator available.
