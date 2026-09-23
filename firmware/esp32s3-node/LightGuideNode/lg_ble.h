// BLE GATT server for LightGuide Device Protocol v2.
//
// Uses the arduino-esp32 BLE library (NimBLE host on the ESP32-S3) to build
// the service, and the NimBLE host API directly to send notifications, so the
// node can check the negotiated ATT MTU and the send result itself: the
// library's notify() silently truncates an oversize value, which would put a
// broken JSON object on the air.
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "src/lg_protocol.h"

namespace lgble {

enum class Chr : uint8_t { Measurement, Event, Status };

enum class NotifyResult : uint8_t {
  Sent,
  NotConnected,
  NotSubscribed,
  TooLarge,  // payload > negotiated ATT MTU - 3; never truncated or fragmented
  NoMemory,  // host buffers exhausted; the caller may retry
  Failed,
};

// Builds a fresh status payload for a Status READ. Called in the BLE host
// task, so it must be quick and thread-safe.
using StatusBuilder = size_t (*)(char *out, size_t cap);

// Starts the GATT server and advertising. deviceInfo is the Device info READ
// value, fixed for the life of the firmware.
void begin(const char *deviceInfo, size_t deviceInfoLen, StatusBuilder statusBuilder);

// Restarts advertising if there is no connection and it is not running.
void ensureAdvertising();

bool connected();
uint16_t mtu();  // negotiated ATT MTU of the current connection, 0 if none
bool subscribed(Chr c);

NotifyResult notify(Chr c, const char *payload, size_t len);

// Commands written by the phone, queued from the BLE host task.
bool nextCommand(lg::Command &cmd);

// Connection counters for the serial log.
uint32_t connectCount();
uint32_t disconnectCount();

}  // namespace lgble
