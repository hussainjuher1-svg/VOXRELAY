import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, useLocale } from '../context/hooks';
import { BrandMark } from './BrandLogo';
import { Button } from './ui/Button';
import { Badge } from './ui/Primitives';
import '../workspace.css';

class AssistantRequestError extends Error {}

interface Citation {
  id: string;
  title: string;
  route?: string;
  href?: string;
}

interface ProposedTerm {
  label: string;
  target_term: string;
  notes?: string;
}

function renderInlineFormatted(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={idx} className="assistant-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function AssistantFormattedBody({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: Array<
    | { type: 'heading'; text: string }
    | { type: 'list'; items: string[] }
    | { type: 'para'; text: string }
  > = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('### ')) {
      blocks.push({ type: 'heading', text: line.slice(4) });
    } else if (/^[-•*]\s+/.test(line)) {
      const content = line.replace(/^[-•*]\s+/, '');
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === 'list') prev.items.push(content);
      else blocks.push({ type: 'list', items: [content] });
    } else {
      blocks.push({ type: 'para', text: line });
    }
  }

  return (
    <div className="assistant-msg-rich">
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          return (
            <h4 key={i} className="assistant-msg-heading">
              {renderInlineFormatted(b.text)}
            </h4>
          );
        }
        if (b.type === 'list') {
          return (
            <ul key={i} className="assistant-msg-list">
              {b.items.map((item, j) => (
                <li key={j}>{renderInlineFormatted(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="assistant-msg-text">
            {renderInlineFormatted(b.text)}
          </p>
        );
      })}
    </div>
  );
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  mode: 'ask' | 'research';
  text: string;
  citations?: Citation[];
  escalate?: boolean;
  showFaqChips?: boolean;
  redactedCount?: number;
  proposedTerms?: ProposedTerm[];
  feedback?: 'up' | 'down' | null;
}

export function AssistantTrigger({
  open,
  onToggle,
  streaming = false,
  buttonRef,
  variant = 'header',
}: {
  open: boolean;
  onToggle: () => void;
  streaming?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  variant?: 'header' | 'sidebar';
}) {
  const { locale } = useLocale();
  const isAr = locale === 'ar';
  const isBn = locale === 'bn';

  return (
    <button
      ref={buttonRef}
      type="button"
      className={variant === 'sidebar' ? 'sidebar-assistant-btn' : 'hdr-assistant-btn'}
      aria-expanded={open}
      aria-controls={open ? 'assistant-panel' : undefined}
      aria-label={isAr ? 'مساعد العمل' : isBn ? 'কর্মক্ষেত্র সহকারী' : 'Work assistant'}
      title={isAr ? 'مساعد العمل (Cmd+/)' : isBn ? 'কর্মক্ষেত্র সহকারী (Cmd+/)' : 'Work assistant (Cmd+/)'}
      onClick={onToggle}
    >
      <span className="vox-border-beam-glow vox-border-beam-glow--pill vox-border-beam-glow--always" aria-hidden="true" />
      <span className="vox-border-beam vox-border-beam--pill vox-border-beam--always" aria-hidden="true" />
      <BrandMark size={16} pulsing={streaming} />
      <span>{isAr ? 'المساعد' : isBn ? 'সহকারী' : 'Assistant'}</span>
    </button>
  );
}

export function AssistantDock({
  open,
  onOpenChange,
  externalPrompt,
  onClearExternalPrompt,
  returnFocusToRef,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  externalPrompt?: string | null;
  onClearExternalPrompt?: () => void;
  returnFocusToRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const { locale } = useLocale();
  const { pathname } = useLocation();
  const { user, session } = useAuth();
  const isAr = locale === 'ar';

  const [mode, setMode] = useState<'ask' | 'research'>('ask');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [activeSteps, setActiveSteps] = useState<string[]>([]);
  const [savedTerms, setSavedTerms] = useState<Record<string, boolean>>({});
  const [escalatedMsgId, setEscalatedMsgId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const activeRequestRef = useRef<{ id: string; userId: string | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionUserId = user?.id ?? session?.user?.id ?? null;
  const identityRef = useRef<string | null>(sessionUserId);

  const faqChips = useMemo(
    () =>
      isAr
        ? [
            'كيف يعمل الجدول واستيراد .ics؟',
            'كيف تعمل الخصوصية وعدم التسجيل؟',
            'ما هي مستويات T0–T3 التشغيلية؟',
            'كيف أقوم بفحص الجهاز؟',
          ]
        : [
            'How does scheduling & .ics import work?',
            'How does zero recording & privacy work?',
            'What are T0–T3 operational tiers?',
            'How do I run a device check?',
          ],
    [isAr]
  );

  const researchSuggestions = useMemo(
    () =>
      isAr
        ? ['تحضير مصطلحات عيادة قلب', 'تحضير مصطلحات جلسة قانونية', 'تحضير جلسة فيديو عن بُعد']
        : ['Cardiology intake prep brief', 'Administrative hearing legal prep', 'Remote video audio VRI setup'],
    [isAr]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      window.setTimeout(() => inputRef.current?.focus(), 60);
    } else if (wasOpen.current) {
      wasOpen.current = false;
      returnFocusToRef?.current?.focus();
    }
  }, [open, returnFocusToRef]);

  useEffect(() => {
    if (identityRef.current === sessionUserId) return;
    identityRef.current = sessionUserId;
    activeRequestRef.current = null;
    abortRef.current?.abort();
    setMessages([]);
    setSavedTerms({});
    setEscalatedMsgId(null);
    setStreaming(false);
    setActiveSteps([]);
  }, [sessionUserId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        onOpenChange(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const sendQuestion = useCallback(
    async (questionText: string, overrideMode?: 'ask' | 'research') => {
      const q = questionText.trim();
      if (!q || streaming) return;
      const runMode = overrideMode || mode;
      const userId = `u-${Date.now()}`;
      const assistantId = `a-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        { id: userId, role: 'user', mode: runMode, text: q },
        { id: assistantId, role: 'assistant', mode: runMode, text: '' },
      ]);
      setInput('');
      setStreaming(true);
      setActiveSteps([]);

      const controller = new AbortController();
      abortRef.current = controller;
      const request = { id: assistantId, userId: sessionUserId };
      activeRequestRef.current = request;

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        };
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            question: q,
            mode: runMode,
            locale,
            route: pathname,
          }),
        });

        if (activeRequestRef.current !== request) return;

        if (!res.ok || !res.body) {
          let serverMessage = '';
          try {
            const body = await res.json();
            if (typeof body?.error === 'string' && body.error.trim()) serverMessage = body.error.trim();
          } catch {
            serverMessage = '';
          }
          if (serverMessage) {
            throw new AssistantRequestError(serverMessage);
          }
          throw new Error('Assistant request failed');
        }

        const reader = res.body.getReader();
        if (activeRequestRef.current !== request) {
          reader.cancel().catch(() => undefined);
          return;
        }
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (activeRequestRef.current !== request) {
            reader.cancel().catch(() => undefined);
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith('data:')) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;
            const evt = JSON.parse(jsonStr);
            if (evt.type === 'step') {
              setActiveSteps((prev) => [...prev, evt.label]);
            } else if (evt.type === 'delta') {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + evt.text } : m))
              );
            } else if (evt.type === 'citations') {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, citations: evt.items || [] } : m))
              );
            } else if (evt.type === 'proposed_terms') {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, proposedTerms: evt.terms || [] } : m))
              );
            } else if (evt.type === 'offer_ticket') {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, escalate: true } : m))
              );
            } else if (evt.type === 'quick_chips') {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, showFaqChips: true } : m))
              );
            } else if (evt.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, text: m.text || evt.message || 'Unable to process request.' } : m
                )
              );
            } else if (evt.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        citations: evt.citations || m.citations || [],
                        escalate: Boolean(evt.escalate || m.escalate),
                        redactedCount: evt.redactedCount || m.redactedCount || 0,
                        proposedTerms: evt.proposedTerms || m.proposedTerms || [],
                      }
                    : m
                )
              );
            }
          }
        }
      } catch (err) {
        if (activeRequestRef.current === request) {
          const serverMessage = err instanceof AssistantRequestError ? err.message : '';
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    text:
                      serverMessage ||
                      (isAr
                        ? 'تعذر الاتصال بالمساعد حالياً. يمكنك فتح تذكرة دعم بشري مباشرة.'
                        : 'Unable to reach the assistant right now. You can open a human support ticket directly.'),
                    escalate: !(err instanceof AssistantRequestError),
                  }
                : m
            )
          );
        }
      } finally {
        if (activeRequestRef.current === request) {
          setStreaming(false);
          setActiveSteps([]);
        }
      }
    },
    [isAr, locale, mode, pathname, session, sessionUserId, streaming]
  );

  useEffect(() => {
    if (!open || !externalPrompt) return;
    const promptToSend = externalPrompt;
    onClearExternalPrompt?.();
    const timer = window.setTimeout(() => {
      void sendQuestion(promptToSend, 'ask');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [externalPrompt, onClearExternalPrompt, open, sendQuestion]);

  async function submitFeedback(msgId: string, vote: 'up' | 'down') {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback: vote } : m)));
    try {
      await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'feedback', messageId: msgId, vote, route: pathname }),
      });
    } catch {
      // non-blocking
    }
  }

  async function saveTerm(term: ProposedTerm) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/terms', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          label: term.label,
          target_term: term.target_term,
          notes: term.notes || 'Added from Research Prep',
          source_lang: 'en',
          target_lang: 'ar',
        }),
      });
      if (res.ok) {
        setSavedTerms((prev) => ({ ...prev, [term.label]: true }));
      }
    } catch {
      // ignore if signed out
    }
  }

  async function escalateToHuman(msg: ChatMessage) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/support', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          category: 'boundary_escalation',
          subject: isAr ? 'تصعيد من مساعد العمل' : 'Work Assistant escalation',
          body: msg.text.slice(0, 600),
          route: pathname,
        }),
      });
      if (res.ok) {
        setEscalatedMsgId(msg.id);
      }
    } catch {
      // fallback link still available
    }
  }

  if (!open) return null;

  return (
    <aside
      id="assistant-panel"
      className="assistant-drawer"
      role="dialog"
      aria-modal="false"
      aria-label={isAr ? 'مساعد VOXRELAY' : 'VOXRELAY Work Assistant'}
    >
      <div className="assistant-drawer-head">
        <div className="assistant-drawer-title">
          <span className="assistant-title-row">
            <BrandMark size={18} pulsing={streaming} />
            <strong>{isAr ? 'مساعد العمل' : 'Work assistant'}</strong>
          </span>
          <span className="assistant-drawer-sub">
            {isAr ? 'قاعدة المعرفة الموثقة · بدون تسجيل' : 'Grounded KB · zero recording'}
          </span>
        </div>
        <button
          type="button"
          className="assistant-close"
          aria-label={isAr ? 'إغلاق المساعد' : 'Close assistant'}
          onClick={() => onOpenChange(false)}
        >
          ×
        </button>
      </div>

      <div className="assistant-mode-bar" role="tablist" aria-label={isAr ? 'وضع المساعد' : 'Assistant mode'}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'ask'}
          className={mode === 'ask' ? 'is-active' : ''}
          onClick={() => setMode('ask')}
        >
          {isAr ? 'سؤال موثق' : 'Ask KB'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'research'}
          className={mode === 'research' ? 'is-active' : ''}
          onClick={() => setMode('research')}
        >
          {isAr ? 'بحث تحضيري' : 'Research Prep'}
        </button>
      </div>

      <div className="assistant-messages">
        {messages.length === 0 ? (
          <div className="assistant-empty">
            <p className="assistant-greeting">
              {mode === 'research'
                ? isAr
                  ? 'أدخل موضوع الجلسة أو اختر موضوعاً أدناه لتحضير قائمة مصطلحات.'
                  : 'Enter a session domain or pick a topic below to generate a grounded terminology prep brief.'
                : isAr
                  ? 'مرحباً! اسأل عن الجدولة واستيراد .ics، الخصوصية وعدم التسجيل، فحص الجهاز، أو مستويات T0–T3.'
                  : 'Hi! Ask about scheduling & .ics import, zero-recording privacy, device checks, or T0–T3 operational tiers.'}
            </p>
            <div className="assistant-chips">
              {(mode === 'research' ? researchSuggestions : faqChips).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="assistant-chip"
                  onClick={() => {
                    void sendQuestion(chip, mode);
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;
            const isTyping = msg.role === 'assistant' && streaming && isLast && !msg.text;
            return (
              <div key={msg.id} className={`assistant-msg assistant-msg--${msg.role}`}>
                <div className="assistant-msg-meta">
                  <span>{msg.role === 'user' ? (isAr ? 'أنت' : 'You') : 'VOXRELAY'}</span>
                  {msg.redactedCount ? (
                    <Badge tone="amber">
                      {isAr ? `تم تنقيح ${msg.redactedCount}` : `${msg.redactedCount} PII redacted`}
                    </Badge>
                  ) : null}
                </div>
                {isTyping ? (
                  <div className="assistant-typing-dots" aria-label={isAr ? 'يكتب الآن...' : 'VOXRELAY is typing...'}>
                    <span />
                    <span />
                    <span />
                  </div>
                ) : (
                  <AssistantFormattedBody text={msg.text} />
                )}

                {msg.showFaqChips && (
                  <div className="assistant-chips" style={{ marginTop: 4 }}>
                    {faqChips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="assistant-chip"
                        onClick={() => {
                          setMode('ask');
                          void sendQuestion(chip, 'ask');
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {msg.citations && msg.citations.length > 0 && (
                  <div className="assistant-citations">
                    {msg.citations.map((c) => (
                      <Link key={c.id} to={c.href || c.route || '/faq'} className="assistant-citation-chip">
                        [{c.id}] {c.title}
                      </Link>
                    ))}
                  </div>
                )}

                {msg.proposedTerms && msg.proposedTerms.length > 0 && (
                  <div className="assistant-proposed-terms">
                    <p className="assistant-proposed-label">
                      {isAr ? 'مصطلحات مقترحة للحفظ (بموافقتك):' : 'Suggested terms (confirm to save):'}
                    </p>
                    {msg.proposedTerms.map((term) => (
                      <div key={term.label} className="assistant-term-row">
                        <span>
                          <strong>{term.label}</strong> — {term.target_term}
                        </span>
                        <Button
                          size="sm"
                          variant={savedTerms[term.label] ? 'secondary' : 'primary'}
                          disabled={Boolean(savedTerms[term.label])}
                          onClick={() => void saveTerm(term)}
                        >
                          {savedTerms[term.label]
                            ? isAr
                              ? 'محفوظ'
                              : 'Saved'
                            : isAr
                              ? 'حفظ'
                              : 'Save'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {msg.role === 'assistant' && msg.text && !msg.showFaqChips && (
                  <div className="assistant-msg-actions">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(msg.text)}
                    >
                      {isAr ? 'نسخ' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      aria-pressed={msg.feedback === 'up'}
                      onClick={() => void submitFeedback(msg.id, 'up')}
                    >
                      {isAr ? 'مفيد' : 'Helpful'}
                    </button>
                    <button
                      type="button"
                      aria-pressed={msg.feedback === 'down'}
                      onClick={() => void submitFeedback(msg.id, 'down')}
                    >
                      {isAr ? 'غير كافٍ' : 'Needs work'}
                    </button>
                    {msg.escalate && (
                      <button
                        type="button"
                        className="is-escalate"
                        onClick={() => void escalateToHuman(msg)}
                      >
                        {escalatedMsgId === msg.id
                          ? isAr
                            ? 'تم فتح تذكرة'
                            : 'Ticket opened'
                          : isAr
                            ? 'إحالة لدعم بشري'
                            : 'Human support'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        {streaming && activeSteps.length > 0 && (
          <div className="assistant-steps" aria-live="polite">
            {activeSteps.map((s) => (
              <div key={s} className="assistant-step-line">
                {s}
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        className="assistant-form"
        onSubmit={(e) => {
          e.preventDefault();
          void sendQuestion(input);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          dir="auto"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void sendQuestion(input);
            }
          }}
          placeholder={
            mode === 'research'
              ? isAr
                ? 'أدخل موضوع الجلسة لتحضير قائمة...'
                : 'Session topic for a prep brief...'
              : isAr
                ? 'اكتب سؤالك هنا...'
                : 'Ask about scheduling, privacy, or prep...'
          }
          aria-label={isAr ? 'رسالة المساعد' : 'Assistant message'}
        />
        <button
          type="submit"
          className="assistant-send-btn"
          disabled={streaming || !input.trim()}
        >
          {streaming ? (isAr ? 'جارٍ...' : 'Sending') : isAr ? 'إرسال' : 'Send'}
        </button>
      </form>
    </aside>
  );
}
