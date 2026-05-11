"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSeedSystemLeagues = runSeedSystemLeagues;
const admin = __importStar(require("firebase-admin"));
const API_BASE = 'https://v3.football.api-sports.io';
const SEED_COMPETITIONS = [
    { key: 'WC', id: 1, name: 'World Cup', group: 'tournament' },
    { key: 'EURO', id: null, name: 'Euro Championship', searchName: 'Euro Championship', group: 'tournament' },
    { key: 'COPA', id: null, name: 'Copa America', searchName: 'Copa America', group: 'tournament' },
    { key: 'UCL', id: 2, name: 'UEFA Champions League', group: 'continental' },
    { key: 'PL', id: 39, name: 'Premier League', group: 'league' },
    { key: 'LL', id: 140, name: 'La Liga', group: 'league' },
    { key: 'BL', id: 78, name: 'Bundesliga', group: 'league' },
    { key: 'SA', id: 135, name: 'Serie A', group: 'league' },
    { key: 'L1', id: 61, name: 'Ligue 1', group: 'league' },
    { key: 'MLS', id: 253, name: 'MLS', group: 'league' },
];
const noLookAlikeCode = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};
const seasonFallback = () => {
    const now = new Date();
    return now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
};
const rulesPreset = (group) => {
    const isTournament = group === 'tournament';
    return {
        competitionPool: [],
        salaryCap: 100,
        maxPerClub: 3,
        squadSize: 15,
        positionRequirements: {
            GK: [1, 1],
            DEF: [3, 5],
            MID: [3, 5],
            FWD: [1, 3],
        },
        tournamentBonus: isTournament,
        chipsEnabled: {
            wildcard: true,
            benchBoost: true,
            tripleCaptain: true,
            freeHit: false,
        },
        gameweekStructure: isTournament ? 'matchday' : 'weekly',
        format: 'overall',
    };
};
async function apiFetch(path, apiKey) {
    if (!apiKey)
        return null;
    const response = await fetch(`${API_BASE}${path}`, {
        headers: { 'x-apisports-key': apiKey },
    });
    if (!response.ok) {
        throw new Error(`API-Football ${response.status} for ${path}`);
    }
    const data = await response.json();
    const errors = data?.errors;
    if (errors && typeof errors === 'object' && Object.keys(errors).length > 0) {
        throw new Error(`API-Football body error for ${path}: ${JSON.stringify(errors)}`);
    }
    return data;
}
function chooseSeason(seasons) {
    const years = (seasons || [])
        .map((season) => season.year)
        .filter((year) => typeof year === 'number')
        .sort((a, b) => b - a);
    return (seasons || []).find((season) => season.current && typeof season.year === 'number')?.year
        ?? years[0]
        ?? seasonFallback();
}
async function resolveCompetition(seed, apiKey) {
    if (seed.id != null) {
        const details = await apiFetch(`/leagues?id=${seed.id}`, apiKey).catch(() => null);
        return {
            ...seed,
            id: seed.id,
            apiSeason: chooseSeason(details?.response?.[0]?.seasons),
            iconUrl: seed.iconUrl || details?.response?.[0]?.league?.logo || `https://media.api-sports.io/football/leagues/${seed.id}.png`,
        };
    }
    const search = encodeURIComponent(seed.searchName || seed.name);
    const data = await apiFetch(`/leagues?search=${search}`, apiKey);
    const normalizedName = seed.name.toLowerCase();
    const candidates = (data?.response || [])
        .map((entry) => {
        const league = entry.league;
        if (!league?.id || !league.name)
            return null;
        const name = league.name.toLowerCase();
        const country = String(entry.country?.name || '').toLowerCase();
        let score = 0;
        if (name === normalizedName)
            score += 8;
        if (name.includes(normalizedName) || normalizedName.includes(name))
            score += 4;
        if (country === 'world')
            score += 3;
        if (String(league.type || '').toLowerCase() === 'cup')
            score += 1;
        return { entry, score };
    })
        .filter((candidate) => Boolean(candidate))
        .sort((a, b) => b.score - a.score);
    const winner = candidates[0]?.entry;
    if (!winner?.league?.id)
        return null;
    return {
        ...seed,
        id: winner.league.id,
        apiSeason: chooseSeason(winner.seasons),
        iconUrl: winner.league.logo || `https://media.api-sports.io/football/leagues/${winner.league.id}.png`,
    };
}
async function createInviteIndex(tx, db, leagueId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = noLookAlikeCode();
        const inviteRef = db.collection('inviteCodes').doc(code);
        const snap = await tx.get(inviteRef);
        if (!snap.exists) {
            tx.set(inviteRef, {
                code,
                leagueId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return code;
        }
    }
    throw new Error('Could not reserve unique invite code');
}
async function runSeedSystemLeagues(db, apiKey) {
    const resolved = [];
    const skipped = [];
    for (const seed of SEED_COMPETITIONS) {
        try {
            const competition = await resolveCompetition(seed, apiKey);
            if (competition) {
                resolved.push(competition);
            }
            else {
                skipped.push(seed.key);
            }
        }
        catch (error) {
            skipped.push(`${seed.key}:${error instanceof Error ? error.message : String(error)}`);
        }
    }
    let seeded = 0;
    let existing = 0;
    const resolvedMap = {};
    for (const competition of resolved) {
        resolvedMap[competition.key] = competition.id;
        await db.runTransaction(async (tx) => {
            const systemRef = db.collection('systemLeagues').doc(String(competition.id));
            const systemSnap = await tx.get(systemRef);
            if (systemSnap.exists) {
                existing += 1;
                tx.set(systemRef, {
                    apiSeason: competition.apiSeason,
                    iconUrl: competition.iconUrl || '',
                    active: true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                return;
            }
            const leagueRef = db.collection('fantasyLeagues').doc();
            const preset = rulesPreset(competition.group);
            preset.competitionPool = [competition.id];
            const inviteCode = await createInviteIndex(tx, db, leagueRef.id);
            tx.set(leagueRef, {
                id: leagueRef.id,
                tier: 'system',
                type: competition.group === 'tournament' ? 'worldcup' : 'global',
                name: competition.name,
                description: `${competition.name} fantasy competition`,
                competitionId: competition.id,
                competitionName: competition.name,
                competitionPool: [competition.id],
                visibility: 'public',
                format: 'overall',
                inviteCode,
                createdBy: 'system',
                ownerId: 'system',
                isPrivate: false,
                memberCount: 0,
                maxMembers: null,
                members: [],
                rulesConfig: preset,
                currentGameweek: 1,
                status: 'pre_season',
                season: String(competition.apiSeason),
                iconUrl: competition.iconUrl || '',
                searchableName: competition.name.toLowerCase(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            tx.set(systemRef, {
                competitionId: competition.id,
                apiSeason: competition.apiSeason,
                fantasyLeagueId: leagueRef.id,
                rulesPreset: competition.group === 'tournament' ? 'tournament' : 'standard',
                iconUrl: competition.iconUrl || '',
                active: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            seeded += 1;
        });
    }
    if (Object.keys(resolvedMap).length > 0) {
        await db.collection('systemConfig').doc('competitionIds').set({
            ...resolvedMap,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    return { seeded, existing, skipped, resolved: resolvedMap };
}
//# sourceMappingURL=systemLeagues.js.map