/*
 * M0 - Board probe.  Arduino Nano ESP32 (arduino:esp32:nano_nora).
 *
 * Establishes the board is healthy and reports its real parameters, so later
 * milestones build on measured facts rather than datasheet assumptions.
 *
 * Reports: chip identity, flash + partition table, PSRAM, heap, an I2C scan,
 * and an ADC read taken BEFORE and AFTER SoftAP comes up.
 *
 * The before/after ADC pair is the point of this sketch, not a detail:
 * ESP32 ADC2 is claimed by the Wi-Fi radio, and this design runs SoftAP
 * permanently.  If the LDR pin sits on ADC2 the second read misbehaves while
 * the first looks fine.  Testing empirically avoids having to trust a GPIO
 * mapping table.  See docs/00-BOARD.md 3.2.
 *
 * Nothing here writes to flash or drives a pin.  Safe to run on unknown wiring.
 */

#include <Wire.h>
#include <WiFi.h>
#include "esp_partition.h"

static const int   LDR_PIN      = A0;              // candidate, see docs/00-BOARD.md 4
static const char* PROBE_SSID   = "LightGuide-Probe";
static const char* PROBE_PASS   = "probe12345";    // >= 8 chars or softAP() fails
static const unsigned long REPEAT_MS = 10000;

static int adcBeforeWifi = -1;
static int adcAfterWifi  = -1;
static bool apUp = false;

static void rule(const char* title) {
  Serial.println();
  Serial.print(F("== "));
  Serial.println(title);
}

static void reportChip() {
  rule("CHIP");
  Serial.printf("model        : %s rev %d\n", ESP.getChipModel(), ESP.getChipRevision());
  Serial.printf("cores        : %d @ %lu MHz\n", ESP.getChipCores(), (unsigned long)ESP.getCpuFreqMHz());
  Serial.printf("MAC          : %s\n", WiFi.macAddress().c_str());
  Serial.printf("SDK          : %s\n", ESP.getSdkVersion());
}

static void reportMemory() {
  rule("MEMORY");
  Serial.printf("flash chip   : %lu bytes (%.1f MB)\n",
                (unsigned long)ESP.getFlashChipSize(), ESP.getFlashChipSize() / 1048576.0);
  Serial.printf("sketch used  : %lu bytes, free %lu bytes\n",
                (unsigned long)ESP.getSketchSize(), (unsigned long)ESP.getFreeSketchSpace());
  Serial.printf("heap         : %lu total, %lu free\n",
                (unsigned long)ESP.getHeapSize(), (unsigned long)ESP.getFreeHeap());

  size_t psram = ESP.getPsramSize();
  if (psram) Serial.printf("PSRAM        : %lu bytes, %lu free\n",
                           (unsigned long)psram, (unsigned long)ESP.getFreePsram());
  else       Serial.println(F("PSRAM        : none reported"));
}

/* The app bundle is served from flash, so the real headroom against the 50 KB
 * budget is whatever the data/SPIFFS partition actually is - not the chip size. */
static void reportPartitions() {
  rule("PARTITIONS");
  Serial.println(F("label            type  sub    offset      size"));
  esp_partition_iterator_t it =
      esp_partition_find(ESP_PARTITION_TYPE_ANY, ESP_PARTITION_SUBTYPE_ANY, NULL);
  while (it) {
    const esp_partition_t* p = esp_partition_get(it);
    Serial.printf("%-16s 0x%02x  0x%02x  0x%08lx  %8lu\n",
                  p->label, p->type, p->subtype,
                  (unsigned long)p->address, (unsigned long)p->size);
    it = esp_partition_next(it);
  }
  esp_partition_iterator_release(it);
}

static void reportI2C() {
  rule("I2C SCAN (Wire = A4 SDA / A5 SCL)");
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      found++;
      Serial.printf("0x%02X  ", addr);
      switch (addr) {
        case 0x3C:
        case 0x3D: Serial.println(F("<- SSD1306 / SH1106 OLED")); break;
        default:   Serial.println(F("<- unidentified")); break;
      }
    }
  }
  if (!found) {
    Serial.println(F("nothing responded."));
    Serial.println(F("The Nano ESP32 has NO on-board sensors, so an empty bus means"));
    Serial.println(F("the display is not wired, not powered, or on the wrong pins."));
  } else {
    Serial.printf("%d device(s).\n", found);
  }
}

static void reportAdc() {
  rule("ADC / WIFI COEXISTENCE");
  Serial.printf("A0 before SoftAP : %d\n", adcBeforeWifi);
  Serial.printf("A0 after  SoftAP : %d   (AP %s)\n",
                adcAfterWifi, apUp ? "up" : "FAILED TO START");
  Serial.printf("A0 live          : %d\n", analogRead(LDR_PIN));
  Serial.println(F("Readings should track each other and respond to shading the pin."));
  Serial.println(F("A dead or pinned value only after the AP starts = ADC2 conflict."));
}

static void report() {
  Serial.println(F("\n\n########## LightGuide ESP32 - M0 board probe ##########"));
  reportChip();
  reportMemory();
  reportPartitions();
  reportI2C();
  reportAdc();
  Serial.println(F("\n########## end of report ##########"));
}

void setup() {
  Serial.begin(115200);
  // Native USB CDC: give a monitor time to attach, but never block forever -
  // the board must still run when nothing is listening.
  unsigned long deadline = millis() + 5000;
  while (!Serial && millis() < deadline) delay(10);

  analogReadResolution(12);
  adcBeforeWifi = analogRead(LDR_PIN);

  Wire.begin();

  WiFi.mode(WIFI_AP);
  apUp = WiFi.softAP(PROBE_SSID, PROBE_PASS);
  delay(500);                       // let the radio settle before re-reading
  adcAfterWifi = analogRead(LDR_PIN);

  report();
}

void loop() {
  // Re-report on a cycle so attaching the monitor late still shows everything.
  delay(REPEAT_MS);
  report();
}
