
'use client';

import { useEffect } from 'react';
// Import 'app' specifically, not the instances of analytics/perf directly from lib/firebase
// as they might be null.
import { app as firebaseApp } from '@/lib/firebase';
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from 'firebase/analytics';
import { getPerformance, type Performance } from 'firebase/performance';


export function FirebaseAnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (firebaseApp) { // Check if the app object from lib/firebase is not null
        isAnalyticsSupported().then(supported => {
          if (supported) {
            try {
              const analyticsInstance = getAnalytics(firebaseApp); // Initialize here
              // console.log("Firebase Analytics initialized on client.");
            } catch (e) {
                console.error("Error getting Firebase Analytics instance:", e);
            }
          } else {
            // console.warn("Firebase Analytics not supported in this client environment.");
          }
        }).catch(e => console.error("Error checking Firebase Analytics support:", e));

        try {
            const perfInstance = getPerformance(firebaseApp); // Initialize here
            if (perfInstance) {
                // console.log("Firebase Performance Monitoring initialized on client.");
            }
        } catch (e) {
            console.error("Error getting Firebase Performance instance:", e);
        }

      } else {
        console.warn("Firebase app instance not available (likely due to missing API key or init failure). Analytics and Performance monitoring disabled.");
      }
    }
  }, []);

  return <>{children}</>;
}
