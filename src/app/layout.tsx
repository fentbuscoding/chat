
import type { Metadata } from 'next';
import Script from 'next/script'; // Import Script
import './globals.css';
import './(fonts)/fonts.css'; // Import the font CSS
import { ThemeProvider } from '@/components/theme-provider';
import { ConditionalTopBar } from '@/components/conditional-top-bar';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseAnalyticsProvider } from '@/components/FirebaseAnalyticsProvider';

const siteTitle = "TinChat";
const siteDescription = "Connect with people through text or video chat.";
const siteKeywords = ["OMEGLE", "CHATROULETTE", "UHMEGLE", "random chat", "video chat", "text chat", "anonymous chat"];
const siteUrl = "https://tinchat.online"; // Replace with your actual domain later
const openGraphImageUrl = "https://placehold.co/1200x630.png"; // Standard OG image size

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  keywords: siteKeywords,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    type: "website",
    url: siteUrl, // It's good practice to have a canonical URL
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
          </FirebaseAnalyticsProvider>
        </ThemeProvider>
        {/* Script to load oneko.js functions; it will be controlled programmatically */}
        <Script src="/oneko.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
