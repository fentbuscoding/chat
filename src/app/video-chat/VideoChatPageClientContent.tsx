
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { cn, playSound } from '@/lib/utils';
import HomeButton from '@/components/HomeButton';
import { io, type Socket } from 'socket.io-client';
import { supabase } from '@/lib/supabase';

const EMOJI_BASE_URL_DISPLAY = "https://storage.googleapis.com/chat_emoticons/display_98/";
const STATIC_DISPLAY_EMOJI_FILENAMES = [
  'angel.png', 'bigsmile.png', 'burp.png', 'cool.png', 'crossedlips.png',
  'cry.png', 'embarrassed.png', 'kiss.png', 'moneymouth.png', 'sad.png',
  'scream.png', 'smile.png', 'think.png', 'tongue.png', 'wink.png', 'yell.png'
];
const SMILE_EMOJI_FILENAME = 'smile.png';
const EMOJI_BASE_URL_PICKER = "/emotes/";

const INPUT_AREA_HEIGHT = 60;
const LOG_PREFIX = "VideoChatPageClientContent";

const FAVICON_IDLE = '/Idle.ico';
const FAVICON_SEARCHING = '/Searching.ico';
const FAVICON_SUCCESS = '/Success.ico';
const FAVICON_SKIPPED = '/Skipped.ico';
const FAVICON_DEFAULT = '/favicon.ico';

const SYS_MSG_SEARCHING_PARTNER = 'Searching for a partner...';
const SYS_MSG_STOPPED_SEARCHING = 'Stopped searching for a partner.';
const SYS_MSG_CONNECTED_PARTNER = 'Connected with a partner. You can start chatting!';
const SYS_MSG_YOU_DISCONNECTED = 'You have disconnected.';
const SYS_MSG_PARTNER_DISCONNECTED = 'Your partner has disconnected.';
const SYS_MSG_COMMON_INTERESTS_PREFIX = 'You both like ';

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: Date;
  senderUsername?: string;
}

interface EmoteData {
  filename: string;
  width?: number;
  height?: number;
}

const renderMessageWithEmojis = (text: string, emojiFilenames: string[], baseUrl: string): (string | JSX.Element)[] => {
  if (!emojiFilenames || emojiFilenames.length === 0) return [text];
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  const regex = /:([a-zA-Z0-9_.-]+?):/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.substring(lastIndex, match.index));
    const shortcodeName = match[1];
    const matchedFilename = emojiFilenames.find(fn => fn.split('.')[0].toLowerCase() === shortcodeName.toLowerCase());
    if (matchedFilename) {
      parts.push(<img key={`${match.index}-${shortcodeName}`} src={`${baseUrl}${matchedFilename}`} alt={shortcodeName} className="inline max-h-5 w-auto mx-0.5 align-middle" data-ai-hint="chat emoji" />);
    } else {
      parts.push(match[0]);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.substring(lastIndex));
  return parts.length > 0 ? parts : [text];
};

interface RowProps {
  message: Message;
  theme: string;
  previousMessageSender?: Message['sender'];
  pickerEmojiFilenames: string[];
  ownUsername: string | null;
}

const Row = React.memo(({ message, theme, previousMessageSender, pickerEmojiFilenames, ownUsername }: RowProps) => {
  if (message.sender === 'system') {
    return (
      <div className="mb-2">
        <div className={cn("text-center w-full text-xs italic", theme === 'theme-7' ? 'theme-7-text-shadow text-gray-100' : 'text-gray-500 dark:text-gray-400')}>
          {message.text}
        </div>
      </div>
    );
  }
  const showDivider = theme === 'theme-7' && previousMessageSender && ['me', 'partner'].includes(previousMessageSender) && ['me', 'partner'].includes(message.sender) && message.sender !== previousMessageSender;
  const messageContent = theme === 'theme-98' ? renderMessageWithEmojis(message.text, pickerEmojiFilenames, EMOJI_BASE_URL_PICKER) : [message.text];
  const getDisplayName = (sender: 'me' | 'partner') => {
    if (sender === 'me') return ownUsername || "You";
    return message.senderUsername || "Stranger";
  };
  return (
    <>
      {showDivider && <div className="h-[2px] mb-1 border border-[#CEDCE5] bg-[#64B2CF]" aria-hidden="true"></div>}
      <div className="mb-1 break-words">
        {message.sender === 'me' && (<><span className="text-blue-600 font-bold mr-1">{getDisplayName('me')}:</span><span className={cn(theme === 'theme-7' && 'theme-7-text-shadow')}>{messageContent}</span></>)}
        {message.sender === 'partner' && (<><span className="text-red-600 font-bold mr-1">{getDisplayName('partner')}:</span><span className={cn(theme === 'theme-7' && 'theme-7-text-shadow')}>{messageContent}</span></>)}
      </div>
    </>
  );
});
Row.displayName = 'Row';

const VideoChatPageClientContent: React.FC = () => {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null); // To store authenticated user ID
  const autoSearchDoneRef = useRef(false);
  const isProcessingFindOrDisconnect = useRef(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);
  const [isFindingPartner, setIsFindingPartner] = useState(false);
  const [partnerInterests, setPartnerInterests] = useState<string[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | undefined>(undefined);

  const interests = useMemo(() => searchParams.get('interests')?.split(',').filter(i => i.trim() !== '') || [], [searchParams]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const prevIsFindingPartnerRef = useRef(isFindingPartner);
  const prevIsPartnerConnectedRef = useRef(isPartnerConnected);
  const [isSelfDisconnectedRecently, setIsSelfDisconnectedRecently] = useState(false);
  const [isPartnerLeftRecently, setIsPartnerLeftRecently] = useState(false);
  const prevIsSelfDisconnectedRecentlyRef = useRef(isSelfDisconnectedRecently);
  const prevIsPartnerLeftRecentlyRef = useRef(isPartnerLeftRecently);

  const [currentEmojiIconUrl, setCurrentEmojiIconUrl] = useState(() => `${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pickerEmojiFilenames, setPickerEmojiFilenames] = useState<string[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(true);
  const hoverIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const [socketError, setSocketError] = useState(false);
  const successTransitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const successTransitionEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skippedFaviconTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [typingDots, setTypingDots] = useState('.');
  const localTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalTypingRef = useRef(false);
  const [ownProfileUsername, setOwnProfileUsername] = useState<string | null>(null);
  const effectivePageTheme = isMounted ? currentTheme : 'theme-98';

  const changeFavicon = useCallback((newFaviconHref: string, removeOld: boolean = false) => {
    if (typeof window === 'undefined' || !document.head) return;
    let link: HTMLLinkElement | null = document.head.querySelector("link[rel*='icon']");
    if (removeOld && link && link.parentNode) { link.parentNode.removeChild(link); link = null; }
    if (!link) { link = document.createElement('link'); link.type = 'image/x-icon'; link.rel = 'shortcut icon'; document.head.appendChild(link); }
    link.href = newFaviconHref;
  }, []);

  const addMessageToList = useCallback((text: string, sender: Message['sender'], senderUsername?: string, idSuffix?: string) => {
    setMessages((prevMessages) => {
      const newMessageItem: Message = {
        id: `${Date.now()}-${idSuffix || Math.random().toString(36).substring(2, 7)}`,
        text,
        sender,
        timestamp: new Date(),
        senderUsername: sender === 'partner' ? senderUsername : undefined,
      };
      return [...prevMessages, newMessageItem];
    });
  }, []);


  useEffect(() => { 
    console.log(`${LOG_PREFIX}: isPartnerConnected state changed to: ${isPartnerConnected}`);
  }, [isPartnerConnected]);

  useEffect(() => {
    console.log(`${LOG_PREFIX}: roomId state changed to: ${roomId}, updating roomIdRef.`);
    roomIdRef.current = roomId;
  }, [roomId]);


  useEffect(() => {
    if (!isMounted) return;
    const fetchOwnProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      userIdRef.current = user?.id || null; // Store user ID
      if (user) {
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('username')
          .eq('id', user.id)
          .single();
        if (error && error.code !== 'PGRST116') { 
          console.error(`${LOG_PREFIX}: Error fetching own profile:`, error);
        } else if (profile) {
          console.log(`${LOG_PREFIX}: Fetched own profile username:`, profile.username);
          setOwnProfileUsername(profile.username);
        } else {
          console.log(`${LOG_PREFIX}: No profile found for user ${user.id} or username is null.`);
          setOwnProfileUsername(null);
        }
      }
    };
    fetchOwnProfile();
  }, [isMounted]);

  useEffect(() => {
    if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current);
    if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
    if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current);

    let updatedMessages = [...messages];
    const filterSystemMessagesFrom = (msgs: Message[], textPattern: string): Message[] => msgs.filter(msg => !(msg.sender === 'system' && msg.text.toLowerCase().includes(textPattern.toLowerCase())));
    const addSystemMessageIfNotPresentIn = (msgs: Message[], text: string, idSuffix: string): Message[] => {
      const lowerText = text.toLowerCase();
      if (!msgs.some(msg => msg.sender === 'system' && msg.text.toLowerCase().includes(lowerText))) {
        return [...msgs, { id: `${Date.now()}-${idSuffix}`, text, sender: 'system', timestamp: new Date() }];
      }
      return msgs;
    };

    if (socketError) {
      changeFavicon(FAVICON_SKIPPED);
    } else if (isSelfDisconnectedRecently) {
      changeFavicon(FAVICON_SKIPPED);
      skippedFaviconTimeoutRef.current = setTimeout(() => { if (isFindingPartner) changeFavicon(FAVICON_SEARCHING); }, 500);
       if (isFindingPartner) { 
           updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_PARTNER_DISCONNECTED.toLowerCase());
           updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_STOPPED_SEARCHING.toLowerCase());
           updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_SEARCHING_PARTNER, 'search-after-skip-video');
       }
    } else if (isPartnerLeftRecently) {
      changeFavicon(FAVICON_SKIPPED);
      skippedFaviconTimeoutRef.current = setTimeout(() => { if (!isFindingPartner && !isPartnerConnected) changeFavicon(FAVICON_IDLE); }, 1000);
      updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_SEARCHING_PARTNER);
      updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_STOPPED_SEARCHING);
      updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_YOU_DISCONNECTED);
      updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_PARTNER_DISCONNECTED, 'partner-left-video');
    } else if (isFindingPartner) {
      changeFavicon(FAVICON_SEARCHING);
      const justStartedFindingOrSkipped = !prevIsFindingPartnerRef.current || prevIsSelfDisconnectedRecentlyRef.current || prevIsPartnerLeftRecentlyRef.current;
      if (justStartedFindingOrSkipped) {
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_PARTNER_DISCONNECTED);
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_STOPPED_SEARCHING);
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_YOU_DISCONNECTED);
        updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_SEARCHING_PARTNER, 'search-video');
      }
    } else if (isPartnerConnected) {
      if (!prevIsPartnerConnectedRef.current) {
        let count = 0; changeFavicon(FAVICON_SUCCESS);
        successTransitionIntervalRef.current = setInterval(() => { changeFavicon(count % 2 === 0 ? FAVICON_IDLE : FAVICON_SUCCESS); count++; }, 750);
        successTransitionEndTimeoutRef.current = setTimeout(() => { if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current); if (isPartnerConnected) changeFavicon(FAVICON_SUCCESS); }, 3000);
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_SEARCHING_PARTNER);
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_PARTNER_DISCONNECTED);
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_STOPPED_SEARCHING);
        updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_YOU_DISCONNECTED);
        updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_CONNECTED_PARTNER, 'connect-video');
        if (interests.length > 0 && partnerInterests.length > 0) {
          const common = interests.filter(i => partnerInterests.includes(i));
          if (common.length > 0) updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, `${SYS_MSG_COMMON_INTERESTS_PREFIX}${common.join(', ')}.`, 'common-video');
        }
      } else if (!successTransitionIntervalRef.current && !successTransitionEndTimeoutRef.current) changeFavicon(FAVICON_SUCCESS);
    } else {
      changeFavicon(FAVICON_IDLE);
      if (prevIsFindingPartnerRef.current && !isFindingPartner && !isPartnerConnected && !roomIdRef.current && !socketError && !isPartnerLeftRecently && !isSelfDisconnectedRecently) {
        if (updatedMessages.some(msg => msg.sender === 'system' && msg.text.toLowerCase().includes(SYS_MSG_SEARCHING_PARTNER))) {
          updatedMessages = filterSystemMessagesFrom(updatedMessages, SYS_MSG_SEARCHING_PARTNER);
          updatedMessages = addSystemMessageIfNotPresentIn(updatedMessages, SYS_MSG_STOPPED_SEARCHING, 'stopsearch-video');
        }
      }
    }
    if (updatedMessages.length !== messages.length || !updatedMessages.every((v, i) => v.id === messages[i]?.id && v.text === messages[i]?.text)) setMessages(updatedMessages);
    prevIsFindingPartnerRef.current = isFindingPartner;
    prevIsPartnerConnectedRef.current = isPartnerConnected;
    prevIsSelfDisconnectedRecentlyRef.current = isSelfDisconnectedRecently;
    prevIsPartnerLeftRecentlyRef.current = isPartnerLeftRecently;
  }, [isPartnerConnected, isFindingPartner, socketError, isSelfDisconnectedRecently, isPartnerLeftRecently, partnerInterests, interests, changeFavicon, messages]);

  const getCameraStream = useCallback(async () => {
    if (localStreamRef.current?.active) {
      if (localVideoRef.current && !localVideoRef.current.srcObject) localVideoRef.current.srcObject = localStreamRef.current;
      setHasCameraPermission(true); return localStreamRef.current;
    }
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setHasCameraPermission(false); toast({ variant: 'destructive', title: 'Unsupported Browser', description: 'Camera access (getUserMedia) is not supported.' }); return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setHasCameraPermission(true); localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (error) {
      console.error(`${LOG_PREFIX}: Error accessing camera:`, error); setHasCameraPermission(false);
      toast({ variant: 'destructive', title: 'Camera Access Denied', description: 'Please enable camera permissions.' }); return null;
    }
  }, [toast]);

  const cleanupConnections = useCallback((stopLocalStream = true) => {
    console.log(`${LOG_PREFIX}: cleanupConnections. Stop local: ${stopLocalStream}`);
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null; peerConnectionRef.current.onicecandidate = null; peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.getSenders().forEach(s => { if (s.track) s.track.stop(); try { peerConnectionRef.current?.removeTrack(s); } catch(e) { console.warn(`${LOG_PREFIX}: Error removing track:`, e); }});
      peerConnectionRef.current.close(); peerConnectionRef.current = null; console.log(`${LOG_PREFIX}: PeerConnection closed.`);
    }
    if (stopLocalStream && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null; console.log(`${LOG_PREFIX}: Local stream stopped.`);
    } else if (localStreamRef.current && localVideoRef.current && !localVideoRef.current.srcObject && !stopLocalStream) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const setupWebRTC = useCallback(async (initiator: boolean) => {
    const currentSocket = socketRef.current;
    const currentRoomId = roomIdRef.current;
    if (!currentSocket || !currentRoomId) { console.error(`${LOG_PREFIX}: setupWebRTC with invalid socket/roomId. Socket: ${!!currentSocket}, RoomID: ${currentRoomId}`); return; }

    console.log(`${LOG_PREFIX}: Setting up WebRTC. Initiator: ${initiator}, Room: ${currentRoomId}`);
    const stream = await getCameraStream();
    if (!stream) { toast({ title: "Camera Error", description: "Cannot setup video without camera.", variant: "destructive" }); return; }

    if (peerConnectionRef.current) { console.warn(`${LOG_PREFIX}: PeerConnection exists. Closing before new.`); cleanupConnections(false); }

    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerConnectionRef.current = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.onicecandidate = e => { if (e.candidate && socketRef.current?.connected && roomIdRef.current) socketRef.current.emit('webrtcSignal', { roomId: roomIdRef.current, signalData: { candidate: e.candidate } }); };
    pc.ontrack = e => { if (remoteVideoRef.current && e.streams?.[0]) remoteVideoRef.current.srcObject = e.streams[0]; };
    pc.oniceconnectionstatechange = () => { if(peerConnectionRef.current) console.log(`${LOG_PREFIX}: ICE state: ${peerConnectionRef.current.iceConnectionState}`); };

    if (initiator) {
      try {
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        if (socketRef.current?.connected && roomIdRef.current) socketRef.current.emit('webrtcSignal', { roomId: roomIdRef.current, signalData: offer });
      } catch (error) { console.error(`${LOG_PREFIX}: Error creating offer:`, error); }
    }
  }, [getCameraStream, toast, cleanupConnections]);

  const handleFindOrDisconnectPartner = useCallback(async () => {
    console.log(`${LOG_PREFIX}: handleFindOrDisconnectPartner called. isPartnerConnected=${isPartnerConnected}, roomIdRef.current=${roomIdRef.current}, isFindingPartner=${isFindingPartner}`);
    if (isProcessingFindOrDisconnect.current) { console.log(`${LOG_PREFIX}: Find/disconnect action already in progress.`); return; }
    isProcessingFindOrDisconnect.current = true; 

    const currentSocket = socketRef.current;
    if (!currentSocket) { toast({ title: "Not Connected", description: "Chat server connection not yet established.", variant: "destructive" }); isProcessingFindOrDisconnect.current = false; return; }
    
    const currentRoomId = roomIdRef.current;

    if (isPartnerConnected && currentRoomId) { 
      console.log(`${LOG_PREFIX}: User ${currentSocket.id} is skipping partner in video room ${currentRoomId}.`);
      addMessageToList(SYS_MSG_YOU_DISCONNECTED, 'system', undefined, 'self-disconnect-skip-video');
      
      setIsPartnerConnected(false);
      setIsPartnerTyping(false);
      setRoomId(null); 
      setPartnerInterests([]);
      
      if (currentSocket.connected) currentSocket.emit('leaveChat', { roomId: currentRoomId });
      cleanupConnections(false); 
      
      setIsFindingPartner(true); 
      setIsSelfDisconnectedRecently(true);
      setIsPartnerLeftRecently(false);

      if (currentSocket.connected) {
        const stream = await getCameraStream(); 
        if (stream) { 
            console.log(`${LOG_PREFIX}: Emitting findPartner after video skip for ${currentSocket.id}. AuthID: ${userIdRef.current}`); 
            currentSocket.emit('findPartner', { chatType: 'video', interests, authId: userIdRef.current }); 
        } else { 
            toast({ title: "Camera Error", description: "Cannot find new partner without camera.", variant: "destructive"}); 
            setIsFindingPartner(false); 
        }
      } else { 
        toast({ title: "Connection Issue", description: "Cannot find new partner, connection lost.", variant: "destructive" }); 
        setSocketError(true); 
        setIsFindingPartner(false); 
      }
    } else if (isFindingPartner) { 
      console.log(`${LOG_PREFIX}: User ${currentSocket.id} stopping video partner search.`);
      setIsFindingPartner(false); 
      setIsSelfDisconnectedRecently(false); 
      setIsPartnerLeftRecently(false);
    } else { 
      if (hasCameraPermission === false) { 
        toast({ title: "Camera Required", description: "Enable camera for video chat.", variant: "destructive" }); 
        isProcessingFindOrDisconnect.current = false; 
        return; 
      }
      const stream = await getCameraStream();
      if (!stream) { 
        isProcessingFindOrDisconnect.current = false; 
        return; 
      } 
      if (!currentSocket.connected) { 
        toast({ title: "Connection Lost", description: "Cannot find partner.", variant: "destructive" }); 
        isProcessingFindOrDisconnect.current = false; 
        setSocketError(true); 
        return; 
      }
      console.log(`${LOG_PREFIX}: User ${currentSocket.id} starting video partner search. AuthID: ${userIdRef.current}`);
      setIsFindingPartner(true); 
      setIsSelfDisconnectedRecently(false);
      setIsPartnerLeftRecently(false);
      currentSocket.emit('findPartner', { chatType: 'video', interests, authId: userIdRef.current });
    }
    isProcessingFindOrDisconnect.current = false; 
  }, [isPartnerConnected, isFindingPartner, interests, addMessageToList, cleanupConnections, getCameraStream, toast, hasCameraPermission]);

  useEffect(() => {
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;
    if (!socketServerUrl) { console.error(`${LOG_PREFIX}: Socket URL missing.`); toast({ title: "Config Error", variant: "destructive" }); setSocketError(true); return; }
    console.log(`${LOG_PREFIX}: Connecting to socket server: ${socketServerUrl}`);
    const newSocket = io(socketServerUrl, { withCredentials: true, transports: ['websocket', 'polling'] });
    socketRef.current = newSocket;

    const onConnect = async () => {
      console.log(`%cSOCKET CONNECTED (VIDEO): ${newSocket.id}`, 'color: orange; font-weight: bold;');
      setSocketError(false);
      if (!autoSearchDoneRef.current && !isPartnerConnected && !isFindingPartner && !roomIdRef.current) {
        console.log(`${LOG_PREFIX}: Auto-starting video partner search on connect. AuthID: ${userIdRef.current}`);
        let stream;
        if(hasCameraPermission === undefined) stream = await getCameraStream(); else stream = localStreamRef.current;

        if (stream?.active) { 
            setIsFindingPartner(true); 
            setIsSelfDisconnectedRecently(false); setIsPartnerLeftRecently(false);
            newSocket.emit('findPartner', { chatType: 'video', interests, authId: userIdRef.current }); 
            autoSearchDoneRef.current = true; 
        } else { 
            console.log(`${LOG_PREFIX}: Camera not active/ready, not auto-searching. Permission: ${hasCameraPermission}`); 
            addMessageToList("Camera access needed to start video chat.", "system", undefined, "camera-needed-video"); 
            setIsFindingPartner(false); 
        }
      }
    };
    const onPartnerFound = ({ partnerId: pId, roomId: rId, interests: pInterests, partnerUsername, partnerDisplayName, partnerAvatarUrl }: { partnerId: string, roomId: string, interests: string[], partnerUsername?: string, partnerDisplayName?: string, partnerAvatarUrl?: string }) => {
      console.log(`%cSOCKET EVENT: partnerFound (VIDEO)`, 'color: green; font-weight: bold;', { partnerIdFromServer: pId, rId, partnerUsername, pInterests, partnerDisplayName, partnerAvatarUrl });
      playSound("Match.wav");
      setMessages([]); setRoomId(rId); setPartnerInterests(pInterests || []);
      setIsFindingPartner(false); setIsPartnerConnected(true); setIsSelfDisconnectedRecently(false); setIsPartnerLeftRecently(false);
      if (isMounted) setupWebRTC(true); // Initiator
    };
    const onWaitingForPartner = () => console.log(`${LOG_PREFIX}: Server ack 'waitingForPartner' (video) for ${newSocket.id}`);
    const onFindPartnerCooldown = () => { console.log(`${LOG_PREFIX}: Cooldown for ${newSocket.id}`); toast({ title: "Slow down!", variant: "default" }); setIsFindingPartner(false); };
    const onReceiveMessage = ({ senderId, message: receivedMessage, senderUsername }: { senderId: string, message: string, senderUsername?: string }) => {
      console.log(`%c[[CLIENT RECEIVE MESSAGE (VIDEO)]]`, 'color: purple; font-size: 1.2em; font-weight: bold;',
          `RAW_PAYLOAD:`, { senderId, message: receivedMessage, senderUsername }, `CURRENT_ROOM_ID_REF: ${roomIdRef.current}`);
      const partnerMessage: Message = {
        id: `${Date.now()}-partner-${Math.random().toString(36).substring(2, 7)}`,
        text: receivedMessage,
        sender: 'partner',
        timestamp: new Date(),
        senderUsername: senderUsername,
      };
      setMessages((prevMessages) => [...prevMessages, partnerMessage]);
      setIsPartnerTyping(false);
    };
    const onWebRTCSignal = async (signalData: any) => {
      console.log(`${LOG_PREFIX}: Socket ${newSocket.id} received WebRTC signal for room ${roomIdRef.current}: type ${signalData.type || 'candidate'}`);
      let pc = peerConnectionRef.current;
      if (!newSocket || !roomIdRef.current) { console.error(`${LOG_PREFIX}: Socket/RoomID missing for WebRTC signal.`); return; }
      if (!pc && isPartnerConnected && isMounted) { console.log(`${LOG_PREFIX}: Receiving signal, local PC not set up. Setting up (non-initiator) for room ${roomIdRef.current}.`); await setupWebRTC(false); pc = peerConnectionRef.current; }
      if (!pc) { console.error(`${LOG_PREFIX}: PeerConnection not initialized for room ${roomIdRef.current}, cannot handle signal.`); return; }
      try {
        if (signalData.candidate) await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        else if (signalData.type === 'offer') { await pc.setRemoteDescription(new RTCSessionDescription(signalData)); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); if (socketRef.current?.connected && roomIdRef.current) socketRef.current.emit('webrtcSignal', { roomId: roomIdRef.current, signalData: answer }); console.log(`${LOG_PREFIX}: Sent answer for room ${roomIdRef.current}`); }
        else if (signalData.type === 'answer') { if (pc.signalingState === 'have-local-offer' || pc.signalingState === 'stable') await pc.setRemoteDescription(new RTCSessionDescription(signalData)); else console.warn(`${LOG_PREFIX}: Received answer for room ${roomIdRef.current} but not in have-local-offer state. State: ${pc.signalingState}`); }
      } catch (error) { console.error(`${LOG_PREFIX}: Error handling WebRTC signal for room ${roomIdRef.current}:`, error); }
    };
    const onPartnerLeft = () => {
      console.log(`%cSOCKET EVENT: partnerLeft (VIDEO)`, 'color: red; font-weight: bold;', `Room: ${roomIdRef.current}, Socket: ${newSocket.id}`);
      cleanupConnections(false);
      setIsPartnerConnected(false); setIsFindingPartner(false); setIsPartnerTyping(false); setRoomId(null); setPartnerInterests([]);
      setIsPartnerLeftRecently(true); setIsSelfDisconnectedRecently(false);
    };
    const onDisconnectHandler = (reason: string) => {
      console.warn(`${LOG_PREFIX}: Socket ${newSocket.id} disconnected (video). Reason: ${reason}`); setSocketError(true); cleanupConnections(true);
      setIsPartnerConnected(false); setIsFindingPartner(false); setIsPartnerTyping(false); setRoomId(null);
    };
    const onConnectError = (err: Error) => {
      console.error(`${LOG_PREFIX}: Socket ${newSocket.id} connection error (video): ${String(err)}`, err); setSocketError(true);
      toast({ title: "Connection Error", description: `Video chat connect error: ${String(err)}`, variant: "destructive" });
      setIsFindingPartner(false); setIsPartnerTyping(false);
    };
    const onPartnerTypingStart = () => setIsPartnerTyping(true);
    const onPartnerTypingStop = () => setIsPartnerTyping(false);

    if (newSocket.connected) onConnect(); else newSocket.on('connect', onConnect);
    newSocket.on('partnerFound', onPartnerFound); newSocket.on('waitingForPartner', onWaitingForPartner); newSocket.on('findPartnerCooldown', onFindPartnerCooldown);
    newSocket.on('receiveMessage', onReceiveMessage); newSocket.on('webrtcSignal', onWebRTCSignal); newSocket.on('partnerLeft', onPartnerLeft);
    newSocket.on('disconnect', onDisconnectHandler); newSocket.on('connect_error', onConnectError);
    newSocket.on('partner_typing_start', onPartnerTypingStart); newSocket.on('partner_typing_stop', onPartnerTypingStop);

    return () => {
      console.log(`${LOG_PREFIX}: Cleaning up video chat. Disconnecting socket: ${newSocket?.id}`);
      if (roomIdRef.current && newSocket?.connected) newSocket.emit('leaveChat', { roomId: roomIdRef.current });
      newSocket.removeAllListeners(); newSocket.disconnect(); socketRef.current = null; cleanupConnections(true);
      changeFavicon(FAVICON_DEFAULT, true);
      if (successTransitionIntervalRef.current) clearInterval(successTransitionIntervalRef.current); if (successTransitionEndTimeoutRef.current) clearTimeout(successTransitionEndTimeoutRef.current);
      if (skippedFaviconTimeoutRef.current) clearTimeout(skippedFaviconTimeoutRef.current); if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current); if (localTypingTimeoutRef.current) clearTimeout(localTypingTimeoutRef.current);
    };
  }, [addMessageToList, toast, interests, changeFavicon, getCameraStream, setupWebRTC, cleanupConnections, isMounted, hasCameraPermission, isPartnerConnected, isFindingPartner]);

  useEffect(() => { setIsMounted(true); if (hasCameraPermission === undefined) getCameraStream(); }, [getCameraStream, hasCameraPermission]);

  useEffect(() => {
    if (effectivePageTheme === 'theme-98') {
      setEmojisLoading(true);
      fetch('/emote_index.json').then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
        .then((data: EmoteData[]) => setPickerEmojiFilenames(data.map(e => e.filename)))
        .catch(err => { console.error(`${LOG_PREFIX}: Error fetching emote_index.json:`, err); toast({ title: "Emoji Error", description: `Could not load emojis: ${err.message}`, variant: "destructive" }); setPickerEmojiFilenames([]); })
        .finally(() => setEmojisLoading(false));
    } else { setEmojisLoading(false); setPickerEmojiFilenames([]); }
  },[effectivePageTheme, toast]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isPartnerTyping]);

  const stopLocalTyping = useCallback(() => {
    if (localTypingTimeoutRef.current) clearTimeout(localTypingTimeoutRef.current); localTypingTimeoutRef.current = null;
    if (isLocalTypingRef.current && socketRef.current?.connected && roomIdRef.current) { socketRef.current.emit('typing_stop', { roomId: roomIdRef.current }); isLocalTypingRef.current = false; }
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    const currentSocket = socketRef.current; const currentRoomId = roomIdRef.current;
    if (currentSocket?.connected && currentRoomId && isPartnerConnected) {
      if (e.target.value.trim() !== '' && !isLocalTypingRef.current) { currentSocket.emit('typing_start', { roomId: currentRoomId }); isLocalTypingRef.current = true; }
      if (localTypingTimeoutRef.current) clearTimeout(localTypingTimeoutRef.current);
      if (e.target.value.trim() !== '') { localTypingTimeoutRef.current = setTimeout(() => { if (socketRef.current?.connected && roomIdRef.current) { socketRef.current.emit('typing_stop', { roomId: roomIdRef.current }); isLocalTypingRef.current = false; }}, 2000); }
      else if (isLocalTypingRef.current) stopLocalTyping();
    }
  }, [isPartnerConnected, stopLocalTyping]);

  const handleSendMessage = useCallback(() => {
    const trimmedMessage = newMessage.trim(); const currentSocket = socketRef.current; const currentRoomId = roomIdRef.current;
    console.log(`${LOG_PREFIX}: Attempting send (video). Msg: ${trimmedMessage}, Socket: ${!!currentSocket?.connected}, Room: ${currentRoomId}, Partner Connected: ${isPartnerConnected}, Username: ${ownProfileUsername}`);
    if (!trimmedMessage || !currentSocket?.connected || !currentRoomId || !isPartnerConnected) { 
        let warning = "Send message (video) aborted. Conditions not met.";
        if (!trimmedMessage) warning += " Message is empty.";
        if (!currentSocket?.connected) warning += " Socket not connected.";
        if (!currentRoomId) warning += " Room ID is null.";
        if (!isPartnerConnected) warning += " Partner not connected.";
        console.warn(`${LOG_PREFIX}: ${warning}`);

        if (!currentSocket?.connected) toast({ title: "Not Connected", description: "Cannot send message, not connected to server.", variant: "destructive" });
        else if (!isPartnerConnected) toast({ title: "No Partner", description: "Cannot send message, no partner connected.", variant: "destructive" });
        else if (!currentRoomId) toast({ title: "No Room", description: "Cannot send message, not in a room.", variant: "destructive" });
        return;
    }
    currentSocket.emit('sendMessage', { roomId: currentRoomId, message: trimmedMessage, username: ownProfileUsername });
    addMessageToList(trimmedMessage, 'me'); setNewMessage(''); stopLocalTyping();
  }, [newMessage, isPartnerConnected, addMessageToList, stopLocalTyping, ownProfileUsername, toast]);

  const handleEmojiIconHover = useCallback(() => {
    if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current); if (STATIC_DISPLAY_EMOJI_FILENAMES.length === 0) return;
    hoverIntervalRef.current = setInterval(() => { const i = Math.floor(Math.random() * STATIC_DISPLAY_EMOJI_FILENAMES.length); setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${STATIC_DISPLAY_EMOJI_FILENAMES[i]}`); }, 300);
  },[]);
  const stopEmojiCycle = useCallback(() => { if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current); hoverIntervalRef.current = null; setCurrentEmojiIconUrl(`${EMOJI_BASE_URL_DISPLAY}${SMILE_EMOJI_FILENAME}`); },[]);
  const toggleEmojiPicker = useCallback(() => setIsEmojiPickerOpen(prev => !prev),[]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        const emojiIcon = document.getElementById('emoji-icon-trigger-video');
        if (!emojiIcon || !emojiIcon.contains(event.target as Node)) setIsEmojiPickerOpen(false);
      }
    };
    if (isEmojiPickerOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEmojiPickerOpen]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPartnerTyping) interval = setInterval(() => setTypingDots(prev => prev.length >= 3 ? '.' : prev + '.'), 500);
    else setTypingDots('.');
    return () => { if (interval) clearInterval(interval); };
  }, [isPartnerTyping]);

  const findOrDisconnectText = useMemo(() => { if (isPartnerConnected) return 'Disconnect'; if (isFindingPartner) return 'Stop Searching'; return 'Find Partner'; }, [isPartnerConnected, isFindingPartner]);
  const mainButtonDisabled = !socketRef.current?.connected || socketError;
  const inputAndSendDisabled = !socketRef.current?.connected || !isPartnerConnected || isFindingPartner || socketError;
  const messagesContainerHeight = `calc(100% - ${INPUT_AREA_HEIGHT}px)`;

  if (!isMounted) return <div className="flex flex-1 items-center justify-center p-4"><p>Loading video chat...</p></div>;

  return (
    <>
      <HomeButton />
      <div className="flex flex-col items-center justify-center w-full p-2 md:p-4">
        <div className="flex justify-center gap-4 mb-4 mx-auto">
          <div className={cn('window flex flex-col m-2', effectivePageTheme === 'theme-7' ? 'glass' : '')} style={{width: '325px', height: '198px'}}>
            <div className={cn("title-bar text-sm video-feed-title-bar", effectivePageTheme === 'theme-98' ? '' : 'theme-7')}><div className="title-bar-text"></div></div>
            <div className={cn('window-body flex-grow overflow-hidden relative p-0', effectivePageTheme === 'theme-7' && 'bg-white/30')}>
              <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover bg-black" data-ai-hint="local camera" />
              { hasCameraPermission === false && <Alert variant="destructive" className="m-1 absolute bottom-0 left-0 right-0 text-xs p-1"><AlertTitle className="text-xs">Camera Denied</AlertTitle></Alert> }
              { hasCameraPermission === undefined && isMounted && <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75"><p className="text-white text-center p-2 text-sm">Requesting camera...</p></div> }
            </div>
          </div>
          <div className={cn('window flex flex-col m-2', effectivePageTheme === 'theme-7' ? 'glass' : '')} style={{width: '325px', height: '198px'}}>
            <div className={cn("title-bar text-sm video-feed-title-bar", effectivePageTheme === 'theme-98' ? '' : 'theme-7')}><div className="title-bar-text"></div></div>
            <div className={cn('window-body flex-grow overflow-hidden relative p-0', effectivePageTheme === 'theme-7' && 'bg-white/30')}>
              <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover bg-black" data-ai-hint="remote camera" />
              {isFindingPartner && !isPartnerConnected && <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75"><p className="text-white text-center p-2 text-sm">Searching...</p></div>}
              {!isFindingPartner && !isPartnerConnected && !socketError && <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75"><p className="text-white text-center p-2 text-sm">Partner video unavailable</p></div>}
              {socketError && <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75"><p className="text-white text-center p-2 text-sm">Connection error.</p></div>}
            </div>
          </div>
        </div>
        <div className={cn('window flex flex-col flex-1 relative m-2', effectivePageTheme === 'theme-7' ? 'glass' : '')} style={{ minHeight: '300px', width: '100%', maxWidth: '500px', height: '500px', margin: '0 auto' }}>
          <div className={cn("title-bar", effectivePageTheme === 'theme-7' ? 'text-black' : '')}><div className="flex items-center flex-grow"><div className="title-bar-text">Video Chat</div></div></div>
          <div className={cn('window-body window-body-content flex-grow', effectivePageTheme === 'theme-7' ? 'glass-body-padding' : 'p-0.5')}>
            <div className={cn("flex-grow overflow-y-auto", effectivePageTheme === 'theme-7' ? 'border p-2 bg-white bg-opacity-20 dark:bg-gray-700 dark:bg-opacity-20' : 'sunken-panel tree-view p-1')} style={{ height: messagesContainerHeight }}>
              <div>
                {messages.map((msg, index) => (<Row key={msg.id} message={msg} theme={effectivePageTheme} previousMessageSender={index > 0 ? messages[index-1]?.sender : undefined} pickerEmojiFilenames={pickerEmojiFilenames} ownUsername={ownProfileUsername} />))}
                {isPartnerTyping && <div className={cn("text-xs italic text-left pl-1 py-0.5", effectivePageTheme === 'theme-7' ? 'theme-7-text-shadow text-gray-100' : 'text-gray-500 dark:text-gray-400')}>{messages.find(m=>m.sender==='partner')?.senderUsername||'Stranger'} is typing{typingDots}</div>}
                <div ref={messagesEndRef} />
              </div>
            </div>
            <div className={cn("p-2 flex-shrink-0", effectivePageTheme === 'theme-7' ? 'input-area border-t dark:border-gray-600' : 'input-area status-bar')} style={{ height: `${INPUT_AREA_HEIGHT}px` }}>
              <div className="flex items-center w-full">
                <Button onClick={handleFindOrDisconnectPartner} disabled={mainButtonDisabled} className={cn('mr-1', effectivePageTheme === 'theme-7' ? 'glass-button-styled' : 'px-1 py-1')} aria-label={findOrDisconnectText}>{findOrDisconnectText}</Button>
                <Input type="text" value={newMessage} onChange={handleInputChange} onKeyPress={(e) => e.key === 'Enter' && !inputAndSendDisabled && handleSendMessage()} placeholder="Type a message..." className="flex-1 w-full px-1 py-1" disabled={inputAndSendDisabled} aria-label="Chat message input" />
                {effectivePageTheme === 'theme-98' && (
                  <div className="relative ml-1 flex-shrink-0">
                    <img id="emoji-icon-trigger-video" src={currentEmojiIconUrl} alt="Emoji" className="w-4 h-4 cursor-pointer inline-block" onMouseEnter={handleEmojiIconHover} onMouseLeave={stopEmojiCycle} onClick={toggleEmojiPicker} data-ai-hint="emoji icon" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && toggleEmojiPicker()} role="button" aria-haspopup="true" aria-expanded={isEmojiPickerOpen} />
                    {isEmojiPickerOpen && (
                      <div ref={emojiPickerRef} className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-silver border border-raised z-30 window" style={{ boxShadow: 'inset 1px 1px #fff, inset -1px -1px gray, 1px 1px gray' }} role="dialog" aria-label="Emoji picker">
                        {emojisLoading ? <p className="text-center w-full text-xs">Loading emojis...</p>: pickerEmojiFilenames.length > 0 ? (
                          <div className="h-32 overflow-y-auto grid grid-cols-4 gap-1" role="grid">
                            {pickerEmojiFilenames.map((filename) => { const shortcode = filename.split('.')[0]; return <img key={filename} src={`${EMOJI_BASE_URL_PICKER}${filename}`} alt={shortcode} className="max-w-6 max-h-6 object-contain cursor-pointer hover:bg-navy hover:p-0.5" onClick={() => { setNewMessage(prev => prev + ` :${shortcode}: `); setIsEmojiPickerOpen(false); }} data-ai-hint="emoji symbol" role="gridcell" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && (() => { setNewMessage(prev => prev + ` :${shortcode}: `); setIsEmojiPickerOpen(false); })()} />; })}
                          </div>
                        ) : <p className="text-center w-full text-xs">No emojis found.</p>}
                      </div>
                    )}
                  </div>
                )}
                <Button onClick={handleSendMessage} disabled={inputAndSendDisabled || !newMessage.trim()} className={cn('ml-1', effectivePageTheme === 'theme-7' ? 'glass-button-styled' : 'px-1 py-1')} aria-label="Send message">Send</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
export default VideoChatPageClientContent;


    