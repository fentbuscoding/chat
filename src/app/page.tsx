
'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Label } from '@/components/ui/label-themed';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card-themed';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function SelectionLobby() {
  const [currentInterest, setCurrentInterest] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleInterestInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentInterest(e.target.value);
  };

  const addInterest = useCallback((interestToAdd: string) => {
    const newInterest = interestToAdd.trim().toLowerCase(); // Normalize to lowercase
    if (newInterest && !selectedInterests.includes(newInterest) && selectedInterests.length < 5) {
      setSelectedInterests(prev => [...prev, newInterest]);
      setCurrentInterest('');
    } else if (newInterest && selectedInterests.includes(newInterest)) {
      toast({ title: "Duplicate Interest", description: `"${newInterest}" is already added.`, variant: "default" });
      setCurrentInterest('');
    } else if (selectedInterests.length >= 5) {
      toast({ title: "Max Interests Reached", description: "You can add up to 5 interests.", variant: "default" });
      setCurrentInterest('');
    }
  }, [selectedInterests, toast]);

  const handleInterestInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const key = e.key;
    const value = currentInterest.trim();

    if ((key === ',' || key === ' ' || key === 'Enter') && value) {
      e.preventDefault();
      addInterest(value);
    } else if (key === 'Backspace' && !currentInterest && selectedInterests.length > 0) {
      e.preventDefault();
      setSelectedInterests(prev => prev.slice(0, -1));
    }
  };

  const handleRemoveInterest = useCallback((interestToRemove: string, event?: React.MouseEvent) => {
    event?.stopPropagation(); 
    setSelectedInterests(prev => prev.filter(interest => interest !== interestToRemove));
  }, []);

  const handleStartChat = useCallback((type: 'text' | 'video') => {
    if (!router) {
      console.error("SelectionLobby: Router is not available in handleStartChat.");
      toast({ variant: "destructive", title: "Navigation Error", description: "Could not initiate chat. Please try refreshing." });
      return;
    }

    const interestsString = selectedInterests.join(',');
    const params = new URLSearchParams();

    if (interestsString) {
        params.append('interests', interestsString);
    }
    params.append('type', type);

    const queryString = params.toString();
    const path = `/chat${queryString ? `?${queryString}` : ''}`;
    
    console.log(`SelectionLobby: Attempting to navigate to: ${path}`);
    try {
      router.push(path);
    } catch (error) {
      console.error("SelectionLobby: Error during router.push:", error);
      toast({ variant: "destructive", title: "Navigation Error", description: "An unexpected error occurred while trying to start the chat." });
    }
  }, [router, selectedInterests, toast]);

  const focusInput = () => {
    inputRef.current?.focus();
  };


  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Ballscord!</CardTitle>
          <CardDescription>
            Connect with someone new. Add interests by typing them and pressing Comma, Space, or Enter. Max 5 interests.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="interests-input-field">Your Interests</Label>
            <div
              className="flex flex-wrap items-center gap-1 p-1.5 border rounded-md themed-input cursor-text" 
              onClick={focusInput} 
              style={{ minHeight: 'calc(1.5rem + 12px + 2px)'}} 
            >
              {selectedInterests.map((interest) => (
                <div
                  key={interest}
                  className="bg-black text-white pl-2 pr-1 py-0.5 rounded-sm flex items-center text-xs h-fit"
                >
                  <span>{interest}</span>
                  <X
                    size={14}
                    className="ml-1 text-white hover:text-gray-300 cursor-pointer"
                    onClick={(e) => handleRemoveInterest(interest, e)} 
                    aria-label={`Remove ${interest}`}
                  />
                </div>
              ))}
              <Input
                id="interests-input-field"
                ref={inputRef}
                value={currentInterest}
                onChange={handleInterestInputChange}
                onKeyDown={handleInterestInputKeyDown}
                placeholder={selectedInterests.length < 5 ? "Add interest..." : "Max interests reached"}
                className="flex-grow p-0 border-none outline-none shadow-none bg-transparent themed-input-inner"
                style={{ minWidth: '80px' }} 
                disabled={selectedInterests.length >= 5 && !currentInterest} 
              />
            </div>
            <p className="text-xs text-gray-500">
              Type an interest and press Comma, Space, or Enter. Backspace on empty input to remove last. Leave blank for random match.
            </p>
          </div>
        </CardContent>
         <CardFooter className="flex justify-between space-x-4">
           <Button className="flex-1 accent" onClick={() => handleStartChat('text')}>
             <span className="animate-rainbow-text">Start Text Chat</span>
           </Button>
           <Button className="flex-1 accent" onClick={() => handleStartChat('video')}>
             <span className="animate-rainbow-text-alt">Start Video Chat</span>
           </Button>
         </CardFooter>
      </Card>
    </div>
  );
}
