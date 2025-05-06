

'use client';

import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'peer' | 'system';
}

export default function ChatPage() {
  const { theme } = useTheme();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const chatType = searchParams.get('type') as 'text' | 'video' | null;
  const interests = searchParams.get('interests') || '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | HTMLLIElement>(null);

  const scrollToBottom = () => {
    (messagesEndRef.current as HTMLElement)?.scrollIntoView({ behavior: "smooth" });
  };

   useEffect(scrollToBottom, [messages]);

   const addSystemMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: `system-${Date.now()}`, text, sender: 'system' }]);
   }, []);


   const setupWebRTC = useCallback(async () => {
     if (!chatType) {
       toast({ title: "Error", description: "Missing chat type.", variant: "destructive" });
       router.push('/');
       return;
     }

     setIsConnecting(true);
     const connectionMessage = interests
       ? `Searching for a ${chatType} partner with interests: ${interests}`
       : `Searching for any available ${chatType} partner...`;
     addSystemMessage(connectionMessage);
     toast({ title: "Connecting...", description: connectionMessage });

     try {
       peerConnectionRef.current = new RTCPeerConnection({});

       dataChannelRef.current = peerConnectionRef.current.createDataChannel('chat');
       setupDataChannelListeners(dataChannelRef.current);

       peerConnectionRef.current.ondatachannel = (event) => {
         dataChannelRef.current = event.channel;
         setupDataChannelListeners(dataChannelRef.current);
       };

       if (chatType === 'video') {
         if (!navigator.mediaDevices?.getUserMedia) {
            addSystemMessage("Media devices API not available.");
           throw new Error("Media devices API not available.");
         }
         try {
           const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
           setLocalStream(stream);
           setHasCameraPermission(true);
           stream.getTracks().forEach(track => peerConnectionRef.current?.addTrack(track, stream));
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
         } catch (mediaError) {
           console.error('Error accessing camera/microphone:', mediaError);
           setHasCameraPermission(false);
           addSystemMessage("Camera/Microphone access denied. Please enable permissions.");
           toast({
             variant: 'destructive',
             title: 'Media Access Denied',
             description: 'Please enable camera and microphone permissions in your browser settings.',
           });
         }
       } else {
         setHasCameraPermission(null);
       }

       peerConnectionRef.current.onicecandidate = (event) => {
         if (event.candidate) {
           console.log("Sending ICE candidate (simulated):", event.candidate);
         }
       };

       peerConnectionRef.current.ontrack = (event) => {
         if (remoteVideoRef.current && event.streams[0]) {
           remoteVideoRef.current.srcObject = event.streams[0];
         }
       };

       console.log(`Simulating signaling and connection (Interests: ${interests || 'any'})...`);
       await new Promise(resolve => setTimeout(resolve, 2000));

       setIsConnected(true);
       addSystemMessage("You are now connected.");
       toast({ title: "Connected!", description: "You are now connected." });

     } catch (error) {
       console.error("WebRTC setup failed:", error);
       const errorMessage = error instanceof Error ? error.message : String(error);
       addSystemMessage(`Connection Failed: ${errorMessage}`);
       toast({ title: "Connection Failed", description: `Could not start ${chatType} chat. Error: ${errorMessage}`, variant: "destructive" });
       // eslint-disable-next-line @typescript-eslint/no-use-before-define
       handleDisconnect(false);
     } finally {
       setIsConnecting(false);
     }
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [chatType, interests, router, toast, addSystemMessage]);


   const setupDataChannelListeners = (channel: RTCDataChannel | null) => {
       if (!channel) return;
       channel.onopen = () => {
           console.log("Data channel opened");
           // System message for connection is handled in setupWebRTC success
           // to avoid duplicate messages if connection is already considered established.
       };
       channel.onmessage = (event) => {
           const receivedText = event.data;
           setMessages((prev) => [...prev, { id: Date.now().toString(), text: receivedText, sender: 'peer' }]);
       };
       channel.onclose = () => {
           console.log("Data channel closed");
           if (isConnected) {
               addSystemMessage("Peer disconnected.");
               toast({ title: "Peer Disconnected", description: "The other user left the chat.", variant: "destructive" });
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
               handleDisconnect();
           }
       };
       channel.onerror = (error) => {
           console.error("Data channel error:", error);
           addSystemMessage("Chat error occurred.");
           toast({title: "Chat Error", description: "An error occurred in the text chat.", variant:"destructive"});
       };
   };


  useEffect(() => {
    setupWebRTC();
    return () => {
       // eslint-disable-next-line @typescript-eslint/no-use-before-define
      handleDisconnect(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
      if (localStream && localVideoRef.current && !localVideoRef.current.srcObject) {
          localVideoRef.current.srcObject = localStream;
      }
  }, [localStream]);


  const sendMessage = () => {
    if (inputText.trim() && dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        const message: Message = { id: Date.now().toString(), text: inputText, sender: 'user' };
        setMessages((prev) => [...prev, message]);
        try {
             dataChannelRef.current.send(inputText);
        } catch (error) {
            console.error("Failed to send message:", error);
            addSystemMessage("Failed to send message.");
             toast({title: "Send Error", description: "Could not send message.", variant:"destructive"});
        }
        setInputText('');
    } else if (!isConnected || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
         addSystemMessage("Cannot send message: Not connected.");
         toast({title: "Not Connected", description: "You must be connected to send messages.", variant:"destructive"});
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

   const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
       if (e.key === 'Enter') {
         sendMessage();
       }
     };

   const handleDisconnect = useCallback((redirect = true) => {
       if (!peerConnectionRef.current && !localStream && !isConnected && !isConnecting) {
           if (redirect && router) {
               router.push('/');
           }
           return;
       }
        console.log("Disconnecting...");

        const wasConnected = isConnected;

       setIsConnected(false);
       setIsConnecting(false);

       if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if (dataChannelRef.current) {
            dataChannelRef.current.close();
            dataChannelRef.current = null;
        }

       localStream?.getTracks().forEach(track => track.stop());
       setLocalStream(null);

       if (localVideoRef.current?.srcObject) {
           const stream = localVideoRef.current.srcObject as MediaStream;
           stream?.getTracks().forEach(track => track.stop());
           localVideoRef.current.srcObject = null;
       }
        if (remoteVideoRef.current?.srcObject) {
            const stream = remoteVideoRef.current.srcObject as MediaStream;
            stream?.getTracks().forEach(track => track.stop());
            remoteVideoRef.current.srcObject = null;
        }

       // Clear messages on disconnect only if redirecting, or if we want to start fresh.
       // If not redirecting, user might want to see the history.
       // For now, let's clear them to avoid confusion if they try to reconnect.
       setMessages([]);
       setHasCameraPermission(null);

        if (wasConnected) {
             addSystemMessage("You have disconnected.");
             toast({ title: "Disconnected", description: "You have left the chat." });
        } else if (!isConnecting) { // If not connecting and not previously connected, means manual disconnect or error before connection
            addSystemMessage("Disconnected."); // Generic disconnect message
        }


       if (redirect && router) {
           router.push('/');
       }
   }, [isConnected, isConnecting, localStream, router, toast, addSystemMessage]);


  if (!chatType) {
    return <div className="p-4">Invalid chat type specified. <Button onClick={() => router.push('/')}>Go Home</Button></div>;
  }

  const renderMessages = () => {
     // Add a check for initial "Waiting for partner" message
     // Only show "Waiting for partner..." if no other system messages exist (like connection attempts)
     const showWaitingMessage = chatType === 'text' && !isConnected && !isConnecting && messages.length === 0;

     if (theme === 'theme-98') {
        return (
           <ul className="tree-view messages flex-grow overflow-y-auto p-2 bg-white">
            {showWaitingMessage && (
                 <li className="text-center italic text-gray-500 text-xs mb-1">
                    Waiting for a chat partner...
                 </li>
            )}
             {messages.map((msg) => (
               <li key={msg.id} className={cn(
                   'mb-1',
                   msg.sender === 'user' ? 'text-right' : msg.sender === 'peer' ? 'text-left' : 'text-center italic text-gray-500 text-xs'
                   )}>
                 <span className={cn(
                     'inline-block p-1 rounded max-w-[80%] break-words',
                      msg.sender === 'user' ? 'bg-blue-200' :
                      msg.sender === 'peer' ? 'bg-gray-200' :
                      'bg-transparent'
                     )}>
                  {msg.sender === 'user' ? 'You: ' : msg.sender === 'peer' ? 'Peer: ' : ''} {msg.text}
                 </span>
               </li>
             ))}
             <li ref={messagesEndRef as RefObject<HTMLLIElement>} className="h-0" />
           </ul>
        );
     } else {
        return (
          <div className="messages flex-grow overflow-y-auto p-2" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
            {showWaitingMessage && (
                <div className="text-center italic text-gray-400 text-xs mb-2">
                    Waiting for a chat partner...
                </div>
            )}
             {messages.map((msg) => (
             <div key={msg.id} className={cn(
                 'mb-2',
                  msg.sender === 'user' ? 'text-right' : msg.sender === 'peer' ? 'text-left' : 'text-center italic text-gray-400 text-xs'
                 )}>
                 <span className={cn(
                     'inline-block p-2 rounded max-w-[80%] break-words',
                     msg.sender === 'system' ? 'text-gray-300 bg-transparent' : 'text-black',
                     msg.sender === 'user' ? 'bg-blue-200 bg-opacity-70' :
                     msg.sender === 'peer' ? 'bg-gray-200 bg-opacity-70' :
                     'bg-transparent'
                  )}>
                 {msg.text}
                 </span>
             </div>
             ))}
              <div ref={messagesEndRef as RefObject<HTMLDivElement>} />
          </div>
        );
     }
  };

  return (
    <div className={cn("flex flex-col items-center flex-1 p-4 h-full")}>
      {isConnecting && messages.length === 0 && <div className="text-center p-4">Connecting... Please wait.</div>}

      {chatType === 'video' && (
        <div className="flex justify-center space-x-4 mb-4 w-full max-w-4xl">
          <div className={cn(
              "window w-1/3",
              theme === 'theme-7' && 'active glass'
             )}
          >
            <div className="title-bar">
                <div className="title-bar-text">You</div>
                 <div className="title-bar-controls"></div>
            </div>
            <div className="window-body flex flex-col justify-center items-center relative aspect-video p-0">
                 <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                 { hasCameraPermission === false && (
                      <Alert variant="destructive" className="absolute bottom-1 left-1 right-1 text-xs p-1">
                        <AlertTitle className="text-xs">Cam/Mic Denied</AlertTitle>
                        <AlertDescription className="text-xs">Enable permissions.</AlertDescription>
                     </Alert>
                  )}
                 { (isConnecting || (hasCameraPermission === null && !localStream && chatType === 'video')) && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white text-xs">Loading cam...</div>
                 )}
            </div>
          </div>
           <div className={cn(
               "window w-1/3",
               theme === 'theme-7' && 'active glass'
             )}
           >
            <div className="title-bar">
                <div className="title-bar-text">Stranger</div>
                 <div className="title-bar-controls"></div>
            </div>
             <div className="window-body flex flex-col justify-center items-center relative aspect-video bg-gray-800 p-0">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                 { !isConnected && !isConnecting && (
                     <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50 text-xs">Waiting...</div>
                 )}
                 { isConnected && !remoteVideoRef.current?.srcObject && (
                     <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50 text-xs">Connecting video...</div>
                 )}
             </div>
          </div>
        </div>
      )}

       <div className={cn(
           "window flex flex-col",
           chatType === 'video' ? 'h-[60%] w-full max-w-[300px]' : 'flex-1 w-full max-w-sm',
           theme === 'theme-7' && 'active glass'
         )}
       >
         <div className="title-bar">
             <div className="title-bar-text">Chat</div>
              <div className="title-bar-controls"></div>
         </div>
         <div className={cn(
             "window-body flex flex-col flex-1 p-0 overflow-hidden",
             theme === 'theme-7' && 'has-space'
           )}
           style={theme === 'theme-7' ? { backgroundColor: 'transparent' } : {}}
         >
             {renderMessages()}
            <div className="input-area flex p-2 border-t bg-inherit">
                <Input
                type="text"
                value={inputText}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder={isConnected ? "Type message..." : isConnecting ? "Connecting..." : "Disconnected"}
                disabled={!isConnected || isConnecting}
                className="flex-grow mr-1"
                />
                <Button onClick={sendMessage} disabled={!isConnected || isConnecting || !inputText.trim()} className="accent mr-1">
                Send
                </Button>
                 <Button onClick={() => handleDisconnect()} variant="secondary" className="flex-shrink-0">
                    Disconnect
                 </Button>
            </div>
         </div>
      </div>
    </div>
  );
}

    