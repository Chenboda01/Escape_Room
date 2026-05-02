# Kingdom Magic: The Dragon's Fortress - Software System

This is the software system for the "Kingdom Magic: The Dragon's Fortress" escape room. It provides a complete control system for managing puzzles, sensors, and game flow through a web-based Game Master interface.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Game Master Dashboard                    │
│                 (Web Interface)                          │
└─────────────────────────────────────────────────────────┘
                            │
                            │ WebSocket / HTTP
                            ▼
┌─────────────────────────────────────────────────────────┐
│                 Game Engine (Python)                     │
│                 • Game State Management                  │
│                 • Puzzle Logic                           │
│                 • Hardware Interface                     │
└─────────────────────────────────────────────────────────┘
                            │
                            │ Serial Communication
                            ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Room 1     │  │  Room 2     │  │  Room 3     │
│  Arduino    │  │  Arduino    │  │  Arduino    │
│  • Motion   │  │  • Keypad   │  │  • Sound    │
│  • Shower   │  │  • Sensors  │  │  • Buttons  │
│  • Alarm    │  │  • Servo    │  │  • Servo    │
└─────────────┘  └─────────────┘  └─────────────┘
```

## Features

### 1. Game Master Dashboard
- Real-time game status monitoring
- Puzzle progress tracking
- Hint management (5 hints per game)
- Manual override controls
- Dragon wake-up simulation
- Timer display with visual warnings

### 2. Hardware Integration
- **Room 1 (Restroom)**: Motion sensor, shower mechanism, alarm
- **Room 2 (Study)**: 4-digit keypad, jigsaw puzzle sensors, hidden compartment servo
- **Room 3 (Dragon's Lair)**: Sound sensor, color-coded buttons, dragon effects (LEDs, sound)

### 3. Game Flow Automation
- Automatic puzzle state tracking
- Room-to-room progression
- Time limit enforcement (90 minutes)
- Win/loss condition detection

## Installation

### Prerequisites
- Python 3.8+
- Arduino IDE (for uploading sketches to microcontrollers)
- 3x Arduino boards (Uno/Mega recommended)
- Required electronic components (see Hardware Setup)

### 1. Software Setup
```bash
# Clone repository (if applicable)
# git clone <repository-url>
# cd escape-room-system

# Install Python dependencies
pip install -r requirements.txt

# Configure the system
cp config/game_config.yaml.example config/game_config.yaml
# Edit config/game_config.yaml with your settings
```

### 2. Hardware Setup
#### Required Components:
- **Room 1**:
  - PIR motion sensor (HC-SR501)
  - Potentiometer (for shower mechanism)
  - Servo motor
  - LED and buzzer (for alarm)
  - Electromagnetic lock (for door)

- **Room 2**:
  - 4x4 matrix keypad
  - 9x magnetic reed switches (for jigsaw puzzle)
  - Servo motor (for hidden compartment)
  - Electromagnetic lock

- **Room 3**:
  - Sound sensor module (KY-038)
  - 4x push buttons (Yellow, Blue, Red, Green)
  - RGB LED strip (for dragon effects)
  - Speaker (for dragon roar)
  - Servo motor (for color-coded box)
  - Electromagnetic lock (for exit door)

#### Arduino Setup:
1. Install Arduino IDE from https://www.arduino.cc/
2. Install required libraries:
   - `Keypad` library (for Room 2)
   - `Servo` library (built-in)
3. Upload sketches:
   ```bash
   # Upload Room 1 sketch
   arduino-cli compile --fqbn arduino:avr:uno arduino/room1/
   arduino-cli upload -p /dev/ttyUSB0 --fqbn arduino:avr:uno arduino/room1/
   
   # Upload Room 2 sketch  
   arduino-cli compile --fqbn arduino:avr:uno arduino/room2/
   arduino-cli upload -p /dev/ttyUSB1 --fqbn arduino:avr:uno arduino/room2/
   
   # Upload Room 3 sketch
   arduino-cli compile --fqbn arduino:avr:uno arduino/room3/
   arduino-cli upload -p /dev/ttyUSB2 --fqbn arduino:avr:uno arduino/room3/
   ```

### 3. Configuration
Edit `config/game_config.yaml`:
```yaml
GAME:
  name: "Kingdom Magic: The Dragon's Fortress"
  max_time_minutes: 90
  max_hints: 5
  
HARDWARE:
  serial_ports:
    room1: "/dev/ttyUSB0"  # Update with your ports
    room2: "/dev/ttyUSB1"
    room3: "/dev/ttyUSB2"
  baud_rate: 115200
  
WEB:
  host: "0.0.0.0"
  port: 5000
  debug: false
```

## Usage

### Starting the System
```bash
# Start the main system
python main.py

# Or run in simulation mode (no hardware required)
python -m web_interface.app
```

### Accessing the Dashboard
1. Start the system
2. Open web browser to: `http://localhost:5000`
3. Use the Game Master dashboard to:
   - Start/Reset games
   - Monitor puzzle progress
   - Give hints to players
   - Manually control doors and effects

### Game Flow
1. **Game Master** reads the lore to players
2. **Players** enter Room 1 (Restroom)
3. As players solve puzzles, the Game Master marks them solved in the dashboard
4. When all Room 1 puzzles are solved, the door to Room 2 unlocks
5. Process repeats for Room 2 and Room 3
6. If players solve all puzzles within 90 minutes, they escape!

### Testing Without Hardware
The system includes a simulation mode:
```bash
# Run tests
python test_system.py

# Start web interface without hardware
python -m web_interface.app
```

## API Endpoints

### Game Control
- `POST /api/game/start` - Start a new game
- `POST /api/game/reset` - Reset game to initial state
- `POST /api/game/hint` - Use a hint
- `GET /api/game/state` - Get current game state

### Puzzle Management
- `POST /api/puzzle/solve` - Mark a puzzle as solved
- `POST /api/door/unlock` - Unlock a room door

### Special Effects
- `POST /api/dragon/wake` - Wake the dragon (Room 3)
- `POST /api/dragon/calm` - Calm the dragon

### WebSocket Events
- `game_state` - Full game state update
- `time_update` - Timer updates
- `puzzle_solved` - Puzzle completion
- `door_unlocked` - Door status change
- `dragon_woke` - Dragon wake-up event

## Arduino Communication Protocol

### Command Format
```
COMMAND[:PARAM1][:PARAM2]\n
```

### Example Commands
```
MOTION_STATUS           # Get motion sensor status
SHOWER_POS:75           # Set shower position to 75%
SET_COMBO:2471          # Set combination lock code to 2471
WAKE_DRAGON             # Trigger dragon wake-up
```

### Response Format
```
COMMAND:VALUE\n
COMMAND:KEY:VALUE\n
```

### Example Responses
```
MOTION:1                # Motion detected
SHOWER:75               # Shower position is 75%
LOCK:1                  # Lock is open
DRAGON:1                # Dragon is awake
```

## Customization

### Adding New Puzzles
1. Update `config/game_config.yaml` with new puzzle definition
2. Add Arduino code to handle puzzle hardware
3. Update web interface if needed

### Modifying Game Flow
Edit the game logic in `game_engine/game_state.py`:
- Puzzle dependencies
- Room completion conditions
- Win/loss logic

### Changing Hardware
Update the hardware interface in `game_engine/devices/hardware_interface.py`:
- Add new device types
- Modify communication protocol
- Add simulation support

## Troubleshooting

### Common Issues

1. **Arduino not connecting**
   - Check serial port permissions: `sudo chmod 666 /dev/ttyUSB*`
   - Verify baud rate matches (115200)
   - Check USB cable and power

2. **Web interface not loading**
   - Check if server is running: `curl http://localhost:5000/api/game/state`
   - Verify firewall allows port 5000
   - Check Python dependencies: `pip list | grep Flask`

3. **Puzzles not updating**
   - Check WebSocket connection (green dot in dashboard)
   - Verify game is started
   - Check browser console for errors (F12)

4. **Hardware not responding**
   - Run in simulation mode first
   - Check Arduino serial monitor for responses
   - Verify wiring and power supply

### Debug Mode
Enable debug logging:
```python
# In config/game_config.yaml
WEB:
  debug: true

# Or set environment variable
export FLASK_DEBUG=1
```

## Development

### Project Structure
```
├── main.py                 # Main system entry point
├── requirements.txt        # Python dependencies
├── config/
│   └── game_config.yaml   # Game configuration
├── game_engine/           # Core game logic
│   ├── game_state.py      # Game state management
│   └── devices/           # Hardware interfaces
├── web_interface/         # Game Master dashboard
│   ├── app.py             # Flask application
│   ├── templates/         # HTML templates
│   └── static/            # CSS/JS assets
├── arduino/               # Microcontroller code
│   ├── room1/             # Restroom controls
│   ├── room2/             # Study controls
│   └── room3/             # Dragon's Lair controls
├── docs/                  # Documentation
└── tests/                 # Test scripts
```

### Running Tests
```bash
# Run all tests
python test_system.py

# Test game logic only
python -m pytest tests/ -v

# Test web interface
python -m pytest tests/test_web.py -v
```

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Game design by Martin, Heidi, and Kaikai Chen
- System architecture by Boda Chen
- Built with Python, Flask, Socket.IO, and Arduino