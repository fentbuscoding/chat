
'use client';

import { usePathname } from 'next/navigation';
import { TopBar } from '@/components/top-bar';

export function ConditionalTopBar() {
  const pathname = usePathname();

  if (pathname === '/') {
    return null; // Don't render TopBar on the home page
  }

  return <TopBar />;
}
