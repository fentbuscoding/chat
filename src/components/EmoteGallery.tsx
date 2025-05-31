import React, { useEffect, useState } from 'react';

// Define the shape of a single emote
interface Emote {
  filename: string;
  width: number;
  height: number;
}

const EmoteGallery: React.FC = () => {
  const [emotes, setEmotes] = useState<Emote[]>([]);

  useEffect(() => {
    fetch('/emote_index.json')
      .then((res) => res.json())
      .then((data: Emote[]) => setEmotes(data))
      .catch((err) => console.error('Failed to load emotes:', err));
  }, []);

  return (
    <div className="grid grid-cols-4 gap-4 p-4">
      {emotes.map((emote, index) => (
        <div key={index} className="flex flex-col items-center">
          <img
            src={`/emotes/${emote.filename}`}
            width={emote.width}
            height={emote.height}
            alt={emote.filename}
            className="border p-1"
          />
          <span className="text-xs text-gray-500">{emote.filename}</span>
        </div>
      ))}
    </div>
  );
};

export default EmoteGallery;
