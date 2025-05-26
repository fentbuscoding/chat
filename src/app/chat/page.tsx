// This file can now be a Server Component or a default component.
// It should NOT have 'use client' at the top of this specific file.
import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the client component with SSR turned off
const ChatPageClientContent = dynamic(
  () => import('./ChatPageClientContent'),
  { ssr: false }
);

export const dynamic = 'force-dynamic'; // Force dynamic rendering

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-1 items-center justify-center p-4">
        <p>Loading chat interface...</p>
      </div>
    }>
      <ChatPageClientContent />
    </Suspense>
  );
}
