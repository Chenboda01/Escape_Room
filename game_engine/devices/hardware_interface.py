import serial
import time
import threading
import logging
from enum import Enum
from typing import Optional, Callable, Dict, Any

logger = logging.getLogger(__name__)

class DeviceCommand(Enum):
    """Commands that can be sent to Arduino devices"""
    # Room 1 commands
    GET_MOTION_STATUS = "MOTION_STATUS"
    RESET_MOTION = "RESET_MOTION"
    SET_SHOWER_POSITION = "SHOWER_POS"
    GET_SHOWER_POSITION = "GET_SHOWER"
    TRIGGER_ALARM = "ALARM"
    
    # Room 2 commands  
    SET_COMBINATION = "SET_COMBO"
    CHECK_COMBINATION = "CHECK_COMBO"
    OPEN_LOCK = "OPEN_LOCK"
    GET_PUZZLE_STATUS = "PUZZLE_STATUS"
    
    # Room 3 commands
    GET_SOUND_LEVEL = "SOUND_LEVEL"
    SET_SOUND_THRESHOLD = "SET_THRESHOLD"
    WAKE_DRAGON = "WAKE_DRAGON"
    CALM_DRAGON = "CALM_DRAGON"
    SET_COLOR_SEQUENCE = "SET_COLORS"
    CHECK_COLOR_INPUT = "CHECK_COLOR"
    UNLOCK_EXIT = "UNLOCK_EXIT"
    LOCK_EXIT = "LOCK_EXIT"
    OPEN_BOX = "OPEN_BOX"
    CLOSE_BOX = "CLOSE_BOX"
    RESET_COLOR_INPUT = "RESET_COLOR_INPUT"
    GET_COMPARTMENT_STATUS = "GET_COMPARTMENT_STATUS"
    
    # General commands
    PING = "PING"
    RESET = "RESET"
    GET_STATUS = "STATUS"

class ArduinoInterface:
    """Interface for communicating with Arduino devices"""
    
    def __init__(self, port: str, baud_rate: int = 115200, timeout: float = 1.0):
        self.port = port
        self.baud_rate = baud_rate
        self.timeout = timeout
        self.serial: Optional[serial.Serial] = None
        self.connected = False
        self.callbacks: Dict[str, Callable] = {}
        self.read_thread: Optional[threading.Thread] = None
        self.running = False
        
    def connect(self) -> bool:
        """Connect to the Arduino"""
        try:
            self.serial = serial.Serial(
                port=self.port,
                baudrate=self.baud_rate,
                timeout=self.timeout
            )
            time.sleep(2)  # Wait for Arduino to reset
            self.connected = True
            self.running = True
            self.start_read_thread()
            logger.info(f"Connected to Arduino on {self.port}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Arduino on {self.port}: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from the Arduino"""
        self.running = False
        if self.read_thread:
            self.read_thread.join(timeout=2)
        if self.serial and self.serial.is_open:
            self.serial.close()
        self.connected = False
        logger.info(f"Disconnected from Arduino on {self.port}")
    
    def start_read_thread(self):
        """Start background thread to read from serial"""
        self.read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self.read_thread.start()
    
    def _read_loop(self):
        """Background thread to read serial data"""
        buffer = ""
        while self.running and self.serial and self.serial.is_open:
            try:
                if self.serial.in_waiting:
                    data = self.serial.read(self.serial.in_waiting).decode('utf-8', errors='ignore')
                    buffer += data
                    
                    # Process complete lines
                    while '\n' in buffer:
                        line, buffer = buffer.split('\n', 1)
                        line = line.strip()
                        if line:
                            self._process_line(line)
            except Exception as e:
                logger.error(f"Error reading from serial: {e}")
                time.sleep(0.1)
    
    def _process_line(self, line: str):
        """Process a line received from Arduino"""
        logger.debug(f"Received from Arduino: {line}")
        
        # Parse the line (format: COMMAND:VALUE or COMMAND:KEY:VALUE)
        if ':' in line:
            parts = line.split(':', 2)
            command = parts[0]
            
            # Trigger callback if registered
            if command in self.callbacks:
                try:
                    if len(parts) == 2:
                        self.callbacks[command](parts[1])
                    elif len(parts) == 3:
                        self.callbacks[command](parts[1], parts[2])
                    else:
                        self.callbacks[command](line)
                except Exception as e:
                    logger.error(f"Error in callback for command {command}: {e}")
            
            # Log specific events
            if command == "MOTION":
                logger.info(f"Motion detected: {parts[1]}")
            elif command == "SOUND":
                logger.info(f"Sound level: {parts[1]} dB")
            elif command == "ALARM":
                logger.warning(f"Alarm triggered: {parts[1]}")
    
    def send_command(self, command: DeviceCommand, *args) -> bool:
        """Send a command to the Arduino"""
        if not self.connected or not self.serial:
            logger.error("Not connected to Arduino")
            return False
        
        try:
            # Build command string
            cmd_str = command.value
            if args:
                cmd_str += ":" + ":".join(str(arg) for arg in args)
            cmd_str += "\n"
            
            # Send command
            self.serial.write(cmd_str.encode('utf-8'))
            self.serial.flush()
            logger.debug(f"Sent to Arduino: {cmd_str.strip()}")
            return True
        except Exception as e:
            logger.error(f"Error sending command to Arduino: {e}")
            return False
    
    def register_callback(self, command: str, callback: Callable):
        """Register a callback for a specific command"""
        self.callbacks[command] = callback
    
    def ping(self) -> bool:
        """Ping the Arduino to check connection"""
        return self.send_command(DeviceCommand.PING)

class Room1Controller:
    """Controller for Room 1 (Restroom) hardware"""
    
    def __init__(self, arduino: ArduinoInterface, event_callback: Optional[Callable[[str, str, Dict[str, Any]], None]] = None):
        self.arduino = arduino
        self.event_callback = event_callback
        self.motion_detected = False
        self.shower_position = 0
        self.alarm_active = False
        
        # Register callbacks
        self.arduino.register_callback("MOTION", self._on_motion)
        self.arduino.register_callback("SHOWER", self._on_shower_change)
        self.arduino.register_callback("ALARM", self._on_alarm)
    
    def _on_motion(self, value: str):
        """Callback for motion detection"""
        self.motion_detected = value == "1"
        self._emit_event("motion", {"detected": self.motion_detected})
        logger.info(f"Motion detection: {self.motion_detected}")
    
    def _on_shower_change(self, value: str):
        """Callback for shower position change"""
        try:
            self.shower_position = int(value)
            self._emit_event("shower_position", {"position": self.shower_position})
            logger.info(f"Shower position changed to: {self.shower_position}")
        except ValueError:
            logger.error(f"Invalid shower position value: {value}")
    
    def _on_alarm(self, value: str):
        """Callback for alarm"""
        self.alarm_active = value == "1"
        self._emit_event("alarm", {"active": self.alarm_active})
        logger.info(f"Alarm active: {self.alarm_active}")

    def _emit_event(self, event_type: str, payload: Dict[str, Any]):
        if self.event_callback:
            self.event_callback("room1", event_type, payload)
    
    def get_motion_status(self) -> bool:
        """Get current motion detection status"""
        self.arduino.send_command(DeviceCommand.GET_MOTION_STATUS)
        return self.motion_detected
    
    def reset_motion_sensor(self):
        """Reset motion sensor"""
        self.arduino.send_command(DeviceCommand.RESET_MOTION)
    
    def set_shower_position(self, position: int):
        """Set shower position (simulate player input)"""
        if 0 <= position <= 100:
            if self.arduino.connected:
                self.arduino.send_command(DeviceCommand.SET_SHOWER_POSITION, position)
            self._on_shower_change(str(position))
    
    def trigger_alarm(self, duration_ms: int = 2000):
        """Trigger alarm for specified duration"""
        self.arduino.send_command(DeviceCommand.TRIGGER_ALARM, duration_ms)

class Room2Controller:
    """Controller for Room 2 (Study) hardware"""
    
    def __init__(self, arduino: ArduinoInterface, event_callback: Optional[Callable[[str, str, Dict[str, Any]], None]] = None):
        self.arduino = arduino
        self.event_callback = event_callback
        self.combination = "0000"
        self.lock_open = False
        self.puzzle_complete = False
        
        # Register callbacks
        self.arduino.register_callback("LOCK", self._on_lock)
        self.arduino.register_callback("PUZZLE", self._on_puzzle)
    
    def _on_lock(self, value: str):
        """Callback for lock status"""
        self.lock_open = value == "1"
        self._emit_event("lock", {"open": self.lock_open})
        logger.info(f"Lock status: {'Open' if self.lock_open else 'Closed'}")
    
    def _on_puzzle(self, value: str):
        """Callback for puzzle status"""
        self.puzzle_complete = value == "1"
        self._emit_event("puzzle", {"complete": self.puzzle_complete})
        logger.info(f"Puzzle status: {'Complete' if self.puzzle_complete else 'Incomplete'}")

    def _emit_event(self, event_type: str, payload: Dict[str, Any]):
        if self.event_callback:
            self.event_callback("room2", event_type, payload)
    
    def set_combination(self, combination: str):
        """Set the combination for the lock"""
        if len(combination) == 4 and combination.isdigit():
            self.combination = combination
            self.arduino.send_command(DeviceCommand.SET_COMBINATION, combination)
    
    def check_combination(self, attempt: str) -> bool:
        """Check if combination is correct"""
        if self.arduino.connected:
            self.arduino.send_command(DeviceCommand.CHECK_COMBINATION, attempt)

        is_correct = attempt == self.combination
        self._on_lock("1" if is_correct else "0")
        return is_correct
    
    def open_lock(self):
        """Open the lock"""
        if self.arduino.connected:
            self.arduino.send_command(DeviceCommand.OPEN_LOCK)
        self._on_lock("1")
    
    def get_puzzle_status(self) -> bool:
        """Get jigsaw puzzle completion status"""
        self.arduino.send_command(DeviceCommand.GET_PUZZLE_STATUS)
        return self.puzzle_complete

class Room3Controller:
    """Controller for Room 3 (Dragon's Lair) hardware"""
    
    def __init__(self, arduino: ArduinoInterface, event_callback: Optional[Callable[[str, str, Dict[str, Any]], None]] = None):
        self.arduino = arduino
        self.event_callback = event_callback
        self.sound_level = 0
        self.sound_threshold = 70  # dB
        self.dragon_awake = False
        self.color_sequence = ["Y", "B", "B", "G"]  # Default from clues
        self.color_input = []
        self.exit_unlocked = False
        
        # Register callbacks
        self.arduino.register_callback("SOUND", self._on_sound)
        self.arduino.register_callback("DRAGON", self._on_dragon)
        self.arduino.register_callback("COLOR", self._on_color)
        self.arduino.register_callback("EXIT", self._on_exit)
    
    def _on_sound(self, value: str):
        """Callback for sound level"""
        try:
            self.sound_level = int(value)
            self._emit_event("sound", {"level": self.sound_level})
            logger.info(f"Sound level: {self.sound_level} dB")
            
            # Check if sound exceeds threshold
            if self.sound_level > self.sound_threshold and not self.dragon_awake:
                self.wake_dragon()
        except ValueError:
            logger.error(f"Invalid sound value: {value}")
    
    def _on_dragon(self, value: str):
        """Callback for dragon status"""
        self.dragon_awake = value == "1"
        self._emit_event("dragon", {"awake": self.dragon_awake})
        logger.info(f"Dragon status: {'Awake' if self.dragon_awake else 'Asleep'}")
    
    def _on_color(self, key: str, value: str):
        """Callback for color input"""
        if key == "INPUT":
            self.color_input.append(value)
            self._emit_event("color_input", {"value": value, "sequence": list(self.color_input)})
            logger.info(f"Color input: {value}, sequence: {self.color_input}")
            
            # Check if sequence is complete
            if len(self.color_input) == len(self.color_sequence):
                if self.color_input == self.color_sequence:
                    logger.info("Color sequence correct!")
                    self.unlock_exit_door()
                else:
                    logger.info("Color sequence incorrect, resetting")
                    self.color_input = []
    
    def _on_exit(self, value: str):
        """Callback for exit status"""
        self.exit_unlocked = value == "UNLOCKED"
        self._emit_event("exit", {"unlocked": self.exit_unlocked})
        logger.info(f"Exit door: {'Unlocked' if self.exit_unlocked else 'Locked'}")

    def _emit_event(self, event_type: str, payload: Dict[str, Any]):
        if self.event_callback:
            self.event_callback("room3", event_type, payload)

    def unlock_exit_door(self):
        """Unlock the exit door"""
        if self.arduino.connected:
            self.arduino.send_command(DeviceCommand.UNLOCK_EXIT)
        self._on_exit("UNLOCKED")

    def get_sound_level(self) -> int:
        """Get current sound level"""
        self.arduino.send_command(DeviceCommand.GET_SOUND_LEVEL)
        return self.sound_level
    
    def set_sound_threshold(self, threshold: int):
        """Set sound threshold for dragon wake-up"""
        self.sound_threshold = threshold
        if self.arduino.connected:
            self.arduino.send_command(DeviceCommand.SET_SOUND_THRESHOLD, threshold)
    
    def wake_dragon(self):
        """Wake the dragon (trigger effects)"""
        self.dragon_awake = True
        if self.arduino.connected:
            self.arduino.send_command(DeviceCommand.WAKE_DRAGON)
        self._emit_event("dragon", {"awake": True})
    
    def calm_dragon(self):
        """Calm the dragon back to sleep"""
        self.dragon_awake = False
        if self.arduino.connected:
            self.arduino.send_command(DeviceCommand.CALM_DRAGON)
        self._emit_event("dragon", {"awake": False})
    
    def set_color_sequence(self, sequence: list):
        """Set the correct color sequence"""
        self.color_sequence = sequence
        if self.arduino.connected:
            self.arduino.send_command(DeviceCommand.SET_COLOR_SEQUENCE, *sequence)
    
    def check_color_input(self, color: str):
        """Check color input (called when player presses a color button)"""
        if self.arduino.connected:
            self.arduino.send_command(DeviceCommand.CHECK_COLOR_INPUT, color)
        self._on_color("INPUT", color)

class HardwareManager:
    """Manager for all hardware controllers"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.arduinos: Dict[str, ArduinoInterface] = {}
        self.controllers: Dict[str, Any] = {}
        self.game_state = None
        self.initialized = False

    def register_game_state(self, game_state: Any):
        """Register game state so hardware callbacks can update progression."""
        self.game_state = game_state

    def _create_room_controller(self, room_id: str, arduino: ArduinoInterface):
        event_callback = self._handle_controller_event
        if room_id == 'room1':
            return Room1Controller(arduino, event_callback)
        if room_id == 'room2':
            return Room2Controller(arduino, event_callback)
        if room_id == 'room3':
            return Room3Controller(arduino, event_callback)
        return None

    def _ensure_simulation_controllers(self):
        for room_id in ('room1', 'room2', 'room3'):
            if room_id not in self.controllers:
                port = self.config.get('serial_ports', {}).get(room_id, f'simulated_{room_id}')
                self.controllers[room_id] = self._create_room_controller(room_id, ArduinoInterface(port, self.config.get('baud_rate', 115200)))

    def _handle_controller_event(self, room_id: str, event_type: str, payload: Dict[str, Any]):
        if not self.game_state:
            return

        room = self.game_state.rooms.get(room_id)
        if not room:
            return

        def update_puzzle_data(puzzle_id: str, **values: Any):
            puzzle = room.puzzles.get(puzzle_id)
            if puzzle:
                puzzle.data.update(values)

        if room_id == 'room1':
            if event_type == 'motion':
                update_puzzle_data('hidden_message', motion_detected=payload.get('detected', False))
            elif event_type == 'shower_position':
                update_puzzle_data('shower_mechanism', position=payload.get('position'))
            elif event_type == 'alarm':
                update_puzzle_data('hidden_message', alarm_active=payload.get('active', False))

        if room_id == 'room2':
            if event_type == 'lock' and payload.get('open'):
                update_puzzle_data('number_lock', lock_open=True)
            elif event_type == 'puzzle':
                update_puzzle_data('jigsaw_puzzle', complete=payload.get('complete', False))

        if room_id == 'room3':
            if event_type == 'sound':
                update_puzzle_data('mirror_clue', sound_level=payload.get('level', 0))
            elif event_type == 'dragon':
                room.dragon_awake = payload.get('awake', False)
            elif event_type == 'exit' and payload.get('unlocked'):
                exit_puzzle = room.puzzles.get('exit_door')
                if exit_puzzle and exit_puzzle.status.value == 'locked':
                    self.game_state._set_puzzle_available('exit_door')
        
    def initialize(self):
        """Initialize all hardware connections"""
        try:
            # Create Arduino interfaces for each room
            for room, port in self.config.get('serial_ports', {}).items():
                arduino = ArduinoInterface(port, self.config.get('baud_rate', 115200))
                if arduino.connect():
                    self.arduinos[room] = arduino
                    logger.info(f"Connected {room} Arduino on {port}")
                else:
                    logger.error(f"Failed to connect {room} Arduino on {port}")
            
            # Create room controllers
            if 'room1' in self.arduinos:
                self.controllers['room1'] = self._create_room_controller('room1', self.arduinos['room1'])
            
            if 'room2' in self.arduinos:
                self.controllers['room2'] = self._create_room_controller('room2', self.arduinos['room2'])
            
            if 'room3' in self.arduinos:
                self.controllers['room3'] = self._create_room_controller('room3', self.arduinos['room3'])
            
            self.initialized = len(self.arduinos) > 0
            return self.initialized
            
        except Exception as e:
            logger.error(f"Failed to initialize hardware: {e}")
            return False
    
    def shutdown(self):
        """Shutdown all hardware connections"""
        for arduino in self.arduinos.values():
            arduino.disconnect()
        self.arduinos.clear()
        self.controllers.clear()
        self.initialized = False
        logger.info("Hardware manager shutdown complete")
    
    def get_controller(self, room: str):
        """Get controller for a specific room"""
        return self.controllers.get(room)
    
    def simulate_puzzle_solve(self, room: str, puzzle: str):
        """Simulate puzzle solving (for testing without hardware)"""
        logger.info(f"Simulating puzzle solve: {room}.{puzzle}")
        self._ensure_simulation_controllers()

        if room not in self.controllers:
            raise ValueError(f"Unknown room for simulation: {room}")

        controller = self.controllers[room]

        if room == 'room1':
            if puzzle == 'hidden_message':
                controller._on_motion('1')
            elif puzzle == 'shower_mechanism':
                controller.set_shower_position(100)
        elif room == 'room2':
            if puzzle == 'number_lock':
                controller.check_combination(controller.combination)
            elif puzzle == 'jigsaw_puzzle':
                controller._on_puzzle('1')
        elif room == 'room3':
            if puzzle == 'mirror_clue':
                controller._on_sound('50')
            elif puzzle == 'hidden_key':
                controller._on_sound(str(max(0, controller.sound_threshold - 10)))
            elif puzzle == 'color_box':
                for color in controller.color_sequence:
                    controller.check_color_input(color)
            elif puzzle == 'exit_door':
                controller.unlock_exit_door()

        if self.game_state:
            return self.game_state.solve_puzzle(room, puzzle)

        return True
