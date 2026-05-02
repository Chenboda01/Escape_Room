import yaml
import json
import logging
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any
from enum import Enum
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PuzzleStatus(Enum):
    LOCKED = "locked"
    AVAILABLE = "available"
    SOLVED = "solved"
    FAILED = "failed"

class RoomStatus(Enum):
    LOCKED = "locked"
    UNLOCKED = "unlocked"
    COMPLETE = "complete"

@dataclass
class Puzzle:
    id: str
    name: str
    status: PuzzleStatus = PuzzleStatus.LOCKED
    triggers: List[str] = field(default_factory=list)
    data: Dict[str, Any] = field(default_factory=dict)
    
@dataclass  
class Room:
    id: str
    name: str
    status: RoomStatus = RoomStatus.LOCKED
    puzzles: Dict[str, Puzzle] = field(default_factory=dict)
    door_locked: bool = True
    # Room-specific state
    dragon_awake: bool = False  # For room3
    
@dataclass
class GameState:
    game_id: str = field(default_factory=lambda: f"game_{int(time.time())}")
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    time_remaining: float = 90 * 60  # 90 minutes in seconds
    hints_remaining: int = 5
    hints_used: int = 0
    rooms: Dict[str, Room] = field(default_factory=dict)
    current_room: Optional[str] = None
    trigger_history: List[str] = field(default_factory=list)
    game_complete: bool = False
    game_over: bool = False
    
    def to_dict(self):
        """Convert game state to dictionary with enum values as strings"""
        data = asdict(self)
        
        # Convert enum values to strings
        def convert_enums(obj):
            if isinstance(obj, Enum):
                return obj.value
            elif isinstance(obj, dict):
                return {k: convert_enums(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_enums(item) for item in obj]
            else:
                return obj
        
        return convert_enums(data)
    
    def to_json(self):
        return json.dumps(self.to_dict(), default=str, indent=2)
    
    def start_game(self):
        self.start_time = time.time()
        self.game_over = False
        logger.info(f"Game {self.game_id} started")
        
    def update_time(self):
        if self.start_time and not self.game_complete and not self.game_over:
            elapsed = time.time() - self.start_time
            self.time_remaining = max(0, 90 * 60 - elapsed)
            if self.time_remaining <= 0:
                self.game_over = True
                logger.info("Time's up! Game over.")
    
    def use_hint(self):
        if self.hints_remaining > 0:
            self.hints_remaining -= 1
            self.hints_used += 1
            return True
        return False
    
    def solve_puzzle(self, room_id: str, puzzle_id: str):
        if room_id in self.rooms and puzzle_id in self.rooms[room_id].puzzles:
            puzzle = self.rooms[room_id].puzzles[puzzle_id]
            if puzzle.status == PuzzleStatus.SOLVED:
                return True

            puzzle.status = PuzzleStatus.SOLVED
            logger.info(f"Puzzle {puzzle_id} in {room_id} solved")
            self._process_triggers(room_id, puzzle)
            
            # Check if all puzzles in room are solved
            room = self.rooms[room_id]
            all_solved = all(p.status == PuzzleStatus.SOLVED for p in room.puzzles.values())
            if all_solved:
                room.status = RoomStatus.COMPLETE
                room.door_locked = False
                logger.info(f"Room {room_id} completed!")
                
            # Check if game is complete (room3 exit door solved)
            if room_id == "room3" and puzzle_id == "exit_door":
                self.game_complete = True
                self.end_time = time.time()
                logger.info("Game complete! Players escaped!")
                
            return True
        return False

    def _process_triggers(self, room_id: str, puzzle: Puzzle):
        """Process triggers fired by a solved puzzle."""
        room = self.rooms[room_id]

        for trigger in puzzle.triggers:
            if trigger not in self.trigger_history:
                self.trigger_history.append(trigger)

            if trigger.endswith("_available"):
                target_puzzle_id = trigger.removesuffix("_available")
                if self._set_puzzle_available(target_puzzle_id):
                    continue

            if trigger.startswith("door_to_") and trigger.endswith("_unlock"):
                target_room_id = trigger[len("door_to_"):-len("_unlock")]
                self.unlock_door(target_room_id)
                continue

            if trigger == "game_complete":
                self.game_complete = True
                self.end_time = time.time()
                logger.info("Game complete! Players escaped!")
                continue

            self._unlock_next_locked_puzzle(room)

    def _set_puzzle_available(self, puzzle_id: str) -> bool:
        for room in self.rooms.values():
            if puzzle_id in room.puzzles:
                puzzle = room.puzzles[puzzle_id]
                if puzzle.status == PuzzleStatus.LOCKED:
                    puzzle.status = PuzzleStatus.AVAILABLE
                    logger.info(f"Puzzle {puzzle_id} is now available")
                return True
        return False

    def _unlock_next_locked_puzzle(self, room: Room) -> bool:
        for puzzle in room.puzzles.values():
            if puzzle.status == PuzzleStatus.LOCKED:
                puzzle.status = PuzzleStatus.AVAILABLE
                logger.info(f"Puzzle {puzzle.id} is now available")
                return True
        return False
    
    def unlock_door(self, room_id: str):
        if room_id in self.rooms:
            room = self.rooms[room_id]
            room.door_locked = False
            if room.status == RoomStatus.LOCKED:
                room.status = RoomStatus.UNLOCKED
            if room.puzzles and all(puzzle.status == PuzzleStatus.LOCKED for puzzle in room.puzzles.values()):
                first_puzzle = next(iter(room.puzzles.values()))
                first_puzzle.status = PuzzleStatus.AVAILABLE
            self.current_room = room_id
            logger.info(f"Door to {room_id} unlocked")
            return True
        return False

class GameStateManager:
    def __init__(self, config_path: str = "config/game_config.yaml"):
        self.config_path = config_path
        self.config = self.load_config()
        self.state = self.initialize_state()
        
    def load_config(self) -> Dict:
        with open(self.config_path, 'r') as f:
            return yaml.safe_load(f)
    
    def initialize_state(self) -> GameState:
        state = GameState()
        
        # Initialize rooms from config
        for room_config in self.config['GAME']['rooms']:
            room_id = room_config['id']
            room = Room(
                id=room_id,
                name=room_config['name'],
                status=RoomStatus.UNLOCKED if room_id == "room1" else RoomStatus.LOCKED,
                door_locked=room_config.get('door_locked', True)
            )
            
            # Initialize puzzles
            for puzzle_config in room_config['puzzles']:
                puzzle = Puzzle(
                    id=puzzle_config['id'],
                    name=puzzle_config['name'],
                    status=PuzzleStatus.LOCKED,
                    triggers=puzzle_config.get('triggers', [])
                )
                room.puzzles[puzzle.id] = puzzle
            
            # Set first puzzle as available
            if room_id == "room1" and room.puzzles:
                first_puzzle = list(room.puzzles.values())[0]
                first_puzzle.status = PuzzleStatus.AVAILABLE

            if room_id == "room1":
                room.door_locked = False
            
            state.rooms[room_id] = room
        
        # Start in room1
        state.current_room = "room1"
        
        return state
    
    def save_state(self, path: str = "game_state.json"):
        with open(path, 'w') as f:
            f.write(self.state.to_json())
        logger.info(f"Game state saved to {path}")
    
    def load_state(self, path: str = "game_state.json"):
        with open(path, 'r') as f:
            data = json.load(f)
        
        # Reconstruct GameState from JSON
        state = GameState()
        state.game_id = data.get('game_id', state.game_id)
        state.start_time = data.get('start_time')
        state.end_time = data.get('end_time')
        state.time_remaining = data.get('time_remaining', state.time_remaining)
        state.hints_remaining = data.get('hints_remaining', state.hints_remaining)
        state.hints_used = data.get('hints_used', state.hints_used)
        state.current_room = data.get('current_room')
        state.trigger_history = data.get('trigger_history', [])
        state.game_complete = data.get('game_complete', False)
        state.game_over = data.get('game_over', False)
        
        # Reconstruct rooms
        state.rooms = {}
        for room_id, room_data in data.get('rooms', {}).items():
            room = Room(
                id=room_data['id'],
                name=room_data['name'],
                status=RoomStatus(room_data['status']),
                door_locked=room_data.get('door_locked', True),
                dragon_awake=room_data.get('dragon_awake', False)
            )
            
            # Reconstruct puzzles
            room.puzzles = {}
            for puzzle_id, puzzle_data in room_data.get('puzzles', {}).items():
                puzzle = Puzzle(
                    id=puzzle_data['id'],
                    name=puzzle_data['name'],
                    status=PuzzleStatus(puzzle_data['status']),
                    triggers=puzzle_data.get('triggers', []),
                    data=puzzle_data.get('data', {})
                )
                room.puzzles[puzzle_id] = puzzle
            
            state.rooms[room_id] = room
        
        self.state = state
        logger.info(f"Game state loaded from {path}")
