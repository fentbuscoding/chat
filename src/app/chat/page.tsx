'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'peer';
}

export default function ChatPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const chatType = searchParams.get('type') as 'text' | 'video' | null;
  const interests = searchParams.get('interests') || ''; // Default to empty string if null

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false); // Simulates connection status
  const [isConnecting, setIsConnecting] = useState(false); // Simulates connection attempt

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

   useEffect(scrollToBottom, [messages]);


  // Placeholder for WebRTC setup and connection logic
  const setupWebRTC = useCallback(async () => {
      if (!chatType) { // Removed interests check here, as empty is allowed
          toast({ title: "Error", description: "Missing chat type.", variant: "destructive" });
          router.push('/');
          return;
      }

      setIsConnecting(true);
      const connectionMessage = interests
        ? `Searching for a ${chatType} partner with interests: ${interests}`
        : `Searching for any available ${chatType} partner...`;
      console.log(`Attempting to connect for ${chatType} chat with interests: ${interests || 'any'}`);
      toast({ title: "Connecting...", description: connectionMessage });

      // *** Start Placeholder WebRTC/Signaling Simulation ***
       // In a real app, this involves complex signaling (e.g., WebSockets)
       // and PeerConnection setup, potentially using interests for matchmaking.
       // If interests is empty, the signaling server would match with any waiting user.

       try {
           // 1. Create PeerConnection
           // Use try-catch for browser compatibility/permissions
            peerConnectionRef.current = new RTCPeerConnection({
              // iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Example STUN server
            });

           // 2. Setup Data Channel (for text chat)
           dataChannelRef.current = peerConnectionRef.current.createDataChannel('chat');
           setupDataChannelListeners(dataChannelRef.current);

           peerConnectionRef.current.ondatachannel = (event) => {
             dataChannelRef.current = event.channel;
             setupDataChannelListeners(dataChannelRef.current);
           };


           // 3. Get Media Stream (if video chat)
           if (chatType === 'video' && localVideoRef.current && navigator.mediaDevices) {
               const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
               localVideoRef.current.srcObject = stream;
               stream.getTracks().forEach(track => peerConnectionRef.current?.addTrack(track, stream));
           }


           // 4. Setup ICE Candidate and Track Listeners
            peerConnectionRef.current.onicecandidate = (event) => {
                 if (event.candidate) {
                     // Send candidate to the peer via signaling server (simulated)
                     // The signaling server would handle matching based on interests or lack thereof.
                     console.log("Sending ICE candidate (simulated):", event.candidate);
                 }
            };

            peerConnectionRef.current.ontrack = (event) => {
                if (remoteVideoRef.current && event.streams[0]) {
                     remoteVideoRef.current.srcObject = event.streams[0];
                }
            };

           // 5. Signaling Simulation (Offer/Answer exchange - highly simplified)
           // Simulate matching based on interests (or lack thereof)
           console.log(`Simulating signaling and connection (Interests: ${interests || 'any'})...`);
           await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate network delay

           // Assume connection is established
           setIsConnected(true);
           toast({ title: "Connected!", description: "You are now connected." });


       } catch (error) {
           console.error("WebRTC setup failed:", error);
           toast({ title: "Connection Failed", description: `Could not start ${chatType} chat. Please check permissions or try again. Error: ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
           handleDisconnect(); // Clean up
       } finally {
            setIsConnecting(false);
       }

      // *** End Placeholder WebRTC/Signaling Simulation ***

  }, [chatType, interests, router, toast]);

   // Setup Data Channel Listeners
   const setupDataChannelListeners = (channel: RTCDataChannel | null) => {
       if (!channel) return;
       channel.onopen = () => {
           console.log("Data channel opened");
           // setIsConnected(true); // Connection status might depend on media too
       };
       channel.onmessage = (event) => {
           const receivedText = event.data;
           setMessages((prev) => [...prev, { id: Date.now().toString(), text: receivedText, sender: 'peer' }]);
       };
       channel.onclose = () => {
           console.log("Data channel closed");
           handleDisconnect(); // Trigger disconnect if channel closes unexpectedly
       };
       channel.onerror = (error) => {
           console.error("Data channel error:", error);
           toast({title: "Chat Error", description: "An error occurred in the text chat.", variant:"destructive"});
       };
   };


  useEffect(() => {
    setupWebRTC();

    // Cleanup function
    return () => {
      handleDisconnect(false); // Don't redirect on component unmount cleanup
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount


  const sendMessage = () => {
    if (inputText.trim() && dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        const message: Message = { id: Date.now().toString(), text: inputText, sender: 'user' };
        setMessages((prev) => [...prev, message]);
        // Send message via data channel
        try {
             dataChannelRef.current.send(inputText);
        } catch (error) {
            console.error("Failed to send message:", error);
             toast({title: "Send Error", description: "Could not send message.", variant:"destructive"});
        }
        setInputText('');
    } else if (!isConnected || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
         toast({title: "Not Connected", description: "You must be connected to send messages.", variant:"destructive"});
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

   const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
       if (e.key === 'Enter') {
         sendMessage();
       }
     };

   const handleDisconnect = (redirect = true) => {
       console.log("Disconnecting...");
       // Close PeerConnection
       peerConnectionRef.current?.close();
       peerConnectionRef.current = null;

       // Close DataChannel
       dataChannelRef.current?.close();
       dataChannelRef.current = null;

       // Stop media tracks
       if (localVideoRef.current?.srcObject) {
           const stream = localVideoRef.current.srcObject as MediaStream;
           stream.getTracks().forEach(track => track.stop());
           localVideoRef.current.srcObject = null;
       }
        if (remoteVideoRef.current?.srcObject) {
            const stream = remoteVideoRef.current.srcObject as MediaStream;
           stream.getTracks().forEach(track => track.stop());
           remoteVideoRef.current.srcObject = null;
       }


       setIsConnected(false);
       setMessages([]); // Clear messages on disconnect
       toast({ title: "Disconnected", description: "You have left the chat." });
       if (redirect) {
           router.push('/'); // Redirect to home page
       }
   };


  if (!chatType) {
    // Should ideally not happen if routed correctly, but good fallback
    return <div className="p-4">Invalid chat type specified. <Button onClick={() => router.push('/')}>Go Home</Button></div>;
  }

  return (
    <div className="flex flex-col flex-1 p-4 h-full">
      {isConnecting && <div className="text-center p-4">Connecting... Please wait.</div>}

      {/* Video Area */}
      {chatType === 'video' && (
        <div className="flex space-x-4 mb-4 h-1/2">
          <div className="window flex-1"> {/* Use window class */}
            <div className="title-bar">
                <div className="title-bar-text">You</div>
            </div>
            <div className="window-body"> {/* Use window-body class */}
                 <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover"></video>
            </div>
          </div>
          <div className="window flex-1"> {/* Use window class */}
            <div className="title-bar">
                <div className="title-bar-text">Stranger</div>
            </div>
             <div className="window-body"> {/* Use window-body class */}
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover bg-gray-800"></video>
                {!isConnected && !isConnecting && <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50">Waiting for stranger...</div>}
             </div>
          </div>
        </div>
      )}

       {/* Status Message for Text Chat */}
       {chatType === 'text' && !isConnected && !isConnecting && (
            <div className="text-center p-4">Waiting for a chat partner...</div>
        )}


      {/* Chat Area */}
      <div className={`window flex flex-col ${chatType === 'video' ? 'h-1/2' : 'flex-1'}`}> {/* Use window class and adjust height */}
         <div className="title-bar">
             <div className="title-bar-text">Chat</div>
         </div>
         <div className="window-body flex flex-col flex-1 p-0"> {/* Use window-body and remove default padding */}
            <div className="messages flex-grow overflow-y-auto p-2 bg-white"> {/* Add bg-white for contrast inside window */}
                {messages.map((msg) => (
                <div key={msg.id} className={`mb-2 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                    <span className={`inline-block p-2 rounded ${msg.sender === 'user' ? 'bg-blue-200' : 'bg-gray-200'}`}>
                    {msg.text}
                    </span>
                </div>
                ))}
                 <div ref={messagesEndRef} />
            </div>
            <div className="input-area flex p-2 border-t">
                <Input
                type="text"
                value={inputText}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder={isConnected ? "Type your message..." : "Connecting..."}
                disabled={!isConnected || isConnecting}
                className="flex-grow mr-2"
                />
                <Button onClick={sendMessage} disabled={!isConnected || isConnecting || !inputText.trim()} className="accent">
                Send
                </Button>
                 <Button onClick={() => handleDisconnect()} variant="secondary" className="ml-2">
                    Disconnect
                 </Button>
            </div>
         </div>
      </div>
    </div>
  );
}
