// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, setLogLevel } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBNQvKzBatbf3RiiZZGZ5PP1RHyTY3-Ut0",
  authDomain: "oop-project-6e62a.firebaseapp.com",
  projectId: "oop-project-6e62a",
  storageBucket: "oop-project-6e62a.appspot.com",
  messagingSenderId: "130989756801",
  appId: "1:130989756801:web:a5633c446771ccdd0f5880",
  measurementId: "G-ZZCXNCQPW8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

// Enable Firestore logging for debugging
setLogLevel('debug');

// Sign in with Google
const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    throw error;
  }
};

// Sign out
const handleSignOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign out error:", error);
    throw error;
  }
};

export { app, db, auth, storage, onAuthStateChanged, signInWithGoogle, handleSignOut };