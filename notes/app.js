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
        const previousCount = Object.keys(collaborators).length;
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
        
        const currentCount = Object.keys(collaborators).length;
        
        // Clean up our cursor data if no one else is online (saves bandwidth)
        if (currentCount === 0 && previousCount > 0) {
            cursorsRef.child(myUserId).remove();
        }
        
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
    
    // Only broadcast if other users are online (saves Firebase bandwidth)
    if (Object.keys(collaborators).length === 0) return;
    
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
});

document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown')) {
        closeAllDropdowns();
    }
});

window.addEventListener('beforeunload', () => {
    cleanupPresence();
});

$('renameInput')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') saveUserName();
});

init();

