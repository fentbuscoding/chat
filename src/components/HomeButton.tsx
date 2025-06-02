'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import React from 'react';

export default function HomeButton() {
  const router = useRouter();

  const goHome = () => {
    router.replace('/');
    window.scrollTo(0, 0);
  };

  return (
    <button
      onClick={goHome}
      className="fixed top-4 left-4 z-50 cursor-pointer"
      title="Go to Home and reset theme"
    >
      <Image src="/favicon.ico" alt="Home" width={24} height={24} />
    </button>
  );
}
