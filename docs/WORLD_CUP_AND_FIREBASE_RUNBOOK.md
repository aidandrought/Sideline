# World Cup + Firebase Runbook

This runbook covers seeding World Cup data from the Football API into Firestore, deploying Firebase rules, and verifying live presence/counts.

## 1) Seed World Cup Data (Admin SDK)

### Prereqs
- Node 18+ (for built-in `fetch`).
- Firebase service account JSON with Firestore access.
- Football API key (API-SPORTS).

### Install dependency (once)
```
npm install firebase-admin
```

### Required env vars
```
# Football API
FOOTBALL_API_KEY=your_api_key

# Firebase Admin SDK
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json
```

### Command
```
# from repo root
npx ts-node scripts/seedWorldCup.ts
```

### Expected console output
- `Resolved World Cup leagueId=... season=...`
- `Teams written: <count>`
- `Fixtures written: <count>`
- `Skipped fixtures (missing kickoff): <count>` (optional)

Notes:
- Seeding is idempotent (uses `merge:true`).
- If the current World Cup season has no future fixtures, the script selects the next season that does.

## 2) Deploy Firebase Rules

### Login + select project
```
firebase login
firebase use <your-project-id>
```

### Deploy Firestore rules
```
firebase deploy --only firestore:rules
```

### Deploy RTDB rules
```
firebase deploy --only database
```

## 3) Console Verification

### Firestore
- `communities` collection:
  - `worldcup_<leagueId>_<season>` exists.
  - `team_<teamId>` docs exist for all national teams.
- `matches` collection:
  - `fixture_<fixtureId>` docs exist.
  - `kickoffAt` is a Timestamp.
  - `homeCommunityId` / `awayCommunityId` are `team_<id>`.

### RTDB (Presence)
- Enter a match chat or community chat in the app.
- Verify:
  - `presence/chats/<chatId>/<uid>` or `presence/communities/<communityId>/<uid>` appears while in the room.
  - Node is removed on disconnect.

## 4) Smoke Test Checklist
1. Run seed script and confirm teams + fixtures written.
2. Open app Communities tab.
3. Confirm World Cup community appears.
4. Open World Cup community:
   - News tab loads
   - Groups tab renders
5. Open a match chat:
   - Viewer count updates from RTDB presence
6. Join/leave a community and confirm member count updates.

## 5) Security Notes
- `firestore.rules` allows writes to `matches`/`communities` only for `admin` custom-claim users.
- Admin SDK bypasses Firestore rules for seeding.
- RTDB `counts/*` writes are disallowed; viewer counts derive from `presence/*`.
