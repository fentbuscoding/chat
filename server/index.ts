
import http from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!; // Use service key for server-side operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

// Updated interfaces to include auth info
interface User {
  id: string; // Socket ID
  authId?: string | null; // Supabase auth user ID, can be null
  interests: string[];
  chatType: 'text' | 'video';
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

interface Room {
  id: string;
  users: string[]; // Socket IDs
  chatType: 'text' | 'video';
}

// Map socket IDs to auth user IDs for lookup
const socketToAuthId: { [socketId: string]: string } = {};
const authIdToSocketId: { [authId: string]: string } = {};

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
  authId: z.string().uuid().nullable().optional(),
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

// Helper function to fetch user profile from Supabase
async function fetchUserProfile(authId: string) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('username, display_name, avatar_url')
      .eq('id', authId)
      .single();

    if (error) {
      console.error(`[SUPABASE_ERROR] Error fetching profile for ${authId}:`, error);
      return null;
    }
    return data;
  } catch (err) {
    console.error(`[SUPABASE_EXCEPTION] Exception fetching profile for ${authId}:`, err);
    return null;
  }
}

// Helper function to update user online status
async function updateUserOnlineStatus(authId: string, isOnline: boolean) {
  if (!authId) return;
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({ 
        is_online: isOnline,
        last_seen: new Date().toISOString()
      })
      .eq('id', authId);

    if (error) {
      console.error(`[SUPABASE_ERROR] Error updating online status for ${authId}:`, error);
    }
  } catch (err) {
    console.error(`[SUPABASE_EXCEPTION] Exception updating online status for ${authId}:`, err);
  }
}

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
  const queue = waitingUsers[currentUser.chatType]; 

  if (currentUser.interests.length > 0) {
    for (let i = 0; i < queue.length; i++) {
      const potentialPartner = queue[i];
      if (potentialPartner.id === currentUser.id) continue; 

      const hasCommonInterest = potentialPartner.interests &&
                                potentialPartner.interests.some(interest => currentUser.interests.includes(interest));

      if (hasCommonInterest) {
        const actualIndex = waitingUsers[currentUser.chatType].findIndex(u => u.id === potentialPartner.id);
        
        if (actualIndex !== -1) {
          if (waitingUsers[currentUser.chatType][actualIndex].id === currentUser.id) continue;
          console.log(`[MATCH_LOGIC_INTEREST] Interest match found: ${currentUser.id} with ${waitingUsers[currentUser.chatType][actualIndex].id}`);
          return waitingUsers[currentUser.chatType].splice(actualIndex, 1)[0]; 
        } else {
          console.log(`[MATCH_LOGIC_CONCURRENCY] Interest-candidate ${potentialPartner.id} was already removed from queue. Continuing search.`);
        }
      }
    }
    console.log(`[MATCH_LOGIC_NO_INTEREST_MATCH] No interest-based match for ${currentUser.id}. Proceeding to random match.`);
  }

  const candidates = waitingUsers[currentUser.chatType].filter(p => p.id !== currentUser.id);
  if (candidates.length > 0) {
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; 
    }

    for (const randomPartner of candidates) {
        const actualIndex = waitingUsers[currentUser.chatType].findIndex(u => u.id === randomPartner.id);
        if (actualIndex !== -1) {
            if (waitingUsers[currentUser.chatType][actualIndex].id === currentUser.id) continue;
            console.log(`[MATCH_LOGIC_RANDOM] Random match found: ${currentUser.id} with ${waitingUsers[currentUser.chatType][actualIndex].id}`);
            return waitingUsers[currentUser.chatType].splice(actualIndex, 1)[0]; 
        } else {
            console.log(`[MATCH_LOGIC_CONCURRENCY] Random-candidate ${randomPartner.id} was already removed from queue. Continuing search.`);
        }
    }
  }
  
  console.log(`[MATCH_LOGIC_NO_PARTNERS_END] No potential partners for ${currentUser.id} in ${currentUser.chatType} list after all checks.`);
  return null;
};


io.on('connection', (socket: Socket) => {
  onlineUserCount++;
  console.log(`[CONNECT] User connected: ${socket.id}. Total online: ${onlineUserCount}`);
  io.emit('onlineUserCountUpdate', onlineUserCount);

  socket.on('getOnlineUserCount', () => {
    socket.emit('onlineUserCount', onlineUserCount);
  });

  socket.on('findPartner', async (payload: unknown) => {
    try {
      const validatedPayload = FindPartnerPayloadSchema.parse(payload);
      const { chatType, interests, authId } = validatedPayload;

      const now = Date.now();
      if (now - (lastMatchRequest[socket.id] || 0) < FIND_PARTNER_COOLDOWN_MS) {
        console.log(`[RATE_LIMIT_FIND_PARTNER] User ${socket.id} findPartner request ignored due to cooldown.`);
        socket.emit('findPartnerCooldown');
        return;
      }
      lastMatchRequest[socket.id] = now;

      console.log(`[FIND_PARTNER_REQUEST] User ${socket.id} (authId: ${authId || 'anonymous'}) looking for ${chatType} chat with interests: ${interests.join(', ')}`);
      
      if (authId) {
        socketToAuthId[socket.id] = authId;
        authIdToSocketId[authId] = socket.id;
        await updateUserOnlineStatus(authId, true);
      }

      removeFromWaitingLists(socket.id);
      
      const currentUser: User = { id: socket.id, interests, chatType, authId };
      
      if (authId) {
        const profile = await fetchUserProfile(authId);
        if (profile) {
          currentUser.username = profile.username;
          currentUser.displayName = profile.display_name;
          currentUser.avatarUrl = profile.avatar_url;
        }
      }

      const matchedPartner = findMatch(currentUser);

      if (matchedPartner) {
        const partnerSocket = io.sockets.sockets.get(matchedPartner.id);
        if (partnerSocket && partnerSocket.connected) {
          const roomId = `${currentUser.id}#${Date.now()}`;
          rooms[roomId] = { id: roomId, users: [currentUser.id, matchedPartner.id], chatType };
          console.log(`[SERVER_ROOM_CREATED] Room ${roomId} created for users ${currentUser.id} and ${matchedPartner.id}.`);

          socket.join(roomId);
          partnerSocket.join(roomId);
          console.log(`[MATCH_SUCCESS] ${currentUser.id} and ${matchedPartner.id} joined room ${roomId}. Emitting 'partnerFound'.`);

          socket.emit('partnerFound', {
            partnerId: matchedPartner.id,
            roomId,
            interests: matchedPartner.interests,
            partnerUsername: matchedPartner.username,
            partnerDisplayName: matchedPartner.displayName,
            partnerAvatarUrl: matchedPartner.avatarUrl,
          });
          
          partnerSocket.emit('partnerFound', {
            partnerId: currentUser.id,
            roomId,
            interests: currentUser.interests,
            partnerUsername: currentUser.username,
            partnerDisplayName: currentUser.displayName,
            partnerAvatarUrl: currentUser.avatarUrl,
          });
        } else {
          console.warn(`[MATCH_FAIL_SOCKET_ISSUE] Partner ${matchedPartner.id} socket not found/disconnected. Re-queuing current user ${currentUser.id} and potential partner ${matchedPartner.id}.`);
          if (!waitingUsers[currentUser.chatType].some(user => user.id === currentUser.id)) {
              waitingUsers[currentUser.chatType].push(currentUser); // Add current user back if not already there
          }
          // Add matchedPartner back to the front of their queue if they existed and are not already there
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
      if (roomDetails.users.includes(socket.id)) {
        const senderUsernameOrDefault = username || 'Stranger';
        const messagePayload = { senderId: socket.id, message, senderUsername: senderUsernameOrDefault };
        const partnerId = roomDetails.users.find(id => id !== socket.id);
        if (partnerId) {
          console.log(`[MESSAGE_RELAY_DIRECT_IO_TO] Relaying message from ${socket.id} to partner ${partnerId} in room ${roomId}.`);
          io.to(partnerId).emit('receiveMessage', messagePayload);
        } else {
          console.warn(`[MESSAGE_WARN_RELAY_FAIL] No partner found in room ${roomId} for user ${socket.id}.`);
        }
      } else {
        console.warn(`[MESSAGE_WARN_SEND_FAIL] User ${socket.id} tried to send to room ${roomId} but not in it.`);
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
          const partnerId = roomDetails.users.find(id => id !== socket.id);
          if (partnerId) {
            io.to(partnerId).emit('webrtcSignal', signalData);
            console.log(`[WEBRTC_SIGNAL_SENT_IO_TO] Signal from ${socket.id} sent to ${partnerId} in room ${roomId}.`);
          } else {
            console.warn(`[WEBRTC_SIGNAL_WARN_FAIL] No partner in room ${roomId} for ${socket.id}.`);
          }
      } else {
          console.warn(`[WEBRTC_SIGNAL_WARN_FAIL] User ${socket.id} tried to send signal to room ${roomId} but not in room/room non-existent.`);
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
        if (partnerId) io.to(partnerId).emit('partner_typing_start');
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
        if (partnerId) io.to(partnerId).emit('partner_typing_stop');
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL_TYPING_STOP] Invalid typing_stop payload from ${socket.id}: ${error.errors ? JSON.stringify(error.errors) : error.message}`);
    }
  });

  const cleanupUser = async (reason: string) => {
    console.log(`[CLEANUP_USER_INIT] User ${socket.id} cleaning up. Reason: ${reason}`);
    onlineUserCount = Math.max(0, onlineUserCount - 1);
    io.emit('onlineUserCountUpdate', onlineUserCount);
    removeFromWaitingLists(socket.id);
    delete lastMatchRequest[socket.id];

    const authId = socketToAuthId[socket.id];
    if (authId) {
      await updateUserOnlineStatus(authId, false);
      delete socketToAuthId[socket.id];
      delete authIdToSocketId[authId];
    }

    for (const roomIdInLoop in rooms) {
        if (rooms.hasOwnProperty(roomIdInLoop)) {
            const room = rooms[roomIdInLoop];
            if (room.users.includes(socket.id)) {
                console.log(`[CLEANUP_USER_IN_ROOM] User ${socket.id} was in room ${room.id}.`);
                const partnerId = room.users.find(id => id !== socket.id);
                if (partnerId) {
                    console.log(`[CLEANUP_USER_EMIT_PARTNER_LEFT_IO_TO] Emitting 'partnerLeft' to ${partnerId} for room ${room.id}.`);
                    io.to(partnerId).emit('partnerLeft');
                    const partnerSocket = io.sockets.sockets.get(partnerId);
                    if (partnerSocket) partnerSocket.leave(room.id);
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
          if (partnerId) {
              io.to(partnerId).emit('partnerLeft');
              const partnerSocket = io.sockets.sockets.get(partnerId);
              if (partnerSocket) partnerSocket.leave(roomId);
          }
          delete rooms[roomId];
          console.log(`[LEAVE_CHAT_SUCCESS_ROOM_DELETED] User ${socket.id} left room ${roomId}. Room deleted.`);
      } else {
          console.warn(`[LEAVE_CHAT_WARN_INVALID_REQUEST] User ${socket.id} tried to leave room ${roomId} but not found or user not in it.`);
      }
    } catch (error: any) {
      console.warn(`[VALIDATION_FAIL_LEAVE_CHAT] Invalid leaveChat payload from ${socket.id}: ${error.errors ? JSON.stringify(error.errors) : error.message}`);
      socket.emit('error', { message: 'Invalid payload for leaveChat.' });
    }
  });

  socket.on('disconnect', async (reason) => {
    console.log(`[DISCONNECT_EVENT] User ${socket.id} disconnected. Reason: ${reason}`);
    await cleanupUser(`socket.io disconnect event: ${reason}`);
  });
});

server.listen(PORT, () => {
  console.log(`[SERVER_START] Socket.IO server running on port ${PORT}`);
});

export {};
    
    