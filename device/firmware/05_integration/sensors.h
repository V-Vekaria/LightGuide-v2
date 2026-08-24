#pragma once
#include <Arduino.h>

enum SensorState { SENSOR_UNKNOWN, SENSOR_OK, SENSOR_FAULT };

struct Reading {
  float distance_cm;    // <0 means null - never 0, the app would believe a zero
  float brightness;     // 0..1, ambient NOT subtracted; <0 means null
  float ambient;        // 0..1, the device's own continuous estimate
  uint32_t seq;
  uint64_t ts;
};

void      sensorsBegin();
void      sensorsService();          // call often; never blocks
Reading   sensorsRead();
SensorState distanceState();
SensorState lightState();
const char *stateName(SensorState s);
