#include "lg_ble.h"

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <host/ble_att.h>
#include <host/ble_gatt.h>
#include <host/ble_hs.h>
#include <host/ble_hs_mbuf.h>

#include <atomic>

#include "node_config.h"

namespace lgble {
namespace {

BLEServer *server = nullptr;
BLECharacteristic *chrInfo = nullptr, *chrMeasurement = nullptr, *chrEvent = nullptr,
                  *chrCommand = nullptr, *chrStatus = nullptr;
StatusBuilder buildStatus = nullptr;
QueueHandle_t commandQueue = nullptr;

// One phone at a time (protocol v2 topology). Written in the BLE host task.
constexpr uint16_t kNoConn = 0xFFFF;
std::atomic<uint16_t> connHandle{kNoConn};
std::atomic<bool> subMeasurement{false}, subEvent{false}, subStatus{false};
std::atomic<uint32_t> connects{0}, disconnects{0};

void clearSubscriptions() {
  subMeasurement = false;
  subEvent = false;
  subStatus = false;
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *, ble_gap_conn_desc *desc) override {
    connHandle = desc->conn_handle;
    clearSubscriptions();
    connects++;
    // A measurement is ~400 bytes. The phone only gets it whole if the ATT MTU
    // is raised above that, and the Android app does not request a larger MTU
    // itself. Either side may start the exchange, so the node does; Android
    // answers with its own maximum (517). If the result is still too small,
    // oversize notifications are skipped and Status reports ble:mtu_too_small.
    ble_gattc_exchange_mtu(desc->conn_handle, nullptr, nullptr);
  }

  void onDisconnect(BLEServer *, ble_gap_conn_desc *) override {
    connHandle = kNoConn;
    clearSubscriptions();
    disconnects++;
    // advertiseOnDisconnect(true) restarts advertising here; the node loop
    // also calls ensureAdvertising() as a backstop.
  }
};

class StatusCallbacks : public BLECharacteristicCallbacks {
  // Called in the BLE host task for the first chunk of every Status READ, so a
  // read always returns a fresh status. Long-read follow-up chunks do not call
  // this and keep reading the same value.
  void onRead(BLECharacteristic *c, ble_gap_conn_desc *) override {
    char buf[lg::kStatusMax];
    size_t n = buildStatus ? buildStatus(buf, sizeof(buf)) : 0;
    if (n) c->setValue((uint8_t *)buf, n);
  }
};

class SubscribeCallbacks : public BLECharacteristicCallbacks {
 public:
  explicit SubscribeCallbacks(std::atomic<bool> &flag) : flag_(flag) {}
  void onSubscribe(BLECharacteristic *, ble_gap_conn_desc *, uint16_t subValue) override {
    flag_ = (subValue & 0x0001) != 0;  // notifications enabled
  }

 private:
  std::atomic<bool> &flag_;
};

// The status characteristic needs both behaviours.
class StatusAndSubscribeCallbacks : public StatusCallbacks {
 public:
  void onSubscribe(BLECharacteristic *, ble_gap_conn_desc *, uint16_t subValue) override {
    subStatus = (subValue & 0x0001) != 0;
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  // Runs in the BLE host task before the write response is sent: parse only,
  // and hand the work to the node loop.
  void onWrite(BLECharacteristic *c, ble_gap_conn_desc *) override {
    String v = c->getValue();
    lg::Command cmd = lg::parseCommand((const uint8_t *)v.c_str(), v.length());
    if (commandQueue) xQueueSend(commandQueue, &cmd, 0);
  }
};

BLECharacteristic *chrFor(Chr c) {
  switch (c) {
    case Chr::Measurement: return chrMeasurement;
    case Chr::Event: return chrEvent;
    case Chr::Status: return chrStatus;
  }
  return nullptr;
}

}  // namespace

void begin(const char *deviceInfo, size_t deviceInfoLen, StatusBuilder statusBuilder) {
  buildStatus = statusBuilder;
  commandQueue = xQueueCreate(8, sizeof(lg::Command));

  BLEDevice::init(LG_BLE_NAME);
  BLEDevice::setMTU(LG_BLE_PREFERRED_MTU);

  server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  server->advertiseOnDisconnect(true);

  BLEService *svc = server->createService(BLEUUID(LG_UUID_SERVICE));

  chrInfo = svc->createCharacteristic(BLEUUID(LG_UUID_DEVICE_INFO),
                                      BLECharacteristic::PROPERTY_READ);
  chrInfo->setValue((uint8_t *)deviceInfo, deviceInfoLen);

  chrMeasurement = svc->createCharacteristic(BLEUUID(LG_UUID_MEASUREMENT),
                                             BLECharacteristic::PROPERTY_NOTIFY);
  chrMeasurement->setCallbacks(new SubscribeCallbacks(subMeasurement));

  chrEvent = svc->createCharacteristic(BLEUUID(LG_UUID_EVENT), BLECharacteristic::PROPERTY_NOTIFY);
  chrEvent->setCallbacks(new SubscribeCallbacks(subEvent));

  chrCommand = svc->createCharacteristic(BLEUUID(LG_UUID_COMMAND),
                                         BLECharacteristic::PROPERTY_WRITE);
  chrCommand->setCallbacks(new CommandCallbacks());

  chrStatus = svc->createCharacteristic(
      BLEUUID(LG_UUID_STATUS), BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  chrStatus->setCallbacks(new StatusAndSubscribeCallbacks());
  {
    char buf[lg::kStatusMax];
    size_t n = buildStatus ? buildStatus(buf, sizeof(buf)) : 0;
    if (n) chrStatus->setValue((uint8_t *)buf, n);
  }

  svc->start();

  // The 128-bit service UUID and the name do not both fit in the 31-byte
  // advertising packet: the UUID goes in the advertisement (Android filters
  // scans on it) and the local name in the scan response.
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  BLEAdvertisementData advData, scanData;
  advData.setFlags(0x06);  // LE General Discoverable, BR/EDR not supported
  advData.setCompleteServices(BLEUUID(LG_UUID_SERVICE));
  scanData.setName(LG_BLE_NAME);
  adv->setAdvertisementData(advData);
  adv->setScanResponseData(scanData);
  BLEDevice::startAdvertising();
}

void ensureAdvertising() {
  if (!server || connected()) return;
  if (!ble_gap_adv_active()) BLEDevice::startAdvertising();
}

bool connected() { return connHandle.load() != kNoConn; }

uint16_t mtu() {
  uint16_t h = connHandle.load();
  return h == kNoConn ? 0 : ble_att_mtu(h);
}

bool subscribed(Chr c) {
  switch (c) {
    case Chr::Measurement: return subMeasurement;
    case Chr::Event: return subEvent;
    case Chr::Status: return subStatus;
  }
  return false;
}

NotifyResult notify(Chr c, const char *payload, size_t len) {
  uint16_t h = connHandle.load();
  if (h == kNoConn) return NotifyResult::NotConnected;
  if (!subscribed(c)) return NotifyResult::NotSubscribed;
  uint16_t m = ble_att_mtu(h);
  if (m < 23 || len > (size_t)(m - 3)) return NotifyResult::TooLarge;
  os_mbuf *om = ble_hs_mbuf_from_flat(payload, len);
  if (!om) return NotifyResult::NoMemory;
  // ble_gatts_notify_custom takes ownership of om, including on failure.
  int rc = ble_gatts_notify_custom(h, chrFor(c)->getHandle(), om);
  if (rc == 0) return NotifyResult::Sent;
  if (rc == BLE_HS_ENOMEM) return NotifyResult::NoMemory;
  if (rc == BLE_HS_ENOTCONN) return NotifyResult::NotConnected;
  return NotifyResult::Failed;
}

bool nextCommand(lg::Command &cmd) {
  return commandQueue && xQueueReceive(commandQueue, &cmd, 0) == pdTRUE;
}

uint32_t connectCount() { return connects; }
uint32_t disconnectCount() { return disconnects; }

}  // namespace lgble
