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

// Room state tracking: roomId -> { broadcasterId: string|null, listeners: Set<string>, users: Map, messages: Map, voiceChannels: Map }
const rooms = new Map();

function getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            broadcasterId: null,
            listeners: new Set(),
            users: new Map(),
            screenSharingUser: null,
            messages: new Map([
                ['geral', [
                    { id: 'sys1', username: 'BluePad Bot', avatarColor: '#5865f2', content: `Bem-vindo à sala #${roomId}! Envie mensagens ou entre no canal de voz.`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isSystem: true }
                ]]
            ]),
            voiceChannels: new Map([
                ['v-geral', new Set()]
            ])
        });
    }
    return rooms.get(roomId);
}

function broadcastVoiceChannelState(roomId, channelId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const channelUsers = room.voiceChannels.get(channelId) || new Set();
    const userDetails = Array.from(channelUsers).map(id => {
        const u = room.users.get(id);
        return u || { id, username: `Usuário ${id.substr(0, 4)}`, avatarColor: '#5865f2', isMuted: false, isDeafened: false, isSpeaking: false };
    });

    io.to(roomId).emit('voice-channel-update', {
        channelId,
        users: userDetails
    });
}

io.on('connection', (socket) => {
    console.log(`[Socket] Conectado: ${socket.id}`);

    // User joins a room
    socket.on('join-room', (data) => {
        const roomId = typeof data === 'string' ? data : (data && data.roomId);
        const username = (data && data.username) || `Gamer_${socket.id.substr(0, 4)}`;
        const avatarColor = (data && data.avatarColor) || '#5865f2';

        if (!roomId) return;
        socket.join(roomId);
        socket.currentRoom = roomId;

        const room = getOrCreateRoom(roomId);
        room.listeners.add(socket.id);
        room.users.set(socket.id, {
            id: socket.id,
            username,
            avatarColor,
            currentVoiceChannel: null,
            isMuted: false,
            isDeafened: false,
            isSpeaking: false
        });

        console.log(`[Room] ${username} (${socket.id}) entrou na sala: ${roomId}`);

        socket.emit('room-status', {
            roomId,
            hasBroadcaster: Boolean(room.broadcasterId && io.sockets.sockets.has(room.broadcasterId)),
            broadcasterId: room.broadcasterId,
            listenerCount: room.listeners.size
        });

        // Envia estado inicial do Discord (canais, mensagens e usuários de voz)
        const voiceStateObj = {};
        for (const [chId, setUsers] of room.voiceChannels.entries()) {
            voiceStateObj[chId] = Array.from(setUsers).map(id => room.users.get(id)).filter(Boolean);
        }

        socket.emit('discord-init', {
            messages: Object.fromEntries(room.messages.entries()),
            voiceChannels: voiceStateObj,
            users: Array.from(room.users.values())
        });

        io.to(roomId).emit('user-list-update', Array.from(room.users.values()));

        if (room.broadcasterId && room.broadcasterId !== socket.id) {
            io.to(room.broadcasterId).emit('listener-joined', {
                listenerId: socket.id,
                roomId
            });
        }
    });

    // --- MENSAGENS DE CHAT DE TEXTO (DISCORD) ---
    socket.on('send-message', (data) => {
        const { roomId, channelId, content } = data || {};
        if (!roomId || !content || !content.trim()) return;

        const room = rooms.get(roomId);
        if (!room) return;

        const user = room.users.get(socket.id) || { username: 'Convidado', avatarColor: '#5865f2' };
        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            senderId: socket.id,
            username: user.username,
            avatarColor: user.avatarColor,
            content: content.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        if (!room.messages.has(channelId)) {
            room.messages.set(channelId, []);
        }
        const list = room.messages.get(channelId);
        list.push(msg);
        // Otimização de Memória RAM: Limitar histórico a no máximo 100 mensagens
        if (list.length > 100) list.shift();

        io.to(roomId).emit('new-message', { channelId, message: msg });
    });

    // --- CANAIS DE VOZ DO DISCORD ---
    socket.on('join-voice-channel', (data) => {
        const { roomId, channelId } = data || {};
        const room = rooms.get(roomId || socket.currentRoom);
        if (!room || !channelId) return;

        const user = room.users.get(socket.id);
        if (!user) return;

        // Se o usuário já estava em outro canal de voz, remove ele primeiro
        if (user.currentVoiceChannel && user.currentVoiceChannel !== channelId) {
            const oldSet = room.voiceChannels.get(user.currentVoiceChannel);
            if (oldSet) {
                oldSet.delete(socket.id);
                broadcastVoiceChannelState(roomId, user.currentVoiceChannel);
                socket.to(roomId).emit('voice-peer-left', { channelId: user.currentVoiceChannel, peerId: socket.id });
            }
        }

        user.currentVoiceChannel = channelId;
        if (!room.voiceChannels.has(channelId)) {
            room.voiceChannels.set(channelId, new Set());
        }
        const set = room.voiceChannels.get(channelId);
        
        // Pega os peers atuais antes de adicionar o novo
        const existingPeers = Array.from(set);

        set.add(socket.id);
        broadcastVoiceChannelState(roomId, channelId);

        // Notifica o próprio usuário da lista de peers existentes para conectar WebRTC Mesh
        socket.emit('voice-joined-success', {
            channelId,
            existingPeers: existingPeers.map(id => {
                const u = room.users.get(id);
                return u ? {
                    id: u.id,
                    username: u.username,
                    avatarColor: u.avatarColor,
                    isMuted: u.isMuted,
                    isDeafened: u.isDeafened,
                    isSpeaking: u.isSpeaking,
                    isScreenSharing: !!u.isScreenSharing
                } : null;
            }).filter(Boolean)
        });

        // Notifica os outros membros do canal de voz que um novo usuário entrou
        socket.to(roomId).emit('voice-peer-joined', {
            channelId,
            user
        });
    });

    socket.on('leave-voice-channel', (data) => {
        const roomId = (data && data.roomId) || socket.currentRoom;
        const room = rooms.get(roomId);
        if (!room) return;

        const user = room.users.get(socket.id);
        if (user && user.currentVoiceChannel) {
            const chId = user.currentVoiceChannel;
            const set = room.voiceChannels.get(chId);
            if (set) {
                set.delete(socket.id);
                broadcastVoiceChannelState(roomId, chId);
            }
            user.currentVoiceChannel = null;
            user.isSpeaking = false;
            user.isScreenSharing = false;

            io.to(roomId).emit('voice-peer-left', { channelId: chId, peerId: socket.id });
        }
    });

    // Atualização de estado de áudio (Mutado / Deafen / Indicador de Fala)
    socket.on('update-voice-state', (data) => {
        const roomId = socket.currentRoom;
        const room = rooms.get(roomId);
        if (!room) return;

        const user = room.users.get(socket.id);
        if (user) {
            if (typeof data.isMuted === 'boolean') user.isMuted = data.isMuted;
            if (typeof data.isDeafened === 'boolean') user.isDeafened = data.isDeafened;
            if (typeof data.isSpeaking === 'boolean') user.isSpeaking = data.isSpeaking;

            if (user.currentVoiceChannel) {
                broadcastVoiceChannelState(roomId, user.currentVoiceChannel);
                io.to(roomId).emit('voice-user-state-changed', {
                    channelId: user.currentVoiceChannel,
                    userId: socket.id,
                    isMuted: user.isMuted,
                    isDeafened: user.isDeafened,
                    isSpeaking: user.isSpeaking
                });
            }
        }
    });

    // Compartilhamento de Tela Múltiplo no VOIP
    socket.on('voice-screen-started', (data) => {
        const roomId = socket.currentRoom;
        const room = rooms.get(roomId);
        if (!room) return;
        const user = room.users.get(socket.id);
        if (user && user.currentVoiceChannel) {
            user.isScreenSharing = true;
            socket.to(roomId).emit('voice-screen-started', {
                channelId: user.currentVoiceChannel,
                userId: socket.id,
                username: user.username
            });
        }
    });

    socket.on('voice-screen-stopped', (data) => {
        const roomId = socket.currentRoom;
        const room = rooms.get(roomId);
        if (!room) return;
        const user = room.users.get(socket.id);
        if (user) {
            user.isScreenSharing = false;
            if (user.currentVoiceChannel) {
                socket.to(roomId).emit('voice-screen-stopped', {
                    channelId: user.currentVoiceChannel,
                    userId: socket.id
                });
            }
        }
    });

    // --- SINALIZAÇÃO WEBRTC MESH PARA VOZ DO DISCORD ---
    socket.on('voice-signal-offer', (data) => {
        if (data && data.targetId) {
            io.to(data.targetId).emit('voice-signal-offer', {
                senderId: socket.id,
                sdp: data.sdp
            });
        }
    });

    socket.on('voice-signal-answer', (data) => {
        if (data && data.targetId) {
            io.to(data.targetId).emit('voice-signal-answer', {
                senderId: socket.id,
                sdp: data.sdp
            });
        }
    });

    socket.on('voice-signal-ice', (data) => {
        if (data && data.targetId) {
            io.to(data.targetId).emit('voice-signal-ice', {
                senderId: socket.id,
                candidate: data.candidate
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
            const user = room.users.get(socket.id);
            if (user && user.currentVoiceChannel) {
                const chId = user.currentVoiceChannel;
                const set = room.voiceChannels.get(chId);
                if (set) {
                    set.delete(socket.id);
                    broadcastVoiceChannelState(roomId, chId);
                }
                socket.to(roomId).emit('voice-peer-left', { channelId: chId, peerId: socket.id });
            }
            room.users.delete(socket.id);
            io.to(roomId).emit('user-list-update', Array.from(room.users.values()));

            if (room.broadcasterId) {
                io.to(room.broadcasterId).emit('listener-left', {
                    listenerId: socket.id,
                    listenerCount: room.listeners.size
                });
            }
            // Otimização de Memória RAM: expurgar salas completamente vazias
            if (!room.broadcasterId && room.listeners.size === 0 && room.users.size === 0) {
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
