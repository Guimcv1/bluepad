// BluePad Audio - Script Principal
const socket = io();

// Elementos do DOM
const homeView = document.getElementById('home-view');
const setupView = document.getElementById('setup-view');
const streamView = document.getElementById('stream-view');
const receiverView = document.getElementById('receiver-view');

const roomInput = document.getElementById('room-input');
const goRoomBtn = document.getElementById('go-room');
const roomDisplay = document.getElementById('room-display');
const roomIdEl = document.getElementById('room-id');

const roomStatusPill = document.getElementById('room-broadcaster-status');
const roomStatusText = document.getElementById('room-status-text');
const shareUrlEl = document.getElementById('share-url');
const copyUrlBtn = document.getElementById('copy-url-btn');

const startBroadcastBtn = document.getElementById('start-broadcast-btn');
const startListenBtn = document.getElementById('start-listen-btn');
const stopBroadcastBtn = document.getElementById('stop-broadcast-btn');
const listenerCountText = document.getElementById('listener-count-text');

const receiverDot = document.getElementById('receiver-dot');
const receiverStatusText = document.getElementById('receiver-status-text');
const audioUnlockContainer = document.getElementById('audio-unlock-container');
const unlockAudioBtn = document.getElementById('unlock-audio-btn');
const playbackPanel = document.getElementById('playback-panel');
const volumeSlider = document.getElementById('volume-slider');
const reconnectBtn = document.getElementById('reconnect-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

const remoteAudio = document.getElementById('remote-audio');
const toggleDebugBtn = document.getElementById('toggle-debug-btn');
const debugLog = document.getElementById('debug-log');

// Configuração WebRTC Ultrarrápida (< 100ms de latência e conexão instantânea)
let rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 0
};

// Variáveis de Estado
let currentRoomId = null;
let isBroadcaster = false;
let localStream = null;
let audioContext = null;

// Broadcaster: mapa de ouvintes (listenerId -> RTCPeerConnection)
const broadcasterPeers = new Map();
const broadcasterPendingIce = new Map();

// Receiver: conexão e fila de ICE
let receiverPc = null;
let receiverIceQueue = [];
let reconnectTimer = null;

// Sistema de Diagnóstico / Logs
function log(msg) {
    console.log(`[BluePad] ${msg}`);
    if (debugLog) {
        const line = document.createElement('div');
        line.textContent = `${new Date().toLocaleTimeString()} - ${msg}`;
        debugLog.prepend(line);
    }
}

if (toggleDebugBtn && debugLog) {
    toggleDebugBtn.onclick = () => {
        debugLog.classList.toggle('hidden');
    };
}

window.addEventListener('error', (e) => {
    log(`Erro JS: ${e.message}`);
});

// --- ROTEAMENTO E INICIALIZAÇÃO DA SALA ---
const pathSegments = window.location.pathname.split('/').filter(p => p.trim() !== '');
currentRoomId = pathSegments[0] ? decodeURIComponent(pathSegments[0]).toLowerCase() : null;

if (currentRoomId) {
    initRoom(currentRoomId);
} else {
    showView('home');
}

function initRoom(roomId) {
    currentRoomId = roomId;
    roomIdEl.textContent = roomId;
    roomDisplay.classList.remove('hidden');
    showView('setup');

    fetch('/api/info')
        .then(res => res.json())
        .then(data => {
            if (data.iceServers && data.iceServers.length > 0) {
                rtcConfig.iceServers = data.iceServers;
                log(`STUN carregado: ${data.iceServers.length} servidores configurados.`);
            }

            if (window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('192.168.')) {
                shareUrlEl.textContent = window.location.href;
                shareUrlEl.setAttribute('data-url', window.location.href);
            } else {
                const host = data.localIp || window.location.hostname;
                const port = data.port || window.location.port;
                const shareUrl = `${window.location.protocol}//${host}${port ? `:${port}` : ''}/${roomId}`;
                shareUrlEl.textContent = shareUrl;
                shareUrlEl.setAttribute('data-url', shareUrl);
            }
        })
        .catch(() => {
            shareUrlEl.textContent = window.location.href;
            shareUrlEl.setAttribute('data-url', window.location.href);
        });

    log(`Entrando na sala: ${roomId}`);
    socket.emit('join-room', roomId);
}

if (goRoomBtn && roomInput) {
    const handleJoin = () => {
        const keyword = roomInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (keyword) {
            window.location.href = `/${keyword}`;
        }
    };
    goRoomBtn.onclick = handleJoin;
    roomInput.onkeypress = (e) => {
        if (e.key === 'Enter') handleJoin();
    };
}

if (copyUrlBtn) {
    copyUrlBtn.onclick = () => {
        const url = shareUrlEl.getAttribute('data-url') || shareUrlEl.textContent;
        navigator.clipboard.writeText(url).then(() => {
            copyUrlBtn.textContent = '✅';
            setTimeout(() => { copyUrlBtn.textContent = '📋'; }, 2000);
        }).catch(() => {
            prompt('Copie o link abaixo:', url);
        });
    };
}

if (leaveRoomBtn) {
    leaveRoomBtn.onclick = () => {
        window.location.href = '/';
    };
}

function showView(name) {
    homeView.classList.add('hidden');
    setupView.classList.add('hidden');
    streamView.classList.add('hidden');
    receiverView.classList.add('hidden');

    if (name === 'home') homeView.classList.remove('hidden');
    else if (name === 'setup') setupView.classList.remove('hidden');
    else if (name === 'stream') streamView.classList.remove('hidden');
    else if (name === 'receiver') receiverView.classList.remove('hidden');
}

// --- SOCKET.IO & EVENTOS DO SERVIDOR ---

socket.on('room-status', (data) => {
    log(`Status da sala: Broadcaster=${data.hasBroadcaster ? 'Ativo' : 'Inativo'}, Ouvintes=${data.listenerCount}`);
    updateBroadcasterStatusIndicator(data.hasBroadcaster);
});

socket.on('broadcaster-started', (data) => {
    log(`Transmissor iniciou na sala (${data.broadcasterId})`);
    updateBroadcasterStatusIndicator(true);
    
    if (!isBroadcaster && !receiverView.classList.contains('hidden')) {
        receiverStatusText.textContent = 'Transmissão iniciada! Conectando...';
        socket.emit('receiver-ready', { roomId: currentRoomId, broadcasterId: data.broadcasterId });
    }
});

socket.on('broadcaster-stopped', () => {
    log('Transmissor parou ou desconectou');
    updateBroadcasterStatusIndicator(false);
    
    if (!isBroadcaster) {
        receiverDot.className = 'dot gray';
        receiverStatusText.textContent = 'Transmissão encerrada pelo PC.';
        playbackPanel.classList.add('hidden');
        if (remoteAudio) remoteAudio.pause();
    }
});

socket.on('listener-joined', (data) => {
    if (isBroadcaster && localStream) {
        log(`Novo ouvinte entrou (${data.listenerId}). Conectando instantaneamente...`);
        initiateBroadcasterCall(data.listenerId);
    }
});

socket.on('listener-ready', (data) => {
    if (isBroadcaster && localStream) {
        log(`Ouvinte (${data.listenerId}) pronto para áudio. Criando oferta SDP...`);
        initiateBroadcasterCall(data.listenerId);
    }
});

socket.on('listener-left', (data) => {
    if (isBroadcaster) {
        log(`Ouvinte saiu (${data.listenerId}). Ouvintes restantes: ${data.listenerCount}`);
        cleanupBroadcasterPeer(data.listenerId);
        updateListenerCount(data.listenerCount);
    }
});

function updateBroadcasterStatusIndicator(isLive) {
    if (!roomStatusPill || !roomStatusText) return;
    if (isLive) {
        roomStatusPill.className = 'status-pill live';
        roomStatusText.textContent = 'PC transmitindo áudio ao vivo!';
    } else {
        roomStatusPill.className = 'status-pill idle';
        roomStatusText.textContent = 'Nenhum PC transmitindo no momento';
    }
}

function updateListenerCount(count) {
    if (listenerCountText) {
        listenerCountText.textContent = `${count} ${count === 1 ? 'ouvinte conectado' : 'ouvintes conectados'}`;
    }
}

// --- LÓGICA DO TRANSMISSOR (PC) ---

if (startBroadcastBtn) {
    startBroadcastBtn.onclick = async () => {
        log('Iniciando captura de áudio no PC...');
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                throw new Error('Navegador não suporta captura sem HTTPS. Em hospedagem pública acesse via https://');
            }

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                stream.getTracks().forEach(t => t.stop());
                throw new Error('Atenção: Marque a opção "Compartilhar áudio" na janela do navegador!');
            }

            log(`Faixa de áudio ativada: ${audioTracks[0].label}`);

            // Desativa/remove a faixa de vídeo
            const videoTracks = stream.getVideoTracks();
            videoTracks.forEach(v => {
                v.stop();
                stream.removeTrack(v);
            });

            localStream = stream;
            isBroadcaster = true;

            audioTracks[0].onended = () => {
                log('Captura de áudio encerrada pelo usuário.');
                stopBroadcasting();
            };

            log('Áudio capturado! Notificando sala...');
            showView('stream');
            setupVisualizer(localStream, 'broadcaster-visualizer');

            socket.emit('broadcaster-start', currentRoomId);

        } catch (err) {
            log(`Erro ao iniciar transmissão: ${err.message}`);
            alert(`Erro ao transmitir: ${err.message}`);
        }
    };
}

if (stopBroadcastBtn) {
    stopBroadcastBtn.onclick = () => {
        stopBroadcasting();
    };
}

function stopBroadcasting() {
    isBroadcaster = false;
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    broadcasterPeers.forEach((pc) => {
        pc.close();
    });
    broadcasterPeers.clear();
    broadcasterPendingIce.clear();

    socket.emit('broadcaster-stop', currentRoomId);
    showView('setup');
    updateBroadcasterStatusIndicator(false);
}

async function initiateBroadcasterCall(listenerId) {
    if (!localStream) return;
    cleanupBroadcasterPeer(listenerId);

    const pc = new RTCPeerConnection(rtcConfig);
    broadcasterPeers.set(listenerId, pc);
    broadcasterPendingIce.set(listenerId, []);

    localStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                targetId: listenerId,
                roomId: currentRoomId,
                candidate: event.candidate
            });
        }
    };

    pc.onconnectionstatechange = () => {
        log(`Status WebRTC com ouvinte ${listenerId}: ${pc.connectionState}`);
        updateBroadcasterListenersDisplay();

        if (pc.connectionState === 'failed') {
            log(`Reconetando com ${listenerId}...`);
            setTimeout(() => {
                if (broadcasterPeers.has(listenerId) && localStream) {
                    initiateBroadcasterCall(listenerId);
                }
            }, 1000);
        }
    };

    try {
        const offer = await pc.createOffer({
            offerToReceiveAudio: false,
            offerToReceiveVideo: false
        });
        await pc.setLocalDescription(offer);

        socket.emit('offer', {
            targetId: listenerId,
            roomId: currentRoomId,
            sdp: offer
        });
    } catch (e) {
        log(`Erro criando oferta para ${listenerId}: ${e.message}`);
    }
}

function cleanupBroadcasterPeer(listenerId) {
    if (broadcasterPeers.has(listenerId)) {
        const pc = broadcasterPeers.get(listenerId);
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
        broadcasterPeers.delete(listenerId);
    }
    broadcasterPendingIce.delete(listenerId);
}

function updateBroadcasterListenersDisplay() {
    let connectedCount = 0;
    broadcasterPeers.forEach((pc) => {
        if (pc.connectionState === 'connected') connectedCount++;
    });
    updateListenerCount(connectedCount || broadcasterPeers.size);
}

// --- LÓGICA DO RECEPTOR (CELULAR) ---

if (startListenBtn) {
    startListenBtn.onclick = () => {
        prepareReceiverMode();
    };
}

function prepareReceiverMode() {
    isBroadcaster = false;
    showView('receiver');
    receiverDot.className = 'dot gray';
    receiverStatusText.textContent = 'Conectando ao áudio da sala...';

    socket.emit('receiver-ready', { roomId: currentRoomId });
}

function unlockAudioPlayback() {
    log('Desbloqueando áudio via toque do usuário...');
    if (remoteAudio) {
        remoteAudio.muted = false;
        remoteAudio.volume = parseFloat(volumeSlider ? volumeSlider.value : 1.0);
        remoteAudio.play().then(() => {
            log('Áudio ativado com sucesso!');
            audioUnlockContainer.classList.add('hidden');
            playbackPanel.classList.remove('hidden');
        }).catch((err) => {
            log(`Aguardando stream de áudio...`);
            audioUnlockContainer.classList.add('hidden');
            playbackPanel.classList.remove('hidden');
        });
    }

    socket.emit('receiver-ready', { roomId: currentRoomId });
}

if (unlockAudioBtn) {
    unlockAudioBtn.onclick = () => {
        unlockAudioPlayback();
    };
}

if (volumeSlider && remoteAudio) {
    volumeSlider.oninput = () => {
        remoteAudio.volume = parseFloat(volumeSlider.value);
    };
}

if (reconnectBtn) {
    reconnectBtn.onclick = () => {
        triggerAutoReconnect();
    };
}

function triggerAutoReconnect() {
    log('Reconectando receptor WebRTC...');
    cleanupReceiverConnection();
    receiverDot.className = 'dot orange';
    receiverStatusText.textContent = 'Reconectando ao PC...';
    socket.emit('receiver-ready', { roomId: currentRoomId });
}

function cleanupReceiverConnection() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (receiverPc) {
        receiverPc.ontrack = null;
        receiverPc.onicecandidate = null;
        receiverPc.onconnectionstatechange = null;
        receiverPc.close();
        receiverPc = null;
    }
    receiverIceQueue = [];
}

// --- TRATAMENTO DE SINAIS WEBRTC (OFFER, ANSWER, ICE) ---

socket.on('offer', async (data) => {
    log(`Oferta WebRTC recebida do PC (${data.senderId})`);
    
    if (!isBroadcaster && setupView.classList.contains('hidden') === false) {
        showView('receiver');
    }

    cleanupReceiverConnection();
    receiverPc = new RTCPeerConnection(rtcConfig);

    receiverPc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                targetId: data.senderId,
                roomId: currentRoomId,
                candidate: event.candidate
            });
        }
    };

    receiverPc.onconnectionstatechange = () => {
        log(`Estado WebRTC no celular: ${receiverPc.connectionState}`);
        if (receiverPc.connectionState === 'connected') {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            receiverDot.className = 'dot green';
            receiverStatusText.textContent = '🟢 Áudio Ao Vivo Conectado';
        } else if (receiverPc.connectionState === 'failed') {
            receiverDot.className = 'dot orange';
            receiverStatusText.textContent = 'Reconectando...';
            if (!reconnectTimer) {
                reconnectTimer = setTimeout(() => {
                    triggerAutoReconnect();
                }, 1500);
            }
        }
    };

    receiverPc.ontrack = (event) => {
        log(`Áudio direto recebido! Reproduzindo instantaneamente (< 100ms)...`);
        
        const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
        
        // Reprodução direta via elemento <audio> HTML5 sem atraso de buffer
        remoteAudio.srcObject = stream;
        remoteAudio.muted = false;
        remoteAudio.volume = parseFloat(volumeSlider ? volumeSlider.value : 1.0);

        // Visualizador visual em tempo real sem redirecionamento para o speaker
        setupVisualizer(stream, 'receiver-visualizer');

        const playPromise = remoteAudio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                log('Som saindo instantaneamente no celular!');
                receiverDot.className = 'dot green';
                receiverStatusText.textContent = '🟢 Áudio Ao Vivo Conectado';
                audioUnlockContainer.classList.add('hidden');
                playbackPanel.classList.remove('hidden');
            }).catch(e => {
                log(`Autoplay bloqueado pelo celular. Toque no botão verde: ${e.message}`);
                receiverDot.className = 'dot orange';
                receiverStatusText.textContent = 'Áudio pronto! Toque no botão verde abaixo:';
                audioUnlockContainer.classList.remove('hidden');
                playbackPanel.classList.add('hidden');
            });
        }
    };

    try {
        await receiverPc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        while (receiverIceQueue.length > 0) {
            const cand = receiverIceQueue.shift();
            try {
                await receiverPc.addIceCandidate(cand.candidate ? cand : new RTCIceCandidate(cand));
            } catch (e) {}
        }

        const answer = await receiverPc.createAnswer();
        await receiverPc.setLocalDescription(answer);

        socket.emit('answer', {
            targetId: data.senderId,
            roomId: currentRoomId,
            sdp: answer
        });
    } catch (e) {
        log(`Erro ao processar oferta: ${e.message}`);
    }
});

socket.on('answer', async (data) => {
    log(`Resposta (Answer) recebida do celular (${data.senderId})`);
    const pc = broadcasterPeers.get(data.senderId);
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

            const pending = broadcasterPendingIce.get(data.senderId) || [];
            while (pending.length > 0) {
                const cand = pending.shift();
                await pc.addIceCandidate(cand.candidate ? cand : new RTCIceCandidate(cand));
            }
        } catch (e) {
            log(`Erro ao aplicar Answer: ${e.message}`);
        }
    }
});

socket.on('ice-candidate', async (data) => {
    if (!data.candidate) return;

    if (isBroadcaster) {
        const pc = broadcasterPeers.get(data.senderId);
        if (pc && pc.remoteDescription) {
            try {
                await pc.addIceCandidate(data.candidate.candidate ? data.candidate : new RTCIceCandidate(data.candidate));
            } catch (e) {}
        } else {
            const queue = broadcasterPendingIce.get(data.senderId) || [];
            queue.push(data.candidate);
            broadcasterPendingIce.set(data.senderId, queue);
        }
    } else {
        if (receiverPc && receiverPc.remoteDescription) {
            try {
                await receiverPc.addIceCandidate(data.candidate.candidate ? data.candidate : new RTCIceCandidate(data.candidate));
            } catch (e) {}
        } else {
            receiverIceQueue.push(data.candidate);
        }
    }
});

// --- VISUALIZADOR DE ÁUDIO (Apenas análise visual sem delay de saída) ---
function setupVisualizer(stream, visualizerId) {
    const visualizerEl = document.getElementById(visualizerId);
    if (!visualizerEl) return;

    try {
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        // NOTA: Não conecta ao destination para evitar buffering/resampling de áudio!

        const bars = visualizerEl.querySelectorAll('.bar');
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function draw() {
            if (!stream.active) return;
            requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            bars.forEach((bar, i) => {
                const val = dataArray[i % dataArray.length] || 0;
                const height = Math.max(8, (val / 255) * 55);
                bar.style.height = `${height}px`;
            });
        }
        draw();
    } catch (e) {
        log(`Visualizer info: ${e.message}`);
    }
}
