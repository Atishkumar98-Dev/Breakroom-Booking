import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDTodny9z8O-lHyoRKeiX-_kyDXFXB8aJI",
  authDomain: "bookingbreakroom.firebaseapp.com",
  projectId: "bookingbreakroom",
  storageBucket: "bookingbreakroom.firebasestorage.app",
  messagingSenderId: "591614829773",
  appId: "1:591614829773:web:781cf857d489de89d83584",
  measurementId: "G-2YPJMJY54G"
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

const app = isFirebaseConfigured
  ? getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0]
  : null;

export const db = app ? getFirestore(app) : null;
