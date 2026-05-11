/**
 * functions/src/updateTeamPoints.ts
 *
 * Triggered automatically when a `playerScores/{gameweekKey}` summary document
 * is created by calculateGameweekScores.  Also exported as a callable for
 * manual re-runs.
 *
 * For each gameweek completion it:
 *   1. Merges pointsMaps from ALL competitions' playerScores docs for that round,
 *      so cross-competition squads (e.g. EPL + La Liga players) score correctly.
 *   2. Reads every fantasyTeam, scores it (captain ×2, VC ×1.5), computes delta
 *      against the team's previously stored gameweekPoints for this same round
 *      so re-runs are always idempotent.
 *   3. Batch-writes in a single logical operation (chunked at 499 to respect
 *      Firestore's 500-op limit):
 *        • fantasyTeams/{teamId}                 — gameweekPoints, totalPoints, lastGameweekKey
 *        • fantasyLeagueMembers/{leagueId}_{uid} — lastGameweekPoints, totalPoints, previousRank, rank
 *        • fantasyLeagues/{leagueId}             — standings map (snapshot for fast UI reads)
 */

import * as admin from 'firebase-admin';

// ─── Shared types (mirrors fantasyService.ts shapes) ─────────────────────────

interface StoredPlayer {
  id: number;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
}

interface FantasyTeamDoc {
  id: string;              // {userId}_{leagueId}
  userId: string;
  leagueId: string;
  teamName: string;
  players: StoredPlayer[];
  captain: number;         // player id
  viceCaptain: number;     // player id
  totalPoints: number;
  gameweekPoints: number;
  lastGameweekKey?: string; // which round those gameweekPoints were for
}

interface LeagueMemberDoc {
  leagueId: string;
  userId: string;
  username: string;
  teamName: string;
  totalPoints: number;
  lastGameweekPoints: number;
  rank: number;
  previousRank: number;
  joinedAt: string;
}

// ─── Merge pointsMaps for a round ────────────────────────────────────────────

/**
 * Query every playerScores summary document that matches `roundNumber + season`
 * and merge their `pointsMap` objects into a single Record<playerId, points>.
 * This handles multi-competition squads correctly.
 */
async function mergeRoundScores(
  roundNumber: number,
  season: number,
  db: admin.firestore.Firestore,
): Promise<Record<string, number>> {
  const snap = await db
    .collection('playerScores')
    .where('roundNumber', '==', roundNumber)
    .where('season', '==', season)
    .get();

  const merged: Record<string, number> = {};
  for (const doc of snap.docs) {
    const map = (doc.data().pointsMap ?? {}) as Record<string, number>;
    for (const [playerId, pts] of Object.entries(map)) {
      // A player can appear in multiple competitions (e.g. UCL + domestic).
      // Take the higher score for that round — don't double-count.
      merged[playerId] = Math.max(merged[playerId] ?? 0, pts);
    }
  }
  return merged;
}

// ─── Score a single team ──────────────────────────────────────────────────────

function scoreTeam(
  team: FantasyTeamDoc,
  pointsMap: Record<string, number>,
): number {
  let total = 0;
  for (const player of team.players) {
    const raw = pointsMap[String(player.id)] ?? 0;
    if (player.id === team.captain) {
      total += raw * 2;          // captain ×2
    } else if (player.id === team.viceCaptain) {
      total += raw * 1.5;        // vice-captain ×1.5
    } else {
      total += raw;
    }
  }
  // Round to 1 decimal place (matches the scoring engine precision)
  return Math.round(total * 10) / 10;
}

// ─── Batch-write helper ───────────────────────────────────────────────────────

/**
 * Commit an array of { ref, data, merge? } write descriptors in chunks of 499.
 * Returns the total number of documents written.
 */
async function commitInBatches(
  writes: Array<{
    ref: admin.firestore.DocumentReference;
    data: Record<string, unknown>;
    merge?: boolean;
  }>,
  db: admin.firestore.Firestore,
): Promise<number> {
  const CHUNK = 499;
  let written = 0;

  for (let i = 0; i < writes.length; i += CHUNK) {
    const chunk = writes.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const w of chunk) {
      if (w.merge) {
        batch.set(w.ref, w.data, { merge: true });
      } else {
        batch.update(w.ref, w.data);
      }
    }
    await batch.commit();
    written += chunk.length;
    console.log(`  batch committed: ${chunk.length} ops (total: ${written}/${writes.length})`);
  }
  return written;
}

// ─── Main runner ─────────────────────────────────────────────────────────────

export interface UpdateTeamPointsResult {
  gameweekKey: string;
  teamsUpdated: number;
  leagueMembersUpdated: number;
  leaguesUpdated: number;
}

export async function runUpdateTeamPoints(
  roundNumber: number,
  season: number,
  gameweekKey: string,
  db: admin.firestore.Firestore,
): Promise<UpdateTeamPointsResult> {
  console.log(`[updateTeamPoints] round=${roundNumber} season=${season} key=${gameweekKey}`);

  // ── Step 1: Merge all competition pointsMaps for this round ───────────────
  const pointsMap = await mergeRoundScores(roundNumber, season, db);
  const playerCount = Object.keys(pointsMap).length;
  console.log(`  Merged ${playerCount} player scores from all competitions`);

  // ── Step 2: Load all fantasy teams ────────────────────────────────────────
  const teamsSnap = await db.collection('fantasyTeams').get();
  if (teamsSnap.empty) {
    console.log('  No fantasy teams found — exiting');
    return { gameweekKey, teamsUpdated: 0, leagueMembersUpdated: 0, leaguesUpdated: 0 };
  }
  console.log(`  Found ${teamsSnap.size} team(s)`);

  // ── Step 3: Score each team and compute totalPoints delta ─────────────────
  //
  // Idempotency: if a team's lastGameweekKey already equals the current key,
  // the previous gameweekPoints for this round are already baked into totalPoints.
  // We subtract the old value and add the new one (delta).  On first run the
  // old value is 0 (different key), so delta = newGwPts.

  type TeamUpdate = {
    teamId: string;
    userId: string;
    leagueId: string;
    teamName: string;
    newGwPoints: number;
    newTotalPoints: number;
  };

  const teamUpdates: TeamUpdate[] = [];

  for (const doc of teamsSnap.docs) {
    const team = doc.data() as FantasyTeamDoc;
    if (!team.userId || !team.leagueId || !Array.isArray(team.players)) continue;

    const newGwPoints  = scoreTeam(team, pointsMap);
    const prevGwPoints = team.lastGameweekKey === gameweekKey
      ? (team.gameweekPoints ?? 0)   // same round re-run: subtract old value
      : 0;                           // new round: no prior value to subtract

    const prevTotal      = team.totalPoints    ?? 0;
    const newTotalPoints = Math.round(
      (prevTotal - prevGwPoints + newGwPoints) * 10,
    ) / 10;

    teamUpdates.push({
      teamId:         doc.id,
      userId:         team.userId,
      leagueId:       team.leagueId,
      teamName:       team.teamName ?? 'My Team',
      newGwPoints,
      newTotalPoints,
    });
  }

  // ── Step 4: Group by league, compute ranks ────────────────────────────────
  //
  // Load current member docs for all affected leagues in one query batch
  // so we have their usernames, joinedAt, and currentRank (→ previousRank).

  const affectedLeagueIds = [...new Set(teamUpdates.map((u) => u.leagueId))];

  // Firestore 'in' max 30 per query; chunk if needed
  const membersByLeague = new Map<string, Map<string, LeagueMemberDoc>>();

  for (let i = 0; i < affectedLeagueIds.length; i += 30) {
    const chunk = affectedLeagueIds.slice(i, i + 30);
    const snap  = await db
      .collection('fantasyLeagueMembers')
      .where('leagueId', 'in', chunk)
      .get();
    for (const doc of snap.docs) {
      const m = doc.data() as LeagueMemberDoc;
      if (!membersByLeague.has(m.leagueId)) {
        membersByLeague.set(m.leagueId, new Map());
      }
      membersByLeague.get(m.leagueId)!.set(m.userId, m);
    }
  }

  // Group team updates by league and sort descending by new total → assign ranks
  const byLeague = new Map<string, TeamUpdate[]>();
  for (const u of teamUpdates) {
    if (!byLeague.has(u.leagueId)) byLeague.set(u.leagueId, []);
    byLeague.get(u.leagueId)!.push(u);
  }

  type MemberWrite = {
    memberId: string;
    userId: string;
    leagueId: string;
    teamName: string;
    username: string;
    lastGameweekPoints: number;
    totalPoints: number;
    rank: number;
    previousRank: number;
    newGwPoints: number;
  };

  const memberWrites: MemberWrite[] = [];
  // standings snapshot keyed by leagueId → array (sorted, top 100)
  const leagueStandings = new Map<string, MemberWrite[]>();

  for (const [leagueId, updates] of byLeague) {
    // Sort by new total descending to assign ranks
    updates.sort((a, b) => b.newTotalPoints - a.newTotalPoints);

    const leagueMembers = membersByLeague.get(leagueId) ?? new Map<string, LeagueMemberDoc>();

    const standingsForLeague: MemberWrite[] = [];

    for (let rank = 0; rank < updates.length; rank++) {
      const u          = updates[rank];
      const existing   = leagueMembers.get(u.userId);
      const username   = existing?.username ?? u.userId;
      const prevRank   = existing?.rank ?? rank + 1;

      const mw: MemberWrite = {
        memberId:           `${leagueId}_${u.userId}`,
        userId:             u.userId,
        leagueId,
        teamName:           u.teamName,
        username,
        lastGameweekPoints: u.newGwPoints,
        totalPoints:        u.newTotalPoints,
        rank:               rank + 1,
        previousRank:       prevRank,
        newGwPoints:        u.newGwPoints,
      };

      memberWrites.push(mw);
      standingsForLeague.push(mw);
    }

    leagueStandings.set(leagueId, standingsForLeague);
  }

  // ── Step 5: Build the single logical batch of writes ─────────────────────
  //
  // Order:
  //   A. fantasyTeams/{teamId}                    — gameweekPoints, totalPoints
  //   B. fantasyLeagueMembers/{leagueId}_{userId} — points, rank
  //   C. fantasyLeagues/{leagueId}                — standings snapshot

  const writes: Array<{
    ref: admin.firestore.DocumentReference;
    data: Record<string, unknown>;
    merge?: boolean;
  }> = [];

  // A. Team docs
  for (const u of teamUpdates) {
    writes.push({
      ref:  db.collection('fantasyTeams').doc(u.teamId),
      data: {
        gameweekPoints:   u.newGwPoints,
        totalPoints:      u.newTotalPoints,
        lastGameweekKey:  gameweekKey,
        updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
      },
      merge: true,
    });
  }

  // B. LeagueMember docs (upsert — member doc may not exist if league was created mid-season)
  for (const m of memberWrites) {
    writes.push({
      ref:  db.collection('fantasyLeagueMembers').doc(m.memberId),
      data: {
        leagueId:           m.leagueId,
        userId:             m.userId,
        username:           m.username,
        teamName:           m.teamName,
        lastGameweekPoints: m.lastGameweekPoints,
        totalPoints:        m.totalPoints,
        rank:               m.rank,
        previousRank:       m.previousRank,
        lastScoredAt:       admin.firestore.FieldValue.serverTimestamp(),
      },
      merge: true,
    });
  }

  // C. League standings snapshot (embedded map on fantasyLeagues doc)
  for (const [leagueId, standings] of leagueStandings) {
    // Build a compact standings map: userId → { rank, totalPoints, gwPoints, teamName }
    const standingsMap: Record<string, {
      rank: number;
      previousRank: number;
      totalPoints: number;
      gameweekPoints: number;
      teamName: string;
      username: string;
    }> = {};

    for (const s of standings) {
      standingsMap[s.userId] = {
        rank:           s.rank,
        previousRank:   s.previousRank,
        totalPoints:    s.totalPoints,
        gameweekPoints: s.newGwPoints,
        teamName:       s.teamName,
        username:       s.username,
      };
    }

    writes.push({
      ref:  db.collection('fantasyLeagues').doc(leagueId),
      data: {
        standings:    standingsMap,
        lastScoredAt: admin.firestore.FieldValue.serverTimestamp(),
        currentGameweek: roundNumber,
      },
      merge: true,
    });
  }

  // ── Step 6: Commit all writes ─────────────────────────────────────────────
  console.log(`  Writing ${writes.length} docs across teams / members / leagues…`);
  const totalWritten = await commitInBatches(writes, db);

  const result: UpdateTeamPointsResult = {
    gameweekKey,
    teamsUpdated:        teamUpdates.length,
    leagueMembersUpdated: memberWrites.length,
    leaguesUpdated:      leagueStandings.size,
  };

  console.log(
    `[updateTeamPoints] Done — ` +
    `${result.teamsUpdated} teams, ` +
    `${result.leagueMembersUpdated} members, ` +
    `${result.leaguesUpdated} leagues, ` +
    `${totalWritten} total writes`,
  );

  return result;
}
