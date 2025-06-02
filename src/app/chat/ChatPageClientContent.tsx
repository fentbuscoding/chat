'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { ConditionalGoldfishImage } from '@/components/ConditionalGoldfishImage';

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
const LOG_PREFIX = "ChatPageClientContent"; // Consistent naming

// Favicon Constants
const FAVICON_IDLE = '/Idle.ico';
const FAVICON_SEARCHING = '/Searching.ico';
const FAVICON_SUCCESS = '/Success.ico';
const FAVICON_SKIPPED = '/Skipped.ico';
const FAVICON_DEFAULT = '/favicon.ico'; // For cleanup

// System Message Text Constants (for easier management and i18n if needed later)
const SYS_MSG_SEARCHING_PARTNER = 'Searching for a partner...';
const SYS_MSG_STOPPED_SEARCHING = 'Stopped searching for a partner.';
const SYS_MSG_CONNECTED_PARTNER = 'Connected with a partner. You can start chatting!';
const SYS_MSG_YOU_DISCONNECTED = 'You have disconnected.'; // Added by handleFindOrDisconnectPartner
const SYS_MSG_PARTNER_DISCONNECTED = 'Your partner has disconnected.'; // Added by socket event
const SYS_MSG_COMMON_INTERESTS_PREFIX = 'You both like ';

// --- Types ---
interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: Date;
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
  // Regex for :shortcode: - improved to allow underscores and hyphens in shortcodes
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
          key={`${match.index}-${shortcodeName}`} // Using match.index ensures unique key for emojis at different positions
          src={`${baseUrl}${matchedFilename}`}
          alt={shortcodeName}
          className="inline max-h-5 w-auto mx-0.5 align-middle" // Standard Tailwind for inline images
          data-ai-hint="chat emoji"
        />
      );
    } else {
      parts.push(match[0]); // If shortcode not found, push the original text (e.g., ":unknown:")
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text]; // Ensure array is returned even for plain text
};

// --- Components ---
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
    previousMessageSender && // Ensure previousMessageSender is defined
    ['me', 'partner'].includes(previousMessageSender) &&
    ['me', 'partner'].includes(message.sender) &&
    message.sender !== previousMessageSender;

  const messageContent = useMemo(() => (
    theme === 'theme-98'
    ? renderMessageWithEmojis(message.text, pickerEmojiFilenames, EMOJI_BASE_URL_PICKER)
    : [message.text]
  ), [message.text, theme, pickerEmojiFilenames]); // Memoize the rendered content


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


const ChatPageClientContent: React.FC = () => {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentTheme, setTheme } = useTheme();
  const pathname = usePathname(); // Used for context, ensure it's needed or remove
  const [isMounted, setIsMounted] = useState(false);

  // Refs for mutable values that don't trigger re-renders
  const socketRef = useRef<Socket | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const autoSearchDoneRef = useRef(false); // Prevents auto-search on reconnects if user stopped it
  const prevIsFindingPartnerRef = useRef(false);
  const prevIsPartnerConnectedRef = useRef(false);
  const prevIsSelfDisconnectedRecentlyRef = useRef(false);
  const prevIsPartnerLeftRecentlyRef = useRef(false);
  const hoverIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalTypingRef = useRef(false);

  // Refs for DOM elements
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Refs for managing timeouts/intervals related to UI effects
  const successTransitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const successTransitionEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skippedFaviconTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Connection & Partner State
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);
  const [partnerInterests, setPartnerInterests] = useState<string[]>([]);
  const [socketError, setSocketError] = useState(false);
  
  // Temporary UI States (for effects like favicon changes)
  const [isSelfDisconnectedRecently, setIsSelfDisconnectedRecently] = useState(false);
  const [isPartnerLeftRecently, setIsPartnerLeftRecently] = useState(false);

  // Emoji Picker State
  const [currentEmojiIconUrl, setCurrentEmojiIconUrl] = useState(() => `${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pickerEmojiFilenames, setPickerEmojiFilenames] = useState<string[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(true);
  
  // Typing Indicator State
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [typingDots, setTypingDots] = useState('.');

  // Derived State / Memoized Values
  const interests = useMemo(() => searchParams.get('interests')?.split(',').filter(i => i.trim() !== '') || [], [searchParams]);
  const effectivePageTheme = useMemo(() => (isMounted ? currentTheme : 'theme-98'), [isMounted, currentTheme]);
  const chatWindowStyle = useMemo(() => ({ width: '600px', height: '600px' }), []);
  const messagesContainerComputedHeight = useMemo(() => `calc(100% - ${INPUT_AREA_HEIGHT}px)`, []);


  // --- Callbacks ---
  const changeFavicon = useCallback((newFaviconHref: string, removeOld: boolean = false) => {
    if (typeof window === 'undefined') return;
    let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    if (removeOld && link) {
      link.remove();
      link = null;
    }

    if (!link) {
      link = document.createElement('link') as HTMLLinkElement; // Type assertion
      link.type = 'image/x-icon';
      link.rel = 'shortcut icon'; // 'icon' or 'shortcut icon'
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = newFaviconHref;
  }, []);

  const addMessageToList = useCallback((text: string, sender: Message['sender'], idSuffix?: string) => {
    setMessages((prevMessages) => {
      const newMessageItem: Message = { // Explicitly type newMessageItem
        id: `${Date.now()}-${idSuffix || Math.random().toString(36).substring(2, 7)}`,
        text,
        sender,
        timestamp: new Date()
      };
      return [...prevMessages, newMessageItem];
    });
  }, []); // setMessages is stable

  // Update roomIdRef whenever roomId state changes
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // Effect for managing favicons and system messages based on connection status
  useEffect(() => {
    // Clear previous timeouts related to favicon transitions to prevent conflicts
    if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
    if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
    if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current);

    let updatedMessages = [...messages]; // Operate on a copy for batched updates

    // Helper to filter system messages from an array (more robust matching)
    const filterSystemMessagesFrom = (msgs: Message[], textPattern: string): Message[] => {
        return msgs.filter(msg => !(msg.sender === 'system' && msg.text.toLowerCase().includes(textPattern.toLowerCase())));
    };
    
    // Helper to add a system message if a similar one isn't already present
    const addSystemMessageIfNotPresentIn = (msgs: Message[], text: string, idSuffix: string): Message[] => {
        const lowerCaseText = text.toLowerCase();
        if (!msgs.some(msg => msg.sender === 'system' && msg.text.toLowerCase().includes(lowerCaseText))) {
            // Use a temp variable for the new message to avoid direct push if not needed
            const newMessageItem: Message = { id: `${Date.now()}-${idSuffix}`, text, sender: 'system', timestamp: new Date() };
            return [...msgs, newMessageItem];
        }
        return msgs;
    };
    
    // Main logic for favicon and system messages
    if (socketError) {
      changeFavicon(FAVICON_SKIPPED);
      // System message for socket error usually handled by toast
    } else if (isSelfDisconnectedRecently) {
      changeFavicon(FAVICON_SKIPPED);
      skippedFaviconTimeoutRef.current = setTimeout(() => setIsSelfDisconnectedRecently(false), 1000);
      // SYS_MSG_YOU_DISCONNECTED is added by handleFindOrDisconnectPartner
    } else if (isPartnerLeftRecently) {
      changeFavicon(FAVICON_SKIPPED);
      skippedFaviconTimeoutRef.current = setTimeout(() => setIsPartnerLeftRecently(false), 1000);
      // SYS_MSG_PARTNER_DISCONNECTED is added by socket 'partnerLeft' event
    } else if (isFindingPartner) {
      changeFavicon(FAVICON_SEARCHING);
      const justStartedFinding = !prevIsFindingPartnerRef.current && !isPartnerConnected;
      const justFinishedRecentDisconnectAndIsSearching = prevIsSelfDisconnectedRecentlyRef.current && !isSelfDisconnectedRecently && !isPartnerConnected;

      if (justStartedFinding || justFinishedRecentDisconnectAndIsSearching) {
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_PARTNER_DISCONNECTED);
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_STOPPED_SEARCHING);
        updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_SEARCHING_PARTNER, 'search');
      }
    } else if (isPartnerConnected) {
      if (!prevIsPartnerConnectedRef.current) { // Freshly connected
        let successCount = 0;
        changeFavicon(FAVICON_SUCCESS);
        successTransitionIntervalRef.current = setInterval(() => {
          changeFavicon(successCount % 2 === 0 ? FAVICON_IDLE : FAVICON_SUCCESS);
          successCount++;
        }, 750);
        successTransitionEndTimeoutRef.current = setTimeout(() => {
          if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
          if (isPartnerConnected) changeFavicon(FAVICON_SUCCESS); // End on success
        }, 3000);

        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_SEARCHING_PARTNER);
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_PARTNER_DISCONNECTED);
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_STOPPED_SEARCHING);
        updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_CONNECTED_PARTNER, 'connect');

        if (interests.length > 0 && partnerInterests.length > 0) {
          const common = interests.filter(interest => partnerInterests.includes(interest));
          if (common.length > 0) {
            updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, `${SYS_MSG_COMMON_INTERESTS_PREFIX}${common.join(', ')}.`, 'common');
          }
        }
      } else { // Already connected, ensure favicon is correct if no transition is active
         if(!successTransitionIntervalRef.current && !successTransitionEndTimeoutRef.current){
            changeFavicon(FAVICON_SUCCESS);
         }
      }
    } else { // Idle state
      changeFavicon(FAVICON_IDLE);
      // If was finding, but now stopped (and not because a partner was found or error)
      if (prevIsFindingPartnerRef.current && !isPartnerConnected && !roomIdRef.current && !socketError) {
         const isSearchingMsgPresent = updatedMessages.some(msg => msg.sender === 'system' && msg.text.toLowerCase().includes(SYS_MSG_SEARCHING_PARTNER.toLowerCase()));
         if (isSearchingMsgPresent) { 
             updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_SEARCHING_PARTNER);
             updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_STOPPED_SEARCHING, 'stopsearch');
         }
      }
    }

    // Batch update messages state only if there's a change to prevent infinite loops
    const messagesHaveChanged = updatedMessages.length !== messages.length || 
                                !updatedMessages.every((val, index) => val.id === messages[index]?.id && val.text === messages[index]?.text);
    if (messagesHaveChanged) {
        setMessages(updatedMessages);
    }

    // Update previous state refs for the next render cycle
    prevIsFindingPartnerRef.current = isFindingPartner;
    prevIsPartnerConnectedRef.current = isPartnerConnected;
    prevIsSelfDisconnectedRecentlyRef.current = isSelfDisconnectedRecently; 
    prevIsPartnerLeftRecentlyRef.current = isPartnerLeftRecently;

  }, [
    // State dependencies that trigger this effect
    isPartnerConnected, isFindingPartner, socketError, 
    isSelfDisconnectedRecently, isPartnerLeftRecently,
    messages, // Read from and written to, requires careful handling (as done with `messagesHaveChanged`)
    roomId, // Used in conditions like !roomIdRef.current (via roomIdRef update effect)
    partnerInterests, // For common interests message
    // Stable dependencies (memoized or setters)
    interests, 
    changeFavicon, 
    // addMessageToList is not directly used here for system messages, setMessages is used.
    // State setters are not needed in dependency arrays.
  ]);

  const handleFindOrDisconnectPartner = useCallback(() => {
    const currentSocket = socketRef.current;
    if (!currentSocket) {
        toast({ title: "Not Connected", description: "Chat server connection not yet established.", variant: "destructive" });
        return;
    }

    if (isPartnerConnected && roomIdRef.current) { // Disconnect logic
        addMessageToList(SYS_MSG_YOU_DISCONNECTED, 'system', 'self-disconnect');
        currentSocket.emit('leaveChat', { roomId: roomIdRef.current });
        
        // Reset partner-specific states
        setIsPartnerConnected(false);
        setIsPartnerTyping(false);
        setRoomId(null); // This will update roomIdRef.current via its own effect
        setPartnerInterests([]);
        setIsSelfDisconnectedRecently(true); // For UI effects (favicon)
        
        // Immediately try to find a new partner
        setIsFindingPartner(true);
        currentSocket.emit('findPartner', { chatType: 'text', interests });
        
    } else if (isFindingPartner) { // Stop finding
        setIsFindingPartner(false); 
        // The main effect will handle adding "Stopped searching..." message
    } else { // Find partner
        if (!currentSocket.connected) {
          toast({ title: "Connecting...", description: "Attempting to connect to chat server. Please wait.", variant: "default" });
          return;
        }
        setIsFindingPartner(true);
        currentSocket.emit('findPartner', { chatType: 'text', interests });
        // The main effect will handle adding "Searching..." message
    }
  }, [
    isPartnerConnected, isFindingPartner, interests, 
    toast, addMessageToList // Stable callbacks/memoized values
    // State setters (setIsPartnerConnected, etc.) are stable and not needed as dependencies
  ]);

  // Effect for Socket.IO connection and event handling
  useEffect(() => {
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) {
      console.error(`${LOG_PREFIX}: Socket server URL is not defined.`);
      toast({ title: "Configuration Error", description: "Socket server URL is missing.", variant: "destructive" });
      setSocketError(true);
      return; // No cleanup needed if setup failed early
    }

    console.log(`${LOG_PREFIX}: Attempting to connect to socket server: ${socketServerUrl}`);
    const newSocket = io(socketServerUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'] // Standard transports
    });
    socketRef.current = newSocket;

    const onConnect = () => {
        console.log(`${LOG_PREFIX}: Socket connected (ID: ${newSocket.id}). Auto-search status: ${autoSearchDoneRef.current}`);
        setSocketError(false); 
        if (!autoSearchDoneRef.current && !isPartnerConnected && !isFindingPartner && !roomIdRef.current) {
            console.log(`${LOG_PREFIX}: Automatically starting partner search on initial connect.`);
            setIsFindingPartner(true); 
            newSocket.emit('findPartner', { chatType: 'text', interests });
            autoSearchDoneRef.current = true; 
        }
    };
    
    const onPartnerFound = ({ roomId: rId, interests: pInterests }: { partnerId: string, roomId: string, interests: string[] }) => {
      console.log(`${LOG_PREFIX}: Partner found event received`, { roomId: rId, partnerInterests: pInterests });
      setMessages([]); // Clear previous chat messages
      setRoomId(rId);
      setPartnerInterests(pInterests || []); // Ensure it's an array
      setIsFindingPartner(false);
      setIsPartnerConnected(true);
      setIsSelfDisconnectedRecently(false); 
      setIsPartnerLeftRecently(false);     
    };
    
    const onWaitingForPartner = () => {
      console.log(`${LOG_PREFIX}: Server acknowledged 'waitingForPartner' for ${newSocket.id}`);
    };
    
    const onFindPartnerCooldown = () => {
      toast({ title: "Slow down!", description: "Please wait a moment before finding a new partner.", variant: "default" });
      setIsFindingPartner(false); 
    };
    
    const onReceiveMessage = ({ message: receivedMessage }: { senderId: string, message: string }) => {
      addMessageToList(receivedMessage, 'partner');
      setIsPartnerTyping(false); // Partner stopped typing upon sending a message
    };
    
    const onPartnerLeft = () => {
      addMessageToList(SYS_MSG_PARTNER_DISCONNECTED, 'system', 'partner-left');
      setIsPartnerLeftRecently(true); 
      setIsPartnerConnected(false);
      setIsPartnerTyping(false);
      setRoomId(null);
      setPartnerInterests([]);
    };
    
    const onDisconnect = (reason: string) => {
      console.warn(`${LOG_PREFIX}: Disconnected from socket server. Reason:`, reason);
      setSocketError(true); // Generic error state
      // Reset relevant states
      setIsPartnerConnected(false);
      setIsFindingPartner(false); 
      setIsPartnerTyping(false);
      setRoomId(null); // Important to clear room
      // Do not reset autoSearchDoneRef here, so auto-search doesn't trigger on manual reconnects if user stopped.
    };
    
    const onConnectError = (err: Error) => {
        console.error(`${LOG_PREFIX}: Socket connection error:`, String(err), err);
        setSocketError(true);
        toast({
          title: "Connection Error",
          description: `Could not connect to chat server. ${String(err)}. Please try again later.`,
          variant: "destructive"
        });
        setIsFindingPartner(false); // Stop search attempts on connection error
        setIsPartnerTyping(false);
    };
    
    const onPartnerTypingStart = () => setIsPartnerTyping(true);
    const onPartnerTypingStop = () => setIsPartnerTyping(false);

    // Register event listeners
    if (newSocket.connected) { // If already connected (e.g., fast re-render)
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
    newSocket.on('connect_error', onConnectError); // Standard event name
    newSocket.on('partner_typing_start', onPartnerTypingStart);
    newSocket.on('partner_typing_stop', onPartnerTypingStop);

    // Cleanup function
    return () => {
      console.log(`${LOG_PREFIX}: Cleaning up ChatPageClientContent. Disconnecting socket ID:`, newSocket.id);
      if (roomIdRef.current && newSocket.connected) { // Leave chat if in a room
        newSocket.emit('leaveChat', { roomId: roomIdRef.current });
      }
      // Remove all listeners
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

      changeFavicon(FAVICON_DEFAULT, true); // Reset favicon, remove old one
      // Clear all timers and intervals
      if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
      if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
      if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current);
      if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
      if (localTypingTimeoutRef.current) clearTimeout(localTypingTimeoutRef.current);
    };
  }, [addMessageToList, toast, interests, changeFavicon]); // Dependencies: stable callbacks and memoized values


  useEffect(() => {
    setIsMounted(true);
  }, []); 


  // Effect for fetching emoji list for the picker when theme-98 is active
  useEffect(() => {
    if (effectivePageTheme === 'theme-98') {
      setEmojisLoading(true);
      fetch('/emote_index.json') 
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP error ${res.status} ${res.statusText}`); // More specific error
          }
          return res.json();
        })
        .then((data: EmoteData[]) => {
          // Validate data structure if necessary
          const filenames = data.map(emote => emote.filename);
          setPickerEmojiFilenames(filenames);
        })
        .catch((err) => {
          console.error(`${LOG_PREFIX}: Error fetching emote_index.json:`, err.message, err);
          toast({
            title: "Emoji Error",
            description: `Could not load emojis for the picker. ${err.message}`, // Show error message
            variant: "destructive"
          });
          setPickerEmojiFilenames([]); // Ensure it's an empty array on error
        })
        .finally(() => {
          setEmojisLoading(false);
        });
    } else {
      setEmojisLoading(false); // Reset loading state if not theme-98
      setPickerEmojiFilenames([]); // Clear emojis if not theme-98
    }
  }, [effectivePageTheme, toast]); // Runs when theme changes or toast (stable) changes


  // Auto-scroll to new messages or typing indicator
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPartnerTyping]); // Trigger on new messages or when partner typing status changes

  // Callback to stop local typing indicator and emit event
  const stopLocalTyping = useCallback(() => {
    if (localTypingTimeoutRef.current) {
      clearTimeout(localTypingTimeoutRef.current);
      localTypingTimeoutRef.current = null;
    }
    if (isLocalTypingRef.current && socketRef.current?.connected && roomIdRef.current) { 
      socketRef.current.emit('typing_stop', { roomId: roomIdRef.current });
      isLocalTypingRef.current = false;
    }
  }, []); // No dependencies, uses refs

  // Handle input change and emit typing events
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);
    
    const currentSocket = socketRef.current; // Cache for checks
    const currentRoomId = roomIdRef.current; 

    if (currentSocket?.connected && currentRoomId && isPartnerConnected) {
      if (value.trim() !== '' && !isLocalTypingRef.current) { // Start typing if there's text
        currentSocket.emit('typing_start', { roomId: currentRoomId });
        isLocalTypingRef.current = true;
      }
      
      if (localTypingTimeoutRef.current) { // Clear existing timeout
        clearTimeout(localTypingTimeoutRef.current);
      }

      if (value.trim() !== '') { // Set new timeout only if there's text
        localTypingTimeoutRef.current = setTimeout(() => {
           // Re-check socket and room, as state might change during timeout
           if (socketRef.current?.connected && roomIdRef.current) { 
              socketRef.current.emit('typing_stop', { roomId: roomIdRef.current });
              isLocalTypingRef.current = false;
           }
        }, 2000); // 2 seconds debounce for typing stop
      } else if (isLocalTypingRef.current) { // If text is cleared, stop typing immediately
        stopLocalTyping();
      }
    }
  }, [isPartnerConnected, stopLocalTyping]); // setNewMessage is stable, stopLocalTyping is stable

  // Handle sending a message
  const handleSendMessage = useCallback(() => {
    const trimmedMessage = newMessage.trim();
    if (!trimmedMessage || !socketRef.current?.connected || !roomIdRef.current || !isPartnerConnected) return; 
    
    socketRef.current.emit('sendMessage', { roomId: roomIdRef.current, message: trimmedMessage });
    addMessageToList(trimmedMessage, 'me');
    setNewMessage('');
    stopLocalTyping(); // Stop local typing indicator after sending
  }, [newMessage, isPartnerConnected, addMessageToList, stopLocalTyping]); // Dependencies


  // Emoji icon hover effect
  const handleEmojiIconHover = useCallback(() => {
    if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current); // Clear existing
    if (STATIC_DISPLAY_EMOJI_FILENAMES.length === 0) return;
  
    hoverIntervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * STATIC_DISPLAY_EMOJI_FILENAMES.length);
      setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${STATIC_DISPLAY_EMOJI_FILENAMES[randomIndex]}`);
    }, 300); // Cycle speed
  }, []); // No dependencies

  const stopEmojiCycle = useCallback(() => {
    if (hoverIntervalRef.current) {
      clearInterval(hoverIntervalRef.current);
      hoverIntervalRef.current = null;
    }
    setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`); // Reset to default
  }, []);
  
  const toggleEmojiPicker = useCallback(() => setIsEmojiPickerOpen(prev => !prev), []);

  // Effect to handle clicks outside the emoji picker to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const emojiIconTrigger = document.getElementById('emoji-icon-trigger');
      // Check if click is outside picker AND not on the trigger icon itself
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
  }, [isEmojiPickerOpen]); // Re-bind if picker visibility changes

  // Effect for animating typing dots "..."
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPartnerTyping) {
      interval = setInterval(() => {
        setTypingDots(prevDots => {
          if (prevDots.length >= 3) return '.';
          return prevDots + '.';
        });
      }, 500); // Speed of dot animation
    } else {
      setTypingDots('.'); // Reset to single dot
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPartnerTyping]); // Run when partner typing status changes

  // Handle home icon click (theme reset and navigation)
  const handleIconClick = useCallback(() => {
    setTheme('theme-98'); // Reset theme
    // Navigation is handled by Link's href, this is for additional actions
  }, [setTheme]); // setTheme is stable

  // --- Derived UI Strings and Booleans ---
  const findOrDisconnectText = useMemo(() => {
    if (isPartnerConnected) return 'Disconnect';
    if (isFindingPartner) return 'Stop Searching';
    return 'Find Partner';
  }, [isPartnerConnected, isFindingPartner]);

  const mainButtonDisabled = useMemo(() => !socketRef.current?.connected || socketError, [socketError]); // Disable if not connected or error
  const inputAndSendDisabled = useMemo(() => 
    !socketRef.current?.connected || !isPartnerConnected || isFindingPartner || socketError, 
    [isPartnerConnected, isFindingPartner, socketError]
  );

  // --- Render ---
  if (!isMounted) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p>Loading chat interface...</p>
      </div>
    );
  }

  return (
    <>
      <Link
        href="/"
        onClick={handleIconClick}
        className="fixed top-4 left-4 z-50 cursor-pointer"
        title="Go to Home and reset theme"
      >
        <Image src={FAVICON_DEFAULT} alt="Home" width={24} height={24} />
      </Link>
      <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto"> {/* Ensure full height and centering */}
        <div
          className={cn(
            'window flex flex-col relative', // Base window styling
            effectivePageTheme === 'theme-7' ? 'glass' : '' // Conditional theme styling
          )}
          style={chatWindowStyle} // Memoized style
        >
          {effectivePageTheme === 'theme-7' && <ConditionalGoldfishImage /> }
          <div className={cn("title-bar", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
            <div className="flex items-center flex-grow">
              <div className="title-bar-text">
                Text Chat
              </div>
            </div>
            {/* Window controls can be added here if needed for theme-98 */}
          </div>
          <div
            className={cn(
              'window-body window-body-content flex-grow', // Ensure body grows
              effectivePageTheme === 'theme-7' ? 'glass-body-padding' : 'p-0.5'
            )}
          >
            <div
              className={cn(
                "flex-grow overflow-y-auto", // Allow scrolling for messages
                effectivePageTheme === 'theme-7' ? 'border p-2 bg-white bg-opacity-20 dark:bg-gray-700 dark:bg-opacity-20' : 'sunken-panel tree-view p-1'
              )}
              style={{ height: messagesContainerComputedHeight }} // Use memoized height
            >
              {/* Container for messages and typing indicator */}
              <div> 
                {messages.map((msg, index) => (
                  <Row 
                    key={msg.id} // Essential for list rendering performance
                    message={msg} 
                    theme={effectivePageTheme} 
                    previousMessageSender={index > 0 ? messages[index-1]?.sender : undefined} 
                    pickerEmojiFilenames={pickerEmojiFilenames}
                  />
                ))}
                {isPartnerTyping && (
                  <div className={cn(
                    "text-xs italic text-left pl-1 py-0.5", // Styling for typing indicator
                    effectivePageTheme === 'theme-7' ? 'theme-7-text-shadow text-gray-100' : 'text-gray-500 dark:text-gray-400'
                  )}>
                    Stranger is typing{typingDots}
                  </div>
                )}
                <div ref={messagesEndRef} /> {/* For auto-scrolling */}
              </div>
            </div>
            <div
              className={cn(
                "p-2 flex-shrink-0", // Prevent input area from shrinking
                effectivePageTheme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : 'input-area status-bar'
              )}
              style={{ height: `${INPUT_AREA_HEIGHT}px` }} // Fixed height
            >
              <div className="flex items-center w-full">
                <Button
                  onClick={handleFindOrDisconnectPartner}
                  disabled={mainButtonDisabled}
                  className={cn(
                    'mr-1',
                    effectivePageTheme === 'theme-7' ? 'glass-button-styled' : 'px-1 py-1'
                  )}
                  aria-label={findOrDisconnectText} // Accessibility
                >
                  {findOrDisconnectText}
                </Button>
                <Input
                  type="text"
                  value={newMessage}
                  onChange={handleInputChange}
                  onKeyPress={(e) => e.key === 'Enter' && !inputAndSendDisabled && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 w-full px-1 py-1" // Ensure input takes available space
                  disabled={inputAndSendDisabled}
                  aria-label="Chat message input" // Accessibility
                />
                {effectivePageTheme === 'theme-98' && (
                  <div className="relative ml-1 flex-shrink-0"> {/* Container for emoji picker */}
                    <img
                      id="emoji-icon-trigger" // For click outside detection
                      src={currentEmojiIconUrl}
                      alt="Emoji"
                      className="w-4 h-4 cursor-pointer inline-block"
                      onMouseEnter={handleEmojiIconHover}
                      onMouseLeave={stopEmojiCycle}
                      onClick={toggleEmojiPicker}
                      data-ai-hint="emoji icon"
                      tabIndex={0} // Make it focusable
                      onKeyDown={(e) => e.key === 'Enter' && toggleEmojiPicker()} // Keyboard accessibility
                      role="button" // ARIA role
                      aria-haspopup="true"
                      aria-expanded={isEmojiPickerOpen}
                    />
                    {isEmojiPickerOpen && (
                      <div
                        ref={emojiPickerRef}
                        className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-silver border border-raised z-30 window" // Styling for picker
                        style={{ boxShadow: 'inset 1px 1px #fff, inset -1px -1px gray, 1px 1px gray' }} // Theme-98 shadow
                        role="dialog" // ARIA role
                        aria-label="Emoji picker"
                      >
                        {emojisLoading ? (
                          <p className="text-center w-full text-xs">Loading emojis...</p>
                        ) : pickerEmojiFilenames.length > 0 ? (
                          <div className="h-32 overflow-y-auto grid grid-cols-4 gap-1" role="grid"> {/* ARIA for grid */}
                            {pickerEmojiFilenames.map((filename) => {
                              const shortcode = filename.split('.')[0];
                              return (
                                <img
                                  key={filename}
                                  src={`${EMOJI_BASE_URL_PICKER}${filename}`}
                                  alt={shortcode}
                                  className="max-w-6 max-h-6 object-contain cursor-pointer hover:bg-navy hover:p-0.5" // Ensure consistent size and hover effect
                                  onClick={() => {
                                    setNewMessage(prev => `${prev} :${shortcode}: `); // Add space around shortcode
                                    setIsEmojiPickerOpen(false);
                                  }}
                                  data-ai-hint="emoji symbol"
                                  role="gridcell" // ARIA for grid items
                                  tabIndex={0} // Focusable
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
                  disabled={inputAndSendDisabled || !newMessage.trim()} // Disable if no text or not allowed to send
                  className={cn(
                    'ml-1',
                    effectivePageTheme === 'theme-7' ? 'glass-button-styled' : 'px-1 py-1'
                  )}
                  aria-label="Send message" // Accessibility
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