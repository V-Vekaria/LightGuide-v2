#include "api.h"
#include "config.h"
#include "sensors.h"
#include "store.h"

#include <WiFi.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>

#include "www_bundle.h"

/* Constructed in apiBegin(), not as globals.
 *
 * Static objects run their constructors before the Arduino core has finished
 * bringing USB up. Anything that faults in there resets the board with no
 * serial port ever appearing - the device simply vanishes from USB and no boot
 * trace can help, because none of it has run yet. Building these on the heap at
 * a known point in setup() removes the whole class of failure. */
static AsyncWebServer *server = nullptr;
static AsyncWebSocket *ws     = nullptr;

static char devId[24];
static char devName[32];

const char *deviceId()   { return devId; }
const char *deviceName() { return devName; }

static JsonDocument activeTarget;    // meaningful only when haveTarget (empty until used)
static bool haveTarget = false;

// ---------------------------------------------------------------- identity --
static void makeIdentity() {
  uint8_t mac[6] = {0};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  // Stable across reboots and reflashes: it is the whole basis of
  // "the same device reconnected" vs "a different device answered".
  snprintf(devId, sizeof devId, "lg-%02x%02x%02x%02x%02x%02x",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  snprintf(devName, sizeof devName, "LightGuide %02X%02X", mac[4], mac[5]);
}

static void addCors(AsyncWebServerResponse *res) {
  res->addHeader("Access-Control-Allow-Origin", "*");
  res->addHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res->addHeader("Access-Control-Allow-Headers", "Content-Type");
}

static void sendJson(AsyncWebServerRequest *req, int code, const String &body) {
  AsyncWebServerResponse *res = req->beginResponse(code, "application/json", body);
  addCors(res);
  req->send(res);
}

static void sendStatus(AsyncWebServerRequest *req, int code) {
  AsyncWebServerResponse *res = req->beginResponse(code);
  addCors(res);
  req->send(res);
}

static void handleInfo(AsyncWebServerRequest *req) {
  JsonDocument d;
  d["protocol"]           = PROTOCOL_VERSION;       // a number, never a string
  d["device_id"]          = devId;
  d["name"]               = devName;
  d["model"]              = DEVICE_MODEL;
  d["firmware"]           = FIRMWARE_VERSION;
  d["uptime_s"]           = (uint32_t)(millis() / 1000);
  d["free_storage_bytes"] = (uint32_t)storeFreeBytes();
  JsonObject s = d["sensors"].to<JsonObject>();
  s["distance"]["state"] = stateName(distanceState());
  s["light"]["state"]    = stateName(lightState());
  // Deliberately no message/error/detail/hint key. The device reports state;
  // the app writes the sentence a photographer reads. Conformance checks this.
  String out;
  serializeJson(d, out);
  sendJson(req, 200, out);
}

static void handleAmbient(AsyncWebServerRequest *req) {
  Reading r = sensorsRead();
  JsonDocument d;
  if (r.ambient < 0) d["ambient"] = nullptr;
  else               d["ambient"] = r.ambient;
  String out;
  serializeJson(d, out);
  sendJson(req, 200, out);
}

static void handleGetActive(AsyncWebServerRequest *req) {
  JsonDocument d;
  // An envelope, so "not guiding" is a value rather than an absence.
  if (haveTarget) d["target"] = activeTarget.as<JsonVariantConst>();
  else            d["target"] = nullptr;
  String out;
  serializeJson(d, out);
  sendJson(req, 200, out);
}

static void handleListSetups(AsyncWebServerRequest *req) {
  bool includeDeleted = false;
  if (req->hasParam("include_deleted")) {
    String v = req->getParam("include_deleted")->value();
    // Strict on purpose. A board that read include_deleted=true as "off" would
    // return a tombstone-free list, and the app would write a backup that
    // silently resurrects deletions. A typo has to be loud.
    if (v != "1") {
      sendJson(req, 400, "{\"error\":\"include_deleted must be 1 if present\"}");
      return;
    }
    includeDeleted = true;
  }
  String out;
  storeListJson(out, includeDeleted);
  sendJson(req, 200, out);
}

/*
 * Routes needing a path parameter or a request body.
 *
 * A dedicated handler rather than regex routing: regex matching is a
 * compile-time option in this library, so relying on it would make the build
 * depend on a flag that is easy to lose.
 */
class ApiHandler : public AsyncWebHandler {
 public:
  bool canHandle(AsyncWebServerRequest *req) const override {
    const String u = req->url();
    if (u == "/api/active" &&
        (req->method() == HTTP_POST || req->method() == HTTP_DELETE)) return true;
    if (u.startsWith("/api/setups/") &&
        (req->method() == HTTP_PUT || req->method() == HTTP_DELETE)) return true;
    return false;
  }

  /* Accumulate only. The library calls handleBody() for each chunk and THEN
   * calls handleRequest() once - so replying from here as well produced two
   * responses per request, and the second (a 400) is the one the app saw.
   * Everything is answered from handleRequest(). */
  void handleBody(AsyncWebServerRequest *req, uint8_t *data, size_t len,
                  size_t index, size_t total) override {
    if (index == 0) {
      auto *buf = new String();
      buf->reserve(total + 1);
      req->_tempObject = buf;
    }
    if (!req->_tempObject) return;
    String *buf = (String *)req->_tempObject;
    for (size_t i = 0; i < len; i++) buf->concat((char)data[i]);
  }

  void handleRequest(AsyncWebServerRequest *req) override {
    const String u = req->url();

    // --- no body ---
    if (u == "/api/active" && req->method() == HTTP_DELETE) {
      haveTarget = false;
      activeTarget.clear();
      sendStatus(req, 204);
      return;
    }
    if (u.startsWith("/api/setups/") && req->method() == HTTP_DELETE) {
      const String id = u.substring(strlen("/api/setups/"));
      sendStatus(req, storeDelete(id) ? 204 : 404);
      return;
    }

    // --- body required ---
    String body;
    if (req->_tempObject) {
      body = *(String *)req->_tempObject;
      delete (String *)req->_tempObject;
      req->_tempObject = nullptr;
    }
    if (body.isEmpty()) { sendJson(req, 400, "{\"error\":\"body required\"}"); return; }

    JsonDocument doc;
    if (deserializeJson(doc, body) || !doc.is<JsonObject>()) {
      sendJson(req, 400, "{\"error\":\"malformed json\"}");
      return;
    }
    JsonObject o = doc.as<JsonObject>();

    if (u == "/api/active" && req->method() == HTTP_POST) {
      /* A complete Target only. {} and an empty body are 400: the old
       * key-counting inference would have read a TRUNCATED request - a real
       * outcome on a flaky access point - as "stop guiding".
       *
       * is<double>() rather than is<float>(): it accepts integers too, so a
       * target typed as "50" is not rejected for lacking a decimal point. */
      const bool complete =
          o["distance_cm"].is<double>() &&
          o["distance_tol_cm"].is<double>() &&
          o["brightness_tol"].is<double>() &&
          // null means a distance-only guide and must never become 0.
          (o["brightness_above_ambient"].isNull() ||
           o["brightness_above_ambient"].is<double>());
      if (!complete) { sendJson(req, 400, "{\"error\":\"incomplete target\"}"); return; }
      activeTarget.clear();
      activeTarget.set(doc);
      haveTarget = true;
      sendStatus(req, 204);
      return;
    }

    if (u.startsWith("/api/setups/") && req->method() == HTTP_PUT) {
      const String id = u.substring(strlen("/api/setups/"));
      String stored;
      const int rc = storeUpsert(id, o, stored);
      if (rc) { sendJson(req, rc, "{\"error\":\"rejected\"}"); return; }
      sendJson(req, 200, stored);
      return;
    }

    sendStatus(req, 404);
  }
};

static ApiHandler apiHandler;

/*
 * The app bundle is compiled into flash by device/tools/bundle_to_header.py
 * rather than uploaded to the filesystem, so a board can never serve a bundle
 * from a different build than its own firmware. Everything is stored gzipped
 * and handed over with Content-Encoding: gzip.
 *
 * Unknown non-API paths fall back to index.html: the app is a single-page
 * client and a deep link must not 404.
 */
static bool serveBundled(AsyncWebServerRequest *req) {
  String path = req->url();
  if (path == "/") path = "/index.html";

  const WwwFile *hit = nullptr;
  for (size_t i = 0; i < WWW_FILE_COUNT; i++) {
    if (path == WWW_FILES[i].path) { hit = &WWW_FILES[i]; break; }
  }
  if (!hit && !path.startsWith("/assets/")) {
    for (size_t i = 0; i < WWW_FILE_COUNT; i++) {
      if (String("/index.html") == WWW_FILES[i].path) { hit = &WWW_FILES[i]; break; }
    }
  }
  if (!hit) return false;

  AsyncWebServerResponse *res =
      req->beginResponse(200, hit->mime, hit->data, hit->len);
  res->addHeader("Content-Encoding", "gzip");
  // Hashed asset names make these safe to cache hard; index.html must not be.
  if (path.startsWith("/assets/")) res->addHeader("Cache-Control", "max-age=31536000, immutable");
  else                             res->addHeader("Cache-Control", "no-cache");
  req->send(res);
  return true;
}

ActiveTarget apiActiveTarget() {
  ActiveTarget t = {};
  if (!haveTarget) return t;
  JsonObject o = activeTarget.as<JsonObject>();
  t.present         = true;
  t.distance_cm     = o["distance_cm"] | 0.0f;
  t.distance_tol_cm = o["distance_tol_cm"] | 0.0f;
  t.brightness_tol  = o["brightness_tol"] | 0.0f;
  // null means a distance-only guide; it must not read as 0.
  t.has_brightness  = !o["brightness_above_ambient"].isNull();
  t.brightness_above_ambient = t.has_brightness ? (float)(o["brightness_above_ambient"] | 0.0f) : 0.0f;
  return t;
}

void apiSetActiveTarget(float distance_cm, float distance_tol_cm,
                        bool has_brightness, float brightness_above_ambient,
                        float brightness_tol) {
  activeTarget.clear();
  JsonObject o = activeTarget.to<JsonObject>();
  o["distance_cm"]     = distance_cm;
  o["distance_tol_cm"] = distance_tol_cm;
  o["brightness_tol"]  = brightness_tol;
  if (has_brightness) o["brightness_above_ambient"] = brightness_above_ambient;
  else                o["brightness_above_ambient"] = nullptr;
  haveTarget = true;
}

void apiBroadcastLive() {
  if (!ws || ws->count() == 0) return;
  const Reading r = sensorsRead();
  JsonDocument d;
  // A dropout is null, never 0. The app believes a zero.
  if (r.distance_cm < 0) d["distance_cm"] = nullptr; else d["distance_cm"] = r.distance_cm;
  if (r.brightness  < 0) d["brightness"]  = nullptr; else d["brightness"]  = r.brightness;
  if (r.ambient     < 0) d["ambient"]     = nullptr; else d["ambient"]     = r.ambient;
  d["seq"] = r.seq;
  d["ts"]  = (double)r.ts;
  String out;
  serializeJson(d, out);
  ws->textAll(out);
}

void apiInitIdentity() { makeIdentity(); }

void apiStartServer() {
  server = new AsyncWebServer(80);
  ws     = new AsyncWebSocket("/live");

  ws->onEvent([](AsyncWebSocket *, AsyncWebSocketClient *, AwsEventType,
                 void *, uint8_t *, size_t) {});
  server->addHandler(ws);
  server->addHandler(&apiHandler);

  server->on("/api/info",    HTTP_GET, handleInfo);
  server->on("/api/ambient", HTTP_GET, handleAmbient);
  server->on("/api/active",  HTTP_GET, handleGetActive);
  server->on("/api/setups",  HTTP_GET, handleListSetups);

  server->onNotFound([](AsyncWebServerRequest *req) {
    if (req->method() == HTTP_OPTIONS) { sendStatus(req, 204); return; }
    if (req->url().startsWith("/api/")) {
      sendJson(req, 404, "{\"error\":\"not found\"}");
      return;
    }
    if (serveBundled(req)) return;
    sendJson(req, 404, "{\"error\":\"not found\"}");
  });

  server->begin();
}
