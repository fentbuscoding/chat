
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
import { listEmojis } from '@/ai/flows/list-emojis-flow';

// Constants for Emojis - Defined at the top level
const EMOJI_BASE_URL_DISPLAY = "https://storage.googleapis.com/chat_emoticons/display_98/";
const STATIC_DISPLAY_EMOJI_FILENAMES = [
  'angel.png', 'bigsmile.png', 'burp.png', 'cool.png', 'crossedlips.png',
  'cry.png', 'embarrassed.png', 'kiss.png', 'moneymouth.png', 'sad.png',
  'scream.png', 'smile.png', 'think.png', 'tongue.png', 'wink.png', 'yell.png'
];
const SMILE_EMOJI_FILENAME = 'smile.png';
const EMOJI_BASE_URL_PICKER = "https://storage.googleapis.com/chat_emoticons/emotes_98/";


interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: Date;
}

const renderMessageWithEmojis = (text: string, emojiFilenames: string[], baseUrl: string): (string | JSX.Element)[] => {
  if (!emojiFilenames || emojiFilenames.length === 0) {
    return [text];
  }

  const parts = [];
  let lastIndex = 0;
  const regex = /:([a-zA-Z0-9_.-]+?):/g; 
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const shortcodeName = match[1];
    const matchedFilename = emojiFilenames.find(
      (filename) => filename.split('.')[0].toLowerCase() === shortcodeName.toLowerCase()
    );

    if (matchedFilename) {
      parts.push(
        <img
          key={`${match.index}-${shortcodeName}`}
          src={`${baseUrl}${matchedFilename}`}
          alt={shortcodeName}
          className="inline h-5 w-5 mx-0.5 align-middle" // Size for emojis in chat messages
          data-ai-hint="chat emoji"
        />
      );
    } else {
      parts.push(match[0]); // If no match, keep the original shortcode text
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : [text];
};


interface ItemDataForVideoChat {
  messages: Message[];
  theme: string;
  pickerEmojiFilenames: string[];
}

const Row = React.memo(({ index, style, data }: ListChildComponentProps<ItemDataForVideoChat>) => {
  const currentMessage = data.messages[index];
  const previousSender = index > 0 ? data.messages[index - 1]?.sender : undefined;
  const theme = data.theme;
  const pickerEmojiFilenames = data.pickerEmojiFilenames;

  if (currentMessage.sender === 'system') {
    return (
      <div style={style} className="mb-2">
        <div className={cn(
          "text-center w-full text-xs italic",
           theme === 'theme-7' ? 'theme-7-text-shadow text-gray-100' : 'text-gray-500 dark:text-gray-400'
        )}>
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
  
  const messageContent = theme === 'theme-98'
    ? renderMessageWithEmojis(currentMessage.text, pickerEmojiFilenames, EMOJI_BASE_URL_PICKER)
    : [currentMessage.text]; // For theme-7, render plain text

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
            <span className={cn(theme === 'theme-7' && 'theme-7-text-shadow')}>{messageContent}</span>
          </>
        )}
        {currentMessage.sender === 'partner' && (
          <>
            <span className="text-red-600 font-bold mr-1">Stranger:</span>
            <span className={cn(theme === 'theme-7' && 'theme-7-text-shadow')}>{messageContent}</span>
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
  const [partnerInterests, setPartnerInterests] = useState<string[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | undefined>(undefined);

  const interests = useMemo(() => searchParams.get('interests')?.split(',').filter(i => i.trim() !== '') || [], [searchParams]);

  const listRef = useRef<List>(null);
  const chatListContainerRef = useRef<HTMLDivElement>(null);
  const { width: chatListContainerWidth, height: chatListContainerHeight } = useElementSize(chatListContainerRef);
  const itemHeight = 30;

  const prevIsFindingPartnerRef = useRef(isFindingPartner);
  const prevIsPartnerConnectedRef = useRef(isPartnerConnected);

  // Emoji Feature State
  const [currentEmojiIconUrl, setCurrentEmojiIconUrl] = useState(() => `${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pickerEmojiFilenames, setPickerEmojiFilenames] = useState<string[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(true);
  const hoverIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      const newMessageItem = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        text,
        sender,
        timestamp: new Date()
      };
      return [...prevMessages, newMessageItem];
    });
  }, []);

 useEffect(() => {
    if (isFindingPartner && !prevIsFindingPartnerRef.current && !isPartnerConnected) {
      addMessage('Searching for a partner...', 'system');
    }

    if (isPartnerConnected && !prevIsPartnerConnectedRef.current) {
      setMessages(prev => prev.filter(msg =>
        !(msg.sender === 'system' &&
          (msg.text.toLowerCase().includes('searching for a partner') ||
           msg.text.toLowerCase().includes('your partner has disconnected') ||
           msg.text.toLowerCase().includes('stopped searching for a partner')
           ))
      ));
      addMessage('Connected with a partner. You can start chatting!', 'system');

      if (interests.length > 0 && partnerInterests.length > 0) {
        const common = interests.filter(interest => partnerInterests.includes(interest));
        if (common.length > 0) {
          addMessage(`You both like ${common.join(', ')}.`, 'system');
        }
      }
    }

    prevIsFindingPartnerRef.current = isFindingPartner;
    prevIsPartnerConnectedRef.current = isPartnerConnected;
  }, [isPartnerConnected, isFindingPartner, addMessage, interests, partnerInterests]);


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

    newSocket.on('partnerFound', ({ partnerId: pId, roomId: rId, interests: pInterests }: { partnerId: string, roomId: string, interests: string[] }) => {
        setIsFindingPartner(false);
        setIsPartnerConnected(true);
        setRoomId(rId);
        setPartnerInterests(pInterests || []);
        setupWebRTC(newSocket, rId, true);
    });

    newSocket.on('waitingForPartner', () => {
        // System message for "Searching..." is handled by the other useEffect
    });

    newSocket.on('noPartnerFound', () => {
        setIsFindingPartner(false);
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
                if (newSocket && roomId) { 
                   newSocket.emit('webrtcSignal', { roomId, signalData: answer });
                   console.log("VideoChatPage: Sent answer");
                } else {
                    console.error("VideoChatPage: Socket or RoomID missing, cannot send answer.");
                }
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
        addMessage('Your partner has disconnected.', 'system');
        cleanupConnections(false);
        setIsPartnerConnected(false);
        setRoomId(null);
        setPartnerInterests([]);
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

    const fetchPickerEmojis = async () => {
      try {
        setEmojisLoading(true);
        const emojiList = await listEmojis();
        setPickerEmojiFilenames(Array.isArray(emojiList) ? emojiList : []);
      } catch (error) {
        console.error("Failed to fetch emojis for picker:", error);
        toast({
          title: "Emoji Error",
          description: "Could not load emojis for the picker.",
          variant: "destructive",
        });
        setPickerEmojiFilenames([]);
      } finally {
        setEmojisLoading(false);
      }
    };
    fetchPickerEmojis();

    return () => {
      cleanupConnections(true);
      if (newSocket.connected && roomId) {
        newSocket.emit('leaveChat', { roomId });
      }
      newSocket.disconnect();
      if (hoverIntervalRef.current) {
        clearInterval(hoverIntervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';


  useEffect(() => {
    if (listRef.current && messages.length > 0 && chatListContainerHeight > 0 && chatListContainerWidth > 0) {
      listRef.current.scrollToItem(messages.length - 1, "end");
    }
  }, [messages, chatListContainerHeight, chatListContainerWidth]);

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
    if (isMounted && hasCameraPermission === undefined) { // Only attempt if mounted and permission status unknown
        getCameraStream();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]); // getCameraStream is memoized.


  const setupWebRTC = useCallback(async (currentSocket: Socket, currentRoomId: string, initiator: boolean) => {
    if (!currentSocket || !currentRoomId) {
        console.error("VideoChatPage: setupWebRTC called with invalid socket or roomId.");
        return;
    }
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
        setPartnerInterests([]);
        setMessages(prev => prev.filter(msg =>
          !(msg.sender === 'system' &&
            (msg.text.toLowerCase().includes('connected with a partner') ||
             msg.text.toLowerCase().includes('you both like')))
        ));
        addMessage('You have disconnected.', 'system');
        setIsFindingPartner(true);
        socket.emit('findPartner', { chatType: 'video', interests });

    } else if (isFindingPartner) { 
        setIsFindingPartner(false);
        setMessages(prev => prev.filter(msg => !(msg.sender === 'system' && msg.text.toLowerCase().includes('searching for a partner'))));
        addMessage('Stopped searching for a partner.', 'system');
    } else { 
        if (hasCameraPermission === false) {
            toast({ title: "Camera Required", description: "Camera permission is required to find a video chat partner.", variant: "destructive"});
            return;
        }
        if (hasCameraPermission === undefined) { 
            const stream = await getCameraStream(); 
            if (!stream) { 
                return; 
            }
        }
        setIsFindingPartner(true);
        socket.emit('findPartner', { chatType: 'video', interests });
    }
  }, [
      socket, isPartnerConnected, isFindingPartner, roomId, interests, toast,
      hasCameraPermission, cleanupConnections, getCameraStream, addMessage
    ]);

  const handleEmojiIconHover = () => {
    if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
    if (STATIC_DISPLAY_EMOJI_FILENAMES.length === 0) return;

    hoverIntervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * STATIC_DISPLAY_EMOJI_FILENAMES.length);
      setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${STATIC_DISPLAY_EMOJI_FILENAMES[randomIndex]}`);
    }, 300);
  };

  const stopEmojiCycle = () => {
    if (hoverIntervalRef.current) {
      clearInterval(hoverIntervalRef.current);
      hoverIntervalRef.current = null;
    }
    setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  };

  const toggleEmojiPicker = () => {
    setIsEmojiPickerOpen(prev => !prev);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        const emojiIcon = document.getElementById('emoji-icon-trigger-video'); // Unique ID for video page
        if (emojiIcon && emojiIcon.contains(event.target as Node)) {
          return; 
        }
        setIsEmojiPickerOpen(false);
      }
    };
    if (isEmojiPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEmojiPickerOpen]);


  const inputAreaHeight = 60;
  const scrollableChatHeight = chatListContainerHeight > inputAreaHeight ? chatListContainerHeight - inputAreaHeight : 0;
  const itemData = useMemo(() => ({ messages, theme: effectivePageTheme, pickerEmojiFilenames }), [messages, effectivePageTheme, pickerEmojiFilenames]);

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
        {effectivePageTheme === 'theme-7' && (
          <img
            src="https://github.com/ekansh28/files/blob/main/goldfish.png?raw=true"
            alt="Decorative Goldfish"
            className="absolute top-[-60px] right-4 w-[150px] h-[150px] object-contain pointer-events-none select-none z-20"
            data-ai-hint="goldfish decoration"
          />
        )}
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
              <div className="h-full overflow-y-auto"> 
               {messages.map((msg, index) => ( 
                   <Row key={`${msg.id}-${index}`} index={index} style={{ width: '100%' }} data={{messages: messages, theme: effectivePageTheme, pickerEmojiFilenames: pickerEmojiFilenames }} />
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
                disabled={(hasCameraPermission === undefined && !isPartnerConnected && !isFindingPartner) || !socket}
                className={cn(
                  'mr-1',
                  effectivePageTheme === 'theme-7' ? 'glass-button-styled' : 'px-1 py-1'
                )}
              >
                {isPartnerConnected ? 'Disconnect' : (isFindingPartner ? 'Stop Searching' : 'Find Partner')}
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
              {effectivePageTheme === 'theme-98' && !emojisLoading && (
                <div className="relative ml-1 flex-shrink-0">
                  <img
                    id="emoji-icon-trigger-video" // Unique ID for video page
                    src={currentEmojiIconUrl}
                    alt="Emoji"
                    className="w-5 h-5 cursor-pointer inline-block"
                    onMouseEnter={handleEmojiIconHover}
                    onMouseLeave={stopEmojiCycle}
                    onClick={toggleEmojiPicker}
                    data-ai-hint="emoji icon"
                  />
                  {isEmojiPickerOpen && (
                    <div
                      ref={emojiPickerRef}
                      className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-silver border border-raised z-30 window"
                      style={{ boxShadow: 'inset 1px 1px #fff, inset -1px -1px gray, 1px 1px gray' }}
                    >
                      {pickerEmojiFilenames.length > 0 ? (
                        <div className="h-32 overflow-y-auto grid grid-cols-4 gap-1">
                          {pickerEmojiFilenames.map((filename) => (
                            <img
                              key={filename}
                              src={`${EMOJI_BASE_URL_PICKER}${filename}`}
                              alt={filename.split('.')[0]}
                              className="cursor-pointer hover:bg-navy hover:p-0.5" // Removed w-6 h-6
                              onClick={() => {
                                setNewMessage(prev => prev + ` :${filename.split('.')[0]}: `);
                                setIsEmojiPickerOpen(false); // Close picker after selection
                              }}
                              data-ai-hint="emoji symbol"
                            />
                          ))}
                        </div>
                      ) : (
                         <p className="text-center w-full text-xs">No emojis available.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {effectivePageTheme === 'theme-98' && emojisLoading && (
                 <div className="relative ml-1 flex-shrink-0">
                    <p className="text-xs p-1">...</p>
                 </div>
              )}
              <Button
                onClick={handleSendMessage}
                disabled={!isPartnerConnected || isFindingPartner || !newMessage.trim()}
                className={cn(
                  'ml-1',
                  effectivePageTheme === 'theme-7' ? 'glass-button-styled' : 'px-1 py-1'
                )}
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoChatPageClientContent;
    

    