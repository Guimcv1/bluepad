const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

let PORT = process.env.PORT || 3000;

// Helper to get local IPv4 address
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (!iface.address.startsWith('192.168.56.') && !iface.address.startsWith('169.254.')) {
                    return iface.address;
                }
            }
        }
    }
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for discovery & fast WebRTC iceServers
app.get('/api/info', (req, res) => {
    // Servidores STUN ultrarrápidos sem atraso de timeout
    let iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
        iceServers.push({
            urls: process.env.TURN_URL,
            username: process.env.TURN_USERNAME,
            credential: process.env.TURN_PASSWORD
        });
    }

    if (process.env.ICE_SERVERS_JSON) {
        try {
            iceServers = JSON.parse(process.env.ICE_SERVERS_JSON);
        } catch (e) {
            console.error('Error parsing ICE_SERVERS_JSON:', e.message);
        }
    }

    res.json({
        localIp: getLocalIp(),
        port: PORT,
        iceServers
    });
});

// Dynamic room routing fallback (e.g. /nome-da-sala)
app.get('/:room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Room state tracking: roomId -> { broadcasterId: string|null, listeners: Set<string> }
const rooms = new Map();

function getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            broadcasterId: null,
            listeners: new Set()
        });
    }
    return rooms.get(roomId);
}

io.on('connection', (socket) => {
    console.log(`[Socket] Conectado: ${socket.id}`);

    // User joins a room
    socket.on('join-room', (roomId) => {
        if (!roomId) return;
        socket.join(roomId);
        socket.currentRoom = roomId;

        const room = getOrCreateRoom(roomId);
        room.listeners.add(socket.id);

        console.log(`[Room] ${socket.id} entrou na sala: ${roomId} (Transmissor: ${room.broadcasterId || 'Nenhum'}, Ouvintes: ${room.listeners.size})`);

        socket.emit('room-status', {
            roomId,
            hasBroadcaster: Boolean(room.broadcasterId && io.sockets.sockets.has(room.broadcasterId)),
            broadcasterId: room.broadcasterId,
            listenerCount: room.listeners.size
        });

        if (room.broadcasterId && room.broadcasterId !== socket.id) {
            io.to(room.broadcasterId).emit('listener-joined', {
                listenerId: socket.id,
                roomId
            });
        }
    });

    // Broadcaster starts streaming
    socket.on('broadcaster-start', (roomId) => {
        if (!roomId) return;
        const room = getOrCreateRoom(roomId);
        room.broadcasterId = socket.id;
        room.listeners.delete(socket.id);

        console.log(`[Stream] Transmissor ativo em ${roomId}: ${socket.id}`);

        socket.to(roomId).emit('broadcaster-started', {
            broadcasterId: socket.id,
            roomId
        });
    });

    // Broadcaster stops streaming
    socket.on('broadcaster-stop', (roomId) => {
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (room && room.broadcasterId === socket.id) {
            room.broadcasterId = null;
            console.log(`[Stream] Transmissor parou em ${roomId}`);
            socket.to(roomId).emit('broadcaster-stopped', { roomId });
        }
    });

    // Receiver indicates it is ready to receive stream from broadcaster
    socket.on('receiver-ready', (data) => {
        const { roomId, broadcasterId } = data || {};
        const room = rooms.get(roomId);
        const target = broadcasterId || (room ? room.broadcasterId : null);
        if (target) {
            console.log(`[Signal] Ouvinte ${socket.id} pronto para receber do transmissor ${target}`);
            io.to(target).emit('listener-ready', {
                listenerId: socket.id,
                roomId
            });
        }
    });

    // WebRTC Signaling: Offer
    socket.on('offer', (data) => {
        if (data && data.targetId) {
            io.to(data.targetId).emit('offer', {
                senderId: socket.id,
                sdp: data.sdp,
                roomId: data.roomId
            });
        }
    });

    // WebRTC Signaling: Answer
    socket.on('answer', (data) => {
        if (data && data.targetId) {
            io.to(data.targetId).emit('answer', {
                senderId: socket.id,
                sdp: data.sdp,
                roomId: data.roomId
            });
        }
    });

    // WebRTC Signaling: ICE Candidate
    socket.on('ice-candidate', (data) => {
        if (data && data.targetId) {
            io.to(data.targetId).emit('ice-candidate', {
                senderId: socket.id,
                candidate: data.candidate,
                roomId: data.roomId
            });
        }
    });

    // Disconnect handling
    socket.on('disconnecting', () => {
        const roomId = socket.currentRoom;
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            if (room.broadcasterId === socket.id) {
                room.broadcasterId = null;
                socket.to(roomId).emit('broadcaster-stopped', { roomId });
            }
            room.listeners.delete(socket.id);
            if (room.broadcasterId) {
                io.to(room.broadcasterId).emit('listener-left', {
                    listenerId: socket.id,
                    listenerCount: room.listeners.size
                });
            }
            if (!room.broadcasterId && room.listeners.size === 0) {
                rooms.delete(roomId);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Desconectado: ${socket.id}`);
    });
});

function startServer(portToUse) {
    server.listen(portToUse, '0.0.0.0', () => {
        PORT = portToUse;
        const localIp = getLocalIp();
        console.log(`\n==============================================`);
        console.log(`🎧 BluePad Audio Servidor Iniciado!`);
        console.log(`💻 Local (no PC):     http://localhost:${PORT}`);
        console.log(`📱 Rede (no Celular): http://${localIp}:${PORT}`);
        console.log(`==============================================\n`);
    });
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Porta ${PORT} já está em uso! Tentando a porta ${PORT + 1}...`);
        startServer(PORT + 1);
    } else {
        console.error('Erro no servidor:', err);
    }
});

startServer(PORT);
