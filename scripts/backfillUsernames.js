/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const normalizeUsernameKey = (value) => String(value || '').trim().toLowerCase();
const normalizePhoneKey = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(value || '').trim().startsWith('+')) return `+${digits}`;
  return digits;
};

const run = async () => {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS must be set to your Firebase service-account JSON path.');
  }

  const resolvedPath = path.isAbsolute(serviceAccountPath)
    ? serviceAccountPath
    : path.resolve(process.cwd(), serviceAccountPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Service account file not found: ${resolvedPath}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }

  const db = getFirestore();
  const usersSnap = await db.collection('users').get();
  let processed = 0;
  let indexed = 0;
  let updatedProfiles = 0;
  let skippedNoUsername = 0;
  let conflicts = 0;
  let phoneIndexed = 0;

  for (const userDoc of usersSnap.docs) {
    processed += 1;
    const userId = userDoc.id;
    const data = userDoc.data() || {};
    const username = String(data.username || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const phoneKey = normalizePhoneKey(data.phone || '');
    if (!username) {
      skippedNoUsername += 1;
      continue;
    }

    const usernameKey = normalizeUsernameKey(username);
    if (!usernameKey) {
      skippedNoUsername += 1;
      continue;
    }

    const usernameRef = db.collection('usernames').doc(usernameKey);
    const existing = await usernameRef.get();
    if (existing.exists) {
      const existingUid = String(existing.get('uid') || '');
      if (existingUid && existingUid !== userId) {
        conflicts += 1;
        console.warn(
          `Conflict for "${username}" (${usernameKey}): users/${userId} vs users/${existingUid}. Kept existing mapping.`
        );
        continue;
      }
    }

    const now = new Date().toISOString();
    await usernameRef.set(
      {
        uid: userId,
        username,
        usernameKey,
        email,
        updatedAt: now,
        createdAt: existing.exists ? existing.get('createdAt') || now : now,
        backfilledAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    indexed += 1;

    if (data.usernameKey !== usernameKey) {
      await userDoc.ref.set(
        {
          usernameKey,
          updatedAt: now,
        },
        { merge: true }
      );
      updatedProfiles += 1;
    }

    if (phoneKey && email) {
      await db.collection('phoneLookup').doc(phoneKey).set(
        {
          uid: userId,
          phone: phoneKey,
          email,
          updatedAt: now,
          createdAt: now,
          backfilledAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      phoneIndexed += 1;
    }
  }

  console.log('Backfill complete:');
  console.log(`- users scanned: ${processed}`);
  console.log(`- usernames indexed: ${indexed}`);
  console.log(`- user profiles updated with usernameKey: ${updatedProfiles}`);
  console.log(`- skipped (no username): ${skippedNoUsername}`);
  console.log(`- conflicts: ${conflicts}`);
  console.log(`- phone lookups indexed: ${phoneIndexed}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
