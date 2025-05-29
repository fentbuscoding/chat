
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
const STATIC_DISPLAY_EMOJI_FILENAMES = [
  'angel.png', 'bigsmile.png', 'burp.png', 'cool.png', 'crossedlips.png',
  'cry.png', 'embarrassed.png', 'kiss.png', 'moneymouth.png', 'sad.png',
  'scream.png', 'smile.png', 'think.png', 'tongue.png', 'wink.png', 'yell.png'
];
const SMILE_EMOJI_FILENAME = 'smile.png';
const EMOJI_BASE_URL_PICKER = "https://storage.googleapis.com/chat_emoticons/emotes_98/";

const INPUT_AREA_HEIGHT = 60;
const TYPING_INDICATOR_HEIGHT = 20; // Height for the typing indicator area


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
  const socketRef = useRef<Socket | null>(null); // To hold stable socket instance for effects
  const roomIdRef = useRef<string | null>(null); // To hold stable roomId for effect cleanup

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
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

  // Typing indicator state
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [typingDots, setTypingDots] = useState('.');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const localTypingRef = useRef(false); // To track if local user is considered typing by server


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
    if (!isFindingPartner && prevIsFindingPartnerRef.current && !isPartnerConnected && !roomIdRef.current) { // Use roomIdRef
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


  // Effect for initializing and cleaning up socket connection
  useEffect(() => {
    setIsMounted(true);
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) {
      console.error("ChatPage: Socket server URL is not defined.");
      toast({ title: "Configuration Error", description: "Socket server URL is missing.", variant: "destructive" });
      return;
    }

    const newSocket = io(socketServerUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    setSocket(newSocket);
    socketRef.current = newSocket; // Store in ref for cleanup

    // Cleanup function
    return () => {
      if (socketRef.current) {
        if (roomIdRef.current) {
          socketRef.current.emit('leaveChat', { roomId: roomIdRef.current });
        }
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        console.log("ChatPage: Socket disconnected on component unmount.");
      }
      if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // Removed most dependencies to make this a one-time setup/teardown


  // Effect for managing socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handlePartnerFound = ({ partnerId: pId, roomId: rId, interests: pInterests }: { partnerId: string, roomId: string, interests: string[] }) => {
      console.log("ChatPage: Partner found event received", { pId, rId, pInterests });
      setIsFindingPartner(false);
      setIsPartnerConnected(true);
      setRoomId(rId);
      roomIdRef.current = rId; // Update ref
      setPartnerInterests(pInterests || []);
    };

    const handleWaitingForPartner = () => {
      // "Searching..." message handled by isFindingPartner state change
    };

    const handleFindPartnerCooldown = () => {
      toast({ title: "Slow down!", description: "Please wait a moment before finding a new partner.", variant: "default" });
      setIsFindingPartner(false);
    };

    const handleReceiveMessage = ({ senderId, message: receivedMessage }: { senderId: string, message: string }) => {
      addMessage(receivedMessage, 'partner');
      setIsPartnerTyping(false); // Partner sent a message, so they stopped typing
    };

    const handlePartnerLeft = () => {
      addMessage('Your partner has disconnected.', 'system');
      setIsPartnerConnected(false);
      setRoomId(null);
      roomIdRef.current = null; // Update ref
      setPartnerInterests([]);
      setIsPartnerTyping(false);
    };
    
    const handleSocketDisconnect = (reason: string) => {
      console.log("ChatPage: Disconnected from socket server. Reason:", reason);
      addMessage('You have been disconnected from the server.', 'system');
      setIsPartnerConnected(false);
      setIsFindingPartner(false);
      setRoomId(null);
      roomIdRef.current = null; // Update ref
      setIsPartnerTyping(false);
    };

    const handleConnectError = (err: Error) => {
      console.error("ChatPage: Socket connection error:", err.message);
      toast({
        title: "Connection Error",
        description: `Could not connect to chat server: ${err.message}. Please try again later.`,
        variant: "destructive"
      });
      setIsFindingPartner(false);
    };

    const handlePartnerTypingStart = () => setIsPartnerTyping(true);
    const handlePartnerTypingStop = () => setIsPartnerTyping(false);

    socket.on('connect', () => console.log("ChatPage: Connected to socket server with ID:", socket.id));
    socket.on('partnerFound', handlePartnerFound);
    socket.on('waitingForPartner', handleWaitingForPartner);
    socket.on('findPartnerCooldown', handleFindPartnerCooldown);
    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('partnerLeft', handlePartnerLeft);
    socket.on('disconnect', handleSocketDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('partner_typing_start', handlePartnerTypingStart);
    socket.on('partner_typing_stop', handlePartnerTypingStop);

    const fetchPickerEmojis = async () => {
      try {
        setEmojisLoading(true);
        const emojiList = await listEmojis();
        setPickerEmojiFilenames(Array.isArray(emojiList) ? emojiList : []);
      } catch (error: any) {
        const specificErrorMessage = error.message || String(error);
        console.error('Detailed GCS Error in listEmojisFlow (client-side):', specificErrorMessage);
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
    if(currentTheme === 'theme-98') fetchPickerEmojis();


    return () => {
      socket.off('connect');
      socket.off('partnerFound', handlePartnerFound);
      socket.off('waitingForPartner', handleWaitingForPartner);
      socket.off('findPartnerCooldown', handleFindPartnerCooldown);
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('partnerLeft', handlePartnerLeft);
      socket.off('disconnect', handleSocketDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('partner_typing_start', handlePartnerTypingStart);
      socket.off('partner_typing_stop', handlePartnerTypingStop);
    };
  }, [socket, addMessage, toast, interests, currentTheme]);


  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPartnerTyping]); // Scroll when partner typing status changes too


  const stopLocalTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (socket && roomIdRef.current && localTypingRef.current) {
      socket.emit('typing_stop', { roomId: roomIdRef.current });
      localTypingRef.current = false;
    }
  }, [socket]);

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim() || !socket || !roomIdRef.current || !isPartnerConnected) return;

    socket.emit('sendMessage', { roomId: roomIdRef.current, message: newMessage });
    addMessage(newMessage, 'me');
    setNewMessage('');
    stopLocalTyping();
  }, [newMessage, socket, isPartnerConnected, addMessage, stopLocalTyping]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (!socket || !roomIdRef.current || !isPartnerConnected) return;

    if (!localTypingRef.current) {
      socket.emit('typing_start', { roomId: roomIdRef.current });
      localTypingRef.current = true;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      stopLocalTyping();
    }, 2000); // Stop typing after 2 seconds of inactivity
  }, [socket, isPartnerConnected, setNewMessage, stopLocalTyping]);


  const handleFindOrDisconnectPartner = useCallback(() => {
    if (!socket) {
        toast({ title: "Not Connected", description: "Not connected to the chat server.", variant: "destructive" });
        return;
    }

    if (isPartnerConnected && roomIdRef.current) {
        socket.emit('leaveChat', { roomId: roomIdRef.current });
        addMessage('You have disconnected.', 'system');
        setIsPartnerConnected(false);
        setRoomId(null);
        roomIdRef.current = null;
        setPartnerInterests([]);
        setIsFindingPartner(true);
        socket.emit('findPartner', { chatType: 'text', interests });
    } else if (isFindingPartner) {
        setIsFindingPartner(false); 
        // Client UI updates. Server handles if user was in waiting list.
    } else {
        setIsFindingPartner(true); 
        socket.emit('findPartner', { chatType: 'text', interests });
    }
  }, [socket, isPartnerConnected, isFindingPartner, interests, toast, addMessage]);

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

  // Typing dots animation
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
      setTypingDots('.'); // Reset dots when partner stops typing
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
        <div className={cn("title-bar", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
          <div className="title-bar-text">Text Chat</div>
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
          className={cn(
            'window-body window-body-content flex-grow',
             effectivePageTheme === 'theme-7' ? 'glass-body-padding' : 'p-0.5'
          )}
        >
          {/* Message List Area */}
          <div
            className={cn(
              "flex-grow overflow-y-auto",
              effectivePageTheme === 'theme-7' ? 'border p-2 bg-white bg-opacity-20 dark:bg-gray-700 dark:bg-opacity-20' : 'sunken-panel tree-view p-1'
            )}
            style={{ height: `calc(100% - ${INPUT_AREA_HEIGHT}px)` }}
          >
            <div> {/* Container for messages */}
              {messages.map((msg, index) => (
                <Row key={msg.id} message={msg} theme={effectivePageTheme} previousMessageSender={index > 0 ? messages[index-1]?.sender : undefined} pickerEmojiFilenames={pickerEmojiFilenames} />
              ))}
               {isPartnerTyping && (
                <div className={cn(
                  "text-left text-xs italic px-1 py-0.5",
                  effectivePageTheme === 'theme-7' ? 'text-gray-100 theme-7-text-shadow' : 'text-gray-500 dark:text-gray-400'
                )}>
                  Stranger is typing{typingDots}
                </div>
              )}
              <div ref={messagesEndRef} /> {/* Scroll target */}
            </div>
          </div>

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


    