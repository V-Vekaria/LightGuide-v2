#pragma once
#include <Arduino.h>

// What the sound is currently guiding on. Distance is judged before light,
// because that is the order a rig is set up in.
enum BuzzChannel { BUZZ_SILENT, BUZZ_TOO_CLOSE, BUZZ_TOO_FAR,
                   BUZZ_UNDERLIT, BUZZ_OVERLIT, BUZZ_ARRIVED };

void buzzerBegin();
void buzzerSet(BuzzChannel c);   // idempotent; a repeat does not restart a pattern
void buzzerService();            // call often, never blocks
void buzzerChirp(int freq, int ms);   // one-off acknowledgement, e.g. a capture
