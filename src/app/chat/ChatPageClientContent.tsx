
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

// Constants for Emojis
const EMOJI_BASE_URL_DISPLAY = "https://storage.googleapis.com/chat_emoticons/display_98/";
const EMOJI_BASE_URL_PICKER = "https://storage.googleapis.com/chat_emoticons/emotes_98/";
const EMOJI_FILENAMES = [
  'angel.png', 'bigsmile.png', 'burp.png', 'cool.png', 'crossedlips.png',
  'cry.png', 'embarrassed.png', 'kiss.png', 'moneymouth.png', 'sad.png',
  'scream.png', 'smile.png', 'think.png', 'tongue.png', 'wink.png', 'yell.png'
];
const SMILE_EMOJI_FILENAME = 'smile.png'; // Default icon

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: Date;
}

interface RowProps {
  message: Message;
  theme: string;
  previousMessageSender?: Message['sender'];
}

const Row = React.memo(({ message, theme, previousMessageSender }: RowProps) => {
  if (message.sender === 'system') {
    return (
      <div className="mb-2">
        <div className={cn(
          "text-center w-full text-gray-500 dark:text-gray-400 italic text-xs",
          theme === 'theme-7' && 'theme-7-text-shadow'
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

  return (
    <div className="mb-2"> {/* Increased bottom margin for spacing */}
      {showDivider && (
        <div
          className="h-[2px] mb-1 border border-[#CEDCE5] bg-[#64B2CF]"
          aria-hidden="true"
        ></div>
      )}
      <div className="break-words">
        {message.sender === 'me' && (
          <>
            <span className="text-blue-600 font-bold mr-1">You:</span>
            <span className={cn(theme === 'theme-7' && 'theme-7-text-shadow')}>{message.text}</span>
          </>
        )}
        {message.sender === 'partner' && (
          <>
            <span className="text-red-600 font-bold mr-1">Stranger:</span>
            <span className={cn(theme === 'theme-7' && 'theme-7-text-shadow')}>{message.text}</span>
          </>
        )}
      </div>
    </div>
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
  const prevRoomIdRef = useRef<string | null>(null);

  // Emoji Feature State
  const [currentEmojiIconUrl, setCurrentEmojiIconUrl] = useState(() => `${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const hoverIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);


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
    prevRoomIdRef.current = roomId;
  }, [isFindingPartner, isPartnerConnected, addMessage, interests, partnerInterests]);


  useEffect(() => {
    setIsMounted(true);
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) {
        console.error("Socket server URL is not defined.");
        toast({ title: "Configuration Error", description: "Socket server URL is missing.", variant: "destructive" });
        return;
    }
    const newSocket = io(socketServerUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'] 
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
        if (!isFindingPartner && !isPartnerConnected) { 
             setIsFindingPartner(true); 
        }
    });

    newSocket.on('receiveMessage', ({ senderId, message: receivedMessage }: { senderId: string, message: string }) => {
        addMessage(receivedMessage, 'partner');
    });

    newSocket.on('partnerLeft', () => {
        addMessage('Your partner has disconnected.', 'system');
        setIsPartnerConnected(false);
        setRoomId(null);
        setPartnerInterests([]);
    });
    
    newSocket.on('disconnect', (reason) => {
        console.log("ChatPage: Disconnected from socket server. Reason:", reason);
        if (reason === 'io server disconnect') { 
            newSocket.connect();
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

    return () => {
      if (newSocket.connected && roomId) {
        newSocket.emit('leaveChat', { roomId });
      }
      newSocket.disconnect();
      if (hoverIntervalRef.current) {
        clearInterval(hoverIntervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim() || !socket || !roomId || !isPartnerConnected) return;
    
    socket.emit('sendMessage', { roomId, message: newMessage });
    addMessage(newMessage, 'me');
    setNewMessage('');
  }, [newMessage, socket, roomId, isPartnerConnected, addMessage]);

  const handleFindOrDisconnectPartner = useCallback(() => {
    if (!socket) {
        toast({ title: "Not Connected", description: "Not connected to the chat server.", variant: "destructive" });
        return;
    }

    if (isPartnerConnected) { // User clicks "Disconnect"
        socket.emit('leaveChat', { roomId });
        setIsPartnerConnected(false);
        setRoomId(null);
        setPartnerInterests([]); 
        setMessages(prev => prev.filter(msg =>
          !(msg.sender === 'system' &&
            (msg.text.toLowerCase().includes('connected with a partner') ||
             msg.text.toLowerCase().includes('you both like')))
        ));
        setIsFindingPartner(true); 
        socket.emit('findPartner', { chatType: 'text', interests });
    } else if (isFindingPartner) { // User clicks "Stop Searching"
        socket.emit('leaveChat', { roomId: null }); 
        setIsFindingPartner(false);
        setMessages(prev => prev.filter(msg => !(msg.sender === 'system' && msg.text.toLowerCase().includes('searching for a partner'))));
        addMessage('Stopped searching for a partner.', 'system');
    } else { // User clicks "Find Partner"
        setIsFindingPartner(true);
        socket.emit('findPartner', { chatType: 'text', interests });
    }
  }, [socket, isPartnerConnected, isFindingPartner, roomId, interests, toast, addMessage]);

  // Emoji Feature Logic
  const handleEmojiIconHover = () => {
    if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current);
    hoverIntervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * EMOJI_FILENAMES.length);
      setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${EMOJI_FILENAMES[randomIndex]}`);
    }, 300); // Change emoji every 300ms
  };

  const stopEmojiCycle = () => {
    if (hoverIntervalRef.current) {
      clearInterval(hoverIntervalRef.current);
      hoverIntervalRef.current = null;
    }
    setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`); // Reset to default
  };

  const toggleEmojiPicker = () => {
    setIsEmojiPickerOpen(prev => !prev);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
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

  const inputAreaHeight = 60;

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
            style={{ height: `calc(100% - ${inputAreaHeight}px)` }}
          >
            <div> {/* Container for messages */}
              {messages.map((msg, index) => (
                <Row key={msg.id} message={msg} theme={effectivePageTheme} previousMessageSender={index > 0 ? messages[index-1]?.sender : undefined} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div
            className={cn(
              "p-2 flex-shrink-0",
              effectivePageTheme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : 'input-area status-bar'
            )}
            style={{ height: `${inputAreaHeight}px` }}
          >
            <div className="flex items-center w-full">
              <Button
                onClick={handleFindOrDisconnectPartner}
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
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 w-full px-1 py-1"
                disabled={!isPartnerConnected || isFindingPartner}
              />
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
              {/* Emoji Icon and Picker - Only for theme-98 */}
              {effectivePageTheme === 'theme-98' && (
                <div className="relative ml-1 flex-shrink-0"> {/* Added flex-shrink-0 */}
                  <img
                    src={currentEmojiIconUrl}
                    alt="Emoji"
                    className="w-6 h-6 cursor-pointer inline-block" // Added inline-block
                    onMouseEnter={handleEmojiIconHover}
                    onMouseLeave={stopEmojiCycle}
                    onClick={toggleEmojiPicker}
                    data-ai-hint="emoji icon"
                  />
                  {isEmojiPickerOpen && (
                    <div
                      ref={emojiPickerRef}
                      className="absolute bottom-full right-0 mb-2 w-48 h-auto p-2 bg-silver border border-raised grid grid-cols-4 gap-1 z-30 window"
                      style={{ boxShadow: 'inset 1px 1px #fff, inset -1px -1px gray, 1px 1px gray' }}
                    >
                      {EMOJI_FILENAMES.map((filename) => (
                        <img
                          key={filename}
                          src={`${EMOJI_BASE_URL_PICKER}${filename}`}
                          alt={filename.split('.')[0]}
                          className="w-8 h-8 cursor-pointer hover:bg-navy hover:p-0.5"
                          onClick={() => {
                            setNewMessage(prev => prev + ` :${filename.split('.')[0]}: `); // Placeholder for actual emoji insertion
                            // setIsEmojiPickerOpen(false); // Optionally close picker on selection
                          }}
                          data-ai-hint="emoji symbol"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {effectivePageTheme === 'theme-7' && (
          <img
            src="https://github.com/ekansh28/files/blob/main/goldfish.png?raw=true"
            alt="Decorative Goldfish"
            className="absolute top-[-60px] right-4 w-[150px] h-[150px] object-contain pointer-events-none select-none z-20"
            data-ai-hint="goldfish decoration"
          />
        )}
      </div>
    </div>
  );
};

export default ChatPageClientContent;
