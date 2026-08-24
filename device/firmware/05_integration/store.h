#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

bool     storeBegin();
void     storeListJson(String &out, bool includeDeleted);
// Returns 0 on success, or the HTTP status to reply with (400 etc).
int      storeUpsert(const String &id, JsonObjectConst body, String &storedOut);
bool     storeDelete(const String &id);
size_t   storeFreeBytes();

/* Clear the library. Reachable only over the USB serial console - deliberately
 * NOT a route. The contract has no remote wipe, and adding one so a test could
 * reset the board would mean any client on the access point could erase a
 * customer's setups. A cable is a fair proof of physical access. */
bool     storeWipe();

/* Capture the readings in front of the device as a new setup. Returns false if
 * the library is full. `brightness` < 0 stores a distance-only setup. */
bool     storeCreateCaptured(float distance_cm, float brightness, String &idOut);
