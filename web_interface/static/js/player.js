class PlayerScreen {
    constructor() {
        this.socket = null;
        this.gameState = null;
        this.connected = false;
        this.paired = false;
        this.serverTimeRemaining = null;
        this.displayTimeRemaining = null;
        this.lastUpdateTimestamp = null;
        this.localTimerFrame = null;
        this.connectionCheckInterval = null;
        this.disconnectGrace = null;
        this.timerState = { gameComplete: false, gameOver: false };
        this.lastRenderedTimerKey = null;
        this.lastHintId = null;
        this.init();
    }

    init() {
        this.connectWebSocket();
        this.bindEvents();
        this.showImportUI();
        window.addEventListener('storage', (e) => {
            if (e.key === 'escape_room_code' && e.newValue && !this.paired) {
                document.getElementById('code-input').value = e.newValue;
                this.showToast('Code received: ' + e.newValue, 'success');
            }
            if (e.key === 'escape_room_game_state' && e.newValue && this.paired) {
                try { this.gameState = JSON.parse(e.newValue); this.syncTimer(this.gameState.time_remaining, this.gameState.game_complete, this.gameState.game_over); } catch {}
            }
            if (e.key === 'escape_room_hint' && e.newValue && this.paired) {
                try { this.showHint(JSON.parse(e.newValue)); } catch {}
            }
        });
        this.connectionCheckInterval = setInterval(() => {
            if (!this.connected) this.checkConnection();
            if (this.paired) {
                const stored = localStorage.getItem('escape_room_game_state');
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        if (JSON.stringify(parsed) !== JSON.stringify(this.gameState)) {
                            this.gameState = parsed;
                            this.syncTimer(this.gameState.time_remaining, this.gameState.game_complete, this.gameState.game_over);
                        }
                    } catch {}
                }
            }
        }, 1000);
    }

    showImportUI() {
        document.getElementById('timer-container').style.display = 'none';
        document.getElementById('game-status-box').style.display = 'none';
        document.getElementById('video-section').style.display = 'none';
        document.getElementById('connection-status').style.display = 'none';
        document.getElementById('import-section').style.display = 'flex';
    }

    showGameUI() {
        document.getElementById('timer-container').style.display = 'block';
        document.getElementById('game-status-box').style.display = 'block';
        document.getElementById('video-section').style.display = 'block';
        document.getElementById('connection-status').style.display = 'block';
        document.getElementById('import-section').style.display = 'none';
    }

    bindEvents() {
        document.getElementById('btn-import-code').addEventListener('click', () => this.importCode());
        document.getElementById('code-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.importCode();
        });
        const closeHint = document.getElementById('btn-close-hint');
        if (closeHint) closeHint.addEventListener('click', () => this.hideHint());
    }

    importCode() {
        const input = document.getElementById('code-input');
        const code = input.value.trim().toLowerCase();
        if (!code) return;

        this.paired = true;
        this.showGameUI();
        this.updateConnectionStatus();
        this.showToast('Paired with code: ' + code, 'success');
    }

    connectWebSocket() {
        if (!window.io || location.hostname.endsWith('github.io') || (location.port && location.port !== '5000')) return;
        this.socket = io();
        this.socket.on('connect', () => {
            this.connected = true;
            if (this.disconnectGrace) {
                clearTimeout(this.disconnectGrace);
                this.disconnectGrace = null;
            }
            if (this.paired) this.updateConnectionStatus();
        });
        this.socket.on('disconnect', () => {
            this.disconnectGrace = setTimeout(() => {
                this.connected = false;
                if (this.paired) {
                    this.updateConnectionStatus();
                    this.showToast('Disconnected', 'error');
                }
            }, 3000);
        });
        this.socket.on('connected', () => {});
        this.socket.on('game_state', (state) => {
            if (!this.paired) return;
            this.gameState = state;
            this.syncTimer(state.time_remaining, state.game_complete, state.game_over);
        });
        this.socket.on('time_update', (data) => {
            if (!this.paired) return;
            if (this.gameState) {
                this.gameState.time_remaining = data.time_remaining;
                this.gameState.game_complete = data.game_complete;
                this.gameState.game_over = data.game_over;
            }
            this.syncTimer(data.time_remaining, data.game_complete, data.game_over);
        });
        this.socket.on('game_started', (data) => {
            if (!this.paired) return;
            if (!this.gameState) this.gameState = {};
            this.gameState.start_time = data.start_time;
            this.gameState.game_active = true;
            this.gameState.game_complete = false;
            this.gameState.game_over = false;
            this.gameState.time_remaining = 90 * 60;
            this.syncTimer(this.gameState.time_remaining, false, false);
            this.showToast('Game started!', 'success');
        });
        this.socket.on('game_reset', () => {
            if (!this.paired) return;
            if (this.gameState) {
                this.gameState.start_time = null;
                this.gameState.game_active = false;
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
        });
        this.socket.on('hint_used', () => {});
        this.socket.on('puzzle_solved', () => {});
        this.socket.on('door_unlocked', () => {});
        this.socket.on('dragon_woke', () => {
            this.showToast('Dragon is awake!', 'warning');
        });
        this.socket.on('dragon_calmed', () => {});
        this.socket.on('play_video', () => {
            this.playVideo();
        });
    }

    playVideo() {
        const video = document.getElementById('intro-video');
        const placeholder = document.getElementById('video-placeholder');
        fetch('/api/video/info')
            .then(r => r.json())
            .then(data => {
                if (data.video) {
                    video.src = '/static/videos/' + data.filename + '?t=' + Date.now();
                    placeholder.style.display = 'none';
                    video.style.display = 'block';
                    video.play().catch(() => this.showToast('Error playing video', 'error'));
                } else {
                    placeholder.textContent = 'No video file available';
                }
            });
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
        const elapsed = (performance.now() - this.lastUpdateTimestamp) / 1000;
        return Math.max(0, this.displayTimeRemaining - elapsed);
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
        if (this.localTimerFrame !== null) {
            cancelAnimationFrame(this.localTimerFrame);
            this.localTimerFrame = null;
        }
    }

    updateTimer(secondsRemaining, gameComplete, gameOver) {
        const safe = Math.max(0, Math.floor(secondsRemaining));
        const key = `${safe}:${gameComplete}:${gameOver}:${this.isGameRunning()}`;
        if (this.lastRenderedTimerKey === key) return;
        this.lastRenderedTimerKey = key;
        const min = Math.floor(safe / 60);
        const sec = Math.floor(safe % 60);
        document.getElementById('time-remaining').textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        const statusEl = document.getElementById('game-status');
        const subEl = document.getElementById('game-status-sub');
        if (gameComplete) {
            statusEl.textContent = 'Escaped!';
            statusEl.style.color = '#00b09b';
            subEl.textContent = 'Players escaped!';
        } else if (gameOver) {
            statusEl.textContent = "Time's Up!";
            statusEl.style.color = '#ff416c';
            subEl.textContent = 'Game over';
        } else if (this.isGameRunning()) {
            statusEl.textContent = 'In Progress';
            statusEl.style.color = '#4cc9f0';
            subEl.textContent = 'Game running';
        } else {
            statusEl.textContent = 'Ready';
            statusEl.style.color = '#a0a0a0';
            subEl.textContent = 'Waiting for Game Master';
        }
        const timeEl = document.getElementById('time-remaining');
        if (safe < 300) {
            timeEl.style.color = '#ff416c';
            timeEl.style.animation = safe < 60 ? 'pulse 1s infinite' : 'none';
        } else if (safe < 900) {
            timeEl.style.color = '#f46b45';
        } else {
            timeEl.style.color = '#e94560';
        }
    }

    updateConnectionStatus() {
        const el = document.getElementById('connection-status');
        if (!el) return;
        if (this.paired) {
            el.textContent = '\u{1F7E2} Connected';
            el.className = 'connection-status connected';
        } else {
            el.textContent = '\u{1F535} Waiting for code';
            el.className = 'connection-status disconnected';
        }
    }

    showHint(hint) {
        if (!hint || !hint.message || hint.id === this.lastHintId) return;
        this.lastHintId = hint.id;
        const overlay = document.getElementById('hint-overlay');
        const message = document.getElementById('hint-message');
        if (!overlay || !message) return;
        message.textContent = hint.message;
        overlay.style.display = 'flex';
    }

    hideHint() {
        const overlay = document.getElementById('hint-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    showToast(message, type) {
        const toast = document.getElementById('toast');
        const msg = document.getElementById('toast-message');
        if (!toast || !msg) return;
        msg.textContent = message;
        if (type === 'success') toast.style.backgroundColor = 'rgba(0,176,155,0.9)';
        else if (type === 'error') toast.style.backgroundColor = 'rgba(255,65,108,0.9)';
        else if (type === 'warning') toast.style.backgroundColor = 'rgba(244,107,69,0.9)';
        else toast.style.backgroundColor = 'rgba(0,0,0,0.9)';
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.playerScreen = new PlayerScreen();
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
