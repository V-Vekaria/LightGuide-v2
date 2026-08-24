#include "store.h"
#include "config.h"
#include <LittleFS.h>

/*
 * The whole library lives in one JSON file.  At ~200 B a setup and a cap of 64,
 * that is ~13 KB against a 9.4 MB partition - rewriting the file on every change
 * is far simpler than per-record files and costs nothing at this size.
 *
 * Records are stored VERBATIM, including fields this firmware does not know
 * about, so a newer app can add a field without the board silently dropping it
 * on the next write.
 */

static JsonDocument doc;          // { "setups": [ ... ] }
static int64_t newestKnownMs = 0; // high-water mark of every updated_at seen

// ---- ISO-8601 (UTC, millisecond) -----------------------------------------
// Only the exact shape the app emits: 2026-08-20T12:34:56.789Z
static int64_t isoToMs(const char *s) {
  if (!s) return -1;
  int Y, M, D, h, m, sec, ms = 0;
  int n = sscanf(s, "%4d-%2d-%2dT%2d:%2d:%2d.%3d", &Y, &M, &D, &h, &m, &sec, &ms);
  if (n < 6) return -1;
  struct tm tmv = {};
  tmv.tm_year = Y - 1900; tmv.tm_mon = M - 1; tmv.tm_mday = D;
  tmv.tm_hour = h; tmv.tm_min = m; tmv.tm_sec = sec;
  time_t t = mktime(&tmv);          // TZ is UTC on this board; never set
  if (t < 0) return -1;
  return (int64_t)t * 1000 + ms;
}

static void msToIso(int64_t ms, char *out, size_t n) {
  time_t secs = (time_t)(ms / 1000);
  int rem = (int)(ms % 1000);
  struct tm tmv;
  gmtime_r(&secs, &tmv);
  snprintf(out, n, "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
           tmv.tm_year + 1900, tmv.tm_mon + 1, tmv.tm_mday,
           tmv.tm_hour, tmv.tm_min, tmv.tm_sec, rem);
}

static void noteTimestamp(const char *iso) {
  int64_t v = isoToMs(iso);
  if (v > newestKnownMs) newestKnownMs = v;
}

static JsonArray setups() { return doc["setups"].to<JsonArray>(); }
static JsonArray setupsRW() {
  if (!doc["setups"].is<JsonArray>()) doc["setups"].to<JsonArray>();
  return doc["setups"].as<JsonArray>();
}

static bool save() {
  File f = LittleFS.open(SETUPS_PATH, "w");
  if (!f) return false;
  serializeJson(doc, f);
  f.close();
  return true;
}

bool storeBegin() {
  /* Deliberately NOT LittleFS.begin(true).
   *
   * The auto-format flag formats the whole partition inline, and this board's
   * data partition is 9.4 MB. That takes long enough to trip the task watchdog,
   * which resets the board, which formats again - a boot loop that never gets
   * far enough to bring USB up, so the device simply disappears. Learned the
   * hard way on the first flash of this firmware.
   *
   * Mount first. Only format if that genuinely fails, and say so on serial
   * before starting, so a long silence is explained rather than mysterious. */
  if (!LittleFS.begin(false)) {
    Serial.println(F("littlefs: mount failed, formatting (can take ~30 s)"));
    Serial.flush();
    if (!LittleFS.format()) { Serial.println(F("littlefs: format FAILED")); return false; }
    if (!LittleFS.begin(false)) { Serial.println(F("littlefs: still unmountable")); return false; }
    Serial.println(F("littlefs: formatted and mounted"));
  }
  File f = LittleFS.open(SETUPS_PATH, "r");
  if (f) {
    DeserializationError err = deserializeJson(doc, f);
    f.close();
    if (err) doc.clear();
  }
  if (!doc["setups"].is<JsonArray>()) setups();

  for (JsonObject o : setupsRW()) noteTimestamp(o["updated_at"]);
  return true;
}

void storeListJson(String &out, bool includeDeleted) {
  JsonDocument tmp;
  JsonArray arr = tmp.to<JsonArray>();
  for (JsonObject o : setupsRW()) {
    if (!includeDeleted && o["deleted"].as<bool>()) continue;
    arr.add(o);
  }
  serializeJson(arr, out);
}

int storeUpsert(const String &id, JsonObjectConst body, String &storedOut) {
  // Refusing these is deliberate: a record with no updated_at or no deleted
  // flag can never be ordered against anything again, so storing it is worse
  // than rejecting it.
  if (body.isNull()) return 400;
  const char *upd = body["updated_at"];
  if (!upd || !*upd) return 400;
  if (!body["deleted"].is<bool>()) return 400;

  JsonArray arr = setupsRW();
  for (size_t i = 0; i < arr.size(); i++) {
    if (id == arr[i]["id"].as<const char *>()) { arr.remove(i); break; }
  }
  if (arr.size() >= MAX_SETUPS) return 507;

  JsonObject o = arr.add<JsonObject>();
  for (JsonPairConst kv : body) o[kv.key()] = kv.value();
  o["id"] = id;                    // the URL wins over whatever the body claims

  noteTimestamp(upd);              // never re-stamp: LWW is the writer's call
  if (!save()) return 500;
  serializeJson(o, storedOut);
  return 0;
}

bool storeDelete(const String &id) {
  for (JsonObject o : setupsRW()) {
    if (id != o["id"].as<const char *>()) continue;

    /* The tombstone must be strictly newer than the live copy or it can never
     * win a last-write-wins merge.  This board has no RTC and no internet, so
     * its own clock starts at the epoch and would lose every time.  Instead we
     * stamp one millisecond past the newest timestamp the app has ever given
     * us, which is newer than anything that can already be stored. */
    newestKnownMs += 1;
    char iso[32];
    msToIso(newestKnownMs, iso, sizeof iso);

    o["deleted"] = true;
    o["updated_at"] = iso;
    return save();
  }
  return false;                     // unknown id
}

bool storeCreateCaptured(float distance_cm, float brightness, String &idOut) {
  JsonArray arr = setupsRW();
  if (arr.size() >= MAX_SETUPS) return false;

  /* No RTC and no internet, so the device cannot know the real time. It stamps
   * one millisecond past the newest timestamp the app has ever sent, which is
   * newer than anything already stored and therefore wins a last-write-wins
   * merge - the same trick tombstones use. Before the app has ever written,
   * this is an epoch date: honest, and still correctly ordered. */
  newestKnownMs += 1;
  char iso[32];
  msToIso(newestKnownMs, iso, sizeof iso);

  // Enough to be unique on one device without a random source.
  char id[40];
  snprintf(id, sizeof id, "dev-%08lx-%04x",
           (unsigned long)(newestKnownMs & 0xffffffff), (unsigned)(millis() & 0xffff));

  JsonObject o = arr.add<JsonObject>();
  o["id"]              = id;
  o["name"]            = "Captured on device";
  o["distance_cm"]     = distance_cm;
  o["distance_source"] = "captured";
  o["distance_tol_cm"] = DEFAULT_DISTANCE_TOL_CM;
  if (brightness >= 0) {
    o["brightness_above_ambient"] = brightness;
    o["brightness_captured_at"]   = iso;
  } else {
    // null, not 0 - it marks a distance-only setup.
    o["brightness_above_ambient"] = nullptr;
    o["brightness_captured_at"]   = nullptr;
  }
  o["brightness_tol"] = DEFAULT_BRIGHTNESS_TOL;
  o["created_at"]     = iso;
  o["updated_at"]     = iso;
  o["deleted"]        = false;

  idOut = id;
  return save();
}

bool storeWipe() {
  doc.clear();
  setups();
  newestKnownMs = 0;
  return save();
}

size_t storeFreeBytes() {
  return LittleFS.totalBytes() - LittleFS.usedBytes();
}
