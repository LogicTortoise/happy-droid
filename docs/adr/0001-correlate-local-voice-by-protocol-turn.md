# 0001: Correlate Local Voice By Protocol Turn

## Status

Accepted

## Context

Local Android voice input crosses the App message outbox, a provider runner queue, and Session protocol output before TTS can begin. Client timestamps cannot reliably identify the corresponding reply because device and server clocks may differ, providers may emit concurrent output, and runner queues may batch adjacent messages. A single mutable pending request can also be overwritten by later input.

## Decision

Assign each voice message a stable App `localId`, preserve it through the wire `localKey`, and attach it to the provider's protocol `turn-start`. Queue every voice item in isolation for all supported runners. Keep App voice requests in FIFO order and speak only text belonging to the terminal protocol turn whose `userLocalId` exactly matches the request. Missing identity is not treated as a legacy signal and does not fall back to an unassociated turn.

## Consequences

- Normal and voice prompts cannot share a provider turn or concise prompt.
- Multiple pending voice requests remain independently recoverable and are spoken in order.
- TTS correlation does not depend on clock synchronization.
- Protocol producers that omit correlation leave the request waiting instead of risking unrelated speech.
- New runners exposed through the Session microphone must preserve the same identity and isolated-turn contract.
