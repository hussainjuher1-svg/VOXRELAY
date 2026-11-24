import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, useLocale } from '../context/hooks';
import { BrandMark } from './BrandLogo';
import { Button } from './ui/Button';
import { Badge } from './ui/Primitives';

interface Citation {
  id: string;
  title: string;
  route: string;
}

interface ProposedTerm {
  label: string;
  target_term: string;
  notes?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  mode: 'ask' | 'research';
  text: string;
  citations?: Citation[];
  escalate?: boolean;
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

  return (
    <button
      ref={buttonRef}
      type="button"
      className={variant === 'sidebar' ? 'sidebar-assistant-btn' : 'hdr-assistant-btn'}
      aria-expanded={open}
      aria-controls={open ? 'assistant-panel' : undefined}
      aria-label={isAr ? 'مساعد العمل' : 'Work assistant'}
      title={isAr ? 'مساعد العمل (Cmd+/)' : 'Work assistant (Cmd+/)'}
      onClick={onToggle}
    >
      <BrandMark size={16} pulsing={streaming} />
      <span>{isAr ? 'المساعد' : 'Assistant'}</span>
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
  const { session } = useAuth();
  const isAr = locale === 'ar';

  const [mode, setMode] = useState<'ask' | 'research'>('ask');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [activeSteps, setActiveSteps] = useState<string[]>([]);
  const [savedTerms, setSavedTerms] = useState<Record<string, boolean>>({});
  const [escalatedMsgId, setEscalatedMsgId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  const suggestions = useMemo(() => {
    if (isAr) {
      if (pathname.startsWith('/privacy')) {
        return ['هل يسجل VOXRELAY الصوت؟', 'ما البيانات المحذوفة من المواعيد؟'];
      }
      if (pathname.startsWith('/app')) {
        return ['كيف أستورد ملف تقويم .ics؟', 'تحضير مصطلحات عيادة قلب'];
      }
      return ['ما حدود عمل VOXRELAY؟', 'كيف أطلب الوصول؟', 'تحضير مصطلحات موعد أشعة'];
    }
    if (pathname.startsWith('/privacy')) {
      return ['Does VOXRELAY record audio?', 'What fields does .ics import read?'];
    }
    if (pathname.startsWith('/app')) {
      return ['How does .ics import work?', 'Cardiology intake prep brief'];
    }
    return ['What does VOXRELAY never do?', 'How do I request access?', 'Legal intake prep brief'];
  }, [isAr, pathname]);

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
          body: JSON.stringify({
            question: q,
            mode: runMode,
            locale,
            route: pathname,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('Assistant request failed');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
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
            } else if (evt.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        citations: evt.citations || [],
                        escalate: Boolean(evt.escalate),
                        redactedCount: evt.redactedCount || 0,
                        proposedTerms: evt.proposedTerms || [],
                      }
                    : m
                )
              );
            }
          }
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: isAr
                    ? 'تعذر الاتصال بالمساعد حالياً. يمكنك فتح تذكرة دعم بشري مباشرة.'
                    : 'Unable to reach the assistant right now. You can open a human support ticket directly.',
                  escalate: true,
                }
              : m
          )
        );
      } finally {
        setStreaming(false);
        setActiveSteps([]);
      }
    },
    [isAr, locale, mode, pathname, session, streaming]
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
              {isAr
                ? 'اسأل عن سياسات الخصوصية أو استيراد المواعيد أو جهز قائمة مصطلحات قبل الجلسة.'
                : 'Ask about scheduling rules, privacy safeguards, or prepare domain glossary briefs before a session.'}
            </p>
            <div className="assistant-chips">
              {suggestions.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="assistant-chip"
                  onClick={() => {
                    const autoResearch = /prep|تحضير/i.test(chip);
                    if (autoResearch) setMode('research');
                    void sendQuestion(chip, autoResearch ? 'research' : mode);
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`assistant-msg assistant-msg--${msg.role}`}>
              <div className="assistant-msg-meta">
                <span>{msg.role === 'user' ? (isAr ? 'أنت' : 'You') : 'VOXRELAY'}</span>
                {msg.redactedCount ? (
                  <Badge tone="amber">
                    {isAr ? `تم تنقيح ${msg.redactedCount}` : `${msg.redactedCount} PII redacted`}
                  </Badge>
                ) : null}
              </div>
              <p className="assistant-msg-text">{msg.text || (streaming ? '...' : '')}</p>

              {msg.citations && msg.citations.length > 0 && (
                <div className="assistant-citations">
                  {msg.citations.map((c) => (
                    <Link key={c.id} to={c.route} className="assistant-citation-chip">
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

              {msg.role === 'assistant' && msg.text && (
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
          ))
        )}
        {streaming && activeSteps.length > 0 && (
          <div className="assistant-steps" aria-live="polite">
            {activeSteps.map((s) => (
              <div key={s} className="assistant-step-line">
                • {s}
              </div>
            ))}
          </div>
        )}
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
        <Button type="submit" size="sm" loading={streaming} disabled={!input.trim()}>
          {isAr ? 'إرسال' : 'Send'}
        </Button>
      </form>
    </aside>
  );
}
