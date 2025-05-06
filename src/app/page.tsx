
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Label } from '@/components/ui/label-themed';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card-themed';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SelectionLobby() {
  const [currentInterest, setCurrentInterest] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInterestInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value.endsWith(',')) {
      const newInterest = value.slice(0, -1).trim();
      if (newInterest && !selectedInterests.includes(newInterest) && selectedInterests.length < 5) { // Limit to 5 interests
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
      if (newInterest && !selectedInterests.includes(newInterest) && selectedInterests.length < 5) { // Limit to 5 interests
        setSelectedInterests([...selectedInterests, newInterest]);
        setCurrentInterest('');
      }
      e.preventDefault(); 
    } else if (e.key === 'Backspace' && !currentInterest && selectedInterests.length > 0) {
      // Remove the last interest if backspace is pressed on an empty input
      setSelectedInterests(selectedInterests.slice(0, -1));
    }
  };

  const handleRemoveInterest = (interestToRemove: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent focusing input when removing tag
    setSelectedInterests(selectedInterests.filter(interest => interest !== interestToRemove));
  };

  const handleStartChat = (type: 'text' | 'video') => {
    const interestsString = selectedInterests.join(',');
    const params = new URLSearchParams({ interests: interestsString, type });
    router.push(`/chat?${params.toString()}`);
    console.log(`Starting ${type} chat with interests: ${interestsString || 'any'}`);
  };

  // Focus input when the container is clicked
  const focusInput = () => {
    inputRef.current?.focus();
  };


  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to ChitChatConnect!</CardTitle>
          <CardDescription>
            Connect with someone new. Add interests (optional) by typing them and pressing comma or Enter. Max 5 interests.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="interests-input">Your Interests</Label>
            {/* Container that looks like an input field */}
            <div 
              className="flex flex-wrap items-center gap-1 p-1.5 border rounded-md themed-input" // Use themed-input for consistent styling
              onClick={focusInput} // Focus input on click
              style={{ minHeight: 'calc(1.5rem + 12px + 2px)'}} // Adjust min-height to fit text and padding
            >
              {selectedInterests.map((interest) => (
                <div
                  key={interest}
                  className="bg-black text-white pl-2 pr-1 py-0.5 rounded-sm flex items-center text-xs h-fit" // Smaller padding and text
                >
                  <span>{interest}</span>
                  <X
                    size={14} // Slightly larger for easier clicking
                    className="ml-1 text-white hover:text-gray-300 cursor-pointer"
                    onClick={(e) => handleRemoveInterest(interest, e)}
                    aria-label={`Remove ${interest}`}
                  />
                </div>
              ))}
              <Input
                id="interests-input" // Changed ID to avoid conflict if Label uses it
                ref={inputRef}
                value={currentInterest}
                onChange={handleInterestInputChange}
                onKeyDown={handleInterestInputKeyDown}
                placeholder={selectedInterests.length < 5 ? "Add interest..." : "Max interests reached"}
                // Remove input-specific styling that conflicts with the container
                className="flex-grow p-0 border-none outline-none shadow-none bg-transparent themed-input-inner" 
                style={{ minWidth: '80px' }} // Ensure input has some base width
                disabled={selectedInterests.length >= 5 && !currentInterest}
              />
            </div>
            <p className="text-xs text-gray-500">
              Type an interest and press comma or Enter. Backspace to remove last. Leave blank to connect with anyone.
            </p>
          </div>
        </CardContent>
         <CardFooter className="flex justify-between space-x-4">
           <Button className="flex-1 accent" onClick={() => handleStartChat('text')}>
             <span className="animate-rainbow-text">Start Text Chat</span>
           </Button>
           <Button className="flex-1 accent" onClick={() => handleStartChat('video')}>
             <span className="animate-rainbow-text">Start Video Chat</span>
           </Button>
         </CardFooter>
      </Card>
    </div>
  );
}
