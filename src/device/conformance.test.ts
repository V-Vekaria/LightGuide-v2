import { describeDeviceClient } from './conformance';
import { InMemoryDeviceClient } from './in-memory-client';

describeDeviceClient('InMemoryDeviceClient', () => new InMemoryDeviceClient());
