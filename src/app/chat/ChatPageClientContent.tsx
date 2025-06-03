
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn, playSound } from '@/lib/utils';
import { ConditionalGoldfishImage } from '@/components/ConditionalGoldfishImage';
import HomeButton from '@/components/HomeButton';
import { io, type Socket } from 'socket.io-client';
import { supabase } from '@/lib/supabase'; // Import Supabase client

// --- Constants ---
const EMOJI_BASE_URL_DISPLAY = "https://storage.googleapis.com/chat_emoticons/display_98/";
const STATIC_DISPLAY_EMOJI_FILENAMES = [
  'angel.png', 'bigsmile.png', 'burp.png', 'cool.png', 'crossedlips.png',
  'cry.png', 'embarrassed.png', 'kiss.png', 'moneymouth.png', 'sad.png',
  'scream.png', 'smile.png', 'think.png', 'tongue.png', 'wink.png', 'yell.png'
];
const SMILE_EMOJI_FILENAME = 'smile.png';
const EMOJI_BASE_URL_PICKER = "/emotes/";

const INPUT_AREA_HEIGHT = 60; // px
const LOG_PREFIX = "ChatPageClientContent";

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

// --- Types ---
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

// --- Helper Functions ---
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

// --- Components ---
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
    previousMessageSender &&
    ['me', 'partner'].includes(previousMessageSender) &&
    ['me', 'partner'].includes(message.sender) &&
    message.sender !== previousMessageSender;

  const messageContent = useMemo(() => (
    theme === 'theme-98'
    ? renderMessageWithEmojis(message.text, pickerEmojiFilenames, EMOJI_BASE_URL_PICKER)
    : [message.text]
  ), [message.text, theme, pickerEmojiFilenames]);

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


const ChatPageClientContent: React.FC = () => {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const autoSearchDoneRef = useRef(false);
  const prevIsFindingPartnerRef = useRef(false);
  const prevIsPartnerConnectedRef = useRef(false);
  const prevIsSelfDisconnectedRecentlyRef = useRef(false);
  const prevIsPartnerLeftRecentlyRef = useRef(false);
  const hoverIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalTypingRef = useRef(false);
  const isProcessingFindOrDisconnect = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const successTransitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const successTransitionEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skippedFaviconTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');

  const [roomId, setRoomId] = useState<string | null>(null);
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);
  const [partnerInterests, setPartnerInterests] = useState<string[]>([]);
  const [socketError, setSocketError] = useState(false);

  const [isSelfDisconnectedRecently, setIsSelfDisconnectedRecently] = useState(false);
  const [isPartnerLeftRecently, setIsPartnerLeftRecently] = useState(false);

  const [currentEmojiIconUrl, setCurrentEmojiIconUrl] = useState(() => `${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pickerEmojiFilenames, setPickerEmojiFilenames] = useState<string[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(true);

  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [typingDots, setTypingDots] = useState('.');

  const [ownProfileUsername, setOwnProfileUsername] = useState<string | null>(null);

  const interests = useMemo(() => searchParams.get('interests')?.split(',').filter(i => i.trim() !== '') || [], [searchParams]);
  const effectivePageTheme = useMemo(() => (isMounted ? currentTheme : 'theme-98'), [isMounted, currentTheme]);
  const chatWindowStyle = useMemo(() => ({ width: '600px', height: '600px' }), []);
  const messagesContainerComputedHeight = useMemo(() => `calc(100% - ${INPUT_AREA_HEIGHT}px)`, []);


  const changeFavicon = useCallback((newFaviconHref: string, removeOld: boolean = false) => {
    if (typeof window === 'undefined' || !document.head) {
        console.warn(`${LOG_PREFIX}: Cannot change favicon, window or document.head not available.`);
        return;
    }

    let existingLink: HTMLLinkElement | null = document.head.querySelector("link[rel*='icon']");

    if (removeOld && existingLink) {
        if (existingLink.parentNode) {
            existingLink.parentNode.removeChild(existingLink);
        } else {
        }
        existingLink = null;
    }

    if (!existingLink) {
        existingLink = document.createElement('link');
        existingLink.type = 'image/x-icon';
        existingLink.rel = 'shortcut icon';
        document.head.appendChild(existingLink);
    }
    existingLink.href = newFaviconHref;
  }, []);

  const addMessageToList = useCallback((text: string, sender: Message['sender'], senderUsername?: string, idSuffix?: string) => {
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
      skippedFaviconTimeoutRef.current = setTimeout(() => setIsSelfDisconnectedRecently(false), 1000);
    } else if (isPartnerLeftRecently) {
      changeFavicon(FAVICON_SKIPPED);
      skippedFaviconTimeoutRef.current = setTimeout(() => setIsPartnerLeftRecently(false), 1000);
    } else if (isFindingPartner) {
      changeFavicon(FAVICON_SEARCHING);
      const justStartedFinding = !prevIsFindingPartnerRef.current && !isPartnerConnected;
      const justFinishedRecentDisconnectAndIsSearching = prevIsSelfDisconnectedRecentlyRef.current && !isSelfDisconnectedRecently && !isPartnerConnected;

      if (justStartedFinding || justFinishedRecentDisconnectAndIsSearching) {
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
    } else { // Not finding, not connected (idle)
      changeFavicon(FAVICON_IDLE);
      // If we were finding and now we are not (and not because we connected or due to error)
      if (prevIsFindingPartnerRef.current && !isPartnerConnected && !roomIdRef.current && !socketError) {
         const isSearchingMsgPresent = updatedMessages.some(msg => msg.sender === 'system' && msg.text.toLowerCase().includes(SYS_MSG_SEARCHING_PARTNER.toLowerCase()));
         if (isSearchingMsgPresent) {
             updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_SEARCHING_PARTNER.toLowerCase());
             updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_STOPPED_SEARCHING, 'stopsearch');
         }
      }
      // If we were connected and now we are not (and it wasn't a partnerLeft or selfDisconnect event, but a generic stop)
      // This scenario is largely covered by isSelfDisconnectedRecently and isPartnerLeftRecently
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

  }, [
    isPartnerConnected, isFindingPartner, socketError,
    isSelfDisconnectedRecently, isPartnerLeftRecently,
    messages, // This dependency ensures re-evaluation if messages are added by other means
    partnerInterests, // This dependency is fine
    interests, // This dependency is fine
    changeFavicon // This dependency is fine
    // addMessageToList should not be a dependency of this effect as it would cause loops.
    // This effect's purpose is to manage system messages and favicons based on state changes.
  ]);

  const handleFindOrDisconnectPartner = useCallback(() => {
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
        // User wants to DISCONNECT from current partner
        const roomToLeave = roomIdRef.current;
        addMessageToList(SYS_MSG_YOU_DISCONNECTED, 'system', undefined, 'self-disconnect');
        currentSocket.emit('leaveChat', { roomId: roomToLeave });

        setIsPartnerConnected(false);
        setIsFindingPartner(false); // Explicitly stop finding after disconnect
        setIsPartnerTyping(false);
        setRoomId(null);
        setPartnerInterests([]);
        setIsSelfDisconnectedRecently(true);

    } else if (isFindingPartner) {
        // User wants to STOP SEARCHING
        setIsFindingPartner(false);
        // No need to emit to server, client just stops "expecting" a match for now
        // System message for "stopped searching" will be handled by the useEffect
    } else {
        // User wants to FIND PARTNER
        if (!currentSocket.connected) {
          toast({ title: "Connecting...", description: "Attempting to connect to chat server. Please wait.", variant: "default" });
          isProcessingFindOrDisconnect.current = false;
          return;
        }
        setIsFindingPartner(true);
        // System message for "searching" will be handled by the useEffect
        currentSocket.emit('findPartner', { chatType: 'text', interests });
    }
    // Release the processing flag after a short delay to prevent rapid clicks
    setTimeout(() => { isProcessingFindOrDisconnect.current = false; }, 200); // Slightly increased delay
  }, [
    isPartnerConnected, isFindingPartner, interests,
    toast, addMessageToList // addMessageToList is a dependency for adding system messages
  ]);

  useEffect(() => {
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) {
      console.error(`${LOG_PREFIX}: Socket server URL is not defined.`);
      toast({ title: "Configuration Error", description: "Socket server URL is missing.", variant: "destructive" });
      setSocketError(true);
      return;
    }

    console.log(`${LOG_PREFIX}: Attempting to connect to socket server: ${socketServerUrl}`);
    const newSocket = io(socketServerUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    socketRef.current = newSocket;

    const onConnect = () => {
        console.log(`${LOG_PREFIX}: Socket connected (ID: ${newSocket.id}). Auto-search status: ${autoSearchDoneRef.current}`);
        setSocketError(false);
        if (!autoSearchDoneRef.current && !isPartnerConnected && !isFindingPartner && !roomIdRef.current) {
            console.log(`${LOG_PREFIX}: Automatically starting partner search on initial connect.`);
            setIsFindingPartner(true);
            // Message for "searching" handled by useEffect
            newSocket.emit('findPartner', { chatType: 'text', interests });
            autoSearchDoneRef.current = true;
        }
    };

    const onPartnerFound = ({ roomId: rId, interests: pInterests, partnerUsername }: { partnerId: string, roomId: string, interests: string[], partnerUsername?: string }) => {
      console.log(`${LOG_PREFIX}: Partner found event received`, { roomId: rId, partnerInterests: pInterests, partnerUsername });
      playSound("Match.wav");
      setMessages([]); // Clear previous messages
      setRoomId(rId);
      setPartnerInterests(pInterests || []);
      // Note: We don't set partner's username here directly from this event.
      // It will come with messages. If we wanted to display it elsewhere, we could store it.
      setIsFindingPartner(false);
      setIsPartnerConnected(true);
      setIsSelfDisconnectedRecently(false);
      setIsPartnerLeftRecently(false);
      // System messages for connection handled by useEffect
    };

    const onWaitingForPartner = () => {
      console.log(`${LOG_PREFIX}: Server acknowledged 'waitingForPartner' for ${newSocket.id}`);
      // isFindingPartner should already be true if this is received.
      // useEffect handles the "Searching..." message.
    };

    const onFindPartnerCooldown = () => {
      toast({ title: "Slow down!", description: "Please wait a moment before finding a new partner.", variant: "default" });
      setIsFindingPartner(false); // Stop "Searching..." visual state
      // "Stopped searching" message handled by useEffect
    };

    const onReceiveMessage = ({ message: receivedMessage, senderUsername }: { senderId: string, message: string, senderUsername?: string }) => {
      addMessageToList(receivedMessage, 'partner', senderUsername);
      setIsPartnerTyping(false);
    };

    const onPartnerLeft = () => {
      // System message for partner disconnect handled by useEffect
      setIsPartnerLeftRecently(true); // This triggers the useEffect logic
      setIsPartnerConnected(false);
      setIsPartnerTyping(false);
      setRoomId(null);
      setPartnerInterests([]);
    };

    const onDisconnect = (reason: string) => {
      console.warn(`${LOG_PREFIX}: Disconnected from socket server. Reason:`, reason);
      setSocketError(true);
      setIsPartnerConnected(false);
      setIsFindingPartner(false);
      setIsPartnerTyping(false);
      setRoomId(null);
      // Favicon/message handled by useEffect based on socketError
    };

    const onConnectError = (err: Error) => {
        console.error(`${LOG_PREFIX}: Socket connection error:`, String(err), err);
        setSocketError(true);
        toast({
          title: "Connection Error",
          description: `Could not connect to chat server. ${String(err)}. Please try again later.`,
          variant: "destructive"
        });
        setIsFindingPartner(false);
        setIsPartnerTyping(false);
        // Favicon/message handled by useEffect based on socketError
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
    newSocket.on('partnerLeft', onPartnerLeft);
    newSocket.on('disconnect', onDisconnect);
    newSocket.on('connect_error', onConnectError);
    newSocket.on('partner_typing_start', onPartnerTypingStart);
    newSocket.on('partner_typing_stop', onPartnerTypingStop);

    return () => {
      console.log(`${LOG_PREFIX}: Cleaning up ChatPageClientContent. Disconnecting socket ID:`, newSocket.id);
      if (roomIdRef.current && newSocket.connected) {
        newSocket.emit('leaveChat', { roomId: roomIdRef.current });
      }
      newSocket.off('connect', onConnect);
      newSocket.off('partnerFound', onPartnerFound);
      newSocket.off('waitingForPartner', onWaitingForPartner);
      newSocket.off('findPartnerCooldown', onFindPartnerCooldown);
      newSocket.off('receiveMessage', onReceiveMessage);
      newSocket.off('partnerLeft', onPartnerLeft);
      newSocket.off('disconnect', onDisconnect);
      newSocket.off('connect_error', onConnectError);
      newSocket.off('partner_typing_start', onPartnerTypingStart);
      newSocket.off('partner_typing_stop', onPartnerTypingStop);

      newSocket.disconnect();
      socketRef.current = null;

      changeFavicon(FAVICON_DEFAULT, true);
      if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
      if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
      if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current);
      if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
      if (localTypingTimeoutRef.current) clearTimeout(localTypingTimeoutRef.current);
    };
  }, [addMessageToList, toast, interests, changeFavicon]);


  useEffect(() => {
    setIsMounted(true);
  }, []);


  useEffect(() => {
    if (effectivePageTheme === 'theme-98') {
      setEmojisLoading(true);
      fetch('/emote_index.json')
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP error ${res.status} ${res.statusText}`);
          }
          return res.json();
        })
        .then((data: EmoteData[]) => {
          const filenames = data.map(emote => emote.filename);
          setPickerEmojiFilenames(filenames);
        })
        .catch((err) => {
          console.error(`${LOG_PREFIX}: Error fetching emote_index.json:`, err.message, err);
          toast({
            title: "Emoji Error",
            description: `Could not load emojis for the picker. ${err.message}`,
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
  }, [effectivePageTheme, toast]);


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
    const value = e.target.value;
    setNewMessage(value);

    const currentSocket = socketRef.current;
    const currentRoomId = roomIdRef.current;

    if (currentSocket?.connected && currentRoomId && isPartnerConnected) {
      if (value.trim() !== '' && !isLocalTypingRef.current) {
        currentSocket.emit('typing_start', { roomId: currentRoomId });
        isLocalTypingRef.current = true;
      }

      if (localTypingTimeoutRef.current) {
        clearTimeout(localTypingTimeoutRef.current);
      }

      if (value.trim() !== '') {
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
    if (!trimmedMessage || !socketRef.current?.connected || !roomIdRef.current || !isPartnerConnected) return;

    socketRef.current.emit('sendMessage', {
      roomId: roomIdRef.current,
      message: trimmedMessage,
      username: ownProfileUsername
    });
    addMessageToList(trimmedMessage, 'me', ownProfileUsername);
    setNewMessage('');
    stopLocalTyping();
  }, [newMessage, isPartnerConnected, addMessageToList, stopLocalTyping, ownProfileUsername]);


  const handleEmojiIconHover = useCallback(() => {
    if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
    if (STATIC_DISPLAY_EMOJI_FILENAMES.length === 0) return;

    hoverIntervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * STATIC_DISPLAY_EMOJI_FILENAMES.length);
      setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${STATIC_DISPLAY_EMOJI_FILENAMES[randomIndex]}`);
    }, 300);
  }, []);

  const stopEmojiCycle = useCallback(() => {
    if (hoverIntervalRef.current) {
      clearInterval(hoverIntervalRef.current);
      hoverIntervalRef.current = null;
    }
    setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  }, []);

  const toggleEmojiPicker = useCallback(() => setIsEmojiPickerOpen(prev => !prev), []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const emojiIconTrigger = document.getElementById('emoji-icon-trigger');
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node) &&
          emojiIconTrigger && !emojiIconTrigger.contains(event.target as Node)) {
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
          if (prevDots.length >= 3) return '.';
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

  const findOrDisconnectText = useMemo(() => {
    if (isPartnerConnected) return 'Disconnect';
    if (isFindingPartner) return 'Stop Searching';
    return 'Find Partner';
  }, [isPartnerConnected, isFindingPartner]);

  const mainButtonDisabled = useMemo(() => !socketRef.current?.connected || socketError, [socketError]);
  const inputAndSendDisabled = useMemo(() =>
    !socketRef.current?.connected || !isPartnerConnected || isFindingPartner || socketError,
    [isPartnerConnected, isFindingPartner, socketError]
  );

  if (!isMounted) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p>Loading chat interface...</p>
      </div>
    );
  }

  return (
    <>
      <HomeButton />
      <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto">
        <div
          className={cn(
            'window flex flex-col relative',
            effectivePageTheme === 'theme-7' ? 'glass' : ''
          )}
          style={chatWindowStyle}
        >
          {effectivePageTheme === 'theme-7' && <ConditionalGoldfishImage /> }
          <div className={cn("title-bar", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
            <div className="flex items-center flex-grow">
              <div className="title-bar-text">
                Text Chat
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
              style={{ height: messagesContainerComputedHeight }}
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
                  aria-label={findOrDisconnectText}
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
                  aria-label="Chat message input"
                />
                {effectivePageTheme === 'theme-98' && (
                  <div className="relative ml-1 flex-shrink-0">
                    <img
                      id="emoji-icon-trigger"
                      src={currentEmojiIconUrl}
                      alt="Emoji"
                      className="w-4 h-4 cursor-pointer inline-block"
                      onMouseEnter={handleEmojiIconHover}
                      onMouseLeave={stopEmojiCycle}
                      onClick={toggleEmojiPicker}
                      data-ai-hint="emoji icon"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && toggleEmojiPicker()}
                      role="button"
                      aria-haspopup="true"
                      aria-expanded={isEmojiPickerOpen}
                    />
                    {isEmojiPickerOpen && (
                      <div
                        ref={emojiPickerRef}
                        className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-silver border border-raised z-30 window"
                        style={{ boxShadow: 'inset 1px 1px #fff, inset -1px -1px gray, 1px 1px gray' }}
                        role="dialog"
                        aria-label="Emoji picker"
                      >
                        {emojisLoading ? (
                          <p className="text-center w-full text-xs">Loading emojis...</p>
                        ) : pickerEmojiFilenames.length > 0 ? (
                          <div className="h-32 overflow-y-auto grid grid-cols-4 gap-1" role="grid">
                            {pickerEmojiFilenames.map((filename) => {
                              const shortcode = filename.split('.')[0];
                              return (
                                <img
                                  key={filename}
                                  src={`${EMOJI_BASE_URL_PICKER}${filename}`}
                                  alt={shortcode}
                                  className="max-w-6 max-h-6 object-contain cursor-pointer hover:bg-navy hover:p-0.5"
                                  onClick={() => {
                                    setNewMessage(prev => `${prev} :${shortcode}: `);
                                    setIsEmojiPickerOpen(false);
                                  }}
                                  data-ai-hint="emoji symbol"
                                  role="gridcell"
                                  tabIndex={0}
                                  onKeyDown={(e) => e.key === 'Enter' && (() => {
                                    setNewMessage(prev => `${prev} :${shortcode}: `);
                                    setIsEmojiPickerOpen(false);
                                  })()}
                                />
                              );
                            })}
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
                  aria-label="Send message"
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

export default ChatPageClientContent;
