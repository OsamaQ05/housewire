import { describe, expect, it } from 'vitest';
import { VoiceCaptureLease } from '../src/features/comms/voice-capture-lease';

describe('async voice capture cancellation', () => {
  it('cannot send after a game disables the line even before effect cleanup runs', () => {
    const lease = new VoiceCaptureLease();
    const token = lease.begin();
    expect(lease.canSend(token, true)).toBe(true);
    expect(lease.canSend(token, false)).toBe(false);
  });
  it('discards pending permission and encoding results when cancelled or unmounted', () => {
    const lease = new VoiceCaptureLease();
    const permissionToken = lease.begin();
    lease.cancel();
    expect(lease.canSend(permissionToken, true)).toBe(false);
    const encodingToken = lease.begin();
    lease.cancel();
    expect(lease.canSend(encodingToken, true)).toBe(false);
  });
  it('never publishes a previous room recording when another room re-enables the line', () => {
    const lease = new VoiceCaptureLease();
    const oldToken = lease.begin();
    lease.cancel();
    const newToken = lease.begin();
    expect(lease.canSend(oldToken, true)).toBe(false);
    expect(lease.canSend(newToken, true)).toBe(true);
  });
});
