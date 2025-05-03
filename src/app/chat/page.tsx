
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
            // Assign stream to local video element immediately after getting it
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            } else {
               console.warn("Local video ref not available when stream was obtained.");
            }

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
           // Send candidate via signaling server
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
   }, [chatType, interests, router, toast]); // Added handleDisconnect to dependency array if it uses state/props not listed

   // Setup Data Channel Listeners
   const setupDataChannelListeners = (channel: RTCDataChannel | null) => {
       if (!channel) return;
       channel.onopen = () => {
           console.log("Data channel opened");
           // Consider if connection state depends solely on data channel or media too
           // setIsConnected(true); // Might already be set by signaling simulation
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


  // Effect to assign the local stream to the video element when the stream is ready
  // This is slightly redundant with the assignment inside setupWebRTC but acts as a fallback
  useEffect(() => {
      if (localStream && localVideoRef.current && !localVideoRef.current.srcObject) {
          console.log("Assigning local stream to video element (useEffect fallback)");
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

   const handleDisconnect = useCallback((redirect = true) => {
       // Check if cleanup is already done or unnecessary
       if (!peerConnectionRef.current && !localStream && !isConnected) {
           console.log("Disconnect called but already disconnected/cleaned up.");
           if (redirect && router) { // Redirect if requested and router is available
               router.push('/');
           }
           return;
       }
        console.log("Disconnecting...");

        const wasConnected = isConnected; // Store previous connection state

        // Update state immediately
       setIsConnected(false);
       setIsConnecting(false); // Ensure connecting state is also reset

       // Close PeerConnection
       if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

       // Close DataChannel
        if (dataChannelRef.current) {
            dataChannelRef.current.close();
            dataChannelRef.current = null;
        }


       // Stop media tracks and clear stream state
       localStream?.getTracks().forEach(track => {
          // console.log(`Stopping track: ${track.kind}`);
          track.stop();
        });
       setLocalStream(null);

       // Clear video element sources explicitly
       if (localVideoRef.current?.srcObject) {
           // console.log("Clearing local video srcObject");
            // Ensure tracks are stopped before clearing srcObject
           const stream = localVideoRef.current.srcObject as MediaStream;
           stream?.getTracks().forEach(track => track.stop());
           localVideoRef.current.srcObject = null;
       }
        if (remoteVideoRef.current?.srcObject) {
            // console.log("Clearing remote video srcObject");
            const stream = remoteVideoRef.current.srcObject as MediaStream;
            stream?.getTracks().forEach(track => track.stop());
           remoteVideoRef.current.srcObject = null;
        }

       setMessages([]); // Clear messages on disconnect
       setHasCameraPermission(null); // Reset permission status

        // Show disconnect toast only if we were actually connected before this call
        if (wasConnected) {
             toast({ title: "Disconnected", description: "You have left the chat." });
        }


       if (redirect && router) { // Check if router is available
            // console.log("Redirecting to home page.");
           router.push('/'); // Redirect to home page
       }
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [isConnected, localStream, router, toast]); // Added router and toast


  if (!chatType) {
    // Should ideally not happen if routed correctly, but good fallback
    return <div className="p-4">Invalid chat type specified. <Button onClick={() => router.push('/')}>Go Home</Button></div>;
  }

  return (
    <div className="flex flex-col items-center flex-1 p-4 h-full"> {/* Center content horizontally */}
      {isConnecting && <div className="text-center p-4">Connecting... Please wait.</div>}

      {/* Video Area - Conditional rendering */}
      {chatType === 'video' && (
        <div className="flex justify-center space-x-4 mb-4 w-full max-w-4xl"> {/* Centered video row */}
          {/* Local Video Window */}
          <div className="window w-1/3"> {/* Apply window class, keep width */}
            <div className="title-bar">
                <div className="title-bar-text">You</div>
                {/* Optional: Add theme controls if desired
                <div className="title-bar-controls">
                  <button aria-label="Minimize"></button>
                  <button aria-label="Maximize"></button>
                  <button aria-label="Close"></button>
                </div>
                 */}
            </div>
            <div className="window-body flex flex-col justify-center items-center relative aspect-video p-0"> {/* Apply window-body, remove padding, maintain aspect */}
                 <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                 { hasCameraPermission === false && (
                      <Alert variant="destructive" className="absolute bottom-1 left-1 right-1 text-xs p-1">
                        <AlertTitle className="text-xs">Cam/Mic Denied</AlertTitle>
                        <AlertDescription className="text-xs">Enable permissions.</AlertDescription>
                     </Alert>
                  )}
                 { (isConnecting || (hasCameraPermission === null && !localStream && chatType === 'video')) && ( // Show loading only for video chat
                     <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white text-xs">Loading cam...</div>
                 )}
            </div>
          </div>
          {/* Remote Video Window */}
          <div className="window w-1/3"> {/* Apply window class, keep width */}
            <div className="title-bar">
                <div className="title-bar-text">Stranger</div>
                 {/* Optional: Add theme controls */}
            </div>
             <div className="window-body flex flex-col justify-center items-center relative aspect-video bg-gray-800 p-0"> {/* Apply window-body, remove padding, maintain aspect & bg */}
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                 { !isConnected && !isConnecting && (
                     <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50 text-xs">Waiting...</div>
                 )}
                 { isConnected && !remoteVideoRef.current?.srcObject && (
                     <div className="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-50 text-xs">Connecting video...</div>
                 )}
             </div>
          </div>
        </div>
      )}

       {/* Status Message for Text Chat */}
       {chatType === 'text' && !isConnected && !isConnecting && (
            <div className="text-center p-4">Waiting for a chat partner...</div>
        )}

      {/* Chat Container as a Window - Further decreased width (max-w-sm), increased height (h-[80%]) */}
       <div className={`window flex flex-col ${chatType === 'video' ? 'h-[80%] w-full max-w-sm' : 'flex-1 w-full max-w-lg'}`}>
         <div className="title-bar">
             <div className="title-bar-text">Chat</div>
              {/* Optional: Add theme controls */}
         </div>
         <div className="window-body flex flex-col flex-1 p-0 overflow-hidden"> {/* Use window-body, remove padding */}
            <div className="messages flex-grow overflow-y-auto p-2 bg-white"> {/* White bg for messages, add padding back here */}
                {messages.map((msg) => (
                <div key={msg.id} className={`mb-2 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                    <span className={`inline-block p-2 rounded max-w-[80%] break-words ${msg.sender === 'user' ? 'bg-blue-200' : 'bg-gray-200'}`}>
                    {msg.text}
                    </span>
                </div>
                ))}
                 <div ref={messagesEndRef} />
            </div>
            {/* Input Area below chat, inside window-body */}
            <div className="input-area flex p-2 border-t"> {/* Add padding back, add border */}
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
