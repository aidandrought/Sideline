"use strict";
/**
 * functions/src/fantasyMessaging.ts
 *
 * RTDB-triggered Cloud Function handler for chat push notifications.
 * The onValueCreated wrapper lives in index.ts.
 *
 * runOnMessageCreated — sends FCM push notifications when a new chat message is created.
 *
 * Flow:
 *   1. Read sender uid + message body from the RTDB snapshot
 *   2. Find users active in this chat from RTDB presence (last 90 minutes)
 *   3. Exclude the sender and users who currently have this chat open
 *   4. Rate-limit: skip users notified within the last 5 minutes (Firestore transaction)
 *   5. Fetch FCM tokens from Firestore users/{uid}.fcmTokens
 *   6. Send multicast push via admin.messaging().sendEachForMulticast()
 *   7. Remove stale/invalid tokens from Firestore
 */
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
exports.runOnMessageCreated = runOnMessageCreated;
const admin = __importStar(require("firebase-admin"));
// ─── Constants ────────────────────────────────────────────────────────────────
const PRESENCE_ACTIVE_MS = 90 * 60 * 1000; // 90 minutes
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
const MESSAGE_PREVIEW_LEN = 60;
// ─── Main handler ─────────────────────────────────────────────────────────────
async function runOnMessageCreated(event, db, messaging) {
    const { chatId, msgId } = event.params;
    const messageData = (event.data.val() ?? {});
    const senderId = messageData.senderId ?? '';
    const senderName = messageData.senderName ?? 'Someone';
    const text = messageData.text ?? '';
    if (!senderId) {
        console.warn(`[onMessageCreated] chatId=${chatId} msgId=${msgId} — missing senderId, skipping`);
        return;
    }
    // ── Step 1: Read presence for this chat from RTDB ─────────────────────────
    const rtdb = admin.database();
    const presenceSnap = await rtdb.ref(`presence/chats/${chatId}`).once('value');
    const presenceVal = presenceSnap.val();
    if (!presenceVal) {
        console.log(`[onMessageCreated] chatId=${chatId} — no presence data, no notifications to send`);
        return;
    }
    const nowMs = Date.now();
    // ── Step 2: Build candidate recipient list ────────────────────────────────
    // Exclude: sender, users not active in last 90min, users currently in this chat
    const candidates = [];
    for (const [uid, entry] of Object.entries(presenceVal)) {
        if (uid === senderId)
            continue;
        if (!entry)
            continue;
        const lastSeen = entry.lastSeenAt ?? 0;
        if (nowMs - lastSeen > PRESENCE_ACTIVE_MS)
            continue;
        // Skip users who have this chat open right now
        if (entry.openChatId === chatId)
            continue;
        candidates.push(uid);
    }
    if (candidates.length === 0)
        return;
    // ── Step 3: Rate-limit check via Firestore ────────────────────────────────
    const eligibleUids = [];
    await Promise.allSettled(candidates.map(async (uid) => {
        const limitRef = db.collection('notificationLimits').doc(`${uid}_${chatId}`);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(limitRef);
                const data = snap.data();
                const lastSentAt = data?.lastSentAt?.toMillis?.() ?? 0;
                if (nowMs - lastSentAt < RATE_LIMIT_MS) {
                    // Rate limited — skip
                    return;
                }
                tx.set(limitRef, { lastSentAt: admin.firestore.FieldValue.serverTimestamp(), uid, chatId }, { merge: true });
                eligibleUids.push(uid);
            });
        }
        catch (err) {
            console.warn(`[onMessageCreated] rate-limit check failed for uid=${uid}:`, err);
            // On error, allow the notification as a safe default
            eligibleUids.push(uid);
        }
    }));
    if (eligibleUids.length === 0)
        return;
    // ── Step 4: Fetch FCM tokens from Firestore ───────────────────────────────
    const userSnaps = await db.getAll(...eligibleUids.map((uid) => db.collection('users').doc(uid)));
    // Map uid → tokens
    const uidTokenMap = new Map();
    for (const snap of userSnaps) {
        if (!snap.exists)
            continue;
        const tokens = snap.data()?.fcmTokens ?? [];
        const validTokens = tokens.filter((t) => typeof t === 'string' && t.length > 0);
        if (validTokens.length > 0) {
            uidTokenMap.set(snap.id, validTokens);
        }
    }
    if (uidTokenMap.size === 0)
        return;
    // Flatten all tokens (deduped) and remember uid→token mapping for stale-token cleanup
    const tokenToUid = new Map();
    for (const [uid, tokens] of uidTokenMap.entries()) {
        for (const token of tokens) {
            tokenToUid.set(token, uid);
        }
    }
    const allTokens = [...tokenToUid.keys()];
    if (allTokens.length === 0)
        return;
    // ── Step 5: Build notification payload ───────────────────────────────────
    const matchTitle = chatId.replace(/_/g, ' vs ');
    const bodyPreview = text.slice(0, MESSAGE_PREVIEW_LEN);
    const body = `${senderName}: ${bodyPreview}`;
    const message = {
        tokens: allTokens,
        notification: {
            title: `⚽ ${matchTitle}`,
            body,
        },
        data: {
            type: 'chat',
            deepLink: `sideline://chat/${chatId}`,
            chatId,
        },
        android: {
            priority: 'high',
            collapseKey: chatId,
        },
        apns: {
            headers: {
                'apns-collapse-id': chatId,
                'apns-priority': '10',
            },
            payload: {
                aps: {
                    sound: 'default',
                    threadId: chatId,
                },
            },
        },
    };
    // ── Step 6: Send and collect failures ────────────────────────────────────
    let sendResponse;
    try {
        sendResponse = await messaging.sendEachForMulticast(message);
    }
    catch (err) {
        console.error('[onMessageCreated] sendEachForMulticast error:', err);
        return;
    }
    console.log(`[onMessageCreated] chatId=${chatId} — sent=${sendResponse.successCount} failed=${sendResponse.failureCount}`);
    // ── Step 7: Remove invalid/stale tokens ──────────────────────────────────
    const staleTokensByUid = new Map();
    sendResponse.responses.forEach((response, index) => {
        if (!response.success && response.error) {
            const code = response.error.code;
            if (code === 'messaging/registration-token-not-registered' ||
                code === 'messaging/invalid-registration-token') {
                const token = allTokens[index];
                const uid = tokenToUid.get(token);
                if (uid) {
                    const existing = staleTokensByUid.get(uid) ?? [];
                    existing.push(token);
                    staleTokensByUid.set(uid, existing);
                }
            }
        }
    });
    if (staleTokensByUid.size > 0) {
        await Promise.allSettled([...staleTokensByUid.entries()].map(async ([uid, staleTokens]) => {
            await db.collection('users').doc(uid).update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...staleTokens),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }));
        console.log(`[onMessageCreated] Removed stale tokens for ${staleTokensByUid.size} user(s)`);
    }
}
//# sourceMappingURL=fantasyMessaging.js.map