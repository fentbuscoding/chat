
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { listEmojis } from '@/ai/flows/list-emojis-flow';

// Constants for Emojis
const EMOJI_BASE_URL_DISPLAY = "https://storage.googleapis.com/chat_emoticons/display_98/";
const STATIC_DISPLAY_EMOJI_FILENAMES = [ // Used for the hover icon cycle
  'angel.png', 'bigsmile.png', 'burp.png', 'cool.png', 'crossedlips.png',
  'cry.png', 'embarrassed.png', 'kiss.png', 'moneymouth.png', 'sad.png',
  'scream.png', 'smile.png', 'think.png', 'tongue.png', 'wink.png', 'yell.png'
];
const SMILE_EMOJI_FILENAME = 'smile.png'; // Default for the icon
const EMOJI_BASE_URL_PICKER = "https://storage.googleapis.com/chat_emoticons/emotes_98/";

const INPUT_AREA_HEIGHT = 60; // Assuming fixed height for the input area
const TYPING_INDICATOR_HEIGHT = 20;
const logPrefix = "ChatPage";

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
      <div className="mb-2 break-words">
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const interests = useMemo(() => searchParams.get('interests')?.split(',').filter(i => i.trim() !== '') || [], [searchParams]);

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

  const [socketError, setSocketError] = useState(false);
  const partnerLeftRecentlyRef = useRef(false);
  const selfDisconnectedRecentlyRef = useRef(false);
  const successTransitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const successTransitionEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skippedFaviconTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
    if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
    if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current);

    if (socketError) {
      changeFavicon('/Skipped.ico');
    } else if (selfDisconnectedRecentlyRef.current) {
      changeFavicon('/Skipped.ico');
      skippedFaviconTimeoutRef.current = setTimeout(() => {
        selfDisconnectedRecentlyRef.current = false;
      }, 1000);
    } else if (partnerLeftRecentlyRef.current) {
      changeFavicon('/Skipped.ico');
      skippedFaviconTimeoutRef.current = setTimeout(() => {
        partnerLeftRecentlyRef.current = false;
        changeFavicon('/Idle.ico');
      }, 1000);
    } else if (isFindingPartner) {
      changeFavicon('/Searching.ico');
      if (prevIsFindingPartnerRef.current === false && !isPartnerConnected) { 
        addMessage('Searching for a partner...', 'system');
      }
    } else if (isPartnerConnected) {
      if (prevIsPartnerConnectedRef.current === false) { 
        let successCount = 0;
        successTransitionIntervalRef.current = setInterval(() => {
          changeFavicon(successCount % 2 === 0 ? '/Success.ico' : '/Idle.ico');
          successCount++;
        }, 750);
        successTransitionEndTimeoutRef.current = setTimeout(() => {
          if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
          changeFavicon('/Success.ico');
        }, 3000);
        
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
      } else {
         if(!successTransitionIntervalRef.current && !successTransitionEndTimeoutRef.current){
            changeFavicon('/Success.ico');
         }
      }
    } else { 
      changeFavicon('/Idle.ico');
      if (prevIsFindingPartnerRef.current === true && !isPartnerConnected && !roomIdRef.current) { 
         const isSearchingMessagePresent = messages.some(msg => msg.sender === 'system' && msg.text.toLowerCase().includes('searching for a partner'));
         if (isSearchingMessagePresent) {
             setMessages(prev => prev.filter(msg => !(msg.sender === 'system' && msg.text.toLowerCase().includes('searching for a partner'))));
             addMessage('Stopped searching for a partner.', 'system');
         }
      }
    }
    prevIsFindingPartnerRef.current = isFindingPartner;
    prevIsPartnerConnectedRef.current = isPartnerConnected;
  }, [isPartnerConnected, isFindingPartner, socketError, addMessage, interests, partnerInterests, messages, changeFavicon]);


  const handleFindOrDisconnectPartner = useCallback(() => {
    const currentActiveSocket = socketRef.current;
    if (!currentActiveSocket) {
        toast({ title: "Not Connected", description: "Chat server connection not yet established.", variant: "destructive" });
        return;
    }

    if (isPartnerConnected && roomIdRef.current) {
        addMessage('You have disconnected.', 'system');
        currentActiveSocket.emit('leaveChat', { roomId: roomIdRef.current });
        selfDisconnectedRecentlyRef.current = true; 
        setIsPartnerConnected(false);
        roomIdRef.current = null;
        setPartnerInterests([]);
        setIsFindingPartner(true); 
        currentActiveSocket.emit('findPartner', { chatType: 'text', interests });
    } else if (isFindingPartner) {
        setIsFindingPartner(false); 
    } else {
        if (!currentActiveSocket.connected) {
          toast({ title: "Connecting...", description: "Attempting to connect to chat server. Please wait.", variant: "default" });
          return;
        }
        setIsFindingPartner(true);
        currentActiveSocket.emit('findPartner', { chatType: 'text', interests });
    }
  }, [toast, addMessage, isPartnerConnected, isFindingPartner, interests, socketRef, roomIdRef]);

  // Effect for initial setup and cleanup
  useEffect(() => {
    setIsMounted(true);
    changeFavicon('/Idle.ico'); 

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
    setSocket(newSocket); 
    socketRef.current = newSocket; 

    const handleInitialConnectAndSearch = () => {
        console.log(`${logPrefix}: Socket connected (ID: ${newSocket.id}). Auto-search status: ${autoSearchDoneRef.current}`);
        setSocketError(false);
        if (!autoSearchDoneRef.current && !isPartnerConnected && !isFindingPartner && !roomIdRef.current) {
            console.log(`${logPrefix}: Automatically starting partner search on initial connect.`);
            handleFindOrDisconnectPartner();
            autoSearchDoneRef.current = true;
        }
    };

    if (newSocket.connected) {
      handleInitialConnectAndSearch();
    } else {
      newSocket.on('connect', handleInitialConnectAndSearch);
    }
    
    const onPartnerFound = ({ partnerId: pId, roomId: rId, interests: pInterests }: { partnerId: string, roomId: string, interests: string[] }) => {
      console.log(`${logPrefix}: Partner found event received`, { pId, rId, pInterests });
      roomIdRef.current = rId;
      setPartnerInterests(pInterests || []);
      setIsFindingPartner(false);
      setIsPartnerConnected(true);
      selfDisconnectedRecentlyRef.current = false; 
      partnerLeftRecentlyRef.current = false; 
    };
    newSocket.on('partnerFound', onPartnerFound);

    newSocket.on('waitingForPartner', () => { /* Handled by isFindingPartner state change effect */ });

    const onFindPartnerCooldown = () => {
      toast({ title: "Slow down!", description: "Please wait a moment before finding a new partner.", variant: "default" });
      setIsFindingPartner(false);
    };
    newSocket.on('findPartnerCooldown', onFindPartnerCooldown);

    const onReceiveMessage = ({ senderId, message: receivedMessage }: { senderId: string, message: string }) => {
      addMessage(receivedMessage, 'partner');
      setIsPartnerTyping(false); // Partner sent a message, so they stopped typing
    };
    newSocket.on('receiveMessage', onReceiveMessage);

    const onPartnerLeft = () => {
      addMessage('Your partner has disconnected.', 'system');
      partnerLeftRecentlyRef.current = true; 
      setIsPartnerConnected(false);
      roomIdRef.current = null;
      setPartnerInterests([]);
      setIsPartnerTyping(false);
    };
    newSocket.on('partnerLeft', onPartnerLeft);
    
    const onDisconnect = (reason: string) => {
      console.log(`${logPrefix}: Disconnected from socket server. Reason:`, reason);
      addMessage('You have been disconnected from the server.', 'system');
      setSocketError(true);
      setIsPartnerConnected(false);
      setIsFindingPartner(false);
      roomIdRef.current = null;
      setIsPartnerTyping(false);
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
    };
    newSocket.on('connect_error', onConnectError);

    const onPartnerTypingStart = () => setIsPartnerTyping(true);
    newSocket.on('partner_typing_start', onPartnerTypingStart);

    const onPartnerTypingStop = () => setIsPartnerTyping(false);
    newSocket.on('partner_typing_stop', onPartnerTypingStop);

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
        setEmojisLoading(false);
        setPickerEmojiFilenames([]);
      }

    return () => {
      console.log(`${logPrefix}: Cleaning up ChatPageClientContent. Disconnecting socket ID:`, newSocket.id);
      if (roomIdRef.current) {
        newSocket.emit('leaveChat', { roomId: roomIdRef.current });
      }
      newSocket.off('connect', handleInitialConnectAndSearch);
      newSocket.off('partnerFound', onPartnerFound);
      newSocket.off('waitingForPartner');
      newSocket.off('findPartnerCooldown', onFindPartnerCooldown);
      newSocket.off('receiveMessage', onReceiveMessage);
      newSocket.off('partnerLeft', onPartnerLeft);
      newSocket.off('disconnect', onDisconnect);
      newSocket.off('connect_error', onConnectError);
      newSocket.off('partner_typing_start', onPartnerTypingStart);
      newSocket.off('partner_typing_stop', onPartnerTypingStop);
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
      changeFavicon('/favicon.ico', true); 
      if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
      if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
      if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current);
      if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [toast, addMessage, handleFindOrDisconnectPartner, currentTheme, interests, changeFavicon, isPartnerConnected, isFindingPartner]); // Added isPartnerConnected, isFindingPartner to ensure handleInitialConnectAndSearch has fresh values.


  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPartnerTyping]);


  const stopLocalTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (socketRef.current && roomIdRef.current && localTypingRef.current) {
      socketRef.current.emit('typing_stop', { roomId: roomIdRef.current });
      localTypingRef.current = false;
    }
  }, [socketRef, roomIdRef, localTypingRef]); 

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
  }, [isPartnerConnected, stopLocalTyping, socketRef, roomIdRef]);


  const handleSendMessage = useCallback(() => {
    const currentActiveSocket = socketRef.current;
    if (!newMessage.trim() || !currentActiveSocket || !roomIdRef.current || !isPartnerConnected) return;

    currentActiveSocket.emit('sendMessage', { roomId: roomIdRef.current, message: newMessage });
    addMessage(newMessage, 'me');
    setNewMessage('');
    stopLocalTyping();
  }, [newMessage, addMessage, isPartnerConnected, stopLocalTyping, socketRef, roomIdRef]);


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

  const toggleEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(prev => !prev);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        const emojiIcon = document.getElementById('emoji-icon-trigger');
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
  const mainButtonDisabled = !socket?.connected;
  const inputAndSendDisabled = !socket?.connected || !isPartnerConnected || isFindingPartner;


  const chatWindowStyle = useMemo(() => (
    { width: '600px', height: '600px' }
  ), []);


  if (!isMounted) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p>Loading chat interface...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto">
       <div
        className={cn(
          'window flex flex-col relative',
          effectivePageTheme === 'theme-7' ? 'glass' : ''
        )}
        style={chatWindowStyle}
      >
        {effectivePageTheme === 'theme-7' && (
             <ConditionalGoldfishImage />
        )}
        <div className={cn("title-bar", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
          <div className="title-bar-text">Text Chat</div>
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
            style={{ height: `calc(100% - ${INPUT_AREA_HEIGHT}px - ${isPartnerTyping ? TYPING_INDICATOR_HEIGHT : 0}px)` }}
          >
            <div> {/* Container for messages */}
              {messages.map((msg, index) => (
                <Row key={msg.id} message={msg} theme={effectivePageTheme} previousMessageSender={index > 0 ? messages[index-1]?.sender : undefined} pickerEmojiFilenames={pickerEmojiFilenames}/>
              ))}
              {isPartnerTyping && (
                <div className={cn(
                  "text-left text-xs italic px-1 py-0.5",
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
                    id="emoji-icon-trigger"
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

export default ChatPageClientContent;

