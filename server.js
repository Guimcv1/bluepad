const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback for dynamic room routing (e.g., /room-name)
app.get('/:room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io Signaling logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);
        
        // Notify others in the room
        socket.to(roomId).emit('user-connected', socket.id);
    });

    socket.on('broadcaster-ready', (roomId) => {
        console.log(`Broadcaster ready in room: ${roomId}`);
        socket.to(roomId).emit('broadcaster-ready', socket.id);
    });

    socket.on('receiver-ready', (data) => {
        // data.targetId is the broadcaster's ID
        socket.to(data.roomId).emit('receiver-ready', socket.id);
    });

    socket.on('offer', (data) => {
        // data contains { targetId, sdp }
        socket.to(data.roomId).emit('offer', {
            senderId: socket.id,
            sdp: data.sdp
        });
    });

    socket.on('answer', (data) => {
        // data contains { targetId, sdp }
        socket.to(data.roomId).emit('answer', {
            senderId: socket.id,
            sdp: data.sdp
        });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.roomId).emit('ice-candidate', {
            senderId: socket.id,
            candidate: data.candidate
        });
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            if (roomId !== socket.id) {
                socket.to(roomId).emit('user-disconnected', socket.id);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
