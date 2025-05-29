
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

// Constants for Emojis
const EMOJI_BASE_URL_DISPLAY = "https://storage.googleapis.com/chat_emoticons/display_98/";
const STATIC_DISPLAY_EMOJI_FILENAMES = [
  'angel.png', 'bigsmile.png', 'burp.png', 'cool.png', 'crossedlips.png',
  'cry.png', 'embarrassed.png', 'kiss.png', 'moneymouth.png', 'sad.png',
  'scream.png', 'smile.png', 'think.png', 'tongue.png', 'wink.png', 'yell.png'
];
const SMILE_EMOJI_FILENAME = 'smile.png';
const EMOJI_BASE_URL_PICKER = "https://storage.googleapis.com/chat_emoticons/emotes_98/";

const INPUT_AREA_HEIGHT = 60;
const TYPING_INDICATOR_HEIGHT = 24; // For h-6 (1.5rem)


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
          className="inline h-5 w-5 mx-0.5 align-middle"
          data-ai-hint="chat emoji"
        />
      );
    } else {
      parts.push(match[0]);
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
  const previousMessage = index > 0 ? data.messages[index - 1] : undefined;
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
    previousMessage?.sender !== undefined &&
    (previousMessage.sender === 'me' || previousMessage.sender === 'partner') &&
    (currentMessage.sender === 'me' || currentMessage.sender === 'partner') &&
    currentMessage.sender !== previousMessage.sender;

  const messageContent = theme === 'theme-98'
    ? renderMessageWithEmojis(currentMessage.text, pickerEmojiFilenames, EMOJI_BASE_URL_PICKER)
    : [currentMessage.text];

  return (
    <div style={style}>
      {showDivider && (
        <div
          className="h-[2px] mb-1 border border-[#CEDCE5] bg-[#64B2CF]"
          aria-hidden="true"
        ></div>
      )}
      <div className="mb-2 break-words">
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  // Typing Indicator State
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [typingDots, setTypingDots] = useState('');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSentTypingStartRef = useRef(false);

  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';

  const itemData = useMemo(() => ({ messages, theme: effectivePageTheme, pickerEmojiFilenames }), [messages, effectivePageTheme, pickerEmojiFilenames]);


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
    if (!isFindingPartner && prevIsFindingPartnerRef.current && !isPartnerConnected && !roomId) {
         const isSearchingMessagePresent = messages.some(msg => msg.sender === 'system' && msg.text.toLowerCase().includes('searching for a partner'));
        if (isSearchingMessagePresent) {
             setMessages(prev => prev.filter(msg => !(msg.sender === 'system' && msg.text.toLowerCase().includes('searching for a partner'))));
             addMessage('Stopped searching for a partner.', 'system');
        }
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
  }, [isPartnerConnected, isFindingPartner, addMessage, interests, partnerInterests, roomId, messages]);


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
  }, [getCameraStream, toast, setIsFindingPartner, setIsPartnerConnected]);


  useEffect(() => {
    setIsMounted(true);
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) {
        console.error("VideoChatPage: Socket server URL is not defined.");
        toast({ title: "Configuration Error", description: "Socket server URL is missing.", variant: "destructive" });
        return;
    }
    const newSocket = io(socketServerUrl, {
      withCredentials: true,
      transports: ['websocket'] // Prioritize WebSocket
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
        // System message handled by other useEffect
    });

    newSocket.on('noPartnerFound', () => {
        setIsFindingPartner(false);
    });

    newSocket.on('receiveMessage', ({ senderId, message: receivedMessage }: { senderId: string, message: string }) => {
        addMessage(receivedMessage, 'partner');
    });

    newSocket.on('webrtcSignal', async (signalData: any) => {
        let pc = peerConnectionRef.current;
        if (!pc) {
             if (isPartnerConnected && roomId && !pc && newSocket) { 
                console.log("VideoChatPage: Receiving signal before local PC setup, attempting setup now (non-initiator).");
                await setupWebRTC(newSocket, roomId, false); 
                pc = peerConnectionRef.current; 
            }
            if (!pc) { 
                console.error("VideoChatPage: PeerConnection not initialized, cannot handle signal", signalData);
                return;
            }
        }
        try {
            if (signalData.type === 'offer') {
                console.log("VideoChatPage: Received offer");
                await pc.setRemoteDescription(new RTCSessionDescription(signalData));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                if (newSocket && roomId) { 
                   newSocket.emit('webrtcSignal', { roomId, signalData: answer });
                   console.log("VideoChatPage: Sent answer");
                } else {
                    console.error("VideoChatPage: Socket or RoomID missing, cannot send answer.");
                }
            } else if (signalData.type === 'answer') {
                console.log("VideoChatPage: Received answer");
                await pc.setRemoteDescription(new RTCSessionDescription(signalData));
            } else if (signalData.candidate) {
                console.log("VideoChatPage: Received ICE candidate");
                await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
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
        setIsPartnerTyping(false);
    });

    newSocket.on('partner_typing_start', () => {
      setIsPartnerTyping(true);
    });

    newSocket.on('partner_typing_stop', () => {
      setIsPartnerTyping(false);
    });

    newSocket.on('disconnect', (reason) => {
        console.log("VideoChatPage: Disconnected from socket server. Reason:", reason);
         if (reason === 'io server disconnect') {
            // newSocket.connect(); // Reconnection is often handled automatically by Socket.IO client
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
      } catch (error: any) {
        const specificErrorMessage = error.message || String(error);
        console.error("Detailed GCS Error in listEmojisFlow (client-side):", specificErrorMessage);
        toast({
          title: "Emoji Error",
          description: `Could not load emojis for the picker. ${specificErrorMessage}`,
          variant: "destructive",
        });
        setPickerEmojiFilenames([]);
      } finally {
        setEmojisLoading(false);
      }
    };
    fetchPickerEmojis();

    return () => {
      if (newSocket && newSocket.connected && roomId && hasSentTypingStartRef.current) {
        newSocket.emit('typing_stop', { roomId });
      }
      cleanupConnections(true);
      if (newSocket && newSocket.connected && roomId) {
        newSocket.emit('leaveChat', { roomId });
      }
      if (newSocket) {
        newSocket.disconnect();
      }
      if (hoverIntervalRef.current) {
        clearInterval(hoverIntervalRef.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [addMessage, toast, interests, partnerInterests, cleanupConnections, setupWebRTC, roomId, setPartnerInterests, setIsFindingPartner, setIsPartnerConnected, setRoomId, setPickerEmojiFilenames, setEmojisLoading]);


  useEffect(() => {
    if (isMounted && hasCameraPermission === undefined) { 
        getCameraStream();
    }
  }, [isMounted, hasCameraPermission, getCameraStream]);


  useEffect(() => {
    const useReactWindowList = scrollableChatListHeight > 0 && chatListContainerWidth > 0;
    if (useReactWindowList) {
      if (listRef.current && messages.length > 0) {
        listRef.current.scrollToItem(messages.length - 1, "end");
      }
    } else {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, chatListContainerHeight, chatListContainerWidth, scrollableChatListHeight]);

  useEffect(() => {
    let dotsInterval: NodeJS.Timeout | null = null;
    if (isPartnerTyping) {
      dotsInterval = setInterval(() => {
        setTypingDots(prevDots => {
          if (prevDots === '...') return '.';
          if (prevDots === '..') return '...';
          if (prevDots === '.') return '..';
          return '.';
        });
      }, 500);
    } else {
      setTypingDots('');
      if (dotsInterval) clearInterval(dotsInterval);
    }
    return () => {
      if (dotsInterval) clearInterval(dotsInterval);
    };
  }, [isPartnerTyping]);


  const stopLocalTyping = useCallback(() => {
    if (socket && roomId && hasSentTypingStartRef.current) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      socket.emit('typing_stop', { roomId });
      hasSentTypingStartRef.current = false;
    }
  }, [socket, roomId]);

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim() || !socket || !roomId || !isPartnerConnected) return;
    socket.emit('sendMessage', { roomId, message: newMessage });
    addMessage(newMessage, 'me');
    setNewMessage('');
    stopLocalTyping();
  }, [newMessage, socket, roomId, addMessage, isPartnerConnected, stopLocalTyping, setNewMessage]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const currentInputMessage = e.target.value;
    setNewMessage(currentInputMessage);

    if (!socket || !roomId || !isPartnerConnected) {
      if (hasSentTypingStartRef.current) {
          hasSentTypingStartRef.current = false;
          if(typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      }
      return;
    }

    if (currentInputMessage.trim().length > 0) {
      if (!hasSentTypingStartRef.current) {
        socket.emit('typing_start', { roomId });
        hasSentTypingStartRef.current = true;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
         if (hasSentTypingStartRef.current) {
             socket.emit('typing_stop', { roomId });
             hasSentTypingStartRef.current = false;
        }
      }, 1500);
    } else {
      if (hasSentTypingStartRef.current) {
        stopLocalTyping();
      }
    }
  }, [socket, roomId, isPartnerConnected, setNewMessage, stopLocalTyping]);

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
        setIsPartnerTyping(false);
        addMessage('You have disconnected. Searching for a new partner...', 'system');
        setIsFindingPartner(true);
        socket.emit('findPartner', { chatType: 'video', interests });

    } else if (isFindingPartner) { 
        setIsFindingPartner(false);
        // System message "Stopped searching..." handled by other useEffect
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
      hasCameraPermission, cleanupConnections, getCameraStream, addMessage,
      setIsFindingPartner, setIsPartnerConnected, setRoomId, setPartnerInterests 
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
        const emojiIcon = document.getElementById('emoji-icon-trigger-video');
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


  if (!isMounted) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p>Loading video chat interface...</p>
      </div>
    );
  }

  const inputAreaHeight = INPUT_AREA_HEIGHT; 
  const typingIndicatorEffectiveHeight = isPartnerTyping ? TYPING_INDICATOR_HEIGHT : 0;
  const scrollableChatListHeight = chatListContainerHeight - inputAreaHeight - typingIndicatorEffectiveHeight;


  return (
    <div className="flex flex-col items-center justify-center w-full p-2 md:p-4">
      <div className="flex justify-center gap-4 mb-4 mx-auto">
        <div
          className={cn(
            'window flex flex-col m-2',
            effectivePageTheme === 'theme-7' ? 'glass' : ''
          )}
          style={{width: '325px', height: '198px'}}
        >
          <div className={cn(
              "title-bar text-sm", 
              effectivePageTheme === 'theme-98' ? 'video-feed-title-bar' : 'video-feed-title-bar', 
              effectivePageTheme === 'theme-7' ? 'text-black' : '' 
            )}>
            <div className="title-bar-text">
              {effectivePageTheme === 'theme-7' && ""}
            </div>
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
            effectivePageTheme === 'theme-7' ? 'glass' : ''
          )}
          style={{width: '325px', height: '198px'}}
        >
          <div className={cn(
              "title-bar text-sm", 
               effectivePageTheme === 'theme-98' ? 'video-feed-title-bar' : 'video-feed-title-bar', 
               effectivePageTheme === 'theme-7' ? 'text-black' : '' 
            )}>
            <div className="title-bar-text">
              {effectivePageTheme === 'theme-7' && ""}
            </div>
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
           {effectivePageTheme === 'theme-7' && (
            <img
                src="https://github.com/ekansh28/files/blob/main/goldfish.png?raw=true"
                alt="Decorative Goldfish"
                className="absolute top-[-60px] right-4 w-[150px] h-[150px] object-contain pointer-events-none select-none z-20"
                data-ai-hint="goldfish decoration"
            />
           )}
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
              "flex-grow overflow-y-auto",
              effectivePageTheme === 'theme-7' ? 'border p-2 bg-white bg-opacity-20 dark:bg-gray-700 dark:bg-opacity-20' : 'sunken-panel tree-view p-1'
            )}
          >
            {(scrollableChatListHeight > 0 && chatListContainerWidth > 0) ? (
              <List
                ref={listRef}
                height={scrollableChatListHeight}
                itemCount={messages.length}
                itemSize={itemHeight}
                width={chatListContainerWidth}
                itemData={itemData}
                className="scroll-area-viewport"
              >
                {Row}
              </List>
            ) : (
              <div className="h-full overflow-y-auto p-1">
               {messages.map((msg, index) => (
                   <div key={msg.id}>
                    <Row index={index} style={{ width: '100%' }} data={{messages: messages, theme: effectivePageTheme, pickerEmojiFilenames: pickerEmojiFilenames }} />
                   </div>
                ))}
                 <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          {isPartnerTyping && (
            <div
              className={cn(
                "text-xs italic px-2 text-left flex-shrink-0",
                `h-[${TYPING_INDICATOR_HEIGHT}px] leading-[${TYPING_INDICATOR_HEIGHT}px]`,
                effectivePageTheme === 'theme-7' ? 'theme-7-text-shadow text-gray-100' : 'text-gray-500 dark:text-gray-400',
                effectivePageTheme === 'theme-98' ? 'status-bar-field' : ''
              )}
            >
              Stranger is typing{typingDots}
            </div>
          )}
           <div
            className={cn(
              "p-2 flex-shrink-0",
              effectivePageTheme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : 'input-area status-bar'
            )}
            style={{ height: `${INPUT_AREA_HEIGHT}px` }}
          >
            <div className="flex items-center w-full">
               <Button
                onClick={handleFindOrDisconnectPartner}
                disabled={(hasCameraPermission === undefined && !isPartnerConnected && !isFindingPartner) || !socket || (!isFindingPartner && !isPartnerConnected && !socket?.connected)}
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
                onChange={handleInputChange}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 w-full px-1 py-1"
                disabled={!isPartnerConnected || isFindingPartner}
              />
              {effectivePageTheme === 'theme-98' && !emojisLoading && (
                <div className="relative ml-1 flex-shrink-0">
                  <img
                    id="emoji-icon-trigger-video"
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
                              className="max-w-6 max-h-6 object-contain cursor-pointer hover:bg-navy hover:p-0.5"
                              onClick={() => {
                                setNewMessage(prev => prev + ` :${filename.split('.')[0]}: `);
                                setIsEmojiPickerOpen(false);
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
