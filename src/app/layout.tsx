
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

const siteTitle = "TinChat";
const siteDescription = "Connect with people through text or video chat.";
const siteKeywords = ["OMEGLE", "CHATROULETTE", "UHMEGLE", "random chat", "video chat", "text chat", "anonymous chat"];
const siteUrl = "https://tinchat.online"; // Replace with your actual production domain
const openGraphImageUrl = "https://placehold.co/1200x630.png"; // Replace with your actual OG image URL

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
  icons: {
    icon: '/favicon.ico', // Default favicon for all pages
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
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
