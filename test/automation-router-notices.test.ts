import { describe, expect, it } from 'bun:test';
import { emptyTurnNotice, turnFailureNotice } from '../src/automation/router.js';

// `POST /api/automation/chat` (router.ts) used to persist an assistant `Message` row only when
// `AssistantPartsBuilder` had something in it — so a turn that threw before any token streamed,
// or one that legitimately ended empty (aborted/refused/timed out before producing content), left
// no row at all: the failure vanished on the next history reload as if the turn never happened.
// The fix always persists a row and fills it with one of these notices when `parts` would
// otherwise be empty. These are pure functions extracted so that fix is covered without spinning
// up the full Hono + Postgres stack the route itself needs.
describe('emptyTurnNotice', () => {
  it('has a specific notice for every non-normal stopReason the loop can end on', () => {
    expect(emptyTurnNotice('aborted')).toBe('_Stopped._');
    expect(emptyTurnNotice('refusal')).toBe('_The model declined to answer._');
    expect(emptyTurnNotice('max_tokens')).toBe('_Response was cut off (length limit) before producing any content._');
    expect(emptyTurnNotice('max_iterations')).toBe('_Stopped after too many tool-call rounds without a final answer._');
    expect(emptyTurnNotice('timeout')).toBe('_The agent turn timed out._');
  });

  it('falls back to a generic notice for an unrecognized or "end_turn" stopReason', () => {
    expect(emptyTurnNotice('end_turn')).toBe('_The agent returned an empty response._');
    expect(emptyTurnNotice('something-new')).toBe('_The agent returned an empty response._');
  });
});

describe('turnFailureNotice', () => {
  it('has no leading blank line when nothing had streamed yet', () => {
    expect(turnFailureNotice('network error', false)).toBe('_Agent turn failed: network error_');
  });

  it('leads with a blank line when some content already streamed, so it reads as a continuation', () => {
    expect(turnFailureNotice('network error', true)).toBe('\n\n_Agent turn failed: network error_');
  });
});
