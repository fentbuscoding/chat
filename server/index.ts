
import http from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { z } from 'zod';

// Define allowed origins
const allowedOrigins = [
  "https://studio--chitchatconnect-aqa0w.us-central1.hosted.app",
  "https://delightful-pond-0cb3e0010.6.azurestaticapps.net",
  "https://tinchat.online",
  "https://www.tinchat.online",
  "https://6000-idx-studio-1746229586647.cluster-73qgvk7hjjadkrjeyexca5ivva.cloudworkstations.dev",
  "http://localhost:9002"
];

const server = http.createServer((req, res) => {
  const requestOrigin = req.headers.origin;
  let originToAllow = undefined;

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    originToAllow = requestOrigin;
  }

  if (originToAllow) {
    res.setHeader('Access-Control-Allow-Origin', originToAllow);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    if (originToAllow) { 
        res.writeHead(204);
    } else {
        res.writeHead(403);
    }
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: "ok", 
      onlineUserCount: onlineUserCount,
      waitingTextChat: waitingUsers.text.length,
      waitingVideoChat: waitingUsers.video.length
    }));
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Socket.IO Server is running and configured for CORS.\n');
  }
});

const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS: Denied origin - ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

interface User {
  id: string;
  interests: string[];
  chatType: 'text' | 'video';
}

interface Room {
  id: string;
  users: string[];
  chatType: 'text' | 'video';
}

const waitingUsers: { [key in 'text' | 'video']: User[] } = {
  text: [],
  video: [],
};
const rooms: { [roomId: string]: Room } = {};
let onlineUserCount = 0;
const lastMatchRequest: { [socketId: string]: number } = {};
const FIND_PARTNER_COOLDOWN_MS = 2000; // 2 seconds

// Zod Schemas for input validation
const StringArraySchema = z.array(z.string().max(100)).max(10);

const FindPartnerPayloadSchema = z.object({
  chatType: z.enum(['text', 'video']),
  interests: StringArraySchema,
});

const RoomIdPayloadSchema = z.object({
  roomId: z.string().regex(/^[a-zA-Z0-9#-_]+$/).max(100),
});

const SendMessagePayloadSchema = RoomIdPayloadSchema.extend({
  message: z.string().min(1).max(2000),
  username: z.string().max(30).optional(),
});

const WebRTCSignalPayloadSchema = RoomIdPayloadSchema.extend({
  signalData: z.any(),
});


function removeFromWaitingLists(socketId: string) {
  (['text', 'video'] as const).forEach(type => {
    const index = waitingUsers[type].findIndex(u => u.id === socketId);
    if (index !== -1) {
      waitingUsers[type].splice(index, 1);
      console.log(`[WAITING_LIST] User ${socketId} removed from ${type} waiting list.`);
    }
  });
}

const findMatch = (currentUser: User): User | null => {
  const allWaitingForType = waitingUsers[currentUser.chatType];
  let potentialPartners = allWaitingForType.filter(p => p.id !== currentUser.id);

  if (potentialPartners.length === 0) {
    console.log(`[MATCH_LOGIC] No potential partners for ${currentUser.id} in ${currentUser.chatType} list.`);
    return null;
  }

  if (currentUser.interests.length > 0) {
    for (let i = 0; i < potentialPartners.length; i++) {
      const partner = potentialPartners[i];
      if (partner.interests && partner.interests.some(interest => currentUser.interests.includes(interest))) {
        const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === partner.id);
        if (originalIndexInWaitingList > -1) {
          console.log(`[MATCH_LOGIC] Interest match found: ${currentUser.id} with ${partner.id} on interests: ${partner.interests.filter(interest => currentUser.interests.includes(interest)).join(', ')}`);
          return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
        }
        console.warn(`[MATCH_LOGIC_WARN] Interest-matched partner ${partner.id} selected from potential list but not found in main waiting list for splicing.`);
      }
    }
    console.log(`[MATCH_LOGIC] No interest-based match for ${currentUser.id}. Proceeding to random match from remaining partners.`);
  }

  potentialPartners = allWaitingForType.filter(p => p.id !== currentUser.id); // Re-filter if no interest match or no interests
  if (potentialPartners.length > 0) {
    const randomIndex = Math.floor(Math.random() * potentialPartners.length);
    const randomPartnerToMatch = potentialPartners[randomIndex]; 
    
    const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === randomPartnerToMatch.id);
    if (originalIndexInWaitingList > -1) {
      console.log(`[MATCH_LOGIC] Random match found: ${currentUser.id} with ${randomPartnerToMatch.id}`);
      return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
    }
    console.warn(`[MATCH_LOGIC_WARN] Randomly selected partner ${randomPartnerToMatch.id} not found in main waiting list for splicing (post-interest check).`);
  }

  return null;
};


io.on('connection', (socket: Socket) => {
  onlineUserCount++;
  console.log(`[CONNECT] User connected: ${socket.id}. Total online: ${onlineUserCount}`);
  io.emit('onlineUserCountUpdate', onlineUserCount);

  socket.on('getOnlineUserCount', () => {
    socket.emit('onlineUserCount', onlineUserCount);
  });

  socket.on('findPartner', (payload: unknown) => {
    try {
      const validatedPayload = FindPartnerPayloadSchema.parse(payload);
      const { chatType, interests } = validatedPayload;

      const now = Date.now();
      if (now - (lastMatchRequest[socket.id] || 0) < FIND_PARTNER_COOLDOWN_MS) {
        console.log(`[RATE_LIMIT] User ${socket.id} findPartner request ignored due to cooldown.`);
        socket.emit('findPartnerCooldown'); 
        return;
      }
      lastMatchRequest[socket.id] = now;

      console.log(`[FIND_PARTNER_REQUEST] User ${socket.id} looking for ${chatType} chat with interests: ${interests.join(', ')}`);
      removeFromWaitingLists(socket.id); 
      const currentUser: User = { id: socket.id, interests, chatType };
      
      const matchedPartner = findMatch(currentUser);

      if (matchedPartner) {
        const partnerSocket = io.sockets.sockets.get(matchedPartner.id);
        if (partnerSocket && partnerSocket.connected) {
          const roomId = `${currentUser.id}#${Date.now()}`; 
          rooms[roomId] = { id: roomId, users: [currentUser.id, matchedPartner.id], chatType };

          socket.join(roomId);
          partnerSocket.join(roomId);
          console.log(`[MATCH_SUCCESS] ${currentUser.id} and ${matchedPartner.id} joined room ${roomId}. Emitting 'partnerFound'.`);

          // Emit to current user
          socket.emit('partnerFound', { 
            partnerId: matchedPartner.id, 
            roomId, 
            interests: matchedPartner.interests 
            // partnerUsername could be fetched and sent here if available server-side
          });
          // Emit to matched partner
          partnerSocket.emit('partnerFound', { 
            partnerId: currentUser.id, 
            roomId, 
            interests: currentUser.interests
            // currentUserUsername could be fetched and sent here
          });
        } else {
          console.error(`[MATCH_FAIL] Partner ${matchedPartner.id} socket not found or disconnected. Re-queuing current user ${currentUser.id}.`);
          if (!waitingUsers[currentUser.chatType].some(user => user.id === currentUser.id)) {
              waitingUsers[currentUser.chatType].push(currentUser); // Re-queue current user
          }
          if (matchedPartner && !waitingUsers[matchedPartner.chatType].some(user => user.id === matchedPartner.id)) {
             waitingUsers[matchedPartner.chatType].unshift(matchedPartner); // Try to re-queue partner if info is available
          }
          socket.emit('waitingForPartner'); 
        }
      } else {
        if (!waitingUsers[chatType].some(user => user.id === socket.id)) {
          waitingUsers[chatType].push(currentUser);
        }
        console.log(`[WAITING_FOR_PARTNER] User ${socket.id} added to ${chatType} waiting list. Emitting 'waitingForPartner'.`);
        socket.emit('waitingForPartner');
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL] Invalid findPartner payload from ${socket.id}:`, error.errors || error.message);
      socket.emit('error', { message: 'Invalid payload for findPartner.' });
    }
  });

  socket.on('sendMessage', (payload: unknown) => {
    try {
      const { roomId, message, username } = SendMessagePayloadSchema.parse(payload);
      console.log(`[MESSAGE_RECEIVED_SERVER] User ${socket.id} (attempted username: ${username || 'N/A'}) sending message to room ${roomId}: "${message}"`);
      
      if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
        console.log(`[MESSAGE_RELAY] Relaying message from ${socket.id} to room ${roomId}. Sender username: ${username || 'Stranger'}`);
        socket.to(roomId).emit('receiveMessage', { 
          senderId: socket.id, 
          message,
          senderUsername: username || 'Stranger'
        });
      } else {
        const roomExists = !!rooms[roomId];
        const userInRoom = roomExists && rooms[roomId].users.includes(socket.id);
        console.warn(`[MESSAGE_WARN] User ${socket.id} (username: ${username || 'N/A'}) tried to send message to room ${roomId}. Room exists: ${roomExists}, User in room: ${userInRoom}. Room users: ${rooms[roomId]?.users}`);
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL] Invalid sendMessage payload from ${socket.id}:`, error.errors || error.message);
      socket.emit('error', { message: 'Invalid payload for sendMessage.' });
    }
  });

  socket.on('webrtcSignal', (payload: unknown) => {
    try {
      const { roomId, signalData } = WebRTCSignalPayloadSchema.parse(payload);
      if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
          console.log(`[WEBRTC_SIGNAL] User ${socket.id} sending signal to room ${roomId}`);
          socket.to(roomId).emit('webrtcSignal', signalData);
      } else {
          console.warn(`[WEBRTC_SIGNAL_WARN] User ${socket.id} tried to send signal to room ${roomId} but not in room or room non-existent.`);
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL] Invalid webrtcSignal payload from ${socket.id}:`, error.errors || error.message);
      socket.emit('error', { message: 'Invalid payload for webrtcSignal.' });
    }
  });
  
  socket.on('typing_start', (payload: unknown) => {
    try {
      const { roomId } = RoomIdPayloadSchema.parse(payload);
      if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
        socket.to(roomId).emit('partner_typing_start');
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL] Invalid typing_start payload from ${socket.id}:`, error.errors || error.message);
    }
  });

  socket.on('typing_stop', (payload: unknown) => {
    try {
      const { roomId } = RoomIdPayloadSchema.parse(payload);
      if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
        socket.to(roomId).emit('partner_typing_stop');
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL] Invalid typing_stop payload from ${socket.id}:`, error.errors || error.message);
    }
  });

  const cleanupUser = (reason: string) => {
    console.log(`[CLEANUP_USER] User ${socket.id} disconnecting/cleaning up. Reason: ${reason}`);
    onlineUserCount = Math.max(0, onlineUserCount - 1); 
    io.emit('onlineUserCountUpdate', onlineUserCount);
    removeFromWaitingLists(socket.id);
    delete lastMatchRequest[socket.id]; 

    for (const roomIdInLoop in rooms) {
        if (rooms.hasOwnProperty(roomIdInLoop)) {
            const room = rooms[roomIdInLoop];
            const userIndexInRoom = room.users.indexOf(socket.id);
            if (userIndexInRoom > -1) {
                console.log(`[CLEANUP_USER] User ${socket.id} was in room ${room.id}. Notifying partner and deleting room.`);
                const partnerId = room.users.find(id => id !== socket.id);
                if (partnerId) {
                    const partnerSocket = io.sockets.sockets.get(partnerId);
                    if (partnerSocket && partnerSocket.connected) {
                      console.log(`[CLEANUP_USER] Emitting 'partnerLeft' to ${partnerId} in room ${room.id}.`);
                      partnerSocket.emit('partnerLeft');
                      partnerSocket.leave(room.id); 
                    } else {
                      console.log(`[CLEANUP_USER] Partner ${partnerId} socket not found or disconnected for room ${room.id}.`);
                    }
                }
                delete rooms[room.id];
                break; 
            }
        }
    }
    console.log(`[CLEANUP_USER] Finished for ${socket.id}.`);
  };

  socket.on('leaveChat', (payload: unknown) => {
    try {
      const { roomId } = RoomIdPayloadSchema.parse(payload);
      console.log(`[LEAVE_CHAT_REQUEST] User ${socket.id} requests to leave room ${roomId}`);
      if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
          const room = rooms[roomId];
          const partnerId = room.users.find(id => id !== socket.id);

          socket.leave(roomId); 
          console.log(`[LEAVE_CHAT_SELF] User ${socket.id} left Socket.IO room ${roomId}`);

          if (partnerId) {
              const partnerSocket = io.sockets.sockets.get(partnerId);
              if (partnerSocket && partnerSocket.connected) {
                  console.log(`[LEAVE_CHAT_NOTIFY_PARTNER] Emitting 'partnerLeft' to ${partnerId} for room ${roomId}`);
                  partnerSocket.emit('partnerLeft');
                  partnerSocket.leave(roomId); 
                  console.log(`[LEAVE_CHAT_PARTNER_LEFT_ROOM] Partner ${partnerId} made to leave Socket.IO room ${roomId}`);
              } else {
                 console.log(`[LEAVE_CHAT_WARN] Partner ${partnerId} socket not found or disconnected when ${socket.id} left room ${roomId}`);
              }
          }
          delete rooms[roomId]; 
          console.log(`[LEAVE_CHAT_SUCCESS] User ${socket.id} processed leaveChat for room ${roomId}. Room deleted.`);
      } else {
          const roomExists = !!rooms[roomId];
          const userInRoom = roomExists && rooms[roomId].users.includes(socket.id);
          console.warn(`[LEAVE_CHAT_WARN] User ${socket.id} tried to leave room ${roomId}, but room was not found (${roomExists}) or user not in it (${userInRoom}). Room users: ${rooms[roomId]?.users}`);
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL] Invalid leaveChat payload from ${socket.id}:`, error.errors || error.message);
      socket.emit('error', { message: 'Invalid payload for leaveChat.' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT_EVENT] User ${socket.id} disconnected. Reason: ${reason}`);
    cleanupUser(`socket.io disconnect: ${reason}`);
  });
});

server.listen(PORT, () => {
  console.log(`[SERVER_START] Socket.IO server running on port ${PORT}`);
});

export {};
    
