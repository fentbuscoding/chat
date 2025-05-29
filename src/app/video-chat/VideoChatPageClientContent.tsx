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
const TYPING_INDICATOR_HEIGHT = 20;
const itemHeight = 30; // Approximate height of a message item for react-window
const logPrefix = "VideoChatPage";

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
          className="inline h-5 w-5 mx-0.5 align-middle" // Size for emojis within messages
          data-ai-hint="chat emoji"
        />
      );
    } else {
      parts.push(match[0]); // If shortcode not found, render as text
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
  const socketRef = useRef<Socket | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const autoSearchDoneRef = useRef(false);


  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);
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

  const prevIsFindingPartnerRef = useRef(isFindingPartner);
  const prevIsPartnerConnectedRef = useRef(isPartnerConnected);

  const [currentEmojiIconUrl, setCurrentEmojiIconUrl] = useState(() => `${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pickerEmojiFilenames, setPickerEmojiFilenames] = useState<string[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(true);
  const hoverIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [typingDots, setTypingDots] = useState('.');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const localTypingRef = useRef(false);


  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';

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
    if (!isFindingPartner && prevIsFindingPartnerRef.current && !isPartnerConnected && !roomIdRef.current) {
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
           msg.text.toLowerCase().includes('stopped searching for a partner') ||
           msg.text.toLowerCase().includes('you have disconnected')
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
  }, [isPartnerConnected, isFindingPartner, addMessage, interests, partnerInterests, messages]);


  const cleanupConnections = useCallback((stopLocalStream = true) => {
    console.log("[WebRTC] cleanupConnections called. Stop local stream:", stopLocalStream);
    if (peerConnectionRef.current) {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        console.log(`${logPrefix}: PeerConnection closed.`);
    }
    if (stopLocalStream && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        console.log(`${logPrefix}: Local stream stopped.`);
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
      console.error(`${logPrefix}: Error accessing camera:`, error);
      setHasCameraPermission(false);
       toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Please enable camera permissions in your browser settings to use this app.',
        });
      return null;
    }
  }, [toast]);

  const setupWebRTC = useCallback(async (currentActiveSocket: Socket, currentRoomId: string, initiator: boolean) => {
    if (!currentActiveSocket || !currentRoomId) {
        console.error(`${logPrefix}: setupWebRTC called with invalid socket or roomId.`);
        return;
    }
    console.log(`${logPrefix}: Setting up WebRTC. Initiator:`, initiator);

    const stream = await getCameraStream();
    if (!stream) {
        toast({ title: "Camera Error", description: "Cannot setup video chat without camera.", variant: "destructive"});
        setIsFindingPartner(false); 
        setIsPartnerConnected(false); 
        return;
    }

    if (peerConnectionRef.current) {
        console.warn(`${logPrefix}: PeerConnection already exists. Closing existing before creating new.`);
        cleanupConnections(false); 
    }

    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => {
      if (pc.getSenders().find(s => s.track === track)) {
        return; 
      }
      pc.addTrack(track, stream)
    });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`${logPrefix}: Sending ICE candidate`);
            currentActiveSocket.emit('webrtcSignal', { roomId: currentRoomId, signalData: { candidate: event.candidate } });
        }
    };

    pc.ontrack = (event) => {
        console.log(`${logPrefix}: Received remote track`);
        if (remoteVideoRef.current && event.streams && event.streams[0]) {
            if(remoteVideoRef.current.srcObject !== event.streams[0]) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        } else {
            console.warn(`${logPrefix}: Remote video ref not available or no streams on track event.`)
        }
    };

    pc.oniceconnectionstatechange = () => {
      if(peerConnectionRef.current){
        console.log(`${logPrefix}: ICE connection state change:`, peerConnectionRef.current.iceConnectionState);
        if (peerConnectionRef.current.iceConnectionState === 'failed' ||
            peerConnectionRef.current.iceConnectionState === 'disconnected' ||
            peerConnectionRef.current.iceConnectionState === 'closed') {
             console.warn(`${logPrefix}: WebRTC connection failed or disconnected. Consider cleanup.`);
        }
      }
    };


    if (initiator) {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log(`${logPrefix}: Sending offer`);
            currentActiveSocket.emit('webrtcSignal', { roomId: currentRoomId, signalData: offer });
        } catch (error) {
            console.error(`${logPrefix}: Error creating offer:`, error);
        }
    }
  }, [getCameraStream, toast, cleanupConnections]);

  const handleFindOrDisconnectPartner = useCallback(async () => {
    const currentActiveSocket = socketRef.current;
    if (!currentActiveSocket) {
        toast({ title: "Not Connected", description: "Chat server connection not yet established.", variant: "destructive" });
        return;
    }

    if (isPartnerConnected && roomIdRef.current) {
        currentActiveSocket.emit('leaveChat', { roomId: roomIdRef.current });
        addMessage('You have disconnected.', 'system'); // Message for the skipper
        cleanupConnections(false); 
        setIsPartnerConnected(false);
        roomIdRef.current = null;
        setPartnerInterests([]);
        setIsFindingPartner(true); 
        currentActiveSocket.emit('findPartner', { chatType: 'video', interests });

    } else if (isFindingPartner) {
        setIsFindingPartner(false);
    } else {
        if (!currentActiveSocket.connected) {
          toast({ title: "Connecting...", description: "Attempting to connect to chat server. Please wait.", variant: "default" });
          return;
        }
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
        currentActiveSocket.emit('findPartner', { chatType: 'video', interests });
    }
  }, [
      toast, addMessage, isPartnerConnected, isFindingPartner, interests,
      hasCameraPermission, cleanupConnections, getCameraStream
    ]);

  useEffect(() => {
    setIsMounted(true);
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) {
      console.error(`${logPrefix}: Socket server URL is not defined.`);
      toast({ title: "Configuration Error", description: "Socket server URL is missing.", variant: "destructive" });
      return;
    }
    
    console.log(`${logPrefix}: Attempting to connect to socket server: ${socketServerUrl}`);
    const newSocket = io(socketServerUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    setSocket(newSocket); // Set the socket instance in state
    socketRef.current = newSocket; // Also keep a ref for immediate access in callbacks

    const handleInitialConnectAndSearch = () => {
        console.log(`${logPrefix}: Connected to socket server with ID:`, newSocket.id);
        if (!autoSearchDoneRef.current && !isPartnerConnected && !isFindingPartner && !roomIdRef.current) {
            console.log(`${logPrefix}: Automatically starting partner search on initial connect.`);
            handleFindOrDisconnectPartner(); // This uses socketRef.current which should be newSocket
            autoSearchDoneRef.current = true;
        }
    };

    if (newSocket.connected) {
      handleInitialConnectAndSearch();
    } else {
      newSocket.on('connect', handleInitialConnectAndSearch);
    }

    newSocket.on('partnerFound', ({ partnerId: pId, roomId: rId, interests: pInterests }: { partnerId: string, roomId: string, interests: string[] }) => {
      console.log(`${logPrefix}: Partner found event received`, { pId, rId, pInterests });
      roomIdRef.current = rId;
      setIsFindingPartner(false);
      setIsPartnerConnected(true);
      setPartnerInterests(pInterests || []);
      setupWebRTC(newSocket, rId, true); 
    });

    newSocket.on('waitingForPartner', () => { /* Handled by isFindingPartner state */ });
    
    newSocket.on('findPartnerCooldown', () => {
      toast({ title: "Slow down!", description: "Please wait a moment before finding a new partner.", variant: "default" });
      setIsFindingPartner(false);
    });

    newSocket.on('receiveMessage', ({ senderId, message: receivedMessage }: { senderId: string, message: string }) => {
      addMessage(receivedMessage, 'partner');
      setIsPartnerTyping(false);
    });

    newSocket.on('webrtcSignal', async (signalData: any) => {
      let pc = peerConnectionRef.current;
      const currentSocketInstance = socketRef.current; 
      const currentRoomId = roomIdRef.current;

      if (!currentSocketInstance || !currentRoomId) {
        console.error(`${logPrefix}: Socket or RoomID missing, cannot handle WebRTC signal.`);
        return;
      }

      if (!pc && isPartnerConnected) { 
        console.log(`${logPrefix}: Receiving signal before local PC setup, attempting setup now (non-initiator).`);
        await setupWebRTC(currentSocketInstance, currentRoomId, false);
        pc = peerConnectionRef.current;
      }
      if (!pc) {
        console.error(`${logPrefix}: PeerConnection not initialized, cannot handle signal`, signalData);
        return;
      }
      try {
        if (signalData.type === 'offer' && pc.signalingState !== 'stable') {
          console.log(`${logPrefix}: Received offer, but signaling state is not stable. Potentially ignoring.`, pc.signalingState);
           if (pc.signalingState === 'have-local-offer' && signalData.sdp !== pc.localDescription?.sdp) {
                console.warn(`${logPrefix}: Glare condition? Have local offer, received another offer.`);
                return; 
            }
             await pc.setRemoteDescription(new RTCSessionDescription(signalData));
             const answer = await pc.createAnswer();
             await pc.setLocalDescription(answer);
             currentSocketInstance.emit('webrtcSignal', { roomId: currentRoomId, signalData: answer });
             console.log(`${logPrefix}: Sent answer`);
        } else if (signalData.type === 'offer') {
          console.log(`${logPrefix}: Received offer`);
          await pc.setRemoteDescription(new RTCSessionDescription(signalData));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
           currentSocketInstance.emit('webrtcSignal', { roomId: currentRoomId, signalData: answer });
           console.log(`${logPrefix}: Sent answer`);
        } else if (signalData.type === 'answer') {
          console.log(`${logPrefix}: Received answer`);
          if (pc.signalingState === 'have-local-offer' || pc.signalingState === 'stable') {
              await pc.setRemoteDescription(new RTCSessionDescription(signalData));
          } else {
              console.warn(`${logPrefix}: Received answer but not in have-local-offer state.`, pc.signalingState);
          }
        } else if (signalData.candidate) {
          console.log(`${logPrefix}: Received ICE candidate`);
          if (pc.remoteDescription) { 
              await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          } else {
              console.warn(`${logPrefix}: Received ICE candidate but remote description not set. Caching or ignoring.`)
          }
        }
      } catch (error) {
        console.error(`${logPrefix}: Error handling WebRTC signal:`, error, signalData);
      }
    });

    newSocket.on('partnerLeft', () => {
      addMessage('Your partner has disconnected.', 'system');
      cleanupConnections(false); 
      setIsPartnerConnected(false);
      roomIdRef.current = null;
      setPartnerInterests([]);
      setIsPartnerTyping(false);
    });

    newSocket.on('disconnect', (reason) => {
      console.log(`${logPrefix}: Disconnected from socket server. Reason:`, reason);
      addMessage('You have been disconnected from the server.', 'system');
      cleanupConnections(true); 
      setIsPartnerConnected(false);
      setIsFindingPartner(false);
      roomIdRef.current = null;
      setIsPartnerTyping(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error(`${logPrefix}: Socket connection error:`, err.message);
      toast({
        title: "Connection Error",
        description: `Could not connect to chat server: ${err.message}. Please try again later.`,
        variant: "destructive"
      });
      setIsFindingPartner(false);
    });
    
    newSocket.on('partner_typing_start', () => setIsPartnerTyping(true));
    newSocket.on('partner_typing_stop', () => setIsPartnerTyping(false));
    
    // Fetch emojis only if theme is 98
    if (currentTheme === 'theme-98') {
      const fetchPickerEmojis = async () => {
        try {
          setEmojisLoading(true);
          const emojiList = await listEmojis();
          setPickerEmojiFilenames(Array.isArray(emojiList) ? emojiList : []);
        } catch (error: any) {
          const specificErrorMessage = error.message || String(error);
          console.error(`${logPrefix}: Error in listEmojis flow (client-side):`, specificErrorMessage, error);
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
    } else {
      setEmojisLoading(false); // Not loading if not theme-98
      setPickerEmojiFilenames([]); // Clear if theme changes away from 98
    }


    return () => {
      console.log(`${logPrefix}: Cleaning up socket listeners and disconnecting socket ID:`, newSocket.id);
      newSocket.off('connect', handleInitialConnectAndSearch);
      newSocket.off('partnerFound');
      newSocket.off('waitingForPartner');
      newSocket.off('findPartnerCooldown');
      newSocket.off('receiveMessage');
      newSocket.off('webrtcSignal');
      newSocket.off('partnerLeft');
      newSocket.off('disconnect');
      newSocket.off('connect_error');
      newSocket.off('partner_typing_start');
      newSocket.off('partner_typing_stop');
      cleanupConnections(true);
      if (roomIdRef.current) {
        newSocket.emit('leaveChat', { roomId: roomIdRef.current });
      }
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null); 
       if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
       if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, currentTheme]); // Dependencies like addMessage, handleFindOrDisconnectPartner, setupWebRTC, cleanupConnections, getCameraStream will be wrapped in useCallback or stable if possible.

  useEffect(() => {
    if (isMounted && hasCameraPermission === undefined) { 
        getCameraStream(); 
    }
  }, [isMounted, hasCameraPermission, getCameraStream]);

  const listHeight = chatListContainerHeight > (INPUT_AREA_HEIGHT + (isPartnerTyping ? TYPING_INDICATOR_HEIGHT : 0))
                     ? chatListContainerHeight - (INPUT_AREA_HEIGHT + (isPartnerTyping ? TYPING_INDICATOR_HEIGHT : 0))
                     : 0;


  const itemData = useMemo(() => ({ messages, theme: effectivePageTheme, pickerEmojiFilenames }), [messages, effectivePageTheme, pickerEmojiFilenames]);

  useEffect(() => {
    if (listRef.current && messages.length > 0 && listHeight > 0 && chatListContainerWidth > 0) {
      listRef.current.scrollToItem(messages.length - 1, "end");
    } 
    else if (messagesEndRef.current) { 
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, listHeight, chatListContainerWidth, isPartnerTyping]); 


  const stopLocalTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (socketRef.current && roomIdRef.current && localTypingRef.current) {
      socketRef.current.emit('typing_stop', { roomId: roomIdRef.current });
      localTypingRef.current = false;
    }
  }, []);

  const handleSendMessage = useCallback(() => {
    const currentActiveSocket = socketRef.current;
    if (!newMessage.trim() || !currentActiveSocket || !roomIdRef.current || !isPartnerConnected) return;
    currentActiveSocket.emit('sendMessage', { roomId: roomIdRef.current, message: newMessage });
    addMessage(newMessage, 'me');
    setNewMessage('');
    stopLocalTyping();
  }, [newMessage, addMessage, isPartnerConnected, stopLocalTyping]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    const currentActiveSocket = socketRef.current;
    if (!currentActiveSocket || !roomIdRef.current || !isPartnerConnected) return;

    if (!localTypingRef.current) {
      currentActiveSocket.emit('typing_start', { roomId: roomIdRef.current });
      localTypingRef.current = true;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      stopLocalTyping();
    }, 2000); 
  }, [isPartnerConnected, stopLocalTyping]);

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

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPartnerTyping) {
      interval = setInterval(() => {
        setTypingDots(prevDots => {
          if (prevDots === '...') return '.';
          return prevDots + '.';
        });
      }, 500);
    } else {
      setTypingDots('.');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPartnerTyping]);


  let findOrDisconnectText: string;
  if (isPartnerConnected) {
    findOrDisconnectText = 'Disconnect';
  } else if (isFindingPartner) {
    findOrDisconnectText = 'Stop Searching';
  } else {
    findOrDisconnectText = 'Find Partner';
  }
  const mainButtonDisabled = !socket?.connected || (findOrDisconnectText === 'Find Partner' && hasCameraPermission === undefined && isMounted); 
  const inputAndSendDisabled = !socket?.connected || !isPartnerConnected || isFindingPartner;


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
            effectivePageTheme === 'theme-7' ? 'glass' : ''
          )}
          style={{width: '325px', height: '198px'}}
        >
          <div className={cn(
              "title-bar text-sm",
              effectivePageTheme === 'theme-98' ? 'video-feed-title-bar' : 'video-feed-title-bar theme-7',
              effectivePageTheme === 'theme-7' ? 'text-black' : ''
            )}>
            <div className="title-bar-text">
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
             { hasCameraPermission === undefined && isMounted && ( 
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
               effectivePageTheme === 'theme-98' ? 'video-feed-title-bar' : 'video-feed-title-bar theme-7',
               effectivePageTheme === 'theme-7' ? 'text-black' : ''
            )}>
            <div className="title-bar-text">
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
        {effectivePageTheme === 'theme-7' && (
            <img
                src="https://github.com/ekansh28/files/blob/main/goldfish.png?raw=true"
                alt="Decorative Goldfish"
                className="absolute top-[-60px] right-4 w-[150px] h-[150px] object-contain pointer-events-none select-none z-20"
                data-ai-hint="goldfish decoration"
            />
        )}
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
              "flex-grow overflow-y-auto",
              effectivePageTheme === 'theme-7' ? 'border p-2 bg-white bg-opacity-20 dark:bg-gray-700 dark:bg-opacity-20' : 'sunken-panel tree-view p-1'
            )}
            style={{ height: `calc(100% - ${INPUT_AREA_HEIGHT}px)` }}
          >
            {(listHeight > 0 && chatListContainerWidth > 0) ? (
              <>
                <List
                  ref={listRef}
                  height={listHeight}
                  itemCount={messages.length}
                  itemSize={itemHeight}
                  width={chatListContainerWidth}
                  itemData={itemData}
                  className="scroll-area-viewport"
                >
                  {Row}
                </List>
              </>
            ) : (
               <div className="h-full overflow-y-auto p-1">
                 {messages.map((msg, index) => (
                    <Row key={msg.id} index={index} style={{width: '100%'}} data={{messages: messages, theme: effectivePageTheme, pickerEmojiFilenames: pickerEmojiFilenames }} />
                 ))}
               </div>
            )}
            {isPartnerTyping && (
              <div className={cn(
                "text-left text-xs italic px-1 py-0.5", 
                effectivePageTheme === 'theme-7' ? 'text-gray-100 theme-7-text-shadow' : 'text-gray-500 dark:text-gray-400'
              )}>
                Stranger is typing{typingDots}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
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
                disabled={mainButtonDisabled}
                className={cn(
                  'mr-1',
                  effectivePageTheme === 'theme-7' ? 'glass-button-styled' : 'px-1 py-1'
                )}
              >
                {findOrDisconnectText}
              </Button>
              <Input
                type="text"
                value={newMessage}
                onChange={handleInputChange}
                onKeyPress={(e) => e.key === 'Enter' && !inputAndSendDisabled && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 w-full px-1 py-1"
                disabled={inputAndSendDisabled}
              />
              {effectivePageTheme === 'theme-98' && !emojisLoading && (
                <div className="relative ml-1 flex-shrink-0">
                  <img
                    id="emoji-icon-trigger-video"
                    src={currentEmojiIconUrl}
                    alt="Emoji"
                    className="w-4 h-4 cursor-pointer inline-block"
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
                disabled={inputAndSendDisabled || !newMessage.trim()}
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
