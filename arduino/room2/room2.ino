// Room 2: Martin's Room (The Study)
// Controls: Combination lock, jigsaw puzzle sensors, hidden compartment

#include <Keypad.h>
#include <Servo.h>

// Keypad setup (4x4 matrix)
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {2, 3, 4, 5};
byte colPins[COLS] = {6, 7, 8, 9};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// Jigsaw puzzle sensors (magnetic reed switches)
const int PUZZLE_SENSOR_COUNT = 9;  // For 9-piece puzzle
const int puzzleSensorPins[PUZZLE_SENSOR_COUNT] = {10, 11, 12, 13, A0, A1, A2, A3, A4};

// Servo for hidden compartment
Servo compartmentServo;
const int COMPARTMENT_SERVO_PIN = 14;  // Analog 0 as digital

// Electromagnetic lock for door
const int DOOR_LOCK_PIN = 15;  // Analog 1 as digital

// Status LEDs
const int STATUS_LED_PIN = 16;  // Analog 2 as digital

// Variables
String combination = "2471";  // Default combination from clue 2471Y
String enteredCode = "";
bool lockOpen = false;
bool puzzleComplete = false;
bool compartmentOpen = false;
unsigned long lastKeyTime = 0;
const unsigned long CODE_TIMEOUT = 10000;  // 10 seconds to enter code

// Serial communication
String inputString = "";
bool stringComplete = false;

void setup() {
  Serial.begin(115200);
  
  // Initialize keypad
  
  // Initialize puzzle sensors
  for (int i = 0; i < PUZZLE_SENSOR_COUNT; i++) {
    pinMode(puzzleSensorPins[i], INPUT_PULLUP);
  }
  
  // Initialize servo
  compartmentServo.attach(COMPARTMENT_SERVO_PIN);
  compartmentServo.write(0);  // Closed position
  
  // Initialize lock and LED
  pinMode(DOOR_LOCK_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  
  // Start with door locked
  digitalWrite(DOOR_LOCK_PIN, HIGH);  // HIGH = locked
  digitalWrite(STATUS_LED_PIN, LOW);
  
  // Reserve serial buffer
  inputString.reserve(200);
  
  Serial.println("ROOM2:READY");
}

void loop() {
  // Check serial commands
  if (stringComplete) {
    processCommand(inputString);
    inputString = "";
    stringComplete = false;
  }
  
  // Handle keypad input
  char key = keypad.getKey();
  if (key) {
    handleKeypress(key);
  }
  
  // Check puzzle completion
  checkPuzzle();
  
  // Check for code entry timeout
  if (enteredCode.length() > 0 && millis() - lastKeyTime > CODE_TIMEOUT) {
    enteredCode = "";
    Serial.println("CODE:TIMEOUT");
    blinkLED(3, 200);  // 3 fast blinks for timeout
  }
  
  // Update status LED
  digitalWrite(STATUS_LED_PIN, lockOpen ? HIGH : LOW);
  
  delay(10);
}

void handleKeypress(char key) {
  lastKeyTime = millis();
  
  if (key >= '0' && key <= '9') {
    // Number key
    enteredCode += key;
    Serial.print("KEY:");
    Serial.println(key);
    
    // Provide feedback
    tone(STATUS_LED_PIN, 800, 100);
    
    if (enteredCode.length() == 4) {
      // Check combination
      if (enteredCode == combination) {
        // Correct code!
        lockOpen = true;
        digitalWrite(DOOR_LOCK_PIN, LOW);  // Unlock door
        Serial.println("CODE:CORRECT");
        Serial.println("LOCK:1");
        blinkLED(5, 100);  // 5 quick blinks for success
        
        // Reset for next entry
        enteredCode = "";
      } else {
        // Incorrect code
        Serial.println("CODE:INCORRECT");
        blinkLED(2, 500);  // 2 long blinks for error
        enteredCode = "";
      }
    }
  } else if (key == '*') {
    // Clear entered code
    enteredCode = "";
    Serial.println("CODE:CLEARED");
    tone(STATUS_LED_PIN, 400, 100);
  } else if (key == '#') {
    // Force check current code (even if not 4 digits)
    if (enteredCode == combination) {
      lockOpen = true;
      digitalWrite(DOOR_LOCK_PIN, LOW);
      Serial.println("CODE:CORRECT");
      Serial.println("LOCK:1");
      blinkLED(5, 100);
    } else {
      Serial.println("CODE:INCORRECT");
      blinkLED(2, 500);
    }
    enteredCode = "";
  }
}

void checkPuzzle() {
  // Check all puzzle sensors
  int piecesPlaced = 0;
  
  for (int i = 0; i < PUZZLE_SENSOR_COUNT; i++) {
    if (digitalRead(puzzleSensorPins[i]) == LOW) {  // LOW when magnet is near (reed switch closed)
      piecesPlaced++;
    }
  }
  
  // If all pieces placed and not already complete
  if (piecesPlaced == PUZZLE_SENSOR_COUNT && !puzzleComplete) {
    puzzleComplete = true;
    Serial.println("PUZZLE:1");
    
    // Open hidden compartment
    openCompartment();
  } else if (piecesPlaced < PUZZLE_SENSOR_COUNT && puzzleComplete) {
    // Puzzle was complete but now pieces removed
    puzzleComplete = false;
    Serial.println("PUZZLE:0");
    
    // Close compartment if open
    closeCompartment();
  }
}

void openCompartment() {
  if (!compartmentOpen) {
    compartmentServo.write(90);  // Open position
    delay(500);
    compartmentOpen = true;
    Serial.println("COMPARTMENT:OPEN");
  }
}

void closeCompartment() {
  if (compartmentOpen) {
    compartmentServo.write(0);  // Closed position
    delay(500);
    compartmentOpen = false;
    Serial.println("COMPARTMENT:CLOSED");
  }
}

void blinkLED(int count, int delayMs) {
  for (int i = 0; i < count; i++) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(STATUS_LED_PIN, LOW);
    if (i < count - 1) delay(delayMs);
  }
}

void serialEvent() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    if (inChar == '\n') {
      stringComplete = true;
    } else {
      inputString += inChar;
    }
  }
}

void processCommand(String command) {
  command.trim();
  Serial.print("CMD:");
  Serial.println(command);
  
  if (command.startsWith("SET_COMBO:")) {
    String newCombo = command.substring(10);
    if (newCombo.length() == 4 && newCombo.toInt() > 0) {
      combination = newCombo;
      Serial.print("COMBO_SET:");
      Serial.println(combination);
    }
  }
  
  else if (command.startsWith("CHECK_COMBO:")) {
    String attempt = command.substring(12);
    if (attempt == combination) {
      lockOpen = true;
      digitalWrite(DOOR_LOCK_PIN, LOW);
      Serial.println("LOCK:1");
    } else {
      Serial.println("LOCK:0");
    }
  }
  
  else if (command == "OPEN_LOCK") {
    lockOpen = true;
    digitalWrite(DOOR_LOCK_PIN, LOW);
    Serial.println("LOCK:1");
  }
  
  else if (command == "GET_PUZZLE_STATUS" || command == "PUZZLE_STATUS") {
    Serial.print("PUZZLE:");
    Serial.println(puzzleComplete ? "1" : "0");
  }
  
  else if (command == "GET_COMPARTMENT_STATUS") {
    Serial.print("COMPARTMENT:");
    Serial.println(compartmentOpen ? "OPEN" : "CLOSED");
  }
  
  else if (command == "OPEN_COMPARTMENT") {
    openCompartment();
  }
  
  else if (command == "CLOSE_COMPARTMENT") {
    closeCompartment();
  }
  
  else if (command == "DOOR_UNLOCK") {
    digitalWrite(DOOR_LOCK_PIN, LOW);
    lockOpen = true;
    Serial.println("DOOR:UNLOCKED");
  }
  
  else if (command == "DOOR_LOCK") {
    digitalWrite(DOOR_LOCK_PIN, HIGH);
    lockOpen = false;
    Serial.println("DOOR:LOCKED");
  }
  
  else if (command == "PING") {
    Serial.println("PONG");
  }
  
  else if (command == "RESET") {
    // Reset all states
    combination = "2471";
    enteredCode = "";
    lockOpen = false;
    puzzleComplete = false;
    compartmentOpen = false;
    digitalWrite(DOOR_LOCK_PIN, HIGH);
    closeCompartment();
    Serial.println("RESET:DONE");
  }
  
  else if (command == "STATUS") {
    Serial.print("STATUS:LOCK=");
    Serial.print(lockOpen ? "OPEN" : "LOCKED");
    Serial.print(",PUZZLE=");
    Serial.print(puzzleComplete ? "COMPLETE" : "INCOMPLETE");
    Serial.print(",COMPARTMENT=");
    Serial.print(compartmentOpen ? "OPEN" : "CLOSED");
    Serial.print(",CODE=");
    Serial.println(combination);
  }
}