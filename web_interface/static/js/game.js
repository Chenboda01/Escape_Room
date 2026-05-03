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
        this.init();
    }

    get GS() { return 'escape_room_game_state'; }

    init() {
        this.connectWebSocket();
        this.bindEvents();
        this.loadFromStorage();
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

    loadFromStorage() {
        const stored = localStorage.getItem(this.GS);
        if (stored) {
            try {
                this.gameState = JSON.parse(stored);
                this.gameState.start_time = null;
                this.gameState.game_active = false;
                this.gameState.time_remaining = 5400;
                this.gameState.game_complete = false;
                this.gameState.game_over = false;
                this.gameState.paused = false;
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
        this.tryServerThen('start', null, doStart);
        if (this.connected) return;
        doStart();
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
        this.tryServerThen('reset', null, doReset);
        if (this.connected) return;
        doReset();
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
        this.tryServerThen('puzzle/solve', { room_id: roomId, puzzle_id: puzzleId }, doSolve);
        if (this.connected) return;
        doSolve();
    }

    giveHint() {
        const doHint = () => {
            if (!this.gameState || this.gameState.hints_remaining <= 0) return;
            this.gameState.hints_remaining--;
            this.gameState.hints_used = (this.gameState.hints_used || 0) + 1;
            this.updateHints(this.gameState.hints_remaining, this.gameState.hints_used);
            this.saveToStorage();
            this.showToast('Hint given! ' + this.gameState.hints_remaining + ' left', 'success');
        };
        this.tryServerThen('hint', null, doHint);
        if (this.connected) return;
        doHint();
    }

    wakeDragon() {
        const doWake = () => {
            if (!this.gameState || !this.gameState.rooms.room3) return;
            this.gameState.rooms.room3.dragon_awake = true;
            document.getElementById('dragon-alert').style.display = 'block';
            this.saveToStorage();
            this.showToast('Dragon woke up!', 'warning');
        };
        this.tryServerThen('dragon/wake', null, doWake);
        if (this.connected) return;
        doWake();
    }

    calmDragon() {
        const doCalm = () => {
            if (!this.gameState || !this.gameState.rooms.room3) return;
            this.gameState.rooms.room3.dragon_awake = false;
            document.getElementById('dragon-alert').style.display = 'none';
            this.saveToStorage();
            this.showToast('Dragon calmed down', 'success');
        };
        this.tryServerThen('dragon/calm', null, doCalm);
        if (this.connected) return;
        doCalm();
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
        this.socket.emit('play_video', {});
        this.showToast('Video broadcast started', 'success');
    }

    generateCode() {
        const code = Math.random().toString(36).substring(2, 8);
        localStorage.setItem('escape_room_code', code);
        this.localConnected = true;
        if (this.gameState) this.saveToStorage();
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
        this.lastUpdateTimestamp = performance.now();
        this.timerState.gameComplete = Boolean(gameComplete);
        this.timerState.gameOver = Boolean(gameOver);
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
