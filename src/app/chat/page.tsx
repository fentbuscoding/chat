
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

  const chatType = useMemo(() => searchParams.get('type') as 'text' | 'video' || 'text', [searchParams]);
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
  }, []); // setMessages is stable

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

 const cleanupConnections = useCallback(() => {
    console.log("ChatPage: Cleanup connections called");
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
    
    setIsConnected(false);
    setPartnerId(null);
    // Room is cleared more explicitly elsewhere, e.g. on leaveChat or server disconnect signal
    // setRoom(null); 
    // isFindingPartner is managed by findPartner logic
}, []);


  const setupWebRTC = useCallback(async () => {
    if (chatType !== 'video' || !navigator.mediaDevices || !socket || !partnerId || !room) {
      console.log("ChatPage: WebRTC setup prerequisites not met. chatType:", chatType, "socket:", !!socket, "partnerId:", partnerId, "room:", room);
      if (chatType === 'video' && !hasCameraPermission) {
         toast({ variant: 'destructive', title: 'Camera Required', description: 'Video chat requires camera access.' });
      }
      return;
    }

    console.log("ChatPage: Setting up WebRTC for room:", room, "partner:", partnerId);

    if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
        console.log("ChatPage: Closing existing peer connection before creating a new one.");
        peerConnectionRef.current.close();
    }
    // Always create a new RTCPeerConnection instance for a new session
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    console.log("ChatPage: New RTCPeerConnection created.");

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate && socket && partnerId && room) {
        console.log("ChatPage: Sending ICE candidate to partner", partnerId);
        socket.emit('webrtcSignal', { to: partnerId, signal: { candidate: event.candidate }, room });
      }
    };

    peerConnectionRef.current.ontrack = (event) => {
      console.log("ChatPage: Received remote track.");
      if (remoteVideoRef.current && event.streams && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      } else {
        console.warn("ChatPage: Remote video ref not available or no streams on track event.");
      }
    };
    
    // Ensure local stream is active and add tracks
    if (!localStreamRef.current && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      console.log("ChatPage: Attempting to get user media in setupWebRTC as it was not previously available.");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setHasCameraPermission(true);
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('ChatPage: Error accessing camera in setupWebRTC:', error);
        setHasCameraPermission(false);
        toast({ variant: 'destructive', title: 'Camera Access Denied', description: 'Video chat requires camera. Please enable permissions.' });
        return; // Stop WebRTC setup if camera fails
      }
    } else if (localStreamRef.current && localVideoRef.current && !localVideoRef.current.srcObject) {
       // If stream exists but not attached to video element (e.g., after returning to tab)
      localVideoRef.current.srcObject = localStreamRef.current;
    }


    if (localStreamRef.current && peerConnectionRef.current) {
      console.log("ChatPage: Adding local stream tracks to peer connection.");
      localStreamRef.current.getTracks().forEach(track => {
        if (peerConnectionRef.current && localStreamRef.current) { // Double check refs
            peerConnectionRef.current.addTrack(track, localStreamRef.current);
        }
      });
    } else {
      console.warn("ChatPage: No local stream or peer connection available to add tracks in setupWebRTC.");
    }
  }, [chatType, socket, partnerId, room, toast, hasCameraPermission]); // Added hasCameraPermission

  useEffect(() => {
    let didCancel = false;
    const getInitialCameraStream = async () => {
      if (chatType === 'video' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
        if (!localStreamRef.current) { // Only try to get stream if not already present
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
        } else if (localVideoRef.current && !localVideoRef.current.srcObject) {
          // If stream exists but video element doesn't have it (e.g., re-render)
          localVideoRef.current.srcObject = localStreamRef.current;
          if(!didCancel) setHasCameraPermission(true); // Ensure state is correct
        } else if (localStreamRef.current && !didCancel) {
             setHasCameraPermission(true); // Stream already exists
        }
      } else if (chatType !== 'video' && localStreamRef.current) {
        // Switched from video to text, or component unmounting from video mode
        console.log("ChatPage: Chat type is not video or unmounting, cleaning up local stream.");
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if(!didCancel) setHasCameraPermission(undefined);
      }
    };

    getInitialCameraStream();
    return () => {
      didCancel = true;
      console.log("ChatPage: Cleanup for initial camera stream effect.");
      // It's important not to stop tracks here if localStreamRef is needed by other effects
      // The main socket effect's cleanup or cleanupConnections handles final track stopping
    };
  }, [chatType, toast]);


  const handleFindPartner = useCallback((currentSocket: Socket<ServerToClientEvents, ClientToServerEvents>) => {
      console.log("ChatPage: handleFindPartner called.");
      cleanupConnections(); 
      setMessages([]); 
      addMessage('Looking for a partner...', 'system');
      setIsFindingPartner(true);
      setIsConnected(false);
      setPartnerId(null);
      setRoom(null); // Explicitly clear room here
      console.log('ChatPage: Emitting findPartner with:', { chatType, interests: interests.join(', ') });
      currentSocket.emit('findPartner', { chatType, interests });
  }, [cleanupConnections, addMessage, chatType, interests, setMessages, setIsFindingPartner, setIsConnected, setPartnerId, setRoom ]);


  // Main effect for socket connection and setup
  useEffect(() => {
    console.log('ChatPage: Main effect triggered. chatType:', chatType, 'interests:', interests.join(', '));
    const newSocket = io(SOCKET_SERVER_URL, {
        reconnectionAttempts: 5, // Example: limit reconnection attempts
        transports: ['websocket'] // Prefer websocket
    });
    setSocket(newSocket);
    console.log('ChatPage: Socket instance created.');

    newSocket.on('connect', () => {
      console.log('ChatPage: Socket connected successfully. ID:', newSocket.id);
      handleFindPartner(newSocket);
    });

    newSocket.on('waitingForPartner', () => {
      console.log('ChatPage: Waiting for partner...');
      setMessages(prev => prev.filter(msg => msg.sender !== 'system' || msg.text !== 'Looking for a partner...'));
      addMessage('Waiting for a partner...', 'system');
      setIsFindingPartner(true);
      setIsConnected(false); 
    });

    newSocket.on('partnerFound', async (data) => {
      console.log('ChatPage: Partner found!', data);
      setMessages(prev => prev.filter(msg => msg.sender !== 'system')); // Clear previous system messages
      addMessage(`Partner found! You are connected. Room: ${data.room}`, 'system');
      setIsConnected(true);
      setIsFindingPartner(false);
      setPartnerId(data.peerId);
      setRoom(data.room);

      if (chatType === 'video') {
        console.log('ChatPage: Setting up WebRTC for video chat after partner found.');
        await setupWebRTC(); 
        
        if (data.initiator && peerConnectionRef.current && newSocket && data.room && data.peerId) {
          console.log('ChatPage: Initiator path for WebRTC.');
          if (localStreamRef.current && peerConnectionRef.current.getSenders().length === 0) {
             console.log('ChatPage: Adding tracks for initiator.');
             localStreamRef.current.getTracks().forEach(track => {
                peerConnectionRef.current?.addTrack(track, localStreamRef.current!);
             });
          }
          try {
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);
            console.log('ChatPage: Sending offer to partner.');
            newSocket.emit('webrtcSignal', { to: data.peerId, signal: { sdp: offer }, room: data.room });
          } catch (e) {
            console.error("ChatPage: Error creating/sending offer", e);
            toast({variant: 'destructive', title: 'WebRTC Error', description: 'Failed to create offer for video chat.'});
          }
        }
      }
    });

    newSocket.on('webrtcSignal', async (data) => {
      console.log('ChatPage: Received webrtcSignal', data.signal?.sdp?.type || (data.signal?.candidate ? 'candidate' : 'unknown signal'));
      if (!peerConnectionRef.current || !data.signal || !newSocket || !data.room || !data.from ) { // Check data.room and data.from from signal
        console.warn('ChatPage: Skipping webrtcSignal due to missing refs/data. Current room state:', room);
        return;
      }
      
      // Ensure current room matches signal's room for security/correctness
      if (data.room !== room) {
        console.warn(`ChatPage: Received webrtcSignal for a different room (${data.room}) than current (${room}). Ignoring.`);
        return;
      }

      try {
        if (data.signal.sdp) {
          console.log(`ChatPage: Processing SDP ${data.signal.sdp.type}`);
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
          if (data.signal.sdp.type === 'offer') {
            if (localStreamRef.current && peerConnectionRef.current.getSenders().length === 0) {
                console.log('ChatPage: Adding tracks for answerer.');
                localStreamRef.current.getTracks().forEach(track => {
                   peerConnectionRef.current?.addTrack(track, localStreamRef.current!);
                });
            }
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            console.log('ChatPage: Sending answer to partner.');
            newSocket.emit('webrtcSignal', { to: data.from, signal: { sdp: answer }, room: data.room });
          }
        } else if (data.signal.candidate) {
          console.log('ChatPage: Adding ICE candidate.');
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        }
      } catch (e) {
          console.error('ChatPage: Error processing webrtcSignal:', e, 'Signal data:', data.signal);
          toast({variant: 'destructive', title: 'WebRTC Error', description: 'Failed to process video signal.'});
      }
    });

    newSocket.on('receiveMessage', (data) => {
      console.log('ChatPage: Message received from partner.', data.message);
      addMessage(data.message, 'partner');
    });

    newSocket.on('peerDisconnected', () => {
      console.log('ChatPage: Partner disconnected.');
      addMessage('Partner disconnected. You can find a new partner or leave.', 'system');
      cleanupConnections(); // This already resets isConnected and partnerId
      // No need to call findPartner automatically, user should decide
      setIsFindingPartner(false); // Ensure this is reset
    });

    newSocket.on('connect_error', (err) => {
        console.error("ChatPage: Socket connection error:", err.message);
        toast({
            title: "Connection Error",
            description: `Could not connect to chat server: ${err.message}. Please try again later.`,
            variant: "destructive",
        });
        setIsFindingPartner(false);
        setIsConnected(false);
    });
    
    newSocket.on('disconnect', (reason) => {
        console.log('ChatPage: Socket disconnected.', reason);
        if (reason === 'io server disconnect') {
             // The server initiated the disconnection
            addMessage('Disconnected from server. Please refresh to reconnect.', 'system');
        } else {
            // Other reasons (network issue, client initiated, etc.)
            addMessage('Connection lost. Attempting to reconnect...', 'system');
        }
        cleanupConnections();
        setIsFindingPartner(false); // Ensure this is reset
    });


    return () => {
      console.log('ChatPage: Cleaning up main socket effect. Current room:', room, 'Socket connected:', newSocket.connected);
      if (newSocket.connected && room) { 
        console.log('ChatPage: Emitting leaveChat for room:', room);
        newSocket.emit('leaveChat', room);
      }
      cleanupConnections(); // General cleanup of WebRTC, streams
      newSocket.disconnect();
      console.log('ChatPage: Socket disconnected in cleanup.');
      setSocket(null);
      setRoom(null); 
      setIsFindingPartner(false);
      setIsConnected(false);
      setPartnerId(null);
      // setMessages([]); // Optionally clear messages on full unmount/re-effect
    };
    // IMPORTANT: Dependencies must be stable or correctly reflect what should trigger re-connection/re-setup
    // router and toast are generally stable. chatType and interests are the key dynamic parts from URL.
  }, [chatType, interests, addMessage, cleanupConnections, setupWebRTC, toast, handleFindPartner]);


  const handleSendMessage = useCallback(() => {
    if (newMessage.trim() && socket && room && partnerId && isConnected) {
      console.log('ChatPage: Sending message:', newMessage, 'to room:', room);
      addMessage(newMessage, 'me');
      socket.emit('sendMessage', { room, message: newMessage });
      setNewMessage('');
    } else {
      console.warn('ChatPage: Cannot send message. Conditions not met:', {
        hasMessage: !!newMessage.trim(),
        socket: !!socket,
        room: !!room,
        partnerId: !!partnerId,
        isConnected,
      });
    }
  }, [newMessage, socket, room, partnerId, isConnected, addMessage]);

  const handleLeaveChat = useCallback(() => {
    console.log('ChatPage: handleLeaveChat called. Current room:', room);
    if (socket && room) {
      socket.emit('leaveChat', room);
    }
    cleanupConnections();
    setRoom(null); 
    setIsFindingPartner(false); // User chose to leave, not finding new one automatically
    router.push('/');
  }, [socket, room, cleanupConnections, router]);


  const videoFeedStyle = useMemo(() => ({ width: '240px', height: '180px' }), []);
  const chatWindowStyle = useMemo(() => (
    chatType === 'video'
    ? { width: '350px', height: '400px' } 
    : { width: '450px', height: '500px' }
  ), [chatType]);

  const inputAreaHeight = 100;
  const scrollableChatHeightStyle = useMemo(() => ({
    height: `calc(100% - ${inputAreaHeight}px)`,
  }), []);


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
              {!partnerId && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">
                    {isFindingPartner ? "Searching..." : (isConnected ? "" : "Waiting for partner...")}
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
            'window-body window-body-content',
            theme === 'theme-98' ? 'p-0.5' : (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'glass-body-padding' : 'has-space') : 'p-2'),
            'flex flex-col' 
          )}
          style={{ height: `calc(100% - 20px)` }}
        >
          <div
            className={cn(
              "flex-grow overflow-y-auto",
              theme === 'theme-98' ? 'sunken-panel tree-view p-1' : 'border p-2 bg-white bg-opacity-80'
            )}
            style={scrollableChatHeightStyle}
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
                      msg.sender === 'system' ? 'text-center w-full text-gray-500 italic text-xs' : '' // Made system messages smaller
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
              "p-2 flex-shrink-0",
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
              <Button 
                onClick={() => socket && handleFindPartner(socket)} 
                disabled={isFindingPartner /* Disable if currently finding, regardless of connection state */} 
                className="flex-1"
              >
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
