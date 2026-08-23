import { useState } from 'preact/hooks';
import type { SensorState } from '../contract/types';
import {
  checkingDevice,
  connectionFault,
  deviceAddress,
  deviceInfo,
  deviceInfoAt,
  openDevice,
  refreshDeviceInfo,
} from '../device/connection';
import {
  axisHealth,
  formatAge,
  formatBytes,
  formatUptime,
  type AxisHealth,
} from '../device/diagnostics';
import { SAME_ORIGIN, hostOf, normaliseAddress } from '../device/endpoint';
import { STALE_AFTER_MS } from '../guidance/liveness';
import {
  lastFrameAt,
  lastGoodAt,
  lastGoodLightAt,
  liveDistanceReading,
  liveFrameRate,
  liveLightReading,
  status,
  tick,
} from '../store/store';
import { Banner } from './Banner';
import {
  SENSOR_NAMES,
  addressFormatMessage,
  axisHealthLabel,
  connectedMessage,
  connectionFaultMessage,
  connectionNotice,
  sensorStateMessage,
  type UserMessage,
} from './messages';

/**
 * The screen that answers "what am I actually connected to".
 *
 * It exists for two people. The photographer, who owns two identical boxes and
 * needs to know which one this is, whether it is well, and where to point the
 * app when the usual route does not work. And whoever is watching a demo, who
 * has no way to tell live hardware from a convincing simulation unless the
 * device says its own name, its own firmware and its own uptime, and the
 * numbers on this page move because a board is sending them.
 *
 * **It is not a back door onto withheld readings.** Every sensor value here
 * goes through the same per-axis accessors as the guide screen, which return
 * null the moment an axis goes stale or the link drops. What this screen adds
 * is *metadata* — how old the last frame is, how fast frames are arriving,
 * what the device says about its own sensors — which is precisely the
 * information that explains a dash rather than filling it in.
 */

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div class="spec-row">
      <dt class="spec-label">{label}</dt>
      <dd class="spec-value">{value}</dd>
    </div>
  );
}

/** The health dot's class. Green only for genuinely good; never for "unknown". */
function sensorDotClass(state: SensorState): string {
  if (state === 'ok') return 'status-connected';
  return state === 'fault' ? 'status-disconnected' : 'status-connecting';
}

function axisDotClass(health: AxisHealth): string {
  if (health === 'live') return 'status-connected';
  return health === 'offline' ? 'status-disconnected' : 'status-connecting';
}

function SensorRow({
  axis,
  state,
}: {
  axis: 'distance' | 'light';
  state: SensorState;
}) {
  const message = sensorStateMessage(axis, state);
  return (
    <div class="health-row">
      <div class="health-head">
        <span class={`status-dot ${sensorDotClass(state)}`} aria-hidden="true" />
        <span class="health-name">{SENSOR_NAMES[axis]}</span>
        {/* The state is a word, not only a colour — the dot repeats it for
            people who read shape and position faster than text, and neither
            one is load-bearing on its own. */}
        <span class="health-state">{message.label}</span>
      </div>
      <p class="health-copy">{message.detail}</p>
    </div>
  );
}

/** One axis of the live feed: is it arriving, how old, and what did it last say. */
function AxisRow({
  name,
  health,
  lastAt,
  now,
  value,
}: {
  name: string;
  health: AxisHealth;
  lastAt: number | null;
  now: number;
  value: string | null;
}) {
  return (
    <div class="link-row">
      <span class={`status-dot ${axisDotClass(health)}`} aria-hidden="true" />
      <span class="link-name">{name}</span>
      <span class="link-state">{axisHealthLabel(health)}</span>
      {/* The value is only ever shown when the axis is live, because it only
          ever exists then: it comes from the same accessor the guide screen
          reads, which withholds a stale axis entirely. The age beside it is
          the honest thing to show when there is no value. */}
      <span class="link-value">
        {value ?? (lastAt === null ? '—' : formatAge(now - lastAt))}
      </span>
    </div>
  );
}

export function DeviceScreen() {
  // The 500 ms heartbeat. Every age on this screen is computed from
  // Date.now(), and nothing writes a signal when time merely passes — without
  // this the frame age would freeze at whatever it was when the last frame
  // arrived, which is the exact moment it stops being true.
  void tick.value;
  const now = Date.now();

  const info = deviceInfo.value;
  const fault = connectionFault.value;
  const address = deviceAddress.value;
  const host = hostOf(address);
  const connected = status.value === 'connected';
  const busy = checkingDevice.value;

  const [typed, setTyped] = useState('');
  const [formMessage, setFormMessage] = useState<UserMessage | null>(null);
  const [formOk, setFormOk] = useState(false);

  const distanceHealth = axisHealth(status.value, lastGoodAt.value, now, STALE_AFTER_MS);
  const lightHealth = axisHealth(status.value, lastGoodLightAt.value, now, STALE_AFTER_MS);
  const distanceLive = liveDistanceReading();
  const lightLive = liveLightReading();
  const rate = liveFrameRate(now);

  const lightAboveAmbient =
    lightLive && lightLive.brightness !== null && lightLive.ambient !== null
      ? lightLive.brightness - lightLive.ambient
      : null;

  // Not connected: what the device said about itself is the last thing it
  // said, not a current fact, and the card says so rather than presenting a
  // possibly-hours-old health report as the state of the room right now.
  const infoAt = deviceInfoAt.value;
  const infoIsCurrent = connected && info !== null;

  async function submitAddress(event: Event) {
    event.preventDefault();
    setFormMessage(null);
    const origin = normaliseAddress(typed);
    if (origin === null) {
      setFormOk(false);
      setFormMessage(addressFormatMessage());
      return;
    }
    const outcome = await openDevice(origin, { remember: true });
    if (outcome.ok) {
      setFormOk(true);
      setFormMessage(connectedMessage(outcome.info.name, hostOf(origin)));
      setTyped('');
      return;
    }
    // Nothing here on a failure, deliberately. `openDevice` has already set
    // the fault, and the banner at the top of this screen is showing it — in
    // the same words. Printing them twice, one above the other, is how a
    // reader learns to skip both.
  }

  async function useServingDevice() {
    setFormMessage(null);
    const outcome = await openDevice(SAME_ORIGIN, { remember: true });
    if (outcome.ok) {
      setFormOk(true);
      setFormMessage(connectedMessage(outcome.info.name, null));
    }
    // As above: a failure is reported once, by the standing banner.
  }

  return (
    <main class="wrap">
      <h1 class="home-h1">Device</h1>

      {/* The fault, if there is one, leads. A version mismatch in particular
          is the reason nothing else on this page will work, so it cannot sit
          below three cards of detail. When there is no fault but the link is
          simply down, the app's existing standing notice does the job — this
          screen does not get its own dialect for the same situation. */}
      {fault !== null ? (
        <Banner tone="warn" message={connectionFaultMessage(fault, host)} />
      ) : (
        connectionNotice(status.value) && (
          <Banner tone="warn" message={connectionNotice(status.value)!} />
        )
      )}

      <section class="info-card device-card" aria-labelledby="device-identity">
        <h2 class="info-title" id="device-identity">
          This device
        </h2>
        {info === null ? (
          <p class="info-copy">
            {busy
              ? 'Asking the device who it is…'
              : 'The device has not said who it is yet. Once it answers, its name, version and serial number appear here.'}
          </p>
        ) : (
          <>
            <p class="device-name">{info.name}</p>
            <dl class="spec">
              <Fact label="Serial" value={info.device_id} />
              {info.model !== null && <Fact label="Model" value={info.model} />}
              <Fact label="Firmware" value={info.firmware} />
              {/* Shown next to the firmware version, and named differently on
                  purpose. They are two different numbers: one is the build on
                  the board, the other is the version of the language the app
                  and the board speak to each other. Conflating them is what
                  makes a mismatch impossible to diagnose over the phone. */}
              <Fact label="Talks version" value={String(info.protocol)} />
              {formatUptime(info.uptime_s) !== null && (
                <Fact label="Switched on for" value={formatUptime(info.uptime_s)!} />
              )}
              {formatBytes(info.free_storage_bytes) !== null && (
                <Fact label="Storage free" value={formatBytes(info.free_storage_bytes)!} />
              )}
            </dl>
            <p class="info-copy device-checked">
              {infoIsCurrent
                ? `Answered ${infoAt === null ? 'just now' : formatAge(now - infoAt)}.`
                : `Last answered ${infoAt === null ? 'never' : formatAge(now - infoAt)} — the device is not connected right now, so this is what it said then.`}
            </p>
            <button class="btn btn-ghost" disabled={busy} onClick={() => void refreshDeviceInfo()}>
              {busy ? 'Checking…' : 'Check again'}
            </button>
          </>
        )}
      </section>

      {info !== null && (
        <section class="info-card device-card" aria-labelledby="device-health">
          <h2 class="info-title" id="device-health">
            Sensors
          </h2>
          <SensorRow axis="distance" state={info.sensors.distance.state} />
          <SensorRow axis="light" state={info.sensors.light.state} />
        </section>
      )}

      <section class="info-card device-card" aria-labelledby="device-link">
        <h2 class="info-title" id="device-link">
          Live link
        </h2>
        <dl class="spec">
          <Fact
            label="Connection"
            value={
              connected
                ? 'Connected'
                : status.value === 'connecting'
                  ? 'Connecting'
                  : 'Not connected'
            }
          />
          {/* Readings a second, measured over the last three seconds. The
              contract asks firmware for 10 Hz and the guidance window starts
              degrading below about 1.25 Hz, so this is the number that says
              whether the feed is healthy or merely present. */}
          <Fact label="Readings a second" value={rate === null ? '—' : rate.toFixed(1)} />
          <Fact
            label="Last reading received"
            value={lastFrameAt.value === null ? 'none yet' : formatAge(now - lastFrameAt.value)}
          />
        </dl>

        <div class="link-rows">
          <AxisRow
            name="Distance"
            health={distanceHealth}
            lastAt={lastGoodAt.value}
            now={now}
            value={
              distanceLive?.distance_cm == null ? null : `${distanceLive.distance_cm.toFixed(1)} cm`
            }
          />
          <AxisRow
            name="Light above ambient"
            health={lightHealth}
            lastAt={lastGoodLightAt.value}
            now={now}
            value={lightAboveAmbient === null ? null : lightAboveAmbient.toFixed(3)}
          />
        </div>
        <p class="info-copy">
          A reading arriving is not the same as a sensor working, and this is where the two are
          told apart: readings still arriving with nothing in them means the link is fine and the
          sensor is not.
        </p>
      </section>

      <section class="info-card device-card" aria-labelledby="device-address">
        <h2 class="info-title" id="device-address">
          Where the app is looking
        </h2>
        <p class="info-copy device-where">
          {host === null
            ? 'This page came from the device itself, so it talks straight back to it. Nothing to set up.'
            : `This app is pointed at ${host}.`}
        </p>
        <p class="info-copy">
          You only need this if you are working from a laptop, or from a phone that is on the same
          network as the device rather than joined to the device's own Wi-Fi. Normally the device
          serves this page and connects on its own.
        </p>

        <form class="address-form" onSubmit={(event) => void submitAddress(event)}>
          <label class="field-label" for="device-address-input">
            Device address
          </label>
          <div class="address-row">
            <input
              id="device-address-input"
              class="input address-input"
              type="text"
              inputMode="url"
              autocomplete="off"
              spellcheck={false}
              placeholder="192.168.4.1"
              value={typed}
              onInput={(event) => setTyped((event.currentTarget as HTMLInputElement).value)}
            />
            <button class="btn" type="submit" disabled={busy || typed.trim() === ''}>
              {busy ? 'Checking…' : 'Connect'}
            </button>
          </div>
          <p class="hint">
            The address the device shows when it starts up. The app tries it before saving it, so a
            wrong one costs nothing.
          </p>
        </form>

        {/* Only offered when there is something to go back from. On the
            shipped configuration this button would undo nothing. */}
        {host !== null && (
          <button class="btn btn-ghost" disabled={busy} onClick={() => void useServingDevice()}>
            Go back to the device that served this page
          </button>
        )}

        {formMessage && (
          <Banner
            tone={formOk ? 'ok' : 'warn'}
            message={formMessage}
            onDismiss={() => setFormMessage(null)}
          />
        )}
      </section>
    </main>
  );
}
