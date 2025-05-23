
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
import { DraggableWindow } from '@/components/draggable-window';
import { useIsMobile } from '@/hooks/use-mobile';

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


const VideoChatPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { theme } = useTheme();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | undefined>(undefined);

  const listRef = useRef<List>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null); // Ref for the List's direct scrollable parent in Chat DraggableWindow
  const { width: chatContainerWidth, height: chatContainerHeight } = useElementSize(chatContainerRef);
  const itemHeight = 50;

  const isMobile = useIsMobile();
  const boundaryRef = useRef<HTMLDivElement>(null);
  const { width: boundaryWidth, height: boundaryHeight } = useElementSize(boundaryRef);
  const [initialLayoutReady, setInitialLayoutReady] = useState(false);

  useEffect(() => {
    if (typeof isMobile !== 'undefined' && boundaryWidth > 0 && boundaryHeight > 0) {
      setInitialLayoutReady(true);
    } else if (typeof isMobile !== 'undefined' && !isMobile) { // Desktop, ready even if boundary is 0 initially
      setInitialLayoutReady(true);
    }
  }, [isMobile, boundaryWidth, boundaryHeight]);


  const localVideoInitialSize = useMemo(() => {
    if (isMobile && boundaryWidth > 0) {
      const w = boundaryWidth * 0.9;
      return { width: Math.round(w), height: Math.round(w * (9 / 16)) };
    }
    return { width: 240, height: 180 };
  }, [isMobile, boundaryWidth]);

  const remoteVideoInitialSize = useMemo(() => {
    if (isMobile && boundaryWidth > 0) {
      const w = boundaryWidth * 0.9;
      return { width: Math.round(w), height: Math.round(w * (9 / 16)) };
    }
    return { width: 240, height: 180 };
  }, [isMobile, boundaryWidth]);

  const chatWindowInitialSize = useMemo(() => {
    if (isMobile && boundaryWidth > 0) {
      return { width: Math.round(boundaryWidth * 0.95), height: 300 };
    }
    return { width: 500, height: 500 };
  }, [isMobile, boundaryWidth]);

  const localVideoInitialPos = useMemo(() => {
    if (isMobile && boundaryWidth > 0 && localVideoInitialSize.width > 0) {
      return { x: Math.max(0, Math.round((boundaryWidth - localVideoInitialSize.width) / 2)), y: 10 };
    }
    return { x: 50, y: 50 };
  }, [isMobile, boundaryWidth, localVideoInitialSize.width]);

  const remoteVideoInitialPos = useMemo(() => {
    if (isMobile && boundaryWidth > 0 && remoteVideoInitialSize.width > 0 && localVideoInitialSize.height > 0) {
      return { x: Math.max(0, Math.round((boundaryWidth - remoteVideoInitialSize.width) / 2)), y: localVideoInitialSize.height + 20 };
    }
    return { x: 50 + 240 + 20, y: 50 }; // localX + localW + gap
  }, [isMobile, boundaryWidth, remoteVideoInitialSize.width, localVideoInitialSize.height]);

  const chatInitialPos = useMemo(() => {
    if (isMobile && boundaryWidth > 0 && chatWindowInitialSize.width > 0 && localVideoInitialSize.height > 0 && remoteVideoInitialSize.height > 0) {
      return { x: Math.max(0, Math.round((boundaryWidth - chatWindowInitialSize.width) / 2)), y: localVideoInitialSize.height + remoteVideoInitialSize.height + 30 };
    }
    return { x: 50, y: 50 + 180 + 20 }; // localY + localH + gap
  }, [isMobile, boundaryWidth, chatWindowInitialSize.width, localVideoInitialSize.height, remoteVideoInitialSize.height]);

  const videoMinSize = useMemo(() => {
    if (isMobile && boundaryWidth > 0) {
        const minWidth = Math.max(100, Math.round(boundaryWidth * 0.4));
        return { width: minWidth, height: Math.round(minWidth * (9/16)) };
    }
    return { width: 160, height: 120 };
  }, [isMobile, boundaryWidth]);

  const chatMinSize = useMemo(() => {
      if (isMobile && boundaryWidth > 0) {
          return { width: Math.max(150, Math.round(boundaryWidth * 0.8)), height: 150 };
      }
      return { width: 250, height: 200 };
  }, [isMobile, boundaryWidth]);


  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      const newMessageItem = { id: Date.now().toString(), text, sender, timestamp: new Date() };
       if (sender === 'system') {
        const filteredMessages = prevMessages.filter(msg =>
          !(msg.sender === 'system' && (msg.text.includes('Connected with a partner') || msg.text.includes('Searching for a partner...') || msg.text.includes('No partner found') || msg.text.includes('You have disconnected') || msg.text.includes('Not connected.'))) // Removed "Try finding a new partner."
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

 const cleanupConnections = useCallback((stopLocalStream = true) => {
    console.log("VideoChatPage: Cleanup connections called. Stop local stream:", stopLocalStream);
    if (stopLocalStream && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        console.log("VideoChatPage: Local stream stopped and cleared.");
    }
     if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);


  useEffect(() => {
    let didCancel = false;
    const getInitialCameraStream = async () => {
      if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        if (!didCancel) {
            setHasCameraPermission(false);
            toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Camera access (getUserMedia) is not supported by your browser.'});
        }
        return;
      }

      if (hasCameraPermission === undefined) {
        console.log("VideoChatPage: Attempting to get initial user media for video chat.");
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          if (!didCancel) {
            console.log("VideoChatPage: Initial camera access granted.");
            setHasCameraPermission(true);
            localStreamRef.current = stream;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
          } else {
            console.log("VideoChatPage: Camera access granted but component unmounted/effect cancelled, stopping tracks.");
            stream.getTracks().forEach(track => track.stop());
          }
        } catch (error) {
          if (!didCancel) {
            console.error('VideoChatPage: Error accessing camera initially:', error);
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
    };

    getInitialCameraStream();

    return () => {
      didCancel = true;
      console.log("VideoChatPage: Cleanup for initial camera stream effect.");
      cleanupConnections(true);
    };
  }, [hasCameraPermission, toast, cleanupConnections]); // Added cleanupConnections as it's stable

   useEffect(() => {
    if (isPartnerConnected) {
      addMessage('Connected with a partner. You can start chatting!', 'system');
    } else if (isFindingPartner) {
      addMessage('Searching for a partner...', 'system');
    } else if (!isFindingPartner && messages.length > 0 && !messages.some(m => m.sender === 'system' && (m.text.includes('You have disconnected') || m.text.includes('Connected with a partner') || m.text.includes('Searching for a partner...')))) {
      // addMessage('Not connected.', 'system');
    }
  }, [isPartnerConnected, isFindingPartner, addMessage, messages]);


  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim()) return;
     if (!isPartnerConnected) {
        toast({title: "Not Connected", description: "You must be connected to a partner to send messages.", variant: "default"});
        return;
    }
    addMessage(newMessage, 'me');
    setTimeout(() => {
        addMessage(`Partner: ${newMessage}`, 'partner');
    }, 1000);
    setNewMessage('');
  }, [newMessage, addMessage, toast, isPartnerConnected]);


  const handleToggleConnection = useCallback(async () => {
    if (isPartnerConnected) {
      addMessage('You have disconnected from the partner.', 'system');
      setIsPartnerConnected(false);
      setIsFindingPartner(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null; // Clear remote video on disconnect
    } else {
      if (isFindingPartner) return;

      if (hasCameraPermission === false) {
        toast({ title: "Camera Required", description: "Camera permission is required to find a video chat partner.", variant: "destructive"});
        return;
      }
      if (hasCameraPermission === undefined) {
         toast({ title: "Camera Initializing", description: "Please wait for camera access before finding a partner.", variant: "default"});
        return;
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
  }, [isPartnerConnected, isFindingPartner, toast, hasCameraPermission, addMessage]);

  const inputAreaHeight = 60;
  const scrollableChatHeight = chatContainerHeight > 0 ? chatContainerHeight - inputAreaHeight : 0;
  const itemData = useMemo(() => ({ messages, theme }), [messages, theme]);


  return (
    <div ref={boundaryRef} className="w-full h-full p-2 md:p-4 overflow-auto relative">
      {!initialLayoutReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">Loading layout...</p>
        </div>
      )}

      {initialLayoutReady && (
        <>
          <DraggableWindow
            title="Your Video"
            initialPosition={localVideoInitialPos}
            initialSize={localVideoInitialSize}
            minSize={videoMinSize}
            boundaryRef={boundaryRef}
            theme={theme}
            windowClassName={cn(theme === 'theme-7' ? 'glass' : '', theme === 'theme-98' ? 'no-padding-window-body' : '')}
            titleBarClassName="text-sm"
            bodyClassName={cn('overflow-hidden relative', (theme === 'theme-98' || theme === 'theme-7') ? 'p-0' : 'p-0')}
          >
            <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover bg-black" data-ai-hint="local camera video" />
            { hasCameraPermission === false && (
              <Alert variant="destructive" className="m-1 absolute bottom-0 left-0 right-0 text-xs p-1">
                <AlertTitle className="text-xs">Camera Denied</AlertTitle>
              </Alert>
            )}
             { hasCameraPermission === undefined && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">Requesting camera...</p>
                </div>
              )}
          </DraggableWindow>

          <DraggableWindow
            title="Partner's Video"
            initialPosition={remoteVideoInitialPos}
            initialSize={remoteVideoInitialSize}
            minSize={videoMinSize}
            boundaryRef={boundaryRef}
            theme={theme}
            windowClassName={cn(theme === 'theme-7' ? 'glass' : '', theme === 'theme-98' ? 'no-padding-window-body' : '')}
            titleBarClassName="text-sm"
            bodyClassName={cn('overflow-hidden relative', (theme === 'theme-98' || theme === 'theme-7') ? 'p-0' : 'p-0')}
          >
            <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera video" />
            {!isPartnerConnected && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                <p className="text-white text-center p-2 text-sm">Partner video unavailable</p>
                </div>
            )}
          </DraggableWindow>

          <DraggableWindow
            title="Chat"
            initialPosition={chatInitialPos}
            initialSize={chatWindowInitialSize}
            minSize={chatMinSize}
            boundaryRef={boundaryRef}
            theme={theme}
            windowClassName={cn(theme === 'theme-7' ? 'glass' : '')}
            bodyClassName={cn( // This class applies to the window-body
                'window-body-content flex-grow', // Keep window-body-content for flex structure
                theme === 'theme-98' ? 'p-0.5' :
                (theme === 'theme-7' ? (cn(theme === 'theme-7' ? 'glass' : '').includes('glass') ? 'glass-body-padding' : 'has-space') : 'p-2')
            )}
          >
            <div
              ref={chatContainerRef} // This ref is for the List's direct scrollable parent
              className={cn(
                "flex-grow", // This div takes up space for the List
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
                  className="scroll-area-viewport" // from globals.css, ensures 100% w/h
                >
                  {Row}
                </List>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500 dark:text-gray-400">Loading messages...</p>
                </div>
              )}
            </div>
            <div
              className={cn(
                "p-2 flex-shrink-0", // Input area should not grow
                theme === 'theme-98' ? 'input-area status-bar' : (theme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : '')
              )}
              style={{ height: `${inputAreaHeight}px` }}
            >
              <div className="flex items-center w-full">
                 <Button
                  onClick={handleToggleConnection}
                  disabled={isFindingPartner || hasCameraPermission === undefined || hasCameraPermission === false}
                  className="px-2 mr-2"
                >
                  {isFindingPartner ? 'Searching...' : (isPartnerConnected ? 'Disconnect' : 'Find Partner')}
                </Button>
                <Input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 w-full px-2 py-1"
                  disabled={!isPartnerConnected || isFindingPartner}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!isPartnerConnected || isFindingPartner || !newMessage.trim()}
                  className="px-2 ml-2"
                >
                  Send
                </Button>
              </div>
            </div>
          </DraggableWindow>
        </>
      )}
    </div>
  );
};

export default VideoChatPage;
