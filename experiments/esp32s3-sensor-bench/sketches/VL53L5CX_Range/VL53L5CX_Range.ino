// VL53L5CX 8x8 ranging with a live depth map on the SSD1306.
// Shared I2C bus: SDA = GPIO 8, SCL = GPIO 9. Sensor 0x29, display 0x3C.
//
// The OLED grid draws each zone as a filled square sized by proximity:
// a big block is close, a small dot is far, blank is an invalid reading.
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SparkFun_VL53L5CX_Library.h>

const int SDA_PIN = 8;
const int SCL_PIN = 9;
const uint8_t OLED_ADDR = 0x3C;

const int GRID = 8;        // 8x8 zones
const int CELL = 8;        // pixels per zone on the 64px-tall panel
const int NEAR_MM = 150;   // full-size block at or below this
const int FAR_MM = 2000;   // single pixel at or above this

Adafruit_SSD1306 display(128, 64, &Wire, -1);
SparkFun_VL53L5CX sensor;
VL53L5CX_ResultsData results;

void fail(const char *msg) {
  Serial.println(msg);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(2, 2);
  display.println(msg);
  display.display();
  while (true) delay(1000);
}

// Valid target statuses for the L5CX are 5 (good) and 9 (good, 50% confidence).
bool zoneValid(uint8_t status) { return status == 5 || status == 9; }

void drawZone(int col, int row, int mm, bool valid) {
  int x = col * CELL, y = row * CELL;
  if (!valid) return;
  int span = map(constrain(mm, NEAR_MM, FAR_MM), NEAR_MM, FAR_MM, CELL - 1, 1);
  int pad = (CELL - span) / 2;
  display.fillRect(x + pad, y + pad, span, span, SSD1306_WHITE);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);  // the ~84KB firmware upload is slow at 100kHz

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("SSD1306 init FAILED");
    while (true) delay(1000);
  }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(2, 2);
  display.println("Loading VL53L5CX");
  display.println("firmware...");
  display.display();
  Serial.println("Uploading VL53L5CX firmware, this takes a few seconds...");

  if (!sensor.begin()) fail("VL53L5CX begin FAILED");
  Serial.println("VL53L5CX init OK");

  sensor.setResolution(GRID * GRID);
  sensor.setRangingFrequency(10);
  sensor.startRanging();
}

void loop() {
  if (!sensor.isDataReady()) { delay(5); return; }
  if (!sensor.getRangingData(&results)) return;

  display.clearDisplay();

  int minMm = 9999, centre = 0, validCount = 0;
  for (int row = 0; row < GRID; row++) {
    for (int col = 0; col < GRID; col++) {
      // The ULD returns rows bottom-up; flip so the map matches the scene.
      int i = (GRID - 1 - row) * GRID + col;
      int mm = results.distance_mm[i];
      bool ok = zoneValid(results.target_status[i]);
      drawZone(col, row, mm, ok);
      if (ok) {
        validCount++;
        if (mm < minMm) minMm = mm;
        if (row == 3 && col == 3) centre = mm;
      }
    }
  }

  display.drawFastVLine(66, 0, 64, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(70, 2);
  display.println("VL53L5CX");
  display.setCursor(70, 16);
  display.printf("ctr %4d", centre);
  display.setCursor(70, 28);
  display.printf("min %4d", minMm == 9999 ? 0 : minMm);
  display.setCursor(70, 40);
  display.printf("ok  %2d/64", validCount);
  display.setCursor(70, 52);
  display.println("mm");
  display.display();

  Serial.printf("centre %4d mm | nearest %4d mm | %2d/64 zones valid\n",
                centre, minMm == 9999 ? 0 : minMm, validCount);
}
