
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';
import useElementSize from '@charlietango/use-element-size';

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: Date;
}

const Row = React.memo(({ index, style, data }: ListChildComponentProps<{ messages: Message[], theme: string }>) => {
  const msg = data.messages[index];
  const currentTheme = data.theme;
  return (
    <li
      key={msg.id}
      className={cn(
        "flex mb-1",
        msg.sender === "me" ? "justify-end" : "justify-start"
      )}
      style={style}
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

const ChatPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentTheme } = useTheme(); // Use currentTheme from the updated provider
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // This effectivePageTheme is used for styling components on this page
  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';

  const chatType = useMemo(() => searchParams.get('type') as 'text' | 'video' || 'text', [searchParams]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);

  // Refs for text chat are simpler as no video elements are involved
  const listRef = useRef<List>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null); // For ScrollArea content, or List container
  const { width: chatContainerWidth, height: chatContainerHeight } = useElementSize(chatContainerRef);
  const itemHeight = 50; // Approximate height for a message row

  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      const newMessageItem = { id: Date.now().toString(), text, sender, timestamp: new Date() };
       if (sender === 'system') {
        const filteredMessages = prevMessages.filter(msg =>
          !(msg.sender === 'system' && (msg.text.includes('Connected with a partner') || msg.text.includes('Searching for a partner...') || msg.text.includes('No partner found') || msg.text.includes('You have disconnected') || msg.text.includes('Not connected.')))
        );
        return [...filteredMessages, newMessageItem];
      }
      return [...prevMessages, newMessageItem];
    });
  }, []);

  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollToItem(messages.length - 1, "end");
    }
  }, [messages]);


 useEffect(() => {
    if (isPartnerConnected) {
      addMessage('Connected with a partner. You can start chatting!', 'system');
    } else if (isFindingPartner) {
      addMessage('Searching for a partner...', 'system');
    } else if (!isFindingPartner && !isPartnerConnected && messages.some(m => m.sender === 'system' && m.text.includes('You have disconnected'))){
       // This condition ensures "Not connected" message is shown only after a disconnection and not initially or after "No partner found".
      addMessage('Not connected. Try finding a new partner.', 'system');
    }
  }, [isPartnerConnected, isFindingPartner, addMessage, messages]);


  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim()) return;
    if (!isPartnerConnected) {
        toast({title: "Not Connected", description: "You must be connected to a partner to send messages.", variant: "default"});
        return;
    }
    addMessage(newMessage, 'me');
    // Simulate partner reply for non-WebSocket version
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
      if (isFindingPartner) return; // Already searching

      // No camera check needed for text chat

      setIsFindingPartner(true);
      // Simulate finding partner
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate delay

      const found = Math.random() > 0.3; // Simulate 70% chance of finding partner

      if (found) {
        setIsPartnerConnected(true);
      } else {
        addMessage('No partner found at the moment. Try again later.', 'system');
        setIsPartnerConnected(false);
      }
      setIsFindingPartner(false);
    }
  }, [isPartnerConnected, isFindingPartner, toast, addMessage]);


  const chatWindowStyle = useMemo(() => (
    // Apply fixed size to the chat window for text chat
    { width: '600px', height: '600px' }
  ), []);

  const inputAreaHeight = 60; // Height of the input bar
  // Calculate the height for the scrollable chat message area
  const scrollableChatHeight = chatContainerHeight > 0 ? chatContainerHeight - inputAreaHeight : 0;

  const itemData = useMemo(() => ({ messages, theme: effectivePageTheme }), [messages, effectivePageTheme]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto">
      <div
        className={cn('window flex flex-col relative', effectivePageTheme === 'theme-7' ? 'active glass' : '', 'mb-4')}
        style={chatWindowStyle} // Apply the fixed size
      >
        <div className={cn("title-bar", 'flex-shrink-0', effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
          <div className="title-bar-text">Text Chat</div>
        </div>
        <div
          ref={chatContainerRef} // Ref for the entire window body to measure its height for list calculation
          className={cn(
            'window-body window-body-content flex-grow', // flex-grow needed for the window body itself
            effectivePageTheme === 'theme-98' ? 'p-0.5' : (effectivePageTheme === 'theme-7' ? (cn(effectivePageTheme === 'theme-7' ? 'glass' : '').includes('glass') ? 'glass-body-padding' : 'has-space') : 'p-2')
          )}
        >
          {/* This div is for the scrollable message list */}
          <div
            className={cn(
              "flex-grow", // This inner div takes up space for messages
              effectivePageTheme === 'theme-98' ? 'sunken-panel tree-view p-1' : 'border p-2 bg-white bg-opacity-80 dark:bg-gray-700 dark:bg-opacity-80'
            )}
            style={{ height: scrollableChatHeight > 0 ? `${scrollableChatHeight}px` : '100%' }} // Set calculated height
          >
            {scrollableChatHeight > 0 && chatContainerWidth > 0 ? (
              <List
                ref={listRef}
                height={scrollableChatHeight} // Use the calculated height for the list
                itemCount={messages.length}
                itemSize={itemHeight} // Use fixed item height
                width={chatContainerWidth} // Use measured width of the container
                itemData={itemData} // Pass messages and theme as itemData
                className="scroll-area-viewport" // Important for ScrollArea styling if used, or general list styling
              >
                {Row}
              </List>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className={cn(effectivePageTheme === 'theme-7' ? 'text-black' : 'text-gray-500 dark:text-gray-400')}>
                  Loading messages...
                </p>
              </div>
            )}
          </div>
           {/* Input Area */}
           <div
            className={cn(
              "p-2 flex-shrink-0", // flex-shrink-0 prevents this area from shrinking
              effectivePageTheme === 'theme-98' ? 'input-area status-bar' : (effectivePageTheme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : '')
            )}
            style={{ height: `${inputAreaHeight}px` }} // Fixed height for the input bar
          >
            <div className="flex items-center w-full">
              <Button
                onClick={handleToggleConnection}
                disabled={isFindingPartner} // No camera check for text chat
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

export default ChatPage;
