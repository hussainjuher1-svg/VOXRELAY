export type StreamEvent =
  | { type: 'meta'; topic: string }
  | { type: 'step'; step: string; status: 'run' | 'done'; count?: number }
  | { type: 'block'; key: string; vars: Record<string, string | number> }
  | { type: 'sources'; reads: string[]; at: string }
  | { type: 'suggest'; topics: string[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 429]);

export async function streamAssistantQuestion(
  {
    question,
    token,
    tier,
    category,
  }: { question: string; token: string; tier?: string; category?: string },
  onEvent: (event: StreamEvent) => void,
  onStatus?: (status: 'streaming' | 'reconnecting') => void
): Promise<void> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) onStatus?.('reconnecting');
    else onStatus?.('streaming');

    try {
      const response = await fetch('/api/ops?resource=assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question, tier, category }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: 'Request failed.' }));
        if (NON_RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
          onEvent({ type: 'error', message: errBody.error || `HTTP ${response.status}` });
          return;
        }
        continue;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onEvent({ type: 'error', message: 'Streaming is unavailable in this browser.' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let sawTerminal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const ev = JSON.parse(trimmed) as StreamEvent;
          if (ev.type === 'done' || ev.type === 'error') sawTerminal = true;
          onEvent(ev);
        }
      }

      if (sawTerminal) return;
      if (attempt === maxAttempts) {
        onEvent({ type: 'error', message: 'Connection ended before completion.' });
        return;
      }
    } catch {
      if (attempt === maxAttempts) {
        onEvent({ type: 'error', message: 'Network error while contacting the workspace assistant.' });
        return;
      }
    }
  }
}
