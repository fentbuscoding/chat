
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
  const allWaitingForType = waitingUsers[currentUser.chatType];
  if (allWaitingForType.length === 0) {
    return null; // No one is waiting for this chat type
  }

  // Filter out the current user from the list of potential partners
  const potentialPartners = allWaitingForType.filter(p => p.id !== currentUser.id);
  if (potentialPartners.length === 0) {
    return null; // No *other* users are waiting
  }

  // 1. Attempt to find a partner with common interests, if the current user has specified interests.
  if (currentUser.interests.length > 0) {
    for (let i = 0; i < potentialPartners.length; i++) {
      const partner = potentialPartners[i];
      // Check for at least one common interest
      if (partner.interests.some(interest => currentUser.interests.includes(interest))) {
        // Found a partner with common interests. Remove them from the *main* waiting list.
        const originalIndex = allWaitingForType.findIndex(p => p.id === partner.id);
        if (originalIndex > -1) {
          // Successfully found and can remove the interest-matched partner
          return allWaitingForType.splice(originalIndex, 1)[0];
        }
        // Edge case: partner was in potentialPartners but not in allWaitingForType (e.g., race condition).
        // Log this or handle, but for now, we'll fall through to random matching if splice fails.
        console.warn(`Interest-matched partner ${partner.id} not found in main waiting list for splicing.`);
      }
    }
  }

  // 2. If no interest-based match was found (either user had no interests, or no common interests were found),
  //    proceed to match randomly with any available partner from the `potentialPartners` list.
  //    `potentialPartners` at this stage still contains users who didn't match by interest (if tried) or all other users if interest matching was skipped.
  
  // Ensure potentialPartners is still populated. It should be, unless an edge case occurred above.
  if (potentialPartners.length > 0) {
    // Select a random partner from the (remaining) potential partners
    const randomIndex = Math.floor(Math.random() * potentialPartners.length);
    const randomPartnerToMatch = potentialPartners[randomIndex];

    // Remove the randomly selected partner from the *main* waiting list.
    const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === randomPartnerToMatch.id);
    if (originalIndexInWaitingList > -1) {
      return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
    }
    // Edge case: randomly selected partner from potentialPartners was not in allWaitingForType.
    console.warn(`Randomly selected partner ${randomPartnerToMatch.id} not found in main waiting list for splicing.`);
  }

  return null; // No suitable partner found even after random attempt
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
        // Ensure we add them to the correct chatType list.
        const type = matchedPartner.chatType || currentUser.chatType; 
        waitingUsers[type].unshift(matchedPartner); // Add to front to attempt re-match sooner
        console.log(`Re-added ${matchedPartner.id} to waiting list for ${type}.`);
        

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
