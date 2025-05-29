
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { getPerformance, type Performance } from 'firebase/performance';

const firebaseConfig = {
  apiKey: "AIzaSyDOe9hcAEkCrZFO4rRVBkFG7ix-Rhquqks",
  authDomain: "chitchatconnect-aqa0w.firebaseapp.com",
  projectId: "chitchatconnect-aqa0w",
  storageBucket: "chitchatconnect-aqa0w.firebasestorage.app",
  messagingSenderId: "638800277531",
  appId: "1:638800277531:web:70eb0af9754f438abd88be",
  measurementId: "G-DQL2418LY4"
};

let app: FirebaseApp;
let analytics: Analytics | null = null;
let perf: Performance | null = null;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Analytics and Performance only on the client side and if supported
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
      perf = getPerformance(app); // Initialize Performance Monitoring
    }
  });
}

export { app, analytics, perf };
