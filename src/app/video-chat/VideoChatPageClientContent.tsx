
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn, playSound } from '@/lib/utils';
import HomeButton from '@/components/HomeButton';
import { io, type Socket } from 'socket.io-client';
import { supabase } from '@/lib/supabase'; 

const EMOJI_BASE_URL_DISPLAY = "https://storage.googleapis.com/chat_emoticons/display_98/";
const STATIC_DISPLAY_EMOJI_FILENAMES = [
  'angel.png', 'bigsmile.png', 'burp.png', 'cool.png', 'crossedlips.png',
  'cry.png', 'embarrassed.png', 'kiss.png', 'moneymouth.png', 'sad.png',
  'scream.png', 'smile.png', 'think.png', 'tongue.png', 'wink.png', 'yell.png'
];
const SMILE_EMOJI_FILENAME = 'smile.png';
const EMOJI_BASE_URL_PICKER = "/emotes/";

const INPUT_AREA_HEIGHT = 60;
const LOG_PREFIX = "VideoChatPageClientContent"; // Corrected logPrefix

// Favicon Constants
const FAVICON_IDLE = '/Idle.ico';
const FAVICON_SEARCHING = '/Searching.ico';
const FAVICON_SUCCESS = '/Success.ico';
const FAVICON_SKIPPED = '/Skipped.ico';
const FAVICON_DEFAULT = '/favicon.ico';

// System Message Text Constants
const SYS_MSG_SEARCHING_PARTNER = 'Searching for a partner...';
const SYS_MSG_STOPPED_SEARCHING = 'Stopped searching for a partner.';
const SYS_MSG_CONNECTED_PARTNER = 'Connected with a partner. You can start chatting!';
const SYS_MSG_YOU_DISCONNECTED = 'You have disconnected.';
const SYS_MSG_PARTNER_DISCONNECTED = 'Your partner has disconnected.';
const SYS_MSG_COMMON_INTERESTS_PREFIX = 'You both like ';


interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: Date;
  senderUsername?: string;
}

interface EmoteData {
  filename: string;
  width?: number;
  height?: number;
}

const renderMessageWithEmojis = (text: string, emojiFilenames: string[], baseUrl: string): (string | JSX.Element)[] => {
  if (!emojiFilenames || emojiFilenames.length === 0) {
    return [text];
  }

  const parts: (string | JSX.Element)[] = [];
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
          className="inline max-h-5 w-auto mx-0.5 align-middle"
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
  ownUsername: string | null;
}

const Row = React.memo(({ message, theme, previousMessageSender, pickerEmojiFilenames, ownUsername }: RowProps) => {
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

  const getDisplayName = (sender: 'me' | 'partner') => {
    if (sender === 'me') {
      return ownUsername || "You";
    }
    return message.senderUsername || "Stranger";
  };

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
            <span className="text-blue-600 font-bold mr-1">{getDisplayName('me')}:</span>
            <span className={cn(theme === 'theme-7' && 'theme-7-text-shadow')}>{messageContent}</span>
          </>
        )}
        {message.sender === 'partner' && (
          <>
            <span className="text-red-600 font-bold mr-1">{getDisplayName('partner')}:</span>
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
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const autoSearchDoneRef = useRef(false);
  const isProcessingFindOrDisconnect = useRef(false);

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
  const [isSelfDisconnectedRecently, setIsSelfDisconnectedRecently] = useState(false);
  const [isPartnerLeftRecently, setIsPartnerLeftRecently] = useState(false);
  const prevIsSelfDisconnectedRecentlyRef = useRef(isSelfDisconnectedRecently);
  const prevIsPartnerLeftRecentlyRef = useRef(isPartnerLeftRecently);

  const [currentEmojiIconUrl, setCurrentEmojiIconUrl] = useState(() => `${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pickerEmojiFilenames, setPickerEmojiFilenames] = useState<string[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(true);
  const hoverIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const [socketError, setSocketError] = useState(false);

  const successTransitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const successTransitionEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skippedFaviconTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [typingDots, setTypingDots] = useState('.');
  const localTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalTypingRef = useRef(false);

  const [ownProfileUsername, setOwnProfileUsername] = useState<string | null>(null);

  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';

  const changeFavicon = useCallback((newFaviconHref: string, removeOld: boolean = false) => {
    if (typeof window === 'undefined' || !document.head) return;
    let link: HTMLLinkElement | null = document.head.querySelector("link[rel*='icon']");
    if (removeOld && link) {
      if (link.parentNode) link.parentNode.removeChild(link);
      link = null;
    }

    if (!link) {
      link = document.createElement('link') as HTMLLinkElement;
      link.type = 'image/x-icon';
      link.rel = 'shortcut icon';
      document.head.appendChild(link);
    }
    link.href = newFaviconHref;
  }, []);

  const addMessage = useCallback((text: string, sender: Message['sender'], senderUsername?: string, idSuffix?: string) => {
    setMessages((prevMessages) => {
      const newMessageItem: Message = {
        id: `${Date.now()}-${idSuffix || Math.random().toString(36).substring(2, 7)}`,
        text,
        sender,
        timestamp: new Date(),
        senderUsername: sender === 'partner' ? senderUsername : undefined,
      };
      return [...prevMessages, newMessageItem];
    });
  }, []);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    if (!isMounted) return;

    const fetchOwnProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile, error } = await supabase
          .from('users')
          .select('username')
          .eq('id', user.id)
          .single();
        if (error && error.code !== 'PGRST116') {
          console.error(`${LOG_PREFIX}: Error fetching own profile:`, error);
        } else if (profile) {
          setOwnProfileUsername(profile.username);
        }
      }
    };
    fetchOwnProfile();
  }, [isMounted]);

 useEffect(() => {
    if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
    if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
    if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current);

    let updatedMessages = [...messages];

    const filterSystemMessagesFrom = (msgs: Message[], textPattern: string): Message[] => {
        return msgs.filter(msg => !(msg.sender === 'system' && msg.text.toLowerCase().includes(textPattern.toLowerCase())));
    };

    const addSystemMessageIfNotPresentIn = (msgs: Message[], text: string, idSuffix: string): Message[] => {
        const lowerCaseText = text.toLowerCase();
        if (!msgs.some(msg => msg.sender === 'system' && msg.text.toLowerCase().includes(lowerCaseText))) {
            const newMessageItem: Message = { id: `${Date.now()}-${idSuffix}`, text, sender: 'system', timestamp: new Date() };
            return [...msgs, newMessageItem];
        }
        return msgs;
    };

    if (socketError) {
      changeFavicon(FAVICON_SKIPPED);
    } else if (isSelfDisconnectedRecently) {
      changeFavicon(FAVICON_SKIPPED);
      skippedFaviconTimeoutRef.current = setTimeout(() => {
          setIsSelfDisconnectedRecently(false);
          if (isFindingPartner) changeFavicon(FAVICON_SEARCHING);
      }, 500);
    } else if (isPartnerLeftRecently) {
      changeFavicon(FAVICON_SKIPPED);
      skippedFaviconTimeoutRef.current = setTimeout(() => {
          setIsPartnerLeftRecently(false);
          if (!isFindingPartner && !isPartnerConnected) changeFavicon(FAVICON_IDLE);
      }, 1000);
      updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_SEARCHING_PARTNER.toLowerCase());
      updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_YOU_DISCONNECTED.toLowerCase());
      updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_PARTNER_DISCONNECTED, 'partner-left');
    } else if (isFindingPartner) {
      changeFavicon(FAVICON_SEARCHING);
      const justStartedFindingAfterSkip = prevIsSelfDisconnectedRecentlyRef.current && !prevIsFindingPartnerRef.current;
      const initialSearch = !prevIsFindingPartnerRef.current && !isPartnerConnected && !prevIsSelfDisconnectedRecentlyRef.current;

      if (initialSearch || justStartedFindingAfterSkip) {
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_PARTNER_DISCONNECTED.toLowerCase());
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_STOPPED_SEARCHING.toLowerCase());
        updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_SEARCHING_PARTNER, 'search');
      }
    } else if (isPartnerConnected) {
      if (!prevIsPartnerConnectedRef.current) {
        let successCount = 0;
        changeFavicon(FAVICON_SUCCESS);
        successTransitionIntervalRef.current = setInterval(() => {
          changeFavicon(successCount % 2 === 0 ? FAVICON_IDLE : FAVICON_SUCCESS);
          successCount++;
        }, 750);
        successTransitionEndTimeoutRef.current = setTimeout(() => {
          if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
          if (isPartnerConnected) changeFavicon(FAVICON_SUCCESS);
        }, 3000);

        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_SEARCHING_PARTNER.toLowerCase());
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_PARTNER_DISCONNECTED.toLowerCase());
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_STOPPED_SEARCHING.toLowerCase());
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_YOU_DISCONNECTED.toLowerCase());
        updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_CONNECTED_PARTNER, 'connect');

        if (interests.length > 0 && partnerInterests.length > 0) {
          const common = interests.filter(interest => partnerInterests.includes(interest));
          if (common.length > 0) {
            updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, `${SYS_MSG_COMMON_INTERESTS_PREFIX}${common.join(', ')}.`, 'common');
          }
        }
      } else {
         if(!successTransitionIntervalRef.current && !successTransitionEndTimeoutRef.current){
           changeFavicon(FAVICON_SUCCESS);
         }
     }
    } else {
      changeFavicon(FAVICON_IDLE);
      if (prevIsFindingPartnerRef.current && !isPartnerConnected && !roomIdRef.current && !socketError && !isPartnerLeftRecently && !isSelfDisconnectedRecently) {
         const isSearchingMsgPresent = updatedMessages.some(msg => msg.sender === 'system' && msg.text.toLowerCase().includes(SYS_MSG_SEARCHING_PARTNER.toLowerCase()));
         if (isSearchingMsgPresent) {
             updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_SEARCHING_PARTNER.toLowerCase());
             updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_STOPPED_SEARCHING, 'stopsearch');
         }
      }
    }

    const messagesHaveChanged = updatedMessages.length !== messages.length ||
                                !updatedMessages.every((val, index) => val.id === messages[index]?.id && val.text === messages[index]?.text);
    if (messagesHaveChanged) {
        setMessages(updatedMessages);
    }

    prevIsFindingPartnerRef.current = isFindingPartner;
    prevIsPartnerConnectedRef.current = isPartnerConnected;
    prevIsSelfDisconnectedRecentlyRef.current = isSelfDisconnectedRecently;
    prevIsPartnerLeftRecentlyRef.current = isPartnerLeftRecently;

  }, [isPartnerConnected, isFindingPartner, socketError, isSelfDisconnectedRecently, isPartnerLeftRecently, messages, partnerInterests, interests, changeFavicon]);


  const getCameraStream = useCallback(async () => {
    if (localStreamRef.current && localStreamRef.current.active) {
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
      console.error(`${LOG_PREFIX}: Error accessing camera:`, error);
      setHasCameraPermission(false);
       toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Please enable camera permissions in your browser settings to use this app.',
        });
      return null;
    }
  }, [toast]);

  const cleanupConnections = useCallback((stopLocalStream = true) => {
    console.log(`${LOG_PREFIX}: cleanupConnections called. Stop local stream:`, stopLocalStream);
    if (peerConnectionRef.current) {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.getSenders().forEach(sender => {
            if (sender.track) {
                sender.track.stop();
            }
            try {
                peerConnectionRef.current?.removeTrack(sender);
            } catch (e) {
                console.warn(`${LOG_PREFIX}: Error removing track from peer connection:`, e);
            }
        });
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        console.log(`${LOG_PREFIX}: PeerConnection closed.`);
    }
    if (stopLocalStream && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        console.log(`${LOG_PREFIX}: Local stream stopped and video ref cleared.`);
    } else if (localStreamRef.current && localVideoRef.current && !localVideoRef.current.srcObject && stopLocalStream === false) {
        localVideoRef.current.srcObject = localStreamRef.current;
    }


    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const setupWebRTC = useCallback(async (initiator: boolean) => {
    const currentActiveSocket = socketRef.current;
    const currentRId = roomIdRef.current;

    if (!currentActiveSocket || !currentRId) {
        console.error(`${LOG_PREFIX}: setupWebRTC called with invalid socket or roomId. Socket: ${currentActiveSocket}, RoomID: ${currentRId}`);
        return;
    }
    console.log(`${LOG_PREFIX}: Setting up WebRTC. Initiator:`, initiator, "Room ID:", currentRId);

    const stream = await getCameraStream();
    if (!stream) {
        toast({ title: "Camera Error", description: "Cannot setup video chat without camera.", variant: "destructive"});
        return;
    }

    if (peerConnectionRef.current) {
        console.warn(`${LOG_PREFIX}: PeerConnection already exists during setupWebRTC. Closing existing before creating new.`);
        cleanupConnections(false);
    }

    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current?.connected && roomIdRef.current) {
            console.log(`${LOG_PREFIX}: Sending ICE candidate for room ${roomIdRef.current}`);
            socketRef.current.emit('webrtcSignal', { roomId: roomIdRef.current, signalData: { candidate: event.candidate } });
        }
    };

    pc.ontrack = (event) => {
        console.log(`${LOG_PREFIX}: Received remote track for room ${roomIdRef.current}`);
        if (remoteVideoRef.current && event.streams && event.streams[0]) {
            if(remoteVideoRef.current.srcObject !== event.streams[0]) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        } else {
            console.warn(`${LOG_PREFIX}: Remote video ref not available or no streams on track event.`)
        }
    };

    pc.oniceconnectionstatechange = () => {
      if(peerConnectionRef.current){
        console.log(`${LOG_PREFIX}: ICE connection state change for room ${roomIdRef.current}: ${peerConnectionRef.current.iceConnectionState}`);
        if (peerConnectionRef.current.iceConnectionState === 'failed' ||
            peerConnectionRef.current.iceConnectionState === 'disconnected' ||
            peerConnectionRef.current.iceConnectionState === 'closed') {
             console.warn(`${LOG_PREFIX}: WebRTC connection failed or disconnected for room ${roomIdRef.current}. Consider cleanup.`);
        }
      }
    };

    if (initiator) {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (socketRef.current?.connected && roomIdRef.current) {
                console.log(`${LOG_PREFIX}: Sending offer for room ${roomIdRef.current}`);
                socketRef.current.emit('webrtcSignal', { roomId: roomIdRef.current, signalData: offer });
            }
        } catch (error) {
            console.error(`${LOG_PREFIX}: Error creating offer for room ${roomIdRef.current}:`, error);
        }
    }
  }, [getCameraStream, toast, cleanupConnections]);

  const handleFindOrDisconnectPartner = useCallback(async () => {
    if (isProcessingFindOrDisconnect.current) {
        console.log(`${LOG_PREFIX}: Find/disconnect action already in progress.`);
        return;
    }
    isProcessingFindOrDisconnect.current = true;

    const currentSocket = socketRef.current;
    if (!currentSocket) {
        toast({ title: "Not Connected", description: "Chat server connection not yet established.", variant: "destructive" });
        isProcessingFindOrDisconnect.current = false;
        return;
    }

    if (isPartnerConnected && roomIdRef.current) {
        console.log(`${LOG_PREFIX}: User ${currentSocket.id} is skipping partner in room ${roomIdRef.current} (video).`);
        addMessage(SYS_MSG_YOU_DISCONNECTED, 'system', undefined, 'self-disconnect-skip');
        
        if (currentSocket.connected) {
            console.log(`${LOG_PREFIX}: Emitting leaveChat for room: ${roomIdRef.current} (video)`);
            currentSocket.emit('leaveChat', { roomId: roomIdRef.current });
        } else {
            console.warn(`${LOG_PREFIX}: Cannot emit leaveChat, socket not connected (video).`);
        }
        cleanupConnections(false); 

        setIsPartnerConnected(false);
        setIsPartnerTyping(false);
        setRoomId(null); 
        setPartnerInterests([]);
        setIsSelfDisconnectedRecently(true);

        console.log(`${LOG_PREFIX}: User ${currentSocket.id} now finding new partner after skip (video).`);
        setIsFindingPartner(true);
        if (currentSocket.connected) {
            currentSocket.emit('findPartner', { chatType: 'video', interests });
        } else {
            toast({ title: "Connection Issue", description: "Cannot find new partner, connection lost.", variant: "destructive" });
            setSocketError(true);
            setIsFindingPartner(false);
        }
    } else if (isFindingPartner) {
        console.log(`${LOG_PREFIX}: User ${currentSocket.id} stopping partner search (video).`);
        setIsFindingPartner(false);
    } else {
        if (hasCameraPermission === false) {
            toast({ title: "Camera Required", description: "Please enable camera access to start a video chat.", variant: "destructive" });
            isProcessingFindOrDisconnect.current = false;
            setIsFindingPartner(false);
            return;
        }
        const stream = await getCameraStream();
        if (!stream) {
            isProcessingFindOrDisconnect.current = false;
            setIsFindingPartner(false);
            return;
        }
        if (!currentSocket.connected) {
             toast({ title: "Connection Lost", description: "Cannot find partner. Please check your internet connection.", variant: "destructive" });
             isProcessingFindOrDisconnect.current = false;
             setSocketError(true);
             return;
        }
        console.log(`${LOG_PREFIX}: User ${currentSocket.id} starting partner search (video).`);
        setIsFindingPartner(true);
        currentSocket.emit('findPartner', { chatType: 'video', interests });
    }
    setTimeout(() => { isProcessingFindOrDisconnect.current = false; }, 500);
  }, [
      isPartnerConnected, isFindingPartner, interests, addMessage,
      cleanupConnections, getCameraStream, toast, hasCameraPermission
    ]);


  useEffect(() => {
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) {
      console.error(`${LOG_PREFIX}: Socket server URL is not defined.`);
      toast({ title: "Configuration Error", description: "Socket server URL is missing.", variant: "destructive" });
      setSocketError(true);
      return () => {};
    }

    console.log(`${LOG_PREFIX}: Attempting to connect to socket server: ${socketServerUrl}`);
    const newSocket = io(socketServerUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    socketRef.current = newSocket;

    const onConnect = async () => {
        console.log(`${LOG_PREFIX}: Socket connected (ID: ${newSocket.id}). Auto-search status: ${autoSearchDoneRef.current}`);
        setSocketError(false);
        if (!autoSearchDoneRef.current && !isPartnerConnected && !isFindingPartner && !roomIdRef.current) {
            console.log(`${LOG_PREFIX}: Automatically starting partner search on initial connect (video).`);
             if (hasCameraPermission === undefined) { 
                await getCameraStream();
            }
            if (hasCameraPermission === true || (localStreamRef.current && localStreamRef.current.active)) {
                setIsFindingPartner(true);
                newSocket.emit('findPartner', { chatType: 'video', interests });
                autoSearchDoneRef.current = true;
            } else {
                console.log(`${LOG_PREFIX}: Camera permission not granted or stream failed, not auto-searching.`);
                addMessage("Camera access is required for video chat. Please enable it and try finding a partner.", "system", undefined, "cam-required");
                setIsFindingPartner(false);
            }
        }
    };

    const onPartnerFound = ({ partnerId: pId, roomId: rId, interests: pInterests, partnerUsername }: { partnerId: string, roomId: string, interests: string[], partnerUsername?: string }) => {
      console.log(`${LOG_PREFIX}: Partner found event received for socket ${newSocket.id}`, { pId, rId, pInterests, partnerUsername });
      playSound("Match.wav");
      setMessages([]);
      setRoomId(rId);
      // roomIdRef.current updated by effect
      setPartnerInterests(pInterests || []);
      setIsFindingPartner(false);
      setIsPartnerConnected(true);
      setIsSelfDisconnectedRecently(false);
      setIsPartnerLeftRecently(false);
      if (isMounted) { // Ensure component is mounted before setting up WebRTC
          setupWebRTC(true); // Initiator
      }
    };

    const onWaitingForPartner = () => {
        console.log(`${LOG_PREFIX}: Server acknowledged 'waitingForPartner' for ${newSocket.id}`);
     };

    const onFindPartnerCooldown = () => {
      console.log(`${LOG_PREFIX}: Received findPartnerCooldown for ${newSocket.id}`);
      toast({ title: "Slow down!", description: "Please wait a moment before finding a new partner.", variant: "default" });
      setIsFindingPartner(false);
    };

    const onReceiveMessage = ({ senderId, message: receivedMessage, senderUsername }: { senderId: string, message: string, senderUsername?: string }) => {
      console.log(`${LOG_PREFIX}: Socket ${newSocket.id} received message: "${receivedMessage}" from partner (username: ${senderUsername}) in room ${roomIdRef.current}`);
      addMessage(receivedMessage, 'partner', senderUsername);
      setIsPartnerTyping(false);
    };

    const onWebRTCSignal = async (signalData: any) => {
      console.log(`${LOG_PREFIX}: Socket ${newSocket.id} received WebRTC signal for room ${roomIdRef.current}:`, signalData.type || 'candidate');
      let pc = peerConnectionRef.current;

      if (!newSocket || !roomIdRef.current) {
        console.error(`${LOG_PREFIX}: Socket or RoomID missing for WebRTC signal.`);
        return;
      }

      if (!pc && isPartnerConnected && isMounted) {
          console.log(`${LOG_PREFIX}: Receiving signal, local PC not yet set up. Setting up now (non-initiator) for room ${roomIdRef.current}.`);
          await setupWebRTC(false); // Non-initiator
          pc = peerConnectionRef.current;
      }

      if (!pc) {
        console.error(`${LOG_PREFIX}: PeerConnection not initialized for room ${roomIdRef.current}, cannot handle signal:`, signalData);
        return;
      }

      try {
        if (signalData.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        } else if (signalData.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (socketRef.current?.connected && roomIdRef.current) socketRef.current.emit('webrtcSignal', { roomId: roomIdRef.current, signalData: answer });
          console.log(`${LOG_PREFIX}: Sent answer for room ${roomIdRef.current}`);
        } else if (signalData.type === 'answer') {
          if (pc.signalingState === 'have-local-offer' || pc.signalingState === 'stable') { // Check state before setting remote answer
              await pc.setRemoteDescription(new RTCSessionDescription(signalData));
          } else {
              console.warn(`${LOG_PREFIX}: Received answer for room ${roomIdRef.current} but not in have-local-offer state. Current state:`, pc.signalingState);
          }
        }
      } catch (error) {
        console.error(`${LOG_PREFIX}: Error handling WebRTC signal for room ${roomIdRef.current}:`, error, signalData);
      }
    };

    const onPartnerLeft = () => {
      console.log(`${LOG_PREFIX}: PartnerLeft event received for socket ${newSocket.id}. Current room: ${roomIdRef.current}`);
      setIsPartnerLeftRecently(true);
      cleanupConnections(false); // Keep local stream if user wants to find new partner
      setIsPartnerConnected(false);
      setIsPartnerTyping(false);
      setRoomId(null);
      // roomIdRef.current updated by effect
      setPartnerInterests([]);
      setIsFindingPartner(false); 
    };

    const onDisconnectHandler = (reason: string) => { // Renamed
      console.log(`${LOG_PREFIX}: Socket ${newSocket.id} disconnected from server. Reason:`, reason);
      setSocketError(true);
      cleanupConnections(true); // Stop local stream on full disconnect
      setIsPartnerConnected(false);
      setIsFindingPartner(false);
      setIsPartnerTyping(false);
      setRoomId(null);
      // roomIdRef.current updated by effect
    };

    const onConnectError = (err: Error) => {
      console.error(`${LOG_PREFIX}: Socket ${newSocket.id} connection error:`, String(err), err);
      setSocketError(true);
      setIsFindingPartner(false);
      setIsPartnerTyping(false);
      toast({
        title: "Connection Error",
        description: `Could not connect to chat server. ${String(err)}. Please try again later.`,
        variant: "destructive"
      });
    };

    const onPartnerTypingStart = () => setIsPartnerTyping(true);
    const onPartnerTypingStop = () => setIsPartnerTyping(false);

    if (newSocket.connected) {
        onConnect();
    } else {
        newSocket.on('connect', onConnect);
    }
    newSocket.on('partnerFound', onPartnerFound);
    newSocket.on('waitingForPartner', onWaitingForPartner);
    newSocket.on('findPartnerCooldown', onFindPartnerCooldown);
    newSocket.on('receiveMessage', onReceiveMessage);
    newSocket.on('webrtcSignal', onWebRTCSignal);
    newSocket.on('partnerLeft', onPartnerLeft);
    newSocket.on('disconnect', onDisconnectHandler);
    newSocket.on('connect_error', onConnectError);
    newSocket.on('partner_typing_start', onPartnerTypingStart);
    newSocket.on('partner_typing_stop', onPartnerTypingStop);

     return () => {
        console.log(`${LOG_PREFIX}: Cleaning up VideoChatPageClientContent. Disconnecting socket ID:`, newSocket?.id);
        if (roomIdRef.current && newSocket?.connected) {
          console.log(`${LOG_PREFIX}: Emitting leaveChat during cleanup for room: ${roomIdRef.current} (video)`);
          newSocket.emit('leaveChat', { roomId: roomIdRef.current });
        }
        if (newSocket) {
            newSocket.off('connect', onConnect);
            newSocket.off('partnerFound', onPartnerFound);
            newSocket.off('waitingForPartner', onWaitingForPartner);
            newSocket.off('findPartnerCooldown', onFindPartnerCooldown);
            newSocket.off('receiveMessage', onReceiveMessage);
            newSocket.off('webrtcSignal', onWebRTCSignal);
            newSocket.off('partnerLeft', onPartnerLeft);
            newSocket.off('disconnect', onDisconnectHandler);
            newSocket.off('connect_error', onConnectError);
            newSocket.off('partner_typing_start', onPartnerTypingStart);
            newSocket.off('partner_typing_stop', onPartnerTypingStop);
            newSocket.disconnect();
        }
        socketRef.current = null;
        cleanupConnections(true);
        changeFavicon(FAVICON_DEFAULT, true);
        if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
        if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
        if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current);
        if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
        if (localTypingTimeoutRef.current) clearTimeout(localTypingTimeoutRef.current);
    };
  }, [addMessage, toast, interests, changeFavicon, getCameraStream, setupWebRTC, cleanupConnections, isMounted, hasCameraPermission, isPartnerConnected, isFindingPartner]);


  useEffect(() => {
    setIsMounted(true);
    if (hasCameraPermission === undefined) { // Only call if permission state is unknown
        getCameraStream();
    }
  }, [getCameraStream, hasCameraPermission]); // Add hasCameraPermission

  useEffect(() => {
    if (effectivePageTheme === 'theme-98') {
      setEmojisLoading(true);
      fetch('/emote_index.json')
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to fetch emote_index.json: ${res.status} ${res.statusText}`);
          }
          return res.json();
        })
        .then((data: EmoteData[]) => {
          const filenames = data.map(emote => emote.filename);
          setPickerEmojiFilenames(filenames);
        })
        .catch((err) => {
          console.error(`${LOG_PREFIX}: Failed to load emojis from emote_index.json:`, err);
          toast({
            title: "Emoji Error",
            description: `Could not load emojis for picker: ${err.message}`,
            variant: "destructive"
          });
          setPickerEmojiFilenames([]);
        })
        .finally(() => {
          setEmojisLoading(false);
        });
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
    if (isLocalTypingRef.current && socketRef.current?.connected && roomIdRef.current) {
      socketRef.current.emit('typing_stop', { roomId: roomIdRef.current });
      isLocalTypingRef.current = false;
    }
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    const currentActiveSocket = socketRef.current;
    const currentActiveRoomId = roomIdRef.current;

    if (currentActiveSocket?.connected && currentActiveRoomId && isPartnerConnected) {
      if (!isLocalTypingRef.current && e.target.value.trim() !== '') {
        currentActiveSocket.emit('typing_start', { roomId: currentActiveRoomId });
        isLocalTypingRef.current = true;
      }
      if (localTypingTimeoutRef.current) {
        clearTimeout(localTypingTimeoutRef.current);
      }
      if (e.target.value.trim() !== '') {
        localTypingTimeoutRef.current = setTimeout(() => {
           if (socketRef.current?.connected && roomIdRef.current) {
              socketRef.current.emit('typing_stop', { roomId: roomIdRef.current });
              isLocalTypingRef.current = false;
           }
        }, 2000);
      } else if (isLocalTypingRef.current) {
        stopLocalTyping();
      }
    }
  }, [isPartnerConnected, stopLocalTyping]);

  const handleSendMessage = useCallback(() => {
    const trimmedMessage = newMessage.trim();
    const currentSocket = socketRef.current;
    const currentRoomId = roomIdRef.current;

    console.log(`${LOG_PREFIX}: Attempting to send message (video). Valid message: ${!!trimmedMessage}, Socket connected: ${!!currentSocket?.connected}, Room ID: ${currentRoomId}, Partner connected: ${isPartnerConnected}`);
    
    if (!trimmedMessage || !currentSocket?.connected || !currentRoomId || !isPartnerConnected) {
        if (!trimmedMessage) console.warn(`${LOG_PREFIX}: Send message aborted (video): Message is empty.`);
        if (!currentSocket?.connected) console.warn(`${LOG_PREFIX}: Send message aborted (video): Socket not connected.`);
        if (!currentRoomId) console.warn(`${LOG_PREFIX}: Send message aborted (video): No Room ID.`);
        if (!isPartnerConnected) console.warn(`${LOG_PREFIX}: Send message aborted (video): Partner not connected.`);
        return;
    }
    console.log(`${LOG_PREFIX}: Emitting sendMessage (video):`, { roomId: currentRoomId, message: trimmedMessage, username: ownProfileUsername });
    currentSocket.emit('sendMessage', {
      roomId: currentRoomId,
      message: trimmedMessage,
      username: ownProfileUsername
    });
    addMessage(trimmedMessage, 'me', ownProfileUsername);
    setNewMessage('');
    stopLocalTyping();
  }, [newMessage, isPartnerConnected, addMessage, stopLocalTyping, ownProfileUsername]);

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

  const mainButtonDisabled = !socketRef.current?.connected || socketError;
  const inputAndSendDisabled = !socketRef.current?.connected || !isPartnerConnected || isFindingPartner || socketError;

  const messagesContainerHeight = `calc(100% - ${INPUT_AREA_HEIGHT}px)`;

  if (!isMounted) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p>Loading video chat interface...</p>
      </div>
    );
  }

  return (
    <>
      <HomeButton />
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
                "title-bar text-sm video-feed-title-bar",
                effectivePageTheme === 'theme-98' ? '' : 'theme-7'
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
                "title-bar text-sm video-feed-title-bar",
                effectivePageTheme === 'theme-98' ? '' : 'theme-7'
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
              {!isFindingPartner && !isPartnerConnected && !socketError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">Partner video unavailable</p>
                </div>
              )}
              {socketError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                      <p className="text-white text-center p-2 text-sm">Connection error. Try again.</p>
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
            <div className="flex items-center flex-grow">
              <div className="title-bar-text">
                Video Chat
              </div>
            </div>
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
              <div>
                  {messages.map((msg, index) => (
                    <Row
                        key={msg.id}
                        message={msg}
                        theme={effectivePageTheme}
                        previousMessageSender={index > 0 ? messages[index-1]?.sender : undefined}
                        pickerEmojiFilenames={pickerEmojiFilenames}
                        ownUsername={ownProfileUsername}
                    />
                  ))}
                  {isPartnerTyping && (
                    <div className={cn(
                      "text-xs italic text-left pl-1 py-0.5",
                      effectivePageTheme === 'theme-7' ? 'theme-7-text-shadow text-gray-100' : 'text-gray-500 dark:text-gray-400'
                    )}>
                      {messages.find(m => m.sender === 'partner')?.senderUsername || 'Stranger'} is typing{typingDots}
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
                {effectivePageTheme === 'theme-98' && (
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
                        {emojisLoading ? (
                          <p className="text-center w-full text-xs">Loading emojis...</p>
                        ): pickerEmojiFilenames.length > 0 ? (
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
                          <p className="text-center w-full text-xs">No emojis found. Check emote_index.json.</p>
                        )}
                      </div>
                    )}
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
    </>
  );
};

export default VideoChatPageClientContent;
