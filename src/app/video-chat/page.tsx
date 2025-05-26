
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
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


const VideoChatPage: React.FC = () => {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentTheme } = useTheme(); // Use currentTheme from the updated provider
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // This effectivePageTheme is used for styling components on this page
  // It ensures server render (isMounted=false) matches client's initial render if default theme is 'theme-98'
  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';


  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | undefined>(undefined);

  const listRef = useRef<List>(null);
  const chatListContainerRef = useRef<HTMLDivElement>(null);
  const { width: chatListContainerWidth, height: chatListContainerHeight } = useElementSize(chatListContainerRef);
  const itemHeight = 50;

  const addMessage = useCallback((text: string, sender: Message['sender']) => {
    setMessages((prevMessages) => {
      const newMessageItem = { id: Date.now().toString(), text, sender, timestamp: new Date() };
       if (sender === 'system') {
        // Filter out previous system messages about connection state to avoid duplicates
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

 const cleanupConnections = useCallback((stopLocalStream = true) => {
    console.log("VideoChatPage: Cleanup connections called. Stop local stream:", stopLocalStream);
    if (stopLocalStream && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        console.log("VideoChatPage: Local stream stopped and cleared.");
    }
     if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    // No peerConnectionRef to cleanup in this simplified version
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
        // If permission was already granted but stream isn't set (e.g., due to HMR or re-render)
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    };

    getInitialCameraStream();

    return () => {
      didCancel = true;
      console.log("VideoChatPage: Cleanup for initial camera stream effect.");
      // Only stop local stream if it was truly initialized by this component instance
      // This can be tricky with HMR. For now, a simple cleanup.
      cleanupConnections(true); // Stop local stream tracks on unmount
    };
    // Dependencies: hasCameraPermission state, toast for notifications, cleanupConnections memoized callback
  }, [hasCameraPermission, toast, cleanupConnections]);


   useEffect(() => {
    if (isPartnerConnected) {
      addMessage('Connected with a partner. You can start chatting!', 'system');
    } else if (isFindingPartner) {
      addMessage('Searching for a partner...', 'system');
    } else if (!isFindingPartner && !isPartnerConnected && messages.some(m => m.sender === 'system' && m.text.includes('You have disconnected'))){
       // This condition ensures "Not connected" message is shown only after a disconnection
      addMessage('Not connected. Try finding a new partner.', 'system');
    }
    // Only re-run if connection/finding state changes. `addMessage` is memoized. `messages` is used for conditional logic.
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
  }, [newMessage, addMessage, toast, isPartnerConnected]);


  const handleToggleConnection = useCallback(async () => {
    if (isPartnerConnected) {
      // Disconnect logic
      addMessage('You have disconnected from the partner.', 'system');
      setIsPartnerConnected(false);
      setIsFindingPartner(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null; // Clear remote video
    } else {
      // Connect logic
      if (isFindingPartner) return; // Already searching

      // Check camera permission before attempting to find a partner
      if (hasCameraPermission === false) {
        toast({ title: "Camera Required", description: "Camera permission is required to find a video chat partner.", variant: "destructive"});
        return;
      }
      if (hasCameraPermission === undefined) { // Still checking or user hasn't granted yet
         toast({ title: "Camera Initializing", description: "Please wait for camera access before finding a partner.", variant: "default"});
        return;
      }

      setIsFindingPartner(true);
      // Simulate finding partner
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate delay

      const found = Math.random() > 0.3; // Simulate 70% chance of finding partner

      if (found) {
        setIsPartnerConnected(true);
        // In a real app, this is where you'd set up WebRTC and connect streams
      } else {
        addMessage('No partner found at the moment. Try again later.', 'system');
        setIsPartnerConnected(false);
      }
      setIsFindingPartner(false);
    }
  }, [isPartnerConnected, isFindingPartner, toast, hasCameraPermission, addMessage]);


  const inputAreaHeight = 60; // Approximate height for the input bar
  // Calculate height for ScrollArea: total height of chat list container minus input area height
  const scrollableChatHeight = chatListContainerHeight > inputAreaHeight ? chatListContainerHeight - inputAreaHeight : 0;

  const itemData = useMemo(() => ({ messages, theme: effectivePageTheme }), [messages, effectivePageTheme]);


  return (
    <>
      {/* Video Feeds Section - Centered and side-by-side */}
      <div className="flex justify-center gap-4 mb-4">
        {/* Your Video */}
        <div
          className={cn(
            'window flex flex-col m-2', // Added m-2 for spacing
            effectivePageTheme === 'theme-7' ? 'glass' : 'no-padding-window-body'
          )}
          style={{width: '250px', height: '200px', minHeight: '150px'}}
        >
          <div className={cn("title-bar text-sm", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
            <div className="title-bar-text">Your Video</div>
          </div>
          <div className={cn('window-body flex-grow overflow-hidden relative p-0')}>
            <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover bg-black" data-ai-hint="local camera" />
            { hasCameraPermission === false && (
              <Alert variant="destructive" className="m-1 absolute bottom-0 left-0 right-0 text-xs p-1">
                <AlertTitle className="text-xs">Camera Denied</AlertTitle>
              </Alert>
            )}
             { hasCameraPermission === undefined && ( // Show loading/requesting state
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                  <p className="text-white text-center p-2 text-sm">Requesting camera...</p>
                </div>
              )}
          </div>
        </div>

        {/* Partner's Video */}
        <div
          className={cn(
            'window flex flex-col m-2', // Added m-2 for spacing
            effectivePageTheme === 'theme-7' ? 'glass' : 'no-padding-window-body'
          )}
          style={{width: '250px', height: '200px', minHeight: '150px'}}
        >
          <div className={cn("title-bar text-sm", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
            <div className="title-bar-text">Partner's Video</div>
          </div>
          <div className={cn('window-body flex-grow overflow-hidden relative p-0')}>
            <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera" />
            {!isPartnerConnected && ( // Show placeholder if not connected
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                <p className="text-white text-center p-2 text-sm">Partner video unavailable</p>
                </div>
            )}
          </div>
        </div>
      </div>
      {/* End of Video Feeds Section */}


      {/* Chat Section */}
      <div
        className={cn(
          'window flex flex-col flex-1 relative m-2', // Added m-2 for some spacing
          effectivePageTheme === 'theme-7' ? 'glass' : ''
        )}
        style={{ minHeight: '300px', width: '100%', maxWidth: '500px', height: '500px', margin: '0 auto' }} // Added margin: '0 auto' for centering chat window
      >
        <div className={cn("title-bar", effectivePageTheme === 'theme-7' ? 'text-black' : '')}>
          <div className="title-bar-text">Chat</div>
        </div>
        <div
          ref={chatListContainerRef}
          className={cn(
            'window-body window-body-content flex-grow', // Ensure flex-grow for inner content
            effectivePageTheme === 'theme-7' ? 'glass-body-padding' : 'p-0.5' // Use theme-specific padding for window body
          )}
        >
          {/* Scrollable Message List Area */}
          <div
            className={cn(
              "flex-grow", // This div should take up the available space for messages
              effectivePageTheme === 'theme-7' ? 'border p-2 bg-white bg-opacity-20 dark:bg-gray-700 dark:bg-opacity-20' : 'sunken-panel tree-view p-1'
            )}
             style={{ height: scrollableChatHeight > 0 ? `${scrollableChatHeight}px` : '100%' }} // Use calculated height
          >
            {scrollableChatHeight > 0 && chatListContainerWidth > 0 ? (
              <List
                ref={listRef}
                height={scrollableChatHeight}
                itemCount={messages.length}
                itemSize={itemHeight} // Use fixed item height
                width={chatListContainerWidth} // Use measured width of the container
                itemData={itemData} // Pass messages and theme as itemData
                className="scroll-area-viewport" // Ensure this class is applied for potential scrollbar styling
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
              effectivePageTheme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : 'input-area status-bar'
            )}
            style={{ height: `${inputAreaHeight}px` }} // Fixed height for the input bar
          >
            <div className="flex items-center w-full">
              <Button
                onClick={handleToggleConnection}
                disabled={isFindingPartner || hasCameraPermission === undefined || hasCameraPermission === false}
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
    </>
  );
};

export default VideoChatPage;
    
