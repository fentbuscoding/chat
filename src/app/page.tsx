'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button-themed'; // Use themed button
import { Input } from '@/components/ui/input-themed'; // Use themed input
import { Label } from '@/components/ui/label-themed'; // Use themed label
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card-themed'; // Use themed card
import { useToast } from '@/hooks/use-toast';

export default function SelectionLobby() {
  const [interests, setInterests] = useState('');
  const router = useRouter();
  const { toast } = useToast();

  const handleStartChat = (type: 'text' | 'video') => {
    if (!interests.trim()) {
      toast({
        title: "Interests Required",
        description: "Please enter at least one interest to find a match.",
        variant: "destructive",
      });
      return;
    }
    // Navigate to the chat/video page, passing interests and type
    // The actual WebRTC/matching logic will happen on those pages
    const params = new URLSearchParams({ interests, type });
    router.push(`/chat?${params.toString()}`);
    console.log(`Starting ${type} chat with interests: ${interests}`);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to ChitChatConnect!</CardTitle>
          <CardDescription>Connect with someone new based on your interests.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="interests">Your Interests (comma-separated)</Label>
            <Input
              id="interests"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="e.g., programming, music, movies"
            />
            <p className="text-xs text-gray-500">Adding interests helps us find a better match for you.</p>
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
