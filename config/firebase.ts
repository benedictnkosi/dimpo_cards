console.log('[ENTRY] config/firebase.ts loaded');
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDpVqgaZkSkVPar6Rc_tUkSf_Sd2tGm13c",
  authDomain: "dimpo-cards.firebaseapp.com",
  projectId: "dimpo-cards",
  storageBucket: "dimpo-cards.firebasestorage.app",
  messagingSenderId: "203541341379",
  appId: "1:203541341379:web:83b51c2e583dbb9fb32e76",
  measurementId: "G-591CJFHP1S"
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}
console.log("Firebase App initialized:", app.name);

// Initialize Auth with React Native persistence
const auth = getAuth(app);

// Initialize Firestore
const db = getFirestore(app);
export const storage = getStorage(app);

export { app, auth, db, firebaseConfig }; 