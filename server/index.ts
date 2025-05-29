
import http from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';

// Define the allowed origins
const allowedOrigins = [
  "https://studio--chitchatconnect-aqa0w.us-central1.hosted.app", // Production
  "https://6000-idx-studio-1746229586647.cluster-73qgvk7hjjadkrjeyexca5ivva.cloudworkstations.dev" // Development
  // Add other origins if needed, e.g., "http://localhost:3000" for local Next.js dev
];

const server = http.createServer((req, res) => {
  const requestOrigin = req.headers.origin;
  let originToAllow = '';

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    originToAllow = requestOrigin;
  } else if (!requestOrigin && req.headers.host?.startsWith('localhost')) {
    // Allow localhost if origin is not present (e.g. for local testing without browser)
    // originToAllow = `http://${req.headers.host}`; // Example
  }

  if (originToAllow) {
    res.setHeader('Access-Control-Allow-Origin', originToAllow);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle CORS preflight (OPTIONS) requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204); // No Content
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: "ok", online: onlineUserCount, waitingText: waitingUsers.text.length, waitingVideo: waitingUsers.video.length }));
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Socket.IO Server is running.\n');
  } else {
    // Let Socket.IO handle its own path or return 404 for other paths
    // No explicit 404 here if Socket.IO is expected to handle it
  }
});

const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      // If origin is undefined (e.g. server-to-server, or some tools like Postman),
      // or if it's in our allowed list, allow it.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS_REJECT] Origin ${origin} not allowed.`);
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
  users: string[]; // socket ids
  chatType: 'text' | 'video';
}

const waitingUsers: { [key in 'text' | 'video']: User[] } = {
  text: [],
  video: [],
};
const rooms: { [roomId: string]: Room } = {};
let onlineUserCount = 0;

const lastMatchRequest: { [socketId: string]: number } = {};
const FIND_PARTNER_COOLDOWN_MS = 2000; // 2 seconds cooldown

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
  const potentialPartners = allWaitingForType.filter(p => p.id !== currentUser.id);

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
      }
    }
    console.log(`[MATCH_LOGIC] No interest-based match for ${currentUser.id}. Proceeding to random match.`);
  }

  if (potentialPartners.length > 0) {
    const randomIndex = Math.floor(Math.random() * potentialPartners.length);
    const randomPartnerToMatch = potentialPartners[randomIndex];
    const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === randomPartnerToMatch.id);
    if (originalIndexInWaitingList > -1) {
      console.log(`[MATCH_LOGIC] Random match found: ${currentUser.id} with ${randomPartnerToMatch.id}`);
      return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
    }
    console.warn(`[MATCH_LOGIC_WARN] Randomly selected partner ${randomPartnerToMatch.id} not found in main waiting list for splicing.`);
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

  socket.on('findPartner', ({ chatType, interests }: { chatType: 'text' | 'video', interests: string[] }) => {
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
        const roomId = `${currentUser.id}#${Date.now()}`; // Added timestamp for more unique room ID
        rooms[roomId] = { id: roomId, users: [currentUser.id, matchedPartner.id], chatType };

        socket.join(roomId);
        partnerSocket.join(roomId);
        console.log(`[MATCH_SUCCESS] ${currentUser.id} and ${matchedPartner.id} joined room ${roomId}.`);

        socket.emit('partnerFound', { partnerId: matchedPartner.id, roomId, interests: matchedPartner.interests });
        partnerSocket.emit('partnerFound', { partnerId: currentUser.id, roomId, interests: currentUser.interests });
      } else {
        console.error(`[MATCH_FAIL] Partner ${matchedPartner.id} socket not found or disconnected. Re-queuing both users.`);
        waitingUsers[matchedPartner.chatType].unshift(matchedPartner);
        console.log(`[WAITING_LIST] Re-added ${matchedPartner.id} to waiting list for ${matchedPartner.chatType}.`);
        waitingUsers[currentUser.chatType].push(currentUser);
        console.log(`[WAITING_LIST] User ${currentUser.id} (who was looking) added back to waiting list for ${currentUser.chatType}.`);
        socket.emit('waitingForPartner');
      }
    } else {
      waitingUsers[chatType].push(currentUser);
      console.log(`[WAITING_LIST] User ${socket.id} added to waiting list for ${chatType}`);
      socket.emit('waitingForPartner');
    }
  });

  socket.on('sendMessage', ({ roomId, message }: { roomId: string, message: string }) => {
    if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
      socket.to(roomId).emit('receiveMessage', { senderId: socket.id, message });
      console.log(`[MESSAGE] User ${socket.id} sent message in room ${roomId}`);
    } else {
      console.warn(`[MESSAGE_WARN] User ${socket.id} tried to send message to room ${roomId} but not in room or room non-existent.`);
    }
  });

  socket.on('webrtcSignal', ({ roomId, signalData }: { roomId: string, signalData: any }) => {
     if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
        socket.to(roomId).emit('webrtcSignal', signalData);
     } else {
        console.warn(`[WEBRTC_SIGNAL_WARN] User ${socket.id} tried to send signal to room ${roomId} but not in room or room non-existent.`);
     }
  });

  socket.on('typing_start', ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
      socket.to(roomId).emit('partner_typing_start', { senderId: socket.id });
    }
  });

  socket.on('typing_stop', ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
      socket.to(roomId).emit('partner_typing_stop', { senderId: socket.id });
    }
  });

  const cleanupUser = (reason: string) => {
    console.log(`[DISCONNECT_EVENT] User ${socket.id} disconnecting. Reason: ${reason}`);
    onlineUserCount = Math.max(0, onlineUserCount - 1);
    io.emit('onlineUserCountUpdate', onlineUserCount);
    console.log(`[STATS] Total online users: ${onlineUserCount}`);

    removeFromWaitingLists(socket.id);
    delete lastMatchRequest[socket.id]; // Memory cleanup for cooldown tracker

    for (const roomId in rooms) {
        const room = rooms[roomId];
        const userIndexInRoom = room.users.indexOf(socket.id);
        if (userIndexInRoom > -1) {
            const partnerId = room.users.find(id => id !== socket.id);
            if (partnerId) {
                const partnerSocket = io.sockets.sockets.get(partnerId);
                if (partnerSocket && partnerSocket.connected) {
                  partnerSocket.emit('partnerLeft');
                  partnerSocket.leave(roomId); // Explicitly make partner leave the room
                  console.log(`[ROOM_EVENT] Notified partner ${partnerId} that ${socket.id} left room ${roomId}. Partner removed from room.`);
                } else {
                  console.log(`[ROOM_EVENT_WARN] Partner ${partnerId} of disconnecting user ${socket.id} not found or disconnected.`);
                }
            }
            delete rooms[roomId];
            console.log(`[ROOM_CLOSED] Room ${roomId} closed due to user ${socket.id} disconnecting. Active rooms: ${Object.keys(rooms).length}`);
            break; // User can only be in one room at a time
        }
    }
  };

  socket.on('leaveChat', ({ roomId } : {roomId: string}) => {
    if (rooms[roomId] && rooms[roomId].users.includes(socket.id)) {
        const room = rooms[roomId];
        const partnerId = room.users.find(id => id !== socket.id);

        if (partnerId) {
            const partnerSocket = io.sockets.sockets.get(partnerId);
             if (partnerSocket && partnerSocket.connected) {
                partnerSocket.emit('partnerLeft');
                // Optionally, make the partner leave the room server-side if desired,
                // but client-side `partnerLeft` handler should also manage this.
                // partnerSocket.leave(roomId);
                console.log(`[ROOM_EVENT] Notified partner ${partnerId} that ${socket.id} left room ${roomId} manually.`);
            } else {
                console.log(`[ROOM_EVENT_WARN] Partner ${partnerId} of user ${socket.id} (leaving manually) not found or disconnected.`);
            }
        }
        delete rooms[roomId];
        socket.leave(roomId); // Current user leaves the Socket.IO room
        console.log(`[ROOM_CLOSED] Room ${roomId} closed due to user ${socket.id} leaving manually. Active rooms: ${Object.keys(rooms).length}`);
    } else {
        console.warn(`[LEAVE_CHAT_WARN] User ${socket.id} tried to leave room ${roomId}, but room was not found or user not in it.`);
    }
  });

  socket.on('disconnect', (reason) => {
    cleanupUser(reason);
  });
});

server.listen(PORT, () => {
  console.log(`[SERVER_START] Socket.IO server running on port ${PORT}`);
});

// Export {} is used to ensure this file is treated as a module
// especially when using 'isolatedModules': true in tsconfig.json
export {};

    