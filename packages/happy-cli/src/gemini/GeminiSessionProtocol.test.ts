import { describe, expect, it } from 'vitest';
import { GeminiSessionProtocol } from './GeminiSessionProtocol';

describe('GeminiSessionProtocol', () => {
  it('emits one correlated protocol turn for a completed Gemini response', () => {
    const protocol = new GeminiSessionProtocol();
    const envelopes = [
      ...protocol.startTurn('voice-local-id'),
      ...protocol.mapBackendMessage({ type: 'model-output', textDelta: 'The build ' }),
      ...protocol.mapBackendMessage({ type: 'model-output', textDelta: 'passed.' }),
      ...protocol.endTurn('completed', 'The build passed.'),
    ];

    expect(envelopes.map((envelope) => envelope.ev.t)).toEqual([
      'turn-start',
      'text',
      'turn-end',
    ]);
    const [started, text, ended] = envelopes;
    expect(started.ev).toEqual({ t: 'turn-start', userLocalId: 'voice-local-id' });
    expect(text.ev).toEqual({ t: 'text', text: 'The build passed.' });
    expect(ended.ev).toEqual({ t: 'turn-end', status: 'completed' });
    expect(started.turn).toBeTruthy();
    expect(text.turn).toBe(started.turn);
    expect(ended.turn).toBe(started.turn);
  });

  it('uses a new turn id and terminal status for each provider turn', () => {
    const protocol = new GeminiSessionProtocol();
    const firstStart = protocol.startTurn()[0];
    const firstEnd = protocol.endTurn('failed')[0];
    const secondStart = protocol.startTurn('voice-two')[0];
    const secondEnd = protocol.endTurn('cancelled')[0];

    expect(firstEnd.turn).toBe(firstStart.turn);
    expect(secondEnd.turn).toBe(secondStart.turn);
    expect(secondStart.turn).not.toBe(firstStart.turn);
    expect(secondEnd.ev).toEqual({ t: 'turn-end', status: 'cancelled' });
  });
});
