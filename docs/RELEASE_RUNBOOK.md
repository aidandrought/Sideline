# Sideline Release Runbook

This runbook covers the steps to prepare a publishable build.

## 0) Tooling / Node Version
- Use `Node 20 LTS` for Expo SDK 54.
- `Node 22` can crash Expo dependency validation with:
  - `Body is unusable: Body has already been read`
- Temporary local workaround (PowerShell):

```powershell
$env:EXPO_NO_DEPENDENCY_VALIDATION="1"; npx expo start -c
```

## 1) Firebase Rules
From the repo root:

```bash
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules
firebase deploy --only database
```

Console checks:
- Firestore rules last published shows today
- Realtime Database rules last published shows today

## 2) App Smoke Tests (iOS + Android)
- Fresh install onboarding/login path works
- Returning user login works
- Home renders without blank screens
- Upcoming -> Preview opens quickly
- Results -> Result screen opens quickly
- Live -> Chat opens quickly
- Prediction submit works once and cannot be changed
- News opens fast in in-app viewer
- News feed contains soccer only (no NFL/NBA/etc)
- Explore dark mode has no light cards

## 3) Notifications
- Permission explainer copy appears before OS prompt
- Enable push notifications in Settings
- Enable live score alerts
- Subscribe/unsubscribe to match notifications works
- Verify a live notification arrives

## 4) Privacy / Legal
- Terms of Service screen opens
- Privacy Policy screen opens
- Text matches current data collection/use behavior

## 5) Build
```bash
npx expo prebuild
npx expo run:ios
npx expo run:android
```

Or EAS:
```bash
eas build -p ios
eas build -p android
```

## 6) Store Listing Checklist
- Final app icon and splash image
- Production screenshots captured (current UI)
- Privacy policy URL added to store listing
- Description and keywords finalized
- Push notification usage description matches actual behavior
