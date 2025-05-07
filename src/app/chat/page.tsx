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

const ChatPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { theme } = useTheme();

  const chatType = useMemo(() => searchParams.get('type') as 'text' | 'video' || 'text', [searchParams]);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | undefined>(undefined);
  const chatMessagesRef = useRef<HTMLUListElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);


  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      const newMessageItem = { id: Date.now().toString(), text, sender, timestamp: new Date() };
      if (sender === 'system') {
        const filteredMessages = prevMessages.filter(msg => 
          !(msg.sender === 'system' && (msg.text.includes('Connected with a partner') || msg.text.includes('Not connected. Try finding a new partner') || msg.text.includes('Searching for a partner...')))
        );
        return [...filteredMessages, newMessageItem];
      }
      return [...prevMessages, newMessageItem];
    });
  }, []);

  useEffect(() => {
    if (chatMessagesRef.current && scrollAreaRef.current) {
        const scrollViewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollViewport) {
            scrollViewport.scrollTop = scrollViewport.scrollHeight;
        }
    }
  }, [messages]);

 const cleanupConnections = useCallback(() => {
    console.log("ChatPage: Cleanup connections called");
    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
}, []);


  useEffect(() => {
    let didCancel = false;
    const getInitialCameraStream = async () => {
      if (chatType === 'video' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
        if (hasCameraPermission === undefined) {
          console.log("ChatPage: Attempting to get initial user media for video chat.");
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (!didCancel) {
              console.log("ChatPage: Initial camera access granted.");
              setHasCameraPermission(true);
              localStreamRef.current = stream;
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
              }
            } else {
              console.log("ChatPage: Camera access granted but component unmounted/effect cancelled, stopping tracks.");
              stream.getTracks().forEach(track => track.stop());
            }
          } catch (error) {
            if (!didCancel) {
              console.error('ChatPage: Error accessing camera initially:', error);
              setHasCameraPermission(false);
               toast({ 
                variant: 'destructive',
                title: 'Camera Access Denied',
                description: 'Please enable camera permissions for video chat.',
              });
            }
          }
        } else if (hasCameraPermission === true && localStreamRef.current && localVideoRef.current && !localVideoRef.current.srcObject) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      } else if (chatType !== 'video' && localStreamRef.current) {
        if (!didCancel) {
            console.log("ChatPage: Chat type is not video or unmounting, cleaning up local stream.");
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
            if (localVideoRef.current) localVideoRef.current.srcObject = null;
            if (!didCancel && chatType !== 'video') setHasCameraPermission(undefined); // Reset for text chat
        }
      } else if (chatType === 'video' && typeof navigator.mediaDevices?.getUserMedia !== 'function' && !didCancel){
         setHasCameraPermission(false);
         toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Camera access (getUserMedia) is not supported by your browser.'});
      }
    };

    getInitialCameraStream();
    
    return () => {
      didCancel = true;
      console.log("ChatPage: Cleanup for initial camera stream effect.");
       // Only cleanup stream if it was for video and we are navigating away or changing type
       if (localStreamRef.current && chatType === 'video') { 
          console.log("ChatPage: Cleaning up local stream on effect unmount (video chat).");
          cleanupConnections();
       }
    };
  }, [chatType, hasCameraPermission, cleanupConnections, toast]);

  useEffect(() => {
    if (isPartnerConnected) {
      addMessage('Connected with a partner. You can start chatting!', 'system');
    } else if (!isFindingPartner && ( (chatType === 'text') || (chatType === 'video' && hasCameraPermission !== undefined) ) ) {
      // For video, only show "Not connected" if camera status is determined
      addMessage('Not connected. Try finding a new partner.', 'system');
    }
  }, [isPartnerConnected, isFindingPartner, chatType, hasCameraPermission, addMessage]);


  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim()) return;
    if (!isPartnerConnected) {
        toast({title: "Not Connected", description: "You must be connected to a partner to send messages.", variant: "default"});
        return;
    }
    addMessage(newMessage, 'me'); 
    setNewMessage('');
  }, [newMessage, addMessage, isPartnerConnected, toast]); 


  const handleToggleConnection = useCallback(async () => {
    if (isPartnerConnected) {
      addMessage('You have disconnected from the partner.', 'system');
      setIsPartnerConnected(false);
      setIsFindingPartner(false); 
    } else {
      if (isFindingPartner) return; 

      if (chatType === 'video') {
        if (hasCameraPermission === false) {
          toast({ title: "Camera Required", description: "Camera permission is required to find a video chat partner.", variant: "destructive"});
          return;
        }
        if (hasCameraPermission === undefined) {
          toast({ title: "Camera Initializing", description: "Please wait for camera access before finding a partner.", variant: "default"});
          return;
        }
      }

      setIsFindingPartner(true);
      addMessage('Searching for a partner...', 'system');
      
      await new Promise(resolve => setTimeout(resolve, 2000)); 

      const found = Math.random() > 0.3; 

      if (found) {
        setIsPartnerConnected(true);
      } else {
        addMessage('No partner found at the moment. Try again later.', 'system');
        setIsPartnerConnected(false); // Explicitly set false if not found
      }
      setIsFindingPartner(false);
    }
  }, [isPartnerConnected, isFindingPartner, addMessage, toast, chatType, hasCameraPermission]); 


  const videoFeedStyle = useMemo(() => ({ width: '240px', height: '180px' }), []);
  const chatWindowStyle = useMemo(() => (
    chatType === 'video'
    ? { width: '350px', height: '400px' } 
    : { width: '450px', height: '500px' }
  ), [chatType]);

  const inputAreaHeight = 60; 
  const scrollableChatHeightStyle = useMemo(() => ({
    height: `calc(100% - ${inputAreaHeight}px)`,
  }), [inputAreaHeight]);


  return (
    <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto">
      {chatType === 'video' && (
        <div className="flex justify-center gap-4 mb-4 w-full">
          <div
            className={cn(
              'window flex flex-col', // Added flex flex-col
              theme === 'theme-7' && 'active glass', 
              theme === 'theme-98' ? 'no-padding-window-body' : ''
            )}
            style={videoFeedStyle}
          >
            <div className={cn('title-bar flex-shrink-0', "text-sm")}> {/* Added flex-shrink-0 */}
              <div className="title-bar-text">Your Video</div>
            </div>
            <div className={cn(
              'window-body flex-grow overflow-hidden relative', // Added flex-grow
              theme === 'theme-98' ? 'p-0' : 
              (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'p-0' : 'p-0') : 'p-0')
            )}>
              <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover bg-black" data-ai-hint="local camera video" />
              {hasCameraPermission === false && (
                <Alert variant="destructive" className="m-1 absolute bottom-0 left-0 right-0 text-xs p-1">
                  <AlertTitle className="text-xs">Camera Denied</AlertTitle>
                </Alert>
              )}
               {hasCameraPermission === undefined && chatType === 'video' && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">Requesting camera...</p>
                </div>
              )}
            </div>
          </div>

          <div
            className={cn(
              'window flex flex-col', // Added flex flex-col
              theme === 'theme-7' && 'active glass', 
              theme === 'theme-98' ? 'no-padding-window-body' : ''
            )}
            style={videoFeedStyle}
          >
            <div className={cn('title-bar flex-shrink-0', "text-sm")}> {/* Added flex-shrink-0 */}
              <div className="title-bar-text">Partner's Video</div>
            </div>
             <div className={cn(
              'window-body flex-grow overflow-hidden relative', // Added flex-grow
              theme === 'theme-98' ? 'p-0' : 
              (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'p-0' : 'p-0') : 'p-0')
            )}>
              <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera video" />
               <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">Partner video unavailable</p>
                </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={cn('window flex flex-col', theme === 'theme-7' ? 'active glass' : '', 'mb-4')} // Added flex flex-col
        style={chatWindowStyle}
      >
        <div className={cn("title-bar", 'flex-shrink-0')}> {/* Added flex-shrink-0 */}
          <div className="title-bar-text">Chat</div>
        </div>
        <div
          className={cn(
            'window-body window-body-content flex-grow', // Added flex-grow
            theme === 'theme-98' ? 'p-0.5' : (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'glass-body-padding' : 'has-space') : 'p-2')
          )}
           // Removed explicit height style
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
            <ul ref={chatMessagesRef} className={cn('h-auto break-words', theme === 'theme-98' ? '' : 'space-y-1')}>
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
            <div className="flex items-center gap-2 h-full">
              <Button
                onClick={handleToggleConnection}
                disabled={isFindingPartner || (chatType === 'video' && (hasCameraPermission === undefined || hasCameraPermission === false))}
                className="h-full" 
              >
                {isFindingPartner ? 'Searching...' : (isPartnerConnected ? 'Disconnect' : 'Find Partner')}
              </Button>
              <Input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-grow h-full" 
                disabled={!isPartnerConnected || isFindingPartner} 
              />
              <Button onClick={handleSendMessage} disabled={!isPartnerConnected || isFindingPartner || !newMessage.trim()} className="accent h-full">
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
