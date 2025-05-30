
// REMOVED 'use client'; directive

import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import './(fonts)/fonts.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ConditionalTopBar } from '@/components/conditional-top-bar';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseAnalyticsProvider } from '@/components/FirebaseAnalyticsProvider';
import { ConditionalGoldfishImage } from '@/components/ConditionalGoldfishImage';
// REMOVED: import React, { useEffect } from 'react';
import { ClientEffectManager } from '@/components/ClientEffectManager'; // ADDED

const siteTitle = "TinChat";
const siteDescription = "Connect with people through text or video chat.";
const siteKeywords = ["OMEGLE", "CHATROULETTE", "UHMEGLE", "random chat", "video chat", "text chat", "anonymous chat"];
const siteUrl = "https://tinchat.online"; 
const openGraphImageUrl = "https://placehold.co/1200x630.png"; 

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  keywords: siteKeywords,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    type: "website",
    url: siteUrl,
    images: [
      {
        url: openGraphImageUrl,
        width: 1200,
        height: 630,
        alt: `${siteTitle} - Connect with new people`,
        'data-ai-hint': 'social media banner'
      },
    ],
    siteName: siteTitle,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [openGraphImageUrl],
  },
};

// The global Window interface augmentation is better placed in a global .d.ts file
// or within ClientEffectManager.tsx if only used there.
// For now, assuming it's picked up or you'll move it.
// declare global {
//   interface Window {
//     startOriginalOneko?: () => void;
//     stopOriginalOneko?: () => void;
//     hideOriginalOneko?: () => void;
//     showOriginalOneko?: () => void;
//     startAnimatedGifCursor?: (gifUrl: string) => void;
//     stopAnimatedGifCursor?: () => void;
//     hideAnimatedGifCursor?: () => void;
//     showAnimatedGifCursor?: () => void;
//   }
// }

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // REMOVED useEffect hook for cursor logic

  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body>
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
              <ConditionalGoldfishImage />
              <ClientEffectManager /> {/* ADDED ClientEffectManager here */}
          </FirebaseAnalyticsProvider>
        </ThemeProvider>
        <Script src="/animated-cursor.js" strategy="afterInteractive" />
        <Script src="/oneko.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
