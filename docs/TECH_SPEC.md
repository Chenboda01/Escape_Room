# Kingdom Magic: The Dragon's Fortress - Technical Specification

## Overview
This document outlines the technical implementation for the escape room "Kingdom Magic: The Dragon's Fortress". The room requires software-controlled locks, sensor integration, and puzzle automation.

## Puzzle Flow & Tech Integration Points

### Room 1: The Restroom (Starting Room)
1. **Motion Sensor** (scare effect)
   - Purpose: Detect movement in specific area, trigger alarm sound/light
   - Tech: PIR motion sensor + microcontroller + sound module/LED
   - Behavior: When motion detected, play short alarm sound (2-3 sec) and flash LED
   - Reset: Automatically resets after trigger, can be triggered multiple times

2. **Shower Mechanism** (mechanical puzzle)
   - Purpose: Faucet turned to correct position triggers next clue
   - Tech: Rotary encoder or multi-position switch connected to microcontroller
   - Behavior: When correct combination is set (e.g., hot/cold positions), trigger relay to release clue (e.g., open small compartment, light LED, play sound)
   - Could use a simple 3-position switch (left/middle/right) with specific sequence

3. **Door Lock to Room 2**
   - Purpose: Electromagnetic lock controlled by solving Room 1 puzzles
   - Tech: 12V electromagnetic lock + relay + microcontroller
   - Unlock condition: Math puzzle solution entered via keypad OR automatic when all Room 1 puzzles complete

### Room 2: Martin's Room (The Study)
1. **Combination Lock Box**
   - Purpose: Number lock that opens with code from clues
   - Tech: Digital keypad (4-digit) + microcontroller + servo motor to release latch
   - Alternative: Use a physical combination lock modified with servo to auto-open

2. **Jigsaw Puzzle Completion Detection**
   - Purpose: Detect when all puzzle pieces placed correctly
   - Tech options:
     a) Magnetic reed switches under each piece position
     b) Light sensors (pieces block light when placed)
     c) Capacitive sensing (pieces conduct)
   - Recommendation: Magnetic reed switches (simple, reliable)

3. **Hidden Compartment Release**
   - Purpose: Open compartment when jigsaw puzzle complete
   - Tech: Servo motor + latch mechanism
   - Controlled by microcontroller that monitors puzzle completion sensors

4. **Door Lock to Room 3**
   - Purpose: Password-protected door (from compartment)
   - Tech: Keypad + electromagnetic lock OR RFID reader if password is card/scroll

### Room 3: Heidi's Room (Dragon's Lair)
1. **Decibel Sensor** (dragon wake-up effect)
   - Purpose: Measure sound level, trigger dragon wake-up if too loud
   - Tech: Sound sensor module (e.g., KY-038) + microcontroller
   - Behavior: When sound threshold exceeded, trigger:
     - Red flashing LEDs
     - Dragon roaring sound effect via speaker
     - Optional: "Dragon wakes up" announcement
   - Sensitivity adjustable via potentiometer or software

2. **Color-coded Box Lock**
   - Purpose: Box with color-coded locks using clues from previous rooms
   - Tech: 4 buttons (Y, B, R, G) or colored capacitive touch sensors
   - Sequence: Yellow, Blue, Blue, Green (from clues: 2471Y, 3472B, 4573B, 4684G)
   - When correct sequence entered, servo releases key compartment

3. **Exit Door Lock**
   - Purpose: Final escape door
   - Tech: Electromagnetic lock released when key retrieved (physical key) OR when box opened

## Central Control System
- **Microcontroller Options**:
  - Arduino Mega (multiple I/O pins)
  - Raspberry Pi (more processing, WiFi capabilities)
  - Multiple Arduino Nanos per room + central Raspberry Pi

- **Communication**:
  - I2C or serial between room controllers
  - WiFi/Ethernet for Game Master interface

- **Game Master Interface**:
  - Web interface to monitor puzzle progress
  - Manual override for locks
  - Reset all systems for next group
  - Hint delivery system (could trigger screens/lights)

## Shopping List

### Electronics
1. Microcontrollers:
   - Arduino Mega 2560 (x1) or Raspberry Pi 4 (x1)
   - Arduino Nanos (x3, one per room) - optional

2. Sensors:
   - PIR motion sensor (HC-SR501) - Room 1
   - Sound sensor module (KY-038) - Room 3
   - Magnetic reed switches (xN for jigsaw puzzle) - Room 2
   - Rotary encoder or multi-position switch - Room 1 shower

3. Actuators:
   - 12V Electromagnetic locks (x3 for doors)
   - Servo motors (SG90 or MG90, x3 for compartments)
   - 5V/12V Relays modules (x4)

4. Input/Output:
   - 4x4 matrix keypad (for combination locks)
   - LED strips (red for dragon, blue for clues)
   - Buttons (colored for color puzzle)
   - Speakers + audio amplifier

5. Power:
   - 12V power supply for electromagnetic locks
   - 5V power supply for microcontrollers
   - Voltage regulators

6. Miscellaneous:
   - Jumper wires, breadboards, prototype boards
   - Enclosures for electronics
   - Screws, brackets

### Props & Materials (from README)
- Decibel sensor (covered by sound sensor)
- Motion sensor (covered by PIR)
- TV screen (optional for hints)
- X locks (electromagnetic locks)
- Invisible ink + UV light
- Paper, LED (cornflower blue)
- Construction paper, pencils, etc.

## Implementation Phases

### Phase 1: Prototyping
1. Test individual components (sensors, actuators)
2. Create proof-of-concept for each puzzle mechanism
3. Develop basic Arduino sketches for each puzzle

### Phase 2: Room Integration
1. Build and test Room 1 system
2. Build and test Room 2 system  
3. Build and test Room 3 system
4. Integrate room-to-room communication

### Phase 3: Game Flow
1. Implement game state machine
2. Create Game Master interface
3. Add reset functionality
4. Test full game flow

### Phase 4: Installation
1. Mount electronics securely
2. Conceal wiring
3. Final testing with players

## Safety Considerations
- All electrical systems low voltage (5V/12V)
- Proper insulation and protection
- Emergency manual override for all locks
- Fire safety compliance

## Budget Estimate
- Electronics: $150-$250
- Locks and hardware: $100-$150
- Props and materials: $50-$100
- Contingency: $50

Total: $350-$550

## Next Steps
1. Finalize puzzle designs
2. Purchase components
3. Start prototyping Room 1 motion sensor and shower mechanism
4. Develop code framework