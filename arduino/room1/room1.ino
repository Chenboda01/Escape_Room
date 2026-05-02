// Room 1: The Restroom (Jail Room)
// Controls: Motion sensor, shower mechanism, alarm

#include <Servo.h>

// Pin definitions
const int MOTION_SENSOR_PIN = 2;
const int SHOWER_POT_PIN = A0;
const int ALARM_LED_PIN = 3;
const int ALARM_BUZZER_PIN = 4;
const int DOOR_LOCK_PIN = 5;  // Relay for electromagnetic lock

// Variables
Servo showerServo;
int lastMotionState = LOW;
int motionDetected = 0;
int showerPosition = 0;
int targetShowerPosition = 0;
bool alarmActive = false;
unsigned long alarmEndTime = 0;

// Serial communication
String inputString = "";
bool stringComplete = false;

void setup() {
  Serial.begin(115200);
  
  // Initialize pins
  pinMode(MOTION_SENSOR_PIN, INPUT);
  pinMode(ALARM_LED_PIN, OUTPUT);
  pinMode(ALARM_BUZZER_PIN, OUTPUT);
  pinMode(DOOR_LOCK_PIN, OUTPUT);
  
  // Initialize shower servo
  showerServo.attach(9);
  showerServo.write(0);
  
  // Start with door locked
  digitalWrite(DOOR_LOCK_PIN, HIGH);  // HIGH = locked (electromagnetic lock engaged)
  
  // Reserve 200 bytes for input string
  inputString.reserve(200);
  
  Serial.println("ROOM1:READY");
}

void loop() {
  // Check serial commands
  if (stringComplete) {
    processCommand(inputString);
    inputString = "";
    stringComplete = false;
  }
  
  // Read motion sensor
  int motionState = digitalRead(MOTION_SENSOR_PIN);
  if (motionState != lastMotionState) {
    if (motionState == HIGH) {
      motionDetected = 1;
      Serial.println("MOTION:1");
      // Optional: trigger alarm on motion
      // triggerAlarm(1000);
    } else {
      motionDetected = 0;
      Serial.println("MOTION:0");
    }
    lastMotionState = motionState;
  }
  
  // Read shower position (potentiometer)
  int rawShowerPos = analogRead(SHOWER_POT_PIN);
  int newShowerPos = map(rawShowerPos, 0, 1023, 0, 100);
  
  if (abs(newShowerPos - showerPosition) > 2) {  // Deadband to reduce noise
    showerPosition = newShowerPos;
    Serial.print("SHOWER:");
    Serial.println(showerPosition);
    
    // Check if shower is in correct position (e.g., position 75)
    if (showerPosition >= 70 && showerPosition <= 80) {
      // Correct position - unlock next clue
      Serial.println("SHOWER:CORRECT");
    }
  }
  
  // Update shower servo to target position
  int currentAngle = showerServo.read();
  if (currentAngle != targetShowerPosition) {
    if (currentAngle < targetShowerPosition) {
      currentAngle++;
    } else {
      currentAngle--;
    }
    showerServo.write(currentAngle);
  }
  
  // Handle alarm
  if (alarmActive) {
    if (millis() < alarmEndTime) {
      // Blink LED and sound buzzer
      digitalWrite(ALARM_LED_PIN, millis() % 200 < 100);
      tone(ALARM_BUZZER_PIN, 1000);
    } else {
      alarmActive = false;
      digitalWrite(ALARM_LED_PIN, LOW);
      noTone(ALARM_BUZZER_PIN);
      Serial.println("ALARM:0");
    }
  }
  
  delay(10);  // Small delay to prevent flooding serial
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
  
  if (command.startsWith("MOTION_STATUS")) {
    Serial.print("MOTION:");
    Serial.println(motionDetected);
  }
  
  else if (command.startsWith("RESET_MOTION")) {
    motionDetected = 0;
    Serial.println("MOTION:0");
  }
  
  else if (command.startsWith("SHOWER_POS:")) {
    int pos = command.substring(11).toInt();
    if (pos >= 0 && pos <= 100) {
      targetShowerPosition = map(pos, 0, 100, 0, 180);
      Serial.print("SHOWER_SET:");
      Serial.println(pos);
    }
  }
  
  else if (command.startsWith("GET_SHOWER")) {
    Serial.print("SHOWER:");
    Serial.println(showerPosition);
  }
  
  else if (command.startsWith("ALARM:")) {
    int duration = command.substring(6).toInt();
    triggerAlarm(duration);
  }
  
  else if (command.startsWith("DOOR_UNLOCK")) {
    digitalWrite(DOOR_LOCK_PIN, LOW);  // LOW = unlocked
    Serial.println("DOOR:UNLOCKED");
  }
  
  else if (command.startsWith("DOOR_LOCK")) {
    digitalWrite(DOOR_LOCK_PIN, HIGH);  // HIGH = locked
    Serial.println("DOOR:LOCKED");
  }
  
  else if (command == "PING") {
    Serial.println("PONG");
  }
  
  else if (command == "RESET") {
    // Reset all states
    motionDetected = 0;
    showerPosition = 0;
    targetShowerPosition = 0;
    alarmActive = false;
    digitalWrite(DOOR_LOCK_PIN, HIGH);
    Serial.println("RESET:DONE");
  }
  
  else if (command == "STATUS") {
    Serial.print("STATUS:MOTION=");
    Serial.print(motionDetected);
    Serial.print(",SHOWER=");
    Serial.print(showerPosition);
    Serial.print(",ALARM=");
    Serial.print(alarmActive ? "1" : "0");
    Serial.print(",DOOR=");
    Serial.println(digitalRead(DOOR_LOCK_PIN) == HIGH ? "LOCKED" : "UNLOCKED");
  }
}

void triggerAlarm(int durationMs) {
  alarmActive = true;
  alarmEndTime = millis() + durationMs;
  Serial.println("ALARM:1");
}