// BluePad Stream & Discord Voice Chat - Script Principal
const socket = io();

// --- FUNÇÕES AUXILIARES DE COOKIES ---
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
    return null;
}

function setCookie(name, value, days = 365) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}

// --- ELEMENTOS DO DOM ---
const appHeader = document.querySelector('.app-header');
const modeSwitcher = document.getElementById('mode-switcher');
const navDiscordBtn = document.getElementById('nav-discord-btn');
const navStreamBtn = document.getElementById('nav-stream-btn');

const homeView = document.getElementById('home-view');
const setupView = document.getElementById('setup-view');
const streamView = document.getElementById('stream-view');
const receiverView = document.getElementById('receiver-view');
const discordView = document.getElementById('discord-view');

const roomInput = document.getElementById('room-input');
const nicknameInput = document.getElementById('nickname-input');
const goRoomBtn = document.getElementById('go-room');
const roomDisplay = document.getElementById('room-display');
const roomIdEl = document.getElementById('room-id');

const roomStatusPill = document.getElementById('room-broadcaster-status');
const roomStatusText = document.getElementById('room-status-text');
const shareUrlEl = document.getElementById('share-url');
const copyUrlBtn = document.getElementById('copy-url-btn');

const openDiscordModeBtn = document.getElementById('open-discord-mode-btn');
const startScreenBroadcastBtn = document.getElementById('start-screen-broadcast-btn');
const startListenBtn = document.getElementById('start-listen-btn');
const stopBroadcastBtn = document.getElementById('stop-broadcast-btn');
const listenerCountText = document.getElementById('listener-count-text');
const streamModeTitle = document.getElementById('stream-mode-title');

const localVideoContainer = document.getElementById('local-video-container');
const localVideo = document.getElementById('local-video');

const receiverDot = document.getElementById('receiver-dot');
const receiverStatusText = document.getElementById('receiver-status-text');
const audioUnlockContainer = document.getElementById('audio-unlock-container');
const unlockAudioBtn = document.getElementById('unlock-audio-btn');

const videoContainer = document.getElementById('video-container');
const remoteVideo = document.getElementById('remote-video');
const fullscreenBtn = document.getElementById('fullscreen-btn');

const playbackPanel = document.getElementById('playback-panel');
const volumeSlider = document.getElementById('volume-slider');
const reconnectBtn = document.getElementById('reconnect-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

const remoteAudio = document.getElementById('remote-audio');

// --- DISCORD DOM ELEMENTS ---
const discordServerTitle = document.getElementById('discord-server-title');
const discordServerInitial = document.getElementById('discord-server-initial');
const discordHomeBtn = document.getElementById('discord-home-btn');

const currentChannelTitle = document.getElementById('current-channel-title');
const discordTextWorkspace = document.getElementById('discord-text-workspace');
const discordVoiceWorkspace = document.getElementById('discord-voice-workspace');
const voiceWorkspaceTitle = document.getElementById('voice-workspace-title');

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const voiceMembersGrid = document.getElementById('voice-members-grid');
const btnJoinCurrentVoice = document.getElementById('btn-join-current-voice');
const btnLeaveCurrentVoice = document.getElementById('btn-leave-current-voice');
const btnVoiceScreenshare = document.getElementById('btn-voice-screenshare');
const btnVoiceScreenshareBig = document.getElementById('btn-voice-screenshare-big');

// ELEMENTOS DE TRANSMISSÃO DE TELA NO VOIP (MULTI-USUÁRIO E FOCO)
const focusedScreenshareContainer = document.getElementById('focused-screenshare-container');
const focusedScreenshareVideo = document.getElementById('focused-screenshare-video');
const focusedScreenshareTitle = document.getElementById('focused-screenshare-title');
const btnCloseFocus = document.getElementById('btn-close-focus');
const voiceStreamsGrid = document.getElementById('voice-streams-grid');

const voiceConnectedBar = document.getElementById('voice-connected-bar');
const voiceActiveName = document.getElementById('voice-active-name');
const btnMicToggle = document.getElementById('btn-mic-toggle');
const btnDeafenToggle = document.getElementById('btn-deafen-toggle');
const btnVoiceDisconnect = document.getElementById('btn-voice-disconnect');

const myAvatar = document.getElementById('my-avatar');
const myAvatarLetter = document.getElementById('my-avatar-letter');
const myUsernameEl = document.getElementById('my-username');
const myUsertagEl = document.getElementById('my-usertag');

const onlineUsersCount = document.getElementById('online-users-count');
const discordMembersList = document.getElementById('discord-members-list');

// MODAL DE CONFIGURAÇÃO DE DISPOSITIVOS DE ÁUDIO
const deviceSettingsModal = document.getElementById('device-settings-modal');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const micSelect = document.getElementById('mic-select');
const speakerSelect = document.getElementById('speaker-select');

// Configuração WebRTC
let rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 0
};

// --- ESTADO DA APLICAÇÃO ---
let currentRoomId = null;
let currentView = 'home';

// Perfil do Usuário (Nome em branco se for a 1ª vez!)
const AVATAR_COLORS = ['#5865f2', '#38bdf8', '#23a55a', '#f0b232', '#eb459e', '#9b59b6', '#e74c3c'];
const savedNickname = getCookie('bluepad_nickname') || localStorage.getItem('bluepad_nickname') || '';
let myUsername = savedNickname;
let myAvatarColor = localStorage.getItem('bluepad_color') || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
let myUserTag = `#${Math.floor(1000 + Math.random() * 9000)}`;

// Dispositivos Selecionados
let selectedMicId = localStorage.getItem('bluepad_selected_mic') || 'default';
let selectedSpeakerId = localStorage.getItem('bluepad_selected_speaker') || 'default';

// Preenche em branco se não houver cookie/localStorage salvo
if (nicknameInput) nicknameInput.value = myUsername;

// Estado da Transmissão Clássica
let isBroadcaster = false;
let localStream = null;
const broadcasterPeers = new Map();
const broadcasterPendingIce = new Map();
let receiverPc = null;
let receiverIceQueue = [];
let reconnectTimer = null;

// Otimização de Memória RAM: Controle de AudioContext & Animação
let activeAudioContext = null;
const visualizerAnimIds = new Map();

// Estado do Discord Chat & Voz
let currentDiscordChannelId = 'geral';
let currentDiscordChannelType = 'text';
let activeVoiceChannelId = null;
let isMicMuted = false;
let isDeafened = false;
let isSpeaking = false;
let isVoiceScreenSharing = false;
let localVoiceStream = null;
let localVoiceScreenStream = null;
let voiceAnalyzerLoopId = null;

// Mapa de Transmissões de Tela Ativas no VOIP: streamId -> { id, userId, username, stream }
const activeScreenStreams = new Map();
let focusedScreenId = null;

// Conexões P2P Mesh de Voz: peerSocketId -> { pc: RTCPeerConnection, audioElem: HTMLAudioElement }
const voicePeers = new Map();
const voicePendingIce = new Map();

// Armazenamento local de mensagens e canais
let discordMessages = { geral: [] };
let discordVoiceChannelsUsers = { 'v-geral': [] };
let roomOnlineUsers = [];

// --- SISTEMA DE LOGS ---
function log(msg) {
    console.log(`[BluePad] ${msg}`);
}

window.addEventListener('error', (e) => log(`Erro JS: ${e.message}`));

const btnChoiceDiscord = document.getElementById('btn-choice-discord');
const btnChoiceStream = document.getElementById('btn-choice-stream');

// --- ROTEAMENTO DA SALA E ESCOLHA INICIAL ---
const pathSegments = window.location.pathname.split('/').filter(p => p.trim() !== '');
currentRoomId = pathSegments[0] ? decodeURIComponent(pathSegments[0]).toLowerCase() : null;

if (currentRoomId && roomInput) {
    roomInput.value = currentRoomId;
}

// Sempre exibir a tela de escolha inicial ao acessar
showView('home');

function getSelectedRoom() {
    let room = roomInput ? roomInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') : '';
    if (!room) room = currentRoomId || 'resenha';
    return room;
}

function startSelectedMode(mode) {
    const room = getSelectedRoom();
    currentRoomId = room;

    let typedNickname = nicknameInput ? nicknameInput.value.trim() : '';
    if (!typedNickname && !myUsername) {
        alert('Por favor, informe seu nome de usuário!');
        if (nicknameInput) nicknameInput.focus();
        return;
    }

    if (typedNickname) {
        myUsername = typedNickname;
        setCookie('bluepad_nickname', myUsername);
        localStorage.setItem('bluepad_nickname', myUsername);
    }

    if (window.location.pathname !== `/${room}`) {
        window.history.pushState({}, '', `/${room}`);
    }

    initRoom(room);

    if (mode === 'discord') {
        showView('discord');
    } else {
        showView('setup');
    }
}

if (btnChoiceDiscord) {
    btnChoiceDiscord.onclick = () => startSelectedMode('discord');
}

if (btnChoiceStream) {
    btnChoiceStream.onclick = () => startSelectedMode('stream');
}

function initRoom(roomId) {
    currentRoomId = roomId;
    roomIdEl.textContent = roomId;
    roomDisplay.classList.remove('hidden');
    modeSwitcher.classList.remove('hidden');

    if (discordServerTitle) discordServerTitle.textContent = `Servidor ${roomId}`;
    if (discordServerInitial) discordServerInitial.textContent = roomId.substring(0, 2).toUpperCase();

    if (nicknameInput && nicknameInput.value.trim()) {
        myUsername = nicknameInput.value.trim();
        setCookie('bluepad_nickname', myUsername);
        localStorage.setItem('bluepad_nickname', myUsername);
    }
    localStorage.setItem('bluepad_color', myAvatarColor);

    if (myUsernameEl) myUsernameEl.textContent = myUsername || 'Usuário';
    if (myUsertagEl) myUsertagEl.textContent = myUserTag;
    if (myAvatar) {
        myAvatar.style.backgroundColor = myAvatarColor;
        if (myAvatarLetter) myAvatarLetter.textContent = (myUsername || 'U').charAt(0).toUpperCase();
    }

    fetch('/api/info')
        .then(res => res.json())
        .then(data => {
            if (data.iceServers && data.iceServers.length > 0) {
                rtcConfig.iceServers = data.iceServers;
            }

            const host = data.localIp || window.location.hostname;
            const port = data.port || window.location.port;
            const shareUrl = `${window.location.protocol}//${host}${port ? `:${port}` : ''}/${roomId}`;
            if (shareUrlEl) {
                shareUrlEl.textContent = shareUrl;
                shareUrlEl.setAttribute('data-url', shareUrl);
            }
        })
        .catch(() => {
            if (shareUrlEl) {
                shareUrlEl.textContent = window.location.href;
                shareUrlEl.setAttribute('data-url', window.location.href);
            }
        });

    log(`Conectando à sala: ${roomId} como ${myUsername}`);

    socket.emit('join-room', {
        roomId,
        username: myUsername || 'Usuário',
        avatarColor: myAvatarColor
    });
}

if (goRoomBtn && roomInput) {
    const handleJoin = () => {
        const keyword = roomInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (nicknameInput && nicknameInput.value.trim()) {
            myUsername = nicknameInput.value.trim();
            setCookie('bluepad_nickname', myUsername);
            localStorage.setItem('bluepad_nickname', myUsername);
        }
        if (keyword) {
            window.location.href = `/${keyword}`;
        }
    };
    goRoomBtn.onclick = handleJoin;
    roomInput.onkeypress = (e) => { if (e.key === 'Enter') handleJoin(); };
}

if (copyUrlBtn) {
    copyUrlBtn.onclick = () => {
        const url = shareUrlEl.getAttribute('data-url') || shareUrlEl.textContent;
        navigator.clipboard.writeText(url).then(() => {
            copyUrlBtn.textContent = '✅';
            setTimeout(() => { copyUrlBtn.textContent = '📋'; }, 2000);
        }).catch(() => prompt('Copie o link abaixo:', url));
    };
}

if (leaveRoomBtn || discordHomeBtn) {
    const goHome = () => { window.location.href = '/'; };
    if (leaveRoomBtn) leaveRoomBtn.onclick = goHome;
    if (discordHomeBtn) discordHomeBtn.onclick = goHome;
}

// --- GERENCIADOR DE VISÕES / VIEWS ---
function showView(name) {
    currentView = name;
    homeView.classList.add('hidden');
    setupView.classList.add('hidden');
    streamView.classList.add('hidden');
    receiverView.classList.add('hidden');
    discordView.classList.add('hidden');

    if (navDiscordBtn && navStreamBtn) {
        navDiscordBtn.classList.remove('active');
        navStreamBtn.classList.remove('active');
    }

    if (name === 'home') {
        homeView.classList.remove('hidden');
        modeSwitcher.classList.add('hidden');
    } else if (name === 'setup') {
        setupView.classList.remove('hidden');
        if (navStreamBtn) navStreamBtn.classList.add('active');
    } else if (name === 'stream') {
        streamView.classList.remove('hidden');
        if (navStreamBtn) navStreamBtn.classList.add('active');
    } else if (name === 'receiver') {
        receiverView.classList.remove('hidden');
        if (navStreamBtn) navStreamBtn.classList.add('active');
    } else if (name === 'discord') {
        discordView.classList.remove('hidden');
        if (navDiscordBtn) navDiscordBtn.classList.add('active');
    }
}

if (navDiscordBtn) navDiscordBtn.onclick = () => showView('discord');
if (navStreamBtn) navStreamBtn.onclick = () => showView('setup');
if (openDiscordModeBtn) openDiscordModeBtn.onclick = () => showView('discord');

// --- CONFIGURAÇÃO E SELEÇÃO DE DISPOSITIVOS DE ÁUDIO ---

async function populateAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

    try {
        if (!navigator.mediaDevices.ondevicechange) {
            navigator.mediaDevices.ondevicechange = () => populateAudioDevices();
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (micSelect) micSelect.innerHTML = '';
        if (speakerSelect) speakerSelect.innerHTML = '';

        let micCount = 0;
        let speakerCount = 0;

        devices.forEach(device => {
            if (device.kind === 'audioinput') {
                micCount++;
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microfone ${micCount}`;
                if (device.deviceId === selectedMicId) option.selected = true;
                if (micSelect) micSelect.appendChild(option);
            } else if (device.kind === 'audiooutput') {
                speakerCount++;
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Alto-falante / Fone ${speakerCount}`;
                if (device.deviceId === selectedSpeakerId) option.selected = true;
                if (speakerSelect) speakerSelect.appendChild(option);
            }
        });

        if (micCount === 0 && micSelect) micSelect.innerHTML = '<option value="default">Microfone Padrão</option>';
        if (speakerCount === 0 && speakerSelect) speakerSelect.innerHTML = '<option value="default">Alto-falante Padrão</option>';

    } catch (e) {
        log(`Erro ao enumerar dispositivos: ${e.message}`);
    }
}

if (btnOpenSettings) {
    btnOpenSettings.onclick = () => {
        populateAudioDevices();
        if (deviceSettingsModal) deviceSettingsModal.classList.remove('hidden');
    };
}

if (btnCloseSettings) {
    btnCloseSettings.onclick = () => {
        if (deviceSettingsModal) deviceSettingsModal.classList.add('hidden');
    };
}

if (btnSaveSettings) {
    btnSaveSettings.onclick = async () => {
        if (micSelect && micSelect.value) {
            selectedMicId = micSelect.value;
            localStorage.setItem('bluepad_selected_mic', selectedMicId);
            if (activeVoiceChannelId && localVoiceStream) {
                await updateMicrophoneTrack(selectedMicId);
            }
        }

        if (speakerSelect && speakerSelect.value) {
            selectedSpeakerId = speakerSelect.value;
            localStorage.setItem('bluepad_selected_speaker', selectedSpeakerId);
            applySpeakerOutputDevice(selectedSpeakerId);
        }

        if (deviceSettingsModal) deviceSettingsModal.classList.add('hidden');
    };
}

async function updateMicrophoneTrack(deviceId) {
    log(`Alterando microfone para dispositivo: ${deviceId}`);
    try {
        const constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        const newTrack = newStream.getAudioTracks()[0];

        if (localVoiceStream) {
            const oldTrack = localVoiceStream.getAudioTracks()[0];
            if (oldTrack) oldTrack.stop();
            localVoiceStream.removeTrack(oldTrack);
            localVoiceStream.addTrack(newTrack);
        }

        voicePeers.forEach(({ pc }) => {
            const senders = pc.getSenders();
            const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
            if (audioSender) audioSender.replaceTrack(newTrack);
        });

        startLiveSpeechDetection(localVoiceStream);
    } catch (e) {
        log(`Erro ao alterar microfone: ${e.message}`);
    }
}

function applySpeakerOutputDevice(deviceId) {
    log(`Alterando saída de som para dispositivo: ${deviceId}`);
    const audioContainer = document.getElementById('voice-audio-container');
    if (audioContainer && typeof HTMLMediaElement.prototype.setSinkId === 'function') {
        audioContainer.querySelectorAll('audio').forEach(elem => {
            elem.setSinkId(deviceId).catch(e => log(`setSinkId info: ${e.message}`));
        });
    }
}

// --- EVENTOS DO SOCKET.IO DO SERVIDOR ---

socket.on('room-status', (data) => {
    log(`Status da sala: Transmissor=${data.hasBroadcaster ? 'Ativo' : 'Inativo'}, Ouvintes=${data.listenerCount}`);
    updateBroadcasterStatusIndicator(data.hasBroadcaster);
});

socket.on('discord-init', (data) => {
    log('Dados iniciais do Discord recebidos.');
    if (data.messages) discordMessages = data.messages;
    if (data.voiceChannels) discordVoiceChannelsUsers = data.voiceChannels;
    if (data.users) roomOnlineUsers = data.users;

    renderChatMessages();
    renderVoiceMembersGrid();
    renderOnlineMembersSidebar();
    updateVoiceChannelBadges();
});

socket.on('user-list-update', (users) => {
    roomOnlineUsers = users;
    renderOnlineMembersSidebar();
});

socket.on('new-message', (data) => {
    const { channelId, message } = data;
    if (!discordMessages[channelId]) discordMessages[channelId] = [];
    discordMessages[channelId].push(message);

    if (currentDiscordChannelType === 'text' && currentDiscordChannelId === channelId) {
        appendChatMessage(message);
        scrollChatToBottom();
    }
});

socket.on('voice-channel-update', (data) => {
    const { channelId, users } = data;
    discordVoiceChannelsUsers[channelId] = users;
    updateVoiceChannelBadges();

    if (currentDiscordChannelType === 'voice' && currentDiscordChannelId === channelId) {
        renderVoiceMembersGrid();
    }
});

socket.on('voice-user-state-changed', (data) => {
    const { channelId, userId, isMuted, isDeafened, isSpeaking } = data;
    const list = discordVoiceChannelsUsers[channelId] || [];
    const target = list.find(u => u.id === userId);
    if (target) {
        target.isMuted = isMuted;
        target.isDeafened = isDeafened;
        target.isSpeaking = isSpeaking;
    }

    if (currentDiscordChannelType === 'voice' && currentDiscordChannelId === channelId) {
        updateSingleVoiceUserCard(userId, { isMuted, isDeafened, isSpeaking });
    }
});

socket.on('voice-screen-started', (data) => {
    log(`Transmissão de tela iniciada pelo usuário ${data.username} (${data.userId})`);
});

socket.on('voice-screen-stopped', (data) => {
    log(`Transmissão de tela encerrada pelo usuário (${data.userId})`);
    if (activeScreenStreams.has(data.userId)) {
        activeScreenStreams.delete(data.userId);
        if (focusedScreenId === data.userId) {
            closeFocusScreenStream();
        }
        renderVoiceStreamsGrid();
    }
});

// --- DISCORD: CANAIS DE TEXTO E MENSAGENS ---

document.querySelectorAll('.channel-item').forEach(item => {
    item.onclick = () => {
        const channelId = item.getAttribute('data-channel-id');
        const channelType = item.getAttribute('data-channel-type');

        document.querySelectorAll('.channel-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        switchDiscordChannel(channelId, channelType, item.querySelector('.channel-name').textContent);
    };
});

function switchDiscordChannel(channelId, channelType, channelName) {
    currentDiscordChannelId = channelId;
    currentDiscordChannelType = channelType;

    if (channelType === 'text') {
        discordTextWorkspace.classList.remove('hidden');
        discordVoiceWorkspace.classList.add('hidden');
        if (currentChannelTitle) currentChannelTitle.textContent = channelName;
        if (chatInput) chatInput.placeholder = `Conversar em #${channelName}`;
        renderChatMessages();
        scrollChatToBottom();
    } else if (channelType === 'voice') {
        discordTextWorkspace.classList.add('hidden');
        discordVoiceWorkspace.classList.remove('hidden');
        if (voiceWorkspaceTitle) voiceWorkspaceTitle.textContent = channelName;
        renderVoiceMembersGrid();
        renderVoiceStreamsGrid();
        updateVoiceJoinLeaveButtons();

        if (activeVoiceChannelId !== channelId) {
            joinVoiceChannel(channelId);
        }
    }
}

function renderChatMessages() {
    if (!chatMessages) return;
    chatMessages.innerHTML = '';
    const list = discordMessages[currentDiscordChannelId] || [];
    list.forEach(msg => appendChatMessage(msg));
}

function appendChatMessage(msg) {
    if (!chatMessages) return;
    const item = document.createElement('div');
    item.className = `message-item ${msg.isSystem ? 'system' : ''}`;

    item.innerHTML = `
        <div class="msg-avatar" style="background-color: ${msg.avatarColor || '#5865f2'}">
            ${(msg.username || 'U').charAt(0).toUpperCase()}
        </div>
        <div class="msg-content-wrapper">
            <div class="msg-header">
                <span class="msg-author">${escapeHtml(msg.username)}</span>
                <span class="msg-timestamp">${msg.timestamp || ''}</span>
            </div>
            <div class="msg-text">${escapeHtml(msg.content)}</div>
        </div>
    `;

    chatMessages.appendChild(item);
}

function scrollChatToBottom() {
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

if (chatForm && chatInput) {
    chatForm.onsubmit = (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (text) {
            socket.emit('send-message', {
                roomId: currentRoomId,
                channelId: currentDiscordChannelId,
                content: text
            });
            chatInput.value = '';
        }
    };
}

// --- DISCORD: CANAIS DE VOZ E SINALIZAÇÃO P2P MESH ---

async function joinVoiceChannel(channelId) {
    if (activeVoiceChannelId === channelId) return;

    if (activeVoiceChannelId) {
        leaveVoiceChannel();
    }

    log(`Entrando no canal de voz: ${channelId}...`);
    try {
        const constraints = {
            audio: selectedMicId && selectedMicId !== 'default' ? { deviceId: { exact: selectedMicId } } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localVoiceStream = stream;
        activeVoiceChannelId = channelId;

        if (voiceConnectedBar) voiceConnectedBar.classList.remove('hidden');
        if (voiceActiveName) {
            const channelElem = document.querySelector(`.channel-item[data-channel-id="${channelId}"] .channel-name`);
            voiceActiveName.textContent = channelElem ? channelElem.textContent : 'Canal de Voz';
        }

        startLiveSpeechDetection(localVoiceStream);
        socket.emit('join-voice-channel', { roomId: currentRoomId, channelId });
        updateVoiceJoinLeaveButtons();

    } catch (err) {
        log(`Erro ao acessar microfone: ${err.message}`);
        alert(`Erro ao conectar voz: ${err.message}. Permita o uso do microfone.`);
    }
}

function leaveVoiceChannel() {
    if (!activeVoiceChannelId) return;

    log(`Saindo do canal de voz: ${activeVoiceChannelId}`);
    socket.emit('leave-voice-channel', { roomId: currentRoomId });

    if (isVoiceScreenSharing) {
        stopVoiceScreenShare();
    }

    if (localVoiceStream) {
        cleanupMediaStream(localVoiceStream);
        localVoiceStream = null;
    }

    activeScreenStreams.clear();
    closeFocusScreenStream();
    renderVoiceStreamsGrid();

    voicePeers.forEach(({ pc, audioElem }) => {
        cleanupPeerConnection(pc);
        if (audioElem && audioElem.parentNode) {
            audioElem.pause();
            audioElem.srcObject = null;
            audioElem.parentNode.removeChild(audioElem);
        }
    });
    voicePeers.clear();
    voicePendingIce.clear();

    stopLiveSpeechDetection();
    activeVoiceChannelId = null;
    isSpeaking = false;

    if (voiceConnectedBar) voiceConnectedBar.classList.add('hidden');
    updateVoiceJoinLeaveButtons();
}

if (btnJoinCurrentVoice) btnJoinCurrentVoice.onclick = () => joinVoiceChannel(currentDiscordChannelId);
if (btnLeaveCurrentVoice) btnLeaveCurrentVoice.onclick = () => leaveVoiceChannel();
if (btnVoiceDisconnect) btnVoiceDisconnect.onclick = () => leaveVoiceChannel();

// --- TRANSMISSÃO DE TELA MULTI-USUÁRIO NO VOIP (RENDERIZAÇÃO SOB DEMANDA PARA ECONOMIZAR RAM E INTERNET) ---

async function toggleVoiceScreenShare() {
    if (!activeVoiceChannelId) {
        alert('Entre primeiro em um canal de voz para compartilhar a tela com seus amigos!');
        return;
    }

    if (isVoiceScreenSharing) {
        stopVoiceScreenShare();
    } else {
        await startVoiceScreenShare();
    }
}

async function startVoiceScreenShare() {
    log('Iniciando transmissão de tela na chamada de voz (VOIP)...');
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } },
            audio: true
        });

        localVoiceScreenStream = stream;
        isVoiceScreenSharing = true;

        const videoTrack = stream.getVideoTracks()[0];

        // Adicionar transmissão local ao mapa de telas ativas
        activeScreenStreams.set('local_screen', {
            id: 'local_screen',
            userId: socket.id,
            username: `${myUsername} (Você)`,
            stream: localVoiceScreenStream
        });

        renderVoiceStreamsGrid();
        focusScreenStream('local_screen');

        socket.emit('voice-screen-started', { roomId: currentRoomId });

        if (videoTrack) {
            videoTrack.onended = () => stopVoiceScreenShare();

            // Adicionar a faixa de vídeo às conexões P2P ativas no canal de voz
            voicePeers.forEach(({ pc }) => {
                pc.addTrack(videoTrack, localVoiceScreenStream);
                pc.createOffer().then(offer => {
                    pc.setLocalDescription(offer);
                    socket.emit('voice-signal-offer', { targetId: pc.peerId, sdp: offer });
                }).catch(e => {});
            });
        }

        if (btnVoiceScreenshare) btnVoiceScreenshare.classList.add('active-off');
        if (btnVoiceScreenshareBig) btnVoiceScreenshareBig.textContent = '🛑 Parar Transmissão de Tela';

    } catch (err) {
        log(`Erro ao compartilhar tela na voz: ${err.message}`);
    }
}

function stopVoiceScreenShare() {
    isVoiceScreenSharing = false;
    if (localVoiceScreenStream) {
        cleanupMediaStream(localVoiceScreenStream);
        localVoiceScreenStream = null;
    }

    activeScreenStreams.delete('local_screen');
    if (focusedScreenId === 'local_screen') {
        closeFocusScreenStream();
    }
    renderVoiceStreamsGrid();

    socket.emit('voice-screen-stopped', { roomId: currentRoomId });

    if (btnVoiceScreenshare) btnVoiceScreenshare.classList.remove('active-off');
    if (btnVoiceScreenshareBig) btnVoiceScreenshareBig.textContent = '🖥️ Transmitir Tela na Chamada';
}

if (btnVoiceScreenshare) btnVoiceScreenshare.onclick = () => toggleVoiceScreenShare();
if (btnVoiceScreenshareBig) btnVoiceScreenshareBig.onclick = () => toggleVoiceScreenShare();

// GERENCIADOR DE GRID, TELA PEQUENA E EXPANSÃO EM TELA CHEIA (ECONOMIA DE BANDA E RAM)

const btnFullscreenFocus = document.getElementById('btn-fullscreen-focus');

function renderVoiceStreamsGrid() {
    if (!voiceStreamsGrid) return;
    voiceStreamsGrid.innerHTML = '';

    // Filtra transmissões ativas excluindo a que já está focada/expandida em destaque
    const unfocusedStreams = Array.from(activeScreenStreams.entries()).filter(([id]) => id !== focusedScreenId);

    if (unfocusedStreams.length === 0) {
        voiceStreamsGrid.classList.add('hidden');
        return;
    }

    voiceStreamsGrid.classList.remove('hidden');

    unfocusedStreams.forEach(([streamId, item]) => {
        const card = document.createElement('div');
        card.className = 'stream-tile-card';

        if (item.isRenderedInCard) {
            // RENDERIZAÇÃO EM TELA PEQUENA (Mini-Player na Miniatura)
            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.muted = (streamId === 'local_screen');
            video.srcObject = item.stream;
            video.className = 'stream-tile-video';

            const overlay = document.createElement('div');
            overlay.className = 'stream-tile-overlay';
            overlay.innerHTML = `
                <span>${escapeHtml(item.username)}</span>
                <div style="display:flex; gap:4px;">
                    <button class="btn-expand-tile btn-focus-trigger">⛶ Expandir</button>
                    <button class="btn-expand-tile btn-stop-render" style="background:#ef4444;">⏹️ Off</button>
                </div>
            `;

            overlay.querySelector('.btn-focus-trigger').onclick = (e) => {
                e.stopPropagation();
                focusScreenStream(streamId);
            };

            overlay.querySelector('.btn-stop-render').onclick = (e) => {
                e.stopPropagation();
                item.isRenderedInCard = false;
                renderVoiceStreamsGrid();
            };

            card.appendChild(video);
            card.appendChild(overlay);

        } else {
            // MODO ECONÔMICO (Apenas Placeholder com Carregamento sob demanda)
            card.innerHTML = `
                <div class="stream-placeholder-body">
                    <div class="stream-placeholder-icon">🖥️</div>
                    <div class="stream-placeholder-text">Transmissão de Tela</div>
                    <div class="stream-live-badge">🔴 AO VIVO</div>
                </div>
                <div class="stream-tile-overlay">
                    <span>${escapeHtml(item.username)}</span>
                    <button class="btn-expand-tile">▶️ Carregar (Tela Pequena)</button>
                </div>
            `;

            card.onclick = () => {
                item.isRenderedInCard = true;
                renderVoiceStreamsGrid();
            };
        }

        voiceStreamsGrid.appendChild(card);
    });
}

function focusScreenStream(streamId) {
    if (!activeScreenStreams.has(streamId)) return;
    const item = activeScreenStreams.get(streamId);
    focusedScreenId = streamId;

    if (focusedScreenshareContainer && focusedScreenshareVideo) {
        // Conecta o stream ao container expandido em destaque
        focusedScreenshareVideo.srcObject = item.stream;
        focusedScreenshareVideo.muted = (streamId === 'local_screen');
        if (focusedScreenshareTitle) focusedScreenshareTitle.textContent = `🖥️ Transmissão de Tela de ${item.username}`;
        focusedScreenshareContainer.classList.remove('hidden');
        focusedScreenshareVideo.play().catch(e => {});
    }

    renderVoiceStreamsGrid();
}

function closeFocusScreenStream() {
    focusedScreenId = null;
    if (focusedScreenshareVideo) {
        focusedScreenshareVideo.pause();
        focusedScreenshareVideo.srcObject = null; // Libera GPU, RAM e renderização imediatamente
    }
    if (focusedScreenshareContainer) focusedScreenshareContainer.classList.add('hidden');
    renderVoiceStreamsGrid();
}

if (btnCloseFocus) {
    btnCloseFocus.onclick = () => closeFocusScreenStream();
}

if (btnFullscreenFocus && focusedScreenshareVideo) {
    btnFullscreenFocus.onclick = () => {
        if (focusedScreenshareVideo.requestFullscreen) {
            focusedScreenshareVideo.requestFullscreen();
        } else if (focusedScreenshareVideo.webkitRequestFullscreen) {
            focusedScreenshareVideo.webkitRequestFullscreen();
        }
    };
}

// Botões de Mute e Deafen
if (btnMicToggle) {
    btnMicToggle.onclick = () => {
        isMicMuted = !isMicMuted;
        if (localVoiceStream) {
            localVoiceStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
        }
        btnMicToggle.classList.toggle('active-off', isMicMuted);
        btnMicToggle.textContent = isMicMuted ? '🔇' : '🎤';
        socket.emit('update-voice-state', { isMuted: isMicMuted });
    };
}

if (btnDeafenToggle) {
    btnDeafenToggle.onclick = () => {
        isDeafened = !isDeafened;
        btnDeafenToggle.classList.toggle('active-off', isDeafened);
        btnDeafenToggle.textContent = isDeafened ? '🔇' : '🎧';

        const audioContainer = document.getElementById('voice-audio-container');
        if (audioContainer) {
            audioContainer.querySelectorAll('audio').forEach(a => a.muted = isDeafened);
        }
        socket.emit('update-voice-state', { isDeafened });
    };
}

// --- WEBRTC MESH DE VOZ ---

socket.on('voice-joined-success', async (data) => {
    const { existingPeers } = data;
    log(`Conectado ao canal de voz. Conectando P2P com ${existingPeers.length} participantes...`);

    for (const peerUser of existingPeers) {
        if (peerUser.id !== socket.id) {
            await createVoicePeerConnection(peerUser.id, true, peerUser.username);
        }
    }
});

socket.on('voice-peer-joined', (data) => {
    const { user } = data;
    log(`Novo usuário entrou na voz: ${user.username} (${user.id})`);
    createVoicePeerConnection(user.id, false, user.username);
});

socket.on('voice-peer-left', (data) => {
    const { peerId } = data;
    log(`Usuário saiu da voz (${peerId})`);
    if (voicePeers.has(peerId)) {
        const { pc, audioElem } = voicePeers.get(peerId);
        cleanupPeerConnection(pc);
        if (audioElem && audioElem.parentNode) {
            audioElem.pause();
            audioElem.srcObject = null;
            audioElem.parentNode.removeChild(audioElem);
        }
        voicePeers.delete(peerId);
    }
    if (activeScreenStreams.has(peerId)) {
        activeScreenStreams.delete(peerId);
        if (focusedScreenId === peerId) closeFocusScreenStream();
        renderVoiceStreamsGrid();
    }
});

async function createVoicePeerConnection(peerId, isInitiator, peerUsername = 'Amigo') {
    if (voicePeers.has(peerId)) return;

    const pc = new RTCPeerConnection(rtcConfig);
    pc.peerId = peerId;

    const audioElem = document.createElement('audio');
    audioElem.autoplay = true;
    audioElem.playsInline = true;
    const voiceAudioContainer = document.getElementById('voice-audio-container');
    if (voiceAudioContainer) voiceAudioContainer.appendChild(audioElem);

    if (selectedSpeakerId && typeof HTMLMediaElement.prototype.setSinkId === 'function') {
        audioElem.setSinkId(selectedSpeakerId).catch(e => {});
    }

    voicePeers.set(peerId, { pc, audioElem, username: peerUsername });
    voicePendingIce.set(peerId, []);

    if (localVoiceStream) {
        localVoiceStream.getTracks().forEach(t => pc.addTrack(t, localVoiceStream));
    }
    if (isVoiceScreenSharing && localVoiceScreenStream) {
        localVoiceScreenStream.getTracks().forEach(t => pc.addTrack(t, localVoiceScreenStream));
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('voice-signal-ice', { targetId: peerId, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        log(`Mídia (${event.track.kind}) recebida do peer (${peerId})`);
        const stream = event.streams[0] || new MediaStream([event.track]);

        if (event.track.kind === 'video') {
            activeScreenStreams.set(peerId, {
                id: peerId,
                userId: peerId,
                username: peerUsername,
                stream: stream
            });
            renderVoiceStreamsGrid();
        }
        if (event.track.kind === 'audio') {
            audioElem.srcObject = stream;
            audioElem.muted = isDeafened;
            audioElem.play().catch(e => {});
        }
    };

    if (isInitiator) {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('voice-signal-offer', { targetId: peerId, sdp: offer });
        } catch (e) {
            log(`Erro ao criar oferta de voz para ${peerId}: ${e.message}`);
        }
    }
}

socket.on('voice-signal-offer', async (data) => {
    const { senderId, sdp } = data;

    if (!voicePeers.has(senderId)) {
        await createVoicePeerConnection(senderId, false);
    }
    const { pc } = voicePeers.get(senderId);

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        const pending = voicePendingIce.get(senderId) || [];
        while (pending.length > 0) {
            const cand = pending.shift();
            await pc.addIceCandidate(cand.candidate ? cand : new RTCIceCandidate(cand));
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('voice-signal-answer', { targetId: senderId, sdp: answer });
    } catch (e) {
        log(`Erro ao processar oferta de voz de ${senderId}: ${e.message}`);
    }
});

socket.on('voice-signal-answer', async (data) => {
    const { senderId, sdp } = data;
    if (voicePeers.has(senderId)) {
        const { pc } = voicePeers.get(senderId);
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));

            const pending = voicePendingIce.get(senderId) || [];
            while (pending.length > 0) {
                const cand = pending.shift();
                await pc.addIceCandidate(cand.candidate ? cand : new RTCIceCandidate(cand));
            }
        } catch (e) {
            log(`Erro ao aplicar answer de voz de ${senderId}: ${e.message}`);
        }
    }
});

socket.on('voice-signal-ice', async (data) => {
    const { senderId, candidate } = data;
    if (!candidate) return;

    if (voicePeers.has(senderId)) {
        const { pc } = voicePeers.get(senderId);
        if (pc.remoteDescription) {
            try {
                await pc.addIceCandidate(candidate.candidate ? candidate : new RTCIceCandidate(candidate));
            } catch (e) {}
        } else {
            const queue = voicePendingIce.get(senderId) || [];
            queue.push(candidate);
            voicePendingIce.set(senderId, queue);
        }
    }
});

// --- DETECTOR DE FALA AO VIVO (INDICADOR VERDE NO AVATAR) ---

function startLiveSpeechDetection(stream) {
    stopLiveSpeechDetection();
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        activeAudioContext = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function checkVolume() {
            if (!activeVoiceChannelId || !localVoiceStream) return;
            voiceAnalyzerLoopId = requestAnimationFrame(checkVolume);

            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const speakingNow = average > 12 && !isMicMuted;

            if (speakingNow !== isSpeaking) {
                isSpeaking = speakingNow;
                socket.emit('update-voice-state', { isSpeaking });

                if (currentDiscordChannelType === 'voice' && currentDiscordChannelId === activeVoiceChannelId) {
                    updateSingleVoiceUserCard(socket.id, { isSpeaking });
                }
            }
        }
        checkVolume();

    } catch (e) {
        log(`Speech detection info: ${e.message}`);
    }
}

function stopLiveSpeechDetection() {
    if (voiceAnalyzerLoopId) {
        cancelAnimationFrame(voiceAnalyzerLoopId);
        voiceAnalyzerLoopId = null;
    }
    if (activeAudioContext) {
        try { activeAudioContext.close(); } catch (e) {}
        activeAudioContext = null;
    }
}

// --- RENDEREZAÇÃO DA UI DO DISCORD ---

function renderVoiceMembersGrid() {
    if (!voiceMembersGrid) return;
    voiceMembersGrid.innerHTML = '';

    const users = discordVoiceChannelsUsers[currentDiscordChannelId] || [];
    if (users.length === 0) {
        voiceMembersGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--dc-text-muted); padding: 40px;">
                <div style="font-size: 2.5rem; margin-bottom: 8px;">🔇</div>
                <p>Ninguém no canal de voz no momento. Clique em entrar!</p>
            </div>
        `;
        return;
    }

    users.forEach(u => {
        const card = document.createElement('div');
        card.className = `voice-member-card ${u.isSpeaking ? 'speaking' : ''}`;
        card.id = `voice-card-${u.id}`;

        card.innerHTML = `
            <div class="voice-avatar-wrapper">
                <div class="voice-avatar-circle" style="background-color: ${u.avatarColor || '#5865f2'}">
                    ${(u.username || 'G').charAt(0).toUpperCase()}
                </div>
            </div>
            <div class="voice-user-name">
                ${escapeHtml(u.username)}
                ${u.isMuted ? '<span class="status-badge-icon">🔇</span>' : ''}
            </div>
        `;
        voiceMembersGrid.appendChild(card);
    });
}

function updateSingleVoiceUserCard(userId, state) {
    const card = document.getElementById(`voice-card-${userId}`);
    if (card) {
        if (typeof state.isSpeaking === 'boolean') {
            card.classList.toggle('speaking', state.isSpeaking);
        }
    }
}

function updateVoiceChannelBadges() {
    for (const [chId, users] of Object.entries(discordVoiceChannelsUsers)) {
        const badge = document.getElementById(`badge-${chId}`);
        if (badge) {
            badge.textContent = users.length;
            badge.style.display = users.length > 0 ? 'inline-block' : 'none';
        }
    }
}

function updateVoiceJoinLeaveButtons() {
    if (!btnJoinCurrentVoice || !btnLeaveCurrentVoice) return;
    const isConnectedInThisChannel = activeVoiceChannelId === currentDiscordChannelId;

    if (isConnectedInThisChannel) {
        btnJoinCurrentVoice.classList.add('hidden');
        btnLeaveCurrentVoice.classList.remove('hidden');
    } else {
        btnJoinCurrentVoice.classList.remove('hidden');
        btnLeaveCurrentVoice.classList.add('hidden');
    }
}

function renderOnlineMembersSidebar() {
    if (!discordMembersList || !onlineUsersCount) return;
    discordMembersList.innerHTML = '';
    onlineUsersCount.textContent = roomOnlineUsers.length;

    roomOnlineUsers.forEach(u => {
        const item = document.createElement('div');
        item.className = 'member-item';
        item.innerHTML = `
            <div class="member-avatar" style="background-color: ${u.avatarColor || '#5865f2'}">
                ${(u.username || 'U').charAt(0).toUpperCase()}
            </div>
            <span class="member-name">${escapeHtml(u.username)}</span>
        `;
        discordMembersList.appendChild(item);
    });
}

// --- LÓGICA DO TRANSMISSOR CLÁSSICO (TELA DO PC) ---

async function startBroadcasting(withVideo = true) {
    log(`Iniciando transmissão no PC (Tela + Áudio: ${withVideo})...`);
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            throw new Error('Navegador não suporta captura sem HTTPS');
        }

        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } },
            audio: true
        });

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            cleanupMediaStream(stream);
            throw new Error('Atenção: Marque a opção "Compartilhar áudio" na janela do navegador!');
        }

        const videoTracks = stream.getVideoTracks();
        if (!withVideo) {
            videoTracks.forEach(v => { v.stop(); stream.removeTrack(v); });
            if (localVideoContainer) localVideoContainer.classList.add('hidden');
            if (streamModeTitle) streamModeTitle.textContent = 'Transmitindo Apenas Áudio';
        } else {
            if (videoTracks.length > 0 && localVideo) {
                localVideo.srcObject = stream;
                if (localVideoContainer) localVideoContainer.classList.remove('hidden');
            }
            if (streamModeTitle) streamModeTitle.textContent = 'Transmitindo Tela + Áudio';
        }

        localStream = stream;
        isBroadcaster = true;

        audioTracks[0].onended = () => {
            log('Captura de tela/áudio encerrada pelo usuário.');
            stopBroadcasting();
        };

        showView('stream');
        setupVisualizer(localStream, 'broadcaster-visualizer');
        socket.emit('broadcaster-start', currentRoomId);

    } catch (err) {
        log(`Erro ao transmitir: ${err.message}`);
        alert(`Erro ao transmitir: ${err.message}`);
    }
}

if (startScreenBroadcastBtn) startScreenBroadcastBtn.onclick = () => startBroadcasting(true);
if (stopBroadcastBtn) stopBroadcastBtn.onclick = () => stopBroadcasting();

function stopBroadcasting() {
    isBroadcaster = false;
    if (localStream) {
        cleanupMediaStream(localStream);
        localStream = null;
    }
    if (localVideo) localVideo.srcObject = null;

    broadcasterPeers.forEach(pc => cleanupPeerConnection(pc));
    broadcasterPeers.clear();
    broadcasterPendingIce.clear();

    stopVisualizer('broadcaster-visualizer');

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

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { targetId: listenerId, roomId: currentRoomId, candidate: event.candidate });
        }
    };

    pc.onconnectionstatechange = () => {
        log(`Status WebRTC com receptor ${listenerId}: ${pc.connectionState}`);
        updateBroadcasterListenersDisplay();
    };

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { targetId: listenerId, roomId: currentRoomId, sdp: offer });
    } catch (e) {
        log(`Erro criando oferta: ${e.message}`);
    }
}

function cleanupBroadcasterPeer(listenerId) {
    if (broadcasterPeers.has(listenerId)) {
        cleanupPeerConnection(broadcasterPeers.get(listenerId));
        broadcasterPeers.delete(listenerId);
    }
    broadcasterPendingIce.delete(listenerId);
}

function updateBroadcasterListenersDisplay() {
    let connectedCount = 0;
    broadcasterPeers.forEach(pc => { if (pc.connectionState === 'connected') connectedCount++; });
    updateListenerCount(connectedCount || broadcasterPeers.size);
}

// --- LÓGICA DO RECEPTOR CLÁSSICO ---

if (startListenBtn) startListenBtn.onclick = () => prepareReceiverMode();

function prepareReceiverMode() {
    isBroadcaster = false;
    showView('receiver');
    receiverDot.className = 'dot gray';
    receiverStatusText.textContent = 'Conectando ao sinal da sala...';
    socket.emit('receiver-ready', { roomId: currentRoomId });
}

if (unlockAudioBtn) {
    unlockAudioBtn.onclick = () => {
        if (remoteVideo && remoteVideo.srcObject) remoteVideo.play().catch(e => {});
        if (remoteAudio && remoteAudio.srcObject) {
            remoteAudio.muted = false;
            remoteAudio.play().catch(e => {});
        }
        audioUnlockContainer.classList.add('hidden');
        playbackPanel.classList.remove('hidden');
        socket.emit('receiver-ready', { roomId: currentRoomId });
    };
}

if (volumeSlider) {
    volumeSlider.oninput = () => {
        const vol = parseFloat(volumeSlider.value);
        if (remoteAudio) remoteAudio.volume = vol;
        if (remoteVideo) remoteVideo.volume = vol;
    };
}

if (fullscreenBtn && remoteVideo) {
    fullscreenBtn.onclick = () => {
        if (remoteVideo.requestFullscreen) remoteVideo.requestFullscreen();
        else if (remoteVideo.webkitRequestFullscreen) remoteVideo.webkitRequestFullscreen();
    };
}

if (reconnectBtn) {
    reconnectBtn.onclick = () => {
        cleanupReceiverConnection();
        receiverDot.className = 'dot orange';
        receiverStatusText.textContent = 'Reconectando ao PC...';
        socket.emit('receiver-ready', { roomId: currentRoomId });
    };
}

function cleanupReceiverConnection() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (receiverPc) { cleanupPeerConnection(receiverPc); receiverPc = null; }
    if (remoteVideo) remoteVideo.srcObject = null;
    if (remoteAudio) remoteAudio.srcObject = null;
    stopVisualizer('receiver-visualizer');
    receiverIceQueue = [];
}

socket.on('offer', async (data) => {
    log(`Oferta WebRTC recebida do PC (${data.senderId})`);
    if (!isBroadcaster && currentView === 'setup') showView('receiver');

    cleanupReceiverConnection();
    receiverPc = new RTCPeerConnection(rtcConfig);

    receiverPc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { targetId: data.senderId, roomId: currentRoomId, candidate: event.candidate });
        }
    };

    receiverPc.onconnectionstatechange = () => {
        log(`Estado WebRTC no celular: ${receiverPc.connectionState}`);
        if (receiverPc.connectionState === 'connected') {
            receiverDot.className = 'dot green';
            receiverStatusText.textContent = '🟢 Mídia Ao Vivo Conectada';
        }
    };

    receiverPc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        if (event.track.kind === 'video' && remoteVideo) {
            videoContainer.classList.remove('hidden');
            remoteVideo.srcObject = stream;
            remoteVideo.play().catch(e => audioUnlockContainer.classList.remove('hidden'));
        }
        if (event.track.kind === 'audio' && remoteAudio) {
            remoteAudio.srcObject = stream;
            setupVisualizer(stream, 'receiver-visualizer');
            remoteAudio.play().catch(e => audioUnlockContainer.classList.remove('hidden'));
        }
    };

    try {
        await receiverPc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        while (receiverIceQueue.length > 0) {
            const cand = receiverIceQueue.shift();
            await receiverPc.addIceCandidate(cand.candidate ? cand : new RTCIceCandidate(cand));
        }
        const answer = await receiverPc.createAnswer();
        await receiverPc.setLocalDescription(answer);
        socket.emit('answer', { targetId: data.senderId, roomId: currentRoomId, sdp: answer });
    } catch (e) { log(`Erro ao processar oferta: ${e.message}`); }
});

socket.on('answer', async (data) => {
    const pc = broadcasterPeers.get(data.senderId);
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const pending = broadcasterPendingIce.get(data.senderId) || [];
            while (pending.length > 0) {
                const cand = pending.shift();
                await pc.addIceCandidate(cand.candidate ? cand : new RTCIceCandidate(cand));
            }
        } catch (e) {}
    }
});

socket.on('ice-candidate', async (data) => {
    if (!data.candidate) return;
    if (isBroadcaster) {
        const pc = broadcasterPeers.get(data.senderId);
        if (pc && pc.remoteDescription) {
            try { await pc.addIceCandidate(data.candidate.candidate ? data.candidate : new RTCIceCandidate(data.candidate)); } catch (e) {}
        } else {
            const queue = broadcasterPendingIce.get(data.senderId) || [];
            queue.push(data.candidate);
            broadcasterPendingIce.set(data.senderId, queue);
        }
    } else if (receiverPc && receiverPc.remoteDescription) {
        try { await receiverPc.addIceCandidate(data.candidate.candidate ? data.candidate : new RTCIceCandidate(data.candidate)); } catch (e) {}
    } else {
        receiverIceQueue.push(data.candidate);
    }
});

socket.on('listener-joined', (data) => {
    if (isBroadcaster && localStream) initiateBroadcasterCall(data.listenerId);
});

socket.on('listener-ready', (data) => {
    if (isBroadcaster && localStream) initiateBroadcasterCall(data.listenerId);
});

socket.on('listener-left', (data) => {
    if (isBroadcaster) {
        cleanupBroadcasterPeer(data.listenerId);
        updateListenerCount(data.listenerCount);
    }
});

function updateBroadcasterStatusIndicator(isLive) {
    if (!roomStatusPill || !roomStatusText) return;
    if (isLive) {
        roomStatusPill.className = 'status-pill live';
        roomStatusText.textContent = 'PC transmitindo ao vivo!';
    } else {
        roomStatusPill.className = 'status-pill idle';
        roomStatusText.textContent = 'Nenhum PC transmitindo no momento';
    }
}

function updateListenerCount(count) {
    if (listenerCountText) listenerCountText.textContent = `${count} dispositivos conectados`;
}

// --- FUNÇÕES DE LIMPEZA E OTIMIZAÇÃO DE MEMÓRIA RAM ---

function cleanupMediaStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach(track => {
        track.stop();
        stream.removeTrack(track);
    });
}

function cleanupPeerConnection(pc) {
    if (!pc) return;
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.onconnectionstatechange = null;
    pc.close();
}

function setupVisualizer(stream, visualizerId) {
    stopVisualizer(visualizerId);
    const visualizerEl = document.getElementById(visualizerId);
    if (!visualizerEl) return;

    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);

        const bars = visualizerEl.querySelectorAll('.bar');
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function draw() {
            if (!stream.active) {
                stopVisualizer(visualizerId);
                return;
            }
            const animId = requestAnimationFrame(draw);
            visualizerAnimIds.set(visualizerId, animId);

            analyser.getByteFrequencyData(dataArray);
            bars.forEach((bar, i) => {
                const val = dataArray[i % dataArray.length] || 0;
                const height = Math.max(8, (val / 255) * 55);
                bar.style.height = `${height}px`;
            });
        }
        draw();
    } catch (e) {}
}

function stopVisualizer(visualizerId) {
    if (visualizerAnimIds.has(visualizerId)) {
        cancelAnimationFrame(visualizerAnimIds.get(visualizerId));
        visualizerAnimIds.delete(visualizerId);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}
