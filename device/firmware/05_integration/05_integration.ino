/*
 * LightGuide ESP32 — device firmware (M5, integration).
 *
 * Arduino Nano ESP32 (ESP32-S3).  Serves the companion app from flash over its
 * own access point and answers the device contract.
 *
 * THE CONTRACT HAS TWO AUTHORITIES.  Read both before changing any route:
 *   ../../../.superpowers/sdd/device-contract-report.md   §1  (setups, active, live)
 *   ../../../.superpowers/sdd/device-connection-report.md §1  (GET /api/info)
 * Do not restate either here — this project has already been burned once by a
 * duplicated spec that drifted.
 *
 * Division of responsibility, settled: THE DEVICE MEASURES, THE APP COMPUTES.
 * No verdicts, no deltas, no instruction wording on the board — that is what
 * lets guidance copy and tolerances change without reflashing.
 *
 * Wiring is frozen in ../../docs/00-BOARD.md §4.
 */

#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#include "config.h"
#include "sensors.h"
#include "store.h"
#include "api.h"
#include "buzzer.h"

static const char *AP_PASS = "lightguide";     // >= 8 chars or softAP() fails

static Adafruit_SSD1306 display(128, 64, &Wire, -1);
static bool haveDisplay = false;

/* A capture has to be visible ON THE DEVICE. It used to confirm with a chirp
 * and a serial line only, which is invisible to anyone not sitting at a laptop
 * - so a refused capture and a working one looked identical. */
static char     toastText[24] = "";
static uint32_t toastUntil = 0;
static void toast(const char *s) {
  strncpy(toastText, s, sizeof toastText - 1);
  toastText[sizeof toastText - 1] = 0;
  toastUntil = millis() + 2500;
}

static uint32_t lastLiveMs = 0;
static uint32_t lastDrawMs = 0;

// ------------------------------------------------------------ serial cmd ---
/*
 * A tiny console, for testing only. The conformance suite asserts on an empty
 * device, and the contract has no remote wipe on purpose - so the reset it
 * needs arrives over the USB cable instead, where physical access is the
 * permission.
 */
static void serviceSerialCommand() {
  static char buf[16];
  static uint8_t n = 0;

  while (Serial.available()) {
    const char ch = (char)Serial.read();
    if (ch == 13) continue;              // CR: ignore, line ends on LF
    if (ch != 10) {                      // LF ends the line
      if (n < sizeof buf - 1) buf[n++] = ch;
      continue;
    }
    buf[n] = 0;
    n = 0;

    if (!strcmp(buf, "wipe")) {
      const bool ok = storeWipe();
      Serial.println(ok ? F("wiped: the setup library is empty")
                        : F("wipe FAILED"));
    } else if (!strcmp(buf, "info")) {
      Serial.print(F("device_id ")); Serial.print(deviceId());
      Serial.print(F("  name "));    Serial.print(deviceName());
      Serial.print(F("  fw "));      Serial.print(FIRMWARE_VERSION);
      Serial.print(F("  proto "));   Serial.println(PROTOCOL_VERSION);
      Serial.print(F("ip "));        Serial.print(WiFi.softAPIP().toString());
      Serial.print(F("  free "));    Serial.print(storeFreeBytes());
      Serial.println(F(" bytes"));
    } else if (buf[0]) {
      Serial.println(F("commands: wipe | info"));
    }
  }
}
// -------------------------------------------------------------- verdicts ---
/*
 * ONE verdict, computed once, used by the screen, the LED and the buzzer.
 *
 * They previously each derived their own from the same numbers. That worked but
 * was a latent bug: three copies of a rule drift apart the moment one is edited,
 * and a screen disagreeing with the buzzer is worse than either being wrong.
 *
 * Hysteresis is v1's (decision.h): a channel enters the band at the tolerance
 * the app set and only leaves it at a wider one, so a stand parked exactly on
 * the boundary settles instead of chattering.
 */
static Judgement judge(float live, float ref, float tol, Judgement prev) {
  if (live < 0.0f) return J_NO_READ;
  const float diff = live - ref;
  const float band = (prev == J_CORRECT) ? tol * HYSTERESIS_RATIO : tol;
  if (fabsf(diff) <= band) return J_CORRECT;
  return (diff > 0.0f) ? J_ABOVE : J_BELOW;
}

static Judgement vDist  = J_NO_READ;
static Judgement vLight = J_NO_READ;

static void updateVerdicts() {
  const Reading r = sensorsRead();
  const ActiveTarget tgt = apiActiveTarget();

  if (!tgt.present) { vDist = vLight = J_NO_READ; return; }

  vDist = judge(r.distance_cm, tgt.distance_cm, tgt.distance_tol_cm, vDist);

  const float above = (r.brightness >= 0 && r.ambient >= 0) ? r.brightness - r.ambient : -1.0f;
  vLight = tgt.has_brightness
             ? judge(above, tgt.brightness_above_ambient, tgt.brightness_tol, vLight)
             : J_NO_READ;
}

// --------------------------------------------------------------- display ---
/*
 * The v1 screen, rebuilt on v2's data.
 *
 * Same geometry and the same five words - OPTIMAL / TOO CLOSE / TOO FAR /
 * UNDERLIT / OVERLIT - so the device reads the way the finished v1 product did
 * (LightGuide-Edge/firmware/03_inference, render()).
 *
 * WHAT IS DIFFERENT UNDERNEATH, and it matters: v1 ran a classifier on the
 * board and displayed its verdict. This board classifies nothing. It renders
 * the target the APP sent it - target, tolerance and all - against what it is
 * measuring right now. The arithmetic is local, but the policy is not: change a
 * tolerance in the app and this screen follows without a reflash.
 *
 * Nothing here is sent back. The live frame carries measurements only, so the
 * app stays the only thing that words a verdict for the customer. Whether the
 * device should show words at all is device/docs/03-OPEN-DECISIONS.md D6.
 *
 * SEAM: rows 0-15 of this glass are physically yellow, the rest blue. v1's big
 * word sat at y=11, which on THIS panel would split it across both colours and
 * read as a rendering fault. v1 chose that for a single-colour screen, so
 * copying it here would be inheriting a number rather than the intent. Moved
 * clear of the seam; set it back to 11 for a pixel-exact v1 screen.
 */
static const int HEADLINE_Y = 18;     // 11 = v1-exact, but straddles the seam

/* The Adafruit font is 6 px per character at size 1, so a string's width is
 * len * 6 * size. Centring by hand would have to be redone every time a word
 * changed length. */
static void printCentred(const char *s, int size, int y) {
  int w = (int)strlen(s) * 6 * size;
  int x = (128 - w) / 2;
  if (x < 0) x = 0;
  display.setTextSize(size);
  display.setCursor(x, y);
  display.print(s);
}

/* A ruler: the target sits at the centre tick and the live reading slides along
 * it. `span` is the deviation that reaches either end, so each channel picks a
 * scale that suits it. */
static void drawBar(int y, float live, float ref, float span, bool valid) {
  const int H = 4;
  display.drawRect(0, y, 128, H, SSD1306_WHITE);
  display.drawFastVLine(64, y, H, SSD1306_WHITE);
  if (!valid || span <= 0) return;

  int x = 64 + (int)((live - ref) * 64.0f / span);
  if (x < 2)   x = 2;
  if (x > 125) x = 125;
  display.fillRect(x - 1, y + 1, 3, H - 2, SSD1306_WHITE);
}

static void draw() {
  if (!haveDisplay) return;
  const Reading r = sensorsRead();
  const ActiveTarget tgt = apiActiveTarget();

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  if (toastUntil && (int32_t)(millis() - toastUntil) < 0) {
    display.setTextSize(1);
    display.setCursor(2, 8);
    display.print(F("BUTTON HELD"));
    display.setTextSize(1);
    display.setCursor(2, 30);
    display.print(toastText);
    display.display();
    return;
  }

  // ---- not guiding: the live numbers ARE the content ----------------------
  if (!tgt.present) {
    printCentred("NO TARGET SET", 1, 0);
    printCentred(WiFi.softAPgetStationNum() > 0 ? "set one in the app"
                                                : "waiting for app", 1, 10);
    display.drawFastHLine(0, 22, 128, SSD1306_WHITE);

    display.setTextSize(2);
    display.setCursor(0, 28);
    display.print(F("d "));
    if (r.distance_cm < 0) display.print(F("--"));
    else                   display.print(r.distance_cm, 0);
    display.setTextSize(1);
    display.print(F(" cm"));

    display.setTextSize(2);
    display.setCursor(0, 44);
    display.print(F("l "));
    if (r.brightness < 0) display.print(F("--"));
    else                  display.print(r.brightness, 2);

    /* Live switch state. Whether D7 actually moves when the button is pressed
     * is otherwise invisible, and "the button does nothing" has three very
     * different causes: not wired, wired to the wrong pin, or wired to a pair
     * of contacts that are shorted inside the part. This says which. */
    display.setTextSize(1);
    display.setCursor(78, 56);
    display.print(F("btn "));
    display.print(digitalRead(PIN_SWITCH) == LOW ? F("DOWN") : F("up"));

    display.display();
    return;
  }

  // ---- guiding ------------------------------------------------------------
  const float above = (r.brightness >= 0 && r.ambient >= 0) ? r.brightness - r.ambient : -1.0f;
  const bool  dOk   = r.distance_cm >= 0;
  const float dDelta = dOk ? r.distance_cm - tgt.distance_cm : 0.0f;
  const float lDelta = (above >= 0) ? above - tgt.brightness_above_ambient : 0.0f;

  // Live readings, small, at the top - exactly where v1 put them.
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(F("D "));
  if (dOk) display.print(r.distance_cm, 0); else display.print(F("--"));
  display.print(F("cm"));
  display.setCursor(66, 0);
  display.print(F("L "));
  if (above >= 0) display.print(above, 2); else display.print(F("--"));

  // The headline, in v1's vocabulary. Distance is judged first: no amount of
  // correct lighting helps from the wrong place.
  const char *word = "OPTIMAL";
  if      (vDist  == J_NO_READ) word = "NO ECHO";
  else if (vDist  == J_BELOW)   word = "TOO CLOSE";
  else if (vDist  == J_ABOVE)   word = "TOO FAR";
  else if (vLight == J_BELOW)   word = "UNDERLIT";
  else if (vLight == J_ABOVE)   word = "OVERLIT";
  printCentred(word, 2, HEADLINE_Y);

  display.drawFastHLine(0, 30, 128, SSD1306_WHITE);

  // Signed deltas: which way to move, and by how much.
  display.setTextSize(1);
  display.setCursor(0, 34);
  display.print(F("d "));
  if (dOk) { if (dDelta >= 0) display.print('+'); display.print(dDelta, 1); }
  else       display.print(F("--"));
  display.setCursor(66, 34);
  display.print(F("l "));
  if (tgt.has_brightness && above >= 0) { if (lDelta >= 0) display.print('+'); display.print(lDelta, 2); }
  else                                    display.print(F("--"));

  display.setCursor(0, 45);
  display.print(F("tgt "));
  display.print(tgt.distance_cm, 0);
  display.print(F("cm "));
  if (tgt.has_brightness) display.print(tgt.brightness_above_ambient, 2);
  else                    display.print(F("dist only"));

  // Bars scaled to four tolerances end to end, so the in-band zone is always
  // the middle quarter whatever tolerance the app chose.
  const float dSpan = tgt.distance_tol_cm > 0 ? tgt.distance_tol_cm * 4.0f : 20.0f;
  const float lSpan = tgt.brightness_tol  > 0 ? tgt.brightness_tol  * 4.0f : 0.10f;
  drawBar(56, r.distance_cm, tgt.distance_cm, dSpan, dOk);
  drawBar(60, above, tgt.brightness_above_ambient, lSpan, tgt.has_brightness && above >= 0);

  display.display();
}

/* Re-init if the panel drops off the bus and comes back. An SSD1306 loses its
 * whole configuration on a power blink and begin() normally runs only once, so
 * without this a nudged wire leaves the screen dark for good. */
static void serviceDisplay() {
  static uint32_t lastCheck = 0;
  if (millis() - lastCheck < 1000) return;
  lastCheck = millis();

  Wire.beginTransmission(OLED_ADDR);
  const bool present = (Wire.endTransmission() == 0);
  if (present && !haveDisplay)      haveDisplay = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  else if (!present && haveDisplay) haveDisplay = false;
}

// ---------------------------------------------------------------- button ---
/*
 * One gesture, deliberately: a two-second hold captures what the device is
 * looking at right now as the target, and saves it as a setup so it survives a
 * power cycle and shows up in the app. v1 used the same hold for the same
 * reason - it is the destructive gesture, so it is the one that has to be
 * intentional.
 *
 * A short press is left unbound. v1 used it to label a data-logging run, which
 * this build has no equivalent of, and binding it to something invented would
 * be worse than leaving it quiet.
 */
static void serviceButton() {
  static int      stable = HIGH, last = HIGH;
  static uint32_t changedAt = 0;
  static bool     firedThisHold = false;

  const uint32_t now = millis();
  const int level = digitalRead(PIN_SWITCH);

  if (level != last) { last = level; changedAt = now; }
  else if (now - changedAt > 25 && level != stable) {      // 25 ms = settled
    stable = level;
    if (stable == HIGH) firedThisHold = false;             // released; re-arm
  }

  if (stable != LOW || firedThisHold) return;
  if (now - changedAt < BUTTON_HOLD_MS) return;

  firedThisHold = true;                                    // once per hold

  const Reading r = sensorsRead();
  if (r.distance_cm < 0) {
    // Nothing in range: capturing would store a target that cannot be reached.
    buzzerChirp(BUZZER_HZ, 400);
    toast("no distance - aim it");
    Serial.println(F("capture refused: no distance reading"));
    return;
  }

  const float above = (r.brightness >= 0 && r.ambient >= 0) ? r.brightness - r.ambient : -1.0f;

  String id;
  const bool saved = storeCreateCaptured(r.distance_cm, above, id);
  apiSetActiveTarget(r.distance_cm, DEFAULT_DISTANCE_TOL_CM,
                     above >= 0, above, DEFAULT_BRIGHTNESS_TOL);

  Serial.printf("captured %.1f cm", r.distance_cm);
  if (above >= 0) Serial.printf(", light +%.3f", above);
  Serial.print(F(" -> "));
  Serial.println(saved ? id.c_str() : "NOT SAVED (library full)");

  char msg[24];
  if (saved) snprintf(msg, sizeof msg, "saved %d cm", (int)(r.distance_cm + 0.5f));
  else       snprintf(msg, sizeof msg, "FULL - not saved");
  toast(msg);
  buzzerChirp(BUZZER_HZ, saved ? 200 : 500);
}

// ------------------------------------------------------------------- LED ---
/*
 * v1's on-board RGB, unchanged: red when the distance is wrong, blue when the
 * light is, green when both are right, off when nothing is being guided.
 *
 * v1's reasoning holds exactly - this is the output that reads across a room,
 * so the colour names the failing channel before you are close enough to read
 * the screen. Active LOW, and on this board it needs no wiring either.
 */
static void setLed(bool r, bool g, bool b) {
  digitalWrite(LED_RED,   r ? LOW : HIGH);
  digitalWrite(LED_GREEN, g ? LOW : HIGH);
  digitalWrite(LED_BLUE,  b ? LOW : HIGH);
}

// ---------------------------------------------------------------- buzzer ---
/* The same judgement the screen shows, spoken. Distance first: no amount of
 * correct lighting helps from the wrong place. */
static void serviceFeedback() {
  if (vDist == J_NO_READ) { buzzerSet(BUZZ_SILENT); setLed(false, false, false); return; }

  // Distance first: no amount of correct lighting helps from the wrong place.
  if (vDist == J_BELOW) { buzzerSet(BUZZ_TOO_CLOSE); setLed(true, false, false); return; }
  if (vDist == J_ABOVE) { buzzerSet(BUZZ_TOO_FAR);   setLed(true, false, false); return; }

  // An unreadable light silences only the light layer - the distance guidance
  // above it has already been given.
  if (vLight == J_BELOW) { buzzerSet(BUZZ_UNDERLIT); setLed(false, false, true); return; }
  if (vLight == J_ABOVE) { buzzerSet(BUZZ_OVERLIT);  setLed(false, false, true); return; }

  buzzerSet(BUZZ_ARRIVED);
  setLed(false, true, false);
}

// ------------------------------------------------------------------ setup ---
void setup() {
  Serial.begin(115200);
  /* Native USB CDC needs a moment to enumerate. Anything slow or crashy before
   * this point happens with no way to see it: the port never appears and the
   * board looks dead rather than broken. */
  delay(2500);
  Serial.println();
  Serial.println(F("boot: serial up"));

  /* SAFE MODE - hold the D7 switch during reset.
   *
   * A crash anywhere in setup() puts the board in a reset loop, and a looping
   * board cannot be reflashed over DFU: the transfer needs longer than the
   * board stays up, so every attempt dies part-way with LIBUSB_ERROR_PIPE.
   * Recovering then means the B1-to-GND jumper and the ROM bootloader, which
   * needs physical access.
   *
   * So: hold the switch and the board brings up serial and nothing else. It
   * stays alive indefinitely, DFU works, and a bad build can be replaced with
   * no jumper. Cost is one pin read at boot.
   */
  pinMode(PIN_SWITCH, INPUT_PULLUP);
  Wire.begin();
  haveDisplay = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);

  if (digitalRead(PIN_SWITCH) == LOW) {
    Serial.println(F("SAFE MODE - switch held at boot."));
    Serial.println(F("Sensors, storage, Wi-Fi and HTTP are all skipped."));
    Serial.println(F("Release the switch to boot normally."));

    /* SAY SO ON THE SCREEN. The first version announced safe mode on serial
     * only, so a switch stuck LOW looked exactly like "the Wi-Fi has stopped
     * working" - and that is precisely what happened. A mode that changes
     * everything has to be visible on the device itself.
     *
     * Held is a state, not a latch: release the switch and the board carries on
     * booting. A deliberate hold keeps the DFU window open for as long as it is
     * needed, while a switch stuck LOW is obvious rather than silently fatal.
     */
    while (digitalRead(PIN_SWITCH) == LOW) {
      if (haveDisplay) {
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(2);
        display.setCursor(10, 2);
        display.print(F("SAFE MODE"));
        display.setTextSize(1);
        display.setCursor(2, 26);
        display.print(F("switch is held down"));
        display.setCursor(2, 38);
        display.print(F("no wifi, no sensors"));
        display.setCursor(2, 52);
        display.print(F("release it to start"));
        display.display();
      }
      delay(200);
    }
    Serial.println(F("switch released - continuing boot"));
  }

  pinMode(LED_RED, OUTPUT); pinMode(LED_GREEN, OUTPUT); pinMode(LED_BLUE, OUTPUT);
  setLed(false, false, false);
  buzzerBegin();

  Serial.println(F("boot: sensors"));  Serial.flush();
  sensorsBegin();

  Serial.println(F("boot: littlefs"));  Serial.flush();
  const bool fsOk = storeBegin();
  Serial.println();
  Serial.println(F("##### LightGuide device firmware #####"));
  Serial.printf("firmware %s, protocol %d\n", FIRMWARE_VERSION, PROTOCOL_VERSION);
  Serial.printf("littlefs: %s\n", fsOk ? "mounted" : "FAILED");

  // The AP name carries the device name so two boards on a bench are already
  // tellable apart with nothing configured.
  // Order matters: identity -> Wi-Fi -> server. The server binds through lwIP,
  // which does not exist until Wi-Fi has started.
  apiInitIdentity();
  Serial.println(F("boot: softap"));  Serial.flush();
  WiFi.mode(WIFI_AP);
  WiFi.softAP(deviceName(), AP_PASS);
  delay(300);                                  // let the netif settle

  Serial.println(F("boot: http server"));  Serial.flush();
  apiStartServer();

  Serial.printf("device_id: %s\n", deviceId());
  Serial.printf("AP \"%s\"  pass \"%s\"  http://%s/\n",
                deviceName(), AP_PASS, WiFi.softAPIP().toString().c_str());
  Serial.printf("free storage: %u bytes\n", (unsigned)storeFreeBytes());
}

void loop() {
  sensorsService();                       // never blocks; ISR-driven distance
  serviceSerialCommand();
  serviceButton();
  updateVerdicts();
  serviceFeedback();
  buzzerService();

  const uint32_t now = millis();
  if (now - lastLiveMs >= LIVE_INTERVAL_MS) {
    lastLiveMs = now;
    apiBroadcastLive();
  }
  if (now - lastDrawMs >= 250) {          // the OLED is far slower than 10 Hz
    lastDrawMs = now;
    serviceDisplay();
    draw();
  }
}
