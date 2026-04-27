const socket = io();
const pathParts = window.location.pathname.split('/').filter(p => p !== "");
const roomId = pathParts[0] || null;

const homeView = document.getElementById('home-view');
const setupView = document.getElementById('setup-view');
const roomInput = document.getElementById('room-input');
const goRoomBtn = document.getElementById('go-room');
const roomDisplay = document.getElementById('room-id');

if (roomId) {
    document.getElementById('room-display').classList.remove('hidden');
    roomDisplay.innerText = roomId;
    homeView.classList.add('hidden');
    setupView.classList.remove('hidden');
    socket.emit('join-room', roomId);
} else {
    document.getElementById('room-display').classList.add('hidden');
}

goRoomBtn.onclick = () => {
    const keyword = roomInput.value.trim().toLowerCase();
    if (keyword) window.location.href = `/${keyword}`;
};

roomInput.onkeypress = (e) => {
    if (e.key === 'Enter') goRoomBtn.click();
};

// --- GLOBAL ERROR CATCHING ---
const debugLog = document.getElementById('debug-log');
function log(msg) {
    console.log(msg);
    const entry = document.createElement('div');
    entry.innerText = `> ${new Date().toLocaleTimeString()}: ${msg}`;
    if (debugLog) debugLog.prepend(entry);
}

window.onerror = (msg, url, line) => {
    log(`JS ERROR: ${msg} at ${line}`);
};

const startBtn = document.getElementById('start-broadcast');
const stopBtn = document.getElementById('stop-broadcast');
const streamView = document.getElementById('stream-view');
const receiverView = document.getElementById('receiver-view');
const remoteAudio = document.getElementById('remote-audio');
const audioStatus = document.getElementById('audio-status');
const manualPlayBtn = document.getElementById('manual-play');

let localStream;
let peerConnection;
const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function cleanupConnection() {
    if (peerConnection) {
        log("Cleaning up old connection...");
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
        peerConnection = null;
    }
}

// --- SIGNALING LISTENERS ---

socket.on('user-connected', (userId) => {
    if (localStream) {
        log(`New user joined: ${userId}. Starting call...`);
        initiateCall(userId);
    }
});

socket.on('receiver-ready', (userId) => {
    if (localStream) {
        log(`Receiver ${userId} ready. Starting call...`);
        initiateCall(userId);
    }
});

socket.on('broadcaster-ready', (broadcasterId) => {
    if (!localStream) {
        log(`Broadcaster detected: ${broadcasterId}. Sending readiness...`);
        socket.emit('receiver-ready', { roomId, targetId: broadcasterId });
    }
});

socket.on('offer', async (data) => {
    log(`Offer received from ${data.senderId}`);
    if (!localStream) {
        setupView.classList.add('hidden');
        receiverView.classList.remove('hidden');
    }

    cleanupConnection();
    peerConnection = createPeerConnection(data.senderId);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer', { roomId, sdp: answer });
});

socket.on('answer', async (data) => {
    log(`Answer received from ${data.senderId}`);
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
});

socket.on('user-disconnected', (userId) => {
    log(`User ${userId} disconnected.`);
    cleanupConnection();
    if (!localStream) {
        // If we are the receiver, go back to idle
        const dot = audioStatus.querySelector('.dot');
        const text = audioStatus.querySelector('span');
        if (dot) dot.className = 'dot gray';
        if (text) text.innerText = 'Idle';
    }
});

socket.on('ice-candidate', async (data) => {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
            console.error("Error adding ice candidate", e);
        }
    }
});

// --- TRANSMITTER LOGIC ---

if (startBtn) {
    startBtn.onclick = async () => {
        log("Button clicked. Checking mediaDevices...");
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                throw new Error("getDisplayMedia not supported (Use HTTPS)");
            }

            log("Requesting stream (Select Screen + Share Audio)...");
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            const audioTracks = localStream.getAudioTracks();
            if (audioTracks.length === 0) {
                localStream.getTracks().forEach(t => t.stop());
                throw new Error("No audio track selected in the popup.");
            }

            log("Success! Audio captured.");
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) videoTrack.stop();

            setupView.classList.add('hidden');
            streamView.classList.remove('hidden');

            socket.emit('broadcaster-ready', roomId);
            startVisualizer(localStream);

        } catch (err) {
            log(`CRITICAL ERROR: ${err.message}`);
            alert(`Error: ${err.message}`);
        }
    };
}

async function initiateCall(targetId) {
    cleanupConnection();
    peerConnection = createPeerConnection(targetId);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('offer', { roomId, sdp: offer });
}

function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection(config);
    log(`PC created for ${targetId}`);

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId, candidate: event.candidate });
        }
    };

    pc.onconnectionstatechange = () => {
        log(`State: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
            const dot = audioStatus.querySelector('.dot');
            if (dot) dot.className = 'dot green';
        }
    };

    pc.ontrack = (event) => {
        log(`Track received: ${event.track.kind}`);
        
        // Robust way to attach the stream
        if (event.streams && event.streams[0]) {
            remoteAudio.srcObject = event.streams[0];
        } else {
            // Fallback for browsers that don't provide the stream in the event
            if (!remoteAudio.srcObject) {
                remoteAudio.srcObject = new MediaStream();
            }
            remoteAudio.srcObject.addTrack(event.track);
        }
        
        remoteAudio.play().then(() => {
            log("Playing audio stream...");
            const text = audioStatus.querySelector('span');
            if (text) text.innerText = 'Streaming Active';
        }).catch(e => {
            log("Autoplay blocked. Tap the button below.");
            manualPlayBtn.classList.remove('hidden');
            manualPlayBtn.onclick = () => {
                remoteAudio.play();
                manualPlayBtn.classList.add('hidden');
                log("Audio started by user gesture.");
            };
        });
    };

    return pc;
}

function startVisualizer(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 32;
    source.connect(analyser);

    const bars = document.querySelectorAll('.bar');
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
        if (!localStream) return;
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        bars.forEach((bar, i) => {
            const h = Math.max(10, (dataArray[i] / 255) * 60);
            bar.style.height = `${h}px`;
        });
    }
    draw();
}

if (stopBtn) stopBtn.onclick = () => location.reload();
