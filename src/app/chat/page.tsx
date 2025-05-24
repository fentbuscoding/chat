
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
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
  const { theme } = useTheme();

  const chatType = useMemo(() => searchParams.get('type') as 'text' | 'video' || 'text', [searchParams]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | undefined>(undefined);

  const listRef = useRef<List>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { width: chatContainerWidth, height: chatContainerHeight } = useElementSize(chatContainerRef);
  const itemHeight = 50; // Approximate height for a message row

  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      const newMessageItem = { id: Date.now().toString(), text, sender, timestamp: new Date() };
       if (sender === 'system') {
        // Remove previous system messages about connection status
        const filteredMessages = prevMessages.filter(msg =>
          !(msg.sender === 'system' && (msg.text.includes('Connected with a partner') || msg.text.includes('Searching for a partner...') || msg.text.includes('No partner found') || msg.text.includes('You have disconnected') || msg.text.includes('Not connected. Try finding a new partner.')))
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

 const cleanupConnections = useCallback(() => {
    console.log("ChatPage: Cleanup connections called");
    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
}, []);


  useEffect(() => {
    let didCancel = false;
    const getInitialCameraStream = async () => {
      if (chatType === 'video' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
        if (hasCameraPermission === undefined) {
          console.log("ChatPage: Attempting to get initial user media for video chat (if applicable).");
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (!didCancel) {
              console.log("ChatPage: Initial camera access granted (video chat).");
              setHasCameraPermission(true);
              localStreamRef.current = stream;
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
              }
            } else {
              console.log("ChatPage: Camera access granted but component unmounted/effect cancelled, stopping tracks.");
              stream.getTracks().forEach(track => track.stop());
            }
          } catch (error) {
            if (!didCancel) {
              console.error('ChatPage: Error accessing camera initially (video chat):', error);
              setHasCameraPermission(false);
               toast({
                variant: 'destructive',
                title: 'Camera Access Denied',
                description: 'Please enable camera permissions in your browser settings to use this app.',
              });
            }
          }
        } else if (hasCameraPermission === true && localStreamRef.current && localVideoRef.current && !localVideoRef.current.srcObject) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      } else if (chatType !== 'video' && localStreamRef.current) {
        if (!didCancel) {
            console.log("ChatPage: Chat type is text or unmounting video, cleaning up local stream.");
            cleanupConnections();
            if (!didCancel) setHasCameraPermission(undefined);
        }
      } else if (chatType === 'video' && typeof navigator.mediaDevices?.getUserMedia !== 'function' && !didCancel){
         setHasCameraPermission(false);
         toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Camera access (getUserMedia) is not supported by your browser.'});
      }
    };

    getInitialCameraStream();

    return () => {
      didCancel = true;
      console.log("ChatPage: Cleanup for initial camera stream effect.");
       if (localStreamRef.current) {
          console.log("ChatPage: Cleaning up local stream on effect unmount.");
          cleanupConnections();
       }
    };
  }, [chatType, hasCameraPermission, toast, cleanupConnections]);

 useEffect(() => {
    if (isPartnerConnected) {
      addMessage('Connected with a partner. You can start chatting!', 'system');
    } else if (isFindingPartner) {
      addMessage('Searching for a partner...', 'system');
    } else if (!isFindingPartner && !isPartnerConnected && !messages.some(m => m.text.includes('You have disconnected'))) {
      // Show "Not connected" only if "You have disconnected" wasn't the last system message
      // addMessage('Not connected. Try finding a new partner.', 'system');
    }
  }, [isPartnerConnected, isFindingPartner, addMessage, messages]);


  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim()) return;
    if (!isPartnerConnected) {
        toast({title: "Not Connected", description: "You must be connected to a partner to send messages.", variant: "default"});
        return;
    }
    addMessage(newMessage, 'me');
    // Simulate partner reply
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

      if (chatType === 'video') {
        if (hasCameraPermission === false) {
          toast({ title: "Camera Required", description: "Camera permission is required to find a video chat partner.", variant: "destructive"});
          return;
        }
        if (hasCameraPermission === undefined) {
          toast({ title: "Camera Initializing", description: "Please wait for camera access before finding a partner.", variant: "default"});
          return;
        }
      }

      setIsFindingPartner(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const found = Math.random() > 0.3; 

      if (found) {
        setIsPartnerConnected(true);
      } else {
        addMessage('No partner found at the moment. Try again later.', 'system');
        setIsPartnerConnected(false);
      }
      setIsFindingPartner(false);
    }
  }, [isPartnerConnected, isFindingPartner, toast, chatType, hasCameraPermission, addMessage]);


  const chatWindowStyle = useMemo(() => (
    { width: '600px', height: '600px' }
  ), []);

  const inputAreaHeight = 60;
  const scrollableChatHeight = chatContainerHeight > 0 ? chatContainerHeight - inputAreaHeight : 0;

  const itemData = useMemo(() => ({ messages, theme }), [messages, theme]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto">
      <div
        className={cn('window flex flex-col', theme === 'theme-7' ? 'active glass' : '', 'mb-4')}
        style={chatWindowStyle}
      >
        <div className={cn("title-bar", 'flex-shrink-0')}>
          <div className="title-bar-text">Text Chat</div>
        </div>
        <div
          ref={chatContainerRef}
          className={cn(
            'window-body window-body-content flex-grow',
            theme === 'theme-98' ? 'p-0.5' : (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'glass-body-padding' : 'has-space') : 'p-2')
          )}
        >
          <div
            className={cn(
              "flex-grow",
              theme === 'theme-98' ? 'sunken-panel tree-view p-1' : 'border p-2 bg-white bg-opacity-80 dark:bg-gray-700 dark:bg-opacity-80'
            )}
            style={{ height: scrollableChatHeight > 0 ? `${scrollableChatHeight}px` : '100%' }}
          >
            {scrollableChatHeight > 0 && chatContainerWidth > 0 ? (
              <List
                ref={listRef}
                height={scrollableChatHeight}
                itemCount={messages.length}
                itemSize={itemHeight}
                width={chatContainerWidth}
                itemData={itemData}
                className="scroll-area-viewport"
              >
                {Row}
              </List>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">Loading messages...</p>
              </div>
            )}
          </div>
           <div
            className={cn(
              "p-2 flex-shrink-0",
              theme === 'theme-98' ? 'input-area status-bar' : (theme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : '')
            )}
            style={{ height: `${inputAreaHeight}px` }}
          >
            <div className="flex items-center w-full">
              <Button
                onClick={handleToggleConnection}
                disabled={isFindingPartner || (chatType === 'video' && (hasCameraPermission === undefined || hasCameraPermission === false))}
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
      </div>
    </div>
  );
};

export default ChatPage;

