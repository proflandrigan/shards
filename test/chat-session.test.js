import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ChatSession } = require('../src/ui/chat-session.js');

function makeSession() {
  const events = [];
  const s = new ChatSession({
    agent: 'syn',
    sessionId: 'sess-1',
    onEvent: (e) => events.push(e),
  });
  return { s, events };
}

function streamLine(event) {
  return JSON.stringify({ type: 'stream_event', event });
}

function collectLines(s, lines) {
  for (const line of lines) s._parseLine(line);
}

describe('ChatSession._parseLine — message_start usage (PR #69 context meter)', () => {
  it('emits chat-usage with mapped camelCase fields from a full usage object', () => {
    const { s, events } = makeSession();
    s._parseLine(streamLine({
      type: 'message_start',
      message: { id: 'm1', usage: { input_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 20, output_tokens: 5 } },
    }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('chat-usage');
    expect(events[0].sessionId).toBe('sess-1');
    expect(events[0].usage).toEqual({
      inputTokens: 100,
      cacheReadTokens: 50,
      cacheCreationTokens: 20,
      outputTokens: 5,
    });
  });

  it('defaults missing cache/output fields to zero', () => {
    const { s, events } = makeSession();
    s._parseLine(streamLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } }));
    expect(events[0].usage).toEqual({
      inputTokens: 10,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 0,
    });
  });

  it('still emits when input_tokens is 0', () => {
    const { s, events } = makeSession();
    s._parseLine(streamLine({ type: 'message_start', message: { usage: { input_tokens: 0, output_tokens: 1 } } }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('chat-usage');
  });

  it('fails safe (emits nothing, no crash) when message_start lacks usage or message', () => {
    const { s, events } = makeSession();
    s._parseLine(streamLine({ type: 'message_start', message: { id: 'm1' } }));
    s._parseLine(streamLine({ type: 'message_start' }));
    expect(events).toHaveLength(0);
  });

  it('skips non-numeric input_tokens rather than emitting garbage', () => {
    const { s, events } = makeSession();
    s._parseLine(streamLine({ type: 'message_start', message: { usage: { input_tokens: 'lots' } } }));
    expect(events).toHaveLength(0);
  });

  it('does not emit for message_delta / message_stop', () => {
    const { s, events } = makeSession();
    s._parseLine(streamLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }));
    s._parseLine(streamLine({ type: 'message_stop' }));
    expect(events).toHaveLength(0);
  });

  it('does not regress the pre-existing event types', () => {
    const { s, events } = makeSession();
    collectLines(s, [
      streamLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } }),
      streamLine({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', name: 'Bash', id: 't1' } }),
      streamLine({ type: 'content_block_stop', index: 1 }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } }),
      JSON.stringify({ type: 'result', cost_usd: 0.01, duration_ms: 100 }),
    ]);
    expect(events.map((e) => e.type).join(',')).toBe('chat-token,chat-tool-use,chat-block-stop,chat-message,chat-turn-end');
  });

  it('does not regress system init events', () => {
    const { s, events } = makeSession();
    s._parseLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'cli-id' }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('chat-init');
    expect(events[0].sessionId).toBe('sess-1');
  });

  it('ignores malformed lines', () => {
    const { s, events } = makeSession();
    s._parseLine('{not json');
    s._parseLine('');
    expect(events).toHaveLength(0);
  });
});
