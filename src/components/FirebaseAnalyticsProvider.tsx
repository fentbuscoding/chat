
'use client';

import { useEffect } from 'react';
import { app, analytics as firebaseAnalyticsInstance, perf as firebasePerfInstance } from '@/lib/firebase'; // Ensure analytics and perf are initialized
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from 'firebase/analytics';
import { getPerformance, isSupported as isPerfSupported, type Performance } from 'firebase/performance';


export function FirebaseAnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // This effect ensures that Analytics and Performance Monitoring are initialized on the client side.
    // The actual initialization logic (getAnalytics, getPerformance) is in lib/firebase.ts,
    // but we can ensure it's accessed here to trigger it if not already.
    if (typeof window !== 'undefined') {
      isAnalyticsSupported().then(supported => {
        if (supported) {
          const analytics = getAnalytics(app);
          console.log("Firebase Analytics initialized on client.");
        }
      });
      // Performance monitoring does not have a separate isSupported() check for its specific module in the same way,
      // but it relies on the general browser environment. If firebase/app is supported, perf should be too.
      // getPerformance() itself handles initialization.
      const perf = getPerformance(app);
      if (perf) {
        console.log("Firebase Performance Monitoring initialized on client.");
      }
    }
  }, []);

  return <>{children}</>;
}
