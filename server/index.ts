
import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import type {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
} from '../src/lib/socket-types';

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(server, {
    cors: {
        origin: "http://localhost:9002", // Your Next.js app URL
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

interface User {
    id: string;
    chatType: 'text' | 'video';
    interests: string[];
}

let waitingUsers: User[] = [];

io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    console.log('A user connected:', socket.id);

    socket.on('findPartner', (data) => {
        console.log('User finding partner:', socket.id, data);
        const currentUser: User = { id: socket.id, chatType: data.chatType, interests: data.interests };

        // Try to find a match
        let partner: User | undefined;
        let partnerIndex = -1;

        // Prioritize matching interests if provided
        if (currentUser.interests.length > 0) {
            partnerIndex = waitingUsers.findIndex(user =>
                user.chatType === currentUser.chatType &&
                user.id !== currentUser.id && // Don't match with self
                user.interests.some(interest => currentUser.interests.includes(interest))
            );
        }

        // If no interest match, or no interests provided, find any compatible user
        if (partnerIndex === -1) {
            partnerIndex = waitingUsers.findIndex(user =>
                user.chatType === currentUser.chatType &&
                user.id !== currentUser.id // Don't match with self
            );
        }
        

        if (partnerIndex !== -1) {
            partner = waitingUsers.splice(partnerIndex, 1)[0];
            console.log(`Partner found for ${currentUser.id}: ${partner.id}`);

            const roomName = `room-${currentUser.id}-${partner.id}`;
            socket.join(roomName);
            io.sockets.sockets.get(partner.id)?.join(roomName); // Make partner join the room

            // Notify both users
            io.to(currentUser.id).emit('partnerFound', { peerId: partner.id, room: roomName, initiator: true });
            io.to(partner.id).emit('partnerFound', { peerId: currentUser.id, room: roomName, initiator: false });
        } else {
            console.log(`No partner found for ${currentUser.id}, adding to waiting list.`);
            waitingUsers.push(currentUser);
            socket.emit('waitingForPartner');
        }
    });

    socket.on('webrtcSignal', (data) => {
        console.log('Signal from', socket.id, 'to', data.to, 'type:', data.signal.type || 'message');
        io.to(data.to).emit('webrtcSignal', { from: socket.id, signal: data.signal });
    });

    socket.on('sendMessage', (data) => {
        console.log('Message from', socket.id, 'to room', data.room, ':', data.message);
        // Broadcast to the room, excluding the sender (or include, depends on how client handles it)
        socket.to(data.room).emit('receiveMessage', { from: socket.id, message: data.message });
    });
    
    socket.on('leaveChat', (room) => {
        console.log('User leaving chat:', socket.id, 'from room:', room);
        if (room) {
            socket.to(room).emit('peerDisconnected'); // Notify other user in the room
            socket.leave(room);
        }
        // Remove from waiting list if present
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Remove from waiting list
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
        
        // If the user was in a room, notify the other participant
        // This requires knowing which room the user was in.
        // For simplicity, we can emit a generic 'peerDisconnected' if we don't track rooms per user
        // Or, the client can handle 'leaveChat' on window unload/component unmount.
        // The 'leaveChat' event is more explicit.
        // Consider finding rooms the socket is in and notifying others.
        socket.rooms.forEach(room => {
            if (room !== socket.id) { // Don't emit to the socket itself
                io.to(room).emit('peerDisconnected');
            }
        });

    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    io.close(() => {
        console.log('Socket.IO server closed.');
        server.close(() => {
            console.log('HTTP server closed.');
            process.exit(0);
        });
    });
});
