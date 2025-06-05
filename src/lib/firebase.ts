
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { getPerformance, type Performance } from 'firebase/performance';

const firebaseConfig = {
  // apiKey: "AIzaSyDOe9hcAEkCrZFO4rRVBkFG7ix-Rhquqks", // API key removed as requested
  authDomain: "chitchatconnect-aqa0w.firebaseapp.com",
  projectId: "chitchatconnect-aqa0w",
  storageBucket: "chitchatconnect-aqa0w.firebasestorage.app",
  messagingSenderId: "638800277531",
  appId: "1:638800277531:web:70eb0af9754f438abd88be",
  measurementId: "G-DQL2418LY4"
};

let app: FirebaseApp | null = null; // Allow app to be null
let analytics: Analytics | null = null;
let perf: Performance | null = null;

// Attempt to initialize Firebase only if it hasn't been initialized yet.
// The absence of an API key might lead to initialization errors or limited functionality.
if (getApps().length === 0) {
  try {
    // Check if crucial config like projectId is present.
    // Firebase might still error here if apiKey is essential for the configured services.
    if (firebaseConfig.projectId) {
      app = initializeApp(firebaseConfig);
    } else {
      console.warn("Firebase projectId is missing in config. Firebase will not be initialized.");
    }
  } catch (e) {
    console.error("Firebase initialization failed:", e);
    // app remains null
  }
} else {
  app = getApps().length > 0 ? getApps()[0] : null;
}

// Initialize Analytics and Performance only on the client side, if the app was initialized, and if supported
if (app && typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      try {
        analytics = getAnalytics(app); // app is checked for null above
        perf = getPerformance(app); // app is checked for null above
        // console.log("Firebase Analytics & Performance potentially initialized (if app init was successful).");
      } catch (e) {
        console.error("Error initializing Firebase Analytics/Performance:", e);
      }
    } else {
      // console.warn("Firebase Analytics is not supported in this environment.");
    }
  }).catch(e => {
      // console.error("Error checking Firebase Analytics support:", e);
  });
} else if (!app && typeof window !== 'undefined') { // Added typeof window check for this log
  console.warn("Firebase app was not initialized. Analytics and Performance monitoring disabled.");
}

export { app, analytics, perf };
