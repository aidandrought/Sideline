#!/usr/bin/env node
/**
 * scripts/seedPlayers.js
 *
 * Seeds / updates the Firestore `players` collection from API-Football.
 * Safe to run repeatedly — uses set({ merge: false }) so prices are always refreshed.
 *
 * SETUP
 * ─────
 * 1. Download your Firebase service account JSON:
 *    Firebase console → Project settings → Service accounts → Generate new private key
 *    Save it as scripts/serviceAccount.json  (already in .gitignore below)
 *
 * 2. Create scripts/.env  (or export vars in your shell):
 *    FOOTBALL_API_KEY=your_api_football_key
 *    FIREBASE_PROJECT_ID=your_project_id          # optional if set in serviceAccount.json
 *
 * 3. Install deps (once):
 *    cd scripts && npm install
 *
 * 4. Run:
 *    node scripts/seedPlayers.js              # all competitions
 *    node scripts/seedPlayers.js --league 39  # single competition
 *    node scripts/seedPlayers.js --dry-run    # preview without writing
 */

'use strict';

const path   = require('path');
const fs     = require('fs');

// ─── Load .env from scripts/ dir ─────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const admin = require('firebase-admin');

// ─── Firebase Admin init ──────────────────────────────────────────────────────
const serviceAccountPath = path.join(__dirname, 'serviceAccount.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error(
    '❌  Missing scripts/serviceAccount.json\n' +
    '   Download it from Firebase console → Project settings → Service accounts'
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

const db = admin.firestore();

// ─── Config ───────────────────────────────────────────────────────────────────
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
if (!FOOTBALL_API_KEY) {
  console.error('❌  Missing FOOTBALL_API_KEY in scripts/.env');
  process.exit(1);
}

const API_BASE    = 'https://v3.football.api-sports.io';
const API_HEADERS = { 'x-apisports-key': FOOTBALL_API_KEY };

/** Competitions to seed.  competitionId matches API-Football league IDs. */
const COMPETITIONS = [
  { id: 39,  name: 'Premier League',       country: 'England'  },
  { id: 140, name: 'La Liga',              country: 'Spain'    },
  { id: 2,   name: 'Champions League',     country: 'Europe'   },
  { id: 3,   name: 'Europa League',        country: 'Europe'   },
  { id: 135, name: 'Serie A',              country: 'Italy'    },
  { id: 78,  name: 'Bundesliga',           country: 'Germany'  },
  { id: 61,  name: 'Ligue 1',              country: 'France'   },
  { id: 253, name: 'MLS',                  country: 'USA'      },
];

const PLAYERS_COLLECTION = 'players';

/** How long to wait between API pages to avoid hitting rate limits (ms). */
const RATE_LIMIT_DELAY_MS = 1200; // ~50 req/min safe for paid tier; raise to 6100 for free (10/min)

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const dryRun     = args.includes('--dry-run');
const leagueFlag = args.indexOf('--league');
const singleLeagueId = leagueFlag >= 0 ? parseInt(args[leagueFlag + 1], 10) : null;

const competitions = singleLeagueId
  ? COMPETITIONS.filter((c) => c.id === singleLeagueId)
  : COMPETITIONS;

if (competitions.length === 0) {
  console.error(`❌  Unknown league id: ${singleLeagueId}`);
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the current football season start year (e.g. 2024 for 2024/25). */
function currentSeason() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  return month >= 7 ? year : year - 1;
}

/** Sleep helper. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Map API-Football position strings to our canonical PlayerPosition.
 * API returns: "Goalkeeper" | "Defender" | "Midfielder" | "Attacker" | null/undefined
 */
function normalizePosition(apiPosition) {
  if (!apiPosition) return 'MID'; // safe fallback
  const p = apiPosition.toLowerCase().trim();
  if (p.includes('goal'))    return 'GK';
  if (p.includes('defend'))  return 'DEF';
  if (p.includes('midfield') || p.includes('mid')) return 'MID';
  if (p.includes('attack') || p.includes('forward') || p.includes('striker') || p.includes('winger')) return 'FWD';
  return 'MID';
}

/**
 * Derive a fantasy price (in £m) from estimated season points.
 * Mirrors the priceFromPoints logic in fantasyService.ts so prices are consistent.
 */
function priceFromPoints(pts) {
  if (pts > 200) return 12.5;
  if (pts > 150) return 11.0;
  if (pts > 100) return 9.5;
  if (pts > 60)  return 7.5;
  if (pts > 30)  return 6.0;
  if (pts > 10)  return 5.0;
  return 4.5;
}

/**
 * Compute estimated fantasy points from raw stats.
 * Uses the same SCORING table as fantasyService.ts.
 */
function computePoints(position, goals, assists, appearances, cleanSheets, saves) {
  const APPEARANCE = 1;
  const ASSIST     = 3;
  const CLEAN_GK   = 4;
  const CLEAN_DEF  = 4;
  const CLEAN_MID  = 1;
  const SAVES_DIV  = 3; // 1pt per 3 saves

  const goalPts =
    position === 'GK' || position === 'DEF' ? 6 :
    position === 'MID'                      ? 5 : 4;

  let pts = 0;
  pts += appearances * APPEARANCE;
  pts += goals       * goalPts;
  pts += assists     * ASSIST;
  if (position === 'GK')  pts += cleanSheets * CLEAN_GK;
  if (position === 'DEF') pts += cleanSheets * CLEAN_DEF;
  if (position === 'MID') pts += cleanSheets * CLEAN_MID;
  if (position === 'GK')  pts += Math.floor((saves ?? 0) / SAVES_DIV);
  return Math.max(0, pts);
}

/**
 * Fetch one page from the /players endpoint and return parsed JSON.
 */
async function fetchPlayersPage(leagueId, season, page) {
  const url = `${API_BASE}/players?league=${leagueId}&season=${season}&page=${page}`;
  const res  = await fetch(url, { headers: API_HEADERS });
  if (!res.ok) {
    throw new Error(`API error ${res.status} for league ${leagueId} page ${page}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Fetch ALL players for a competition, handling pagination automatically.
 * Returns a flat array of raw API response entries.
 */
async function fetchAllPlayers(competition, season) {
  const allEntries = [];
  let page = 1;
  let totalPages = 1; // updated after first response

  console.log(`  Fetching ${competition.name} (league ${competition.id}, season ${season})…`);

  while (page <= totalPages) {
    const json = await fetchPlayersPage(competition.id, season, page);

    if (json.errors && Object.keys(json.errors).length > 0) {
      console.warn(`  ⚠️  API errors on page ${page}:`, json.errors);
      break;
    }

    const paging   = json.paging  ?? { current: page, total: 1 };
    totalPages      = paging.total ?? 1;
    const entries   = json.response ?? [];

    allEntries.push(...entries);
    console.log(`    Page ${page}/${totalPages} — ${entries.length} players (cumulative: ${allEntries.length})`);

    page++;
    if (page <= totalPages) await sleep(RATE_LIMIT_DELAY_MS);
  }

  return allEntries;
}

/**
 * Map a raw API entry to our PlayerCache Firestore document shape.
 * Firestore doc ID: `{competitionId}_{playerId}`
 */
function mapToPlayerCache(entry, competition) {
  const player = entry.player        ?? {};
  const stats  = entry.statistics?.[0] ?? {};
  const games  = stats.games         ?? {};
  const goals  = stats.goals         ?? {};
  const passes = stats.passes        ?? {};
  const clean  = stats.goals         ?? {}; // API puts clean_sheet on goals object
  const gk     = stats.goalkeeping   ?? {};

  const position    = normalizePosition(games.position);
  const appearances = games.appearences ?? games.appearances ?? 0; // API typo varies
  const goalsTotal  = goals.total   ?? 0;
  const assistsTotal = goals.assists ?? passes.assists ?? 0;
  const cleanSheets = clean.conceded !== undefined
    ? 0  // not directly available per-player; default 0 unless GK/DEF
    : 0;
  const savesTotal  = gk.saves ?? 0;

  const totalPoints = computePoints(
    position,
    goalsTotal,
    assistsTotal,
    appearances,
    cleanSheets,
    savesTotal,
  );

  const docId = `${competition.id}_${player.id}`;

  /** @type {import('../types/fantasy').PlayerCache} */
  const doc = {
    id:            player.id    ?? 0,
    name:          player.name  ?? 'Unknown',
    shortName:     (player.name ?? 'Unknown').split(' ').pop() ?? 'Unknown',
    position,
    club:          stats.team?.name ?? '',
    clubId:        stats.team?.id   ?? 0,
    clubLogo:      stats.team?.logo ?? null,
    competition:   competition.name,
    competitionId: competition.id,
    currentPrice:  priceFromPoints(totalPoints),
    totalPoints,
    photo:         player.photo ?? null,
    injured:       player.injured ?? false,
    nationality:   player.nationality ?? null,
    age:           player.age ?? null,
    // Raw stats stored for debugging / price recalculation
    _stats: {
      appearances,
      goals:       goalsTotal,
      assists:     assistsTotal,
      cleanSheets,
      saves:       savesTotal,
      rating:      parseFloat(games.rating ?? '0') || 0,
    },
    cachedAt: Date.now(),
  };

  return { docId, doc };
}

/**
 * Write an array of PlayerCache docs to Firestore using batched writes.
 * Firestore limits 500 ops per batch.
 */
async function writeBatch(docsToWrite) {
  const BATCH_SIZE = 499; // leave 1 slot of headroom
  let written = 0;

  for (let i = 0; i < docsToWrite.length; i += BATCH_SIZE) {
    const chunk = docsToWrite.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const { docId, doc } of chunk) {
      const ref = db.collection(PLAYERS_COLLECTION).doc(docId);
      batch.set(ref, doc); // overwrites fully on each run — prices stay fresh
    }

    await batch.commit();
    written += chunk.length;
    console.log(`    ✓ Wrote batch of ${chunk.length} (total so far: ${written})`);
  }

  return written;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const season = currentSeason();
  console.log(`\n🚀  Sideline player seed — season ${season}`);
  if (dryRun) console.log('   DRY RUN — no Firestore writes\n');

  let grandTotal = 0;

  for (const competition of competitions) {
    console.log(`\n── ${competition.name} ─────────────────────────`);

    let entries;
    try {
      entries = await fetchAllPlayers(competition, season);
    } catch (err) {
      console.error(`  ❌  Failed to fetch ${competition.name}: ${err.message}`);
      continue;
    }

    if (entries.length === 0) {
      console.log('  ⚠️  No players returned — skipping write');
      continue;
    }

    // Map all entries, skip any with missing player id
    const mapped = entries
      .map((e) => mapToPlayerCache(e, competition))
      .filter(({ doc }) => doc.id !== 0);

    // Deduplicate by docId (API can return duplicates across pages)
    const seen   = new Set();
    const unique = mapped.filter(({ docId }) => {
      if (seen.has(docId)) return false;
      seen.add(docId);
      return true;
    });

    console.log(`  Mapped ${unique.length} unique players`);

    // Position breakdown
    const breakdown = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const { doc } of unique) breakdown[doc.position]++;
    console.log(`  Positions: GK=${breakdown.GK} DEF=${breakdown.DEF} MID=${breakdown.MID} FWD=${breakdown.FWD}`);

    if (dryRun) {
      console.log('  [dry-run] Skipping Firestore write');
      const sample = unique.slice(0, 3);
      console.log('  Sample docs:');
      for (const { docId, doc } of sample) {
        console.log(`    ${docId}: ${doc.name} | ${doc.position} | ${doc.club} | £${doc.currentPrice}m | ${doc.totalPoints}pts`);
      }
    } else {
      console.log('  Writing to Firestore…');
      const written = await writeBatch(unique);
      console.log(`  ✅  ${written} players written for ${competition.name}`);
      grandTotal += written;
    }
  }

  console.log(`\n✅  Done. Total players written: ${dryRun ? '(dry-run)' : grandTotal}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌  Fatal error:', err);
  process.exit(1);
});
