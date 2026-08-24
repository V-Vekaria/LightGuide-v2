#pragma once
#include <Arduino.h>

/* Split in two on purpose. The identity is needed to name the access point,
 * but the HTTP server must not start until Wi-Fi is up: AsyncTCP binds through
 * lwIP, and lwIP does not exist before WiFi.mode() has run. Starting the server
 * first faults inside begin() and resets the board.
 *
 *   apiInitIdentity();   ->   WiFi.softAP(deviceName(), ...)   ->   apiStartServer();
 */
void apiInitIdentity();
void apiStartServer();
void apiBroadcastLive();

/* The active target, for the on-device screen only.
 *
 * This is a READ of what the app already sent us - the board is not inventing a
 * target or a tolerance, it is rendering the one it was given. Nothing derived
 * from it is ever sent back: the live frame carries measurements and nothing
 * else, so the app remains the only thing that computes a verdict for the
 * customer. See device/docs/03-OPEN-DECISIONS.md D6. */
struct ActiveTarget {
  bool  present;
  float distance_cm;
  float distance_tol_cm;
  bool  has_brightness;
  float brightness_above_ambient;
  float brightness_tol;
};
ActiveTarget apiActiveTarget();

/* Set the active target from the device itself - the on-board capture gesture.
 * The app sees it on its next read of GET /api/active, so no new route and no
 * device->app push is needed. */
void apiSetActiveTarget(float distance_cm, float distance_tol_cm,
                        bool has_brightness, float brightness_above_ambient,
                        float brightness_tol);
const char *deviceId();
const char *deviceName();
