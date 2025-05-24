
import type { Metadata } from 'next';
import './globals.css';
import './(fonts)/fonts.css'; // Import the font CSS
import { ThemeProvider } from '@/components/theme-provider';
import { ConditionalTopBar } from '@/components/conditional-top-bar'; // Changed import
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
          attribute="class" // Keep attribute for potential future use
          defaultTheme="theme-98" // Set the default theme
          enableSystem={false} // Disable system theme preference
        >
          <div className="flex flex-col min-h-screen">
            <ConditionalTopBar /> {/* Use ConditionalTopBar */}
            <main className="flex-1 flex flex-col">{children}</main>
            <Toaster />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
