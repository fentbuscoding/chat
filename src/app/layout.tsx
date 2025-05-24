
import type { Metadata } from 'next';
import './globals.css';
import './(fonts)/fonts.css'; // Import the font CSS
import { ThemeProvider } from '@/components/theme-provider';
import { ConditionalTopBar } from '@/components/conditional-top-bar';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Ballscord',
  description: 'Connect with people through text or video chat.',
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
          {/* The div with className "flex flex-col min-h-screen relative" (labeled [D1]) has been removed */}
          <ConditionalTopBar />
          <main className="flex-1 flex flex-col">{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
