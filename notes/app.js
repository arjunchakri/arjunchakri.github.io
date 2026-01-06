// ==========================================
// Notes App - Main Application Script
// ==========================================

// ==========================================
// Firebase Configuration
// ==========================================
firebase.initializeApp({
    apiKey: "AIzaSyCibTNoAZEu37Lih8PM5I5neXXpUUmKA_A",
    databaseURL: "https://arjunchakri-commonutil-db-dnd-default-rtdb.firebaseio.com",
});
const db = firebase.database();

// ==========================================
// Marvel/DC Character Names
// ==========================================
const HERO_NAMES = [
    'Iron Man', 'Thor', 'Hulk', 'Black Widow', 'Hawkeye', 'Captain America',
    'Spider-Man', 'Black Panther', 'Doctor Strange', 'Scarlet Witch',
    'Vision', 'Ant-Man', 'Wasp', 'Falcon', 'War Machine', 'Star-Lord',
    'Gamora', 'Groot', 'Rocket', 'Drax', 'Nebula', 'Mantis',
    'Batman', 'Superman', 'Wonder Woman', 'Flash', 'Aquaman', 'Cyborg',
    'Green Lantern', 'Shazam', 'Batgirl', 'Nightwing', 'Robin', 'Supergirl',
    'Harley Quinn', 'Catwoman', 'Joker', 'Poison Ivy', 'Riddler', 'Bane',
    'Wolverine', 'Storm', 'Cyclops', 'Jean Grey', 'Beast', 'Rogue',
    'Magneto', 'Professor X', 'Mystique', 'Deadpool', 'Cable', 'Domino',
    'Loki', 'Thanos', 'Ultron', 'Hela', 'Kang', 'Mysterio'
];

const CURSOR_COLORS = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9',
    '#fd79a8', '#a29bfe', '#00b894', '#e17055', '#0984e3', '#6c5ce7',
    '#fab1a0', '#74b9ff', '#55a3ff', '#ff9ff3', '#48dbfb', '#1dd1a1'
];

// ==========================================
// State
// ==========================================
let editor = null;
let currentNote = null;
let saveTimeout = null;
let lastSaved = '';
let isLocalChange = false;
let unsubscribe = null;
let wordWrap = false;
let minimapEnabled = false;
let fontSize = 14;
let lineHighlight = true;
let currentTheme = 'dark';

// Collaboration
let myUserId = null;
let myUserName = null;
let myColor = null;
let presenceRef = null;
let cursorsRef = null;
let collaborators = {};
let cursorDecorations = [];
let selectionDecorations = [];
let presenceCleanupInterval = null;

const RECENT_KEY = 'notes_recent';
const PREFS_KEY = 'notes_prefs';
const USER_KEY = 'notes_user';
const PRESENCE_TIMEOUT = 30000; // 30 seconds

// ==========================================
// Utils
// ==========================================
const $ = id => document.getElementById(id);
const sanitize = s => s.trim().toLowerCase().replace(/[.$#\[\]\/]/g, '-');
const wait = ms => new Promise(r => setTimeout(r, ms));

function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

function getRandomHeroName() {
    return HERO_NAMES[Math.floor(Math.random() * HERO_NAMES.length)];
}

function getRandomColor() {
    return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

function getPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
    catch { return {}; }
}

function savePrefs(prefs) {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...getPrefs(), ...prefs }));
}

function getUserData() {
    try {
        let data = JSON.parse(localStorage.getItem(USER_KEY));
        if (!data) {
            data = {
                id: generateUserId(),
                name: getRandomHeroName(),
                color: getRandomColor()
            };
            localStorage.setItem(USER_KEY, JSON.stringify(data));
        }
        return data;
    } catch {
        const data = {
            id: generateUserId(),
            name: getRandomHeroName(),
            color: getRandomColor()
        };
        localStorage.setItem(USER_KEY, JSON.stringify(data));
        return data;
    }
}

function showToast(msg) {
    const t = $('toast');
    t.innerHTML = `<span style="color: var(--green)">✓</span> ${msg}`;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

function setStatus(saving) {
    const syncStatus = $('syncStatus');
    const dot = $('statusDot');
    const text = $('statusText');
    if (syncStatus) syncStatus.classList.toggle('saving', saving);
    if (dot) dot.className = saving ? 'status-dot saving' : 'status-dot';
    if (text) text.textContent = saving ? 'Saving...' : 'Synced';
}

function updateStats() {
    // No-op - status bar removed
}

// ==========================================
// Recent
// ==========================================
function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
    catch { return []; }
}

function addRecent(note) {
    let r = getRecent().filter(n => n !== note);
    r.unshift(note);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 8)));
}

function renderRecent() {
    const r = getRecent();
    if (!r.length) return;
    $('recent').style.display = 'block';
    $('recentList').innerHTML = r.map(n => 
        `<span class="recent-item" onclick="connectToNote('${n}')">${n}</span>`
    ).join('');
}

// ==========================================
// Firebase
// ==========================================
function getRef(note) {
    return db.ref(`notes/${sanitize(note)}`);
}

async function loadNote(note) {
    const snap = await getRef(note).once('value');
    return snap.val() || { content: '', language: 'plaintext' };
}

async function saveNote(note, content, language) {
    isLocalChange = true;
    await getRef(note).update({ content, language, updatedAt: Date.now() });
    setTimeout(() => { isLocalChange = false; }, 100);
}

function subscribe(note, cb) {
    const ref = getRef(note);
    const handler = ref.on('value', snap => cb(snap.val() || { content: '', language: 'plaintext' }));
    return () => ref.off('value', handler);
}

// ==========================================
// Collaboration - Presence & Cursors
// ==========================================
function getClientInfo() {
    const ua = navigator.userAgent;
    let icon = '💻';
    let device = 'Desktop';
    
    if (/iPhone|iPad|iPod/.test(ua)) {
        icon = '📱'; device = 'iOS';
    } else if (/Android/.test(ua)) {
        icon = '📱'; device = 'Android';
    } else if (/Mac/.test(ua)) {
        icon = '🍎'; device = 'Mac';
    } else if (/Win/.test(ua)) {
        icon = '🪟'; device = 'Windows';
    } else if (/Linux/.test(ua)) {
        icon = '🐧'; device = 'Linux';
    }
    
    let browser = '🌐';
    if (/Chrome/.test(ua) && !/Edge/.test(ua)) browser = '🔵';
    else if (/Firefox/.test(ua)) browser = '🦊';
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = '🧭';
    else if (/Edge/.test(ua)) browser = '🔷';
    
    return { icon, device, browser };
}

function setupPresence(note) {
    const userData = getUserData();
    myUserId = userData.id;
    myUserName = userData.name;
    myColor = userData.color;

    const userNameEl = $('userName');
    const userDotEl = $('userDot');
    if (userNameEl) userNameEl.textContent = myUserName;
    if (userDotEl) userDotEl.style.background = myColor;

    presenceRef = db.ref(`presence/${sanitize(note)}`);
    cursorsRef = db.ref(`cursors/${sanitize(note)}`);

    const clientInfo = getClientInfo();

    // Set my presence
    const myPresenceRef = presenceRef.child(myUserId);
    myPresenceRef.set({
        name: myUserName,
        color: myColor,
        icon: clientInfo.icon,
        device: clientInfo.device,
        browser: clientInfo.browser,
        lastSeen: Date.now(),
        joinedAt: Date.now()
    });

    // Remove on disconnect
    myPresenceRef.onDisconnect().remove();

    // Listen for new users joining
    presenceRef.on('child_added', snap => {
        const data = snap.val();
        const uid = snap.key;
        if (uid !== myUserId && data) {
            // Only show toast for users who joined after us
            const timeSinceJoin = Date.now() - (data.joinedAt || 0);
            if (timeSinceJoin < 5000) {
                showUserJoinedToast(data);
            }
        }
    });

    // Listen for users leaving
    presenceRef.on('child_removed', snap => {
        const data = snap.val();
        if (data && data.name) {
            showToast(`${data.icon || '👤'} ${data.name} left`);
        }
    });

    // Listen for presence changes
    presenceRef.on('value', snap => {
        const data = snap.val() || {};
        collaborators = {};
        const now = Date.now();
        
        Object.keys(data).forEach(uid => {
            if (uid !== myUserId) {
                // Only include if seen in last 30 seconds
                if (now - data[uid].lastSeen < PRESENCE_TIMEOUT) {
                    collaborators[uid] = data[uid];
                }
            }
        });
        
        updateOnlineUsersBar();
    });

    // Listen for cursor updates
    cursorsRef.on('value', snap => {
        const data = snap.val() || {};
        renderCollaboratorCursors(data);
    });

    // Heartbeat to keep presence alive
    presenceCleanupInterval = setInterval(() => {
        myPresenceRef.update({ lastSeen: Date.now() });
    }, 10000);
}

function showUserJoinedToast(user) {
    const t = $('toast');
    t.innerHTML = `<span>${user.icon || '👤'}</span> <b>${user.name}</b> joined`;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function updateOnlineUsersBar() {
    const container = $('onlineUsers');
    const users = Object.values(collaborators);
    
    if (users.length === 0) {
        container.innerHTML = '<span class="online-only-you">Only you</span>';
        return;
    }
    
    container.innerHTML = users.map(u => `
        <div class="online-user" title="${u.name} • ${u.device || 'Unknown'}">
            <div class="online-user-dot" style="background: ${u.color}"></div>
            <span class="online-user-icon">${u.icon || '💻'}</span>
            <span class="online-user-name">${u.name}</span>
        </div>
    `).join('');
}

function broadcastCursor() {
    if (!editor || !cursorsRef) return;
    
    const pos = editor.getPosition();
    const sel = editor.getSelection();
    
    cursorsRef.child(myUserId).set({
        line: pos.lineNumber,
        column: pos.column,
        selection: sel && !sel.isEmpty() ? {
            startLine: sel.startLineNumber,
            startCol: sel.startColumn,
            endLine: sel.endLineNumber,
            endCol: sel.endColumn
        } : null,
        name: myUserName,
        color: myColor,
        timestamp: Date.now()
    });
}

function renderCollaboratorCursors(cursorsData) {
    if (!editor) return;

    const now = Date.now();
    const decorations = [];

    Object.keys(cursorsData).forEach(uid => {
        if (uid === myUserId) return;
        
        const cursor = cursorsData[uid];
        if (now - cursor.timestamp > 15000) return; // Stale cursor

        // Cursor decoration
        decorations.push({
            range: new monaco.Range(cursor.line, cursor.column, cursor.line, cursor.column),
            options: {
                className: 'collab-cursor-decoration',
                beforeContentClassName: `collab-cursor-before`,
                stickiness: 1,
                hoverMessage: { value: cursor.name }
            }
        });

        // Selection decoration
        if (cursor.selection) {
            decorations.push({
                range: new monaco.Range(
                    cursor.selection.startLine,
                    cursor.selection.startCol,
                    cursor.selection.endLine,
                    cursor.selection.endCol
                ),
                options: {
                    className: 'collab-selection-decoration',
                    stickiness: 1
                }
            });
        }
    });

    // Apply decorations with dynamic styles
    const styleEl = document.getElementById('collab-styles') || document.createElement('style');
    styleEl.id = 'collab-styles';
    let styles = '';
    
    Object.keys(cursorsData).forEach(uid => {
        if (uid === myUserId) return;
        const cursor = cursorsData[uid];
        const now = Date.now();
        if (now - cursor.timestamp > 15000) return;
        
        styles += `
            .collab-cursor-${uid}::before {
                content: '${cursor.name}';
                position: absolute;
                top: -18px;
                left: 0;
                padding: 1px 5px;
                background: ${cursor.color};
                color: white;
                font-size: 10px;
                border-radius: 3px;
                white-space: nowrap;
                z-index: 100;
            }
            .collab-cursor-${uid}::after {
                content: '';
                position: absolute;
                width: 2px;
                height: 18px;
                background: ${cursor.color};
                left: 0;
                top: 0;
            }
            .collab-selection-${uid} {
                background: ${cursor.color}33 !important;
            }
        `;
    });
    
    styleEl.textContent = styles;
    if (!styleEl.parentNode) document.head.appendChild(styleEl);

    // Convert to proper decorations
    const finalDecorations = [];
    Object.keys(cursorsData).forEach(uid => {
        if (uid === myUserId) return;
        const cursor = cursorsData[uid];
        const now = Date.now();
        if (now - cursor.timestamp > 15000) return;

        finalDecorations.push({
            range: new monaco.Range(cursor.line, cursor.column, cursor.line, cursor.column + 1),
            options: {
                className: `collab-cursor-${uid}`,
                stickiness: 1
            }
        });

        if (cursor.selection) {
            finalDecorations.push({
                range: new monaco.Range(
                    cursor.selection.startLine,
                    cursor.selection.startCol,
                    cursor.selection.endLine,
                    cursor.selection.endCol
                ),
                options: {
                    className: `collab-selection-${uid}`,
                    stickiness: 1
                }
            });
        }
    });

    cursorDecorations = editor.deltaDecorations(cursorDecorations, finalDecorations);
}

function cleanupPresence() {
    if (presenceCleanupInterval) {
        clearInterval(presenceCleanupInterval);
    }
    if (presenceRef && myUserId) {
        presenceRef.child(myUserId).remove();
    }
    if (cursorsRef && myUserId) {
        cursorsRef.child(myUserId).remove();
    }
    // Cleanup file transfer refs
    if (fileTransferRef && myUserId) {
        fileTransferRef.child(myUserId).remove();
    }
}

// ==========================================
// WebRTC File Transfer
// ==========================================
let fileTransferRef = null;
let pendingFileOffer = null;
let peerConnections = {};
let pendingFile = null;
let receivedChunks = [];
let receivedSize = 0;
let expectedFileInfo = null;

const CHUNK_SIZE = 16384; // 16KB chunks for WebRTC

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

function setupFileTransfer(note) {
    fileTransferRef = db.ref(`file-transfers/${sanitize(note)}`);
    
    // Listen for incoming file signals
    fileTransferRef.on('child_added', snapshot => {
        const data = snapshot.val();
        if (!data || data.to !== myUserId) return;
        
        console.log('File transfer signal:', data.type, data);
        
        if (data.type === 'file-offer') {
            handleIncomingFileOffer(data);
        } else if (data.type === 'file-accept') {
            handleFileAccepted(data);
        } else if (data.type === 'webrtc-offer') {
            handleWebRTCOffer(data);
        } else if (data.type === 'webrtc-answer') {
            handleWebRTCAnswer(data);
        } else if (data.type === 'ice') {
            handleIceCandidate(data);
        } else if (data.type === 'decline') {
            handleFileDeclined(data);
        }
        
        // Clean up processed message
        snapshot.ref.remove();
    });
}

function shareFile() {
    closeAllDropdowns();
    const onlineUsers = Object.keys(collaborators).filter(id => id !== myUserId);
    if (onlineUsers.length === 0) {
        showToast('No other users online to share with');
        return;
    }
    $('shareFileInput').click();
}

async function handleShareFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    
    pendingFile = file;
    
    // Get online collaborators
    const onlineUsers = Object.keys(collaborators).filter(id => id !== myUserId);
    
    if (onlineUsers.length === 0) {
        showToast('No other users online');
        return;
    }

    // Show transfer modal
    showTransferModal(file, true);
    updateTransferStatus('Waiting for acceptance...');

    // Send file offer to all online users
    for (const targetId of onlineUsers) {
        await fileTransferRef.push({
            type: 'file-offer',
            from: myUserId,
            fromName: myUserName,
            to: targetId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            timestamp: Date.now()
        });
    }
}

function handleIncomingFileOffer(data) {
    pendingFileOffer = data;
    
    // Show incoming file modal
    const icon = getFileIcon(data.fileType);
    $('fileIcon').textContent = icon;
    $('incomingFileName').textContent = data.fileName;
    $('incomingFileSize').textContent = formatFileSize(data.fileSize);
    $('incomingFileSender').textContent = data.fromName || 'Unknown';
    $('incomingFileModal').classList.add('show');
}

async function acceptFile() {
    $('incomingFileModal').classList.remove('show');
    
    if (!pendingFileOffer) return;
    
    const offer = pendingFileOffer;
    pendingFileOffer = null;
    
    expectedFileInfo = {
        name: offer.fileName,
        size: offer.fileSize,
        type: offer.fileType
    };
    receivedChunks = [];
    receivedSize = 0;

    showTransferModal({ name: offer.fileName, size: offer.fileSize, type: offer.fileType }, false);
    updateTransferStatus('Connecting...');

    // Tell sender we accepted - they will initiate WebRTC
    await fileTransferRef.push({
        type: 'file-accept',
        from: myUserId,
        to: offer.from,
        timestamp: Date.now()
    });
}

async function handleFileAccepted(data) {
    // Receiver accepted - now sender initiates WebRTC connection
    updateTransferStatus('Establishing connection...');
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[data.from] = pc;

    // Create data channel for file transfer
    const channel = pc.createDataChannel('fileTransfer', { ordered: true });
    channel.binaryType = 'arraybuffer';

    channel.onopen = async () => {
        console.log('Data channel open - sending file');
        updateTransferStatus('Sending...');
        await sendFileOverChannel(channel, pendingFile);
    };

    channel.onerror = (e) => {
        console.error('Channel error:', e);
        showToast('Transfer failed');
        hideTransferModal();
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            fileTransferRef.push({
                type: 'ice',
                from: myUserId,
                to: data.from,
                candidate: event.candidate.toJSON()
            });
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log('ICE state:', pc.iceConnectionState);
    };

    // Create and send offer
    const offerDesc = await pc.createOffer();
    await pc.setLocalDescription(offerDesc);

    await fileTransferRef.push({
        type: 'webrtc-offer',
        from: myUserId,
        to: data.from,
        sdp: offerDesc.sdp
    });
}

async function handleWebRTCOffer(data) {
    // Receiver gets WebRTC offer from sender
    console.log('Received WebRTC offer');
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[data.from] = pc;

    // Handle incoming data channel
    pc.ondatachannel = (event) => {
        console.log('Data channel received');
        const channel = event.channel;
        channel.binaryType = 'arraybuffer';
        
        channel.onopen = () => {
            console.log('Channel open - ready to receive');
            updateTransferStatus('Receiving...');
        };
        
        channel.onmessage = (e) => {
            if (typeof e.data === 'string') {
                const msg = JSON.parse(e.data);
                if (msg.type === 'done') {
                    finalizeFileReceive();
                }
            } else {
                receivedChunks.push(e.data);
                receivedSize += e.data.byteLength;
                updateTransferProgress(receivedSize, expectedFileInfo.size);
            }
        };

        channel.onerror = (e) => {
            console.error('Channel error:', e);
            showToast('Transfer failed');
            hideTransferModal();
        };
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            fileTransferRef.push({
                type: 'ice',
                from: myUserId,
                to: data.from,
                candidate: event.candidate.toJSON()
            });
        }
    };

    // Set remote description and create answer
    await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await fileTransferRef.push({
        type: 'webrtc-answer',
        from: myUserId,
        to: data.from,
        sdp: answer.sdp
    });
}

async function handleWebRTCAnswer(data) {
    // Sender receives answer from receiver
    console.log('Received WebRTC answer');
    const pc = peerConnections[data.from];
    if (pc) {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    }
}

function handleIceCandidate(data) {
    const pc = peerConnections[data.from];
    if (pc && data.candidate) {
        pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.error);
    }
}

function declineFile() {
    $('incomingFileModal').classList.remove('show');
    
    if (pendingFileOffer) {
        fileTransferRef.push({
            type: 'decline',
            from: myUserId,
            to: pendingFileOffer.from
        });
        pendingFileOffer = null;
    }
}

function handleFileDeclined(data) {
    showToast('File transfer declined');
    hideTransferModal();
    pendingFile = null;
}

async function sendFileOverChannel(channel, file) {
    const arrayBuffer = await file.arrayBuffer();
    let offset = 0;

    const sendNextChunk = () => {
        while (offset < arrayBuffer.byteLength) {
            if (channel.bufferedAmount > CHUNK_SIZE * 10) {
                // Buffer is full, wait
                setTimeout(sendNextChunk, 50);
                return;
            }
            
            const chunk = arrayBuffer.slice(offset, offset + CHUNK_SIZE);
            channel.send(chunk);
            offset += chunk.byteLength;
            updateTransferProgress(offset, file.size);
        }

        // All chunks sent
        channel.send(JSON.stringify({ type: 'done' }));
        setTimeout(() => {
            showToast('File sent successfully!');
            hideTransferModal();
            pendingFile = null;
        }, 500);
    };

    sendNextChunk();
}

function finalizeFileReceive() {
    const blob = new Blob(receivedChunks, { type: expectedFileInfo.type });
    const url = URL.createObjectURL(blob);
    
    // Auto-download
    const a = document.createElement('a');
    a.href = url;
    a.download = expectedFileInfo.name;
    a.click();
    
    // Cleanup
    URL.revokeObjectURL(url);
    receivedChunks = [];
    receivedSize = 0;
    expectedFileInfo = null;
    
    showToast('File received!');
    hideTransferModal();
}

function showTransferModal(file, isSending) {
    $('transferTitle').textContent = isSending ? '📤 Sending File' : '📥 Receiving File';
    $('transferFileIcon').textContent = getFileIcon(file.type);
    $('transferFileName').textContent = file.name;
    $('transferProgress').style.width = '0%';
    $('transferPercent').textContent = '0%';
    $('transferModal').classList.add('show');
}

function hideTransferModal() {
    $('transferModal').classList.remove('show');
}

function updateTransferStatus(status) {
    $('transferStatus').textContent = status;
}

function updateTransferProgress(current, total) {
    const percent = Math.round((current / total) * 100);
    $('transferProgress').style.width = percent + '%';
    $('transferPercent').textContent = percent + '%';
    $('transferStatus').textContent = `${formatFileSize(current)} / ${formatFileSize(total)}`;
}

function getFileIcon(mimeType) {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return '📦';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    return '📄';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ==========================================
// User Rename
// ==========================================
function showRenameModal() {
    $('renameInput').value = myUserName;
    $('renameModal').classList.add('show');
    setTimeout(() => $('renameInput').focus(), 100);
}

function hideRenameModal() {
    $('renameModal').classList.remove('show');
}

function saveUserName() {
    const newName = $('renameInput').value.trim();
    if (newName) {
        myUserName = newName;
        const userData = getUserData();
        userData.name = newName;
        localStorage.setItem(USER_KEY, JSON.stringify(userData));
        
        const userNameEl = $('userName');
        if (userNameEl) userNameEl.textContent = newName;
        
        // Update presence
        if (presenceRef && myUserId) {
            presenceRef.child(myUserId).update({ name: newName });
        }
        
        hideRenameModal();
        showToast('Name updated!');
    }
}

// ==========================================
// Boot Animation (Real-time Progress)
// ==========================================
let bootStartTime = 0;

function initBootSequence(noteName) {
    bootStartTime = Date.now();
    
    // Fade out landing content
    const landing = $('landingContent');
    if (landing) {
        landing.style.transition = 'opacity 0.2s ease';
        landing.style.opacity = '0';
    }
    
    setTimeout(() => {
        if (landing) landing.style.display = 'none';
        const bootSeq = $('bootSequence');
        if (bootSeq) bootSeq.classList.add('active');
    }, 200);
    
    const bootNoteName = $('bootNoteName');
    const progressFill = $('progressFill');
    const bootStatusText = $('bootStatusText');
    const terminal = $('terminal');
    
    if (bootNoteName) bootNoteName.textContent = noteName;
    if (progressFill) progressFill.style.width = '0%';
    if (bootStatusText) {
        bootStatusText.textContent = 'Initializing...';
        bootStatusText.style.color = 'var(--text-muted)';
    }
    
    // Add loading animation to terminal
    if (terminal) terminal.classList.add('loading');
    
    // Reset all boot lines
    ['boot-connect', 'boot-load', 'boot-editor', 'boot-collab', 'boot-ready'].forEach(id => {
        const line = $(id);
        line.classList.remove('visible', 'done');
        line.querySelector('.status').innerHTML = '<div class="spinner"></div>';
        const timeEl = line.querySelector('.time');
        if (timeEl) timeEl.textContent = '';
    });
}

function showBootStep(stepId, progress, statusText) {
    const line = $(stepId);
    if (line) line.classList.add('visible');
    const progressFill = $('progressFill');
    if (progressFill) progressFill.style.width = `${progress}%`;
    const statusEl = $('bootStatusText');
    if (statusEl) statusEl.textContent = statusText;
}

function completeBootStep(stepId, progress) {
    const line = $(stepId);
    if (!line) return;
    const elapsed = Date.now() - bootStartTime;
    line.classList.add('done');
    const statusSpan = line.querySelector('.status');
    const timeSpan = line.querySelector('.time');
    if (statusSpan) statusSpan.innerHTML = '<span class="checkmark">✓</span>';
    if (timeSpan) timeSpan.textContent = `${elapsed}ms`;
    const progressFill = $('progressFill');
    if (progressFill) progressFill.style.width = `${progress}%`;
}

function failBootStep(stepId, errorMsg) {
    const line = $(stepId);
    if (line) {
        line.classList.add('visible');
        const statusSpan = line.querySelector('.status');
        if (statusSpan) {
            statusSpan.innerHTML = '<span style="color: var(--red)">✗</span>';
            statusSpan.classList.add('error');
        }
    }
    const statusEl = $('bootStatusText');
    if (statusEl) {
        statusEl.textContent = errorMsg;
        statusEl.style.color = 'var(--red)';
    }
}

async function finishBootSequence() {
    await wait(200);
    
    const terminal = $('terminal');
    const terminalWrapper = $('terminalWrapper');
    const editorContainer = $('editorContainer');
    
    // Remove loading animation
    if (terminal) terminal.classList.remove('loading');
    
    // Start morphing - fade out terminal content first
    if (terminal) terminal.classList.add('expanding');
    if (terminalWrapper) terminalWrapper.classList.add('expanding');
    
    await wait(300);
    
    // Show editor underneath as terminal expands
    if (editorContainer) {
        editorContainer.classList.add('morphing');
        editorContainer.classList.add('active');
    }
    
    await wait(400);
    
    // Hide terminal wrapper
    if (terminalWrapper) terminalWrapper.style.opacity = '0';
    
    await wait(200);
    
    // Final cleanup
    if (terminalWrapper) terminalWrapper.style.display = 'none';
    if (editorContainer) editorContainer.classList.remove('morphing');
}

// ==========================================
// Navigation
// ==========================================
function goHome() {
    cleanupPresence();
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    window.location.href = window.location.pathname;
}

async function connectToNote(noteName) {
    if (!noteName) return;
    
    currentNote = noteName;
    document.title = `${noteName} — Notes`;
    const noteNameEl = $('noteName');
    if (noteNameEl) noteNameEl.textContent = noteName;

    // Initialize boot sequence UI
    initBootSequence(noteName);
    
    // Wait for boot sequence to be visible
    await wait(300);
    
    try {
        // Step 1: Connect to Firebase
        showBootStep('boot-connect', 10, 'Establishing connection to Firebase...');
        await wait(200); // Small delay to show the step
        completeBootStep('boot-connect', 20);

        // Step 2: Load note data
        await wait(150);
        showBootStep('boot-load', 25, `Loading "${noteName}" from database...`);
        const data = await loadNote(noteName);
        completeBootStep('boot-load', 45);

        // Step 3: Initialize Monaco editor
        await wait(150);
        showBootStep('boot-editor', 50, 'Loading Monaco editor...');
        await initEditor(noteName, data);
        completeBootStep('boot-editor', 75);
        addRecent(noteName);

        // Step 4: Setup collaboration
        await wait(150);
        showBootStep('boot-collab', 80, 'Setting up real-time collaboration...');
        try {
            setupPresence(noteName);
        } catch (e) { console.warn('Presence setup failed:', e); }
        try {
            setupFileTransfer(noteName);
        } catch (e) { console.warn('File transfer setup failed:', e); }
        await wait(200);
        completeBootStep('boot-collab', 90);

        // Step 5: Final setup
        await wait(100);
        showBootStep('boot-ready', 95, 'Almost ready...');
        
        // Real-time sync
        unsubscribe = subscribe(noteName, (newData) => {
            if (!isLocalChange && editor && newData.content !== editor.getValue()) {
                const pos = editor.getPosition();
                const scroll = editor.getScrollTop();
                editor.setValue(newData.content || '');
                if (pos) editor.setPosition(pos);
                editor.setScrollTop(scroll);
                lastSaved = newData.content || '';
                
                if (newData.language && newData.language !== $('langSelect').value) {
                    $('langSelect').value = newData.language;
                    monaco.editor.setModelLanguage(editor.getModel(), newData.language);
                }
            }
        });

        completeBootStep('boot-ready', 100);
        const bootStatus = $('bootStatusText');
        if (bootStatus) {
            bootStatus.textContent = '✓ Connected successfully!';
            bootStatus.style.color = 'var(--green)';
        }

        // Update URL
        history.pushState({}, '', `?n=${encodeURIComponent(noteName)}`);

        // Finish the boot animation and show editor
        await finishBootSequence();
        
        setTimeout(() => editor?.focus(), 100);

    } catch (err) {
        console.error(err);
        failBootStep('boot-load', 'Connection failed: ' + (err.message || 'Unknown error'));
        showToast('Connection failed');
    }
}

function openNote() {
    const n = $('noteInput').value.trim();
    if (n) connectToNote(n);
}

function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    showToast('Link copied!');
}

function goToLine() {
    if (editor) editor.trigger('keyboard', 'editor.action.gotoLine', {});
}

function showShortcuts() { 
    closeAllDropdowns();
    $('shortcutsModal').classList.add('show'); 
}
function hideShortcuts() { $('shortcutsModal').classList.remove('show'); }

// ==========================================
// Editor Controls
// ==========================================
function changeLanguage() {
    if (!editor) return;
    const lang = $('langSelect').value;
    monaco.editor.setModelLanguage(editor.getModel(), lang);
    savePrefs({ language: lang });
    triggerSave();
}


function changeFontSize(delta) {
    if (!editor) return;
    fontSize = Math.max(10, Math.min(24, fontSize + delta));
    editor.updateOptions({ fontSize });
    const fontDisplay = $('fontSizeDisplay');
    if (fontDisplay) fontDisplay.textContent = fontSize;
    savePrefs({ fontSize });
}

function toggleWrap() {
    if (!editor) return;
    wordWrap = !wordWrap;
    editor.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' });
    $('wrapBtn')?.classList.toggle('active', wordWrap);
    const wrapStatus = $('wrapStatus');
    if (wrapStatus) wrapStatus.textContent = wordWrap ? 'On' : 'Off';
    savePrefs({ wordWrap });
}

function toggleMinimap() {
    if (!editor) return;
    minimapEnabled = !minimapEnabled;
    editor.updateOptions({ minimap: { enabled: minimapEnabled } });
    $('minimapBtn')?.classList.toggle('active', minimapEnabled);
    const minimapStatus = $('minimapStatus');
    if (minimapStatus) minimapStatus.textContent = minimapEnabled ? 'On' : 'Off';
    savePrefs({ minimap: minimapEnabled });
}

function toggleLineHighlight() {
    if (!editor) return;
    lineHighlight = !lineHighlight;
    editor.updateOptions({ renderLineHighlight: lineHighlight ? 'all' : 'none' });
    $('lineHighlightBtn')?.classList.toggle('active', lineHighlight);
    const highlightStatus = $('highlightStatus');
    if (highlightStatus) highlightStatus.textContent = lineHighlight ? 'On' : 'Off';
    savePrefs({ lineHighlight });
}

function updateSettingsUI() {
    const wrapEl = $('wrapStatus');
    const minimapEl = $('minimapStatus');
    const highlightEl = $('highlightStatus');
    if (wrapEl) wrapEl.textContent = wordWrap ? 'On' : 'Off';
    if (minimapEl) minimapEl.textContent = minimapEnabled ? 'On' : 'Off';
    if (highlightEl) highlightEl.textContent = lineHighlight ? 'On' : 'Off';
}

// ==========================================
// Theme System
// ==========================================
function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll(`.theme-btn.${theme}`).forEach(btn => btn.classList.add('active'));
    
    if (editor) {
        const monacoTheme = theme === 'light' ? 'notes-light' : 
                            theme === 'contrast' ? 'hc-black' : 'notes-dark';
        monaco.editor.setTheme(monacoTheme);
    }
    
    savePrefs({ theme });
}

// ==========================================
// Dropdown System
// ==========================================
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show'));
}

function toggleDropdown(menuId) {
    const menu = $(menuId);
    const isOpen = menu.classList.contains('show');
    closeAllDropdowns();
    if (!isOpen) {
        menu.classList.add('show');
    }
}

// ==========================================
// Export Functions
// ==========================================
function exportPDF() {
    closeAllDropdowns();
    if (!editor || !currentNote) return;
    
    const content = editor.getValue();
    const printWindow = window.open('', '_blank');
    
    const htmlContent = `<pre style="white-space: pre-wrap; font-family: 'Fira Code', monospace; font-size: 12px; line-height: 1.6;">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${currentNote}</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; }
            pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
            code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-family: 'Fira Code', monospace; }
            pre code { background: none; padding: 0; }
            h1, h2, h3 { margin-top: 1.5em; }
            @media print { body { margin: 0; } }
        </style></head>
        <body><h1 style="border-bottom: 2px solid #333; padding-bottom: 10px;">${currentNote}</h1>${htmlContent}</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
    showToast('Print dialog opened');
}

function triggerSave() {
    setStatus(true);
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        const text = editor.getValue();
        const lang = $('langSelect').value;
        await saveNote(currentNote, text, lang);
        lastSaved = text;
        setStatus(false);
    }, 400);
}

// ==========================================
// Monaco Editor
// ==========================================
async function initEditor(note, data) {
    return new Promise(resolve => {
        require.config({ 
            paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
        });

        require(['vs/editor/editor.main'], function() {
            // Dark theme
            monaco.editor.defineTheme('notes-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
                    { token: 'keyword', foreground: 'ff7b72' },
                    { token: 'string', foreground: 'a5d6ff' },
                    { token: 'number', foreground: '79c0ff' },
                    { token: 'type', foreground: 'ffa657' },
                ],
                colors: {
                    'editor.background': '#0a0a0f',
                    'editor.foreground': '#e6edf3',
                    'editor.lineHighlightBackground': '#12131a66',
                    'editor.selectionBackground': '#264f7844',
                    'editorCursor.foreground': '#58a6ff',
                    'editorLineNumber.foreground': '#4a4a5a',
                    'editorLineNumber.activeForeground': '#e6edf3',
                }
            });

            // Light theme
            monaco.editor.defineTheme('notes-light', {
                base: 'vs',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#ffffff',
                    'editor.foreground': '#212529',
                    'editor.lineHighlightBackground': '#f8f9fa',
                    'editorCursor.foreground': '#0d6efd',
                }
            });

            const prefs = getPrefs();
            wordWrap = prefs.wordWrap === true; // Default: off
            minimapEnabled = prefs.minimap === true; // Default: off
            fontSize = prefs.fontSize || 14;
            lineHighlight = prefs.lineHighlight !== false;
            currentTheme = prefs.theme || 'dark';
            const lang = data.language || prefs.language || 'plaintext';
            
            setTheme(currentTheme);
            const fontDisplay = $('fontSizeDisplay');
            if (fontDisplay) fontDisplay.textContent = fontSize;

            const monacoTheme = currentTheme === 'light' ? 'notes-light' : 
                                currentTheme === 'contrast' ? 'hc-black' : 'notes-dark';

            editor = monaco.editor.create($('monaco-container'), {
                value: data.content || '',
                language: lang,
                theme: monacoTheme,
                fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                fontSize: fontSize,
                fontLigatures: true,
                lineHeight: 22,
                padding: { top: 16, bottom: 16 },
                automaticLayout: true,
                minimap: { enabled: minimapEnabled },
                renderLineHighlight: lineHighlight ? 'all' : 'none',
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                wordWrap: wordWrap ? 'on' : 'off',
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                bracketPairColorization: { enabled: true },
                folding: true,
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'always',
                tabSize: 2,
            });

            lastSaved = data.content || '';
            $('langSelect').value = lang;
            $('lineHighlightBtn')?.classList.toggle('active', lineHighlight);
            updateSettingsUI();

            editor.onDidChangeModelContent(() => { 
                updateStats(); 
                triggerSave(); 
            });
            
            editor.onDidChangeCursorPosition(() => {
                updateStats();
                broadcastCursor();
            });
            
            editor.onDidChangeCursorSelection(() => {
                updateStats();
                broadcastCursor();
            });

            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
                clearTimeout(saveTimeout);
                await saveNote(currentNote, editor.getValue(), $('langSelect').value);
                lastSaved = editor.getValue();
                setStatus(false);
                showToast('Saved!');
            });

            updateStats();
            resolve(editor);
        });
    });
}

// ==========================================
// View Switching
// ==========================================
let currentView = 'code';

function switchView(view) {
    currentView = view;
    
    // Update tabs
    document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
    $(`${view}Tab`)?.classList.add('active');
    
    // Update containers
    const monacoContainer = $('monaco-container');
    const whiteboardContainer = $('whiteboardContainer');
    const screenshareContainer = $('screenshareContainer');
    
    if (monacoContainer) monacoContainer.style.display = view === 'code' ? 'block' : 'none';
    if (whiteboardContainer) whiteboardContainer.classList.toggle('active', view === 'whiteboard');
    if (screenshareContainer) screenshareContainer.classList.toggle('active', view === 'screenshare');
    
    // Initialize whiteboard if needed
    if (view === 'whiteboard' && !whiteboardInitialized) {
        initWhiteboard();
    }
    
    // Focus editor if code view
    if (view === 'code' && editor) {
        setTimeout(() => editor.focus(), 100);
    }
}

// ==========================================
// Whiteboard (Coding Board)
// ==========================================
let whiteboardInitialized = false;
let canvas, ctx;
let isDrawing = false;
let currentTool = 'pen';
let currentColor = '#ffffff';
let currentStrokeWidth = 2;
let paths = [];
let currentPath = null;
let undoStack = [];
let redoStack = [];
let startX, startY;
let shapePreview = null;

// Smooth stroke settings using perfect-freehand algorithm concepts
const smoothing = 0.5;
const thinning = 0.5;
const streamline = 0.5;

function initWhiteboard() {
    canvas = $('whiteboardCanvas');
    if (!canvas) return;
    
    ctx = canvas.getContext('2d');
    whiteboardInitialized = true;
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Mouse events
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', handlePointerUp);
    
    // Touch events (Apple Pencil support)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);
    
    // Pointer events for pressure sensitivity
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    
    // Load saved whiteboard data
    loadWhiteboardData();
}

function resizeCanvas() {
    const wrapper = $('canvasWrapper');
    if (!wrapper || !canvas) return;
    
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    ctx.scale(dpr, dpr);
    redrawCanvas();
}

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    handlePointerDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
        pressure: touch.force || 0.5,
        target: canvas
    });
}

function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    handlePointerMove({
        clientX: touch.clientX,
        clientY: touch.clientY,
        pressure: touch.force || 0.5,
        buttons: 1
    });
}

function handleTouchEnd(e) {
    handlePointerUp(e);
}

function handlePointerDown(e) {
    if (e.target !== canvas) return;
    
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    
    const pressure = e.pressure || 0.5;
    
    if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'eraser') {
        currentPath = {
            tool: currentTool,
            color: currentTool === 'eraser' ? '#1a1a2e' : currentColor,
            width: currentTool === 'eraser' ? currentStrokeWidth * 5 : currentStrokeWidth,
            opacity: currentTool === 'highlighter' ? 0.4 : 1,
            points: [{ x: startX, y: startY, pressure }]
        };
    } else {
        // Shape tools
        currentPath = {
            tool: currentTool,
            color: currentColor,
            width: currentStrokeWidth,
            startX, startY,
            endX: startX,
            endY: startY
        };
    }
}

function handlePointerMove(e) {
    if (!isDrawing || !currentPath) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure || 0.5;
    
    if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'eraser') {
        currentPath.points.push({ x, y, pressure });
        drawSmoothPath(currentPath);
    } else {
        // Shape preview
        currentPath.endX = x;
        currentPath.endY = y;
        redrawCanvas();
        drawShape(currentPath, true);
    }
}

function handlePointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentPath) {
        // Shape recognition for freehand drawings
        if ((currentTool === 'pen') && currentPath.points && currentPath.points.length > 10) {
            const recognizedShape = recognizeShape(currentPath.points);
            if (recognizedShape) {
                currentPath = recognizedShape;
            }
        }
        
        paths.push(currentPath);
        undoStack.push([...paths]);
        redoStack = [];
        saveWhiteboardData();
    }
    
    currentPath = null;
    redrawCanvas();
}

function drawSmoothPath(path) {
    if (!path.points || path.points.length < 2) return;
    
    redrawCanvas();
    
    ctx.save();
    ctx.globalAlpha = path.opacity || 1;
    ctx.strokeStyle = path.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw smooth curve using quadratic bezier
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    
    for (let i = 1; i < path.points.length - 1; i++) {
        const p0 = path.points[i - 1];
        const p1 = path.points[i];
        const p2 = path.points[i + 1];
        
        // Variable width based on pressure
        const width = path.width * (0.5 + p1.pressure * 0.5);
        ctx.lineWidth = width;
        
        // Smooth curve
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        ctx.quadraticCurveTo(p1.x, p1.y, mx, my);
    }
    
    // Last point
    const lastPoint = path.points[path.points.length - 1];
    ctx.lineTo(lastPoint.x, lastPoint.y);
    ctx.stroke();
    ctx.restore();
}

function drawShape(shape, isPreview = false) {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (isPreview) {
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.7;
    }
    
    const { startX, startY, endX, endY } = shape;
    
    ctx.beginPath();
    
    switch (shape.tool) {
        case 'line':
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            break;
            
        case 'rect':
            ctx.rect(startX, startY, endX - startX, endY - startY);
            break;
            
        case 'ellipse':
            const radiusX = Math.abs(endX - startX) / 2;
            const radiusY = Math.abs(endY - startY) / 2;
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
            break;
            
        case 'arrow':
            drawArrow(ctx, startX, startY, endX, endY);
            break;
            
        case 'recognized-rect':
            ctx.rect(shape.x, shape.y, shape.width, shape.height);
            break;
            
        case 'recognized-ellipse':
            ctx.ellipse(shape.centerX, shape.centerY, shape.radiusX, shape.radiusY, 0, 0, Math.PI * 2);
            break;
            
        case 'recognized-line':
            ctx.moveTo(shape.x1, shape.y1);
            ctx.lineTo(shape.x2, shape.y2);
            break;
    }
    
    ctx.stroke();
    ctx.restore();
}

function drawArrow(ctx, x1, y1, x2, y2) {
    const headLength = 15;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
}

// Shape recognition for auto-correction
function recognizeShape(points) {
    if (points.length < 10) return null;
    
    const bounds = getBounds(points);
    const aspectRatio = bounds.width / bounds.height;
    const closed = isShapeClosed(points);
    const corners = detectCorners(points);
    
    // Check if it's roughly a rectangle (4 corners, closed)
    if (closed && corners.length >= 3 && corners.length <= 5) {
        if (aspectRatio > 0.7 && aspectRatio < 1.4) {
            // Square-ish
            const size = Math.max(bounds.width, bounds.height);
            return {
                tool: 'recognized-rect',
                color: currentColor,
                width: currentStrokeWidth,
                x: bounds.minX,
                y: bounds.minY,
                width: size,
                height: size
            };
        } else {
            // Rectangle
            return {
                tool: 'recognized-rect',
                color: currentColor,
                width: currentStrokeWidth,
                x: bounds.minX,
                y: bounds.minY,
                width: bounds.width,
                height: bounds.height
            };
        }
    }
    
    // Check if it's roughly a circle/ellipse (closed, smooth, no corners)
    if (closed && corners.length <= 2) {
        const circularity = calculateCircularity(points, bounds);
        if (circularity > 0.7) {
            return {
                tool: 'recognized-ellipse',
                color: currentColor,
                width: currentStrokeWidth,
                centerX: bounds.minX + bounds.width / 2,
                centerY: bounds.minY + bounds.height / 2,
                radiusX: bounds.width / 2,
                radiusY: bounds.height / 2
            };
        }
    }
    
    // Check if it's a straight line
    if (!closed && isLineShape(points)) {
        return {
            tool: 'recognized-line',
            color: currentColor,
            width: currentStrokeWidth,
            x1: points[0].x,
            y1: points[0].y,
            x2: points[points.length - 1].x,
            y2: points[points.length - 1].y
        };
    }
    
    return null;
}

function getBounds(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function isShapeClosed(points) {
    if (points.length < 10) return false;
    const first = points[0];
    const last = points[points.length - 1];
    const dist = Math.sqrt(Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2));
    const bounds = getBounds(points);
    const threshold = Math.min(bounds.width, bounds.height) * 0.2;
    return dist < threshold;
}

function detectCorners(points) {
    const corners = [];
    const threshold = 30; // degrees
    
    for (let i = 2; i < points.length - 2; i++) {
        const p1 = points[i - 2];
        const p2 = points[i];
        const p3 = points[i + 2];
        
        const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
        let angleDiff = Math.abs(angle2 - angle1) * 180 / Math.PI;
        
        if (angleDiff > 180) angleDiff = 360 - angleDiff;
        
        if (angleDiff > threshold) {
            corners.push(i);
            i += 5; // Skip nearby points
        }
    }
    
    return corners;
}

function calculateCircularity(points, bounds) {
    const centerX = bounds.minX + bounds.width / 2;
    const centerY = bounds.minY + bounds.height / 2;
    const avgRadius = (bounds.width + bounds.height) / 4;
    
    let variance = 0;
    points.forEach(p => {
        const dist = Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2));
        variance += Math.pow(dist - avgRadius, 2);
    });
    variance /= points.length;
    
    return 1 - Math.min(1, variance / (avgRadius * avgRadius));
}

function isLineShape(points) {
    if (points.length < 5) return false;
    
    const first = points[0];
    const last = points[points.length - 1];
    const lineLength = Math.sqrt(Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2));
    
    if (lineLength < 30) return false;
    
    // Check if all points are close to the line
    let totalDeviation = 0;
    points.forEach(p => {
        const dist = pointToLineDistance(p, first, last);
        totalDeviation += dist;
    });
    
    const avgDeviation = totalDeviation / points.length;
    return avgDeviation < lineLength * 0.1;
}

function pointToLineDistance(point, lineStart, lineEnd) {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    
    if (param < 0) {
        xx = lineStart.x;
        yy = lineStart.y;
    } else if (param > 1) {
        xx = lineEnd.x;
        yy = lineEnd.y;
    } else {
        xx = lineStart.x + param * C;
        yy = lineStart.y + param * D;
    }
    
    return Math.sqrt(Math.pow(point.x - xx, 2) + Math.pow(point.y - yy, 2));
}

function redrawCanvas() {
    if (!ctx || !canvas) return;
    
    const wrapper = $('canvasWrapper');
    if (!wrapper) return;
    
    ctx.clearRect(0, 0, wrapper.offsetWidth, wrapper.offsetHeight);
    
    paths.forEach(path => {
        if (path.points) {
            drawSmoothPath(path);
        } else {
            drawShape(path);
        }
    });
}

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    $(`tool${tool.charAt(0).toUpperCase() + tool.slice(1)}`)?.classList.add('active');
    
    // Update cursor
    if (canvas) {
        canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
    }
}

function setColor(color) {
    currentColor = color;
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.classList.toggle('active', swatch.style.background === color);
    });
}

function setStrokeWidth(width) {
    currentStrokeWidth = parseInt(width);
    const label = document.querySelector('.stroke-width-label');
    if (label) label.textContent = width + 'px';
}

function undoCanvas() {
    if (paths.length > 0) {
        redoStack.push(paths.pop());
        redrawCanvas();
        saveWhiteboardData();
    }
}

function redoCanvas() {
    if (redoStack.length > 0) {
        paths.push(redoStack.pop());
        redrawCanvas();
        saveWhiteboardData();
    }
}

function clearCanvas() {
    if (paths.length > 0 && confirm('Clear the entire whiteboard?')) {
        undoStack.push([...paths]);
        paths = [];
        redrawCanvas();
        saveWhiteboardData();
    }
}

function saveWhiteboardData() {
    if (!currentNote) return;
    db.ref(`whiteboards/${sanitize(currentNote)}`).set({
        paths: JSON.stringify(paths),
        updatedAt: Date.now()
    });
}

function loadWhiteboardData() {
    if (!currentNote) return;
    db.ref(`whiteboards/${sanitize(currentNote)}`).on('value', snap => {
        const data = snap.val();
        if (data && data.paths) {
            try {
                paths = JSON.parse(data.paths);
                redrawCanvas();
            } catch (e) {
                console.error('Failed to load whiteboard:', e);
            }
        }
    });
}

// ==========================================
// Screenshare
// ==========================================
let screenStream = null;
let isSharing = false;

async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
        });
        
        const video = $('screenshareVideo');
        const placeholder = $('screensharePlaceholder');
        
        video.srcObject = screenStream;
        video.style.display = 'block';
        placeholder.style.display = 'none';
        
        $('startShareBtn').style.display = 'none';
        $('stopShareBtn').style.display = 'flex';
        
        isSharing = true;
        
        // Handle stream ending (user clicks stop in browser UI)
        screenStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };
        
        showToast('Screen sharing started');
        
    } catch (err) {
        console.error('Screen share failed:', err);
        if (err.name !== 'AbortError') {
            showToast('Failed to start screen sharing');
        }
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    const video = $('screenshareVideo');
    const placeholder = $('screensharePlaceholder');
    
    video.srcObject = null;
    video.style.display = 'none';
    placeholder.style.display = 'flex';
    
    $('startShareBtn').style.display = 'flex';
    $('stopShareBtn').style.display = 'none';
    
    isSharing = false;
    showToast('Screen sharing stopped');
}

// ==========================================
// Init
// ==========================================
async function init() {
    const params = new URLSearchParams(window.location.search);
    const note = params.get('n');

    if (note) {
        connectToNote(note);
    } else {
        document.title = 'Notes';
        renderRecent();
        $('noteInput').addEventListener('keypress', e => {
            if (e.key === 'Enter') openNote();
        });
    }
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        hideShortcuts();
        hideRenameModal();
        closeAllDropdowns();
    }
    
    // Whiteboard shortcuts
    if (currentView === 'whiteboard') {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') { e.preventDefault(); undoCanvas(); }
            if (e.key === 'y') { e.preventDefault(); redoCanvas(); }
        } else {
            if (e.key === 'p') setTool('pen');
            if (e.key === 'h') setTool('highlighter');
            if (e.key === 'e') setTool('eraser');
            if (e.key === 'l') setTool('line');
            if (e.key === 'r') setTool('rect');
            if (e.key === 'o') setTool('ellipse');
            if (e.key === 'a') setTool('arrow');
            if (e.key === 't') setTool('text');
        }
    }
});

document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown')) {
        closeAllDropdowns();
    }
});

window.addEventListener('beforeunload', () => {
    cleanupPresence();
    if (isSharing) stopScreenShare();
});

$('renameInput')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') saveUserName();
});

init();

