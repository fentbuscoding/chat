// src/app/layout.tsx
import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import './(fonts)/fonts.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ConditionalTopBar } from '@/components/conditional-top-bar';
import { Toaster } from '@/components/ui/toaster';
import { ClientEffectManager } from '@/components/ClientEffectManager';
import { ClientLayoutWrapper } from '@/components/ClientLayoutWrapper';

// SEO Meta Tags
export const metadata: Metadata = {
  title: 'TinChat - Connect with People Through Text or Video Chat',
  description: 'Connect with people through text or video chat. Welcome to TinChat! Meet someone new by adding interests and start chatting instantly. Free anonymous chat platform.',
  keywords: ['chat', 'video chat', 'text chat', 'anonymous chat', 'meet people', 'online chat', 'random chat', 'instant messaging', 'TinChat'],
  authors: [{ name: 'TinChat' }],
  creator: 'TinChat',
  publisher: 'TinChat',
  robots: 'index, follow',
  
  // Open Graph / Facebook
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://tinchat.online',
    siteName: 'TinChat',
    title: 'TinChat - Connect with People Through Text or Video Chat',
    description: 'Connect with people through text or video chat. Welcome to TinChat! Meet someone new by adding interests and start chatting instantly. Free anonymous chat platform.',
    images: [
      {
        url: 'https://tinchat.online/og-image.png',
        width: 1200,
        height: 630,
        alt: 'TinChat - Anonymous Chat Platform',
      },
    ],
  },
  
  // Twitter
  twitter: {
    card: 'summary_large_image',
    title: 'TinChat - Connect with People Through Text or Video Chat',
    description: 'Connect with people through text or video chat. Welcome to TinChat! Meet someone new by adding interests and start chatting instantly.',
    images: ['https://tinchat.online/og-image.png'],
    creator: '@TinChat',
    site: '@TinChat',
  },
  
  // Icons
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  
  // Manifest
  manifest: '/site.webmanifest',
  
  // Theme color
  themeColor: '#667eea',
  
  // Additional
  applicationName: 'TinChat',
  referrer: 'origin-when-cross-origin',
  colorScheme: 'light dark',
  viewport: 'width=device-width, initial-scale=1.0',
  
  // Verification (add your verification codes when you get them)
  verification: {
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
    // bing: 'your-bing-verification-code',
  },
  
  // Alternate languages (if you support multiple languages)
  alternates: {
    canonical: 'https://tinchat.online',
    languages: {
      'en-US': 'https://tinchat.online',
      // 'es-ES': 'https://tinchat.online/es',
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "TinChat",
              "url": "https://tinchat.online",
              "description": "Connect with people through text or video chat. Welcome to TinChat! Meet someone new by adding interests and start chatting instantly.",
              "applicationCategory": "SocialNetworkingApplication",
              "operatingSystem": "Web Browser",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "creator": {
                "@type": "Organization",
                "name": "TinChat"
              },
              "featureList": [
                "Anonymous text chat",
                "Video chat",
                "Interest-based matching",
                "Real-time messaging",
                "Profile customization"
              ]
            })
          }}
        />
        
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="dns-prefetch" href="//tmxoylgtaexpldsvvqhv.supabase.co" />
        
        {/* Additional meta tags */}
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="TinChat" />
      </head>
      <body suppressHydrationWarning={true}>
        <ThemeProvider
          attribute="class"
          defaultTheme="theme-98"
          enableSystem={false}
        >
          <ConditionalTopBar />
          {/* ClientLayoutWrapper will handle the pathname key logic */}
          <ClientLayoutWrapper>
            {children}
          </ClientLayoutWrapper>
          <Toaster />
          <ClientEffectManager />
        </ThemeProvider>
        <Script src="/animated-cursor.js" strategy="afterInteractive" />
        <Script src="/oneko.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}