
import http from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';

const server = http.createServer((req, res) => {
  // This is just a basic HTTP server, Next.js handles the frontend routing
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Socket.IO Server\n');
});

const io = new SocketIOServer(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity in development
    methods: ["GET", "POST"]
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
  const potentialPartners = waitingUsers[currentUser.chatType];
  if (potentialPartners.length === 0) return null;

  // Try to find a partner with at least one common interest
  if (currentUser.interests.length > 0) {
    for (let i = 0; i < potentialPartners.length; i++) {
      const partner = potentialPartners[i];
      if (partner.id === currentUser.id) continue; // Don't match with self
      if (partner.interests.some(interest => currentUser.interests.includes(interest))) {
        return potentialPartners.splice(i, 1)[0]; // Remove partner from waiting list
      }
    }
  }

  // If no interest match or current user has no interests, pick a random partner
  // Ensure the randomly picked partner is not the current user itself (shouldn't happen if currentUser is not yet in waiting list)
  const availablePartners = potentialPartners.filter(p => p.id !== currentUser.id);
  if (availablePartners.length > 0) {
    const randomIndex = Math.floor(Math.random() * availablePartners.length);
    // Need to remove the actual partner from original waitingUsers array
    const matchedPartner = availablePartners[randomIndex];
    const originalIndex = potentialPartners.findIndex(p => p.id === matchedPartner.id);
    if (originalIndex > -1) {
        return potentialPartners.splice(originalIndex, 1)[0];
    }
  }
  return null;
};


io.on('connection', (socket: Socket) => {
  console.log('A user connected:', socket.id);

  socket.on('findPartner', ({ chatType, interests }: { chatType: 'text' | 'video', interests: string[] }) => {
    console.log(`User ${socket.id} looking for ${chatType} chat with interests: ${interests.join(', ')}`);
    const currentUser: User = { id: socket.id, interests, chatType };
    
    const matchedPartner = findMatch(currentUser);

    if (matchedPartner) {
      const roomId = `${currentUser.id}#${matchedPartner.id}`;
      rooms[roomId] = { id: roomId, users: [currentUser.id, matchedPartner.id], chatType };

      socket.join(roomId);
      const partnerSocket = io.sockets.sockets.get(matchedPartner.id);
      if (partnerSocket) {
        partnerSocket.join(roomId);
        console.log(`Partner found for ${currentUser.id} and ${matchedPartner.id}. Room: ${roomId}`);
        // Emit to current socket and partner socket, include interests
        socket.emit('partnerFound', { partnerId: matchedPartner.id, roomId, interests: matchedPartner.interests });
        partnerSocket.emit('partnerFound', { partnerId: currentUser.id, roomId, interests: currentUser.interests });
      } else {
        // This case means a partner was found in the waiting list and removed (by findMatch's splice),
        // but their socket connection no longer exists.
        console.error(`Could not find socket for matched partner ${matchedPartner.id}. Matched partner might have disconnected.`);
        
        // Add the matchedPartner back to the waiting list because they were removed by splice.
        if (matchedPartner) { 
             const type = matchedPartner.chatType || currentUser.chatType; 
             waitingUsers[type].unshift(matchedPartner); // Add to front to attempt re-match sooner
             console.log(`Re-added ${matchedPartner.id} to waiting list for ${type}.`);
        }

        // The current user did not find a usable partner, so they should also be put in waiting.
        const isCurrentUserWaiting = waitingUsers[currentUser.chatType].some(user => user.id === currentUser.id);
        if (!isCurrentUserWaiting) {
          waitingUsers[currentUser.chatType].push(currentUser);
        }
        console.log(`User ${currentUser.id} (who was looking for a partner) added to waiting list for ${currentUser.chatType}.`);
        socket.emit('waitingForPartner'); // Inform current user they are now waiting
      }
    } else {
      // No partner found, add current user to waiting list
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
      // Send to all clients in room except sender
      socket.to(roomId).emit('receiveMessage', { senderId: socket.id, message });
    }
  });

  socket.on('webrtcSignal', ({ roomId, signalData }: { roomId: string, signalData: any }) => {
     if (rooms[roomId]) {
        // Relay signal to the other user in the room
        socket.to(roomId).emit('webrtcSignal', signalData);
     }
  });
  
  const cleanupUser = (reason: string) => {
    console.log(`User ${socket.id} disconnected. Reason: ${reason}`);
    // Remove from waiting lists
    for (const type of (['text', 'video'] as const)) {
        const index = waitingUsers[type].findIndex(user => user.id === socket.id);
        if (index > -1) {
            waitingUsers[type].splice(index, 1);
            console.log(`Removed ${socket.id} from waiting list for ${type}`);
        }
    }
    // Notify partner in any active room and clean up room
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.users.includes(socket.id)) {
            const partnerId = room.users.find(id => id !== socket.id);
            if (partnerId) {
                const partnerSocket = io.sockets.sockets.get(partnerId);
                partnerSocket?.emit('partnerLeft');
                console.log(`Notified partner ${partnerId} that ${socket.id} left room ${roomId}`);
            }
            delete rooms[roomId];
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
        // User may want to find another partner, don't fully disconnect them unless they close tab
    }
  });

  socket.on('disconnect', (reason) => {
    cleanupUser(reason);
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});

export {}; // To make this a module

