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
        this.timerState = {
            gameComplete: false,
            gameOver: false
        };
        this.lastRenderedTimerKey = null;
        
        this.init();
    }
    
    init() {
        this.connectWebSocket();
        this.bindEvents();
        this.updateConnectionStatus();
        
        // Check connection every 5 seconds
        this.connectionCheckInterval = setInterval(() => {
            if (!this.connected) {
                this.checkConnection();
            }
        }, 5000);
    }
    
    connectWebSocket() {
        // Connect to the Socket.IO server
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to game server');
            if (this.disconnectGrace) {
                clearTimeout(this.disconnectGrace);
                this.disconnectGrace = null;
            }
            this.connected = true;
            this.updateConnectionStatus();
            this.showToast('Connected to game server', 'success');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from game server');
            this.disconnectGrace = setTimeout(() => {
                this.connected = false;
                this.updateConnectionStatus();
                this.showToast('Disconnected from game server', 'error');
            }, 3000);
        });
        
        this.socket.on('connected', (data) => {
            console.log('Server connected:', data);
        });
        
        this.socket.on('game_state', (state) => {
            console.log('Game state received:', state);
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
        
        this.socket.on('game_started', (data) => {
            console.log('Game started:', data);

            if (!this.gameState) {
                this.gameState = {};
            }

            this.gameState.start_time = data.start_time;
            this.gameState.game_complete = false;
            this.gameState.game_over = false;
            this.gameState.time_remaining = 90 * 60;
            this.syncTimer(this.gameState.time_remaining, false, false);
            this.showToast('Game started! Timer running...', 'success');
        });
        
        this.socket.on('game_reset', () => {
            console.log('Game reset');

            if (this.gameState) {
                this.gameState.start_time = null;
                this.gameState.game_complete = false;
                this.gameState.game_over = false;
                this.gameState.time_remaining = 90 * 60;
            }

            this.serverTimeRemaining = 90 * 60;
            this.displayTimeRemaining = 90 * 60;
            this.lastUpdateTimestamp = null;
            this.timerState.gameComplete = false;
            this.timerState.gameOver = false;
            this.stopLocalTimer();
            this.updateTimer(90 * 60, false, false);
            this.showToast('Game reset to initial state', 'warning');
        });
        
        this.socket.on('hint_used', (data) => {
            console.log('Hint used:', data);
            this.updateHints(data.hints_remaining, data.hints_used);
            this.showToast(`Hint given! ${data.hints_remaining} hints remaining`, 'success');
        });
        
        this.socket.on('puzzle_solved', (data) => {
            console.log('Puzzle solved:', data);
            this.showToast(`Puzzle solved! Room ${data.room_id} progress updated`, 'success');
            
            if (data.game_complete) {
                this.showToast('🎉 CONGRATULATIONS! Players escaped! 🎉', 'success');
            }
        });
        
        this.socket.on('door_unlocked', (data) => {
            console.log('Door unlocked:', data);
            this.showToast(`Door to ${data.room_id} unlocked!`, 'success');
        });
        
        this.socket.on('dragon_woke', (data) => {
            console.log('Dragon woke:', data);
            document.getElementById('dragon-alert').style.display = 'block';
            this.showToast('⚠️ DRAGON IS AWAKE! Players were too loud!', 'warning');
        });
        
        this.socket.on('dragon_calmed', (data) => {
            console.log('Dragon calmed:', data);
            document.getElementById('dragon-alert').style.display = 'none';
            this.showToast('Dragon calmed back to sleep', 'success');
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
    
    startGame() {
        fetch('/api/game/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Game started:', data);
            } else {
                this.showToast(`Error: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('Error starting game:', error);
            this.showToast('Error starting game', 'error');
        });
    }
    
    resetGame() {
        if (confirm('Are you sure you want to reset the game? This will unlock all doors and reset puzzles.')) {
            fetch('/api/game/reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('Game reset:', data);
                } else {
                    this.showToast(`Error: ${data.message}`, 'error');
                }
            })
            .catch(error => {
                console.error('Error resetting game:', error);
                this.showToast('Error resetting game', 'error');
            });
        }
    }
    
    giveHint() {
        fetch('/api/game/hint', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                this.showToast(`Error: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('Error giving hint:', error);
            this.showToast('Error giving hint', 'error');
        });
    }
    
    wakeDragon() {
        fetch('/api/dragon/wake', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Dragon woke:', data);
            } else {
                this.showToast(`Error: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('Error waking dragon:', error);
            this.showToast('Error waking dragon', 'error');
        });
    }
    
    calmDragon() {
        fetch('/api/dragon/calm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Dragon calmed:', data);
            } else {
                this.showToast(`Error: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('Error calming dragon:', error);
            this.showToast('Error calming dragon', 'error');
        });
    }
    
    uploadVideo() {
        const fileInput = document.getElementById('video-file-input');
        const file = fileInput.files[0];
        if (!file) {
            this.showToast('Please select a video file', 'warning');
            return;
        }
        
        const formData = new FormData();
        formData.append('video', file);
        
        document.getElementById('video-status').textContent = 'Uploading...';
        
        fetch('/api/video/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('video-status').textContent = 'Video: ' + data.filename;
                this.showToast('Video uploaded successfully', 'success');
            } else {
                document.getElementById('video-status').textContent = 'Upload failed';
                this.showToast(`Error: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('Error uploading video:', error);
            document.getElementById('video-status').textContent = 'Upload failed';
            this.showToast('Error uploading video', 'error');
        });
    }
    
    startVideoOnPlayers() {
        this.socket.emit('play_video', {});
        this.showToast('Video broadcast started on player screens', 'success');
    }
    
    generateCode() {
        const code = Math.random().toString(36).substring(2, 8);
        document.getElementById('pairing-code').textContent = code;
        document.getElementById('code-display').style.display = 'block';
        this.showToast('Code: ' + code, 'success');
        fetch('/api/pairing/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
    }
    
    solvePuzzle(roomId, puzzleId) {
        fetch('/api/puzzle/solve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                room_id: roomId,
                puzzle_id: puzzleId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                this.showToast(`Error: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('Error solving puzzle:', error);
            this.showToast('Error solving puzzle', 'error');
        });
    }
    
    unlockDoor(roomId) {
        fetch('/api/door/unlock', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                room_id: roomId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                this.showToast(`Error: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('Error unlocking door:', error);
            this.showToast('Error unlocking door', 'error');
        });
    }
    
    updateConnectionStatus() {
        const statusEl = document.getElementById('connection-status');
        if (this.connected) {
            statusEl.className = 'connection-status connected';
            statusEl.innerHTML = '🟢 Connected';
        } else {
            statusEl.className = 'connection-status disconnected';
            statusEl.innerHTML = '🔴 Disconnected';
        }
    }
    
    checkConnection() {
        if (!this.connected && this.socket) {
            this.socket.connect();
        }
    }

    syncTimer(secondsRemaining, gameComplete, gameOver) {
        const normalizedTime = Number.isFinite(secondsRemaining) ? Math.max(0, secondsRemaining) : 0;

        this.serverTimeRemaining = normalizedTime;
        this.displayTimeRemaining = normalizedTime;
        this.lastUpdateTimestamp = performance.now();
        this.timerState.gameComplete = Boolean(gameComplete);
        this.timerState.gameOver = Boolean(gameOver);

        this.updateTimer(this.getCurrentTimerSeconds(), this.timerState.gameComplete, this.timerState.gameOver);

        if (this.shouldRunLocalTimer()) {
            this.startLocalTimer();
        } else {
            this.stopLocalTimer();
        }
    }

    isGameRunning() {
        return Boolean(
            this.gameState &&
            this.gameState.start_time &&
            !this.gameState.game_complete &&
            !this.gameState.game_over &&
            !this.gameState.paused
        );
    }

    shouldRunLocalTimer() {
        return this.isGameRunning() &&
            !this.timerState.gameComplete &&
            !this.timerState.gameOver &&
            this.displayTimeRemaining > 0;
    }

    getCurrentTimerSeconds() {
        if (this.displayTimeRemaining === null || this.displayTimeRemaining === undefined) {
            return 0;
        }

        if (this.lastUpdateTimestamp === null) {
            return Math.max(0, this.displayTimeRemaining);
        }

        const elapsedSeconds = (performance.now() - this.lastUpdateTimestamp) / 1000;
        return Math.max(0, this.displayTimeRemaining - elapsedSeconds);
    }

    startLocalTimer() {
        if (this.localTimerFrame !== null) {
            return;
        }

        const tick = () => {
            const secondsRemaining = this.getCurrentTimerSeconds();
            const localGameOver = this.timerState.gameOver || (!this.timerState.gameComplete && this.isGameRunning() && secondsRemaining <= 0);

            this.updateTimer(secondsRemaining, this.timerState.gameComplete, localGameOver);

            if (!this.isGameRunning() || this.timerState.gameComplete || localGameOver) {
                this.stopLocalTimer();
                return;
            }

            this.localTimerFrame = requestAnimationFrame(tick);
        };

        this.localTimerFrame = requestAnimationFrame(tick);
    }

    stopLocalTimer() {
        if (this.localTimerFrame !== null) {
            cancelAnimationFrame(this.localTimerFrame);
            this.localTimerFrame = null;
        }
    }
    
    updateTimer(secondsRemaining, gameComplete, gameOver) {
        const safeSecondsRemaining = Math.max(0, Math.floor(secondsRemaining));
        const renderKey = `${safeSecondsRemaining}:${gameComplete}:${gameOver}:${this.isGameRunning()}`;

        if (this.lastRenderedTimerKey === renderKey) {
            return;
        }

        this.lastRenderedTimerKey = renderKey;

        const minutes = Math.floor(safeSecondsRemaining / 60);
        const seconds = Math.floor(safeSecondsRemaining % 60);
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        document.getElementById('time-remaining').textContent = timeStr;
        
        const statusEl = document.getElementById('game-status');
        const statusSubEl = document.getElementById('game-status-sub');
        
        if (gameComplete) {
            statusEl.textContent = 'Escaped!';
            statusEl.style.color = '#00b09b';
            statusSubEl.textContent = 'Players escaped successfully!';
        } else if (gameOver) {
            statusEl.textContent = 'Time\'s Up!';
            statusEl.style.color = '#ff416c';
            statusSubEl.textContent = 'Dragon woke up - game over';
        } else if (this.isGameRunning()) {
            statusEl.textContent = 'In Progress';
            statusEl.style.color = '#4cc9f0';
            statusSubEl.textContent = 'Game running';
        } else {
            statusEl.textContent = 'Ready';
            statusEl.style.color = '#a0a0a0';
            statusSubEl.textContent = 'Click Start to begin';
        }
        
        // Update time display color based on urgency
        const timeEl = document.getElementById('time-remaining');
        if (safeSecondsRemaining < 300) { // Less than 5 minutes
            timeEl.style.color = '#ff416c';
            timeEl.style.animation = safeSecondsRemaining < 60 ? 'pulse 1s infinite' : 'none';
        } else if (safeSecondsRemaining < 900) { // Less than 15 minutes
            timeEl.style.color = '#f46b45';
            timeEl.style.animation = 'none';
        } else {
            timeEl.style.color = '#e94560';
            timeEl.style.animation = 'none';
        }
    }
    
    updateHints(remaining, used) {
        document.getElementById('hints-remaining').textContent = remaining;
        document.getElementById('hints-used').textContent = used;
    }
    
    renderGameState() {
        if (!this.gameState) return;
        
        this.updateTimer(this.getCurrentTimerSeconds(), this.timerState.gameComplete, this.timerState.gameOver);
        this.updateHints(this.gameState.hints_remaining, this.gameState.hints_used);
        
        // Update current room
        const currentRoom = this.gameState.current_room;
        if (currentRoom && this.gameState.rooms[currentRoom]) {
            const room = this.gameState.rooms[currentRoom];
            document.getElementById('current-room').textContent = room.name;
        }
        
        // Render rooms
        this.renderRooms();
        
        // Update dragon alert
        const room3 = this.gameState.rooms['room3'];
        if (room3 && room3.dragon_awake) {
            document.getElementById('dragon-alert').style.display = 'block';
        } else {
            document.getElementById('dragon-alert').style.display = 'none';
        }
    }
    
    renderRooms() {
        const roomsContainer = document.getElementById('rooms-container');
        roomsContainer.replaceChildren();
        
        Object.values(this.gameState.rooms).forEach(room => {
            const roomEl = this.createRoomElement(room);
            roomsContainer.appendChild(roomEl);
        });
    }
    
    createRoomElement(room) {
        const div = document.createElement('div');
        div.className = 'room-card';
        
        if (room.id === this.gameState.current_room) {
            div.classList.add('active');
        }
        
        if (room.status === 'complete') {
            div.classList.add('complete');
        }
        
        let statusClass = 'status-locked';
        let statusText = 'Locked';
        
        if (room.status === 'unlocked' || room.status === 'complete') {
            statusClass = room.status === 'complete' ? 'status-complete' : 'status-unlocked';
            statusText = room.status === 'complete' ? 'Complete' : 'Unlocked';
        }
        
        div.innerHTML = `
            <div class="room-header">
                <div class="room-title">
                    <h3>${room.name}</h3>
                </div>
                <div class="room-status ${statusClass}">${statusText}</div>
            </div>
            <div class="puzzles">
                ${Object.values(room.puzzles).map(puzzle => this.createPuzzleElement(puzzle, room.id)).join('')}
            </div>
            ''
        `;
        
        // Add event listeners after element is added to DOM
        setTimeout(() => {
            div.querySelectorAll('.solve-puzzle-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const roomId = e.target.dataset.room;
                    const puzzleId = e.target.dataset.puzzle;
                    this.solvePuzzle(roomId, puzzleId);
                });
            });

        }, 0);
        
        return div;
    }
    
    createPuzzleElement(puzzle, roomId) {
        let statusClass = '';
        if (puzzle.status === 'solved') {
            statusClass = 'solved';
        } else if (puzzle.status === 'available') {
            statusClass = 'available';
        }
        
        return `
            <div class="puzzle-item ${statusClass}">
                <div class="puzzle-info">
                    <h4>${puzzle.name}</h4>
                    <div class="puzzle-id">ID: ${puzzle.id}</div>
                </div>
                <div class="puzzle-actions">
                    ${puzzle.status === 'solved' ? 
                        '<span style="color: #00b09b; font-weight: bold;">✓ Solved</span>' :
                        `<button class="solve-puzzle-btn" data-room="${roomId}" data-puzzle="${puzzle.id}">
                            Mark Solved
                        </button>`
                    }
                </div>
            </div>
        `;
    }
    
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        
        toastMessage.textContent = message;
        toast.className = `toast ${type} show`;
        
        // Hide after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize dashboard when page loads
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
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 15 + 5;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                    setTimeout(() => { window.location.href = href; }, 200);
                }
                bar.style.width = progress + '%';
                pct.textContent = Math.floor(progress) + '%';
            }, 200);
        });
    });
});
