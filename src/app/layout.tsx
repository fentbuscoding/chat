
'use client'; // Add 'use client' to use usePathname

import type { Metadata } from 'next';
import Script from 'next/script';
import { usePathname } from 'next/navigation'; // Import usePathname
import './globals.css';
import './(fonts)/fonts.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ConditionalTopBar } from '@/components/conditional-top-bar';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseAnalyticsProvider } from '@/components/FirebaseAnalyticsProvider';
import { ClientEffectManager } from '@/components/ClientEffectManager';

// Metadata object should be defined outside the component if it's a client component,
// or we can use the new generateMetadata function if we need dynamic metadata.
// For now, I'll assume static metadata is fine and keep it, but Next.js might show warnings
// or prefer it to be in a generateMetadata export if this remains a client component long-term.
// However, for `key={pathname}` to work on main, RootLayout needs to be client-side.

// export const metadata: Metadata = { ... }; // This might need to be handled differently for client components

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname(); // Get the current pathname

  return (
    <html lang="en" suppressHydrationWarning>
      {/* The <head /> component is automatically managed by Next.js based on the metadata object and children like Script */}
      <body suppressHydrationWarning={true}>
        <ThemeProvider
          attribute="class"
          defaultTheme="theme-98"
          enableSystem={false}
        >
          <FirebaseAnalyticsProvider>
              <ConditionalTopBar />
              {/* Add key={pathname} to the main element */}
              <main key={pathname} className="flex-1 flex flex-col relative">
                {children}
              </main>
              <Toaster />
              <ClientEffectManager />
          </FirebaseAnalyticsProvider>
        </ThemeProvider>
        <Script src="/animated-cursor.js" strategy="afterInteractive" />
        <Script src="/oneko.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
