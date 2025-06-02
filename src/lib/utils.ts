
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function playSound(filename: string): void {
  if (typeof window === 'undefined') {
    // Sounds can only be played in the browser
    console.warn('playSound called on the server. Sound playback is browser-only.');
    return;
  }

  const audioPath = `/sounds/${filename}`; // Assumes sounds are in /public/sounds/
  const audio = new Audio(audioPath);

  audio.play().catch(error => {
    // Autoplay was prevented or other error.
    // This can happen if the user hasn't interacted with the page yet,
    // or if the sound file is missing/corrupted.
    console.warn(`Error playing sound ${filename}:`, error);
    // You could potentially inform the user or retry after interaction if crucial.
  });
}
