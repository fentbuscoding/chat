'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert components

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
  const [localStream, setLocalStream] = useState<MediaStream | null>(null); // State for local media stream
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null); // Track camera permission status

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
      if (!chatType) {
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

       try {
           // 1. Create PeerConnection
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


           // 3. Get Media Stream (if video chat) - Request permission here
           if (chatType === 'video') {
               if (!navigator.mediaDevices?.getUserMedia) {
                   throw new Error("Media devices API not available.");
               }
               try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                    setLocalStream(stream); // Store stream in state
                    setHasCameraPermission(true);
                    // Add tracks to the peer connection *after* stream is obtained
                    stream.getTracks().forEach(track => peerConnectionRef.current?.addTrack(track, stream));
               } catch (mediaError) {
                    console.error('Error accessing camera/microphone:', mediaError);
                    setHasCameraPermission(false);
                    toast({
                      variant: 'destructive',
                      title: 'Media Access Denied',
                      description: 'Please enable camera and microphone permissions in your browser settings.',
                    });
                    // Optionally stop connection attempt or proceed without video/audio
                    // For now, we'll let the connection proceed but show an error state for video
               }
           } else {
               setHasCameraPermission(null); // Not applicable for text chat
           }


           // 4. Setup ICE Candidate and Track Listeners
            peerConnectionRef.current.onicecandidate = (event) => {
                 if (event.candidate) {
                     console.log("Sending ICE candidate (simulated):", event.candidate);
                 }
            };

            peerConnectionRef.current.ontrack = (event) => {
                // Assign remote stream to the remote video element
                if (remoteVideoRef.current && event.streams[0]) {
                     remoteVideoRef.current.srcObject = event.streams[0];
                } else {
                     console.warn("Remote video ref not available or no stream in event");
                }
            };

           // 5. Signaling Simulation (Offer/Answer exchange - highly simplified)
           console.log(`Simulating signaling and connection (Interests: ${interests || 'any'})...`);
           // Create offer (in a real app, initiator creates offer)
           // const offer = await peerConnectionRef.current.createOffer();
           // await peerConnectionRef.current.setLocalDescription(offer);
           // Send offer via signaling server... receive answer... setRemoteDescription...

           await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay

           // Assume connection is established
           setIsConnected(true);
           toast({ title: "Connected!", description: "You are now connected." });


       } catch (error) {
           console.error("WebRTC setup failed:", error);
           toast({ title: "Connection Failed", description: `Could not start ${chatType} chat. Please check permissions or try again. Error: ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
           handleDisconnect(false); // Clean up without redirecting immediately
       } finally {
            setIsConnecting(false);
       }
  }, [chatType, interests, router, toast]);

   // Setup Data Channel Listeners
   const setupDataChannelListeners = (channel: RTCDataChannel | null) => {
       if (!channel) return;
       channel.onopen = () => {
           console.log("Data channel opened");
           // Consider if connection state depends solely on data channel or media too
           // setIsConnected(true);
       };
       channel.onmessage = (event) => {
           const receivedText = event.data;
           setMessages((prev) => [...prev, { id: Date.now().toString(), text: receivedText, sender: 'peer' }]);
       };
       channel.onclose = () => {
           console.log("Data channel closed");
           if (isConnected) { // Only trigger disconnect if we were previously connected
               toast({ title: "Peer Disconnected", description: "The other user left the chat.", variant: "destructive" });
               handleDisconnect(); // Trigger disconnect if channel closes unexpectedly
           }
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


  // Effect to assign the local stream to the video element when both are ready
  useEffect(() => {
      if (localStream && localVideoRef.current) {
          console.log("Assigning local stream to video element");
          localVideoRef.current.srcObject = localStream;
      }
  }, [localStream]); // Run whenever localStream changes

  const sendMessage = () => {
    if (inputText.trim() && dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        const message: Message = { id: Date.now().toString(), text: inputText, sender: 'user' };
        setMessages((prev) => [...prev, message]);
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
       if (!peerConnectionRef.current && !localStream) {
           // Already disconnected or cleaned up
           if (redirect && router) { // Check if router is available
               router.push('/');
           }
           return;
       }
       console.log("Disconnecting...");
       setIsConnected(false); // Update state immediately

       // Close PeerConnection
       peerConnectionRef.current?.close();
       peerConnectionRef.current = null;

       // Close DataChannel
       dataChannelRef.current?.close();
       dataChannelRef.current = null;

       // Stop media tracks from the state stream
       localStream?.getTracks().forEach(track => track.stop());
       setLocalStream(null); // Clear the stream state

       // Also attempt to clear srcObject just in case
       if (localVideoRef.current?.srcObject) {
           localVideoRef.current.srcObject = null;
       }
        if (remoteVideoRef.current?.srcObject) {
           remoteVideoRef.current.srcObject = null;
       }


       setMessages([]); // Clear messages on disconnect
       setHasCameraPermission(null); // Reset permission status

       // Avoid showing toast if we were never connected or during initial setup failures handled elsewhere
       if (isConnected) {
            toast({ title: "Disconnected", description: "You have left the chat." });
       }

       if (redirect && router) { // Check if router is available
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

      {/* Video Area - Always render video elements structure if chatType is video */}
      {chatType === 'video' && (
        <div className="flex space-x-4 mb-4 h-1/2">
          {/* Local Video */}
          <div className="window flex-1 flex flex-col"> {/* Use window class */}
            <div className="title-bar">
                <div className="title-bar-text">You</div>
            </div>
            <div className="window-body flex-1 flex flex-col justify-center items-center relative"> {/* Use window-body class */}
                 <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                 {/* Show alert only if permission was explicitly denied */}
                 { hasCameraPermission === false && (
                      <Alert variant="destructive" className="absolute bottom-2 left-2 right-2">
                        <AlertTitle>Camera/Mic Access Denied</AlertTitle>
                        <AlertDescription>
                          Please enable permissions to share your video/audio.
                        </AlertDescription>
                     </Alert>
                  )}
                 {/* Show placeholder if connecting or waiting for stream */}
                 { (isConnecting || (hasCameraPermission === null && !localStream)) && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">Loading camera...</div>
                 )}
            </div>
          </div>
          {/* Remote Video */}
          <div className="window flex-1 flex flex-col"> {/* Use window class */}
            <div className="title-bar">
                <div className="title-bar-text">Stranger</div>
            </div>
             <div className="window-body flex-1 flex flex-col justify-center items-center relative"> {/* Use window-body class */}
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover bg-gray-800"></video>
                 {/* Show waiting message only if *we* are connected/connecting, but peer isn't fully there yet */}
                 { (!isConnected && !isConnecting) && (
                     <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50">Waiting for stranger...</div>
                 )}
                 { isConnected && !remoteVideoRef.current?.srcObject && (
                     <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50">Connecting stream...</div>
                 )}
             </div>
          </div>
        </div>
      )}

       {/* Status Message for Text Chat */}
       {chatType === 'text' && !isConnected && !isConnecting && (
            <div className="text-center p-4">Waiting for a chat partner...</div>
        )}


      {/* Chat Area */}
      <div className={`window flex flex-col ${chatType === 'video' ? 'h-[calc(50%-1rem)]' : 'flex-1'}`}> {/* Use window class and adjust height with calc */}
         <div className="title-bar">
             <div className="title-bar-text">Chat</div>
         </div>
         <div className="window-body flex flex-col flex-1 p-0 overflow-hidden"> {/* Use window-body and remove default padding, add overflow hidden */}
            <div className="messages flex-grow overflow-y-auto p-2 bg-white"> {/* Add bg-white for contrast inside window */}
                {messages.map((msg) => (
                <div key={msg.id} className={`mb-2 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                    <span className={`inline-block p-2 rounded max-w-[80%] break-words ${msg.sender === 'user' ? 'bg-blue-200' : 'bg-gray-200'}`}>
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
