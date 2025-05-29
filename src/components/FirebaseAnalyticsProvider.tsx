
'use client';

import { useEffect } from 'react';
import { app, analytics as firebaseAnalyticsInstance } from '@/lib/firebase'; // Ensure analytics is initialized
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';


export function FirebaseAnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // This effect ensures that Analytics is initialized on the client side.
    // The actual initialization logic (getAnalytics) is in lib/firebase.ts,
    // but we can ensure it's accessed here to trigger it if not already.
    if (typeof window !== 'undefined') {
      isSupported().then(supported => {
        if (supported) {
          // Accessing the exported analytics instance from lib/firebase is enough
          // if it's already initialized there. Or re-initialize if needed,
          // but the lib/firebase.ts should handle it.
          const analytics = getAnalytics(app);
          console.log("Firebase Analytics initialized on client.");
        }
      });
    }
  }, []);

  return <>{children}</>;
}
