
import http from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';

// Explicitly define the allowed origin for your frontend
const allowedOrigin = "https://studio--chitchatconnect-aqa0w.us-central1.hosted.app";

const server = http.createServer((req, res) => {
  // Set CORS headers for all responses from this HTTP server.
  // This is crucial for ensuring the browser's CORS policy is met,
  // especially for preflight OPTIONS requests and when credentials are involved.
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  // Ensure common headers, and any custom headers your client might send, are allowed.
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); // No Content for preflight
    res.end();
    return;
  }

  // For non-OPTIONS requests, provide a basic response.
  // Socket.IO will handle its own handshake/upgrade requests.
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Socket.IO Server is running and configured for CORS.\n');
});

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"],
    credentials: true // This must match the client's withCredentials: true
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
  // Filter out the current user from potential partners
  const potentialPartners = allWaitingForType.filter(p => p.id !== currentUser.id);

  if (potentialPartners.length === 0) {
    return null;
  }

  // Try to match by interest first, if the current user has interests
  if (currentUser.interests.length > 0) {
    for (let i = 0; i < potentialPartners.length; i++) {
      const partner = potentialPartners[i];
      // Check if the potential partner also has interests and shares at least one
      if (partner.interests && partner.interests.some(interest => currentUser.interests.includes(interest))) {
        // Found an interest match, remove from the main waiting list
        const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === partner.id);
        if (originalIndexInWaitingList > -1) {
          console.log(`Interest match found: ${currentUser.id} with ${partner.id} on interests: ${partner.interests.filter(interest => currentUser.interests.includes(interest)).join(', ')}`);
          return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
        }
      }
    }
  }

  // If no interest match OR user has no interests OR no interest-based partner was available from the filtered list,
  // match randomly from the *remaining* potential partners.
  // If an interest match happened above, potentialPartners would be empty or the matched partner removed, so this won't re-match them.
  // If no interest match was made, potentialPartners still contains all users of the same chat type (excluding current user).
  if (potentialPartners.length > 0) {
    const randomIndex = Math.floor(Math.random() * potentialPartners.length);
    const randomPartnerToMatch = potentialPartners[randomIndex];
    const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === randomPartnerToMatch.id);
    if (originalIndexInWaitingList > -1) {
      console.log(`Random match found: ${currentUser.id} with ${randomPartnerToMatch.id}`);
      return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
    }
    // This should ideally not happen if potentialPartners is derived correctly and splice works
    console.warn(`Randomly selected partner ${randomPartnerToMatch.id} not found in main waiting list for splicing (this indicates a potential issue).`);
  }
  
  return null; 
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
    
    // Remove current user if they are already in a waiting list (e.g., if they clicked "Find Partner" again)
    const waitingListForType = waitingUsers[chatType];
    const existingUserIndex = waitingListForType.findIndex(user => user.id === socket.id);
    if (existingUserIndex > -1) {
      waitingListForType.splice(existingUserIndex, 1);
      console.log(`User ${socket.id} was already waiting, removed from list to find new match.`);
    }

    const matchedPartner = findMatch(currentUser);

    if (matchedPartner) {
      const roomId = `${currentUser.id}#${matchedPartner.id}`; 
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
        waitingUsers[type].unshift(matchedPartner); 
        console.log(`Re-added ${matchedPartner.id} to waiting list for ${type}.`);
        
        // Add currentUser back to waiting list too
        waitingUsers[currentUser.chatType].push(currentUser);
        console.log(`User ${currentUser.id} (who was looking for a partner) added back to waiting list for ${currentUser.chatType}.`);
        socket.emit('waitingForPartner'); 
      }
    } else {
      // No partner found, add current user to waiting list
      waitingUsers[chatType].push(currentUser);
      console.log(`User ${socket.id} added to waiting list for ${chatType}`);
      socket.emit('waitingForPartner');
    }
  });

  socket.on('sendMessage', ({ roomId, message }: { roomId: string, message: string }) => {
    if (rooms[roomId]) {
      // Emit to all clients in room except sender
      socket.to(roomId).emit('receiveMessage', { senderId: socket.id, message });
    }
  });

  socket.on('webrtcSignal', ({ roomId, signalData }: { roomId: string, signalData: any }) => {
     if (rooms[roomId]) {
        // Relay signal to other users in the room
        socket.to(roomId).emit('webrtcSignal', signalData);
     }
  });
  
  const cleanupUser = (reason: string) => {
    console.log(`User ${socket.id} disconnected. Reason: ${reason}`);
    onlineUserCount = Math.max(0, onlineUserCount - 1); 
    io.emit('onlineUserCountUpdate', onlineUserCount); 

    // Remove from waiting lists
    for (const type of (['text', 'video'] as const)) {
        const index = waitingUsers[type].findIndex(user => user.id === socket.id);
        if (index > -1) {
            waitingUsers[type].splice(index, 1);
            console.log(`Removed ${socket.id} from waiting list for ${type}`);
        }
    }
    // Handle rooms: notify partner and delete room
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const userIndexInRoom = room.users.indexOf(socket.id);
        if (userIndexInRoom > -1) {
            const partnerId = room.users.find(id => id !== socket.id);
            if (partnerId) {
                const partnerSocket = io.sockets.sockets.get(partnerId);
                partnerSocket?.emit('partnerLeft'); 
                console.log(`Notified partner ${partnerId} that ${socket.id} left room ${roomId}`);
            }
            delete rooms[roomId]; 
            console.log(`Room ${roomId} closed due to user ${socket.id} disconnecting.`);
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
            console.log(`Notified partner ${partnerId} that ${socket.id} left room ${roomId} manually.`);
        }
        delete rooms[roomId];
        socket.leave(roomId); // Make the user leave the socket.io room
        console.log(`Room ${roomId} closed due to user ${socket.id} leaving manually.`);
    } else {
        console.log(`User ${socket.id} tried to leave room ${roomId}, but room was not found.`);
    }
  });

  socket.on('disconnect', (reason) => {
    cleanupUser(reason);
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});

// Export an empty object to satisfy TypeScript's module requirements if no other exports exist
export {};

    