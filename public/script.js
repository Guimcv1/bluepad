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
    if (keyword) {
        window.location.href = `/${keyword}`;
    }
};

roomInput.onkeypress = (e) => {
    if (e.key === 'Enter') goRoomBtn.click();
};

const startBtn = document.getElementById('start-broadcast');
const stopBtn = document.getElementById('stop-broadcast');
const streamView = document.getElementById('stream-view');
const receiverView = document.getElementById('receiver-view');
const remoteAudio = document.getElementById('remote-audio');
const audioStatus = document.getElementById('audio-status');
const debugLog = document.getElementById('debug-log');
const manualPlayBtn = document.getElementById('manual-play');

let localStream;
let peerConnection;
const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function log(msg) {
    console.log(msg);
    const entry = document.createElement('div');
    entry.innerText = `> ${msg}`;
    debugLog.prepend(entry);
}

log(`Room: ${roomId || 'none'}`);

// --- TRANSMITTER LOGIC ---

startBtn.onclick = async () => {
    try {
        log("Requesting display media...");
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'monitor' },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length === 0) {
            log("Error: No audio track found. Did you check 'Share Audio'?");
            alert("No audio track detected. Please select 'Entire Screen' and check the 'Share Audio' box.");
            return;
        }

        log("Audio track captured successfully.");

        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) videoTrack.stop();

        setupView.classList.add('hidden');
        streamView.classList.remove('hidden');

        socket.on('user-connected', (userId) => {
            log(`New user connected: ${userId}. Starting call...`);
            initiateCall(userId);
        });

        // Notify anyone already in the room
        socket.emit('broadcaster-ready', roomId);

        // Listen for receivers who were already there
        socket.on('receiver-ready', (userId) => {
            log(`Receiver ${userId} is ready. Starting call...`);
            initiateCall(userId);
        });

        startVisualizer(localStream);

    } catch (err) {
        log(`Capture error: ${err.message}`);
        alert("Could not capture audio. Ensure you are on HTTPS and granted permissions.");
    }
};

function startVisualizer(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 32;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const bars = document.querySelectorAll('.bar');

    function draw() {
        if (!localStream) return;
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        bars.forEach((bar, index) => {
            const val = dataArray[index] || 0;
            const height = Math.max(10, (val / 255) * 60);
            bar.style.height = `${height}px`;
        });
    }
    draw();
}

async function initiateCall(targetId) {
    log(`Initiating call to ${targetId}`);
    peerConnection = createPeerConnection(targetId);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('offer', { roomId, sdp: offer });
}

// --- RECEIVER LOGIC ---

socket.on('broadcaster-ready', (broadcasterId) => {
    log(`Broadcaster detected: ${broadcasterId}. Sending readiness...`);
    socket.emit('receiver-ready', { roomId, targetId: broadcasterId });
});

socket.on('offer', async (data) => {
    log(`Offer received from ${data.senderId}`);
    if (!localStream) {
        setupView.classList.add('hidden');
        receiverView.classList.remove('hidden');
    }

    peerConnection = createPeerConnection(data.senderId);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer', { roomId, sdp: answer });
});

socket.on('answer', async (data) => {
    log(`Answer received from ${data.senderId}`);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
});

socket.on('ice-candidate', async (data) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// --- HELPER FUNCTIONS ---

function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection(config);
    log(`Creating RTCPeerConnection for ${targetId}`);

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId, candidate: event.candidate });
        }
    };

    pc.onconnectionstatechange = () => {
        log(`Connection state: ${pc.connectionState}`);
    };

    pc.ontrack = (event) => {
        log("Audio track received from peer.");
        remoteAudio.srcObject = event.streams[0];
        
        const dot = audioStatus.querySelector('.dot');
        const text = audioStatus.querySelector('span');
        dot.className = 'dot green';
        text.innerText = 'Connected';
        
        remoteAudio.play().then(() => {
            log("Autoplay successful.");
        }).catch(e => {
            log("Autoplay blocked. Showing manual play button.");
            manualPlayBtn.classList.remove('hidden');
            manualPlayBtn.onclick = () => {
                remoteAudio.play();
                manualPlayBtn.classList.add('hidden');
                log("Audio started manually.");
            };
        });
    };

    return pc;
}

stopBtn.onclick = () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
    }
    location.reload();
};
