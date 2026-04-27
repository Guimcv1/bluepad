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

let localStream;
let peerConnection;
const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// --- TRANSMITTER LOGIC ---

startBtn.onclick = async () => {
    try {
        // Capture system audio (requires video:true)
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'monitor' },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        // Hide video track to save bandwidth, we only need audio
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) videoTrack.stop();

        setupView.classList.add('hidden');
        streamView.classList.remove('hidden');

        // When a new user connects, start a peer connection
        socket.on('user-connected', (userId) => {
            initiateCall(userId);
        });

        // Start visualizer
        startVisualizer(localStream);

    } catch (err) {
        console.error("Error capturing audio:", err);
        alert("Could not capture audio. Make sure to share 'Entire Screen' and check 'Share Audio'.");
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
    peerConnection = createPeerConnection(targetId);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('offer', { roomId, sdp: offer });
}

// --- RECEIVER LOGIC ---

socket.on('offer', async (data) => {
    // If we are not the transmitter, show receiver view
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

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        console.log("Track received");
        remoteAudio.srcObject = event.streams[0];
        
        // Update status UI
        const dot = audioStatus.querySelector('.dot');
        const text = audioStatus.querySelector('span');
        dot.className = 'dot green';
        text.innerText = 'Streaming Audio';
        
        // Browsers often block autoplay without user interaction
        remoteAudio.play().catch(e => {
            console.log("Autoplay blocked, waiting for interaction");
            text.innerText = 'Tap to Start Audio';
            window.addEventListener('click', () => remoteAudio.play(), { once: true });
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
