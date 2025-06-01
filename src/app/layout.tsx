
// REMOVED 'use client'; directive

import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import './(fonts)/fonts.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ConditionalTopBar } from '@/components/conditional-top-bar';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseAnalyticsProvider } from '@/components/FirebaseAnalyticsProvider';
// import { ConditionalGoldfishImage } from '@/components/ConditionalGoldfishImage'; // Removed
import { ClientEffectManager } from '@/components/ClientEffectManager';

export const metadata: Metadata = {
  // Basic Meta Tags
  title: "TinChat – Random Chat to Connect & Have Fun",
  description: "TinChat is a free Omegle-style chat platform that connects you instantly with strangers. Enjoy anonymous, real-time text and video conversations – no login required.",
  keywords: ["random chat", "chat with strangers", "anonymous chat", "online chat", "TinChat", "Omegle alternative", "video chat", "text chat", "free chat app", "instant chat"],
  authors: [{ name: "TinChat Team", url: "https://tinchat.online" }],
  robots: {
    index: true,
    follow: true,
  },
  viewport: "width=device-width, initial-scale=1",
  metadataBase: new URL("https://tinchat.online"),

  // Open Graph / Facebook
  openGraph: {
    type: "website",
    url: "/", // Relative to metadataBase
    title: "TinChat – Random Chat to Connect & Have Fun",
    description: "Instantly connect with strangers worldwide. TinChat offers a fun and safe space for text and video chat. No registration needed!",
    images: [
      {
        url: "/favicon.ico", // Relative to metadataBase, though a larger image is recommended for OG
        // width: 32, // Example, not strictly needed for favicon if using as OG image
        // height: 32, // Example
        alt: "TinChat Logo"
      }
    ],
    siteName: "TinChat",
  },

  // Twitter
  twitter: {
    card: "summary",
    url: "/", // Relative to metadataBase
    title: "TinChat – Random Chat to Connect & Have Fun",
    description: "Chat randomly with strangers online – simple, fast, and anonymous.",
    images: ["/favicon.ico"], // Relative to metadataBase, though a larger image is recommended
  },

  // Favicon
  icons: {
    icon: "/favicon.ico", // Relative to metadataBase
  },

  // Other meta tags like charSet are handled by Next.js automatically.
  // The <html lang="en"> is set on the html tag below.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
              <main className="flex-1 flex flex-col relative">
                {children}
              </main>
              <Toaster />
              {/* <ConditionalGoldfishImage /> Removed from here */}
              <ClientEffectManager />
          </FirebaseAnalyticsProvider>
        </ThemeProvider>
        {/* Scripts for custom cursors are loaded here but managed by ClientEffectManager */}
        <Script src="/animated-cursor.js" strategy="afterInteractive" />
        <Script src="/oneko.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
