'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/lib/socket-types';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

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
  const interests = searchParams.get('interests')?.split(',').filter(interest => interest.trim() !== '') || [];


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
  const chatMessagesRef = useRef<HTMLUListElement>(null);

  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString(), text, sender, timestamp: new Date() },
    ]);
  }, []);

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

 const cleanupConnections = useCallback(() => {
    console.log("Cleanup connections called");
    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
    }
    if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
    }
    if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
    }
    // Only reset isConnected and partnerId if they are currently set
    // This prevents clearing "Waiting for partner..." message prematurely
    if (isConnected || partnerId) {
        setIsConnected(false);
        setPartnerId(null);
    }
    // Do not reset room here as it might be needed for 'leaveChat'
}, [isConnected, partnerId]);


  const setupWebRTC = useCallback(async () => {
    if (chatType !== 'video' || !navigator.mediaDevices || !socket || !partnerId || !room) return;

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
        if (localStreamRef.current && peerConnectionRef.current) {
           peerConnectionRef.current.addTrack(track, localStreamRef.current)
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
      setIsConnected(false); // Ensure not connected while waiting
    });

    newSocket.on('partnerFound', async (data) => {
      addMessage(`Partner found! You are connected. Room: ${data.room}`, 'system');
      setIsConnected(true);
      setIsFindingPartner(false);
      setPartnerId(data.peerId);
      setRoom(data.room);

      if (chatType === 'video') {
        await setupWebRTC(); // setupWebRTC already checks for socket, partnerId, room
        if (data.initiator && peerConnectionRef.current && newSocket && data.room && data.peerId) {
          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);
          newSocket.emit('webrtcSignal', { to: data.peerId, signal: { sdp: offer }, room: data.room });
        }
      }
    });

    newSocket.on('webrtcSignal', async (data) => {
       // Ensure peerConnectionRef.current exists before proceeding
      if (!peerConnectionRef.current || !data.signal || !socket || !room || !data.from) return;


      if (data.signal.sdp) {
        // Check if it's an offer and we are not the initiator to avoid glare
        if (data.signal.sdp.type === 'offer') {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            socket.emit('webrtcSignal', { to: data.from, signal: { sdp: answer }, room });
        } else if (data.signal.sdp.type === 'answer') {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
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
      setIsConnected(false); 
      setPartnerId(null); 
      // Don't set isFindingPartner to true, let user click "Find New Partner"
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
      if (newSocket.connected && room) { // Ensure socket is connected and room exists before emitting leaveChat
        newSocket.emit('leaveChat', room);
      }
      cleanupConnections();
      newSocket.disconnect();
      setRoom(null); // Also clear room on component unmount
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatType, addMessage, cleanupConnections, setupWebRTC]); // Removed socket, partnerId, room from deps as they are handled inside setupWebRTC or are part of newSocket logic

  const handleFindPartner = (currentSocket: Socket<ServerToClientEvents, ClientToServerEvents> | null = socket) => {
    if (currentSocket) {
      cleanupConnections(); // Clean up previous connection artifacts
      setMessages([]); // Clear old messages
      addMessage('Looking for a partner...', 'system');
      setIsFindingPartner(true);
      setIsConnected(false);
      setPartnerId(null);
      // Room is set by server on 'partnerFound'
      currentSocket.emit('findPartner', { chatType, interests });
    }
  };

  const handleSendMessage = () => {
    if (newMessage.trim() && socket && room && partnerId && isConnected) {
      addMessage(newMessage, 'me');
      socket.emit('sendMessage', { room, message: newMessage });
      setNewMessage('');
    }
  };

  const handleLeaveChat = () => {
    if (socket && room) {
      socket.emit('leaveChat', room);
    }
    cleanupConnections();
    setRoom(null); // Explicitly clear room state
    setIsFindingPartner(false); // Not finding partner after leaving
    router.push('/');
  };

  const inputAreaHeight = 100;
  const scrollAreaStyle = useMemo(() => ({
    height: `calc(100% - ${inputAreaHeight}px)`,
  }), []); 

  const videoFeedStyle = { width: '240px', height: '180px' };
   const chatWindowStyle = chatType === 'video'
    ? { width: '350px', height: '400px' } // Adjusted for video mode
    : { width: '450px', height: '500px' };


  return (
    <div className="flex flex-col items-center justify-start h-full p-4 overflow-auto">
      {isFindingPartner && !isConnected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={cn("p-4 rounded-md shadow-lg", theme === 'theme-98' ? 'window' : 'bg-background')}>
            <p className="text-lg">Finding a partner...</p>
          </div>
        </div>
      )}

      {chatType === 'video' && (
        <div className="flex justify-center gap-4 mb-4 w-full">
          <div
            className={cn('window', theme === 'theme-7' && 'active glass', theme === 'theme-98' ? 'no-padding-window-body' : '')}
            style={videoFeedStyle}
          >
            <div className={cn('title-bar', "text-sm")}>
              <div className="title-bar-text">Your Video</div>
            </div>
            <div className={cn('window-body', theme === 'theme-98' || (theme === 'theme-7' && cn(theme === 'theme-7' ? 'glass' : '').includes('glass')) ? 'p-0' : 'p-0', 'flex flex-col overflow-hidden relative')} style={{ height: `calc(100% - 20px)`}}>
              <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover bg-black" data-ai-hint="local camera video" />
              {hasCameraPermission === false && (
                <Alert variant="destructive" className="m-1 absolute bottom-0 left-0 right-0 text-xs p-1">
                  <AlertTitle className="text-xs">Camera Access Denied</AlertTitle>
                  <AlertDescription className="text-xs">Enable permissions.</AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          <div
            className={cn('window', theme === 'theme-7' && 'active glass', theme === 'theme-98' ? 'no-padding-window-body' : '')}
            style={videoFeedStyle}
          >
            <div className={cn('title-bar', "text-sm")}>
              <div className="title-bar-text">Partner's Video</div>
            </div>
            <div className={cn('window-body', theme === 'theme-98' || (theme === 'theme-7' && cn(theme === 'theme-7' ? 'glass' : '').includes('glass')) ? 'p-0' : 'p-0', 'flex flex-col overflow-hidden relative')} style={{ height: `calc(100% - 20px)`}}>
              <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera video" />
              {!partnerId && !isFindingPartner && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">Waiting for partner...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className={cn('window', theme === 'theme-7' ? 'active glass' : '', 'mb-4')}
        style={chatWindowStyle}
      >
        <div className="title-bar">
          <div className="title-bar-text">Chat</div>
        </div>
        <div
          className={cn(
            'window-body window-body-content',
            theme === 'theme-98' ? 'p-0.5' : (theme === 'theme-7' && !cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'has-space' : 'glass-body-padding'),
            'flex flex-col'
          )}
          style={{ height: `calc(100% - 20px)` }}
        >
          <div
            className={cn(
              "flex-grow", // This div will handle the scrolling area
              theme === 'theme-98' ? 'sunken-panel tree-view p-1' : 'border p-2 bg-white bg-opacity-20',
              'overflow-y-auto' // Added overflow-y-auto here
            )}
            style={scrollAreaStyle} // scrollAreaStyle defines the height
          >
            <ul ref={chatMessagesRef} className={cn('h-auto', theme === 'theme-98' ? '' : 'space-y-1')}> {/* Changed h-full to h-auto or remove h-full if parent handles scrolling */}
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
                      "rounded-lg px-3 py-1 max-w-xs lg:max-w-md break-words",
                      msg.sender === "me"
                        ? theme === 'theme-98' ? 'bg-blue-500 text-white px-1' : 'bg-blue-100 text-blue-800'
                        : theme === 'theme-98' ? 'bg-gray-300 px-1' : 'bg-gray-100 text-gray-800',
                      msg.sender === 'system' ? 'text-center w-full text-gray-500 italic' : ''
                    )}
                  >
                    {msg.text}
                  </div>
                  {msg.sender !== "system" && (
                    <span className={cn("text-xxs ml-1 self-end", theme === 'theme-98' ? 'text-gray-700' : 'text-gray-400')}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div
            className={cn(
              "p-2",
              theme === 'theme-98' ? 'input-area status-bar' : (theme === 'theme-7' ? 'input-area border-t' : '')
            )}
            style={{ height: `${inputAreaHeight}px`, flexShrink: 0 }}
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
                {isFindingPartner ? "Searching..." : (isConnected ? "Find New Partner" : "Find Partner")}
              </Button>
              <Button onClick={handleLeaveChat} variant="destructive" className="flex-1">
                Leave Chat
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
