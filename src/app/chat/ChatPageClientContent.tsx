
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
// Alert components are not used, can be removed if confirmed
// import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
// Removed: import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';
// Removed: import useElementSize from '@charlietango/use-element-size';

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: Date;
}

// Simplified Row component for direct mapping
const Row = React.memo(({ message, theme }: { message: Message, theme: string }) => {
  const msg = message;
  const currentTheme = theme;
  return (
    <li
      // key is applied in the .map() call
      className={cn(
        "flex mb-1",
        msg.sender === "me" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "rounded-lg px-3 py-1 max-w-xs lg:max-w-md break-words",
          msg.sender === "me"
            ? currentTheme === 'theme-98' ? 'bg-blue-500 text-white px-1' : 'bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100'
            : currentTheme === 'theme-98' ? 'bg-gray-300 px-1' : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100',
          msg.sender === 'system' ? 'text-center w-full text-gray-500 dark:text-gray-400 italic text-xs' : ''
        )}
      >
        {msg.text}
      </div>
      {msg.sender !== "system" && (
        <span className={cn("text-xxs ml-1 self-end", currentTheme === 'theme-98' ? 'text-gray-700' : 'text-gray-400 dark:text-gray-500')}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </li>
  );
});
Row.displayName = 'Row';


const ChatPageClientContent: React.FC = () => {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';
  // chatType is derived from searchParams, which should only be accessed client-side
  const chatType = useMemo(() => {
    if (!isMounted) return 'text'; // Default or placeholder for SSR/pre-mount
    return searchParams.get('type') as 'text' | 'video' || 'text';
  }, [searchParams, isMounted]);


  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Removed: listRef, chatContainerRef (for sizing), chatContainerWidth, chatContainerHeight, itemHeight

  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      const newMessageItem = { id: Date.now().toString(), text, sender, timestamp: new Date() };
       if (sender === 'system') {
        const filteredMessages = prevMessages.filter(msg =>
          !(msg.sender === 'system' && (
            msg.text.includes('Connected with a partner') ||
            msg.text.includes('Searching for a partner...') ||
            msg.text.includes('No partner found') ||
            msg.text.includes('You have disconnected')
          ))
        );
        return [...filteredMessages, newMessageItem];
      }
      return [...prevMessages, newMessageItem];
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const prevIsPartnerConnected = useRef(isPartnerConnected);
  const prevIsFindingPartner = useRef(isFindingPartner);

  useEffect(() => {
    if (isPartnerConnected && !prevIsPartnerConnected.current) {
      addMessage('Connected with a partner. You can start chatting!', 'system');
    } else if (isFindingPartner && !prevIsFindingPartner.current) {
      addMessage('Searching for a partner...', 'system');
    }
    prevIsPartnerConnected.current = isPartnerConnected;
    prevIsFindingPartner.current = isFindingPartner;
  }, [isPartnerConnected, isFindingPartner, addMessage]);


  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim()) return;
    if (!isPartnerConnected) {
        toast({title: "Not Connected", description: "You must be connected to a partner to send messages.", variant: "default"});
        return;
    }
    addMessage(newMessage, 'me');
    // Simulate partner response
    setTimeout(() => {
        addMessage(`Partner: ${newMessage}`, 'partner');
    }, 1000);
    setNewMessage('');
  }, [newMessage, isPartnerConnected, toast, addMessage]);

  const handleToggleConnection = useCallback(async () => {
    if (isPartnerConnected) {
      addMessage('You have disconnected from the partner.', 'system');
      setIsPartnerConnected(false);
      setIsFindingPartner(false);
    } else {
      if (isFindingPartner) return;
      setIsFindingPartner(true);
      // "Searching for partner" message will be added by the useEffect above
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate search
      const found = Math.random() > 0.3; // Simulate finding a partner
      if (found) {
        setIsPartnerConnected(true);
         // "Connected with partner" message will be added by the useEffect above
      } else {
        addMessage('No partner found at the moment. Try again later.', 'system');
        setIsPartnerConnected(false);
      }
      setIsFindingPartner(false);
    }
  }, [isPartnerConnected, isFindingPartner, addMessage]);

  const chatWindowStyle = useMemo(() => (
    { width: '600px', height: '600px' } // Fixed size for the overall chat window
  ), []);

  const inputAreaHeight = 60; // Fixed height for the input area

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto">
      <div
        className={cn(
          'window flex flex-col relative', // Ensure this is relative for the goldfish
          effectivePageTheme === 'theme-7' ? 'active glass' : '',
          'mb-4'
        )}
        style={chatWindowStyle}
      >
        <div className={cn("title-bar", 'flex-shrink-0', effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
          <div className="title-bar-text">Text Chat</div>
        </div>
        <div
          // This ref was for useElementSize, can be removed if not used for other purposes
          // ref={chatContainerRef} 
          className={cn(
            'window-body window-body-content flex-grow', // window-body-content handles flex direction
            effectivePageTheme === 'theme-98' ? 'p-0.5' : (effectivePageTheme === 'theme-7' ? (cn(effectivePageTheme === 'theme-7' ? 'glass' : '').includes('glass') ? 'glass-body-padding' : 'has-space') : 'p-2')
          )}
        >
          {/* Message list area - flex-grow makes it take available space */}
          <div
            className={cn(
              "flex-grow overflow-y-auto", // Added overflow-y-auto here
              effectivePageTheme === 'theme-98' ? 'sunken-panel tree-view p-1' : 'border p-2 bg-white bg-opacity-80 dark:bg-gray-700 dark:bg-opacity-80'
            )}
            // Height will be determined by flex-grow
          >
            {isMounted ? (
              <ul className="p-2"> {/* Added some padding to the ul */}
                {messages.map((msg) => (
                  <Row key={msg.id} message={msg} theme={effectivePageTheme} />
                ))}
                <div ref={messagesEndRef} /> {/* For scrolling to bottom */}
              </ul>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className={cn(effectivePageTheme === 'theme-7' ? 'text-black' : 'text-gray-500 dark:text-gray-400')}>
                  Loading messages...
                </p>
              </div>
            )}
          </div>
           {/* Input area */}
           <div
            className={cn(
              "p-2 flex-shrink-0", // flex-shrink-0 prevents it from shrinking
              effectivePageTheme === 'theme-98' ? 'input-area status-bar' : (effectivePageTheme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : '')
            )}
            style={{ height: `${inputAreaHeight}px` }}
          >
            <div className="flex items-center w-full">
              <Button
                onClick={handleToggleConnection}
                disabled={isFindingPartner}
                className="px-1 mr-1"
              >
                {isFindingPartner ? 'Searching...' : (isPartnerConnected ? 'Disconnect' : 'Find Partner')}
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
                className="px-1 ml-1"
              >
                Send
              </Button>
            </div>
          </div>
        </div>
        <img
          src="https://github.com/ekansh28/files/blob/main/goldfish.png?raw=true"
          alt="Decorative Goldfish"
          className="absolute top-[-60px] right-4 w-[150px] h-[150px] object-contain pointer-events-none select-none z-20"
          data-ai-hint="goldfish decoration"
        />
      </div>
    </div>
  );
};

export default ChatPageClientContent;
