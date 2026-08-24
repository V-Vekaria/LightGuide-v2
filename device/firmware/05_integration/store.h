#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

bool     storeBegin();
void     storeListJson(String &out, bool includeDeleted);
// Returns 0 on success, or the HTTP status to reply with (400 etc).
int      storeUpsert(const String &id, JsonObjectConst body, String &storedOut);
bool     storeDelete(const String &id);
size_t   storeFreeBytes();

/* Capture the readings in front of the device as a new setup. Returns false if
 * the library is full. `brightness` < 0 stores a distance-only setup. */
bool     storeCreateCaptured(float distance_cm, float brightness, String &idOut);
