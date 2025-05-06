
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
// Keep track of rooms to ensure users are in the correct one for signaling
const activeRooms = new Map<string, Set<string>>(); // roomName -> Set of socket IDs

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
                user.id !== currentUser.id && 
                user.interests.some(interest => currentUser.interests.includes(interest))
            );
        }

        // If no interest match, or no interests provided, find any compatible user
        if (partnerIndex === -1) {
            partnerIndex = waitingUsers.findIndex(user =>
                user.chatType === currentUser.chatType &&
                user.id !== currentUser.id 
            );
        }
        

        if (partnerIndex !== -1) {
            partner = waitingUsers.splice(partnerIndex, 1)[0];
            console.log(`Partner found for ${currentUser.id}: ${partner.id}`);

            const roomName = `room-${currentUser.id}-${partner.id}`;
            socket.join(roomName);
            io.sockets.sockets.get(partner.id)?.join(roomName);

            activeRooms.set(roomName, new Set([currentUser.id, partner.id]));

            // Notify both users, including the room name
            io.to(currentUser.id).emit('partnerFound', { peerId: partner.id, room: roomName, initiator: true });
            io.to(partner.id).emit('partnerFound', { peerId: currentUser.id, room: roomName, initiator: false });
        } else {
            console.log(`No partner found for ${currentUser.id}, adding to waiting list.`);
            waitingUsers.push(currentUser);
            socket.emit('waitingForPartner');
        }
    });

    socket.on('webrtcSignal', (data) => {
        // Ensure signal is sent to the correct peer within the specified room
        console.log('Signal from', socket.id, 'to', data.to, 'in room', data.room, 'type:', data.signal.type || 'message');
        if (data.room && activeRooms.has(data.room) && activeRooms.get(data.room)?.has(data.to)) {
            io.to(data.to).emit('webrtcSignal', { from: socket.id, signal: data.signal, room: data.room });
        } else {
            console.warn(`Room ${data.room} not found or target ${data.to} not in room for webrtcSignal from ${socket.id}`);
        }
    });

    socket.on('sendMessage', (data) => {
        console.log('Message from', socket.id, 'to room', data.room, ':', data.message);
        // Broadcast to the room, excluding the sender
        if (data.room && activeRooms.has(data.room)) {
             socket.to(data.room).emit('receiveMessage', { from: socket.id, message: data.message });
        } else {
             console.warn(`Room ${data.room} not found for sendMessage from ${socket.id}`);
        }
    });
    
    socket.on('leaveChat', (room) => {
        console.log('User leaving chat:', socket.id, 'from room:', room);
        if (room) {
            socket.to(room).emit('peerDisconnected'); 
            socket.leave(room);
            const roomUsers = activeRooms.get(room);
            if (roomUsers) {
                roomUsers.delete(socket.id);
                if (roomUsers.size === 0) {
                    activeRooms.delete(room);
                }
            }
        }
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
        
        socket.rooms.forEach(room => {
            if (room !== socket.id) { 
                io.to(room).emit('peerDisconnected');
                const roomUsers = activeRooms.get(room);
                if (roomUsers) {
                    roomUsers.delete(socket.id);
                    if (roomUsers.size === 0) {
                        activeRooms.delete(room);
                    }
                }
            }
        });
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

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
