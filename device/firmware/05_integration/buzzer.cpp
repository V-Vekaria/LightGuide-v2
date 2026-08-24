#include "buzzer.h"
#include "config.h"

/*
 * v1's buzzer, rebuilt on LEDC.
 *
 * The rules and rhythms are v1's (LightGuide-Edge/firmware/03_inference,
 * updateBuzzer), because they were arrived at by using the thing:
 *
 *   distance wrong -> a single repeating beep: fast when too close, slow when
 *                     too far
 *   light wrong    -> a DOUBLE blip, so the channel is identifiable by rhythm
 *                     before you look up
 *   arrived        -> one chirp, then silence
 *
 * Silence-means-success is the parking-sensor convention, and a continuous tone
 * would drown out everything else in a room.
 *
 * TWO THINGS ARE DELIBERATELY NOT v1's:
 *
 * 1. tone() does not exist on ESP32. LEDC does the same job.
 *
 * 2. Every pattern sounds at ONE pitch: BUZZER_HZ, the buzzer's measured
 *    resonance (device/reports/M0c_peripherals_acceptance.md).
 *
 *    v1 coded direction into pitch as well as rhythm - low for too far, high
 *    for too close. That is a real loss, and it was given up on purpose: this
 *    passive buzzer driven single-ended off a 3.3 V pin is quiet everywhere
 *    except its resonant peak, so a pitch-coded scheme meant half the alerts
 *    being the ones you cannot hear. An unheard distinction carries nothing.
 *
 *    The RHYTHMS still separate every state - fast repeat, slow repeat, double
 *    blip, single chirp - and rhythm was always doing the heavier work, since
 *    it identifies the channel before you look up.
 *
 *    If the buzzer is ever driven harder (differential across two pins, or a
 *    transistor on 5 V), pitch coding is worth restoring: give these constants
 *    distinct values again and nothing else needs to change.
 */

static const int F_TOO_CLOSE = BUZZER_HZ;
static const int F_TOO_FAR   = BUZZER_HZ;
static const int F_UNDERLIT  = BUZZER_HZ;
static const int F_OVERLIT   = BUZZER_HZ;
static const int F_ARRIVED   = BUZZER_HZ;

static BuzzChannel current = BUZZ_SILENT;
static uint32_t    phaseStart = 0;
static bool        toneOn = false;
static bool        arrivedChirpDone = false;

static uint32_t    chirpUntil = 0;      // one-off chirp overrides the pattern

static void toneOnAt(int freq) {
  if (toneOn) return;
  ledcWriteTone(BUZZER_LEDC_CH, freq);
  toneOn = true;
}

static void toneOff() {
  if (!toneOn) return;
  ledcWriteTone(BUZZER_LEDC_CH, 0);
  toneOn = false;
}

void buzzerBegin() {
  ledcSetup(BUZZER_LEDC_CH, BUZZER_HZ, 8);
  ledcAttachPin(PIN_BUZZER, BUZZER_LEDC_CH);
  ledcWriteTone(BUZZER_LEDC_CH, 0);
  toneOn = false;
}

void buzzerSet(BuzzChannel c) {
  if (c == current) return;             // do not restart a pattern every frame
  current = c;
  phaseStart = millis();
  arrivedChirpDone = false;
  toneOff();
}

void buzzerChirp(int freq, int ms) {
  ledcWriteTone(BUZZER_LEDC_CH, freq);
  toneOn = true;
  chirpUntil = millis() + ms;
}

void buzzerService() {
  const uint32_t now = millis();

  if (chirpUntil) {
    if ((int32_t)(now - chirpUntil) < 0) return;   // chirp still sounding
    chirpUntil = 0;
    toneOff();
    phaseStart = now;
  }

  switch (current) {
    case BUZZ_SILENT:
      toneOff();
      return;

    case BUZZ_TOO_CLOSE:
    case BUZZ_TOO_FAR: {
      // Rhythm alone says which: fast repeat = too close, slow = too far. The
      // faster rhythm reads as more urgent, which is the right way round.
      const int      freq  = (current == BUZZ_TOO_CLOSE) ? F_TOO_CLOSE : F_TOO_FAR;
      const uint32_t onMs  = (current == BUZZ_TOO_CLOSE) ? 60  : 80;
      const uint32_t perMs = (current == BUZZ_TOO_CLOSE) ? 200 : 600;

      uint32_t phase = now - phaseStart;
      if (phase >= perMs) { phaseStart = now; phase = 0; }
      if (phase < onMs) toneOnAt(freq); else toneOff();
      return;
    }

    case BUZZ_UNDERLIT:
    case BUZZ_OVERLIT: {
      // Two 40 ms tones 80 ms apart, repeating every 700 ms. With pitch coding
      // gone this double blip is the ONLY thing separating the light channel
      // from the distance one, so it matters more than it did in v1.
      const int freq = (current == BUZZ_OVERLIT) ? F_OVERLIT : F_UNDERLIT;
      uint32_t phase = now - phaseStart;
      if (phase >= 700) { phaseStart = now; phase = 0; }
      const bool on = (phase < 40) || (phase >= 80 && phase < 120);
      if (on) toneOnAt(freq); else toneOff();
      return;
    }

    case BUZZ_ARRIVED:
      // One chirp on arrival, then silence.
      if (arrivedChirpDone) { toneOff(); return; }
      if (!toneOn) { toneOnAt(F_ARRIVED); phaseStart = now; }
      else if (now - phaseStart >= 150) { toneOff(); arrivedChirpDone = true; }
      return;
  }
}
