// This file can now be a Server Component or a default component.
// It should NOT have 'use client' at the top of this specific file.
import React, { Suspense } from 'react';
import dynamicNext from 'next/dynamic'; // Renamed import

// Dynamically import the client component
const VideoChatPageClientContent = dynamicNext(
  () => import('./VideoChatPageClientContent')
);

export const dynamic = 'force-dynamic'; // Force dynamic rendering

export default function VideoChatPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-1 items-center justify-center p-4">
        <p>Loading video chat interface...</p>
      </div>
    }>
      <VideoChatPageClientContent />
    </Suspense>
  );
}
