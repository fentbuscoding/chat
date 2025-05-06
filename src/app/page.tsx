'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Label } from '@/components/ui/label-themed';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card-themed';
import { X } from 'lucide-react'; // Import X icon

export default function SelectionLobby() {
  const [currentInterest, setCurrentInterest] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const router = useRouter();

  const handleInterestInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value.endsWith(',')) {
      const newInterest = value.slice(0, -1).trim();
      if (newInterest && !selectedInterests.includes(newInterest)) {
        setSelectedInterests([...selectedInterests, newInterest]);
      }
      setCurrentInterest(''); // Clear input after adding interest
    } else {
      setCurrentInterest(value);
    }
  };

  const handleInterestInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && currentInterest.trim()) {
      const newInterest = currentInterest.trim();
      if (newInterest && !selectedInterests.includes(newInterest)) {
        setSelectedInterests([...selectedInterests, newInterest]);
        setCurrentInterest('');
      }
      e.preventDefault(); // Prevent form submission if it's part of a form
    }
  };

  const handleRemoveInterest = (interestToRemove: string) => {
    setSelectedInterests(selectedInterests.filter(interest => interest !== interestToRemove));
  };

  const handleStartChat = (type: 'text' | 'video') => {
    const interestsString = selectedInterests.join(',');
    const params = new URLSearchParams({ interests: interestsString, type });
    router.push(`/chat?${params.toString()}`);
    console.log(`Starting ${type} chat with interests: ${interestsString || 'any'}`);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to ChitChatConnect!</CardTitle>
          <CardDescription>
            Connect with someone new. Add interests (optional) by typing them and pressing comma or Enter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="interests">Your Interests</Label>
            <div className="flex flex-wrap gap-2 mb-2 min-h-[2.5rem] p-1 border rounded-md"> {/* Container for tags */}
              {selectedInterests.map((interest) => (
                <div
                  key={interest}
                  className="bg-black text-white px-2 py-1 rounded-md flex items-center text-sm h-fit"
                >
                  <span>{interest}</span>
                  <button
                    onClick={() => handleRemoveInterest(interest)}
                    className="ml-2 text-white hover:text-gray-300 focus:outline-none"
                    aria-label={`Remove ${interest}`}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <Input
              id="interests"
              value={currentInterest}
              onChange={handleInterestInputChange}
              onKeyDown={handleInterestInputKeyDown}
              placeholder="e.g., programming, music, movies"
            />
            <p className="text-xs text-gray-500">
              Type an interest and press comma or Enter to add it. Leave blank to connect with anyone.
            </p>
          </div>
        </CardContent>
         <CardFooter className="flex justify-between space-x-4">
           <Button className="flex-1 accent" onClick={() => handleStartChat('text')}>
             Start Text Chat
           </Button>
           <Button className="flex-1 accent" onClick={() => handleStartChat('video')}>
             Start Video Chat
           </Button>
         </CardFooter>
      </Card>
    </div>
  );
}
