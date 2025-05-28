
import http from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';

const allowedOrigin = "https://studio--chitchatconnect-aqa0w.us-central1.hosted.app";

const server = http.createServer((req, res) => {
  // Set CORS headers for all responses from this HTTP server.
  // This is crucial for Socket.IO's polling mechanism and general CORS compliance
  // when credentials are included, especially when behind a proxy like Cloud Run.
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  // Common headers needed for Socket.IO and general requests.
  // Add any other custom headers your client might send.
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle CORS Preflight requests (OPTIONS method)
  if (req.method === 'OPTIONS') {
    res.writeHead(204); // No Content
    res.end();
    return;
  }

  // For other requests (e.g., the basic HTTP server check, or initial Socket.IO handshake if it hits this path)
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Socket.IO Server is running and configured for CORS.\n');
});

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"],
    credentials: true
    // Socket.IO's cors option handles aspects of the WebSocket handshake and initial polling.
    // The HTTP server headers above ensure all HTTP traffic is correctly handled by Cloud Run's proxy.
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

const findMatch = (currentUser: User): User | null => {
  const allWaitingForType = waitingUsers[currentUser.chatType];
  // Create a pool of potential partners excluding the current user
  const potentialPartners = allWaitingForType.filter(p => p.id !== currentUser.id);

  if (potentialPartners.length === 0) {
    return null;
  }

  // 1. Attempt to find a partner with common interests, if the current user has specified interests.
  if (currentUser.interests.length > 0) {
    for (let i = 0; i < potentialPartners.length; i++) {
      const partner = potentialPartners[i];
      // Check if the potential partner has interests and if any of them overlap
      if (partner.interests && partner.interests.some(interest => currentUser.interests.includes(interest))) {
        // Found an interest-based match. Now remove this partner from the main waiting list.
        const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === partner.id);
        if (originalIndexInWaitingList > -1) {
          return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
        }
        // This case should ideally not happen if potentialPartners is derived from allWaitingForType
        console.warn(`Interest-matched partner ${partner.id} not found in main waiting list for splicing.`);
      }
    }
  }

  // 2. If no interest-based match, or user had no interests, match randomly from the potential partners.
  // (This part is reached if the interest-based loop didn't return a match)
  if (potentialPartners.length > 0) {
    const randomIndex = Math.floor(Math.random() * potentialPartners.length);
    const randomPartnerToMatch = potentialPartners[randomIndex];

    const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === randomPartnerToMatch.id);
    if (originalIndexInWaitingList > -1) {
      return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
    }
    // This case should ideally not happen
    console.warn(`Randomly selected partner ${randomPartnerToMatch.id} not found in main waiting list for splicing.`);
  }

  return null; // No match found
};


io.on('connection', (socket: Socket) => {
  console.log('A user connected:', socket.id);

  socket.on('findPartner', ({ chatType, interests }: { chatType: 'text' | 'video', interests: string[] }) => {
    console.log(`User ${socket.id} looking for ${chatType} chat with interests: ${interests.join(', ')}`);
    const currentUser: User = { id: socket.id, interests, chatType };
    
    const matchedPartner = findMatch(currentUser);

    if (matchedPartner) {
      const roomId = `${currentUser.id}#${matchedPartner.id}`; // Or use a UUID
      rooms[roomId] = { id: roomId, users: [currentUser.id, matchedPartner.id], chatType };

      socket.join(roomId);
      const partnerSocket = io.sockets.sockets.get(matchedPartner.id);
      if (partnerSocket) {
        partnerSocket.join(roomId);
        console.log(`Partner found for ${currentUser.id} and ${matchedPartner.id}. Room: ${roomId}`);
        // Send partner's interests along with other details
        socket.emit('partnerFound', { partnerId: matchedPartner.id, roomId, interests: matchedPartner.interests });
        partnerSocket.emit('partnerFound', { partnerId: currentUser.id, roomId, interests: currentUser.interests });
      } else {
        console.error(`Could not find socket for matched partner ${matchedPartner.id}. Matched partner might have disconnected.`);
        // Add matchedPartner back to the waiting list as they were removed by findMatch but their socket is gone
        const type = matchedPartner.chatType || currentUser.chatType; 
        waitingUsers[type].unshift(matchedPartner); // Add back to front of queue
        console.log(`Re-added ${matchedPartner.id} to waiting list for ${type}.`);
        
        // Put current user back in waiting list as well if not already there
        const isCurrentUserWaiting = waitingUsers[currentUser.chatType].some(user => user.id === currentUser.id);
        if (!isCurrentUserWaiting) {
          waitingUsers[currentUser.chatType].push(currentUser);
        }
        console.log(`User ${currentUser.id} (who was looking for a partner) added/kept in waiting list for ${currentUser.chatType}.`);
        socket.emit('waitingForPartner'); // Or noPartnerFound to reset client state
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
      // Emit to others in the room except the sender
      socket.to(roomId).emit('receiveMessage', { senderId: socket.id, message });
    }
  });

  socket.on('webrtcSignal', ({ roomId, signalData }: { roomId: string, signalData: any }) => {
     if (rooms[roomId]) {
        // Emit to others in the room except the sender
        socket.to(roomId).emit('webrtcSignal', signalData);
     }
  });
  
  const cleanupUser = (reason: string) => {
    console.log(`User ${socket.id} disconnected. Reason: ${reason}`);
    // Remove user from any waiting lists
    for (const type of (['text', 'video'] as const)) {
        const index = waitingUsers[type].findIndex(user => user.id === socket.id);
        if (index > -1) {
            waitingUsers[type].splice(index, 1);
            console.log(`Removed ${socket.id} from waiting list for ${type}`);
        }
    }
    // Handle user leaving any rooms they were in
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.users.includes(socket.id)) {
            const partnerId = room.users.find(id => id !== socket.id);
            if (partnerId) {
                const partnerSocket = io.sockets.sockets.get(partnerId);
                // Notify partner that the other user left
                partnerSocket?.emit('partnerLeft');
                console.log(`Notified partner ${partnerId} that ${socket.id} left room ${roomId}`);
            }
            delete rooms[roomId];
            console.log(`Room ${roomId} closed`);
            break; // Assuming a user can only be in one room
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

    