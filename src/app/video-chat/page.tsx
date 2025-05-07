// @ts-nocheck
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
// import { io, type Socket } from 'socket.io-client';
// import type { ServerToClientEvents, ClientToServerEvents } from '@/lib/socket-types';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

// const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3001';

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

  const chatType = 'video'; // Hardcoded for this page
  const interests = useMemo(() => searchParams.get('interests')?.split(',').filter(interest => interest.trim() !== '').map(i => i.toLowerCase()) || [], [searchParams]);
  const interestsString = useMemo(() => interests.join(','), [interests]);

  // const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  // const [isConnected, setIsConnected] = useState(false);
  // const [isFindingPartner, setIsFindingPartner] = useState(false);
  // const [partnerId, setPartnerId] = useState<string | null>(null);
  // const [room, setRoom] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | undefined>(undefined);
  const chatMessagesListRef = useRef<HTMLUListElement>(null);

 const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      if (sender === 'system') {
        const lastMessage = prevMessages[prevMessages.length - 1];
        if (lastMessage && lastMessage.sender === 'system' && lastMessage.text === text) {
          return prevMessages;
        }
      }
      return [...prevMessages, { id: Date.now().toString(), text, sender, timestamp: new Date() }];
    });
  }, []);

  useEffect(() => {
    if (chatMessagesListRef.current) {
      chatMessagesListRef.current.scrollTop = chatMessagesListRef.current.scrollHeight;
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
    // if (peerConnectionRef.current) {
    //     peerConnectionRef.current.close();
    //     peerConnectionRef.current = null;
    //     console.log("VideoChatPage: Peer connection closed.");
    // }
    // setPartnerId(null);
    // setRoom(null);
}, []);


  // const setupWebRTC = useCallback(async (currentSocket: Socket<ServerToClientEvents, ClientToServerEvents> | null, currentPartnerId: string | null, currentRoom: string | null) => {
  //   if (!navigator.mediaDevices || !currentSocket || !currentPartnerId || !currentRoom) {
  //     console.log("VideoChatPage: WebRTC setup prerequisites not met. Socket:", !!currentSocket, "PartnerId:", currentPartnerId, "Room:", currentRoom, "HasCameraPerm:", hasCameraPermission);
  //     if (hasCameraPermission === false) {
  //        toast({ variant: 'destructive', title: 'Camera Required', description: 'Video chat requires camera access.' });
  //     }
  //     return;
  //   }
  //    if (hasCameraPermission !== true) {
  //       console.log("VideoChatPage: Camera permission not granted, cannot setup WebRTC.");
  //       return;
  //   }

  //   console.log("VideoChatPage: Setting up WebRTC for room:", currentRoom, "partner:", currentPartnerId);

  //   if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
  //       console.log("VideoChatPage: Closing existing peer connection before creating a new one.");
  //       peerConnectionRef.current.close();
  //   }
  //   try {
  //       peerConnectionRef.current = new RTCPeerConnection({
  //         iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  //       });
  //   } catch (error) {
  //       console.error("VideoChatPage: Error creating RTCPeerConnection:", error);
  //       toast({variant: 'destructive', title: 'WebRTC Error', description: 'Failed to initialize video connection.'});
  //       return;
  //   }
  //   console.log("VideoChatPage: New RTCPeerConnection created.");

  //   peerConnectionRef.current.onicecandidate = (event) => {
  //     if (event.candidate && currentSocket && currentPartnerId && currentRoom) {
  //       console.log("VideoChatPage: Sending ICE candidate to partner", currentPartnerId);
  //       currentSocket.emit('webrtcSignal', { to: currentPartnerId, signal: { candidate: event.candidate }, room: currentRoom });
  //     }
  //   };

  //   peerConnectionRef.current.ontrack = (event) => {
  //     console.log("VideoChatPage: Received remote track.");
  //     if (remoteVideoRef.current && event.streams && event.streams[0]) {
  //       remoteVideoRef.current.srcObject = event.streams[0];
  //     } else {
  //       console.warn("VideoChatPage: Remote video ref not available or no streams on track event.");
  //     }
  //   };

  //   if (!localStreamRef.current && typeof navigator.mediaDevices?.getUserMedia === 'function') {
  //     console.log("VideoChatPage: Attempting to get user media in setupWebRTC as it was not previously available.");
  //     try {
  //       const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  //       localStreamRef.current = stream;
  //       if (localVideoRef.current) {
  //         localVideoRef.current.srcObject = stream;
  //       }
  //        console.log("VideoChatPage: Camera stream acquired in setupWebRTC.");
  //     } catch (error) {
  //       console.error('VideoChatPage: Error accessing camera in setupWebRTC:', error);
  //       toast({ variant: 'destructive', title: 'Camera Access Denied', description: 'Video chat requires camera. Please enable permissions.' });
  //       return;
  //     }
  //   } else if (localStreamRef.current && localVideoRef.current && !localVideoRef.current.srcObject) {
  //     localVideoRef.current.srcObject = localStreamRef.current;
  //   }


  //   if (localStreamRef.current && peerConnectionRef.current) {
  //     console.log("VideoChatPage: Adding local stream tracks to peer connection.");
  //     localStreamRef.current.getTracks().forEach(track => {
  //       if (peerConnectionRef.current && localStreamRef.current) {
  //           peerConnectionRef.current.addTrack(track, localStreamRef.current);
  //       }
  //     });
  //   } else {
  //     console.warn("VideoChatPage: No local stream or peer connection available to add tracks in setupWebRTC. LocalStream:", !!localStreamRef.current, "PeerConn:", !!peerConnectionRef.current);
  //   }
  // }, [toast, hasCameraPermission, addMessage]);

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
    };

    getInitialCameraStream();
    addMessage('Chat service is currently unavailable. You can leave this page.', 'system');
    return () => {
      didCancel = true;
      console.log("VideoChatPage: Cleanup for initial camera stream effect.");
      cleanupConnections(true);
    };
  }, [toast, hasCameraPermission, addMessage, cleanupConnections]);


  // const handleFindPartner = useCallback((currentSocket: Socket<ServerToClientEvents, ClientToServerEvents>) => {
  //     console.log("VideoChatPage: handleFindPartner called.");
  //     cleanupConnections(false);
  //     setMessages([]);
  //     addMessage('Looking for a partner...', 'system');
  //     setIsFindingPartner(true);
  //     setPartnerId(null);
  //     setRoom(null);
  //     console.log('VideoChatPage: Emitting findPartner with:', { chatType, interests });
  //     currentSocket.emit('findPartner', { chatType, interests });
  // }, [cleanupConnections, addMessage, interests, chatType]);


  useEffect(() => {
    // console.log('VideoChatPage: Main effect triggered. Interests:', interestsString, 'HasCameraPermission:', hasCameraPermission);

    // if (hasCameraPermission === false) {
    //     addMessage('Camera permission denied. Cannot start video chat.', 'system');
    //     toast({ variant: 'destructive', title: 'Camera Denied', description: 'Please enable camera permissions and try finding a partner again.'});
    //     return;
    // }


    // const newSocket = io(SOCKET_SERVER_URL, {
    //     reconnectionAttempts: 3,
    //     timeout: 5000,
    // });
    // socketRef.current = newSocket;
    // console.log('VideoChatPage: Socket instance created and assigned to ref.');

    // newSocket.on('connect', () => {
    //   console.log('VideoChatPage: Socket connected successfully. ID:', newSocket.id);
    //   setIsConnected(true);
    //   if (hasCameraPermission === true) {
    //      handleFindPartner(newSocket);
    //   } else if (hasCameraPermission === undefined) {
    //     addMessage('Checking camera permissions...', 'system');
    //     toast({title: "Camera Check", description: "Verifying camera permissions before finding partner."});
    //   }
    // });

    // newSocket.on('waitingForPartner', () => {
    //   console.log('VideoChatPage: Waiting for partner...');
    //   setMessages(prev => prev.filter(msg => !(msg.sender === 'system' && (msg.text.startsWith('Looking for a partner...') || msg.text.startsWith('Waiting for a partner...')))));
    //   addMessage('Waiting for a partner...', 'system');
    //   setIsFindingPartner(true);
    // });

    // newSocket.on('partnerFound', async (data) => {
    //   console.log('VideoChatPage: Partner found!', data);
    //   setMessages(prev => prev.filter(msg => msg.sender !== 'system'));
    //   addMessage(`Partner found! You are connected. Room: ${data.room}`, 'system');
    //   setIsFindingPartner(false);
    //   setPartnerId(data.peerId);
    //   setRoom(data.room);

    //   if (hasCameraPermission === true) {
    //     console.log('VideoChatPage: Setting up WebRTC for video chat after partner found.');
    //     await setupWebRTC(newSocket, data.peerId, data.room);

    //     if (data.initiator && peerConnectionRef.current && newSocket && data.room && data.peerId) {
    //       console.log('VideoChatPage: Initiator path for WebRTC.');
    //       if (!localStreamRef.current) {
    //           console.error("VideoChatPage: Local stream not available for initiator.");
    //           toast({variant: 'destructive', title: 'WebRTC Error', description: 'Local video stream unavailable.'});
    //           return;
    //       }
    //       if (peerConnectionRef.current.getSenders().length === 0 && localStreamRef.current) {
    //         console.log('VideoChatPage: Adding tracks for initiator in partnerFound as they were missing.');
    //         localStreamRef.current.getTracks().forEach(track => {
    //            peerConnectionRef.current?.addTrack(track, localStreamRef.current!);
    //         });
    //      }

    //       try {
    //         const offer = await peerConnectionRef.current.createOffer();
    //         await peerConnectionRef.current.setLocalDescription(offer);
    //         console.log('VideoChatPage: Sending offer to partner.');
    //         newSocket.emit('webrtcSignal', { to: data.peerId, signal: { sdp: offer }, room: data.room });
    //       } catch (e) {
    //         console.error("VideoChatPage: Error creating/sending offer", e);
    //         toast({variant: 'destructive', title: 'WebRTC Error', description: 'Failed to create offer for video chat.'});
    //       }
    //     }
    //   } else {
    //     console.warn("VideoChatPage: Partner found, but camera permission not granted or pending. Cannot proceed with WebRTC.");
    //     addMessage(hasCameraPermission === false ? "Camera permission denied. Video chat cannot start." : "Camera permission pending. Video chat may not start.", "system");
    //   }
    // });

    // newSocket.on('webrtcSignal', async (data) => {
    //   console.log('VideoChatPage: Received webrtcSignal', data.signal?.sdp?.type || (data.signal?.candidate ? 'candidate' : 'unknown signal'));
    //   const currentRoom = room;
    //   if (!peerConnectionRef.current || !data.signal || !newSocket || !data.room || !data.from ) {
    //     console.warn('VideoChatPage: Skipping webrtcSignal due to missing refs/data. Current room state:', currentRoom, 'Signal room:', data.room);
    //     return;
    //   }

    //   if (data.room !== currentRoom) {
    //     console.warn(`VideoChatPage: Received webrtcSignal for a different room (${data.room}) than current (${currentRoom}). Ignoring.`);
    //     return;
    //   }
    //    if (hasCameraPermission !== true) {
    //     console.warn("VideoChatPage: Received WebRTC signal but no camera permission. Ignoring.");
    //     return;
    //   }

    //   try {
    //     if (data.signal.sdp) {
    //       console.log(`VideoChatPage: Processing SDP ${data.signal.sdp.type}`);
    //       if (!peerConnectionRef.current || peerConnectionRef.current.signalingState === 'closed') {
    //         console.warn("VideoChatPage: Peer connection is closed or null, cannot process SDP.");
    //         return;
    //       }
    //       await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
    //       if (data.signal.sdp.type === 'offer') {
    //         if (!localStreamRef.current) {
    //             console.error("VideoChatPage: Local stream not available for answerer.");
    //             toast({variant: 'destructive', title: 'WebRTC Error', description: 'Local video stream unavailable for creating answer.'});
    //             return;
    //         }
    //         if (peerConnectionRef.current.getSenders().length === 0 && localStreamRef.current) {
    //             console.log('VideoChatPage: Adding tracks for answerer in webrtcSignal.');
    //             localStreamRef.current.getTracks().forEach(track => {
    //                peerConnectionRef.current?.addTrack(track, localStreamRef.current!);
    //             });
    //         }
    //         const answer = await peerConnectionRef.current.createAnswer();
    //         await peerConnectionRef.current.setLocalDescription(answer);
    //         console.log('VideoChatPage: Sending answer to partner.');
    //         newSocket.emit('webrtcSignal', { to: data.from, signal: { sdp: answer }, room: data.room });
    //       }
    //     } else if (data.signal.candidate) {
    //        if (!peerConnectionRef.current || peerConnectionRef.current.signalingState === 'closed') {
    //         console.warn("VideoChatPage: Peer connection is closed or null, cannot add ICE candidate.");
    //         return;
    //       }
    //       console.log('VideoChatPage: Adding ICE candidate.');
    //       await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
    //     }
    //   } catch (e) {
    //       console.error('VideoChatPage: Error processing webrtcSignal:', e, 'Signal data:', data.signal);
    //       toast({variant: 'destructive', title: 'WebRTC Error', description: 'Failed to process video signal.'});
    //   }
    // });

    // newSocket.on('receiveMessage', (data) => {
    //   console.log('VideoChatPage: Message received from partner.', data.message);
    //   addMessage(data.message, 'partner');
    // });

    // newSocket.on('peerDisconnected', () => {
    //   console.log('VideoChatPage: Partner disconnected.');
    //   addMessage('Partner disconnected. You can find a new partner or leave.', 'system');
    //   cleanupConnections(false);
    //   setIsFindingPartner(false);
    //   setPartnerId(null);
    //   setRoom(null);
    // });

    // newSocket.on('connect_error', (err) => {
    //     console.error("VideoChatPage: Socket connection error:", err.message, "Full error object:", err);
    //     if (isConnected) {
    //       toast({
    //           title: "Connection Error",
    //           description: `Lost connection to chat server: ${err.message}. Attempting to reconnect...`,
    //           variant: "destructive",
    //       });
    //     }
    //     setIsFindingPartner(false);
    //     setIsConnected(false);
    // });

    // newSocket.on('disconnect', (reason) => {
    //     console.log('VideoChatPage: Socket disconnected.', reason);
    //      if (isConnected) {
    //         addMessage('Disconnected from server. Please refresh or try finding a new partner.', 'system');
    //     }
    //     cleanupConnections(true);
    //     setIsFindingPartner(false);
    //     setIsConnected(false);
    //     setPartnerId(null);
    //     setRoom(null);
    //     if (hasCameraPermission !== false) setHasCameraPermission(undefined);
    // });


    // return () => {
    //   console.log('VideoChatPage: Cleaning up main socket effect. Current room:', room, 'Socket connected:', newSocket.connected);
    //   if (newSocket.connected && room) {
    //     console.log('VideoChatPage: Emitting leaveChat for room:', room);
    //     newSocket.emit('leaveChat', room);
    //   }
    //   cleanupConnections(true);
    //   if(newSocket.connected) newSocket.disconnect();
    //   console.log('VideoChatPage: Socket disconnected in cleanup.');
    //   socketRef.current = null;
    //   if (hasCameraPermission !== false) setHasCameraPermission(undefined);
    // };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interestsString, hasCameraPermission, addMessage, cleanupConnections, toast]); // setupWebRTC, handleFindPartner removed


  const handleSendMessage = useCallback(() => {
    // if (newMessage.trim() && socketRef.current && room && partnerId && isConnected) {
    //   console.log('VideoChatPage: Sending message:', newMessage, 'to room:', room);
    //   addMessage(newMessage, 'me');
    //   socketRef.current.emit('sendMessage', { room, message: newMessage });
    //   setNewMessage('');
    // } else {
    //   console.warn('VideoChatPage: Cannot send message. Conditions not met:', {
    //     hasMessage: !!newMessage.trim(),
    //     socketConnected: socketRef.current?.connected,
    //     currentRoom: room,
    //     currentPartnerId: partnerId,
    //     isConnected,
    //     isActuallyInChat: !!partnerId && !!room
    //   });
    //    if (!partnerId || !room) {
    //      toast({title: "Not in a chat", description: "You are not connected to a partner.", variant: "default"});
    //    }
    // }
    toast({title: "Chat Unavailable", description: "Messaging is currently disabled.", variant: "default"});
  }, [newMessage, addMessage, toast]); // room, partnerId, isConnected removed

  const handleLeaveChat = useCallback(() => {
    console.log('VideoChatPage: handleLeaveChat called.');
    // if (socketRef.current && room) {
    //   socketRef.current.emit('leaveChat', room);
    // }
    cleanupConnections(true);
    router.push('/');
  }, [cleanupConnections, router]);


  const videoFeedStyle = useMemo(() => ({ width: '240px', height: '180px' }), []);

  const chatWindowStyle = useMemo(() => (
    { width: '300px', height: '350px' }
  ), []);

  const inputAreaHeight = 100;
  const scrollableChatHeightStyle = useMemo(() => ({
    height: `calc(100% - ${inputAreaHeight}px)`,
  }), []);


  return (
    <div className="flex flex-col items-center justify-start h-full p-4 overflow-auto">
      {/* {isFindingPartner && !partnerId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={cn("p-4 rounded-md shadow-lg", theme === 'theme-98' ? 'window' : 'bg-background text-foreground')}>
            <p className="text-lg">Finding a partner...</p>
          </div>
        </div>
      )} */}

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
          className={cn('window', theme === 'theme-7' && 'active glass', theme === 'theme-98' ? 'no-padding-window-body' : '')}
          style={videoFeedStyle}
        >
          <div className={cn('title-bar', "text-sm")}>
            <div className="title-bar-text">Partner's Video</div>
          </div>
           <div className={cn('window-body', theme === 'theme-98' ? 'p-0' : (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'p-0' : 'p-0') : 'p-0'), 'flex flex-col overflow-hidden relative')} style={{ height: `calc(100% - 20px)`}}>
            <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera video" />
            {/* {!partnerId && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                <p className="text-white text-center p-2 text-sm">
                  {isFindingPartner ? "Searching..." : (isConnected ? (room ? "" : "Waiting for partner...") : "Connecting...")}
                </p>
              </div>
            )} */}
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
              <p className="text-white text-center p-2 text-sm">Partner video unavailable</p>
            </div>
          </div>
        </div>
      </div>

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
              theme === 'theme-98' ? 'sunken-panel tree-view p-1' : 'border p-2 bg-white bg-opacity-80 dark:bg-gray-700 dark:bg-opacity-80'
            )}
            style={scrollableChatHeightStyle}
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
          </div>
          <div
            className={cn(
              "p-2 flex-shrink-0",
              theme === 'theme-98' ? 'input-area status-bar' : (theme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : '')
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
                disabled={true} // Disabled as socket is removed
              />
              <Button onClick={handleSendMessage} disabled={true} className="accent">
                Send
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                // onClick={() => socketRef.current && handleFindPartner(socketRef.current)}
                onClick={() => toast({title: "Feature Unavailable", description: "Finding a partner is currently disabled."})}
                 disabled={true} // Disabled as socket is removed
                className="flex-1"
              >
                 Find Partner
                {/* {isFindingPartner ? "Searching..." : (partnerId ? "Find New Partner" : "Find Partner")} */}
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

export default VideoChatPage;
