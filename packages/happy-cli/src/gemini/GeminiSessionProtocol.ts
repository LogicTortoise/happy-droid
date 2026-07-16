import type { AgentMessage } from '../agent/core';
import { AcpSessionManager } from '../agent/acp/AcpSessionManager';
import type { SessionEnvelope, SessionTurnEndStatus } from '@slopus/happy-wire';

export class GeminiSessionProtocol {
  private readonly manager = new AcpSessionManager();

  startTurn(userLocalId?: string): SessionEnvelope[] {
    return this.manager.startTurn(userLocalId);
  }

  mapBackendMessage(message: AgentMessage): SessionEnvelope[] {
    // Gemini buffers model output until the provider turn completes so the
    // existing option normalization can run before the final text is emitted.
    if (message.type === 'model-output') {
      return [];
    }
    return this.manager.mapMessage(message);
  }

  endTurn(status: SessionTurnEndStatus, finalText?: string): SessionEnvelope[] {
    const textEnvelopes = finalText
      ? this.manager.mapMessage({ type: 'model-output', textDelta: finalText })
      : [];
    return [...textEnvelopes, ...this.manager.endTurn(status)];
  }
}
