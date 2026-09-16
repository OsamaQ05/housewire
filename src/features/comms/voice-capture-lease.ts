/** Invalidates async recording work without letting an old completion send a
 * note into a finished game or a different room. */
export class VoiceCaptureLease {
  private generation = 0;
  begin(): number { return ++this.generation; }
  cancel(): void { this.generation += 1; }
  canSend(token: number, enabled: boolean): boolean { return enabled && token === this.generation; }
}
