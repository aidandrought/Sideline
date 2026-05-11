# Sideline

Sideline is an Expo/React Native football app with live chat, match previews/results, communities, and news.

## Local Development

1. Use `Node 20 LTS` (Expo SDK 54)

```bash
node -v
# Use Node 20.x
```

Node 22 can crash Expo CLI dependency validation with:
`Body is unusable: Body has already been read`

Temporary workaround (PowerShell):

```powershell
$env:EXPO_NO_DEPENDENCY_VALIDATION="1"; npx expo start -c
```

2. Install dependencies

```bash
npm install
```

3. Start the app

```bash
npx expo start
```

## Production Notes

- Deploy Firestore + Realtime Database rules before release.
- Validate prediction permissions and vote locking in production rules.
- Confirm push notification permission copy and delivery behavior on iOS + Android.
- Run the release checklist in `docs/RELEASE_RUNBOOK.md`.
