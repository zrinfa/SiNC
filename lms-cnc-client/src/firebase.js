// =============================================================
// firebase.js - Konfigurasi dan inisialisasi Firebase
// (Auth, Firestore, Storage) untuk LMS Simulator CNC
// =============================================================
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updatePassword,
  updateProfile
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyCGXAjqS-3NpKYWCEsm9Kr0394Idh--tsY",
  authDomain: "sinc-cnc-lms.firebaseapp.com",
  projectId: "sinc-cnc-lms",
  storageBucket: "sinc-cnc-lms.firebasestorage.app",
  messagingSenderId: "668765107340",
  appId: "1:668765107340:web:9deb86c23643eb2ae8b7a9"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
