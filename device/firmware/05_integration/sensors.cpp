#include "sensors.h"
#include "config.h"

/*
 * Distance is captured with an INTERRUPT, not pulseIn().
 *
 * The HC-SR04 answers "nothing in range" by holding ECHO high for ~130 ms
 * (measured, device/docs/00-BOARD.md §4c).  Waiting for that synchronously
 * would blow the 100 ms live-frame budget and stall the async web server for
 * longer than a socket write can politely wait.  So the ISR timestamps the
 * edges and the main loop only ever reads a finished result.
 */

static volatile uint32_t isrRiseUs   = 0;
static volatile uint32_t isrWidthUs  = 0;
static volatile bool     isrHavePulse = false;
static volatile bool     isrHigh      = false;

static uint32_t lastPingMs = 0;
static bool     pingInFlight = false;
static uint32_t pingSentUs = 0;

static float curDistance = -1.0f;
static float curBright   = -1.0f;
static float ambientEst  = -1.0f;
static uint32_t seqNo    = 0;

/* Ultrasonic readings carry occasional wild outliers - a glancing echo off a
 * different surface, or a second bounce arriving late. A median rejects those
 * outright, where an average would let each one drag the result. Five samples
 * at 10 Hz is half a second of lag, which is imperceptible when positioning a
 * stand by hand. */
static const int MEDIAN_N = 5;
static float medBuf[MEDIAN_N];
static int   medCount = 0, medNext = 0;

static float medianDistance(float fresh) {
  medBuf[medNext] = fresh;
  medNext = (medNext + 1) % MEDIAN_N;
  if (medCount < MEDIAN_N) medCount++;

  float s[MEDIAN_N];
  for (int i = 0; i < medCount; i++) s[i] = medBuf[i];
  for (int i = 1; i < medCount; i++) {          // insertion sort, n=5
    float v = s[i]; int j = i - 1;
    while (j >= 0 && s[j] > v) { s[j + 1] = s[j]; j--; }
    s[j + 1] = v;
  }
  return s[medCount / 2];
}

static void medianReset() { medCount = 0; medNext = 0; }

static int distMisses = 0, lightMisses = 0;
static SensorState distState = SENSOR_UNKNOWN, lightStateV = SENSOR_UNKNOWN;

static void IRAM_ATTR echoIsr() {
  uint32_t now = micros();
  if (digitalRead(PIN_ECHO) == HIGH) {
    isrRiseUs = now;
    isrHigh = true;
  } else if (isrHigh) {
    isrWidthUs = now - isrRiseUs;
    isrHigh = false;
    isrHavePulse = true;
  }
}

void sensorsBegin() {
  pinMode(PIN_TRIG, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  pinMode(PIN_ECHO, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_ECHO), echoIsr, CHANGE);
  analogReadResolution(12);
}

static void startPing() {
  isrHavePulse = false;
  isrHigh = false;
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(4);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  pingSentUs = micros();
  pingInFlight = true;
}

/*
 * AMBIENT - the shared zero for the whole brightness axis.
 *
 * It has to mean "what the sensor reads with the guided light off", and the
 * device is never told when that is. So: the darkest level seen in the last ten
 * minutes, kept as one minimum per one-minute bucket.
 *
 * Why a rolling window rather than the exponential decay this replaced. A decay
 * has no honest answer to "how long until my key light counts as ambient?" - it
 * is always partly absorbing it, just slowly. Over a shoot that means the
 * brightness axis quietly shrinks while nothing looks wrong. A window has an
 * exact answer: the light is ignored until it has been on for the whole window,
 * and one dark moment inside the window restores a correct floor immediately.
 *
 * Behaviour that follows, all of it intended:
 *   - shade the sensor      -> ambient drops instantly, that IS the new floor
 *   - key light on for 2 min -> ambient unchanged; above-ambient stays honest
 *   - move to a darker room -> correct at once
 *   - move to a brighter room -> correct after the window ages out
 *
 * The one case it cannot solve is booting with the key light already on: with
 * no dark moment to observe, the lit level looks like the floor. The app's
 * capture flow covers this by showing the ambient estimate at step 1 so it can
 * settle with the light off, which is the only reliable answer available.
 */
static float    ambBucket[AMBIENT_BUCKETS];
static bool     ambSeeded = false;
static int      ambIndex = 0;
static uint32_t ambRotatedMs = 0;

static void updateAmbient(float b, uint32_t nowMs) {
  if (b < 0) return;

  if (!ambSeeded) {
    for (int i = 0; i < AMBIENT_BUCKETS; i++) ambBucket[i] = b;
    ambSeeded = true;
    ambRotatedMs = nowMs;
  }

  while (nowMs - ambRotatedMs >= AMBIENT_BUCKET_MS) {
    ambRotatedMs += AMBIENT_BUCKET_MS;
    ambIndex = (ambIndex + 1) % AMBIENT_BUCKETS;
    ambBucket[ambIndex] = b;              // a fresh bucket starts at "now"
  }

  if (b < ambBucket[ambIndex]) ambBucket[ambIndex] = b;

  float lo = ambBucket[0];
  for (int i = 1; i < AMBIENT_BUCKETS; i++) if (ambBucket[i] < lo) lo = ambBucket[i];
  ambientEst = lo;
}

void sensorsService() {
  uint32_t nowMs = millis();

  if (!pingInFlight && nowMs - lastPingMs >= PING_INTERVAL_MS) {
    lastPingMs = nowMs;
    startPing();
  }

  if (pingInFlight) {
    if (isrHavePulse) {
      uint32_t w = isrWidthUs;
      uint32_t rose = isrRiseUs;
      isrHavePulse = false;
      pingInFlight = false;
      // An edge that rose before we triggered is left over from the previous
      // cycle or is line noise, and must not be reported as this ping's range.
      if ((int32_t)(rose - pingSentUs) < 0) { curDistance = -1.0f; return; }
      if (w >= ECHO_MIN_US && w <= ECHO_MAX_US) {
        curDistance = medianDistance(w / 58.0f);
        distMisses = 0;
        distState = SENSOR_OK;
      } else {
        // A long pulse is the module correctly saying "nothing in range".
        // That is a healthy sensor reporting null, not a fault.
        // The module correctly reporting "nothing in range": a healthy sensor
        // sending null, not a fault. Clear the filter so the first reading
        // after something reappears is not blended with pre-gap history.
        curDistance = -1.0f;
        medianReset();
        distMisses = 0;
        distState = SENSOR_OK;
      }
    } else if (micros() - pingSentUs > ECHO_TIMEOUT_US) {
      // No edge at all: the line never moved. That IS a fault, once repeated.
      pingInFlight = false;
      curDistance = -1.0f;
      if (distMisses < FAULT_AFTER_MISSES) distMisses++;
      if (distMisses >= FAULT_AFTER_MISSES) distState = SENSOR_FAULT;
    }
  }

  /* Sampling light every loop is both pointless and harmful: the loop runs
   * thousands of times a second, which is far faster than light changes and
   * fast enough to distort any time-based smoothing. */
  static uint32_t lastLightMs = 0;
  if (nowMs - lastLightMs < LIGHT_PERIOD_MS) return;
  lastLightMs = nowMs;

  int raw = analogRead(PIN_LDR);
  // Pinned hard against either rail across many samples means a disconnected
  // or shorted divider, not a dark or bright room.
  if (raw <= 1 || raw >= 4094) {
    if (lightMisses < FAULT_AFTER_MISSES) lightMisses++;
  } else {
    lightMisses = 0;
    lightStateV = SENSOR_OK;
  }
  if (lightMisses >= FAULT_AFTER_MISSES) lightStateV = SENSOR_FAULT;

  curBright = raw / 4095.0f;
  updateAmbient(curBright, nowMs);
}

Reading sensorsRead() {
  Reading r;
  r.distance_cm = curDistance;
  r.brightness  = (lightStateV == SENSOR_FAULT) ? -1.0f : curBright;
  r.ambient     = ambientEst;
  r.seq         = ++seqNo;
  r.ts          = (uint64_t)millis();
  return r;
}

SensorState distanceState() { return distState; }
SensorState lightState()    { return lightStateV; }

const char *stateName(SensorState s) {
  switch (s) {
    case SENSOR_OK:    return "ok";
    case SENSOR_FAULT: return "fault";
    default:           return "unknown";
  }
}
