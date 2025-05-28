
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';
import useElementSize from '@charlietango/use-element-size';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';


interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: Date;
}

interface ItemDataForVideoChat {
  messages: Message[];
  theme: string;
}

const Row = React.memo(({ index, style, data }: ListChildComponentProps<ItemDataForVideoChat>) => {
  const currentMessage = data.messages[index];
  const previousSender = index > 0 ? data.messages[index - 1]?.sender : undefined;
  const theme = data.theme;

  if (currentMessage.sender === 'system') {
    return (
      <div style={style} className="mb-2">
        <div className="text-center w-full text-gray-500 dark:text-gray-400 italic text-xs">
          {currentMessage.text}
        </div>
      </div>
    );
  }

  const showDivider =
    theme === 'theme-7' &&
    previousSender !== undefined &&
    (previousSender === 'me' || previousSender === 'partner') &&
    (currentMessage.sender === 'me' || currentMessage.sender === 'partner') &&
    currentMessage.sender !== previousSender;

  return (
    <div style={style} className="mb-2">
      {showDivider && (
        <div
          className="h-[2px] mb-1 border border-[#CEDCE5] bg-[#64B2CF]"
          aria-hidden="true"
        ></div>
      )}
      <div className="break-words">
        {currentMessage.sender === 'me' && (
          <>
            <span className="text-blue-600 font-bold mr-1">You:</span>
            <span>{currentMessage.text}</span>
          </>
        )}
        {currentMessage.sender === 'partner' && (
          <>
            <span className="text-red-600 font-bold mr-1">Stranger:</span>
            <span>{currentMessage.text}</span>
          </>
        )}
      </div>
    </div>
  );
});
Row.displayName = 'Row';


const VideoChatPageClientContent: React.FC = () => {
  const searchParams = useSearchParams(); 
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | undefined>(undefined);

  const interests = useMemo(() => searchParams.get('interests')?.split(',') || [], [searchParams]);

  const listRef = useRef<List>(null);
  const chatListContainerRef = useRef<HTMLDivElement>(null);
  const { width: chatListContainerWidth, height: chatListContainerHeight } = useElementSize(chatListContainerRef);
  const itemHeight = 30; 

  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      const newMessageItem = { id: Date.now().toString(), text, sender, timestamp: new Date() };
      return [...prevMessages, newMessageItem];
    });
  }, []);

  const prevIsFindingPartnerRef = useRef(isFindingPartner);
  const prevIsPartnerConnectedRef = useRef(isPartnerConnected);

  useEffect(() => {
    if (isFindingPartner && !prevIsFindingPartnerRef.current && !isPartnerConnected) {
      addMessage('Searching for a partner...', 'system');
    }
    if (isPartnerConnected && !prevIsPartnerConnectedRef.current) {
      setMessages(prev => prev.filter(msg => !(msg.sender === 'system' && msg.text.toLowerCase().includes('searching for a partner'))));
      addMessage('Connected with a partner. You can start chatting!', 'system');
    }
    if (!isPartnerConnected && prevIsPartnerConnectedRef.current && roomId) { 
      addMessage('Your partner has disconnected.', 'system');
    }

    prevIsFindingPartnerRef.current = isFindingPartner;
    prevIsPartnerConnectedRef.current = isPartnerConnected;
  }, [isFindingPartner, isPartnerConnected, addMessage, roomId]);


  useEffect(() => {
    setIsMounted(true);
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) {
        console.error("Socket server URL is not defined.");
        toast({ title: "Configuration Error", description: "Socket server URL is missing.", variant: "destructive" });
        return;
    }
    const newSocket = io(socketServerUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'] 
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
        console.log("VideoChatPage: Connected to socket server with ID:", newSocket.id);
    });

    newSocket.on('partnerFound', ({ partnerId: pId, roomId: rId, interests: partnerInterests }: { partnerId: string, roomId: string, interests: string[] }) => {
        setIsFindingPartner(false);
        setIsPartnerConnected(true);
        setRoomId(rId);
        setupWebRTC(newSocket, rId, true); 
    });

    newSocket.on('waitingForPartner', () => {
        // System message for "Searching..." is handled by the other useEffect
    });
    
    newSocket.on('noPartnerFound', () => {
        setIsFindingPartner(false);
        if (!isFindingPartner && !isPartnerConnected) {
             setIsFindingPartner(true);
        }
    });

    newSocket.on('receiveMessage', ({ senderId, message: receivedMessage }: { senderId: string, message: string }) => {
        addMessage(receivedMessage, 'partner');
    });
    
    newSocket.on('webrtcSignal', async (signalData: any) => {
        if (!peerConnectionRef.current) {
             if (isPartnerConnected && roomId && !peerConnectionRef.current && newSocket) {
                console.log("VideoChatPage: Receiving signal before local PC setup, attempting setup now (non-initiator).");
                await setupWebRTC(newSocket, roomId, false); 
            }
            if (!peerConnectionRef.current) {
                console.error("VideoChatPage: PeerConnection not initialized, cannot handle signal", signalData);
                return;
            }
        }
        try {
            if (signalData.type === 'offer') {
                console.log("VideoChatPage: Received offer");
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signalData));
                const answer = await peerConnectionRef.current.createAnswer();
                await peerConnectionRef.current.setLocalDescription(answer);
                newSocket.emit('webrtcSignal', { roomId, signalData: answer });
                console.log("VideoChatPage: Sent answer");
            } else if (signalData.type === 'answer') {
                console.log("VideoChatPage: Received answer");
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signalData));
            } else if (signalData.candidate) {
                console.log("VideoChatPage: Received ICE candidate");
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signalData.candidate));
            }
        } catch (error) {
            console.error("VideoChatPage: Error handling WebRTC signal:", error, signalData);
        }
    });

    newSocket.on('partnerLeft', () => {
        cleanupConnections(false); 
        setIsPartnerConnected(false);
        setRoomId(null);
    });

    newSocket.on('disconnect', (reason) => {
        console.log("VideoChatPage: Disconnected from socket server. Reason:", reason);
         if (reason === 'io server disconnect') {
            newSocket.connect();
        }
    });
     newSocket.on('connect_error', (err) => {
        console.error("VideoChatPage: Socket connection error:", err.message);
        toast({
            title: "Connection Error",
            description: `Could not connect to chat server: ${err.message}. Please try again later.`,
            variant: "destructive"
        });
        setIsFindingPartner(false);
    });

    return () => {
      cleanupConnections(true);
      if (newSocket.connected && roomId) {
        newSocket.emit('leaveChat', { roomId });
      }
      newSocket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';


  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollToItem(messages.length - 1, "end");
    }
  }, [messages]);

  const cleanupConnections = useCallback((stopLocalStream = true) => {
    if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        console.log("VideoChatPage: PeerConnection closed.");
    }
    if (stopLocalStream && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        console.log("VideoChatPage: Local stream stopped.");
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const getCameraStream = useCallback(async () => {
    if (localStreamRef.current) { 
        if (localVideoRef.current && !localVideoRef.current.srcObject) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }
        setHasCameraPermission(true);
        return localStreamRef.current;
    }

    if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        setHasCameraPermission(false);
        toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Camera access (getUserMedia) is not supported by your browser.'});
        return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setHasCameraPermission(true);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error('VideoChatPage: Error accessing camera:', error);
      setHasCameraPermission(false);
       toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Please enable camera permissions in your browser settings to use this app.',
        });
      return null;
    }
  }, [toast]);

  useEffect(() => {
    if (isMounted && hasCameraPermission === undefined) { 
        getCameraStream();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, getCameraStream]); 


  const setupWebRTC = useCallback(async (currentSocket: Socket, currentRoomId: string, initiator: boolean) => {
    if (!currentSocket || !currentRoomId) return;
    console.log("VideoChatPage: Setting up WebRTC. Initiator:", initiator);

    const stream = await getCameraStream();
    if (!stream) {
        toast({ title: "Camera Error", description: "Cannot setup video chat without camera.", variant: "destructive"});
        setIsFindingPartner(false); 
        setIsPartnerConnected(false); 
        return;
    }

    if (peerConnectionRef.current) {
        console.warn("VideoChatPage: PeerConnection already exists. Closing existing before creating new.");
        peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
    });
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("VideoChatPage: Sending ICE candidate");
            currentSocket.emit('webrtcSignal', { roomId: currentRoomId, signalData: { candidate: event.candidate } });
        }
    };

    pc.ontrack = (event) => {
        console.log("VideoChatPage: Received remote track");
        if (remoteVideoRef.current && event.streams && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
        }
    };
    
    pc.oniceconnectionstatechange = () => {
        console.log("VideoChatPage: ICE connection state change:", pc.iceConnectionState);
    };


    if (initiator) {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log("VideoChatPage: Sending offer");
            currentSocket.emit('webrtcSignal', { roomId: currentRoomId, signalData: offer });
        } catch (error) {
            console.error("VideoChatPage: Error creating offer:", error);
        }
    }
  }, [getCameraStream, toast]); 


  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim() || !socket || !roomId || !isPartnerConnected) return;
    socket.emit('sendMessage', { roomId, message: newMessage });
    addMessage(newMessage, 'me');
    setNewMessage('');
  }, [newMessage, socket, roomId, addMessage, isPartnerConnected]);

  const handleFindOrDisconnectPartner = useCallback(async () => {
    if (!socket) {
        toast({ title: "Not Connected", description: "Not connected to the chat server.", variant: "destructive" });
        return;
    }

    if (isPartnerConnected) {
        socket.emit('leaveChat', { roomId });
        cleanupConnections(false); 
        setIsPartnerConnected(false);
        setRoomId(null);
        setIsFindingPartner(false);
    } else if (isFindingPartner) {
        // Logic to stop finding partner - currently just sets state
        // Consider emitting an event to the server if needed to remove from waiting list
        socket.emit('leaveChat', { roomId: null }); // Inform server to remove from any waiting lists
        setIsFindingPartner(false);
    } else {
        if (hasCameraPermission === false) {
            toast({ title: "Camera Required", description: "Camera permission is required to find a video chat partner.", variant: "destructive"});
            return;
        }
        if (hasCameraPermission === undefined) { 
            const stream = await getCameraStream(); 
            if (!stream) return; 
        }
        
        setIsFindingPartner(true);
        socket.emit('findPartner', { chatType: 'video', interests });
    }
  }, [socket, isPartnerConnected, isFindingPartner, roomId, interests, toast, hasCameraPermission, cleanupConnections, getCameraStream]);


  const inputAreaHeight = 60;
  const scrollableChatHeight = chatListContainerHeight > inputAreaHeight ? chatListContainerHeight - inputAreaHeight : 0;
  const itemData = useMemo(() => ({ messages, theme: effectivePageTheme }), [messages, effectivePageTheme]);

  if (!isMounted) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p>Loading video chat interface...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full p-2 md:p-4">
      <div className="flex justify-center gap-4 mb-4 mx-auto">
        <div
          className={cn(
            'window flex flex-col m-2',
            effectivePageTheme === 'theme-7' ? 'glass' : 'no-padding-window-body'
          )}
          style={{width: '250px', height: '200px'}}
        >
          <div className={cn("title-bar text-sm", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
            <div className="title-bar-text">Your Video</div>
          </div>
          <div
            className={cn(
              'window-body flex-grow overflow-hidden relative p-0',
               effectivePageTheme === 'theme-7' && 'bg-white/30'
            )}
          >
            <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover bg-black" data-ai-hint="local camera" />
            { hasCameraPermission === false && (
              <Alert variant="destructive" className="m-1 absolute bottom-0 left-0 right-0 text-xs p-1">
                <AlertTitle className="text-xs">Camera Denied</AlertTitle>
              </Alert>
            )}
             { hasCameraPermission === undefined && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">Requesting camera...</p>
                </div>
              )}
          </div>
        </div>

        <div
          className={cn(
            'window flex flex-col m-2',
            effectivePageTheme === 'theme-7' ? 'glass' : 'no-padding-window-body'
          )}
          style={{width: '250px', height: '200px'}}
        >
          <div className={cn("title-bar text-sm", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
            <div className="title-bar-text">Partner's Video</div>
          </div>
          <div
            className={cn(
              'window-body flex-grow overflow-hidden relative p-0', 
              effectivePageTheme === 'theme-7' && 'bg-white/30'
              )}
          >
            <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera" />
            {isFindingPartner && !isPartnerConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                <p className="text-white text-center p-2 text-sm">Searching for partner...</p>
              </div>
            )}
            {!isFindingPartner && !isPartnerConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                <p className="text-white text-center p-2 text-sm">Partner video unavailable</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'window flex flex-col flex-1 relative m-2', 
          effectivePageTheme === 'theme-7' ? 'glass' : ''
        )}
        style={{ minHeight: '300px', width: '100%', maxWidth: '500px', height: '500px', margin: '0 auto' }}
      >
        <div className={cn("title-bar", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
          <div className="title-bar-text">Chat</div>
        </div>
        <div
          ref={chatListContainerRef}
          className={cn(
            'window-body window-body-content flex-grow',
            effectivePageTheme === 'theme-7' ? 'glass-body-padding' : 'p-0.5'
          )}
        >
          <div
            className={cn(
              "flex-grow",
              effectivePageTheme === 'theme-7' ? 'border p-2 bg-white bg-opacity-20 dark:bg-gray-700 dark:bg-opacity-20' : 'sunken-panel tree-view p-1'
            )}
             style={{ height: scrollableChatHeight > 0 ? `${scrollableChatHeight}px` : '100%' }}
          >
            {scrollableChatHeight > 0 && chatListContainerWidth > 0 ? (
              <List
                ref={listRef}
                height={scrollableChatHeight}
                itemCount={messages.length}
                itemSize={itemHeight}
                width={chatListContainerWidth}
                itemData={itemData}
                className="scroll-area-viewport"
              >
                {Row}
              </List>
            ) : (
              <div className="flex flex-col items-center justify-center h-full"> {/* Fallback with flex-col */}
                {messages.map((msg, index) => ( 
                   <Row key={msg.id} index={index} style={{ width: '100%' }} data={{messages: messages, theme: effectivePageTheme }} />
                ))}
              </div>
            )}
          </div>
           <div
            className={cn(
              "p-2 flex-shrink-0",
              effectivePageTheme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : 'input-area status-bar'
            )}
            style={{ height: `${inputAreaHeight}px` }}
          >
            <div className="flex items-center w-full">
               <Button
                onClick={handleFindOrDisconnectPartner}
                disabled={hasCameraPermission === undefined && !isPartnerConnected} 
                className={cn(
                  effectivePageTheme === 'theme-7' ? 'glass-button-styled mr-1' : 'px-1 py-1 mr-1'
                )}
              >
                {isFindingPartner ? 'Searching...' : (isPartnerConnected ? 'Disconnect' : 'Find Partner')}
              </Button>
              <Input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 w-full px-1 py-1"
                disabled={!isPartnerConnected || isFindingPartner}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!isPartnerConnected || isFindingPartner || !newMessage.trim()}
                className={cn(
                  effectivePageTheme === 'theme-7' ? 'glass-button-styled ml-1' : 'px-1 py-1 ml-1'
                )}
              >
                Send
              </Button>
            </div>
          </div>
        </div>
        {effectivePageTheme === 'theme-7' && (
          <img
            src="https://github.com/ekansh28/files/blob/main/goldfish.png?raw=true"
            alt="Decorative Goldfish"
            className="absolute top-[-60px] right-4 w-[150px] h-[150px] object-contain pointer-events-none select-none z-20"
            data-ai-hint="goldfish decoration"
          />
        )}
      </div>
    </div>
  );
};

export default VideoChatPageClientContent;
```