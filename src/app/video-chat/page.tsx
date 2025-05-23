
// @ts-nocheck
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: Date;
}

const VideoChatPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { theme } = useTheme();

  const chatType = 'video';

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | undefined>(undefined);
  const chatMessagesListRef = useRef<HTMLUListElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);


  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      const newMessageItem = { id: Date.now().toString(), text, sender, timestamp: new Date() };
      if (sender === 'system') {
        const filteredMessages = prevMessages.filter(msg =>
          !(msg.sender === 'system' && (msg.text.includes('Connected with a partner') || msg.text.includes('Searching for a partner...')))
        );
        return [...filteredMessages, newMessageItem];
      }
      return [...prevMessages, newMessageItem];
    });
  }, []);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
          scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [messages]);

 const cleanupConnections = useCallback((stopLocalStream = true) => {
    console.log("VideoChatPage: Cleanup connections called. Stop local stream:", stopLocalStream);
    if (stopLocalStream && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        console.log("VideoChatPage: Local stream stopped and cleared.");
    }
     if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);


  useEffect(() => {
    let didCancel = false;
    const getInitialCameraStream = async () => {
      if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        if (!didCancel) {
            setHasCameraPermission(false);
            toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Camera access (getUserMedia) is not supported by your browser.'});
        }
        return;
      }

      if (hasCameraPermission === undefined) {
        console.log("VideoChatPage: Attempting to get initial user media for video chat.");
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          if (!didCancel) {
            console.log("VideoChatPage: Initial camera access granted.");
            setHasCameraPermission(true);
            localStreamRef.current = stream;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
          } else {
            console.log("VideoChatPage: Camera access granted but component unmounted/effect cancelled, stopping tracks.");
            stream.getTracks().forEach(track => track.stop());
          }
        } catch (error) {
          if (!didCancel) {
            console.error('VideoChatPage: Error accessing camera initially:', error);
            setHasCameraPermission(false);
            // toast({
            //   variant: 'destructive',
            //   title: 'Camera Access Denied',
            //   description: 'Please enable camera permissions for video chat.',
            // });
          }
        }
      } else if (hasCameraPermission === true && localStreamRef.current && localVideoRef.current && !localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    };

    getInitialCameraStream();

    return () => {
      didCancel = true;
      console.log("VideoChatPage: Cleanup for initial camera stream effect.");
      cleanupConnections(true);
    };
  }, [hasCameraPermission, toast, cleanupConnections]);

  useEffect(() => {
    if (isPartnerConnected) {
      addMessage('Connected with a partner. You can start chatting!', 'system');
    } else if (!isFindingPartner && hasCameraPermission !== undefined) {
       // Removed the 'Not connected' message from here as per user request
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPartnerConnected, isFindingPartner, hasCameraPermission]);


  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim()) return;
     if (!isPartnerConnected) {
        toast({title: "Not Connected", description: "You must be connected to a partner to send messages.", variant: "default"});
        return;
    }
    addMessage(newMessage, 'me');
    setNewMessage('');
  }, [newMessage, addMessage, toast, isPartnerConnected]);


  const handleToggleConnection = useCallback(async () => {
    if (isPartnerConnected) {
      addMessage('You have disconnected from the partner.', 'system');
      setIsPartnerConnected(false);
      setIsFindingPartner(false);
    } else {
      if (isFindingPartner) return;

      if (hasCameraPermission === false) {
        toast({ title: "Camera Required", description: "Camera permission is required to find a video chat partner.", variant: "destructive"});
        return;
      }
      if (hasCameraPermission === undefined) {
         toast({ title: "Camera Initializing", description: "Please wait for camera access before finding a partner.", variant: "default"});
        return;
      }


      setIsFindingPartner(true);
      addMessage('Searching for a partner...', 'system');

      // Simulate finding a partner
      await new Promise(resolve => setTimeout(resolve, 2000));

      const found = Math.random() > 0.3; // Simulate 70% chance of finding a partner

      if (found) {
        setIsPartnerConnected(true);
      } else {
        addMessage('No partner found at the moment. Try again later.', 'system');
        setIsPartnerConnected(false);
      }
      setIsFindingPartner(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPartnerConnected, isFindingPartner, toast, hasCameraPermission]);


  const videoFeedStyle = useMemo(() => ({ width: '240px', height: '180px' }), []);
  const chatWindowStyle = useMemo(() => ({ width: '450px', height: '500px' }), []);
  const inputAreaHeight = 60;
  const scrollableChatHeightStyle = useMemo(() => ({
    height: `calc(100% - ${inputAreaHeight}px)`,
  }), [inputAreaHeight]);


  return (
    <div className="flex flex-col items-center justify-start h-full p-4 overflow-auto">

      <div className="flex justify-center gap-4 mb-4 w-full">
        <div
          className={cn(
            'window flex flex-col',
            theme === 'theme-7' && 'active glass',
            theme === 'theme-98' ? 'no-padding-window-body' : ''
          )}
          style={videoFeedStyle}
        >
          <div className={cn('title-bar flex-shrink-0', "text-sm")}>
            <div className="title-bar-text">Your Video</div>
          </div>
          <div className={cn(
            'window-body flex-grow overflow-hidden relative',
            theme === 'theme-98' ? 'p-0' :
            (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'p-0' : 'p-0') : 'p-0')
          )}>
            <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover bg-black" data-ai-hint="local camera video" />
            {hasCameraPermission === false && (
              <Alert variant="destructive" className="m-1 absolute bottom-0 left-0 right-0 text-xs p-1">
                <AlertTitle className="text-xs">Camera Denied</AlertTitle>
              </Alert>
            )}
             {hasCameraPermission === undefined && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">Requesting camera...</p>
                </div>
              )}
          </div>
        </div>

        <div
          className={cn(
            'window flex flex-col',
            theme === 'theme-7' && 'active glass',
            theme === 'theme-98' ? 'no-padding-window-body' : ''
          )}
          style={videoFeedStyle}
        >
          <div className={cn('title-bar flex-shrink-0', "text-sm")}>
            <div className="title-bar-text">Partner's Video</div>
          </div>
           <div className={cn(
            'window-body flex-grow overflow-hidden relative',
            theme === 'theme-98' ? 'p-0' :
            (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'p-0' : 'p-0') : 'p-0')
          )}>
            <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera video" />
            {!isPartnerConnected && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                <p className="text-white text-center p-2 text-sm">Partner video unavailable</p>
                </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn('window', theme === 'theme-7' ? 'active glass' : '', 'mb-4 flex flex-col')}
        style={chatWindowStyle}
      >
        <div className={cn("title-bar", 'flex-shrink-0')}>
          <div className="title-bar-text">Chat</div>
        </div>
        <div
          className={cn(
            'window-body window-body-content flex-grow',
            theme === 'theme-98' ? 'p-0.5' :
            (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'glass-body-padding' : 'has-space') : 'p-2')
          )}
        >
          <ScrollArea
             ref={scrollAreaRef}
             className={cn(
              "flex-grow",
              theme === 'theme-98' ? 'sunken-panel tree-view p-1' : 'border p-2 bg-white bg-opacity-80 dark:bg-gray-700 dark:bg-opacity-80'
            )}
            style={scrollableChatHeightStyle}
            theme={theme}
          >
            <ul ref={chatMessagesListRef} className={cn('h-auto break-words', theme === 'theme-98' ? '' : 'space-y-1')}>
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  className={cn(
                    "flex mb-1",
                    msg.sender === "me" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-lg px-3 py-1 max-w-xs lg:max-w-md",
                      msg.sender === "me"
                        ? theme === 'theme-98' ? 'bg-blue-500 text-white px-1' : 'bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100'
                        : theme === 'theme-98' ? 'bg-gray-300 px-1' : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100',
                      msg.sender === 'system' ? 'text-center w-full text-gray-500 dark:text-gray-400 italic text-xs' : ''
                    )}
                  >
                    {msg.text}
                  </div>
                  {msg.sender !== "system" && (
                    <span className={cn("text-xxs ml-1 self-end", theme === 'theme-98' ? 'text-gray-700' : 'text-gray-400 dark:text-gray-500')}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
          <div
            className={cn(
              "p-2 flex-shrink-0",
              theme === 'theme-98' ? 'input-area status-bar' : (theme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : '')
            )}
            style={{ height: `${inputAreaHeight}px` }}
          >
            <div className="flex items-center gap-2">
               <Button
                onClick={handleToggleConnection}
                disabled={isFindingPartner || hasCameraPermission === undefined || hasCameraPermission === false}
                className="px-2"
              >
                {isFindingPartner ? 'Searching...' : (isPartnerConnected ? 'Disconnect' : 'Find Partner')}
              </Button>
              <Input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-2 py-1"
                disabled={!isPartnerConnected || isFindingPartner}
              />
              <Button onClick={handleSendMessage} disabled={!isPartnerConnected || isFindingPartner || !newMessage.trim()} className="accent px-2">
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoChatPage;
