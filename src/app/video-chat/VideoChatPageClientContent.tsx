
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { listEmojis } from '@/ai/flows/list-emojis-flow';
import { ConditionalGoldfishImage } from '@/components/ConditionalGoldfishImage';

const EMOJI_BASE_URL_DISPLAY = "https://storage.googleapis.com/chat_emoticons/display_98/";
const STATIC_DISPLAY_EMOJI_FILENAMES = [
  'angel.png', 'bigsmile.png', 'burp.png', 'cool.png', 'crossedlips.png',
  'cry.png', 'embarrassed.png', 'kiss.png', 'moneymouth.png', 'sad.png',
  'scream.png', 'smile.png', 'think.png', 'tongue.png', 'wink.png', 'yell.png'
];
const SMILE_EMOJI_FILENAME = 'smile.png';
const EMOJI_BASE_URL_PICKER = "https://storage.googleapis.com/chat_emoticons/emotes_98/";

const INPUT_AREA_HEIGHT = 60;
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

interface RowProps {
  message: Message;
  theme: string;
  previousMessageSender?: Message['sender'];
  pickerEmojiFilenames: string[];
}

const Row = React.memo(({ message, theme, previousMessageSender, pickerEmojiFilenames }: RowProps) => {
  if (message.sender === 'system') {
    return (
      <div className="mb-2">
        <div className={cn(
          "text-center w-full text-xs italic",
           theme === 'theme-7' ? 'theme-7-text-shadow text-gray-100' : 'text-gray-500 dark:text-gray-400'
        )}>
          {message.text}
        </div>
      </div>
    );
  }

  const showDivider =
    theme === 'theme-7' &&
    previousMessageSender !== undefined &&
    (previousMessageSender === 'me' || previousMessageSender === 'partner') &&
    (message.sender === 'me' || message.sender === 'partner') &&
    message.sender !== previousMessageSender;

  const messageContent = theme === 'theme-98'
    ? renderMessageWithEmojis(message.text, pickerEmojiFilenames, EMOJI_BASE_URL_PICKER)
    : [message.text];


  return (
    <>
      {showDivider && (
        <div
          className="h-[2px] mb-1 border border-[#CEDCE5] bg-[#64B2CF]"
          aria-hidden="true"
        ></div>
      )}
      <div className="mb-1 break-words">
        {message.sender === 'me' && (
          <>
            <span className="text-blue-600 font-bold mr-1">You:</span>
            <span className={cn(theme === 'theme-7' && 'theme-7-text-shadow')}>{messageContent}</span>
          </>
        )}
        {message.sender === 'partner' && (
          <>
            <span className="text-red-600 font-bold mr-1">Stranger:</span>
            <span className={cn(theme === 'theme-7' && 'theme-7-text-shadow')}>{messageContent}</span>
          </>
        )}
      </div>
    </>
  );
});
Row.displayName = 'Row';


const VideoChatPageClientContent: React.FC = () => {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const prevIsFindingPartnerRef = useRef(isFindingPartner);
  const prevIsPartnerConnectedRef = useRef(isPartnerConnected);
  const prevIsSelfDisconnectedRecentlyRef = useRef(false);


  const [currentEmojiIconUrl, setCurrentEmojiIconUrl] = useState(() => `${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pickerEmojiFilenames, setPickerEmojiFilenames] = useState<string[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(true);
  const hoverIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const [socketError, setSocketError] = useState(false);
  const [isSelfDisconnectedRecently, setIsSelfDisconnectedRecently] = useState(false);
  const [isPartnerLeftRecently, setIsPartnerLeftRecently] = useState(false);

  const successTransitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const successTransitionEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skippedFaviconTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [typingDots, setTypingDots] = useState('.');
  const localTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalTypingRef = useRef(false);

  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';

  const changeFavicon = useCallback((newFaviconHref: string, removeOld: boolean = false) => {
    if (typeof window === 'undefined') return;
    let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    if (removeOld && link) {
      link.remove();
      link = null;
    }

    if (!link) {
      link = document.createElement('link') as HTMLLinkElement;
      link.type = 'image/x-icon';
      link.rel = 'shortcut icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = newFaviconHref;
  }, []);


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

  // Effect for managing favicons and system messages based on chat state
 useEffect(() => {
    if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
    if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
    if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current);

    let currentMessages = [...messages];
    const filterSystemMessages = (textPattern: string) => {
      currentMessages = currentMessages.filter(msg => !(msg.sender === 'system' && msg.text.toLowerCase().includes(textPattern)));
    };

    if (socketError) {
      changeFavicon('/Skipped.ico');
    } else if (isSelfDisconnectedRecently) {
      changeFavicon('/Skipped.ico');
      skippedFaviconTimeoutRef.current = setTimeout(() => {
        setIsSelfDisconnectedRecently(false);
      }, 1000);
    } else if (isPartnerLeftRecently) {
      changeFavicon('/Skipped.ico');
       if (prevIsPartnerLeftRecentlyRef.current === false) {
        filterSystemMessages('you have disconnected');
        filterSystemMessages('searching for a partner');
        filterSystemMessages('stopped searching for a partner');
        currentMessages.push({ id: `${Date.now()}-partnerleft`, text: 'Your partner has disconnected.', sender: 'system', timestamp: new Date() });
      }
      skippedFaviconTimeoutRef.current = setTimeout(() => {
        setIsPartnerLeftRecently(false);
      }, 1000);
    } else if (isFindingPartner) {
      changeFavicon('/Searching.ico');
      const justStartedFinding = prevIsFindingPartnerRef.current === false && !isPartnerConnected;
      const justFinishedSelfDisconnectAndIsSearching = prevIsSelfDisconnectedRecentlyRef.current === true && !isSelfDisconnectedRecently && !isPartnerConnected;

      if (justStartedFinding || justFinishedSelfDisconnectAndIsSearching) {
        filterSystemMessages('your partner has disconnected');
        if (justStartedFinding) { 
            filterSystemMessages('you have disconnected');
        }
        filterSystemMessages('stopped searching for a partner');
        currentMessages.push({ id: `${Date.now()}-search`, text: 'Searching for a partner...', sender: 'system', timestamp: new Date() });
      }
    } else if (isPartnerConnected) {
      if (prevIsPartnerConnectedRef.current === false) {
        let successCount = 0;
        changeFavicon('/Success.ico');
        successTransitionIntervalRef.current = setInterval(() => {
          changeFavicon(successCount % 2 === 0 ? '/Idle.ico' : '/Success.ico');
          successCount++;
        }, 750);
        successTransitionEndTimeoutRef.current = setTimeout(() => {
          if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
          if (isPartnerConnected) changeFavicon('/Success.ico');
        }, 3000);

        filterSystemMessages('searching for a partner');
        filterSystemMessages('your partner has disconnected');
        filterSystemMessages('you have disconnected');
        filterSystemMessages('stopped searching for a partner');

        currentMessages.push({ id: `${Date.now()}-connect`, text: 'Connected with a partner. You can start chatting!', sender: 'system', timestamp: new Date() });
        if (interests.length > 0 && partnerInterests.length > 0) {
          const common = interests.filter(interest => partnerInterests.includes(interest));
          if (common.length > 0) {
            currentMessages.push({ id: `${Date.now()}-common`, text: `You both like ${common.join(', ')}.`, sender: 'system', timestamp: new Date() });
          }
        }
      } else {
        if(!successTransitionIntervalRef.current && !successTransitionEndTimeoutRef.current){
           changeFavicon('/Success.ico');
        }
     }
    } else {
      changeFavicon('/Idle.ico');
      if (prevIsFindingPartnerRef.current === true && !isPartnerConnected && !roomIdRef.current) {
         const isSearchingMessagePresent = currentMessages.some(msg => msg.sender === 'system' && msg.text.toLowerCase().includes('searching for a partner'));
        if (isSearchingMessagePresent) {
             filterSystemMessages('searching for a partner');
             currentMessages.push({ id: `${Date.now()}-stopsearch`, text: 'Stopped searching for a partner.', sender: 'system', timestamp: new Date() });
        }
      }
    }

    if (currentMessages.length !== messages.length || !currentMessages.every((val, index) => val.id === messages[index]?.id && val.text === messages[index]?.text)) {
        setMessages(currentMessages);
    }

    prevIsFindingPartnerRef.current = isFindingPartner;
    prevIsPartnerConnectedRef.current = isPartnerConnected;
    prevIsSelfDisconnectedRecentlyRef.current = isSelfDisconnectedRecently;

  }, [isPartnerConnected, isFindingPartner, socketError, isSelfDisconnectedRecently, isPartnerLeftRecently, addMessage, interests, partnerInterests, changeFavicon, messages, roomIdRef]);


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
        // setHasCameraPermission(undefined); // Keep permission state, user might want to reconnect
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

  const setupWebRTC = useCallback(async (currentActiveSocket: Socket, currentRId: string, initiator: boolean) => {
    if (!currentActiveSocket || !currentRId) {
        console.error(`${logPrefix}: setupWebRTC called with invalid socket or roomId.`);
        return;
    }
    console.log(`${logPrefix}: Setting up WebRTC. Initiator:`, initiator);

    const stream = await getCameraStream();
    if (!stream) {
        toast({ title: "Camera Error", description: "Cannot setup video chat without camera.", variant: "destructive"});
        setIsFindingPartner(false);
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
        if (event.candidate && currentActiveSocket.connected) {
            console.log(`${logPrefix}: Sending ICE candidate`);
            currentActiveSocket.emit('webrtcSignal', { roomId: currentRId, signalData: { candidate: event.candidate } });
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
            if (currentActiveSocket.connected) {
                console.log(`${logPrefix}: Sending offer`);
                currentActiveSocket.emit('webrtcSignal', { roomId: currentRId, signalData: offer });
            }
        } catch (error) {
            console.error(`${logPrefix}: Error creating offer:`, error);
        }
    }
  }, [getCameraStream, toast, cleanupConnections]);

  const handleFindOrDisconnectPartner = useCallback(async () => {
    const currentSocket = socketRef.current;
    if (!currentSocket) {
        toast({ title: "Not Connected", description: "Chat server connection not yet established.", variant: "destructive" });
        return;
    }

    if (isPartnerConnected && roomIdRef.current) {
        addMessage('You have disconnected.', 'system');
        currentSocket.emit('leaveChat', { roomId: roomIdRef.current });
        setIsSelfDisconnectedRecently(true);
        cleanupConnections(false);
        setIsPartnerConnected(false);
        setIsPartnerTyping(false);
        setRoomId(null);
        roomIdRef.current = null;
        setPartnerInterests([]);
        setIsFindingPartner(true);
        currentSocket.emit('findPartner', { chatType: 'video', interests });
        autoSearchDoneRef.current = true;

    } else if (isFindingPartner) {
        setIsFindingPartner(false);
    } else {
        if (!currentSocket.connected) {
          toast({ title: "Connecting...", description: "Attempting to connect to chat server. Please wait.", variant: "default" });
          return;
        }
        const stream = await getCameraStream();
        if (!stream) {
            setIsFindingPartner(false);
            return;
        }
        setIsFindingPartner(true);
        currentSocket.emit('findPartner', { chatType: 'video', interests });
        autoSearchDoneRef.current = true;
    }
  }, [
      addMessage, isPartnerConnected, isFindingPartner, interests,
      cleanupConnections, getCameraStream, toast
    ]);

  // Effect for Socket.IO connection and event listeners
  useEffect(() => {
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) {
      console.error(`${logPrefix}: Socket server URL is not defined.`);
      toast({ title: "Configuration Error", description: "Socket server URL is missing.", variant: "destructive" });
      setSocketError(true);
      return;
    }

    console.log(`${logPrefix}: Attempting to connect to socket server: ${socketServerUrl}`);
    const newSocket = io(socketServerUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    socketRef.current = newSocket;

    const handleInitialConnectAndSearch = () => {
        console.log(`${logPrefix}: Socket connected (ID: ${newSocket.id}). Auto-search status: ${autoSearchDoneRef.current}`);
        setSocketError(false);
        if (!autoSearchDoneRef.current && !isPartnerConnected && !isFindingPartner && !roomIdRef.current) {
            console.log(`${logPrefix}: Automatically starting partner search on initial connect (video).`);
            handleFindOrDisconnectPartner();
        }
    };

    if (newSocket.connected) {
      handleInitialConnectAndSearch();
    } else {
      newSocket.on('connect', handleInitialConnectAndSearch);
    }

    const onPartnerFound = ({ partnerId: pId, roomId: rId, interests: pInterests }: { partnerId: string, roomId: string, interests: string[] }) => {
      console.log(`${logPrefix}: Partner found event received`, { pId, rId, pInterests });
      setRoomId(rId);
      roomIdRef.current = rId;
      setPartnerInterests(pInterests || []);
      setIsFindingPartner(false);
      setIsPartnerConnected(true);
      setIsSelfDisconnectedRecently(false);
      setIsPartnerLeftRecently(false);
      if (socketRef.current && roomIdRef.current) {
        setupWebRTC(socketRef.current, roomIdRef.current, true);
      }
    };
    newSocket.on('partnerFound', onPartnerFound);

    newSocket.on('waitingForPartner', () => {
        console.log(`${logPrefix}: Server acknowledged 'waitingForPartner' for ${newSocket.id}`);
     });

    const onFindPartnerCooldown = () => {
      toast({ title: "Slow down!", description: "Please wait a moment before finding a new partner.", variant: "default" });
      setIsFindingPartner(false);
    };
    newSocket.on('findPartnerCooldown', onFindPartnerCooldown);

    const onReceiveMessage = ({ senderId, message: receivedMessage }: { senderId: string, message: string }) => {
      addMessage(receivedMessage, 'partner');
      setIsPartnerTyping(false);
    };
    newSocket.on('receiveMessage', onReceiveMessage);

    const onWebRTCSignal = async (signalData: any) => {
      let pc = peerConnectionRef.current;
      const currentRId = roomIdRef.current;

      if (!socketRef.current || !currentRId) {
        console.error(`${logPrefix}: Socket or RoomID missing, cannot handle WebRTC signal.`);
        return;
      }

      if (!pc && isPartnerConnected && isMounted) {
        console.log(`${logPrefix}: Receiving signal before local PC setup, attempting setup now (non-initiator).`);
        await setupWebRTC(socketRef.current, currentRId, false);
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
             if (socketRef.current.connected) socketRef.current.emit('webrtcSignal', { roomId: currentRId, signalData: answer });
             console.log(`${logPrefix}: Sent answer`);
        } else if (signalData.type === 'offer') {
          console.log(`${logPrefix}: Received offer`);
          await pc.setRemoteDescription(new RTCSessionDescription(signalData));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (socketRef.current.connected) socketRef.current.emit('webrtcSignal', { roomId: currentRId, signalData: answer });
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
    };
    newSocket.on('webrtcSignal', onWebRTCSignal);

    const onPartnerLeft = () => {
      setIsPartnerLeftRecently(true);
      cleanupConnections(false);
      setIsPartnerConnected(false);
      setIsPartnerTyping(false);
      setRoomId(null);
      roomIdRef.current = null;
      setPartnerInterests([]);
    };
    newSocket.on('partnerLeft', onPartnerLeft);

    const onDisconnect = (reason: string) => {
      console.log(`${logPrefix}: Disconnected from socket server. Reason:`, reason);
      if (!isSelfDisconnectedRecently && !isPartnerLeftRecently) {
        // addMessage('You have been disconnected from the server.', 'system'); // Handled by main effect
      }
      setSocketError(true);
      cleanupConnections(true);
      setIsPartnerConnected(false);
      setIsFindingPartner(false);
      setIsPartnerTyping(false);
      setRoomId(null);
      roomIdRef.current = null;
    };
    newSocket.on('disconnect', onDisconnect);

    const onConnectError = (err: Error) => {
      console.error(`${logPrefix}: Socket connection error:`, err.message);
      setSocketError(true);
      toast({
        title: "Connection Error",
        description: `Could not connect to chat server: ${err.message}. Please try again later.`,
        variant: "destructive"
      });
      setIsFindingPartner(false);
      setIsPartnerTyping(false);
    };
    newSocket.on('connect_error', onConnectError);

    newSocket.on('partner_typing_start', () => setIsPartnerTyping(true));
    newSocket.on('partner_typing_stop', () => setIsPartnerTyping(false));

     return () => {
        console.log(`${logPrefix}: Cleaning up VideoChatPageClientContent. Disconnecting socket ID:`, newSocket.id);
        if (roomIdRef.current) {
          newSocket.emit('leaveChat', { roomId: roomIdRef.current });
        }
        newSocket.off('connect', handleInitialConnectAndSearch);
        newSocket.off('partnerFound', onPartnerFound);
        newSocket.off('waitingForPartner');
        newSocket.off('findPartnerCooldown', onFindPartnerCooldown);
        newSocket.off('receiveMessage', onReceiveMessage);
        newSocket.off('webrtcSignal', onWebRTCSignal);
        newSocket.off('partnerLeft', onPartnerLeft);
        newSocket.off('disconnect', onDisconnect);
        newSocket.off('connect_error', onConnectError);
        newSocket.off('partner_typing_start');
        newSocket.off('partner_typing_stop');
        newSocket.disconnect();
        socketRef.current = null;
        cleanupConnections(true);
        changeFavicon('/favicon.ico', true);
        if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
        if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
        if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current);
        if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
        if (localTypingTimeoutRef.current) clearTimeout(localTypingTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMessage, toast, interests, handleFindOrDisconnectPartner, changeFavicon, setupWebRTC, cleanupConnections, getCameraStream, isMounted]);


  // Effect for initial page load favicon and mount status
  useEffect(() => {
    setIsMounted(true);
    changeFavicon('/Idle.ico');
    if (isMounted && hasCameraPermission === undefined) {
        getCameraStream();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, hasCameraPermission, getCameraStream]); // Added getCameraStream

  useEffect(() => {
    if (effectivePageTheme === 'theme-98') {
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
        setEmojisLoading(false);
        setPickerEmojiFilenames([]);
      }
  },[effectivePageTheme, toast]);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPartnerTyping]);


  const stopLocalTyping = useCallback(() => {
    if (localTypingTimeoutRef.current) {
      clearTimeout(localTypingTimeoutRef.current);
      localTypingTimeoutRef.current = null;
    }
    if (isLocalTypingRef.current && socketRef.current && roomIdRef.current) {
      socketRef.current.emit('typing_stop', { roomId: roomIdRef.current });
      isLocalTypingRef.current = false;
    }
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    const currentSocket = socketRef.current;
    const currentRoomId = roomIdRef.current;

    if (currentSocket && currentRoomId && isPartnerConnected) {
      if (!isLocalTypingRef.current) {
        currentSocket.emit('typing_start', { roomId: currentRoomId });
        isLocalTypingRef.current = true;
      }
      if (localTypingTimeoutRef.current) {
        clearTimeout(localTypingTimeoutRef.current);
      }
      localTypingTimeoutRef.current = setTimeout(() => {
         if (socketRef.current && roomIdRef.current) {
            socketRef.current.emit('typing_stop', { roomId: roomIdRef.current });
            isLocalTypingRef.current = false;
         }
      }, 2000);
    }
  }, [isPartnerConnected, setNewMessage, stopLocalTyping]);

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim() || !socketRef.current || !roomIdRef.current || !isPartnerConnected) return;
    socketRef.current.emit('sendMessage', { roomId: roomIdRef.current, message: newMessage });
    addMessage(newMessage, 'me');
    setNewMessage('');
    stopLocalTyping();
  }, [newMessage, isPartnerConnected, addMessage, stopLocalTyping, setNewMessage]);

  const handleEmojiIconHover = useCallback(() => {
    if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
    if (STATIC_DISPLAY_EMOJI_FILENAMES.length === 0) return;

    hoverIntervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * STATIC_DISPLAY_EMOJI_FILENAMES.length);
      setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${STATIC_DISPLAY_EMOJI_FILENAMES[randomIndex]}`);
    }, 300);
  },[]);

  const stopEmojiCycle = useCallback(() => {
    if (hoverIntervalRef.current) {
      clearInterval(hoverIntervalRef.current);
      hoverIntervalRef.current = null;
    }
    setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  },[]);

  const toggleEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(prev => !prev);
  },[]);

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
          if (prevDots === '..') return '...';
          if (prevDots === '.') return '..';
          return '.';
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
  const mainButtonDisabled = !socketRef.current?.connected || (findOrDisconnectText === 'Find Partner' && hasCameraPermission === undefined && isMounted);
  const inputAndSendDisabled = !socketRef.current?.connected || !isPartnerConnected || isFindingPartner;


  if (!isMounted) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p>Loading video chat interface...</p>
      </div>
    );
  }

  const messagesContainerHeight = `calc(100% - ${INPUT_AREA_HEIGHT}px)`;


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
              "title-bar text-sm video-feed-title-bar", // Always apply video-feed-title-bar
              effectivePageTheme === 'theme-7' ? 'theme-7 text-black' : 'theme-98'
            )}>
            <div className="title-bar-text">
              {/* Text removed */}
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
               "title-bar text-sm video-feed-title-bar", // Always apply video-feed-title-bar
               effectivePageTheme === 'theme-7' ? 'theme-7 text-black' : 'theme-98'
            )}>
            <div className="title-bar-text">
               {/* Text removed */}
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
         {effectivePageTheme === 'theme-7' && <ConditionalGoldfishImage /> }
        <div className={cn("title-bar", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
          <div className="title-bar-text">Chat</div>
        </div>
        <div
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
            style={{ height: messagesContainerHeight }}
          >
             <div> {/* Container for messages and typing indicator */}
                {messages.map((msg, index) => (
                  <Row key={msg.id} message={msg} theme={effectivePageTheme} previousMessageSender={index > 0 ? messages[index-1]?.sender : undefined} pickerEmojiFilenames={pickerEmojiFilenames} />
                ))}
                {isPartnerTyping && (
                  <div className={cn(
                    "text-xs italic text-left pl-1 py-0.5",
                    effectivePageTheme === 'theme-7' ? 'theme-7-text-shadow text-gray-100' : 'text-gray-500 dark:text-gray-400'
                  )}>
                    Stranger is typing{typingDots}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
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

