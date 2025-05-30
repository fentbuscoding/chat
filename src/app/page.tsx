
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Import Link
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Label } from '@/components/ui/label-themed';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card-themed';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';


export default function SelectionLobby() {
  const [currentInterest, setCurrentInterest] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [usersOnline, setUsersOnline] = useState<number | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) {
      console.error("SelectionLobby: Socket server URL is not defined.");
      setUsersOnline(0); 
      return;
    }

    let tempSocket: Socket | null = null;

    try {
      tempSocket = io(socketServerUrl, {
        withCredentials: true,
        transports: ['websocket', 'polling']
      });

      tempSocket.on('connect', () => {
        console.log("SelectionLobby: Connected to socket server for user count.");
        tempSocket?.emit('getOnlineUserCount');
      });

      tempSocket.on('onlineUserCount', (count: number) => {
        setUsersOnline(count);
        tempSocket?.disconnect(); 
      });

      tempSocket.on('onlineUserCountUpdate', (count: number) => {
        // This listener might be useful if the server broadcasts updates,
        // but for a one-time fetch, it might not be strictly necessary
        // setUsersOnline(count); 
      });


      tempSocket.on('connect_error', (err) => {
        console.error("SelectionLobby: Socket connection error for user count:", err.message);
        setUsersOnline(0); // Or some other indicator of an error
        if (tempSocket?.connected) { // Check if connected before trying to disconnect
            tempSocket?.disconnect();
        }
      });

      tempSocket.on('disconnect', () => {
          console.log("SelectionLobby: Disconnected from socket server for user count.");
      });

    } catch (error) {
        console.error("SelectionLobby: Failed to initialize socket for user count:", error);
        setUsersOnline(0); // Or some other indicator of an error
    }

    // Cleanup function
    return () => {
      if (tempSocket?.connected) {
        tempSocket?.disconnect();
      }
    };
  }, []); 

  const handleInterestInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentInterest(e.target.value);
  };

  const addInterest = React.useCallback((interestToAdd: string) => {
    const newInterest = interestToAdd.trim().toLowerCase();
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

  const handleRemoveInterest = React.useCallback((interestToRemove: string, event?: React.MouseEvent) => {
    event?.stopPropagation(); // Prevent click from focusing the input field if the tag is inside the clickable area
    setSelectedInterests(prev => prev.filter(interest => interest !== interestToRemove));
  }, []);

  const handleStartChat = React.useCallback((type: 'text' | 'video') => {
    if (!router) {
      console.error("SelectionLobby: Router is not available in handleStartChat.");
      toast({ variant: "destructive", title: "Navigation Error", description: "Could not initiate chat. Router not available." });
      return;
    }

    const interestsString = selectedInterests.join(',');
    const params = new URLSearchParams();

    if (interestsString) {
        params.append('interests', interestsString);
    }

    let path: string;
    const queryString = params.toString();

    if (type === 'video') {
        // path = `/video-chat${queryString ? `?${queryString}` : ''}`;
        path = `/video-chat`; // Interests not currently passed to video chat
    } else { 
        path = `/chat${queryString ? `?${queryString}` : ''}`;
    }
    router.push(path);
  }, [router, selectedInterests, toast]);


  const focusInput = () => {
    inputRef.current?.focus();
  };


  return (
    <div className="flex flex-1 flex-col px-4 pt-4">
      <div className="flex-grow min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md relative">
          <CardHeader>
            <div className="absolute top-2 right-2 flex items-center text-xs">
              <img
                src="https://github.com/ekansh28/files/blob/main/greenlight.gif?raw=true"
                alt="Green light"
                className="w-3 h-3 mr-1"
                data-ai-hint="green light indicator"
              />
              {usersOnline !== null ? (
                <span className="font-bold mr-1">{usersOnline}</span>
              ) : (
                <span className="font-bold mr-1">--</span>
              )}
              <span>Users Online!</span>
            </div>
            <CardTitle>Welcome to TinChat!</CardTitle>
            <CardDescription>
              Connect with someone new. Add interests by typing them and pressing Comma, Space, or Enter. Max 5 interests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-2">
                <Label htmlFor="interests-input-field">Your Interests</Label>
                <Button className="p-0 w-[20px] h-[20px] min-w-0 flex items-center justify-center" aria-label="Settings">
                  <img
                    src="https://github.com/ekansh28/files/blob/main/gears-0.png?raw=true"
                    alt="Settings"
                    className="max-w-full max-h-full object-contain"
                    data-ai-hint="settings icon"
                  />
                </Button>
              </div>
              <div
                className={cn(
                  "flex flex-wrap items-center gap-1 p-1.5 border rounded-md themed-input cursor-text"
                )}
                onClick={focusInput}
                style={{ minHeight: 'calc(1.5rem + 12px + 2px)'}} // Adjust to match typical input height (font-size + padding + border)
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
                  id="interests-input-field" // Ensure ID is unique if this component is used multiple times on a page, though unlikely here
                  ref={inputRef}
                  value={currentInterest}
                  onChange={handleInterestInputChange}
                  onKeyDown={handleInterestInputKeyDown}
                  placeholder={selectedInterests.length < 5 ? "Add interest..." : "Max interests reached"}
                  className="flex-grow p-0 border-none outline-none shadow-none bg-transparent themed-input-inner"
                  style={{ minWidth: '80px' }} // Ensure some minimum width for the input itself
                  disabled={selectedInterests.length >= 5 && !currentInterest} // Disable if max interests reached and no current input
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
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
      <footer className="mt-auto py-4 text-center">
        <div className="max-w-5xl mx-auto">
         <div className="border-t-2 border-gray-300 dark:border-gray-600 my-4 w-full"></div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 space-x-2">
          <span>tinchat.com</span>
          <span>•</span>
          <Link href="/rules" className="text-red-600 hover:underline">Rules</Link>
          <span>•</span>
          <Link href="/terms" className="text-red-600 hover:underline">Terms Of Service</Link>
          <span>•</span>
          <Link href="/privacy" className="text-red-600 hover:underline">Privacy</Link>
        </p>
      </footer>
    </div>
  );
}
