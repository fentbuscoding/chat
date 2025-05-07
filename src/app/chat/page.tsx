'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
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
  const interests = useMemo(() => searchParams.get('interests')?.split(',').filter(interest => interest.trim() !== '') || [], [searchParams]);


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
        localStreamRef.current = null; // Nullify the ref
    }
    if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
    }
    if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null; // Nullify the ref
    }
    
    setIsConnected(false); // Reset connection state
    setPartnerId(null);    // Reset partner ID
    // setRoom(null); // Room is cleared on disconnect/leaveChat explicitly
    // setIsFindingPartner(false); // Don't reset this here, could be set by findPartner
}, []);


  const setupWebRTC = useCallback(async () => {
    if (chatType !== 'video' || !navigator.mediaDevices || !socket || !partnerId || !room) {
      console.log("WebRTC setup prerequisites not met.");
      return;
    }

    console.log("Setting up WebRTC for room:", room, "partner:", partnerId);

    if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
        console.log("Closing existing peer connection before creating a new one.");
        peerConnectionRef.current.close();
        peerConnectionRef.current = null; 
    }
    
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

    if (!localStreamRef.current && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      console.log("Attempting to get user media in setupWebRTC");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setHasCameraPermission(true);
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing camera in setupWebRTC:', error);
        setHasCameraPermission(false);
        toast({ variant: 'destructive', title: 'Camera Access Denied', description: 'Video chat requires camera. Please enable permissions.' });
      }
    } else if (localStreamRef.current && localVideoRef.current && !localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }

    if (localStreamRef.current && peerConnectionRef.current) {
      console.log("Adding local stream tracks to peer connection.");
      localStreamRef.current.getTracks().forEach(track => {
        peerConnectionRef.current!.addTrack(track, localStreamRef.current!);
      });
    } else {
      console.log("No local stream or peer connection available to add tracks in setupWebRTC.");
    }
  }, [chatType, socket, partnerId, room, toast]);

  // Effect for initial camera permission UI update and local feed display
  useEffect(() => {
    let didCancel = false;
    const checkInitialCameraPermission = async () => {
      if (chatType === 'video' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
        if (!localStreamRef.current) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (!didCancel) {
              setHasCameraPermission(true);
              localStreamRef.current = stream;
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
              }
            } else {
              stream.getTracks().forEach(track => track.stop());
            }
          } catch (error) {
            if (!didCancel) {
              console.error('Error accessing camera initially for UI:', error);
              setHasCameraPermission(false);
              toast({
                variant: 'destructive',
                title: 'Camera Access Denied',
                description: 'Please enable camera permissions in your browser settings to use video chat.',
              });
            }
          }
        } else if (localVideoRef.current && !localVideoRef.current.srcObject) {
           localVideoRef.current.srcObject = localStreamRef.current;
           setHasCameraPermission(true);
        } else if (localStreamRef.current) {
            setHasCameraPermission(true);
        }
      } else if (chatType !== 'video' && localStreamRef.current) {
        // Switched from video to text, cleanup local video preview if stream exists
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        setHasCameraPermission(undefined); // Reset permission status
      }
    };

    checkInitialCameraPermission();
    return () => {
      didCancel = true;
    };
  }, [chatType, toast]);


  const handleFindPartner = useCallback((currentSocket: Socket<ServerToClientEvents, ClientToServerEvents>) => {
      cleanupConnections(); 
      setMessages([]); 
      addMessage('Looking for a partner...', 'system');
      setIsFindingPartner(true);
      setIsConnected(false);
      setPartnerId(null);
      currentSocket.emit('findPartner', { chatType, interests });
  }, [cleanupConnections, addMessage, chatType, interests]);


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
      setIsConnected(false); 
    });

    newSocket.on('partnerFound', async (data) => {
      addMessage(`Partner found! You are connected. Room: ${data.room}`, 'system');
      setIsConnected(true);
      setIsFindingPartner(false);
      setPartnerId(data.peerId);
      setRoom(data.room);

      if (chatType === 'video') {
        await setupWebRTC(); 
        if (data.initiator && peerConnectionRef.current && newSocket && data.room && data.peerId) {
          if (localStreamRef.current && peerConnectionRef.current.getSenders().length === 0) { // Ensure tracks are added if not already
             localStreamRef.current.getTracks().forEach(track => {
                peerConnectionRef.current?.addTrack(track, localStreamRef.current!);
             });
          }
          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);
          newSocket.emit('webrtcSignal', { to: data.peerId, signal: { sdp: offer }, room: data.room });
        }
      }
    });

    newSocket.on('webrtcSignal', async (data) => {
      if (!peerConnectionRef.current || !data.signal || !newSocket || !room || !data.from) return;

      if (data.signal.sdp) {
        if (data.signal.sdp.type === 'offer') {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
            if (localStreamRef.current && peerConnectionRef.current.getSenders().length === 0) { // Ensure tracks for answerer
                localStreamRef.current.getTracks().forEach(track => {
                   peerConnectionRef.current?.addTrack(track, localStreamRef.current!);
                });
            }
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            newSocket.emit('webrtcSignal', { to: data.from, signal: { sdp: answer }, room });
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
      if (newSocket.connected && room) { 
        newSocket.emit('leaveChat', room);
      }
      cleanupConnections();
      newSocket.disconnect();
      setSocket(null);
      setRoom(null); 
    };
  }, [chatType, interests, addMessage, cleanupConnections, setupWebRTC, toast, handleFindPartner]);


  const handleSendMessage = useCallback(() => {
    if (newMessage.trim() && socket && room && partnerId && isConnected) {
      addMessage(newMessage, 'me');
      socket.emit('sendMessage', { room, message: newMessage });
      setNewMessage('');
    }
  }, [newMessage, socket, room, partnerId, isConnected, addMessage]);

  const handleLeaveChat = useCallback(() => {
    if (socket && room) {
      socket.emit('leaveChat', room);
    }
    cleanupConnections();
    setRoom(null); 
    setIsFindingPartner(false);
    router.push('/');
  }, [socket, room, cleanupConnections, router]);


  const videoFeedStyle = useMemo(() => ({ width: '240px', height: '180px' }), []);
  const chatWindowStyle = useMemo(() => (
    chatType === 'video'
    ? { width: '350px', height: '400px' } 
    : { width: '450px', height: '500px' }
  ), [chatType]);

  const inputAreaHeight = 100; // Constant
  const scrollableChatHeightStyle = useMemo(() => ({
    height: `calc(100% - ${inputAreaHeight}px)`,
  }), [inputAreaHeight]);


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
            <div className={cn('window-body', theme === 'theme-98' ? 'p-0' : (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'p-0' : 'p-0') : 'p-0'), 'flex flex-col overflow-hidden relative')} style={{ height: `calc(100% - 20px)`}}>
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
             <div className={cn('window-body', theme === 'theme-98' ? 'p-0' : (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'p-0' : 'p-0') : 'p-0'), 'flex flex-col overflow-hidden relative')} style={{ height: `calc(100% - 20px)`}}>
              <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera video" />
              {!partnerId && (!isFindingPartner || !isConnected) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">
                    {isFindingPartner ? "Searching..." : "Waiting for partner..."}
                  </p>
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
            'window-body window-body-content', // Ensures flex column layout
            theme === 'theme-98' ? 'p-0.5' : (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'glass-body-padding' : 'has-space') : 'p-2'),
            'flex flex-col' 
          )}
          style={{ height: `calc(100% - 20px)` }} // Total height for window-body
        >
          <div // This div is the scrollable message area
            className={cn(
              "flex-grow overflow-y-auto", // flex-grow to take available space, overflow-y-auto for scrolling
              theme === 'theme-98' ? 'sunken-panel tree-view p-1' : 'border p-2 bg-white bg-opacity-80'
            )}
            style={scrollableChatHeightStyle} // Explicit height for the scrollable area
          >
            <ul ref={chatMessagesRef} className={cn('h-auto', theme === 'theme-98' ? '' : 'space-y-1')}>
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
          <div // This is the input area, fixed height
            className={cn(
              "p-2 flex-shrink-0", // flex-shrink-0 to prevent shrinking
              theme === 'theme-98' ? 'input-area status-bar' : (theme === 'theme-7' ? 'input-area border-t' : '')
            )}
            style={{ height: `${inputAreaHeight}px` }}
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
              <Button onClick={() => socket && handleFindPartner(socket)} disabled={isFindingPartner && isConnected /* Allow new search if connected but not finding */} className="flex-1">
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