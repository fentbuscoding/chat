
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
    methods: ["GET", "POST"],
    credentials: true // Added for robust XHR polling
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
    return null;
  }

  const potentialPartners = allWaitingForType.filter(p => p.id !== currentUser.id);
  if (potentialPartners.length === 0) {
    return null;
  }

  // 1. Attempt to find a partner with common interests, if the current user has specified interests.
  if (currentUser.interests.length > 0) {
    for (let i = 0; i < potentialPartners.length; i++) {
      const partner = potentialPartners[i];
      if (partner.interests.some(interest => currentUser.interests.includes(interest))) {
        const originalIndex = allWaitingForType.findIndex(p => p.id === partner.id);
        if (originalIndex > -1) {
          return allWaitingForType.splice(originalIndex, 1)[0];
        }
        console.warn(`Interest-matched partner ${partner.id} not found in main waiting list for splicing.`);
      }
    }
  }

  // 2. If no interest-based match, or user had no interests, match randomly.
  if (potentialPartners.length > 0) {
    const randomIndex = Math.floor(Math.random() * potentialPartners.length);
    const randomPartnerToMatch = potentialPartners[randomIndex];

    const originalIndexInWaitingList = allWaitingForType.findIndex(p => p.id === randomPartnerToMatch.id);
    if (originalIndexInWaitingList > -1) {
      return allWaitingForType.splice(originalIndexInWaitingList, 1)[0];
    }
    console.warn(`Randomly selected partner ${randomPartnerToMatch.id} not found in main waiting list for splicing.`);
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
        socket.emit('partnerFound', { partnerId: matchedPartner.id, roomId, interests: matchedPartner.interests });
        partnerSocket.emit('partnerFound', { partnerId: currentUser.id, roomId, interests: currentUser.interests });
      } else {
        console.error(`Could not find socket for matched partner ${matchedPartner.id}. Matched partner might have disconnected.`);
        const type = matchedPartner.chatType || currentUser.chatType; 
        waitingUsers[type].unshift(matchedPartner); 
        console.log(`Re-added ${matchedPartner.id} to waiting list for ${type}.`);
        
        const isCurrentUserWaiting = waitingUsers[currentUser.chatType].some(user => user.id === currentUser.id);
        if (!isCurrentUserWaiting) {
          waitingUsers[currentUser.chatType].push(currentUser);
        }
        console.log(`User ${currentUser.id} (who was looking for a partner) added to waiting list for ${currentUser.chatType}.`);
        socket.emit('waitingForPartner');
      }
    } else {
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
  
  const cleanupUser = (reason: string) => {
    console.log(`User ${socket.id} disconnected. Reason: ${reason}`);
    for (const type of (['text', 'video'] as const)) {
        const index = waitingUsers[type].findIndex(user => user.id === socket.id);
        if (index > -1) {
            waitingUsers[type].splice(index, 1);
            console.log(`Removed ${socket.id} from waiting list for ${type}`);
        }
    }
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
