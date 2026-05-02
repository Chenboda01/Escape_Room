import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify, request, redirect
from flask_socketio import SocketIO, emit
import yaml
import json
import os
import logging
import threading
import time
import random
import string
from datetime import datetime

from game_engine.game_state import GameStateManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'escape-room-secret-key'
app.config['VIDEO_UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'static', 'videos')
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

os.makedirs(app.config['VIDEO_UPLOAD_FOLDER'], exist_ok=True)

game_manager = GameStateManager()
active_sessions = {}
pairing_codes = {}

def game_timer_thread():
    while True:
        socketio.sleep(1)
        game_manager.state.update_time()
        socketio.emit('time_update', {
            'time_remaining': game_manager.state.time_remaining,
            'game_complete': game_manager.state.game_complete,
            'game_over': game_manager.state.game_over
        })
        if int(time.time()) % 30 == 0:
            game_manager.save_state()

timer_thread = threading.Thread(target=game_timer_thread, daemon=True)
timer_thread.start()

@app.route('/')
def index():
    return redirect('/admin')

@app.route('/admin')
def admin_dashboard():
    return render_template('dashboard.html')

@app.route('/player')
def player_screen():
    """Player display screen for rooms"""
    return render_template('player_screen.html')

@app.route('/lodge')
def lodge():
    return render_template('lodge.html')

@app.route('/api/game/start', methods=['POST'])
def start_game():
    """Start a new game"""
    game_manager.state.start_game()
    game_manager.save_state()
    
    socketio.emit('game_started', {
        'game_id': game_manager.state.game_id,
        'start_time': game_manager.state.start_time
    })
    
    return jsonify({
        'success': True,
        'game_id': game_manager.state.game_id,
        'message': 'Game started!'
    })

@app.route('/api/game/reset', methods=['POST'])
def reset_game():
    """Reset game to initial state"""
    game_manager.state = game_manager.initialize_state()
    game_manager.save_state()
    
    socketio.emit('game_reset', {})
    
    return jsonify({
        'success': True,
        'message': 'Game reset to initial state'
    })

@app.route('/api/game/state', methods=['GET'])
def get_game_state():
    """Get current game state"""
    return jsonify(game_manager.state.to_dict())

@app.route('/api/game/hint', methods=['POST'])
def give_hint():
    """Use a hint"""
    if game_manager.state.use_hint():
        socketio.emit('hint_used', {
            'hints_remaining': game_manager.state.hints_remaining,
            'hints_used': game_manager.state.hints_used
        })
        return jsonify({
            'success': True,
            'hints_remaining': game_manager.state.hints_remaining,
            'message': 'Hint given'
        })
    else:
        return jsonify({
            'success': False,
            'message': 'No hints remaining'
        }), 400

@app.route('/api/puzzle/solve', methods=['POST'])
def solve_puzzle():
    """Mark a puzzle as solved"""
    data = request.json
    room_id = data.get('room_id')
    puzzle_id = data.get('puzzle_id')
    
    if not room_id or not puzzle_id:
        return jsonify({'success': False, 'message': 'Missing room_id or puzzle_id'}), 400
    
    if game_manager.state.solve_puzzle(room_id, puzzle_id):
        # Get updated puzzle and room
        room = game_manager.state.rooms[room_id]
        puzzle = room.puzzles[puzzle_id]
        
        socketio.emit('puzzle_solved', {
            'room_id': room_id,
            'puzzle_id': puzzle_id,
            'room_complete': room.status.value,
            'game_complete': game_manager.state.game_complete
        })
        
        game_manager.save_state()
        return jsonify({
            'success': True,
            'message': f'Puzzle {puzzle_id} solved',
            'room_complete': room.status.value,
            'game_complete': game_manager.state.game_complete
        })
    else:
        return jsonify({'success': False, 'message': 'Puzzle not found'}), 404

@app.route('/api/door/unlock', methods=['POST'])
def unlock_door():
    """Unlock a door"""
    data = request.json
    room_id = data.get('room_id')
    
    if not room_id:
        return jsonify({'success': False, 'message': 'Missing room_id'}), 400
    
    if game_manager.state.unlock_door(room_id):
        socketio.emit('door_unlocked', {
            'room_id': room_id,
            'door_locked': False
        })
        
        game_manager.save_state()
        return jsonify({
            'success': True,
            'message': f'Door to {room_id} unlocked'
        })
    else:
        return jsonify({'success': False, 'message': 'Room not found'}), 404

@app.route('/api/dragon/wake', methods=['POST'])
def wake_dragon():
    """Wake the dragon (Room 3 scare effect)"""
    if 'room3' in game_manager.state.rooms:
        game_manager.state.rooms['room3'].dragon_awake = True
        
        socketio.emit('dragon_woke', {
            'room_id': 'room3',
            'dragon_awake': True
        })
        
        return jsonify({
            'success': True,
            'message': 'Dragon woke up!'
        })
    return jsonify({'success': False, 'message': 'Room 3 not found'}), 404

@app.route('/api/dragon/calm', methods=['POST'])
def calm_dragon():
    """Calm the dragon back to sleep"""
    if 'room3' in game_manager.state.rooms:
        game_manager.state.rooms['room3'].dragon_awake = False
        
        socketio.emit('dragon_calmed', {
            'room_id': 'room3',
            'dragon_awake': False
        })
        
        return jsonify({
            'success': True,
            'message': 'Dragon calmed down'
        })
    return jsonify({'success': False, 'message': 'Room 3 not found'}), 404

@app.route('/api/video/upload', methods=['POST'])
def upload_video():
    video_file = request.files.get('video')
    if not video_file:
        return jsonify({'success': False, 'message': 'No video file provided'})
    if not video_file.filename:
        return jsonify({'success': False, 'message': 'No file selected'})
    
    filename = 'intro.mp4'
    ext = os.path.splitext(video_file.filename)[1].lower()
    if ext in ('.mp4', '.webm', '.avi', '.mkv', '.mov'):
        filename = 'intro' + ext
    
    filepath = os.path.join(app.config['VIDEO_UPLOAD_FOLDER'], filename)
    video_file.save(filepath)
    
    logger.info(f'Video uploaded: {filename}')
    return jsonify({'success': True, 'filename': filename})

@app.route('/api/video/info')
def video_info():
    video_dir = app.config['VIDEO_UPLOAD_FOLDER']
    for ext in ('.mp4', '.webm', '.avi', '.mkv', '.mov'):
        filename = 'intro' + ext
        filepath = os.path.join(video_dir, filename)
        if os.path.exists(filepath):
            return jsonify({'video': True, 'filename': filename})
    return jsonify({'video': False})

@app.route('/api/pairing/create', methods=['POST'])
def create_pairing():
    data = request.get_json(silent=True) or {}
    code = data.get('code') or ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    pairing_codes[code] = game_manager.state.game_id
    return jsonify({'success': True, 'code': code})

@app.route('/api/pairing/validate', methods=['POST'])
def validate_pairing():
    data = request.json
    code = data.get('code', '').strip().lower()
    if code in pairing_codes:
        return jsonify({'success': True})
    return jsonify({'success': False})

@socketio.on('play_video')
def handle_play_video(data):
    logger.info('Admin triggered video playback broadcast')
    socketio.emit('play_video', {})

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    logger.info(f'Client connected: {request.sid}')
    emit('connected', {'message': 'Connected to game server'})
    
    # Send current game state to new client
    emit('game_state', game_manager.state.to_dict())

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnect"""
    logger.info(f'Client disconnected: {request.sid}')

if __name__ == '__main__':
    logger.info("Starting Escape Room Game Master Server...")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)