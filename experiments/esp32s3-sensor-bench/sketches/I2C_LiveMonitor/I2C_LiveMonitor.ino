// Live I2C bus monitor (SDA = GPIO 8, SCL = GPIO 9).
// Prints whenever the bus state changes, so modules can be plugged in or
// wiggled while watching. Use it to confirm wiring before running a full scan.
#include <Wire.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;

// A line reads HIGH against the weak internal pull-down only if a powered
// module is holding it up through its own pull-up resistor.
bool pullupOn(int pin) {
  pinMode(pin, INPUT_PULLDOWN);
  delayMicroseconds(200);
  return digitalRead(pin) == HIGH;
}

bool ackAt(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

String busState() {
  bool sda = pullupOn(SDA_PIN);
  bool scl = pullupOn(SCL_PIN);

  String s = "SDA(8)=";
  s += sda ? "PULLED UP" : "floating ";
  s += "  SCL(9)=";
  s += scl ? "PULLED UP" : "floating ";

  if (!sda || !scl) {
    s += "  -> not connected yet";
    return s;
  }

  Wire.begin(SDA_PIN, SCL_PIN, 100000);
  Wire.setTimeOut(20);
  bool oled = ackAt(0x3C) || ackAt(0x3D);
  bool vl53 = ackAt(0x29);
  Wire.end();

  s += "  -> OLED:";
  s += oled ? "YES" : "no ";
  s += "  VL53:";
  s += vl53 ? "YES" : "no ";
  return s;
}

String last;
unsigned long lastPrint;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Live I2C monitor. Plug modules in and watch this line change.");
}

void loop() {
  String now = busState();
  // Print on every change, plus a heartbeat so a silent port is obvious.
  if (now != last || millis() - lastPrint > 3000) {
    Serial.printf("[%6lus] %s\n", millis() / 1000, now.c_str());
    last = now;
    lastPrint = millis();
  }
  delay(150);
}
