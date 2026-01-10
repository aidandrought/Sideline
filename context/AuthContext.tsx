import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    User
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebaseConfig';

interface UserProfile {
uid: string;
username: string;
email: string;
phone?: string;
photoURL?: string;
followedTeams: string[];
followedLeagues: string[];
createdAt: string;
}

interface AuthContextType {
user: User | null;
userProfile: UserProfile | null;
loading: boolean;
signup: (email: string, password: string, username: string, phone?: string) => Promise<void>;
login: (email: string, password: string) => Promise<void>;
logout: () => Promise<void>;
updateUserProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
const [user, setUser] = useState<User | null>(null);
const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
const unsubscribe = onAuthStateChanged(auth, async (user) => {
setUser(user);
if (user) {
const profileDoc = await getDoc(doc(db, 'users', user.uid));
if (profileDoc.exists()) {
setUserProfile(profileDoc.data() as UserProfile);
}
} else {
setUserProfile(null);
}
setLoading(false);
});

return unsubscribe;
}, []);

const signup = async (email: string, password: string, username: string, phone?: string) => {
const userCredential = await createUserWithEmailAndPassword(auth, email, password);
const profile: UserProfile = {
uid: userCredential.user.uid,
username,
email,
phone,
followedTeams: [],
followedLeagues: [],
createdAt: new Date().toISOString()
};
await setDoc(doc(db, 'users', userCredential.user.uid), profile);
setUserProfile(profile);
};

const login = async (email: string, password: string) => {
await signInWithEmailAndPassword(auth, email, password);
};

const logout = async () => {
await signOut(auth);
};

const updateUserProfile = async (updates: Partial<UserProfile>) => {
if (!user) return;
const updatedProfile = { ...userProfile, ...updates } as UserProfile;
await setDoc(doc(db, 'users', user.uid), updatedProfile, { merge: true });
setUserProfile(updatedProfile);
};

return (
<AuthContext.Provider value={{ user, userProfile, loading, signup, login, logout, updateUserProfile }}>
{children}
</AuthContext.Provider>
);
};

export const useAuth = () => {
const context = useContext(AuthContext);
if (!context) throw new Error('useAuth must be used within AuthProvider');
return context;
};