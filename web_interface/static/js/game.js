class GameMasterDashboard {
    constructor() {
        this.socket = null;
        this.gameState = null;
        this.connected = false;
        this.serverTimeRemaining = null;
        this.displayTimeRemaining = null;
        this.lastUpdateTimestamp = null;
        this.localTimerFrame = null;
        this.connectionCheckInterval = null;
        this.disconnectGrace = null;
        this.timerState = { gameComplete: false, gameOver: false };
        this.lastRenderedTimerKey = null;
        this.localConnected = false;
        this.customMode = null;
        this.customState = { labels: {}, positions: {}, removed: {} };
        this.dragState = null;
        this.skipNextCustomClick = false;
        this.sessionKey = null;
        this.booted = false;
        this.pendingBoot = false;
        this.init();
    }

    get SESSION_LOGIN() { return 'escape_room_admin_login'; }
    get SESSION_REGISTRY() { return 'escape_room_sessions'; }
    get SESSION_MAX_AGE() { return 30 * 24 * 60 * 60 * 1000; }
    get GS() { return this.sessionKey ? 'escape_room_game_state_' + this.sessionKey : 'escape_room_game_state'; }
    get CS() { return this.sessionKey ? 'escape_room_customizer_' + this.sessionKey : 'escape_room_customizer'; }
    get CODE() { return this.sessionKey ? 'escape_room_code_' + this.sessionKey : 'escape_room_code'; }
    get HINT() { return this.sessionKey ? 'escape_room_hint_' + this.sessionKey : 'escape_room_hint'; }

    init() {
        if (!this.initLogin()) return;
        this.bootDashboard();
    }

    bootDashboard() {
        if (this.booted) return;
        this.booted = true;
        this.connectWebSocket();
        this.bindEvents();
        this.loadFromStorage();
        this.initCustomizer();
        this.initAccountPanel();
        this.startTimeSync();
        window.addEventListener('storage', (e) => {
            if (e.key === this.GS && e.newValue) {
                try { this.gameState = JSON.parse(e.newValue); this.renderGameState(); } catch {}
            }
        });
        this.connectionCheckInterval = setInterval(() => {
            if (!this.connected) this.checkConnection();
            this.updateConnectionStatus();
            const stored = localStorage.getItem(this.GS);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (JSON.stringify(parsed) !== JSON.stringify(this.gameState)) {
                        this.gameState = parsed;
                        this.renderGameState();
                    }
                } catch {}
            }
        }, 2000);
    }

    initLogin() {
        this.cleanupExpiredSessions();
        const stored = localStorage.getItem(this.SESSION_LOGIN);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed && parsed.key) {
                    if (this.isExpired(parsed.lastActive || parsed.createdAt || 0)) {
                        localStorage.removeItem(this.SESSION_LOGIN);
                    } else {
                    this.sessionKey = parsed.key;
                    this.touchSession(parsed.username, parsed.session, parsed.createdAt);
                    const registry = this.readSessionRegistry();
                    const entry = registry[parsed.key] || {};
                    if (entry.twoFactorEnabled) {
                        this.hideLogin();
                        this.pendingBoot = true;
                        this.show2FA();
                        return false;
                    }
                    this.hideLogin();
                    this.showToast('Welcome back, ' + (parsed.username || 'user') + '. Your session expires after 1 month of no activity.', 'success');
                    return true;
                    }
                }
            } catch {}
        }

        const overlay = document.getElementById('login-overlay');
        const form = document.getElementById('login-form');
        if (!overlay || !form) return true;
        overlay.style.display = 'flex';
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value.trim();
            const session = document.getElementById('login-session').value.trim();
            const error = document.getElementById('login-error');
            if (!username || !password || !session) {
                if (error) error.textContent = 'Fill in username, password, and session name.';
                return;
            }
            this.sessionKey = this.makeSessionKey(username, password, session);
            this.touchSession(username, session);
            const registry = this.readSessionRegistry();
            const entry = registry[this.sessionKey] || {};
            if (entry.twoFactorEnabled) {
                this.hideLogin();
                this.pendingBoot = true;
                this.show2FA();
                return;
            }
            this.hideLogin();
            this.showToast('Signed in as ' + username + '. Your session expires after 1 month of no activity.', 'success');
            this.bootDashboard();
        });
        return false;
    }

    hideLogin() {
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    makeSessionKey(username, password, session) {
        const source = [username, password, session].join('|').toLowerCase();
        let hash = 0;
        for (let i = 0; i < source.length; i++) hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
        return 'session-' + Math.abs(hash).toString(36);
    }

    isExpired(timestamp) {
        return !timestamp || Date.now() - Number(timestamp) > this.SESSION_MAX_AGE;
    }

    readSessionRegistry() {
        try { return JSON.parse(localStorage.getItem(this.SESSION_REGISTRY) || '{}'); }
        catch { return {}; }
    }

    writeSessionRegistry(registry) {
        localStorage.setItem(this.SESSION_REGISTRY, JSON.stringify(registry));
    }

    touchSession(username, session, createdAt) {
        if (!this.sessionKey) return;
        const now = Date.now();
        const registry = this.readSessionRegistry();
        const existing = registry[this.sessionKey] || {};
        const entry = {
            key: this.sessionKey,
            username: username || existing.username || '',
            session: session || existing.session || '',
            createdAt: createdAt || existing.createdAt || now,
            lastActive: now,
            twoFactorEnabled: existing.twoFactorEnabled || false
        };
        registry[this.sessionKey] = entry;
        this.writeSessionRegistry(registry);
        localStorage.setItem(this.SESSION_LOGIN, JSON.stringify(entry));
    }

    cleanupExpiredSessions() {
        const registry = this.readSessionRegistry();
        let changed = false;
        Object.keys(registry).forEach(key => {
            if (!this.isExpired(registry[key].lastActive || registry[key].createdAt)) return;
            this.removeSessionData(key);
            delete registry[key];
            changed = true;
        });
        if (changed) this.writeSessionRegistry(registry);

        const current = localStorage.getItem(this.SESSION_LOGIN);
        if (current) {
            try {
                const parsed = JSON.parse(current);
                if (parsed && this.isExpired(parsed.lastActive || parsed.createdAt)) localStorage.removeItem(this.SESSION_LOGIN);
            } catch { localStorage.removeItem(this.SESSION_LOGIN); }
        }
    }

    removeSessionData(key) {
        localStorage.removeItem('escape_room_game_state_' + key);
        localStorage.removeItem('escape_room_customizer_' + key);
        localStorage.removeItem('escape_room_code_' + key);
        localStorage.removeItem('escape_room_hint_' + key);
        Object.keys(localStorage).forEach(storageKey => {
            if (storageKey.startsWith('escape_room_pairing_') && localStorage.getItem(storageKey) === key) {
                localStorage.removeItem(storageKey);
            }
        });
    }

    loadFromStorage() {
        const stored = localStorage.getItem(this.GS);
        if (stored) {
            try {
                this.gameState = JSON.parse(stored);
                if (this.gameState.game_complete || this.gameState.game_over) {
                    this.gameState = this.buildDefaultState();
                } else {
                    this.gameState.start_time = null;
                    this.gameState.game_active = false;
                    this.gameState.time_remaining = 5400;
                    this.gameState.game_complete = false;
                    this.gameState.game_over = false;
                    this.gameState.paused = false;
                }
                if (this.gameState.time_remaining !== undefined) {
                    this.serverTimeRemaining = this.gameState.time_remaining;
                    this.displayTimeRemaining = this.gameState.time_remaining;
                    this.timerState.gameComplete = Boolean(this.gameState.game_complete);
                    this.timerState.gameOver = Boolean(this.gameState.game_over);
                }
                this.saveToStorage();
                this.renderGameState();
            } catch {}
        }
    }

    saveToStorage() {
        if (this.gameState) localStorage.setItem(this.GS, JSON.stringify(this.gameState));
        this.touchSession();
    }

    buildDefaultState() {
        const rooms = {
            room1: {
                id: 'room1', name: 'Room 1', door_locked: true, status: 'locked',
                dragon_awake: false, current_room: true,
                puzzles: {
                    hidden_message: { id: 'hidden_message', name: 'Hidden Message', status: 'available' },
                    cabinet_search: { id: 'cabinet_search', name: 'Cabinet Search', status: 'locked' },
                    invisible_ink: { id: 'invisible_ink', name: 'Invisible Ink', status: 'locked' },
                    math_challenge: { id: 'math_challenge', name: 'Math Challenge', status: 'locked' },
                    shower_mechanism: { id: 'shower_mechanism', name: 'Shower Mechanism', status: 'locked' },
                    website_riddle: { id: 'website_riddle', name: 'Website Riddle', status: 'locked' }
                }
            },
            room2: {
                id: 'room2', name: 'Room 2', door_locked: true, status: 'locked',
                dragon_awake: false, current_room: false,
                puzzles: {
                    under_bed: { id: 'under_bed', name: 'Under the Bed', status: 'locked' },
                    number_lock: { id: 'number_lock', name: 'Number Lock', status: 'locked' },
                    jigsaw_puzzle: { id: 'jigsaw_puzzle', name: 'Jigsaw Puzzle', status: 'locked' },
                    password: { id: 'password', name: 'Final Password', status: 'locked' }
                }
            },
            room3: {
                id: 'room3', name: 'Room 3', door_locked: true, status: 'locked',
                dragon_awake: false, current_room: false,
                puzzles: {
                    mirror_clue: { id: 'mirror_clue', name: 'Mirror Clue', status: 'locked' },
                    hidden_key: { id: 'hidden_key', name: 'Hidden Key', status: 'locked' },
                    color_box: { id: 'color_box', name: 'Color-coded Box', status: 'locked' },
                    exit_door: { id: 'exit_door', name: 'Exit Door', status: 'locked' }
                }
            }
        };
        return {
            game_id: 'local_' + Date.now(),
            start_time: null, end_time: null, time_remaining: 5400,
            game_active: false,
            hints_remaining: 5, hints_used: 0,
            game_complete: false, game_over: false, paused: false,
            current_room: 'room1', rooms: rooms
        };
    }

    connectWebSocket() {
        if (!window.io || location.hostname.endsWith('github.io') || (location.port && location.port !== '5000')) return;
        this.socket = io();
        this.socket.on('connect', () => {
            if (this.disconnectGrace) { clearTimeout(this.disconnectGrace); this.disconnectGrace = null; }
            this.connected = true;
            this.updateConnectionStatus();
            this.showToast('Connected to game server', 'success');
        });
        this.socket.on('disconnect', () => {
            this.disconnectGrace = setTimeout(() => {
                this.connected = false;
                this.updateConnectionStatus();
                this.showToast('Disconnected from game server', 'error');
            }, 3000);
        });
        this.socket.on('connected', () => {});
        this.socket.on('game_state', (state) => {
            this.gameState = state;
            this.syncTimer(state.time_remaining, state.game_complete, state.game_over);
            this.renderGameState();
        });
        this.socket.on('time_update', (data) => {
            if (this.gameState) {
                this.gameState.time_remaining = data.time_remaining;
                this.gameState.game_complete = data.game_complete;
                this.gameState.game_over = data.game_over;
            }
            this.syncTimer(data.time_remaining, data.game_complete, data.game_over);
        });
        this.socket.on('game_started', () => {});
        this.socket.on('game_reset', () => {});
        this.socket.on('hint_used', (data) => {
            if (this.gameState) { this.gameState.hints_remaining = data.hints_remaining; this.gameState.hints_used = data.hints_used; }
            this.updateHints(data.hints_remaining, data.hints_used);
        });
        this.socket.on('puzzle_solved', (data) => {
            if (data.game_complete) this.showToast('Players escaped!', 'success');
        });
        this.socket.on('door_unlocked', (data) => {
            this.showToast('Door to ' + data.room_id + ' unlocked!', 'success');
        });
        this.socket.on('dragon_woke', () => {
            document.getElementById('dragon-alert').style.display = 'block';
            this.showToast('Dragon is awake!', 'warning');
        });
        this.socket.on('dragon_calmed', () => {
            document.getElementById('dragon-alert').style.display = 'none';
        });
    }

    bindEvents() {
        document.getElementById('btn-start').addEventListener('click', () => this.startGame());
        document.getElementById('btn-reset').addEventListener('click', () => this.resetGame());
        document.getElementById('btn-hint').addEventListener('click', () => this.giveHint());
        document.getElementById('btn-dragon').addEventListener('click', () => this.wakeDragon());
        document.getElementById('btn-calm-dragon').addEventListener('click', () => this.calmDragon());
        document.getElementById('btn-upload-video').addEventListener('click', () => this.uploadVideo());
        document.getElementById('btn-start-video').addEventListener('click', () => this.startVideoOnPlayers());
        document.getElementById('btn-generate-code').addEventListener('click', () => this.generateCode());
    }

    tryServerThen(method, body, fallback) {
        fetch('/api/game/' + method, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
        }).then(r => r.json()).then(d => { if (!d.success && fallback) fallback(); }).catch(() => { if (fallback) fallback(); });
    }

    startGame() {
        const doStart = () => {
            if (!this.gameState) this.gameState = this.buildDefaultState();
            this.gameState.start_time = Date.now() / 1000;
            this.gameState.time_remaining = 5400;
            this.gameState.game_active = true;
            this.gameState.game_complete = false;
            this.gameState.game_over = false;
            this.timerState = { gameComplete: false, gameOver: false };
            this.syncTimer(this.gameState.time_remaining, false, false);
            this.renderGameState();
            this.saveToStorage();
            this.showToast('Game started!', 'success');
        };
        if (this.connected) this.tryServerThen('start', null, doStart);
        else doStart();
    }

    resetGame() {
        if (!confirm('Are you sure you want to reset the game?')) return;
        const doReset = () => {
            this.gameState = this.buildDefaultState();
            this.timerState = { gameComplete: false, gameOver: false };
            this.serverTimeRemaining = 5400;
            this.displayTimeRemaining = 5400;
            this.lastUpdateTimestamp = null;
            this.stopLocalTimer();
            this.updateTimer(5400, false, false);
            this.renderGameState();
            this.saveToStorage();
            this.showToast('Game reset', 'warning');
        };
        if (this.connected) this.tryServerThen('reset', null, doReset);
        else doReset();
    }

    solvePuzzle(roomId, puzzleId) {
        const doSolve = () => {
            if (!this.gameState || !this.gameState.rooms[roomId]) return;
            const puzzle = this.gameState.rooms[roomId].puzzles[puzzleId];
            if (!puzzle || puzzle.status === 'solved') return;
            puzzle.status = 'solved';
            this.renderGameState();
            this.saveToStorage();
            this.showToast('Puzzle solved! ' + puzzle.name, 'success');
        };
        if (this.connected) this.tryServerThen('puzzle/solve', { room_id: roomId, puzzle_id: puzzleId }, doSolve);
        else doSolve();
    }

    giveHint() {
        const doHint = () => {
            if (!this.gameState || this.gameState.hints_remaining <= 0) return;
            const message = prompt('Write your message in the box below:');
            if (!message || !message.trim()) return;
            this.gameState.hints_remaining--;
            this.gameState.hints_used = (this.gameState.hints_used || 0) + 1;
            this.updateHints(this.gameState.hints_remaining, this.gameState.hints_used);
            if (this.isGameRunning()) {
                this.gameState.time_remaining = Math.floor(this.getCurrentTimerSeconds());
                this.displayTimeRemaining = this.gameState.time_remaining;
                this.lastUpdateTimestamp = performance.now();
            }
            this.saveToStorage();
            localStorage.setItem(this.HINT, JSON.stringify({ id: Date.now(), message: message.trim() }));
            this.showToast('Hint sent! ' + this.gameState.hints_remaining + ' left', 'success');
        };
        if (this.connected) this.tryServerThen('hint', null, doHint);
        else doHint();
    }

    wakeDragon() {
        const doWake = () => {
            if (!this.gameState || !this.gameState.rooms.room3) return;
            this.gameState.rooms.room3.dragon_awake = true;
            document.getElementById('dragon-alert').style.display = 'block';
            this.saveToStorage();
            this.showToast('Dragon woke up!', 'warning');
        };
        if (this.connected) this.tryServerThen('dragon/wake', null, doWake);
        else doWake();
    }

    calmDragon() {
        const doCalm = () => {
            if (!this.gameState || !this.gameState.rooms.room3) return;
            this.gameState.rooms.room3.dragon_awake = false;
            document.getElementById('dragon-alert').style.display = 'none';
            this.saveToStorage();
            this.showToast('Dragon calmed down', 'success');
        };
        if (this.connected) this.tryServerThen('dragon/calm', null, doCalm);
        else doCalm();
    }

    uploadVideo() {
        const fileInput = document.getElementById('video-file-input');
        const file = fileInput.files[0];
        if (!file) { this.showToast('Select a video file', 'warning'); return; }
        const formData = new FormData();
        formData.append('video', file);
        document.getElementById('video-status').textContent = 'Uploading...';
        fetch('/api/video/upload', { method: 'POST', body: formData })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    document.getElementById('video-status').textContent = 'Video: ' + d.filename;
                    this.showToast('Video uploaded', 'success');
                }
            })
            .catch(() => this.showToast('Upload failed (static mode)', 'error'));
    }

    startVideoOnPlayers() {
        if (!this.socket) { this.showToast('Video broadcast needs the local server', 'warning'); return; }
        this.socket.emit('play_video', {});
        this.showToast('Video broadcast started', 'success');
    }

    generateCode() {
        const code = Math.random().toString(36).substring(2, 8);
        localStorage.setItem('escape_room_code', code);
        localStorage.setItem(this.CODE, code);
        localStorage.setItem('escape_room_pairing_' + code, this.sessionKey || 'default');
        this.localConnected = true;
        this.gameState = this.buildDefaultState();
        this.timerState = { gameComplete: false, gameOver: false };
        this.serverTimeRemaining = 5400;
        this.displayTimeRemaining = 5400;
        this.lastUpdateTimestamp = null;
        this.stopLocalTimer();
        this.updateTimer(5400, false, false);
        this.renderGameState();
        this.saveToStorage();
        document.getElementById('pairing-code').textContent = code;
        document.getElementById('code-display').style.display = 'block';
        this.updateConnectionStatus();
        this.showToast('Code: ' + code, 'success');
        fetch('/api/pairing/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => {});
    }

    checkConnection() {
        if (!this.connected && this.socket) this.socket.connect();
    }

    syncTimer(secondsRemaining, gameComplete, gameOver) {
        const n = Number.isFinite(secondsRemaining) ? Math.max(0, secondsRemaining) : 0;
        this.serverTimeRemaining = n;
        this.displayTimeRemaining = n;
        this.timerState.gameComplete = Boolean(gameComplete);
        this.timerState.gameOver = Boolean(gameOver);
        this.lastUpdateTimestamp = this.isGameRunning() ? performance.now() : null;
        this.updateTimer(this.getCurrentTimerSeconds(), this.timerState.gameComplete, this.timerState.gameOver);
        if (this.shouldRunLocalTimer()) this.startLocalTimer();
        else this.stopLocalTimer();
    }

    isGameRunning() {
        return Boolean(this.gameState && this.gameState.game_active && this.gameState.start_time && !this.gameState.game_complete && !this.gameState.game_over && !this.gameState.paused);
    }

    shouldRunLocalTimer() {
        return this.isGameRunning() && !this.timerState.gameComplete && !this.timerState.gameOver && this.displayTimeRemaining > 0;
    }

    getCurrentTimerSeconds() {
        if (this.displayTimeRemaining === null || this.displayTimeRemaining === undefined) return 0;
        if (this.lastUpdateTimestamp === null) return Math.max(0, this.displayTimeRemaining);
        return Math.max(0, this.displayTimeRemaining - (performance.now() - this.lastUpdateTimestamp) / 1000);
    }

    startLocalTimer() {
        if (this.localTimerFrame !== null) return;
        const tick = () => {
            const s = this.getCurrentTimerSeconds();
            const g = this.timerState.gameOver || (!this.timerState.gameComplete && this.isGameRunning() && s <= 0);
            this.updateTimer(s, this.timerState.gameComplete, g);
            if (!this.isGameRunning() || this.timerState.gameComplete || g) { this.stopLocalTimer(); return; }
            this.localTimerFrame = requestAnimationFrame(tick);
        };
        this.localTimerFrame = requestAnimationFrame(tick);
    }

    stopLocalTimer() {
        if (this.localTimerFrame !== null) { cancelAnimationFrame(this.localTimerFrame); this.localTimerFrame = null; }
    }

    updateTimer(secondsRemaining, gameComplete, gameOver) {
        const safe = Math.max(0, Math.floor(secondsRemaining));
        const key = safe + ':' + gameComplete + ':' + gameOver + ':' + this.isGameRunning();
        if (this.lastRenderedTimerKey === key) return;
        this.lastRenderedTimerKey = key;
        document.getElementById('time-remaining').textContent =
            String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(Math.floor(safe % 60)).padStart(2, '0');
        const st = document.getElementById('game-status');
        const sb = document.getElementById('game-status-sub');
        if (gameComplete) { st.textContent = 'Escaped!'; st.style.color = '#00b09b'; sb.textContent = 'Players escaped!'; }
        else if (gameOver) { st.textContent = "Time's Up!"; st.style.color = '#ff416c'; sb.textContent = 'Game over'; }
        else if (this.isGameRunning()) { st.textContent = 'In Progress'; st.style.color = '#4cc9f0'; sb.textContent = 'Game running'; }
        else { st.textContent = 'Ready'; st.style.color = '#a0a0a0'; sb.textContent = 'Click Start to begin'; }
        const te = document.getElementById('time-remaining');
        if (safe < 300) { te.style.color = '#ff416c'; te.style.animation = safe < 60 ? 'pulse 1s infinite' : 'none'; }
        else if (safe < 900) { te.style.color = '#f46b45'; te.style.animation = 'none'; }
        else { te.style.color = '#e94560'; te.style.animation = 'none'; }
    }

    updateHints(remaining, used) {
        document.getElementById('hints-remaining').textContent = remaining || 0;
        document.getElementById('hints-used').textContent = used || 0;
    }

    startTimeSync() {
        this._timeSyncInterval = setInterval(() => {
            if (!this.isGameRunning() || !this.gameState) return;
            const now = Math.floor(this.getCurrentTimerSeconds());
            if (this.gameState.time_remaining !== now) {
                this.gameState.time_remaining = now;
                this.saveToStorage();
            }
        }, 1000);
    }

    renderGameState() {
        if (!this.gameState) return;
        this.updateTimer(this.getCurrentTimerSeconds(), this.timerState.gameComplete, this.timerState.gameOver);
        this.updateHints(this.gameState.hints_remaining, this.gameState.hints_used);
        const currentRoom = this.gameState.current_room;
        if (currentRoom && this.gameState.rooms[currentRoom]) {
            document.getElementById('current-room').textContent = this.gameState.rooms[currentRoom].name;
        }
        this.renderRooms();
        const room3 = this.gameState.rooms.room3;
        if (room3 && room3.dragon_awake) document.getElementById('dragon-alert').style.display = 'block';
        else document.getElementById('dragon-alert').style.display = 'none';
    }

    renderRooms() {
        const container = document.getElementById('rooms-container');
        container.replaceChildren();
        Object.values(this.gameState.rooms).forEach(room => container.appendChild(this.createRoomElement(room)));
    }

    createRoomElement(room) {
        const div = document.createElement('div');
        div.className = 'room-card' + (room.id === this.gameState.current_room ? ' active' : '') + (room.status === 'complete' ? ' complete' : '');
        let statusClass = 'status-locked', statusText = 'Locked';
        if (room.door_locked === false) { statusClass = 'status-unlocked'; statusText = 'Unlocked'; }
        if (room.status === 'complete') { statusClass = 'status-complete'; statusText = 'Complete'; }
        div.innerHTML = `
            <div class="room-header">
                <div class="room-title"><h3>${room.name}</h3></div>
                <div class="room-status ${statusClass}">${statusText}</div>
            </div>
            <div class="puzzles">${Object.values(room.puzzles).map(p => this.createPuzzleElement(p, room.id)).join('')}</div>`;
        setTimeout(() => {
            div.querySelectorAll('.solve-puzzle-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.solvePuzzle(e.target.dataset.room, e.target.dataset.puzzle);
                });
            });
        }, 0);
        return div;
    }

    createPuzzleElement(puzzle, roomId) {
        const cls = puzzle.status === 'solved' ? ' solved' : puzzle.status === 'available' ? ' available' : '';
        return `
            <div class="puzzle-item${cls}">
                <div class="puzzle-info"><h4>${puzzle.name}</h4><div class="puzzle-id">ID: ${puzzle.id}</div></div>
                <div class="puzzle-actions">${puzzle.status === 'solved' ? '<span style="color:#00b09b;font-weight:bold;">\u2713 Solved</span>' : '<button class="solve-puzzle-btn" data-room="' + roomId + '" data-puzzle="' + puzzle.id + '">Mark Solved</button>'}</div>
            </div>`;
    }

    updateConnectionStatus() {
        const el = document.getElementById('connection-status');
        if (!el) return;
        if (this.connected || this.localConnected) {
            el.className = 'connection-status connected';
            el.innerHTML = '\u{1F7E2} Connected';
        } else {
            el.className = 'connection-status disconnected';
            el.innerHTML = '\u{1F534} Disconnected';
        }
    }

    initCustomizer() {
        this.loadCustomizerState();
        this.applyCustomizerState();
        const toggle = document.getElementById('settings-toggle');
        const panel = document.getElementById('customizer-panel');
        if (!toggle || !panel) return;

        toggle.addEventListener('click', () => {
            panel.classList.toggle('open');
            if (!panel.classList.contains('open')) this.clearCustomMode();
            this.renderInventory();
        });
        document.getElementById('custom-rename').addEventListener('click', () => this.setCustomMode('rename'));
        document.getElementById('custom-move').addEventListener('click', () => this.setCustomMode('move'));
        document.getElementById('custom-remove').addEventListener('click', () => this.setCustomMode('remove'));
        document.getElementById('custom-reset').addEventListener('click', () => this.resetCustomizer());

        document.addEventListener('click', (e) => this.handleCustomClick(e), true);
        document.addEventListener('pointerdown', (e) => this.startCustomDrag(e), true);
        document.addEventListener('pointermove', (e) => this.moveCustomDrag(e), true);
        document.addEventListener('pointerup', () => this.endCustomDrag(), true);
        this.renderInventory();
    }

    loadCustomizerState() {
        try {
            const stored = JSON.parse(localStorage.getItem(this.CS) || '{}');
            this.customState = {
                labels: stored.labels || {},
                positions: stored.positions || {},
                removed: stored.removed || {}
            };
        } catch {
            this.customState = { labels: {}, positions: {}, removed: {} };
        }
    }

    saveCustomizerState() {
        localStorage.setItem(this.CS, JSON.stringify(this.customState));
    }

    customizableElements() {
        return Array.from(document.querySelectorAll('[data-custom-id]'));
    }

    getCustomElement(id) {
        return document.querySelector('[data-custom-id="' + id + '"]');
    }

    applyCustomizerState() {
        this.customizableElements().forEach(el => {
            const id = el.dataset.customId;
            if (!el.dataset.defaultLabel) el.dataset.defaultLabel = el.textContent.trim();
            el.textContent = this.customState.labels[id] || el.dataset.defaultLabel;
            el.classList.toggle('custom-hidden', Boolean(this.customState.removed[id]));
            const pos = this.customState.positions[id];
            if (pos) {
                el.style.position = 'fixed';
                el.style.left = pos.left + 'px';
                el.style.top = pos.top + 'px';
                el.style.zIndex = '1050';
                el.style.margin = '0';
            } else {
                el.style.position = '';
                el.style.left = '';
                el.style.top = '';
                el.style.zIndex = '';
                el.style.margin = '';
            }
        });
    }

    setCustomMode(mode) {
        this.customMode = this.customMode === mode ? null : mode;
        if (!this.customMode) { this.clearCustomMode(); return; }
        document.querySelectorAll('#customizer-panel .customizer-actions button').forEach(btn => btn.classList.remove('active'));
        if (this.customMode) document.getElementById('custom-' + this.customMode).classList.add('active');
        this.customizableElements().forEach(el => el.classList.toggle('customizable-selecting', Boolean(this.customMode)));
        this.showToast(this.customMode ? 'Editor mode: ' + this.customMode : 'Editor mode off', 'info');
    }

    clearCustomMode() {
        this.customMode = null;
        this.dragState = null;
        this.skipNextCustomClick = false;
        document.querySelectorAll('#customizer-panel .customizer-actions button').forEach(btn => btn.classList.remove('active'));
        this.customizableElements().forEach(el => {
            el.classList.remove('customizable-selecting');
            el.classList.remove('customizable-moving');
        });
    }

    handleCustomClick(e) {
        const el = e.target.closest('[data-custom-id]');
        if (!el || !this.customMode) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.skipNextCustomClick) { this.skipNextCustomClick = false; return; }

        const id = el.dataset.customId;
        if (this.customMode === 'rename') {
            const label = prompt('Rename this item:', el.textContent.trim());
            if (!label || !label.trim()) return;
            this.customState.labels[id] = label.trim();
            if (this.isGameRunning()) {
                this.gameState.time_remaining = Math.floor(this.getCurrentTimerSeconds());
                this.displayTimeRemaining = this.gameState.time_remaining;
                this.lastUpdateTimestamp = performance.now();
            }
            this.saveCustomizerState();
            this.applyCustomizerState();
            this.showToast('Renamed', 'success');
        } else if (this.customMode === 'remove') {
            this.customState.removed[id] = true;
            this.saveCustomizerState();
            this.applyCustomizerState();
            this.renderInventory();
            this.showToast('Moved to gear inventory', 'warning');
        }
    }

    startCustomDrag(e) {
        if (this.customMode !== 'move') return;
        const el = e.target.closest('[data-custom-id]');
        if (!el || el.classList.contains('custom-hidden')) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = el.getBoundingClientRect();
        this.dragState = { el, startX: e.clientX, startY: e.clientY, left: rect.left, top: rect.top, moved: false };
        el.classList.add('customizable-moving');
        el.setPointerCapture?.(e.pointerId);
    }

    moveCustomDrag(e) {
        if (!this.dragState) return;
        e.preventDefault();
        const dx = e.clientX - this.dragState.startX;
        const dy = e.clientY - this.dragState.startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.dragState.moved = true;
        const left = Math.max(0, Math.min(window.innerWidth - this.dragState.el.offsetWidth, this.dragState.left + dx));
        const top = Math.max(0, Math.min(window.innerHeight - this.dragState.el.offsetHeight, this.dragState.top + dy));
        this.dragState.el.style.position = 'fixed';
        this.dragState.el.style.left = left + 'px';
        this.dragState.el.style.top = top + 'px';
        this.dragState.el.style.zIndex = '1050';
        this.dragState.el.style.margin = '0';
    }

    endCustomDrag() {
        if (!this.dragState) return;
        const id = this.dragState.el.dataset.customId;
        const rect = this.dragState.el.getBoundingClientRect();
        this.customState.positions[id] = { left: Math.round(rect.left), top: Math.round(rect.top) };
        this.dragState.el.classList.remove('customizable-moving');
        this.saveCustomizerState();
        if (this.dragState.moved) this.skipNextCustomClick = true;
        this.dragState = null;
    }

    renderInventory() {
        const inventory = document.getElementById('custom-inventory');
        if (!inventory) return;
        const removed = Object.keys(this.customState.removed).filter(id => this.customState.removed[id]);
        if (!removed.length) {
            inventory.innerHTML = '<div class="inventory-empty">Removed controls appear here.</div>';
            return;
        }
        inventory.replaceChildren();
        removed.forEach(id => {
            const el = this.getCustomElement(id);
            const item = document.createElement('div');
            item.className = 'inventory-item';
            const label = document.createElement('span');
            label.textContent = this.customState.labels[id] || el?.dataset.defaultLabel || id;
            const restore = document.createElement('button');
            restore.type = 'button';
            restore.textContent = 'Restore';
            restore.addEventListener('click', () => {
                delete this.customState.removed[id];
                this.saveCustomizerState();
                this.applyCustomizerState();
                this.renderInventory();
            });
            item.append(label, restore);
            inventory.appendChild(item);
        });
    }

    resetCustomizer() {
        if (!confirm('Reset all renamed, moved, and removed controls?')) return;
        this.customState = { labels: {}, positions: {}, removed: {} };
        this.saveCustomizerState();
        this.applyCustomizerState();
        this.renderInventory();
        this.clearCustomMode();
    }

    initAccountPanel() {
        const toggle = document.getElementById('account-toggle');
        const panel = document.getElementById('account-panel');
        if (!toggle || !panel) return;
        toggle.addEventListener('click', () => {
            panel.classList.toggle('open');
            if (panel.classList.contains('open')) this.refreshAccountPanel();
        });
        document.getElementById('account-rename').addEventListener('click', () => this.renameAccount());
        document.getElementById('account-password').addEventListener('click', () => this.changePassword());
        document.getElementById('account-2fa-toggle').addEventListener('click', () => this.toggle2FA());
        document.getElementById('account-signout').addEventListener('click', () => this.signOut());
        document.getElementById('account-delete').addEventListener('click', () => this.deleteAccount());
        document.getElementById('btn-twofa-submit').addEventListener('click', () => this.verify2FA());
        document.getElementById('twofa-code').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.verify2FA();
        });
    }

    refreshAccountPanel() {
        const registry = this.readSessionRegistry();
        const entry = registry[this.sessionKey] || {};
        document.getElementById('account-username').textContent = entry.username || '—';
        document.getElementById('account-session').textContent = entry.session || '—';
        const twoFA = entry.twoFactorEnabled;
        document.getElementById('account-2fa-status').textContent = twoFA ? 'ON' : 'OFF';
        const toggleBtn = document.getElementById('account-2fa-toggle');
        toggleBtn.textContent = twoFA ? 'Disable' : 'Enable';
    }

    renameAccount() {
        const registry = this.readSessionRegistry();
        const entry = registry[this.sessionKey] || {};
        const newName = prompt('Enter new username:', entry.username || '');
        if (!newName || !newName.trim()) return;
        entry.username = newName.trim();
        registry[this.sessionKey] = entry;
        this.writeSessionRegistry(registry);
        localStorage.setItem(this.SESSION_LOGIN, JSON.stringify(entry));
        this.refreshAccountPanel();
        this.showToast('Account renamed to ' + entry.username, 'success');
    }

    changePassword() {
        const newPassword = prompt('Enter new password:');
        if (!newPassword || !newPassword.trim()) return;
        const registry = this.readSessionRegistry();
        const entry = registry[this.sessionKey] || {};
        const oldKey = this.sessionKey;
        const newKey = this.makeSessionKey(entry.username || '', newPassword.trim(), entry.session || '');
        if (newKey === oldKey) {
            this.showToast('Password unchanged (same key).', 'info');
            return;
        }
        this.migrateSessionData(oldKey, newKey);
        entry.key = newKey;
        entry.lastActive = Date.now();
        registry[newKey] = entry;
        delete registry[oldKey];
        this.writeSessionRegistry(registry);
        localStorage.setItem(this.SESSION_LOGIN, JSON.stringify(entry));
        this.sessionKey = newKey;
        this.refreshAccountPanel();
        this.showToast('Password changed!', 'success');
    }

    migrateSessionData(oldKey, newKey) {
        ['escape_room_game_state_', 'escape_room_customizer_', 'escape_room_code_', 'escape_room_hint_'].forEach(prefix => {
            const val = localStorage.getItem(prefix + oldKey);
            if (val !== null) {
                localStorage.setItem(prefix + newKey, val);
                localStorage.removeItem(prefix + oldKey);
            }
        });
        Object.keys(localStorage).forEach(storageKey => {
            if (storageKey.startsWith('escape_room_pairing_') && localStorage.getItem(storageKey) === oldKey) {
                localStorage.setItem(storageKey, newKey);
            }
        });
    }

    toggle2FA() {
        const registry = this.readSessionRegistry();
        const entry = registry[this.sessionKey] || {};
        entry.twoFactorEnabled = !entry.twoFactorEnabled;
        registry[this.sessionKey] = entry;
        this.writeSessionRegistry(registry);
        localStorage.setItem(this.SESSION_LOGIN, JSON.stringify(entry));
        this.refreshAccountPanel();
        this.showToast(entry.twoFactorEnabled ? '2FA enabled' : '2FA disabled', 'success');
    }

    signOut() {
        if (!confirm('Sign out? Your game data will be saved and can be restored next login.')) return;
        localStorage.removeItem(this.SESSION_LOGIN);
        document.getElementById('account-panel').classList.remove('open');
        location.reload();
    }

    deleteAccount() {
        if (!confirm('PERMANENTLY DELETE your account, all game data, customizer settings, and pairing codes? This cannot be undone.')) return;
        if (!confirm('Type anything below to confirm deletion.')) return;
        const key = this.sessionKey;
        this.removeSessionData(key);
        const registry = this.readSessionRegistry();
        delete registry[key];
        this.writeSessionRegistry(registry);
        localStorage.removeItem(this.SESSION_LOGIN);
        location.reload();
    }

    verify2FA() {
        const code = document.getElementById('twofa-code').value.trim();
        this.resolve2FA(code);
    }

    resolve2FA(code) {
        if (!code) {
            document.getElementById('twofa-error').textContent = 'Enter any verification code.';
            return;
        }
        document.getElementById('twofa-overlay').style.display = 'none';
        if (this.pendingBoot) {
            this.pendingBoot = false;
            const entry = this.readSessionRegistry()[this.sessionKey] || {};
            this.showToast('Welcome back, ' + (entry.username || 'user') + '. Your session expires after 1 month of no activity.', 'success');
            this.bootDashboard();
        }
    }

    show2FA() {
        document.getElementById('twofa-overlay').style.display = 'flex';
        document.getElementById('twofa-code').value = '';
        document.getElementById('twofa-error').textContent = '';
        document.getElementById('twofa-code').focus();
    }

    showToast(message, type) {
        const toast = document.getElementById('toast');
        const msg = document.getElementById('toast-message');
        if (!toast || !msg) return;
        msg.textContent = message;
        toast.className = 'toast ' + (type || 'info') + ' show';
        setTimeout(() => { toast.classList.remove('show'); }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new GameMasterDashboard();
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const href = btn.getAttribute('href');
            const overlay = document.getElementById('loading-overlay');
            const bar = document.getElementById('loading-bar');
            const pct = document.getElementById('loading-pct');
            overlay.style.display = 'flex';
            let p = 0;
            const iv = setInterval(() => {
                p += Math.random() * 15 + 5;
                if (p >= 100) { p = 100; clearInterval(iv); setTimeout(() => { window.location.href = href; }, 200); }
                bar.style.width = p + '%';
                pct.textContent = Math.floor(p) + '%';
            }, 200);
        });
    });
});
