import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDgMIgJuzaSyBbDNdhsyp7hS12frhVHiZ0",
  authDomain: "sideline-d0cde.firebaseapp.com",
  projectId: "sideline-d0cde",
  storageBucket: "sideline-d0cde.firebasestorage.app",
  messagingSenderId: "401248947837",
  appId: "1:401248947837:web:1f8d2087b9c9a1d5236b14",
  databaseURL: "https://sideline-d0cde-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);