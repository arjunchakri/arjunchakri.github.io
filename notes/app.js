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
    // Cleanup file transfer peer connections
    Object.values(peerConnections).forEach(pc => {
        try { pc.close(); } catch(e) {}
    });
    peerConnections = {};
    // Cleanup screenshare peer connections
    Object.values(screensharePeers).forEach(pc => {
        try { pc.close(); } catch(e) {}
    });
    screensharePeers = {};
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

// Helper to log ICE candidate info
function logIceCandidate(candidate, direction) {
    if (!candidate) return;
    const parts = candidate.candidate?.split(' ') || [];
    const type = parts[7] || 'unknown'; // host, srflx, relay
    const protocol = parts[2] || 'unknown';
    const emoji = type === 'relay' ? '🔄' : type === 'srflx' ? '🌐' : '🏠';
    console.log(`${emoji} ICE ${direction}: ${type} (${protocol})`, candidate.candidate?.substring(0, 80));
}

// Test TURN server connectivity
async function testTurnConnectivity() {
    console.log('🔧 Testing TURN server connectivity...');
    const pc = new RTCPeerConnection(rtcConfig);
    
    return new Promise((resolve) => {
        let hasRelay = false;
        let hasSrflx = false;
        let hasHost = false;
        const candidates = [];
        
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                const parts = e.candidate.candidate.split(' ');
                const type = parts[7];
                const ip = parts[4];
                candidates.push({ type, ip });
                if (type === 'relay') hasRelay = true;
                if (type === 'srflx') hasSrflx = true;
                if (type === 'host') hasHost = true;
            }
        };
        
        pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') {
                pc.close();
                console.log('📋 ICE candidates found:', candidates);
                if (hasRelay) {
                    console.log('✅ TURN server working - relay candidates available');
                } else if (hasSrflx) {
                    console.warn('⚠️ TURN not working, only STUN available - cross-network may fail');
                    console.log('💡 Devices on SAME WiFi should still work via host candidates');
                } else if (hasHost) {
                    console.warn('⚠️ Only local candidates - may only work on same network');
                } else {
                    console.error('❌ No candidates at all - check network/firewall');
                }
                resolve({ hasRelay, hasSrflx, hasHost, candidates });
            }
        };
        
        // Create dummy data channel to trigger ICE gathering
        pc.createDataChannel('test');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        
        // Timeout after 10 seconds
        setTimeout(() => {
            pc.close();
            resolve({ hasRelay, hasSrflx, hasHost, candidates });
        }, 10000);
    });
}

// Debug function - shows visual panel on page (works on iPad!)
window.debugWebRTC = async function() {
    // Create debug panel
    let panel = document.getElementById('debugPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'debugPanel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1a1a2e;
            border: 2px solid #58a6ff;
            border-radius: 12px;
            padding: 20px;
            z-index: 99999;
            min-width: 320px;
            max-width: 90vw;
            max-height: 80vh;
            overflow-y: auto;
            font-family: monospace;
            font-size: 13px;
            color: #e6edf3;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        `;
        document.body.appendChild(panel);
    }
    
    const addLine = (text, color = '#e6edf3') => {
        const line = document.createElement('div');
        line.style.cssText = `margin: 4px 0; color: ${color};`;
        line.textContent = text;
        panel.appendChild(line);
    };
    
    const addHeader = (text) => {
        const h = document.createElement('div');
        h.style.cssText = 'margin: 12px 0 8px 0; font-weight: bold; color: #58a6ff; border-bottom: 1px solid #333;';
        h.textContent = text;
        panel.appendChild(h);
    };
    
    // Clear and add close button
    panel.innerHTML = '';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Close';
    closeBtn.style.cssText = `
        position: absolute; top: 10px; right: 10px;
        background: #f85149; color: white; border: none;
        padding: 5px 10px; border-radius: 4px; cursor: pointer;
    `;
    closeBtn.onclick = () => panel.remove();
    panel.appendChild(closeBtn);
    
    addHeader('🔧 WebRTC Debug');
    addLine(`User ID: ${myUserId}`);
    addLine(`Note: ${currentNote || 'none'}`);
    addLine(`Online users: ${Object.keys(collaborators).length}`);
    addLine(`Peer connections: ${Object.keys(peerConnections).length}`);
    
    addHeader('📡 Testing Connectivity...');
    addLine('Please wait...', '#ffd700');
    
    const result = await testTurnConnectivity();
    
    // Remove "Please wait"
    panel.lastChild.remove();
    
    addHeader('📋 ICE Candidates Found');
    if (result.candidates && result.candidates.length > 0) {
        result.candidates.forEach(c => {
            const emoji = c.type === 'relay' ? '🔄' : c.type === 'srflx' ? '🌐' : '🏠';
            addLine(`${emoji} ${c.type}: ${c.ip}`, c.type === 'relay' ? '#3fb950' : '#e6edf3');
        });
    } else {
        addLine('No candidates found!', '#f85149');
    }
    
    addHeader('📊 Results');
    addLine(`✓ Local (host): ${result.hasHost ? 'YES ✅' : 'NO ❌'}`, result.hasHost ? '#3fb950' : '#f85149');
    addLine(`✓ STUN (srflx): ${result.hasSrflx ? 'YES ✅' : 'NO ❌'}`, result.hasSrflx ? '#3fb950' : '#ffd700');
    addLine(`✓ TURN (relay): ${result.hasRelay ? 'YES ✅' : 'NO ❌'}`, result.hasRelay ? '#3fb950' : '#f85149');
    
    addHeader('💡 Diagnosis');
    if (result.hasRelay) {
        addLine('All good! Cross-network transfer should work.', '#3fb950');
    } else if (result.hasSrflx && result.hasHost) {
        addLine('⚠️ No TURN relay - cross-network may fail', '#ffd700');
        addLine('Same WiFi should work if router allows', '#ffd700');
    } else if (result.hasHost) {
        addLine('⚠️ Only local candidates found', '#ffd700');
        addLine('Check: Router AP Isolation setting', '#e6edf3');
        addLine('Check: Both devices on same WiFi?', '#e6edf3');
    } else {
        addLine('❌ No candidates - check firewall!', '#f85149');
    }
    
    // Add copy button
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copy Debug Info';
    copyBtn.style.cssText = `
        margin-top: 15px; background: #238636; color: white; 
        border: none; padding: 8px 16px; border-radius: 6px; 
        cursor: pointer; width: 100%;
    `;
    copyBtn.onclick = () => {
        const text = `WebRTC Debug:
User: ${myUserId}
Host: ${result.hasHost}
STUN: ${result.hasSrflx}
TURN: ${result.hasRelay}
Candidates: ${result.candidates?.map(c => c.type + ':' + c.ip).join(', ')}`;
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = '✅ Copied!';
            setTimeout(() => copyBtn.textContent = '📋 Copy Debug Info', 2000);
        });
    };
    panel.appendChild(copyBtn);
    
    return result;
};

// Triple-tap anywhere to open debug (for mobile)
let tapCount = 0;
let tapTimer = null;
document.addEventListener('touchend', () => {
    tapCount++;
    if (tapCount === 3) {
        window.debugWebRTC();
        tapCount = 0;
    }
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => tapCount = 0, 500);
});

// WebRTC configuration with multiple TURN server fallbacks
// IMPORTANT: Free TURN servers are unreliable. For production, get your own at:
// - https://www.metered.ca/tools/openrelay/ (500MB free/month)
// - https://www.twilio.com/stun-turn (free trial)
const rtcConfig = {
    iceServers: [
        // Google STUN servers (always work for discovery)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        
        // Free TURN server options (try multiple)
        // NUMB STUN/TURN (free, requires email registration at numb.viagenie.ca)
        {
            urls: 'turn:numb.viagenie.ca',
            username: 'webrtc@live.com',
            credential: 'muazkh'
        },
        {
            urls: 'turn:numb.viagenie.ca:3478',
            username: 'webrtc@live.com', 
            credential: 'muazkh'
        },
        
        // OpenRelay TURN servers
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        
        // Metered relay
        {
            urls: 'turn:a.relay.metered.ca:80',
            username: 'e8dd65c92ae01231e6201be5',
            credential: 'wC+MN4EH/PFNzj3X'
        },
        {
            urls: 'turn:a.relay.metered.ca:443',
            username: 'e8dd65c92ae01231e6201be5',
            credential: 'wC+MN4EH/PFNzj3X'
        }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// Track processed signals to avoid duplicates
let processedSignals = new Set();
let activeFileTransfer = null; // Track current active transfer

function setupFileTransfer(note) {
    fileTransferRef = db.ref(`file-transfers/${sanitize(note)}`);
    
    // Listen for incoming file signals
    fileTransferRef.on('child_added', snapshot => {
        const data = snapshot.val();
        const signalKey = snapshot.key;
        
        if (!data || data.to !== myUserId) return;
        
        // Prevent duplicate processing
        const signalId = `${signalKey}_${data.type}_${data.from}`;
        if (processedSignals.has(signalId)) {
            snapshot.ref.remove();
            return;
        }
        processedSignals.add(signalId);
        
        // Clean old signal IDs (keep last 100)
        if (processedSignals.size > 100) {
            const arr = Array.from(processedSignals);
            processedSignals = new Set(arr.slice(-50));
        }
        
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
    // Prevent duplicate accept handling
    if (activeFileTransfer === data.from) {
        console.log('Already handling transfer with', data.from);
        return;
    }
    
    // Close any existing connection to this peer
    if (peerConnections[data.from]) {
        try { peerConnections[data.from].close(); } catch(e) {}
        delete peerConnections[data.from];
    }
    
    activeFileTransfer = data.from;
    updateTransferStatus('Establishing connection...');
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[data.from] = pc;
    pendingFileIceCandidates[data.from] = [];

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
        activeFileTransfer = null;
    };
    
    channel.onclose = () => {
        activeFileTransfer = null;
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            logIceCandidate(event.candidate, 'OUT (sender)');
            fileTransferRef.push({
                type: 'ice',
                from: myUserId,
                to: data.from,
                candidate: event.candidate.toJSON()
            });
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log('File transfer ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected') {
            console.log('✅ File transfer connection established!');
        }
        if (pc.iceConnectionState === 'failed') {
            console.error('❌ ICE connection failed - attempting ICE restart');
            // Try ICE restart before giving up
            pc.restartIce();
            pc.createOffer({ iceRestart: true }).then(offer => {
                return pc.setLocalDescription(offer);
            }).then(() => {
                fileTransferRef.push({
                    type: 'webrtc-offer',
                    from: myUserId,
                    to: data.from,
                    sdp: pc.localDescription.sdp,
                    iceRestart: true
                });
            }).catch(err => {
                console.error('ICE restart failed:', err);
                showToast('Connection failed - devices may not be able to connect');
                hideTransferModal();
                activeFileTransfer = null;
            });
        }
        if (pc.iceConnectionState === 'disconnected') {
            console.warn('⚠️ ICE disconnected - waiting for recovery...');
            // Give it 5 seconds to recover before restarting
            setTimeout(() => {
                if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                    console.log('Still disconnected, restarting ICE...');
                    pc.restartIce();
                }
            }, 5000);
        }
    };
    
    pc.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', pc.iceGatheringState);
    };

    // Create and send offer
    const offerDesc = await pc.createOffer();
    await pc.setLocalDescription(offerDesc);
    
    console.log('Sending WebRTC offer to', data.from);

    await fileTransferRef.push({
        type: 'webrtc-offer',
        from: myUserId,
        to: data.from,
        sdp: offerDesc.sdp
    });
}

// Buffer for ICE candidates that arrive before remote description is set
let pendingFileIceCandidates = {};

async function handleWebRTCOffer(data) {
    // Receiver gets WebRTC offer from sender
    console.log('Received WebRTC offer from', data.from);
    
    // Check if we already have a connection in progress
    if (peerConnections[data.from] && peerConnections[data.from].signalingState !== 'closed') {
        console.log('Already have connection with', data.from, '- state:', peerConnections[data.from].signalingState);
        return;
    }
    
    // Close any existing connection
    if (peerConnections[data.from]) {
        try { peerConnections[data.from].close(); } catch(e) {}
    }
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[data.from] = pc;
    pendingFileIceCandidates[data.from] = [];

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
            logIceCandidate(event.candidate, 'OUT (receiver)');
            fileTransferRef.push({
                type: 'ice',
                from: myUserId,
                to: data.from,
                candidate: event.candidate.toJSON()
            });
        }
    };
    
    pc.oniceconnectionstatechange = () => {
        console.log('File transfer ICE state (receiver):', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected') {
            console.log('✅ File transfer connection established (receiver)!');
        }
        if (pc.iceConnectionState === 'failed') {
            console.error('❌ ICE connection failed (receiver) - may need ICE restart from sender');
            showToast('Connection failed - waiting for retry...');
        }
        if (pc.iceConnectionState === 'disconnected') {
            console.warn('⚠️ ICE disconnected (receiver) - waiting for reconnection...');
        }
    };
    
    pc.onicegatheringstatechange = () => {
        console.log('ICE gathering state (receiver):', pc.iceGatheringState);
    };

    // Set remote description and create answer
    await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
    
    // Add any buffered ICE candidates
    if (pendingFileIceCandidates[data.from]) {
        for (const candidate of pendingFileIceCandidates[data.from]) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn('Failed to add buffered ICE candidate:', e);
            }
        }
        pendingFileIceCandidates[data.from] = [];
    }
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await fileTransferRef.push({
        type: 'webrtc-answer',
        from: myUserId,
        to: data.from,
        sdp: answer.sdp
    });
    
    console.log('Sent WebRTC answer to', data.from);
}

async function handleWebRTCAnswer(data) {
    // Sender receives answer from receiver
    console.log('Received WebRTC answer from', data.from);
    const pc = peerConnections[data.from];
    
    if (!pc) {
        console.log('No peer connection for', data.from);
        return;
    }
    
    // Check if we can accept an answer (must be in have-local-offer state)
    if (pc.signalingState !== 'have-local-offer') {
        console.log('Cannot set answer in state:', pc.signalingState);
        return;
    }
    
    try {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        console.log('Set remote description successfully');
        
        // Add any buffered ICE candidates
        if (pendingFileIceCandidates[data.from] && pendingFileIceCandidates[data.from].length > 0) {
            console.log('Adding', pendingFileIceCandidates[data.from].length, 'buffered ICE candidates');
            for (const candidate of pendingFileIceCandidates[data.from]) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.warn('Failed to add buffered ICE candidate:', e);
                }
            }
            pendingFileIceCandidates[data.from] = [];
        }
    } catch (e) {
        console.error('Failed to set remote description:', e);
    }
}

async function handleIceCandidate(data) {
    logIceCandidate(data.candidate, 'IN');
    
    const pc = peerConnections[data.from];
    if (pc && pc.remoteDescription) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log('✅ Added ICE candidate');
        } catch (e) {
            console.warn('Failed to add ICE candidate:', e);
        }
    } else {
        // Buffer the ICE candidate until remote description is set
        if (!pendingFileIceCandidates[data.from]) {
            pendingFileIceCandidates[data.from] = [];
        }
        pendingFileIceCandidates[data.from].push(data.candidate);
        console.log('📦 Buffered ICE candidate for', data.from);
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
        try {
            setupScreenshare(noteName);
        } catch (e) { console.warn('Screenshare setup failed:', e); }
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
    const screenshareContainer = $('screenshareContainer');
    
    if (monacoContainer) monacoContainer.style.display = view === 'code' ? 'block' : 'none';
    if (screenshareContainer) screenshareContainer.classList.toggle('active', view === 'screenshare');
    
    // Focus editor if code view
    if (view === 'code' && editor) {
        setTimeout(() => editor.focus(), 100);
    }
}

// ==========================================
// Screenshare & Camera Share (WebRTC)
// ==========================================
let localStream = null;
let isSharing = false;
let screenshareRef = null;
let screensharePeers = {};
let remoteSharerInfo = null;
let pendingIceCandidates = {};

// Setup screenshare signaling
function setupScreenshare(note) {
    screenshareRef = db.ref(`screenshare/${sanitize(note)}`);
    
    // Listen for screenshare status changes
    screenshareRef.child('active').on('value', snap => {
        const data = snap.val();
        if (data && data.sharerId !== myUserId) {
            // Someone else is sharing
            remoteSharerInfo = data;
            showLiveIndicator(data.sharerName, data.type);
            
            // Auto-switch to screenshare view
            switchView('screenshare');
            updatePlaceholderForViewing(data.sharerName, data.type);
            
            // Request the sharer to send us an offer
            console.log('Requesting screenshare offer from', data.sharerId);
            screenshareRef.child('signals').push({
                type: 'request-offer',
                from: myUserId,
                to: data.sharerId,
                timestamp: Date.now()
            });
            
        } else if (!data && remoteSharerInfo) {
            // Sharing stopped
            hideLiveIndicator();
            remoteSharerInfo = null;
            hideRemoteVideo();
        } else if (data && data.sharerId === myUserId) {
            // We are the sharer - show live indicator for ourselves
            showLiveIndicator(myUserName, data.type);
        }
    });
    
    // Listen for WebRTC signaling
    screenshareRef.child('signals').on('child_added', async snap => {
        const data = snap.val();
        if (!data || data.to !== myUserId) return;
        
        console.log('Screenshare signal:', data.type, 'from', data.from);
        
        try {
            if (data.type === 'request-offer') {
                // Someone wants us to send them an offer
                if (isSharing && localStream) {
                    console.log('Sending offer to requesting user', data.from);
                    await createScreenShareOffer(data.from);
                }
            } else if (data.type === 'offer') {
                await handleScreenShareOffer(data);
            } else if (data.type === 'answer') {
                await handleScreenShareAnswer(data);
            } else if (data.type === 'ice') {
                await handleScreenShareIce(data);
            }
        } catch (e) {
            console.error('Screenshare signal error:', e);
        }
        
        snap.ref.remove();
    });
}

function showLiveIndicator(name, type) {
    const indicator = $('liveIndicator');
    const userEl = $('liveUser');
    if (indicator) {
        indicator.style.display = 'flex';
        if (userEl) userEl.textContent = `• ${name} (${type === 'camera' ? '📷' : '🖥️'})`;
    }
}

function hideLiveIndicator() {
    const indicator = $('liveIndicator');
    if (indicator) indicator.style.display = 'none';
}

function updatePlaceholderForViewing(name, type) {
    const placeholder = $('screensharePlaceholder');
    const text = $('placeholderText');
    const sub = $('placeholderSub');
    const icon = document.querySelector('.screenshare-placeholder-icon');
    
    if (placeholder) placeholder.style.display = 'flex';
    if (icon) icon.textContent = '⏳';
    if (text) text.textContent = `Connecting to ${name}'s ${type === 'camera' ? 'camera' : 'screen'}...`;
    if (sub) sub.textContent = 'Please wait while the connection is established';
}

function resetPlaceholder() {
    const placeholder = $('screensharePlaceholder');
    const text = $('placeholderText');
    const sub = $('placeholderSub');
    const icon = document.querySelector('.screenshare-placeholder-icon');
    
    if (placeholder) placeholder.style.display = 'flex';
    if (icon) icon.textContent = '🖥️';
    if (text) text.textContent = 'Click to share your screen or camera';
    if (sub) sub.textContent = 'Other users will see your stream in real-time';
}

async function startScreenShare() {
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
        });
        
        await startSharing('screen');
    } catch (err) {
        console.error('Screen share failed:', err);
        if (err.name !== 'AbortError') {
            showToast('Failed to start screen sharing');
        }
    }
}

async function startCameraShare() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        
        await startSharing('camera');
    } catch (err) {
        console.error('Camera share failed:', err);
        showToast('Failed to access camera');
    }
}

async function startSharing(type) {
    // Show local preview
    const localVideo = $('localVideo');
    const placeholder = $('screensharePlaceholder');
    
    if (localVideo) {
        localVideo.srcObject = localStream;
        localVideo.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
    
    // Update UI
    $('startShareBtn')?.style && ($('startShareBtn').style.display = 'none');
    $('startCameraBtn')?.style && ($('startCameraBtn').style.display = 'none');
    $('stopShareBtn')?.style && ($('stopShareBtn').style.display = 'flex');
    
    isSharing = true;
    
    // Broadcast that we're sharing
    await screenshareRef.child('active').set({
        sharerId: myUserId,
        sharerName: myUserName,
        type: type,
        startedAt: Date.now()
    });
    
    showLiveIndicator(myUserName, type);
    
    // Handle stream ending
    localStream.getVideoTracks()[0].onended = () => stopScreenShare();
    
    // Send offer to all online users
    Object.keys(collaborators).forEach(peerId => {
        createScreenShareOffer(peerId);
    });
    
    showToast(`${type === 'camera' ? 'Camera' : 'Screen'} sharing started`);
}

async function createScreenShareOffer(peerId) {
    console.log('Creating screenshare offer for', peerId);
    
    // Close existing connection if any
    if (screensharePeers[peerId]) {
        try { screensharePeers[peerId].close(); } catch(e) {}
    }
    
    const pc = new RTCPeerConnection(rtcConfig);
    screensharePeers[peerId] = pc;
    pendingIceCandidates[peerId] = [];
    
    // Add local stream
    if (!localStream) {
        console.error('No local stream to share');
        return;
    }
    
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });
    
    // ICE candidates
    pc.onicecandidate = e => {
        if (e.candidate) {
            logIceCandidate(e.candidate, 'OUT (sharer)');
            screenshareRef.child('signals').push({
                type: 'ice',
                from: myUserId,
                to: peerId,
                candidate: e.candidate.toJSON()
            });
        }
    };
    
    pc.oniceconnectionstatechange = () => {
        console.log('Screenshare ICE state for', peerId, ':', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected') {
            console.log('✅ Screenshare connected to', peerId);
        }
        if (pc.iceConnectionState === 'failed') {
            console.error('❌ Screenshare failed to', peerId);
        }
    };
    
    pc.onicegatheringstatechange = () => {
        console.log('Screenshare ICE gathering:', pc.iceGatheringState);
    };
    
    // Create and send offer
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        await screenshareRef.child('signals').push({
            type: 'offer',
            from: myUserId,
            to: peerId,
            sdp: offer.sdp
        });
        console.log('Sent screenshare offer to', peerId);
    } catch (e) {
        console.error('Failed to create screenshare offer:', e);
    }
}

async function handleScreenShareOffer(data) {
    console.log('Handling screenshare offer from', data.from);
    
    // Close existing connection if any
    if (screensharePeers[data.from]) {
        try { screensharePeers[data.from].close(); } catch(e) {}
    }
    
    const pc = new RTCPeerConnection(rtcConfig);
    screensharePeers[data.from] = pc;
    pendingIceCandidates[data.from] = [];
    
    // Handle incoming stream
    pc.ontrack = e => {
        console.log('Received remote track:', e.track.kind);
        const remoteVideo = $('remoteVideo');
        const placeholder = $('screensharePlaceholder');
        
        if (remoteVideo && e.streams[0]) {
            remoteVideo.srcObject = e.streams[0];
            remoteVideo.style.display = 'block';
            console.log('Set remote video stream');
        }
        if (placeholder) placeholder.style.display = 'none';
    };
    
    // ICE candidates
    pc.onicecandidate = e => {
        if (e.candidate) {
            logIceCandidate(e.candidate, 'OUT (viewer)');
            screenshareRef.child('signals').push({
                type: 'ice',
                from: myUserId,
                to: data.from,
                candidate: e.candidate.toJSON()
            });
        }
    };
    
    pc.oniceconnectionstatechange = () => {
        console.log('Viewer ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected') {
            console.log('✅ Viewer connected to stream!');
        }
        if (pc.iceConnectionState === 'failed') {
            console.error('❌ Viewer connection failed');
            showToast('Failed to connect to stream');
        }
    };
    
    pc.onicegatheringstatechange = () => {
        console.log('Viewer ICE gathering:', pc.iceGatheringState);
    };
    
    try {
        // Set remote description and create answer
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        console.log('Set remote description from offer');
        
        // Add any pending ICE candidates
        if (pendingIceCandidates[data.from] && pendingIceCandidates[data.from].length > 0) {
            console.log('Adding', pendingIceCandidates[data.from].length, 'pending ICE candidates');
            for (const candidate of pendingIceCandidates[data.from]) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            pendingIceCandidates[data.from] = [];
        }
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('Created and set local answer');
        
        await screenshareRef.child('signals').push({
            type: 'answer',
            from: myUserId,
            to: data.from,
            sdp: answer.sdp
        });
        console.log('Sent answer to', data.from);
    } catch (e) {
        console.error('Failed to handle screenshare offer:', e);
    }
}

async function handleScreenShareAnswer(data) {
    console.log('Handling screenshare answer from', data.from);
    const pc = screensharePeers[data.from];
    if (!pc) {
        console.log('No peer connection for', data.from);
        return;
    }
    
    if (pc.signalingState !== 'have-local-offer') {
        console.log('Cannot set answer in state:', pc.signalingState);
        return;
    }
    
    try {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        console.log('Set remote description from answer');
        
        // Add any pending ICE candidates
        if (pendingIceCandidates[data.from] && pendingIceCandidates[data.from].length > 0) {
            console.log('Adding', pendingIceCandidates[data.from].length, 'pending ICE candidates');
            for (const candidate of pendingIceCandidates[data.from]) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            pendingIceCandidates[data.from] = [];
        }
    } catch (e) {
        console.error('Failed to handle screenshare answer:', e);
    }
}

async function handleScreenShareIce(data) {
    logIceCandidate(data.candidate, 'IN (screenshare)');
    
    const pc = screensharePeers[data.from];
    if (pc && pc.remoteDescription) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log('✅ Added screenshare ICE candidate');
        } catch (e) {
            console.warn('Failed to add screenshare ICE:', e);
        }
    } else {
        // Buffer ICE candidates until remote description is set
        if (!pendingIceCandidates[data.from]) {
            pendingIceCandidates[data.from] = [];
        }
        pendingIceCandidates[data.from].push(data.candidate);
        console.log('📦 Buffered screenshare ICE candidate');
    }
}

function hideRemoteVideo() {
    const remoteVideo = $('remoteVideo');
    if (remoteVideo) {
        remoteVideo.srcObject = null;
        remoteVideo.style.display = 'none';
    }
    resetPlaceholder();
}

async function stopScreenShare() {
    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Close all peer connections
    Object.values(screensharePeers).forEach(pc => pc.close());
    screensharePeers = {};
    
    // Update UI
    const localVideo = $('localVideo');
    if (localVideo) {
        localVideo.srcObject = null;
        localVideo.style.display = 'none';
    }
    
    resetPlaceholder();
    
    $('startShareBtn')?.style && ($('startShareBtn').style.display = 'flex');
    $('startCameraBtn')?.style && ($('startCameraBtn').style.display = 'flex');
    $('stopShareBtn')?.style && ($('stopShareBtn').style.display = 'none');
    
    // Clear Firebase
    if (isSharing && screenshareRef) {
        await screenshareRef.child('active').remove();
    }
    
    hideLiveIndicator();
    isSharing = false;
    
    showToast('Sharing stopped');
}

// ==========================================
// Init
// ==========================================
async function init() {
    const params = new URLSearchParams(window.location.search);
    const note = params.get('n');

    // Test TURN connectivity in background
    testTurnConnectivity().then(result => {
        window.hasTurnRelay = result.hasRelay;
        if (!result.hasRelay) {
            console.warn('⚠️ TURN servers not available - file transfer/screenshare may not work across networks');
            console.log('💡 To fix: Sign up for free TURN at https://www.metered.ca/tools/openrelay/');
        }
    });

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

