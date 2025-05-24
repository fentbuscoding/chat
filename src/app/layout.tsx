
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
          <div className="flex flex-col min-h-screen relative"> {/* Added relative for positioning context */}
            <ConditionalTopBar />
            <main className="flex-1 flex flex-col">{children}</main>
            <Toaster />
            <img
              src="https://github.com/ekansh28/files/blob/main/goldfish.png?raw=true"
              alt="Decorative Goldfish"
              className="absolute top-4 right-4 w-[150px] h-[150px] object-contain pointer-events-none select-none z-50"
              data-ai-hint="goldfish decoration"
            />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
