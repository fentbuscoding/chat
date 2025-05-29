
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
const TYPING_INDICATOR_HEIGHT = 24; // approx h-6

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
      transports: ['websocket'] // Prioritize WebSocket, fallback to polling if necessary
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
        console.log("ChatPage: Connected to socket server with ID:", newSocket.id);
    });

    newSocket.on('partnerFound', ({ partnerId: pId, roomId: rId, interests: pInterests }: { partnerId: string, roomId: string, interests: string[] }) => {
        setIsFindingPartner(false);
        setIsPartnerConnected(true);
        setRoomId(rId);
        setPartnerInterests(pInterests || []);
    });

    newSocket.on('waitingForPartner', () => {
      // System message for "Searching..." handled by other useEffect
    });

    newSocket.on('noPartnerFound', () => {
        setIsFindingPartner(false);
    });

    newSocket.on('receiveMessage', ({ senderId, message: receivedMessage }: { senderId: string, message: string }) => {
        addMessage(receivedMessage, 'partner');
    });

    newSocket.on('partnerLeft', () => {
        addMessage('Your partner has disconnected.', 'system');
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
        console.log("ChatPage: Disconnected from socket server. Reason:", reason);
        if (reason === 'io server disconnect') {
            // newSocket.connect(); // Reconnection is often handled automatically by Socket.IO client
        }
    });

    newSocket.on('connect_error', (err) => {
        console.error("ChatPage: Socket connection error:", err.message);
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
    fetchPickerEmojis();


    return () => {
      if (newSocket && newSocket.connected && roomId && hasSentTypingStartRef.current) {
        newSocket.emit('typing_stop', { roomId });
      }
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
  }, [addMessage, toast, interests, setPartnerInterests, setIsFindingPartner, setIsPartnerConnected, setRoomId, setPickerEmojiFilenames, setEmojisLoading, roomId]);

  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
  }, [newMessage, socket, roomId, isPartnerConnected, addMessage, stopLocalTyping, setNewMessage]);

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


  const handleFindOrDisconnectPartner = useCallback(() => {
    if (!socket) {
        toast({ title: "Not Connected", description: "Not connected to the chat server.", variant: "destructive" });
        return;
    }

    if (isPartnerConnected) { 
        socket.emit('leaveChat', { roomId });
        setIsPartnerConnected(false);
        setRoomId(null);
        setPartnerInterests([]);
        setIsPartnerTyping(false); 
        addMessage('You have disconnected. Searching for a new partner...', 'system');
        setIsFindingPartner(true);
        socket.emit('findPartner', { chatType: 'text', interests });
    } else if (isFindingPartner) { 
        setIsFindingPartner(false);
        // System message "Stopped searching..." handled by other useEffect
    } else { 
        setIsFindingPartner(true);
        socket.emit('findPartner', { chatType: 'text', interests });
    }
  }, [socket, isPartnerConnected, isFindingPartner, roomId, interests, toast, addMessage, setIsFindingPartner, setIsPartnerConnected, setRoomId, setPartnerInterests]);

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
          <div
            className={cn(
              "flex-grow overflow-y-auto",
              effectivePageTheme === 'theme-7' ? 'border p-2 bg-white bg-opacity-20 dark:bg-gray-700 dark:bg-opacity-20' : 'sunken-panel tree-view p-1'
            )}
          >
            <div> {/* Container for messages */}
              {messages.map((msg, index) => (
                <Row key={msg.id} message={msg} theme={effectivePageTheme} previousMessageSender={index > 0 ? messages[index-1]?.sender : undefined} pickerEmojiFilenames={pickerEmojiFilenames} />
              ))}
              <div ref={messagesEndRef} />
            </div>
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
                disabled={!socket || (!isFindingPartner && !isPartnerConnected && !socket?.connected)}
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

export default ChatPageClientContent;
