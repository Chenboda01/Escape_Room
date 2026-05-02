class PlayerScreen {
    constructor() {
        this.socket = null;
        this.gameState = null;
        this.connected = false;
        this.serverTimeRemaining = null;
        this.displayTimeRemaining = null;
        this.lastUpdateTimestamp = null;
        this.localTimerFrame = null;
        this.connectionCheckInterval = null;
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
        
        this.connectionCheckInterval = setInterval(() => {
            if (!this.connected) {
                this.checkConnection();
            }
        }, 5000);
    }
    
    connectWebSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to game server');
            this.connected = true;
            this.updateConnectionStatus();
            this.showToast('Connected to game server', 'success');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from game server');
            this.connected = false;
            this.updateConnectionStatus();
            this.showToast('Disconnected from game server', 'error');
        });
        
        this.socket.on('connected', (data) => {
            console.log('Server connected:', data);
        });
        
        this.socket.on('game_state', (state) => {
            console.log('Game state received:', state);
            this.gameState = state;
            this.syncTimer(state.time_remaining, state.game_complete, state.game_over);
            this.updateDisplay();
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
            this.showToast(`Hint given! ${data.hints_remaining} hints remaining`, 'success');
        });
        
        this.socket.on('puzzle_solved', (data) => {
            console.log('Puzzle solved:', data);
            this.showToast(`Puzzle solved! Room ${data.room_id} progress updated`, 'success');
        });
        
        this.socket.on('door_unlocked', (data) => {
            console.log('Door unlocked:', data);
            this.showToast(`Door unlocked! Room ${data.room_id} is now accessible`, 'success');
        });
        
        this.socket.on('dragon_woken', (data) => {
            console.log('Dragon woken:', data);
            this.showToast('⚠️ Dragon is awake! ⚠️', 'error');
        });
        
        this.socket.on('dragon_calmed', (data) => {
            console.log('Dragon calmed:', data);
            this.showToast('Dragon calmed down', 'success');
        });
        
        this.socket.on('play_video', () => {
            console.log('Received play_video broadcast');
            this.playVideo();
        });
    }

    bindEvents() {
    }

    playVideo() {
        const video = document.getElementById('intro-video');
        const placeholder = document.getElementById('video-placeholder');
        
        fetch('/api/video/info')
            .then(response => response.json())
            .then(data => {
                if (data.video) {
                    const videoUrl = '/static/videos/' + data.filename + '?t=' + Date.now();
                    video.src = videoUrl;
                    placeholder.style.display = 'none';
                    video.style.display = 'block';
                    video.play().catch(error => {
                        console.error('Error playing video:', error);
                        this.showToast('Error playing video', 'error');
                    });
                    this.showToast('Playing introduction video', 'success');
                } else {
                    placeholder.textContent = 'No video file. Game Master needs to upload one.';
                    this.showToast('No video found', 'warning');
                }
            })
            .catch(error => {
                console.error('Error checking video:', error);
                this.showToast('Error loading video', 'error');
            });
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
        } else if (this.gameState && this.gameState.start_time) {
            statusEl.textContent = 'In Progress';
            statusEl.style.color = '#4cc9f0';
            statusSubEl.textContent = 'Game running';
        } else {
            statusEl.textContent = 'Ready';
            statusEl.style.color = '#a0a0a0';
            statusSubEl.textContent = 'Game not started';
        }
        
        const timeEl = document.getElementById('time-remaining');
        if (safeSecondsRemaining < 300) {
            timeEl.style.color = '#ff416c';
            timeEl.style.animation = safeSecondsRemaining < 60 ? 'pulse 1s infinite' : 'none';
        } else if (safeSecondsRemaining < 900) {
            timeEl.style.color = '#f46b45';
        } else {
            timeEl.style.color = '#e94560';
        }
    }
    
    updateDisplay() {
    }
    
    updateConnectionStatus() {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) return;
        
        if (this.connected) {
            statusEl.textContent = '🟢 Connected';
            statusEl.className = 'connection-status connected';
        } else {
            statusEl.textContent = '🔴 Disconnected';
            statusEl.className = 'connection-status disconnected';
        }
    }
    
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        
        if (!toast || !toastMessage) return;
        
        toastMessage.textContent = message;

        if (type === 'success') {
            toast.style.backgroundColor = 'rgba(0, 176, 155, 0.9)';
        } else if (type === 'error') {
            toast.style.backgroundColor = 'rgba(255, 65, 108, 0.9)';
        } else if (type === 'warning') {
            toast.style.backgroundColor = 'rgba(244, 107, 69, 0.9)';
        } else {
            toast.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        }
        
        toast.style.display = 'block';
        
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.playerScreen = new PlayerScreen();
});