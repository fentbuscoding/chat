
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/lib/socket-types';
import { DraggableWindow } from '@/components/draggable-window';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area'; // For scrollable chat messages

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3001';

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

  const chatType = searchParams.get('type') as 'text' | 'video' || 'text';
  const interests = searchParams.get('interests')?.split(',') || [];

  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | undefined>(undefined);

  const addMessage = (text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString(), text, sender, timestamp: new Date() },
    ]);
  };

  const cleanupConnections = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setIsConnected(false);
    setPartnerId(null);
    setRoom(null);
  }, []);

  const setupWebRTC = useCallback(async () => {
    if (chatType !== 'video' || !navigator.mediaDevices) return;

    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate && socket && partnerId && room) {
        socket.emit('webrtcSignal', { to: partnerId, signal: { candidate: event.candidate }, room });
      }
    };

    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setHasCameraPermission(true);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      stream.getTracks().forEach(track => {
        if (localStreamRef.current) {
           peerConnectionRef.current?.addTrack(track, localStreamRef.current)
        }
      });
    } catch (error) {
      console.error('Error accessing camera:', error);
      setHasCameraPermission(false);
      toast({
        variant: 'destructive',
        title: 'Camera Access Denied',
        description: 'Please enable camera permissions to use video chat.',
      });
      // If camera is essential and denied, perhaps force leave or switch to text?
      // For now, user can continue without video if they deny.
    }
  }, [chatType, socket, partnerId, room, toast]);


  useEffect(() => {
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to socket server');
      handleFindPartner(newSocket);
    });

    newSocket.on('waitingForPartner', () => {
      addMessage('Waiting for a partner...', 'system');
      setIsFindingPartner(true);
    });

    newSocket.on('partnerFound', async (data) => {
      addMessage(`Partner found! You are connected. Room: ${data.room}`, 'system');
      setIsConnected(true);
      setIsFindingPartner(false);
      setPartnerId(data.peerId);
      setRoom(data.room);

      if (chatType === 'video') {
        await setupWebRTC();
        if (data.initiator && peerConnectionRef.current && socket) {
          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);
          newSocket.emit('webrtcSignal', { to: data.peerId, signal: { sdp: offer }, room: data.room });
        }
      }
    });

    newSocket.on('webrtcSignal', async (data) => {
      if (!peerConnectionRef.current || !data.signal || !socket || !room) return;
      
      if (data.signal.sdp) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
        if (data.signal.sdp.type === 'offer') {
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          socket.emit('webrtcSignal', { to: data.from, signal: { sdp: answer }, room });
        }
      } else if (data.signal.candidate) {
        try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        } catch (e) {
            console.error('Error adding ICE candidate', e);
        }
      }
    });

    newSocket.on('receiveMessage', (data) => {
      addMessage(data.message, 'partner');
    });

    newSocket.on('peerDisconnected', () => {
      addMessage('Partner disconnected. You can find a new partner or leave.', 'system');
      cleanupConnections();
      // Optionally, auto-trigger findPartner again or provide UI to do so
    });
    
    newSocket.on('connect_error', (err) => {
        console.error("Socket connection error:", err);
        toast({
            title: "Connection Error",
            description: "Could not connect to the chat server. Please try again later.",
            variant: "destructive",
        });
        setIsFindingPartner(false);
    });


    return () => {
      cleanupConnections();
      newSocket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatType, setupWebRTC, cleanupConnections]); // interests are used in handleFindPartner, not directly in useEffect

  const handleFindPartner = (currentSocket: Socket<ServerToClientEvents, ClientToServerEvents> | null = socket) => {
    if (currentSocket) {
      cleanupConnections(); // Clean up before finding new partner
      setMessages([]); // Clear old messages
      addMessage('Looking for a partner...', 'system');
      setIsFindingPartner(true);
      currentSocket.emit('findPartner', { chatType, interests });
    }
  };

  const handleSendMessage = () => {
    if (newMessage.trim() && socket && room && partnerId && isConnected) {
      addMessage(newMessage, 'me');
      socket.emit('sendMessage', { room, message: newMessage, to: partnerId });
      setNewMessage('');
    }
  };

  const handleLeaveChat = () => {
    if (socket && room) {
      socket.emit('leaveChat', room);
    }
    cleanupConnections();
    router.push('/');
  };

  const localVideoInitialSize = { width: 320, height: 240 }; // Aspect ratio 4:3
  const remoteVideoInitialSize = { width: 320, height: 240 };
  const chatWindowInitialSize = chatType === 'video' ? { width: 450, height: 350 } : { width: 500, height: 450 };
  const inputAreaHeight = 100; // Approximate height for input + button


  // Define boundary for draggable windows
  const boundaryRef = useRef<HTMLDivElement>(null);


  return (
    <div ref={boundaryRef} className="flex flex-col items-center justify-center h-full p-4 overflow-hidden relative">
      {isFindingPartner && !isConnected && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="p-4 bg-background rounded-md shadow-lg">
            <p className="text-lg">Finding a partner...</p>
            {/* Add a spinner or loading animation here if desired */}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center w-full max-w-5xl">
        {chatType === 'video' && (
          <div className="flex justify-center gap-4 mb-4 w-full">
            <DraggableWindow
              title="Your Video"
              initialPosition={{ x: 50, y: 50 }}
              initialSize={localVideoInitialSize}
              minSize={{ width: 160, height: 120 }}
              boundaryRef={boundaryRef}
              theme={theme}
              windowClassName={theme === 'theme-7' ? 'glass' : ''}
              titleBarClassName="text-sm"
              bodyClassName={cn(theme === 'theme-98' ? 'p-0.5' : 'p-0')}
            >
                <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover bg-black" data-ai-hint="local camera video" />
                {hasCameraPermission === false && (
                     <Alert variant="destructive" className="m-2">
                        <AlertTitle>Camera Access Denied</AlertTitle>
                        <AlertDescription>
                            Please enable camera permissions in your browser settings.
                        </AlertDescription>
                    </Alert>
                )}
            </DraggableWindow>

            <DraggableWindow
              title="Partner's Video"
              initialPosition={{ x: 400, y: 50 }}
              initialSize={remoteVideoInitialSize}
              minSize={{ width: 160, height: 120 }}
              boundaryRef={boundaryRef}
              theme={theme}
              windowClassName={theme === 'theme-7' ? 'glass' : ''}
              titleBarClassName="text-sm"
              bodyClassName={cn(theme === 'theme-98' ? 'p-0.5' : 'p-0')}
            >
               <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera video" />
               {!isConnected && !isFindingPartner && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                   <p className="text-white text-center p-2">Waiting for partner to connect video...</p>
                 </div>
               )}
            </DraggableWindow>
          </div>
        )}

        <DraggableWindow
          title="Chat"
          initialPosition={chatType === 'video' ? { x: 200, y: 320 } : { x: 100, y: 100 }}
          initialSize={chatWindowInitialSize}
          minSize={{ width: 250, height: 200 }}
          boundaryRef={boundaryRef}
          theme={theme}
          windowClassName={theme === 'theme-7' ? 'glass' : ''}
          bodyClassName={cn(
            'flex flex-col', // Ensure flex column layout for chat content
            theme === 'theme-98' ? 'p-0.5' : (theme === 'theme-7' ? 'has-space' : '')
          )}
        >
          <div className="flex flex-col flex-grow h-full overflow-hidden"> {/* This div will contain scroll and input */}
            <ScrollArea className={cn(
                "flex-grow",
                theme === 'theme-98' ? 'sunken-panel tree-view p-1' : 'border p-2 bg-white bg-opacity-80'
              )}
              style={{height: `calc(100% - ${inputAreaHeight}px)`}} // Adjusted height
            >
              <ul className={cn(
                theme === 'theme-98' ? '' : 'space-y-1'
              )}>
                {messages.map((msg) => (
                  <li
                    key={msg.id}
                    className={cn(
                      'text-sm break-words',
                      msg.sender === 'me' ? 'text-right' : '',
                      msg.sender === 'system' ? 'text-center italic text-gray-500' : '',
                      theme === 'theme-98' ? 'p-0.5' : 'p-1 rounded' // Basic padding for 7.css items
                    )}
                  >
                    <span
                      className={cn(
                        msg.sender === 'me' ? (theme === 'theme-98' ? 'bg-blue-500 text-white px-1' : 'bg-blue-100 text-blue-800 px-2 py-1 inline-block rounded-md') : '',
                        msg.sender === 'partner' ? (theme === 'theme-98' ? 'bg-gray-300 px-1' : 'bg-gray-100 text-gray-800 px-2 py-1 inline-block rounded-md') : ''
                      )}
                    >
                      {msg.text}
                    </span>
                     {msg.sender !== 'system' && <span className="text-xs text-gray-400 ml-1">{new Date(msg.timestamp).toLocaleTimeString()}</span>}
                  </li>
                ))}
              </ul>
            </ScrollArea>

            <div className={cn(
                "p-2",
                theme === 'theme-98' ? 'input-area status-bar' : (theme === 'theme-7' ? 'input-area border-t' : '')
                )}
                style={{height: `${inputAreaHeight}px`}} // Fixed height for input area
            >
              <div className="flex items-center gap-2 mb-2">
                <Input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-grow"
                  disabled={!isConnected || isFindingPartner}
                />
                <Button onClick={handleSendMessage} disabled={!isConnected || isFindingPartner} className="accent">
                  Send
                </Button>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleFindPartner()} disabled={isFindingPartner} className="flex-1">
                  {isFindingPartner ? "Searching..." : "Find New Partner"}
                </Button>
                <Button onClick={handleLeaveChat} variant="destructive" className="flex-1">
                  Leave Chat
                </Button>
              </div>
            </div>
          </div>
        </DraggableWindow>
      </div>
    </div>
  );
};

export default ChatPage;

    