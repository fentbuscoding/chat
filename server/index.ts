
import http from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';

const allowedOrigin = "https://studio--chitchatconnect-aqa0w.us-central1.hosted.app";

const server = http.createServer((req, res) => {
  // Set CORS headers for all responses from this HTTP server.
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); // No Content
    res.end();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Socket.IO Server is running and configured for CORS.\n');
});

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigin,
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

const findMatch = (currentUser: User): User | null => {
  const allWaitingForType = waitingUsers[currentUser.chatType];
  const potentialPartners = allWaitingForType.filter(p => p.id !== currentUser.id);

  if (potentialPartners.length === 0) {
    return null;
  }

  // Try to match by interest first
  if (currentUser.interests.length > 0) {
    for (let i = 0; i < potentialPartners.length; i++) {
      const partner = potentialPartners[i];
      if (partner.interests && partner.interests.some(interest => currentUser.interests.includes(interest))) {
        // Found an interest match, remove from the main waiting list
        const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === partner.id);
        if (originalIndexInWaitingList > -1) {
          return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
        }
        // This should ideally not happen if potentialPartners is derived from allWaitingForType
        console.warn(`Interest-matched partner ${partner.id} not found in main waiting list for splicing.`);
      }
    }
  }

  // If no interest match or user has no interests, match randomly
  if (potentialPartners.length > 0) {
    const randomIndex = Math.floor(Math.random() * potentialPartners.length);
    const randomPartnerToMatch = potentialPartners[randomIndex];
    const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === randomPartnerToMatch.id);
    if (originalIndexInWaitingList > -1) {
      return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
    }
    console.warn(`Randomly selected partner ${randomPartnerToMatch.id} not found in main waiting list for splicing.`);
  }

  return null; // Should ideally be unreachable if potentialPartners.length > 0
};


io.on('connection', (socket: Socket) => {
  onlineUserCount++;
  console.log(`A user connected: ${socket.id}. Total online: ${onlineUserCount}`);
  io.emit('onlineUserCountUpdate', onlineUserCount);

  socket.on('getOnlineUserCount', () => {
    socket.emit('onlineUserCount', onlineUserCount);
  });

  socket.on('findPartner', ({ chatType, interests }: { chatType: 'text' | 'video', interests: string[] }) => {
    console.log(`User ${socket.id} looking for ${chatType} chat with interests: ${interests.join(', ')}`);
    const currentUser: User = { id: socket.id, interests, chatType };
    
    const matchedPartner = findMatch(currentUser);

    if (matchedPartner) {
      const roomId = `${currentUser.id}#${matchedPartner.id}`; // Ensure consistent room ID generation
      rooms[roomId] = { id: roomId, users: [currentUser.id, matchedPartner.id], chatType };

      socket.join(roomId);
      const partnerSocket = io.sockets.sockets.get(matchedPartner.id);
      if (partnerSocket) {
        partnerSocket.join(roomId);
        console.log(`Partner found for ${currentUser.id} and ${matchedPartner.id}. Room: ${roomId}`);
        socket.emit('partnerFound', { partnerId: matchedPartner.id, roomId, interests: matchedPartner.interests });
        partnerSocket.emit('partnerFound', { partnerId: currentUser.id, roomId, interests: currentUser.interests });
      } else {
        console.error(`Could not find socket for matched partner ${matchedPartner.id}. Matched partner might have disconnected.`);
        // Re-add matchedPartner to the front of the waiting list
        const type = matchedPartner.chatType || currentUser.chatType; 
        waitingUsers[type].unshift(matchedPartner); // Add back to waiting list
        console.log(`Re-added ${matchedPartner.id} to waiting list for ${type}.`);
        
        // Add currentUser back to waiting list too if not already there
        const isCurrentUserWaiting = waitingUsers[currentUser.chatType].some(user => user.id === currentUser.id);
        if (!isCurrentUserWaiting) {
          waitingUsers[currentUser.chatType].push(currentUser);
        }
        console.log(`User ${currentUser.id} (who was looking for a partner) added/kept in waiting list for ${currentUser.chatType}.`);
        socket.emit('waitingForPartner'); // Inform current user they are waiting
      }
    } else {
      // No partner found, add current user to waiting list if not already there
      const isAlreadyWaiting = waitingUsers[chatType].some(user => user.id === socket.id);
      if (!isAlreadyWaiting) {
        waitingUsers[chatType].push(currentUser);
      }
      console.log(`User ${socket.id} added to waiting list for ${chatType}`);
      socket.emit('waitingForPartner');
    }
  });

  socket.on('sendMessage', ({ roomId, message }: { roomId: string, message: string }) => {
    if (rooms[roomId]) {
      socket.to(roomId).emit('receiveMessage', { senderId: socket.id, message });
    }
  });

  socket.on('webrtcSignal', ({ roomId, signalData }: { roomId: string, signalData: any }) => {
     if (rooms[roomId]) {
        socket.to(roomId).emit('webrtcSignal', signalData);
     }
  });

  socket.on('typing_start', ({ roomId }: { roomId: string }) => {
    if (rooms[roomId]) {
      socket.to(roomId).emit('partner_typing_start');
    }
  });

  socket.on('typing_stop', ({ roomId }: { roomId: string }) => {
    if (rooms[roomId]) {
      socket.to(roomId).emit('partner_typing_stop');
    }
  });
  
  const cleanupUser = (reason: string) => {
    console.log(`User ${socket.id} disconnected. Reason: ${reason}`);
    onlineUserCount = Math.max(0, onlineUserCount - 1); 
    console.log(`User disconnected. Total online: ${onlineUserCount}`);
    io.emit('onlineUserCountUpdate', onlineUserCount); 

    // Remove from waiting lists
    for (const type of (['text', 'video'] as const)) {
        const index = waitingUsers[type].findIndex(user => user.id === socket.id);
        if (index > -1) {
            waitingUsers[type].splice(index, 1);
            console.log(`Removed ${socket.id} from waiting list for ${type}`);
        }
    }
    // Handle rooms
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.users.includes(socket.id)) {
            const partnerId = room.users.find(id => id !== socket.id);
            if (partnerId) {
                const partnerSocket = io.sockets.sockets.get(partnerId);
                partnerSocket?.emit('partnerLeft'); // Notify partner
                console.log(`Notified partner ${partnerId} that ${socket.id} left room ${roomId}`);
            }
            delete rooms[roomId]; // Remove room
            console.log(`Room ${roomId} closed`);
            break; 
        }
    }
  };

  socket.on('leaveChat', ({ roomId } : {roomId: string}) => {
    if (rooms[roomId]) {
        const room = rooms[roomId];
        const partnerId = room.users.find(id => id !== socket.id);
        if (partnerId) {
            const partnerSocket = io.sockets.sockets.get(partnerId);
            partnerSocket?.emit('partnerLeft');
            console.log(`Notified partner ${partnerId} that ${socket.id} left room ${roomId}`);
        }
        delete rooms[roomId];
        console.log(`Room ${roomId} closed due to user ${socket.id} leaving.`);
    }
  });

  socket.on('disconnect', (reason) => {
    cleanupUser(reason);
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});

export {};
