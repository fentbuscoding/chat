
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
        console.warn(`[CORS_DENIED] Origin - ${origin}`);
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
  users: string[]; // Should contain socket IDs
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
      console.log(`[WAITING_LIST_REMOVE] User ${socketId} removed from ${type} waiting list.`);
    }
  });
}

const findMatch = (currentUser: User): User | null => {
  const allWaitingForType = waitingUsers[currentUser.chatType];
  let potentialPartners = allWaitingForType.filter(p => p.id !== currentUser.id);

  if (potentialPartners.length === 0) {
    console.log(`[MATCH_LOGIC_NO_PARTNERS] No potential partners for ${currentUser.id} in ${currentUser.chatType} list.`);
    return null;
  }

  if (currentUser.interests.length > 0) {
    for (let i = 0; i < potentialPartners.length; i++) {
      const partner = potentialPartners[i];
      if (partner.interests && partner.interests.some(interest => currentUser.interests.includes(interest))) {
        const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === partner.id);
        if (originalIndexInWaitingList > -1) {
          console.log(`[MATCH_LOGIC_INTEREST] Interest match found: ${currentUser.id} with ${partner.id} on interests: ${partner.interests.filter(interest => currentUser.interests.includes(interest)).join(', ')}`);
          return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
        }
        console.warn(`[MATCH_LOGIC_WARN_SPLICE_INTEREST] Interest-matched partner ${partner.id} selected but not found in main waiting list for splicing.`);
      }
    }
    console.log(`[MATCH_LOGIC_NO_INTEREST_MATCH] No interest-based match for ${currentUser.id}. Proceeding to random match.`);
  }

  potentialPartners = allWaitingForType.filter(p => p.id !== currentUser.id);
  if (potentialPartners.length > 0) {
    const randomIndex = Math.floor(Math.random() * potentialPartners.length);
    const randomPartnerToMatch = potentialPartners[randomIndex];

    const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === randomPartnerToMatch.id);
    if (originalIndexInWaitingList > -1) {
      console.log(`[MATCH_LOGIC_RANDOM] Random match found: ${currentUser.id} with ${randomPartnerToMatch.id}`);
      return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
    }
    console.warn(`[MATCH_LOGIC_WARN_SPLICE_RANDOM] Randomly selected partner ${randomPartnerToMatch.id} not found in main waiting list for splicing.`);
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
        console.log(`[RATE_LIMIT_FIND_PARTNER] User ${socket.id} findPartner request ignored due to cooldown.`);
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
          console.log(`[SERVER_ROOM_CREATED] Room ${roomId} created for users ${currentUser.id} and ${matchedPartner.id}.`);


          console.log(`[MATCH_ATTEMPT_JOIN] Attempting to join ${currentUser.id} to room ${roomId}`);
          socket.join(roomId);
          console.log(`[MATCH_ATTEMPT_JOIN] Attempting to join ${matchedPartner.id} to room ${roomId}`);
          partnerSocket.join(roomId);
          console.log(`[MATCH_SUCCESS] ${currentUser.id} and ${matchedPartner.id} joined room ${roomId}. Emitting 'partnerFound'. Room details: ${JSON.stringify(rooms[roomId])}. Sockets in room: ${Array.from(io.sockets.adapter.rooms.get(roomId) || []).join(', ')}`);


          socket.emit('partnerFound', {
            partnerId: matchedPartner.id,
            roomId,
            interests: matchedPartner.interests,
          });
          partnerSocket.emit('partnerFound', {
            partnerId: currentUser.id,
            roomId,
            interests: currentUser.interests,
          });
        } else {
          console.warn(`[MATCH_FAIL_SOCKET_ISSUE] Partner ${matchedPartner.id} socket not found or disconnected. Re-queuing current user ${currentUser.id}.`);
          if (!waitingUsers[currentUser.chatType].some(user => user.id === currentUser.id)) {
              waitingUsers[currentUser.chatType].push(currentUser);
          }
          if (matchedPartner && !waitingUsers[matchedPartner.chatType].some(user => user.id === matchedPartner.id)) {
             waitingUsers[matchedPartner.chatType].unshift(matchedPartner);
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
      console.warn(`[VALIDATION_FAIL_FIND_PARTNER] Invalid findPartner payload from ${socket.id}: ${error.errors ? JSON.stringify(error.errors) : error.message}`);
      socket.emit('error', { message: 'Invalid payload for findPartner.' });
    }
  });

  socket.on('sendMessage', (payload: unknown) => {
    try {
      const { roomId, message, username } = SendMessagePayloadSchema.parse(payload);
      console.log(`[MESSAGE_RECEIVED_SERVER] User ${socket.id} (username: ${username || 'N/A'}) sending message to room ${roomId}: "${message}"`);

      const roomDetails = rooms[roomId];
      if (!roomDetails) {
        console.warn(`[MESSAGE_WARN_SEND_FAIL] Room ${roomId} not found for message from ${socket.id}.`);
        return;
      }
      console.log(`[MESSAGE_DEBUG_ROOM_DETAILS] Room ${roomId} details: ${JSON.stringify(roomDetails)}`);
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      console.log(`[MESSAGE_DEBUG_SOCKETS_IN_ROOM] Sockets currently in Socket.IO room ${roomId}: ${socketsInRoom ? Array.from(socketsInRoom).join(', ') : 'NONE'}`);


      if (roomDetails.users.includes(socket.id)) {
        const senderUsernameOrDefault = username || 'Stranger';
        const messagePayload = {
          senderId: socket.id,
          message,
          senderUsername: senderUsernameOrDefault,
        };

        const partnerId = roomDetails.users.find(id => id !== socket.id);
        console.log(`[MESSAGE_DEBUG_PARTNER_ID] Determined partnerId for message relay: ${partnerId} in room ${roomId}.`);

        if (partnerId) {
          console.log(`[MESSAGE_RELAY_DIRECT_IO_TO] Relaying message from ${socket.id} directly to partner ${partnerId} (via io.to) in room ${roomId}. Sender username: ${senderUsernameOrDefault}.`);
          io.to(partnerId).emit('receiveMessage', messagePayload);
          console.log(`[MESSAGE_RELAY_DIRECT_IO_TO_SENT] 'receiveMessage' emitted via io.to(${partnerId}).`);
        } else {
          console.warn(`[MESSAGE_WARN_RELAY_FAIL] No partner found in room ${roomId} for user ${socket.id} to relay message. Room users: ${JSON.stringify(roomDetails.users)}`);
        }
      } else {
        console.warn(`[MESSAGE_WARN_SEND_FAIL] User ${socket.id} (username: ${username || 'N/A'}) tried to send to room ${roomId} but is NOT LISTED in room.users. Room users: ${JSON.stringify(roomDetails.users)}`);
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL_SEND_MESSAGE] Invalid sendMessage payload from ${socket.id}: ${error.errors ? JSON.stringify(error.errors) : error.message}`);
      socket.emit('error', { message: 'Invalid payload for sendMessage.' });
    }
  });


  socket.on('webrtcSignal', (payload: unknown) => {
    try {
      const { roomId, signalData } = WebRTCSignalPayloadSchema.parse(payload);
      const roomDetails = rooms[roomId];
      if (roomDetails && roomDetails.users.includes(socket.id)) {
          console.log(`[WEBRTC_SIGNAL] User ${socket.id} sending signal to room ${roomId}`);
          const partnerId = roomDetails.users.find(id => id !== socket.id);
          if (partnerId) {
            io.to(partnerId).emit('webrtcSignal', signalData);
            console.log(`[WEBRTC_SIGNAL_SENT_IO_TO] Signal from ${socket.id} sent via io.to(${partnerId}) in room ${roomId}.`);
          } else {
            console.warn(`[WEBRTC_SIGNAL_WARN_FAIL] No partner found in room ${roomId} for user ${socket.id} to send signal.`);
          }
      } else {
          console.warn(`[WEBRTC_SIGNAL_WARN_FAIL] User ${socket.id} tried to send signal to room ${roomId} but not in room or room non-existent. Room details: ${JSON.stringify(roomDetails)}`);
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL_WEBRTC_SIGNAL] Invalid webrtcSignal payload from ${socket.id}: ${error.errors ? JSON.stringify(error.errors) : error.message}`);
      socket.emit('error', { message: 'Invalid payload for webrtcSignal.' });
    }
  });

  socket.on('typing_start', (payload: unknown) => {
    try {
      const { roomId } = RoomIdPayloadSchema.parse(payload);
      const roomDetails = rooms[roomId];
      if (roomDetails && roomDetails.users.includes(socket.id)) {
        const partnerId = roomDetails.users.find(id => id !== socket.id);
        if (partnerId) {
            console.log(`[TYPING_START] User ${socket.id} started typing in room ${roomId}. Relaying to ${partnerId} via io.to.`);
            io.to(partnerId).emit('partner_typing_start');
        }
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL_TYPING_START] Invalid typing_start payload from ${socket.id}: ${error.errors ? JSON.stringify(error.errors) : error.message}`);
    }
  });

  socket.on('typing_stop', (payload: unknown) => {
    try {
      const { roomId } = RoomIdPayloadSchema.parse(payload);
      const roomDetails = rooms[roomId];
      if (roomDetails && roomDetails.users.includes(socket.id)) {
        const partnerId = roomDetails.users.find(id => id !== socket.id);
        if (partnerId) {
            console.log(`[TYPING_STOP] User ${socket.id} stopped typing in room ${roomId}. Relaying to ${partnerId} via io.to.`);
            io.to(partnerId).emit('partner_typing_stop');
        }
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL_TYPING_STOP] Invalid typing_stop payload from ${socket.id}: ${error.errors ? JSON.stringify(error.errors) : error.message}`);
    }
  });

  const cleanupUser = (reason: string) => {
    console.log(`[CLEANUP_USER_INIT] User ${socket.id} disconnecting/cleaning up. Reason: ${reason}`);
    onlineUserCount = Math.max(0, onlineUserCount - 1);
    io.emit('onlineUserCountUpdate', onlineUserCount);
    removeFromWaitingLists(socket.id);
    delete lastMatchRequest[socket.id];

    for (const roomIdInLoop in rooms) {
        if (rooms.hasOwnProperty(roomIdInLoop)) {
            const room = rooms[roomIdInLoop];
            const userIndexInRoom = room.users.indexOf(socket.id);
            if (userIndexInRoom > -1) {
                console.log(`[CLEANUP_USER_IN_ROOM] User ${socket.id} was in room ${room.id}. Notifying partner and deleting room.`);
                const partnerId = room.users.find(id => id !== socket.id);
                if (partnerId) {
                    console.log(`[CLEANUP_USER_EMIT_PARTNER_LEFT_IO_TO] Emitting 'partnerLeft' via io.to(${partnerId}) for room ${room.id}.`);
                    io.to(partnerId).emit('partnerLeft');
                    // Also ensure partner's socket instance leaves the room if possible
                    const partnerSocket = io.sockets.sockets.get(partnerId);
                    if (partnerSocket) partnerSocket.leave(room.id); else console.warn(`[CLEANUP_USER_WARN] Partner socket ${partnerId} not found to explicitly leave room ${room.id}.`);
                }
                delete rooms[room.id];
                console.log(`[CLEANUP_USER_ROOM_DELETED] Room ${room.id} deleted.`);
                break;
            }
        }
    }
    console.log(`[CLEANUP_USER_COMPLETE] Finished for ${socket.id}.`);
  };

  socket.on('leaveChat', (payload: unknown) => {
    try {
      const { roomId } = RoomIdPayloadSchema.parse(payload);
      console.log(`[LEAVE_CHAT_REQUEST] User ${socket.id} requests to leave room ${roomId}`);
      if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
          const room = rooms[roomId];
          const partnerId = room.users.find(id => id !== socket.id);

          socket.leave(roomId);
          console.log(`[LEAVE_CHAT_SELF_LEFT_ROOM] User ${socket.id} left Socket.IO room ${roomId}`);

          if (partnerId) {
              console.log(`[LEAVE_CHAT_NOTIFY_PARTNER_IO_TO] Emitting 'partnerLeft' via io.to(${partnerId}) for room ${roomId}`);
              io.to(partnerId).emit('partnerLeft');
              const partnerSocket = io.sockets.sockets.get(partnerId);
              if (partnerSocket) {
                 partnerSocket.leave(roomId);
                 console.log(`[LEAVE_CHAT_PARTNER_LEFT_ROOM] Partner ${partnerId} made to leave Socket.IO room ${roomId}`);
              } else {
                 console.log(`[LEAVE_CHAT_WARN_PARTNER_SOCKET] Partner ${partnerId} socket not found to explicitly leave room ${roomId} when ${socket.id} left.`);
              }
          }
          delete rooms[roomId];
          console.log(`[LEAVE_CHAT_SUCCESS_ROOM_DELETED] User ${socket.id} processed leaveChat for room ${roomId}. Room deleted.`);
      } else {
          const roomExists = !!rooms[roomId];
          const userInRoom = roomExists && rooms[roomId].users.includes(socket.id);
          console.warn(`[LEAVE_CHAT_WARN_INVALID_REQUEST] User ${socket.id} tried to leave room ${roomId}, but room not found (${roomExists}) or user not in it (${userInRoom}). Room users: ${JSON.stringify(rooms[roomId]?.users)}`);
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL_LEAVE_CHAT] Invalid leaveChat payload from ${socket.id}: ${error.errors ? JSON.stringify(error.errors) : error.message}`);
      socket.emit('error', { message: 'Invalid payload for leaveChat.' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT_EVENT] User ${socket.id} disconnected. Reason: ${reason}`);
    cleanupUser(`socket.io disconnect event: ${reason}`);
  });
});

server.listen(PORT, () => {
  console.log(`[SERVER_START] Socket.IO server running on port ${PORT}`);
});

export {};
    
