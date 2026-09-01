const RELAY_SAFE_PREFIX = /[^a-zA-Z0-9_-]/g;
const MAXIMUM_PREFIX_LENGTH = 12;
const SEQUENCE_SPACE = 36 ** 4;

// Relay identifiers are uniqueness tokens, not secrets. Math.random is used
// only as a per-runtime collision salt because React Native may not expose the
// Web Crypto PRNG that third-party ULID implementations require.
const runtimeSalt = Math.floor(Math.random() * 0xffffffff)
  .toString(36)
  .padStart(7, '0');

let lastTimestamp = 0;
let sequence = 0;

/** Creates a bounded, monotonic relay-safe identifier without Web Crypto. */
export function createRelayId(prefix = 'evt'): string {
  const safePrefix = prefix.replace(RELAY_SAFE_PREFIX, '').slice(0, MAXIMUM_PREFIX_LENGTH) || 'evt';
  const timestamp = Math.max(Date.now(), lastTimestamp);

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1) % SEQUENCE_SPACE;
  } else {
    lastTimestamp = timestamp;
    sequence = 0;
  }

  return `${safePrefix}_${timestamp.toString(36)}_${runtimeSalt}_${sequence.toString(36).padStart(4, '0')}`;
}
