import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    createUserWithEmailAndPassword,
    deleteUser,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    User
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../config/firebase';

export interface UserProfile {
uid: string;
username: string;
usernameKey?: string;
email: string;
phone?: string;
photoURL?: string;
followedTeams: string[];
followedLeagues: string[];
feedTeams?: string[];
feedLeagues?: string[];
notificationTeams?: string[];
notificationLeagues?: string[];
onboardingCompleted?: boolean;
language?: string;
themePreference?: 'system' | 'light' | 'dark';
location?: {
countryCode?: string;
region?: string;
city?: string;
label?: string;
};
createdAt: string;
legalConsent?: {
termsAcceptedAt: string;
privacyAcceptedAt: string;
termsVersion: string;
privacyVersion: string;
};
}

interface AuthContextType {
user: User | null;
userProfile: UserProfile | null;
loading: boolean;
signup: (
email: string,
password: string,
username: string,
phone?: string,
legalConsent?: UserProfile['legalConsent']
) => Promise<void>;
login: (email: string, password: string) => Promise<void>;
logout: () => Promise<void>;
deleteAccount: () => Promise<void>;
updateUserProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const LEGAL_VERSION = '2026-03-02';
const RECENT_LOGIN_WINDOW_MS = 10 * 60 * 1000;
const USER_PROFILE_STORAGE_KEY = 'auth:userProfile';
const normalizeUsernameKey = (value: string) => value.trim().toLowerCase();
const normalizePhoneKey = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (value.trim().startsWith('+')) return `+${digits}`;
  return digits;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
const [user, setUser] = useState<User | null>(null);
const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
const [loading, setLoading] = useState(true);

const readCachedUserProfile = async (): Promise<UserProfile | null> => {
  try {
    const raw = await AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
};

const persistCachedUserProfile = async (profile: UserProfile | null) => {
  try {
    if (!profile) {
      await AsyncStorage.removeItem(USER_PROFILE_STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore cache persistence failures.
  }
};

useEffect(() => {
const unsubscribe = onAuthStateChanged(auth, async (user) => {
setUser(user);
if (user) {
  // Always show cached profile immediately while Firestore loads
  const cachedProfile = await readCachedUserProfile();
  if (cachedProfile?.uid === user.uid) {
    setUserProfile(cachedProfile);
  }
  setLoading(false); // unblock navigation as soon as we have any identity signal

  // Refresh from Firestore in background — never wipe the cache if it fails
  try {
    const profileDoc = await getDoc(doc(db, 'users', user.uid));
    if (profileDoc.exists()) {
      const freshProfile = profileDoc.data() as UserProfile;
      setUserProfile(freshProfile);
      await persistCachedUserProfile(freshProfile);
    } else if (!cachedProfile || cachedProfile.uid !== user.uid) {
      // Genuinely no profile (new account mid-setup) — only clear if no valid cache
      setUserProfile(null);
      await persistCachedUserProfile(null);
    }
    // If profileDoc doesn't exist but we have a valid cache, keep showing the cache
    // (Firestore might be temporarily unavailable)
  } catch {
    // Network/permission error — stay logged in with whatever we have
  }
} else {
  setUserProfile(null);
  await persistCachedUserProfile(null);
  setLoading(false);
}
});

return unsubscribe;
}, []);

const signup = async (
email: string,
password: string,
username: string,
phone?: string,
legalConsent?: UserProfile['legalConsent']
) => {
const usernameTrimmed = username.trim();
const usernameKey = normalizeUsernameKey(usernameTrimmed);
const phoneKey = phone ? normalizePhoneKey(phone) : '';
let createdUser: User | null = null;
try {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  createdUser = userCredential.user;
  const nowIso = new Date().toISOString();
  const usernameRef = doc(db, 'usernames', usernameKey);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(usernameRef);
    if (existing.exists()) {
      const err = new Error('Username is already taken');
      (err as any).code = 'username-taken';
      throw err;
    }
    tx.set(usernameRef, {
      uid: userCredential.user.uid,
      username: usernameTrimmed,
      usernameKey,
      email: email.trim().toLowerCase(),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    if (phoneKey) {
      tx.set(doc(db, 'phoneLookup', phoneKey), {
        uid: userCredential.user.uid,
        phone: phoneKey,
        email: email.trim().toLowerCase(),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  });

  const profile: UserProfile = {
    uid: userCredential.user.uid,
    username: usernameTrimmed,
    usernameKey,
    email,
    phone,
    followedTeams: [],
    followedLeagues: [],
    feedTeams: [],
    feedLeagues: [],
    notificationTeams: [],
    notificationLeagues: [],
    onboardingCompleted: false,
    language: 'en',
    themePreference: 'system',
    createdAt: nowIso,
    legalConsent: legalConsent || {
      termsAcceptedAt: nowIso,
      privacyAcceptedAt: nowIso,
      termsVersion: LEGAL_VERSION,
      privacyVersion: LEGAL_VERSION,
    }
  };
  await setDoc(doc(db, 'users', userCredential.user.uid), profile);
  setUserProfile(profile);
  await persistCachedUserProfile(profile);
} catch (error) {
  console.error('[auth] signup failed', {
    code: (error as any)?.code ?? null,
    message: (error as any)?.message ?? null,
    email: email?.trim?.().toLowerCase?.() ?? email,
    usernameKey,
    hasPhone: Boolean(phoneKey),
    createdUser: Boolean(createdUser),
  });
  if (createdUser) {
    const usernameRef = doc(db, 'usernames', usernameKey);
    try {
      await deleteDoc(usernameRef);
    } catch {}
    if (phoneKey) {
      try {
        await deleteDoc(doc(db, 'phoneLookup', phoneKey));
      } catch {}
    }
    try {
      await deleteUser(createdUser);
    } catch {}
  }
  throw error;
}
};

const resolveLoginEmail = async (identifier: string) => {
const raw = identifier.trim();
if (!raw) return '';
if (raw.includes('@')) return raw.toLowerCase();

const usernameSnap = await getDoc(doc(db, 'usernames', normalizeUsernameKey(raw)));
if (usernameSnap.exists()) {
  const mappedEmail = usernameSnap.get('email');
  if (typeof mappedEmail === 'string' && mappedEmail.includes('@')) {
    return mappedEmail.toLowerCase();
  }
}

const phoneKey = normalizePhoneKey(raw);
if (phoneKey) {
  const phoneSnap = await getDoc(doc(db, 'phoneLookup', phoneKey));
  if (phoneSnap.exists()) {
    const mappedEmail = phoneSnap.get('email');
    if (typeof mappedEmail === 'string' && mappedEmail.includes('@')) {
      return mappedEmail.toLowerCase();
    }
  }
}

const err = new Error('No account found with that username, email, or phone number.');
(err as any).code = 'auth/user-not-found';
throw err;
};

const login = async (identifier: string, password: string) => {
const resolvedEmail = await resolveLoginEmail(identifier);
await signInWithEmailAndPassword(auth, resolvedEmail, password);
};

const logout = async () => {
await signOut(auth);
await persistCachedUserProfile(null);
};

const ensureRecentlySignedIn = (currentUser: User) => {
  const lastSignInTime = currentUser.metadata.lastSignInTime
    ? new Date(currentUser.metadata.lastSignInTime).getTime()
    : Number.NaN;
  if (!Number.isFinite(lastSignInTime)) return;
  if (Date.now() - lastSignInTime > RECENT_LOGIN_WINDOW_MS) {
    const err = new Error('For security, sign in again before deleting your account.');
    (err as any).code = 'auth/requires-recent-login';
    throw err;
  }
};

const deleteLookupIfOwned = async (collectionName: 'usernames' | 'phoneLookup', key: string, uid: string) => {
  if (!key) return;
  const ref = doc(db, collectionName, key);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  if (snap.get('uid') !== uid) return;
  await deleteDoc(ref);
};

const deleteAccount = async () => {
if (!user || !userProfile) return;
try {
  ensureRecentlySignedIn(user);
  await deleteLookupIfOwned('usernames', normalizeUsernameKey(userProfile.username || ''), user.uid);
  await deleteLookupIfOwned('phoneLookup', normalizePhoneKey(userProfile.phone || ''), user.uid);
  await deleteDoc(doc(db, 'userCommunities', user.uid));
  await deleteDoc(doc(db, 'users', user.uid));
  await deleteUser(user);
  setUser(null);
  setUserProfile(null);
  await persistCachedUserProfile(null);
} catch (error) {
  console.error('Failed to delete account:', error);
  throw error;
}
};

const updateUserProfile = async (updates: Partial<UserProfile>) => {
if (!user) return;
const updatedProfile = { ...userProfile, ...updates } as UserProfile;
await setDoc(doc(db, 'users', user.uid), updatedProfile, { merge: true });
setUserProfile(updatedProfile);
await persistCachedUserProfile(updatedProfile);
};

return (
<AuthContext.Provider value={{ user, userProfile, loading, signup, login, logout, deleteAccount, updateUserProfile }}>
{children}
</AuthContext.Provider>
);
};

export const useAuth = () => {
const context = useContext(AuthContext);
if (!context) throw new Error('useAuth must be used within AuthProvider');
return context;
};
