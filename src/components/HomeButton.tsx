'use client';

import Image from 'next/image';
import React from 'react';

export default function HomeButton() {
  return (
    <Image
      src="/favicon.ico"
      alt="Home"
      width={24}
      height={24}
      className="fixed top-4 left-4 z-50"
      title="Home Icon"
    />
  );
}
