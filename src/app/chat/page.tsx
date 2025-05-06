
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
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../../lib/socket-types';


interface Message {
  id: string;
  text: string;
  sender: 'user' | 'peer' | 'system';
}

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3001';


export default function ChatPage() {
  const { theme } = useTheme();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const chatType = searchParams.get('type') as 'text' | 'video' | null;
  const interestsQuery = searchParams.get('interests') || '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  
  const [isConnectedToPeer, setIsConnectedToPeer] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);


  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);


  const messagesEndRef = useRef<HTMLDivElement | HTMLLIElement>(null);

  const scrollToBottom = () => {
    (messagesEndRef.current as HTMLElement)?.scrollIntoView({ behavior: "smooth" });
  };

   useEffect(scrollToBottom, [messages]);

   const addSystemMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: `system-${Date.now()}`, text, sender: 'system' }]);
   }, []);

  const resetStateForNewChat = useCallback(() => {
        setIsConnectedToPeer(false);
        setIsFindingPartner(false);
        setMessages([]);
        setCurrentRoom(null);

        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        localStream?.getTracks().forEach(track => track.stop());
        setLocalStream(null);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        setHasCameraPermission(null); // Reset camera permission status
   }, [localStream]);


   const handleNewChat = useCallback(() => {
        console.log("Handling new chat / Reconnecting...");
        resetStateForNewChat();
        if (socketRef.current && chatType) {
            const interestsArray = interestsQuery ? interestsQuery.split(',') : [];
            socketRef.current.emit('findPartner', { chatType, interests: interestsArray });
            setIsFindingPartner(true);
            const searchMessage = interestsQuery
                ? `Searching for a ${chatType} partner with interests: ${interestsQuery.replace(/,/g, ', ')}...`
                : `Searching for any available ${chatType} partner...`;
            addSystemMessage(searchMessage);
            toast({ title: "Searching...", description: searchMessage });
        }
   }, [resetStateForNewChat, chatType, interestsQuery, addSystemMessage, toast]);


  useEffect(() => {
    if (!chatType) {
      toast({ title: "Error", description: "Missing chat type.", variant: "destructive" });
      router.push('/');
      return;
    }

    socketRef.current = io(SOCKET_SERVER_URL);
    const socket = socketRef.current;

    socket.on('connect', () => {
        console.log('Connected to socket server with ID:', socket.id);
        addSystemMessage("Connected to server. Looking for a partner...");
        handleNewChat();
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        addSystemMessage(`Connection to chat server failed: ${error.message}. Please try again later.`);
        toast({ title: "Server Connection Error", description: "Could not connect to the chat server.", variant: "destructive" });
        setIsFindingPartner(false);
    });

    socket.on('waitingForPartner', () => {
        setIsFindingPartner(true);
        addSystemMessage("Waiting for a partner to join...");
        toast({ title: "Waiting", description: "No partners available right now, waiting..." });
    });

    socket.on('partnerFound', async ({ peerId, room, initiator }) => {
        console.log('Partner found:', peerId, 'Room:', room, 'Initiator:', initiator);
        setIsFindingPartner(false);
        setIsConnectedToPeer(true);
        setCurrentRoom(room);
        addSystemMessage(`Partner found! You are now connected in room: ${room.substring(0,10)}...`);
        toast({ title: "Partner Found!", description: "You are now connected." });

        peerConnectionRef.current = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Example STUN server
        });
        const pc = peerConnectionRef.current;

        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.emit('webrtcSignal', { to: peerId, signal: { candidate: event.candidate } });
            }
        };

        pc.ontrack = (event) => {
            if (remoteVideoRef.current && event.streams[0]) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };
        
        if (chatType === 'video') {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    addSystemMessage("Media devices API not available in this browser.");
                    throw new Error("Media devices API not available.");
                }
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setLocalStream(stream);
                setHasCameraPermission(true);
                stream.getTracks().forEach(track => pc.addTrack(track, stream));
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }
            } catch (mediaError) {
                console.error('Error accessing camera/microphone:', mediaError);
                setHasCameraPermission(false);
                addSystemMessage("Camera/Microphone access denied. Video chat may not work fully.");
                toast({
                    variant: 'destructive',
                    title: 'Media Access Denied',
                    description: 'Please enable camera and microphone permissions.',
                });
            }
        } else {
            setHasCameraPermission(null); // Not a video chat
        }


        if (initiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (socketRef.current) {
                socketRef.current.emit('webrtcSignal', { to: peerId, signal: { sdp: offer } });
            }
        }
    });

    socket.on('webrtcSignal', async (data) => {
        const pc = peerConnectionRef.current;
        if (!pc) return;

        try {
            if (data.signal.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
                if (data.signal.sdp.type === 'offer') {
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    if (socketRef.current) {
                         socketRef.current.emit('webrtcSignal', { to: data.from, signal: { sdp: answer } });
                    }
                }
            } else if (data.signal.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
            }
        } catch (error) {
            console.error("Error handling WebRTC signal:", error);
            addSystemMessage("Error during WebRTC negotiation. Video/audio might not work.");
        }
    });

    socket.on('receiveMessage', (data) => {
        setMessages((prev) => [...prev, { id: `peer-${Date.now()}`, text: data.message, sender: 'peer' }]);
    });

    socket.on('peerDisconnected', () => {
        addSystemMessage("Your partner has disconnected.");
        toast({ title: "Partner Disconnected", description: "The other user left the chat.", variant: "destructive" });
        resetStateForNewChat(); 
        addSystemMessage("Automatically searching for a new partner...");
        setTimeout(() => handleNewChat(), 2000); 
    });


    return () => {
        console.log("Cleaning up chat page, disconnecting socket");
        if (socketRef.current) {
            if (currentRoom) {
                socketRef.current.emit('leaveChat', currentRoom);
            }
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        resetStateForNewChat();
    };
  }, [chatType, interestsQuery, router, toast, addSystemMessage, resetStateForNewChat, handleNewChat]); 
  

  useEffect(() => {
      if (localStream && localVideoRef.current && !localVideoRef.current.srcObject) {
          localVideoRef.current.srcObject = localStream;
      }
  }, [localStream]);


  const sendMessage = () => {
    if (inputText.trim() && socketRef.current && currentRoom && isConnectedToPeer) {
        const messageData = { room: currentRoom, message: inputText };
        socketRef.current.emit('sendMessage', messageData);
        setMessages((prev) => [...prev, { id: `user-${Date.now()}`, text: inputText, sender: 'user' }]);
        setInputText('');
    } else if (!isConnectedToPeer) {
         addSystemMessage("Cannot send message: Not connected to a peer.");
         toast({title: "Not Connected", description: "You must be connected to a peer to send messages.", variant:"destructive"});
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

   const handleDisconnectButtonClick = () => {
        console.log("User clicked disconnect button.");
        if (socketRef.current) {
            if (currentRoom) {
                 socketRef.current.emit('leaveChat', currentRoom);
            }
        }
        addSystemMessage("You have disconnected. Redirecting to home page...");
        toast({ title: "Disconnected", description: "You have left the chat." });
        setTimeout(() => router.push('/'), 1500); 
   };


  if (!chatType) {
    return <div className="p-4">Invalid chat type specified. <Button onClick={() => router.push('/')}>Go Home</Button></div>;
  }

  const renderMessages = () => {
     const showWaitingMessage = chatType === 'text' && !isConnectedToPeer && isFindingPartner && messages.filter(m => m.sender === 'system').length <= 2; 


     if (theme === 'theme-98') {
        return (
           <ul className="tree-view messages flex-grow overflow-y-auto p-2 bg-white">
            {showWaitingMessage && !messages.find(m => m.text.includes("Waiting for a partner to join...")) && (
                 <li className="text-center italic text-gray-500 text-xs mb-1">
                    Looking for a chat partner...
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
     } else { // theme-7 or other
        return (
          <div className="messages flex-grow overflow-y-auto p-2" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
            {showWaitingMessage && !messages.find(m => m.text.includes("Waiting for a partner to join...")) && (
                <div className="text-center italic text-gray-400 text-xs mb-2">
                    Looking for a chat partner...
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
      {(isFindingPartner && !isConnectedToPeer && messages.filter(m=>m.sender === 'system').length < 2) && 
        <div className="text-center p-4">Connecting... Please wait.</div>
      }


      {chatType === 'video' && (
        <div className="flex justify-center space-x-2 mb-2 w-full max-w-xl">
          <div className={cn(
              "window w-[240px]", 
              theme === 'theme-7' && 'active glass'
             )}
          >
            <div className="title-bar">
                <div className="title-bar-text">You</div>
                 <div className="title-bar-controls"></div>
            </div>
            <div className={cn(
                "window-body flex flex-col justify-center items-center relative aspect-[4/3] p-0",
                theme === 'theme-98' && 'm-0' 
                )}
             >
                 <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                 { hasCameraPermission === false && (
                      <Alert variant="destructive" className="absolute bottom-1 left-1 right-1 text-xs p-1">
                        <AlertTitle className="text-xs">Cam/Mic Denied</AlertTitle>
                        <AlertDescription className="text-xs">Enable permissions.</AlertDescription>
                     </Alert>
                  )}
                 { (isFindingPartner || (hasCameraPermission === null && !localStream && chatType === 'video' && !isConnectedToPeer)) && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white text-xs">Loading cam...</div>
                 )}
            </div>
          </div>
           <div className={cn(
               "window w-[240px]", 
               theme === 'theme-7' && 'active glass'
             )}
           >
            <div className="title-bar">
                <div className="title-bar-text">Stranger</div>
                 <div className="title-bar-controls"></div>
            </div>
             <div className={cn(
                "window-body flex flex-col justify-center items-center relative aspect-[4/3] bg-gray-800 p-0",
                 theme === 'theme-98' && 'm-0'
                )}
              >
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                 { !isConnectedToPeer && !isFindingPartner && (
                     <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50 text-xs">Waiting...</div>
                 )}
                 { isConnectedToPeer && !remoteVideoRef.current?.srcObject && (
                     <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50 text-xs">Connecting video...</div>
                 )}
             </div>
          </div>
        </div>
      )}

       <div className={cn(
           "window flex flex-col",
           chatType === 'video' ? 'h-[calc(100vh-300px)] w-full max-w-[400px] mt-2' : 'flex-1 w-full max-w-sm',
           theme === 'theme-7' && 'active glass'
         )}
         style={chatType === 'video' ? { minHeight: '200px' } : {}}
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
                placeholder={isConnectedToPeer ? "Type message..." : isFindingPartner ? "Finding partner..." : "Disconnected"}
                disabled={!isConnectedToPeer || isFindingPartner}
                className="flex-grow mr-1"
                />
                <Button onClick={sendMessage} disabled={!isConnectedToPeer || isFindingPartner || !inputText.trim()} className="accent mr-1">
                Send
                </Button>
                 <Button onClick={handleDisconnectButtonClick} variant="secondary" className="flex-shrink-0">
                    {isFindingPartner ? "Cancel" : "Disconnect"}
                 </Button>
            </div>
         </div>
      </div>
    </div>
  );
}

