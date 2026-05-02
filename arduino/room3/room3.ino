// Room 3: Heidi's Room (The Dragon's Lair)
// Controls: Sound sensor, dragon effects, color-coded box, exit door

#include <Servo.h>

// Sound sensor
const int SOUND_SENSOR_PIN = A0;
const int SOUND_THRESHOLD_DEFAULT = 500;  // Adjust based on calibration

// Color buttons (Y, B, R, G)
const int COLOR_BUTTON_YELLOW = 2;
const int COLOR_BUTTON_BLUE = 3;
const int COLOR_BUTTON_RED = 4;
const int COLOR_BUTTON_GREEN = 5;

// Dragon effects
const int DRAGON_LED_RED = 6;
const int DRAGON_LED_GREEN = 7;
const int DRAGON_LED_BLUE = 8;
const int DRAGON_SOUND_PIN = 9;  // For playing roar via speaker

// Box servo
Servo boxServo;
const int BOX_SERVO_PIN = 10;

// Exit door lock
const int EXIT_DOOR_LOCK_PIN = 11;

// Status indicators
const int STATUS_LED_PIN = 13;

// Variables
int soundThreshold = SOUND_THRESHOLD_DEFAULT;
int soundLevel = 0;
bool dragonAwake = false;
unsigned long dragonWakeTime = 0;
const unsigned long DRAGON_AWAKE_DURATION = 10000;  // 10 seconds

String colorSequence[4] = {"Y", "B", "B", "G"};  // From clues
String colorInput[4];
int colorInputIndex = 0;
bool boxOpen = false;
bool exitUnlocked = false;

// Serial communication
String inputString = "";
bool stringComplete = false;

// Sound sampling
unsigned long lastSoundSample = 0;
const unsigned long SOUND_SAMPLE_INTERVAL = 100;  // 100ms

void setup() {
  Serial.begin(115200);
  
  // Initialize pins
  pinMode(COLOR_BUTTON_YELLOW, INPUT_PULLUP);
  pinMode(COLOR_BUTTON_BLUE, INPUT_PULLUP);
  pinMode(COLOR_BUTTON_RED, INPUT_PULLUP);
  pinMode(COLOR_BUTTON_GREEN, INPUT_PULLUP);
  
  pinMode(DRAGON_LED_RED, OUTPUT);
  pinMode(DRAGON_LED_GREEN, OUTPUT);
  pinMode(DRAGON_LED_BLUE, OUTPUT);
  pinMode(DRAGON_SOUND_PIN, OUTPUT);
  
  pinMode(EXIT_DOOR_LOCK_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  
  // Initialize servo
  boxServo.attach(BOX_SERVO_PIN);
  boxServo.write(0);  // Closed position
  
  // Start with door locked
  digitalWrite(EXIT_DOOR_LOCK_PIN, HIGH);  // HIGH = locked
  
  // Turn off dragon LEDs
  setDragonLED(false);
  
  // Reserve serial buffer
  inputString.reserve(200);
  
  Serial.println("ROOM3:READY");
}

void loop() {
  // Check serial commands
  if (stringComplete) {
    processCommand(inputString);
    inputString = "";
    stringComplete = false;
  }
  
  // Sample sound level
  if (millis() - lastSoundSample >= SOUND_SAMPLE_INTERVAL) {
    sampleSound();
    lastSoundSample = millis();
  }
  
  // Check color buttons
  checkColorButtons();
  
  // Handle dragon awake state
  if (dragonAwake) {
    if (millis() - dragonWakeTime >= DRAGON_AWAKE_DURATION) {
      calmDragon();
    } else {
      // Pulsing red effect while dragon awake
      int pulse = (millis() / 100) % 10;
      analogWrite(DRAGON_LED_RED, pulse < 5 ? 255 : 100);
    }
  }
  
  // Update status LED
  digitalWrite(STATUS_LED_PIN, exitUnlocked ? HIGH : LOW);
  
  delay(10);
}

void sampleSound() {
  // Read sound sensor
  int sample = analogRead(SOUND_SENSOR_PIN);
  
  // Simple peak detection
  static int lastSample = 0;
  int delta = abs(sample - lastSample);
  lastSample = sample;
  
  // Update sound level (smoothed)
  soundLevel = (soundLevel * 0.7) + (delta * 0.3);
  
  // Check if sound exceeds threshold and dragon is asleep
  if (soundLevel > soundThreshold && !dragonAwake) {
    wakeDragon();
  }
  
  // Send sound level periodically
  static unsigned long lastReport = 0;
  if (millis() - lastReport >= 1000) {
    Serial.print("SOUND:");
    Serial.println((int)soundLevel);
    lastReport = millis();
  }
}

void checkColorButtons() {
  static bool lastYellow = HIGH, lastBlue = HIGH, lastRed = HIGH, lastGreen = HIGH;
  
  bool yellow = digitalRead(COLOR_BUTTON_YELLOW);
  bool blue = digitalRead(COLOR_BUTTON_BLUE);
  bool red = digitalRead(COLOR_BUTTON_RED);
  bool green = digitalRead(COLOR_BUTTON_GREEN);
  
  // Check for button presses (LOW when pressed, using pull-up)
  if (yellow == LOW && lastYellow == HIGH) {
    handleColorInput("Y");
  }
  if (blue == LOW && lastBlue == HIGH) {
    handleColorInput("B");
  }
  if (red == LOW && lastRed == HIGH) {
    handleColorInput("R");
  }
  if (green == LOW && lastGreen == HIGH) {
    handleColorInput("G");
  }
  
  lastYellow = yellow;
  lastBlue = blue;
  lastRed = red;
  lastGreen = green;
}

void handleColorInput(String color) {
  // Add to input sequence
  colorInput[colorInputIndex] = color;
  colorInputIndex++;
  
  Serial.print("COLOR:INPUT:");
  Serial.println(color);
  
  // Provide feedback
  tone(STATUS_LED_PIN, 1000, 100);
  
  // Check if sequence is complete
  if (colorInputIndex >= 4) {
    checkColorSequence();
  }
}

void checkColorSequence() {
  bool correct = true;
  
  for (int i = 0; i < 4; i++) {
    if (colorInput[i] != colorSequence[i]) {
      correct = false;
      break;
    }
  }
  
  if (correct) {
    Serial.println("COLOR:SEQUENCE_CORRECT");
    openBox();
  } else {
    Serial.println("COLOR:SEQUENCE_INCORRECT");
    // Reset sequence
    resetColorInput();
    // Error feedback
    tone(STATUS_LED_PIN, 300, 500);
  }
}

void resetColorInput() {
  colorInputIndex = 0;
  for (int i = 0; i < 4; i++) {
    colorInput[i] = "";
  }
}

void openBox() {
  if (!boxOpen) {
    boxServo.write(90);  // Open position
    delay(1000);
    boxOpen = true;
    Serial.println("BOX:OPEN");
    
    // Box contains exit key, so unlock exit door
    unlockExitDoor();
  }
}

void closeBox() {
  if (boxOpen) {
    boxServo.write(0);  // Closed position
    delay(1000);
    boxOpen = false;
    Serial.println("BOX:CLOSED");
  }
}

void unlockExitDoor() {
  if (!exitUnlocked) {
    digitalWrite(EXIT_DOOR_LOCK_PIN, LOW);  // LOW = unlocked
    exitUnlocked = true;
    Serial.println("EXIT:UNLOCKED");
    
    // Celebration light pattern
    for (int i = 0; i < 3; i++) {
      digitalWrite(STATUS_LED_PIN, HIGH);
      delay(200);
      digitalWrite(STATUS_LED_PIN, LOW);
      delay(200);
    }
  }
}

void lockExitDoor() {
  if (exitUnlocked) {
    digitalWrite(EXIT_DOOR_LOCK_PIN, HIGH);  // HIGH = locked
    exitUnlocked = false;
    Serial.println("EXIT:LOCKED");
  }
}

void wakeDragon() {
  if (!dragonAwake) {
    dragonAwake = true;
    dragonWakeTime = millis();
    
    Serial.println("DRAGON:1");
    
    // Visual effect - red lights
    setDragonLED(true);
    
    // Sound effect - play roar
    playRoar();
    
    // Flash lights
    for (int i = 0; i < 5; i++) {
      analogWrite(DRAGON_LED_RED, 255);
      delay(100);
      analogWrite(DRAGON_LED_RED, 100);
      delay(100);
    }
  }
}

void calmDragon() {
  if (dragonAwake) {
    dragonAwake = false;
    Serial.println("DRAGON:0");
    
    // Turn off dragon LEDs
    setDragonLED(false);
  }
}

void setDragonLED(bool awake) {
  if (awake) {
    analogWrite(DRAGON_LED_RED, 255);
    analogWrite(DRAGON_LED_GREEN, 50);
    analogWrite(DRAGON_LED_BLUE, 50);
  } else {
    analogWrite(DRAGON_LED_RED, 0);
    analogWrite(DRAGON_LED_GREEN, 0);
    analogWrite(DRAGON_LED_BLUE, 0);
  }
}

void playRoar() {
  // Simple roar sound using tone()
  tone(DRAGON_SOUND_PIN, 150, 500);
  delay(600);
  tone(DRAGON_SOUND_PIN, 100, 800);
  delay(900);
  tone(DRAGON_SOUND_PIN, 80, 1000);
  delay(1100);
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
  
  if (command.startsWith("GET_SOUND_LEVEL") || command == "SOUND_LEVEL") {
    Serial.print("SOUND:");
    Serial.println((int)soundLevel);
  }
  
  else if (command.startsWith("SET_THRESHOLD:")) {
    int threshold = command.substring(14).toInt();
    if (threshold > 0 && threshold < 1024) {
      soundThreshold = threshold;
      Serial.print("THRESHOLD_SET:");
      Serial.println(threshold);
    }
  }
  
  else if (command == "WAKE_DRAGON") {
    wakeDragon();
  }
  
  else if (command == "CALM_DRAGON") {
    calmDragon();
  }
  
  else if (command.startsWith("SET_COLORS:")) {
    // Format: SET_COLORS:Y:B:B:G
    String seq = command.substring(11);
    int colon1 = seq.indexOf(':');
    int colon2 = seq.indexOf(':', colon1 + 1);
    int colon3 = seq.indexOf(':', colon2 + 1);
    
    if (colon1 > 0 && colon2 > 0 && colon3 > 0) {
      colorSequence[0] = seq.substring(0, colon1);
      colorSequence[1] = seq.substring(colon1 + 1, colon2);
      colorSequence[2] = seq.substring(colon2 + 1, colon3);
      colorSequence[3] = seq.substring(colon3 + 1);
      
      Serial.print("COLOR_SEQ_SET:");
      Serial.print(colorSequence[0]);
      Serial.print(colorSequence[1]);
      Serial.print(colorSequence[2]);
      Serial.println(colorSequence[3]);
    }
  }
  
  else if (command.startsWith("CHECK_COLOR:")) {
    String color = command.substring(12);
    handleColorInput(color);
  }
  
  else if (command == "OPEN_BOX") {
    openBox();
  }
  
  else if (command == "CLOSE_BOX") {
    closeBox();
  }
  
  else if (command == "UNLOCK_EXIT") {
    unlockExitDoor();
  }
  
  else if (command == "LOCK_EXIT") {
    lockExitDoor();
  }
  
  else if (command == "RESET_COLOR_INPUT") {
    resetColorInput();
    Serial.println("COLOR_INPUT_RESET");
  }
  
  else if (command == "PING") {
    Serial.println("PONG");
  }
  
  else if (command == "RESET") {
    // Reset all states
    soundThreshold = SOUND_THRESHOLD_DEFAULT;
    dragonAwake = false;
    boxOpen = false;
    exitUnlocked = false;
    resetColorInput();
    setDragonLED(false);
    closeBox();
    lockExitDoor();
    Serial.println("RESET:DONE");
  }
  
  else if (command == "STATUS") {
    Serial.print("STATUS:DRAGON=");
    Serial.print(dragonAwake ? "AWAKE" : "ASLEEP");
    Serial.print(",SOUND=");
    Serial.print((int)soundLevel);
    Serial.print(",THRESHOLD=");
    Serial.print(soundThreshold);
    Serial.print(",BOX=");
    Serial.print(boxOpen ? "OPEN" : "CLOSED");
    Serial.print(",EXIT=");
    Serial.print(exitUnlocked ? "UNLOCKED" : "LOCKED");
    Serial.print(",COLOR_SEQ=");
    Serial.print(colorSequence[0]);
    Serial.print(colorSequence[1]);
    Serial.print(colorSequence[2]);
    Serial.println(colorSequence[3]);
  }
}