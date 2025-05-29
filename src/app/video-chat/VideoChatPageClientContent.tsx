
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
  const regex = /:([a-zA-Z0-9_.-]+?):/g; // Updated regex to include dots and hyphens
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
      parts.push(match[0]); // If no match, keep the shortcode text
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text]; // Ensure at least the original text is returned
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
    (previousMessage.sender === 'me' || previousMessage.sender === 'partner') && // Check previous is user/partner
    (currentMessage.sender === 'me' || currentMessage.sender === 'partner') && // Check current is user/partner
    currentMessage.sender !== previousMessage.sender;

  const messageContent = theme === 'theme-98'
    ? renderMessageWithEmojis(currentMessage.text, pickerEmojiFilenames, EMOJI_BASE_URL_PICKER)
    : [currentMessage.text]; // For theme-7, render text as is


  return (
    <div style={style}>
      {showDivider && (
        <div
          className="h-[2px] mb-1 border border-[#CEDCE5] bg-[#64B2CF]"
          aria-hidden="true"
        ></div>
      )}
      <div className="mb-2 break-words"> {/* Increased bottom margin for spacing */}
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
  const messagesEndRef = useRef<HTMLDivElement>(null); // For scrolling non-virtualized list
  const chatListContainerRef = useRef<HTMLDivElement>(null);
  const { width: chatListContainerWidth, height: chatListContainerHeight } = useElementSize(chatListContainerRef);
  
  const prevIsFindingPartnerRef = useRef(isFindingPartner);
  const prevIsPartnerConnectedRef = useRef(isPartnerConnected);

  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [typingDots, setTypingDots] = useState('');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [currentEmojiIconUrl, setCurrentEmojiIconUrl] = useState(() => `${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pickerEmojiFilenames, setPickerEmojiFilenames] = useState<string[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(true);
  const hoverIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';

  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      const newMessageItem = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, // More unique ID
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
  }, [isPartnerConnected, isFindingPartner, addMessage, interests, partnerInterests, roomId, messages]);


  const cleanupConnections = useCallback((stopLocalStream = true) => {
    console.log("[WebRTC] cleanupConnections called. Stop local stream:", stopLocalStream);
    if (peerConnectionRef.current) {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
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
    if (localStreamRef.current) { // If stream already exists
        if (localVideoRef.current && !localVideoRef.current.srcObject) { // And video element needs it
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
        // Potentially stop finding partner if camera is essential and fails
        setIsFindingPartner(false); 
        setIsPartnerConnected(false); 
        return;
    }

    if (peerConnectionRef.current) {
        console.warn("VideoChatPage: PeerConnection already exists. Closing existing before creating new.");
        cleanupConnections(false); // Don't stop local stream if we're just re-initing PC
    }

    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => {
      // Avoid adding duplicate tracks if re-initing
      if (pc.getSenders().find(s => s.track === track)) {
        return; // Track already added
      }
      pc.addTrack(track, stream)
    });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("VideoChatPage: Sending ICE candidate");
            currentSocket.emit('webrtcSignal', { roomId: currentRoomId, signalData: { candidate: event.candidate } });
        }
    };

    pc.ontrack = (event) => {
        console.log("VideoChatPage: Received remote track");
        if (remoteVideoRef.current && event.streams && event.streams[0]) {
            // Check if srcObject is already set to this stream to avoid unnecessary re-assignments
            if(remoteVideoRef.current.srcObject !== event.streams[0]) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        } else {
            console.warn("VideoChatPage: Remote video ref not available or no streams on track event.")
        }
    };

    pc.oniceconnectionstatechange = () => {
      if(peerConnectionRef.current){
        console.log("VideoChatPage: ICE connection state change:", peerConnectionRef.current.iceConnectionState);
        if (peerConnectionRef.current.iceConnectionState === 'failed' || 
            peerConnectionRef.current.iceConnectionState === 'disconnected' ||
            peerConnectionRef.current.iceConnectionState === 'closed') {
             console.warn("VideoChatPage: WebRTC connection failed or disconnected. Consider cleanup.");
             // cleanupConnections(); // Consider if this is the right place
        }
      }
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
  }, [getCameraStream, toast, cleanupConnections]);


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
      transports: ['websocket', 'polling'] // Explicitly define transports
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
        console.log("VideoChatPage: Connected to socket server with ID:", newSocket.id);
    });

    newSocket.on('partnerFound', ({ partnerId: pId, roomId: rId, interests: pInterests }: { partnerId: string, roomId: string, interests: string[] }) => {
        console.log("VideoChatPage: Partner found event received", { pId, rId, pInterests });
        setRoomId(rId); // Set roomId first
        setIsFindingPartner(false);
        setIsPartnerConnected(true);
        setPartnerInterests(pInterests || []);
        setupWebRTC(newSocket, rId, true); // Caller is initiator
    });

    newSocket.on('waitingForPartner', () => {
        // System message handled by other useEffect
    });
    
    newSocket.on('findPartnerCooldown', () => {
      toast({ title: "Slow down!", description: "Please wait a moment before finding a new partner.", variant: "default" });
      setIsFindingPartner(false);
    });

    newSocket.on('receiveMessage', ({ senderId, message: receivedMessage }: { senderId: string, message: string }) => {
        addMessage(receivedMessage, 'partner');
    });

    newSocket.on('webrtcSignal', async (signalData: any) => {
        let pc = peerConnectionRef.current;
        // If PC not ready, and we have socket and room, try to set it up (non-initiator)
        if (!pc && isPartnerConnected && roomId && newSocket) { // Ensure newSocket and roomId are available
            console.log("VideoChatPage: Receiving signal before local PC setup, attempting setup now (non-initiator).");
            await setupWebRTC(newSocket, roomId, false); // Non-initiator
            pc = peerConnectionRef.current; // Re-assign pc after setup
        }
        if (!pc) { // If still no pc, something is wrong
            console.error("VideoChatPage: PeerConnection not initialized, cannot handle signal", signalData);
            return;
        }
        try {
            if (signalData.type === 'offer' && pc.signalingState !== 'stable') {
                console.log("VideoChatPage: Received offer, but signaling state is not stable. Potentially ignoring.", pc.signalingState);
                // More robust glare handling might be needed if this becomes an issue
                if (pc.signalingState === 'have-local-offer' && signalData.sdp !== pc.localDescription?.sdp) {
                    console.warn("VideoChatPage: Glare condition? Have local offer, received another offer.");
                    // Decide on a glare resolution strategy (e.g., one side backs off)
                    return; // For now, just log and return to avoid errors
                }
                 await pc.setRemoteDescription(new RTCSessionDescription(signalData));
                 const answer = await pc.createAnswer();
                 await pc.setLocalDescription(answer);
                 if (newSocket && roomId) { // Check newSocket and roomId again before emitting
                    newSocket.emit('webrtcSignal', { roomId, signalData: answer });
                    console.log("VideoChatPage: Sent answer");
                 } else {
                     console.error("VideoChatPage: Socket or RoomID missing, cannot send answer.");
                 }
            } else if (signalData.type === 'offer') { // Offer and stable state
                console.log("VideoChatPage: Received offer");
                await pc.setRemoteDescription(new RTCSessionDescription(signalData));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                 if (newSocket && roomId) { // Check newSocket and roomId again
                   newSocket.emit('webrtcSignal', { roomId, signalData: answer });
                   console.log("VideoChatPage: Sent answer");
                 } else {
                     console.error("VideoChatPage: Socket or RoomID missing, cannot send answer.");
                 }
            } else if (signalData.type === 'answer') {
                console.log("VideoChatPage: Received answer");
                if (pc.signalingState === 'have-local-offer' || pc.signalingState === 'stable') {
                    await pc.setRemoteDescription(new RTCSessionDescription(signalData));
                } else {
                    console.warn("VideoChatPage: Received answer but not in have-local-offer state.", pc.signalingState);
                }
            } else if (signalData.candidate) {
                console.log("VideoChatPage: Received ICE candidate");
                if (pc.remoteDescription) { // Ensure remote description is set before adding candidates
                    await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
                } else {
                    console.warn("VideoChatPage: Received ICE candidate but remote description not set. Caching or ignoring.")
                    // Optionally cache candidates and apply them after remote description is set
                }
            }
        } catch (error) {
            console.error("VideoChatPage: Error handling WebRTC signal:", error, signalData);
        }
    });

    newSocket.on('partnerLeft', () => {
        addMessage('Your partner has disconnected.', 'system');
        cleanupConnections(false); // Don't stop local stream, user might want to find new partner
        setIsPartnerConnected(false);
        setIsPartnerTyping(false); // Partner left, so not typing
        setRoomId(null);
        setPartnerInterests([]);
    });

    newSocket.on('partner_typing_start', () => setIsPartnerTyping(true));
    newSocket.on('partner_typing_stop', () => setIsPartnerTyping(false));

    newSocket.on('disconnect', (reason) => {
        console.log("VideoChatPage: Disconnected from socket server. Reason:", reason);
        cleanupConnections(true); // Stop local stream on full disconnect
        setIsPartnerConnected(false);
        setIsFindingPartner(false);
        setRoomId(null);
        setIsPartnerTyping(false);
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

    // Fetch emojis for the picker
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
        setPickerEmojiFilenames([]); // Ensure it's an empty array on error
      } finally {
        setEmojisLoading(false);
      }
    };
    fetchPickerEmojis();

    return () => {
      cleanupConnections(true);
      if (newSocket && newSocket.connected) {
        if (roomId) newSocket.emit('leaveChat', { roomId }); // Gracefully leave room if connected to one
        newSocket.disconnect();
      }
      if (hoverIntervalRef.current) {
        clearInterval(hoverIntervalRef.current);
      }
       if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMessage, toast, interests, setupWebRTC, cleanupConnections, getCameraStream]); // Removed roomId, isPartnerConnected from deps as they are managed by this effect.


  useEffect(() => {
    // Attempt to get camera stream as soon as the component is mounted if permission not yet determined.
    if (isMounted && hasCameraPermission === undefined) { 
        getCameraStream();
    }
  }, [isMounted, hasCameraPermission, getCameraStream]);

  const itemHeight = 30; // Approximate height for virtualized list items
  // Calculate height for the virtualized list dynamically
  const listHeight = chatListContainerHeight > (INPUT_AREA_HEIGHT + (isPartnerTyping ? TYPING_INDICATOR_HEIGHT : 0)) 
                     ? chatListContainerHeight - (INPUT_AREA_HEIGHT + (isPartnerTyping ? TYPING_INDICATOR_HEIGHT : 0)) 
                     : 0; // Default to 0 if not enough space


  const itemData = useMemo(() => ({ messages, theme: effectivePageTheme, pickerEmojiFilenames }), [messages, effectivePageTheme, pickerEmojiFilenames]);

  useEffect(() => {
    // Scroll to bottom for virtualized list
    if (listHeight > 0 && chatListContainerWidth > 0) { // Ensure list has dimensions
        if (listRef.current && messages.length > 0) {
            listRef.current.scrollToItem(messages.length - 1, "end");
        }
    } else if (messagesEndRef.current) { // Fallback for non-virtualized or when dimensions are 0
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, listHeight, chatListContainerWidth]); // Re-run if messages or list dimensions change


  // Typing indicator dots animation
  useEffect(() => {
    let dotInterval: NodeJS.Timeout | null = null;
    if (isPartnerTyping) {
      dotInterval = setInterval(() => {
        setTypingDots(dots => {
          if (dots.length >= 3) return '.';
          return dots + '.';
        });
      }, 500);
    } else {
      setTypingDots(''); // Clear dots when partner stops typing
    }
    return () => {
      if (dotInterval) clearInterval(dotInterval);
    };
  }, [isPartnerTyping]);

  const stopLocalTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (socket && roomId && isPartnerConnected) {
      socket.emit('typing_stop', { roomId });
    }
  }, [socket, roomId, isPartnerConnected]);

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim() || !socket || !roomId || !isPartnerConnected) return;
    socket.emit('sendMessage', { roomId, message: newMessage });
    addMessage(newMessage, 'me');
    setNewMessage('');
    stopLocalTyping(); // Stop local typing indicator after sending
  }, [newMessage, socket, roomId, addMessage, isPartnerConnected, stopLocalTyping]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
     if (!socket || !roomId || !isPartnerConnected) return;

    if (!typingTimeoutRef.current) { // Only emit typing_start if not already "typing"
      socket.emit('typing_start', { roomId });
    } else { // If already typing, just clear the old timeout
      clearTimeout(typingTimeoutRef.current);
    }

    // Set a new timeout to emit typing_stop
    typingTimeoutRef.current = setTimeout(() => {
      stopLocalTyping();
    }, 2000); // 2 seconds of inactivity
  }, [socket, roomId, isPartnerConnected, setNewMessage, stopLocalTyping]);

  const handleFindOrDisconnectPartner = useCallback(async () => {
    if (!socket) {
        toast({ title: "Not Connected", description: "Not connected to the chat server.", variant: "destructive" });
        return;
    }
    setIsPartnerTyping(false); // Reset partner typing indicator

    if (isPartnerConnected && roomId) { // Currently connected, so disconnect
        socket.emit('leaveChat', { roomId });
        cleanupConnections(false); // Don't stop local stream, user might want to find new partner
        addMessage('You have disconnected.', 'system');
        setIsPartnerConnected(false);
        setRoomId(null);
        setPartnerInterests([]);
        // Automatically start finding a new partner
        setIsFindingPartner(true);
        socket.emit('findPartner', { chatType: 'video', interests });

    } else if (isFindingPartner) { // Currently finding, so stop
        setIsFindingPartner(false);
    } else { // Not connected and not finding, so start finding
        // Ensure camera permission before finding partner
        if (hasCameraPermission === false) {
            toast({ title: "Camera Required", description: "Camera permission is required to find a video chat partner.", variant: "destructive"});
            return;
        }
        if (hasCameraPermission === undefined) { // If permission state is unknown, try to get it
            const stream = await getCameraStream(); // Attempt to get stream and permission
            if (!stream) { // If stream/permission still not granted, abort
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

  // Click outside emoji picker to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        const emojiIcon = document.getElementById('emoji-icon-trigger-video'); // Unique ID for video chat
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


  // Determine button text and disabled state
  let findOrDisconnectText: string;
  if (isPartnerConnected) {
    findOrDisconnectText = 'Disconnect';
  } else if (isFindingPartner) {
    findOrDisconnectText = 'Stop Searching';
  } else {
    findOrDisconnectText = 'Find Partner';
  }
  const mainButtonDisabled = !socket?.connected;
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
      {/* Video Feeds Container */}
      <div className="flex justify-center gap-4 mb-4 mx-auto">
        {/* Local Video */}
        <div
          className={cn(
            'window flex flex-col m-2', // Added m-2 for spacing
            effectivePageTheme === 'theme-7' ? 'glass' : ''
          )}
          style={{width: '325px', height: '198px'}}
        >
          <div className={cn(
              "title-bar text-sm video-feed-title-bar", 
              effectivePageTheme === 'theme-98' ? '' : 'theme-7-video-feed-title-bar', // Conditional class for theme-7
              effectivePageTheme === 'theme-7' ? 'text-black' : '' // Ensure text is visible for theme-7
            )}>
            {/* Text removed based on previous request, but structure kept for styling */}
            <div className="title-bar-text">
              {/* {effectivePageTheme === 'theme-7' && "Your Video"} */}
            </div>
          </div>
          <div
            className={cn(
              'window-body flex-grow overflow-hidden relative',
               effectivePageTheme === 'theme-7' && 'bg-white/30', // Translucent white for theme-7
               'p-0' // Ensure no padding for video
            )}
          >
            <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover bg-black" data-ai-hint="local camera" />
            { hasCameraPermission === false && (
              <Alert variant="destructive" className="m-1 absolute bottom-0 left-0 right-0 text-xs p-1">
                <AlertTitle className="text-xs">Camera Denied</AlertTitle>
              </Alert>
            )}
             { hasCameraPermission === undefined && ( // Show loading if permission state is unknown
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">Requesting camera...</p>
                </div>
              )}
          </div>
        </div>

        {/* Remote Video */}
        <div
          className={cn(
            'window flex flex-col m-2', // Added m-2 for spacing
            effectivePageTheme === 'theme-7' ? 'glass' : ''
          )}
          style={{width: '325px', height: '198px'}}
        >
          <div className={cn(
              "title-bar text-sm video-feed-title-bar", 
               effectivePageTheme === 'theme-98' ? '' : 'theme-7-video-feed-title-bar',  // Conditional class for theme-7
               effectivePageTheme === 'theme-7' ? 'text-black' : '' // Ensure text is visible for theme-7
            )}>
            <div className="title-bar-text">
               {/* {effectivePageTheme === 'theme-7' && "Partner's Video"} */}
            </div>
          </div>
          <div
            className={cn(
              'window-body flex-grow overflow-hidden relative',
              effectivePageTheme === 'theme-7' && 'bg-white/30', // Translucent white for theme-7
              'p-0' // Ensure no padding for video
              )}
          >
            <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera" />
            {isFindingPartner && !isPartnerConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                <p className="text-white text-center p-2 text-sm">Searching for partner...</p>
              </div>
            )}
            {!isFindingPartner && !isPartnerConnected && ( // When not searching and not connected
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                <p className="text-white text-center p-2 text-sm">Partner video unavailable</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Window Container */}
      <div
        className={cn(
          'window flex flex-col flex-1 relative m-2', // Added relative for goldfish, m-2 for spacing
          effectivePageTheme === 'theme-7' ? 'glass' : ''
        )}
        style={{ minHeight: '300px', width: '100%', maxWidth: '500px', height: '500px', margin: '0 auto' }} // Centered chat window
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
            'window-body window-body-content flex-grow', // window-body-content handles flex direction
            effectivePageTheme === 'theme-7' ? 'glass-body-padding' : 'p-0.5'
          )}
        >
          {/* Message List Area */}
          <div
            className={cn(
              "flex-grow overflow-y-auto", // flex-grow allows this area to expand
              effectivePageTheme === 'theme-7' ? 'border p-2 bg-white bg-opacity-20 dark:bg-gray-700 dark:bg-opacity-20' : 'sunken-panel tree-view p-1'
            )}
             style={{ height: `calc(100% - ${INPUT_AREA_HEIGHT}px - ${isPartnerTyping ? TYPING_INDICATOR_HEIGHT : 0}px)` }}
          >
            {/* Conditional rendering for virtualized list vs. simple list */}
            {(listHeight > 0 && chatListContainerWidth > 0) ? (
              <List
                ref={listRef}
                height={listHeight}
                itemCount={messages.length}
                itemSize={itemHeight} // Use defined itemHeight
                width={chatListContainerWidth} // Use measured width
                itemData={itemData}
                className="scroll-area-viewport" // Added for consistency
              >
                {Row}
              </List>
            ) : (
               // Fallback to simple list if dimensions aren't ready for react-window
               <div className="h-full overflow-y-auto p-1"> {/* Ensure scrolling */}
                 {messages.map((msg, index) => (
                    // Pass necessary props to Row, no style needed here
                    <div key={msg.id}> {/* Added key to the wrapping div */}
                     <Row index={index} style={{width: '100%'}} data={{messages: messages, theme: effectivePageTheme, pickerEmojiFilenames: pickerEmojiFilenames }} />
                    </div>
                 ))}
                 <div ref={messagesEndRef} />
               </div>
            )}
          </div>
          {/* Typing Indicator Area */}
          {isPartnerTyping && (
            <div 
              className={cn(
                "text-xs italic px-2 flex-shrink-0",
                effectivePageTheme === 'theme-7' ? 'text-gray-200 theme-7-text-shadow' : 'text-gray-500 dark:text-gray-400'
              )} 
              style={{ height: `${TYPING_INDICATOR_HEIGHT}px` }}
            >
              Stranger is typing{typingDots}
            </div>
          )}
           {/* Input Area */}
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
                disabled={mainButtonDisabled || (findOrDisconnectText === 'Find Partner' && hasCameraPermission === undefined)}
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
              {/* Emoji Icon & Picker - Windows 98 Theme Only */}
              {effectivePageTheme === 'theme-98' && !emojisLoading && (
                <div className="relative ml-1 flex-shrink-0"> {/* Added flex-shrink-0 */}
                  <img
                    id="emoji-icon-trigger-video" // Unique ID for video chat
                    src={currentEmojiIconUrl}
                    alt="Emoji"
                    className="w-5 h-5 cursor-pointer inline-block" // Added inline-block
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
                              className="max-w-6 max-h-6 object-contain cursor-pointer hover:bg-navy hover:p-0.5" // Max width/height, object-contain
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
                 <div className="relative ml-1 flex-shrink-0"> {/* Added flex-shrink-0 */}
                    <p className="text-xs p-1">...</p> {/* Placeholder for loading */}
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

    