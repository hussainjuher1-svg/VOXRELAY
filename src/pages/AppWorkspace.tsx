import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, CalendarDays, Check, Headset, Inbox, Mic, ShieldCheck, Trash2 } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { EmptyAssignmentsIllustration, EmptyTerminologyIllustration } from '../components/EditorialIllustrations';
import { Button } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Field';
import { Badge, EmptyState, Skeleton } from '../components/ui/Primitives';
import { Select } from '../components/ui/Select';
import { useAuth, useLocale } from '../context/hooks';
import { streamAssistantQuestion, type StreamEvent } from '../lib/assistantStream';
import { decodeCsvBytes, exportCsv, matchesSearch, parseIcsTimingOnly } from '../lib/text';

interface AssignmentItem {
  id: string;
  ref: string;
  start_at: string;
  duration_minutes: number;
  time_zone?: string;
  language_pair: string;
  modality: string;
  status: string;
}

interface TermItem {
  id: string;
  label: string;
  target_term: string;
  source_lang?: string;
  target_lang?: string;
  notes?: string;
}

interface SupportTicketItem {
  id: string;
  category: string;
  subject: string;
  status: string;
  created_at: string;
}

function buildHeaders(token?: string, json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function OverviewPage() {
  const { user, session } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [termsCount, setTermsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const headers = buildHeaders(session?.access_token);

    Promise.all([
      fetch('/api/assignments', { headers, credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/terms', { headers, credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([aRes, tRes]) => {
        if (!active) return;
        setAssignments(aRes?.data || []);
        setTermsCount((tRes?.data || []).length);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">OVERVIEW</span>
          <h1>Interpreter workspace</h1>
        </div>
        <div className="hero-actions">
          <Link className="button-secondary" to="/app/admin">
            Review queue &amp; outbox
          </Link>
          <Link className="button-primary" to="/app/assignments">
            Manage assignments
          </Link>
        </div>
      </div>

      {!user && (
        <div className="subpage-card warning-card" style={{ marginBottom: 20 }}>
          <h2>Sign in to persist records</h2>
          <p>
            Create an account or sign in at{' '}
            <Link className="inline-link" to="/login">
              /login
            </Link>{' '}
            to save assignments, glossary terms, and support tickets.
          </p>
        </div>
      )}

      {loading ? (
        <div className="workspace-grid">
          <div className="subpage-card">
            <Skeleton height={24} width="60%" />
            <div style={{ marginTop: 12 }}>
              <Skeleton height={16} />
            </div>
          </div>
          <div className="subpage-card">
            <Skeleton height={24} width="50%" />
            <div style={{ marginTop: 12 }}>
              <Skeleton height={16} />
            </div>
          </div>
        </div>
      ) : (
        <div className="workspace-grid">
          <article className="subpage-card">
            <h2>Account session</h2>
            <p>{user ? `Signed in as ${user.email}` : 'No active session'}</p>
            <Badge tone={user ? 'success' : 'warning'}>{user ? 'Authenticated' : 'Guest view'}</Badge>
          </article>
          <article className="subpage-card">
            <h2>Assignments</h2>
            <p>{assignments.length} persisted assignment(s) in your schedule.</p>
            <Link className="inline-link" to="/app/assignments">
              Open schedule
            </Link>
          </article>
          <article className="subpage-card">
            <h2>Glossary</h2>
            <p>{termsCount} saved terminology entry/entries.</p>
            <Link className="inline-link" to="/app/terminology">
              Open terminology
            </Link>
          </article>
        </div>
      )}
    </AppShell>
  );
}

export function AssignmentsPage() {
  const { session, user } = useAuth();
  const [items, setItems] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [icsSlots, setIcsSlots] = useState<Array<{ startAt: string; durationMinutes: number }>>([]);
  const [pair, setPair] = useState('EN-AR');
  const [modality, setModality] = useState('video_remote');
  const [duration, setDuration] = useState(45);
  const [startLocal, setStartLocal] = useState(() => new Date(Date.now() + 3_600_000).toISOString().slice(0, 16));
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/assignments', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    });
    if (res.ok) {
      const json = await res.json();
      setItems(json.data || []);
    }
    setLoading(false);
  }, [session?.access_token]);

  useEffect(() => {
    let active = true;
    fetch('/api/assignments', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((json) => {
        if (active) {
          setItems(json.data || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  async function createAssignment(e: FormEvent) {
    e.preventDefault();
    if (!user && !session?.access_token) {
      setFeedback({ kind: 'error', text: 'Sign in via /login first to save assignments.' });
      return;
    }
    const parsedDate = new Date(startLocal);
    if (Number.isNaN(parsedDate.getTime())) {
      setFeedback({ kind: 'error', text: 'Please enter a valid start date and time.' });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const startIso = parsedDate.toISOString();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: buildHeaders(session?.access_token, true),
        credentials: 'same-origin',
        body: JSON.stringify({
          start_at: startIso,
          duration_minutes: duration,
          time_zone: tz,
          language_pair: pair,
          modality,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ kind: 'error', text: data.error || 'Could not create assignment.' });
        return;
      }
      setFeedback({ kind: 'success', text: `Created ${data.data?.ref || 'assignment'}.` });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function transitionStatus(
    id: string,
    action: 'start_preparation' | 'mark_ready' | 'start_session' | 'close_out' | 'cancel'
  ) {
    setFeedback(null);
    const body = action === 'close_out' ? { action, exception_category: 'none' } : { action };
    const res = await fetch(`/api/assignments?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: buildHeaders(session?.access_token, true),
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback({ kind: 'error', text: json.error || 'Unable to update assignment status.' });
      return;
    }
    await refresh();
  }

  async function deleteAssignment(id: string) {
    const res = await fetch(`/api/assignments?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    });
    if (res.ok) {
      await refresh();
    }
  }

  function handleIcsImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => {
      setIcsSlots(parseIcsTimingOnly(txt));
    });
  }

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">ASSIGNMENTS</span>
          <h1>Schedule &amp; offers</h1>
        </div>
      </div>

      <div className="workspace-grid">
        <form className="panel-form" onSubmit={createAssignment}>
          <Field label="Language pair" htmlFor="assign-pair">
            <Input id="assign-pair" value={pair} onChange={(e) => setPair(e.target.value)} required />
          </Field>

          <Field label="Modality" htmlFor="assign-modality">
            <Select
              id="assign-modality"
              value={modality}
              onValueChange={setModality}
              ariaLabel="Modality"
              options={[
                { value: 'video_remote', label: 'Video remote (VRI)' },
                { value: 'over_the_phone', label: 'Over the phone (OPI)' },
                { value: 'onsite', label: 'On-site' },
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'relay', label: 'Relay' },
              ]}
            />
          </Field>

          <div className="form-row-2">
            <Field label="Start (local time)" htmlFor="assign-start">
              <Input
                id="assign-start"
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                required
              />
            </Field>
            <Field label="Duration (min)" htmlFor="assign-duration">
              <Input
                id="assign-duration"
                type="number"
                min={5}
                max={720}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </Field>
          </div>

          <Button type="submit" loading={busy}>
            Create assignment
          </Button>
          {feedback && (
            <p className={feedback.kind === 'error' ? 'form-error' : 'form-success'} role="status">
              {feedback.text}
            </p>
          )}
        </form>

        <div className="subpage-card">
          <h2>Timing-only .ics import</h2>
          <p>Reads DTSTART and DTEND only. Event titles, attendees, and descriptions are discarded.</p>
          <Input type="file" accept=".ics,text/calendar" onChange={handleIcsImport} aria-label="Import ICS file" />
          {icsSlots.length > 0 && (
            <ul style={{ marginTop: 14, paddingInlineStart: 18 }}>
              {icsSlots.map((slot, idx) => (
                <li key={idx} className="mono-ltr">
                  {slot.startAt} ({slot.durationMinutes} min)
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <Skeleton height={80} />
        ) : items.length === 0 ? (
          <EmptyState
            illustration={<EmptyAssignmentsIllustration />}
            icon={<CalendarDays size={20} />}
            title="No assignments scheduled yet"
            description="Create your first assignment above or import timing slots from an .ics calendar export."
          />
        ) : (
          <div className="workspace-grid">
            {items.map((a) => (
              <article key={a.id} className="subpage-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="mono-ltr eyebrow">{a.ref}</span>
                  <Badge tone={a.status === 'ready' || a.status === 'completed' ? 'success' : 'neutral'}>
                    {a.status}
                  </Badge>
                </div>
                <h2>{a.language_pair}</h2>
                <p>
                  {a.modality} · {a.duration_minutes} min
                </p>
                <p className="mono-ltr" style={{ fontSize: 12 }}>
                  UTC: {new Date(a.start_at).toISOString().slice(0, 16).replace('T', ' ')}Z
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {(a.status === 'scheduled' || a.status === 'rescheduled') && (
                    <Button size="sm" variant="secondary" onClick={() => void transitionStatus(a.id, 'mark_ready')}>
                      Mark ready
                    </Button>
                  )}
                  {(a.status === 'scheduled' || a.status === 'preparation_required' || a.status === 'ready') && (
                    <Button size="sm" onClick={() => void transitionStatus(a.id, 'start_session')}>
                      Start session
                    </Button>
                  )}
                  {a.status === 'in_progress' && (
                    <Button size="sm" onClick={() => void transitionStatus(a.id, 'close_out')}>
                      Complete
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => void deleteAssignment(a.id)} aria-label={`Delete ${a.ref}`}>
                    <Trash2 size={14} />
                  </Button>
                </div>

                <div style={{ marginTop: 10 }}>
                  <Link className="inline-link" to={`/app/session/${a.id}`}>
                    Open session focus
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export function SessionFocusPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const assignmentId = id || 'preview';
  const [events, setEvents] = useState<Array<{ id?: number; type: string; created_at: string }>>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/ops?resource=session_event&assignment_id=${encodeURIComponent(assignmentId)}`, {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.data) setEvents(json.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [assignmentId, session?.access_token]);

  async function logIntervention(type: string) {
    const res = await fetch('/api/ops?resource=session_event', {
      method: 'POST',
      headers: buildHeaders(session?.access_token, true),
      credentials: 'same-origin',
      body: JSON.stringify({ assignment_id: assignmentId, type }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        setEvents((prev) => [...prev, json.data]);
        return;
      }
    }
    setEvents((prev) => [...prev, { type, created_at: new Date().toISOString() }]);
  }

  return (
    <AppShell focusMode>
      <div className="focus-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span className="eyebrow">ACTIVE SESSION · {assignmentId}</span>
          <Link className="inline-link" to="/app/assignments">
            Back to schedule
          </Link>
        </div>
        <h1>Operational intervention log</h1>
        <p>Log intervention type and timestamp only. Never enter patient identity or conversation content.</p>
        <div className="focus-actions">
          <Button onClick={() => void logIntervention('clarification')}>Clarification</Button>
          <Button variant="secondary" onClick={() => void logIntervention('pace_pause')}>
            Pace / pause
          </Button>
          <Button variant="secondary" onClick={() => void logIntervention('technical_issue')}>
            Technical issue
          </Button>
        </div>
        {events.length === 0 ? (
          <p style={{ color: '#9ca096', fontSize: 13 }}>No operational pauses logged yet.</p>
        ) : (
          <ul>
            {events.map((ev, i) => (
              <li key={ev.id ?? i} className="mono-ltr">
                {ev.created_at} — {ev.type}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

export function TerminologyPage() {
  const { user, session } = useAuth();
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const [translation, setTranslation] = useState('');
  const [csvError, setCsvError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/terms', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active) {
          setTerms(json?.data || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  const visible = terms.filter((item) => matchesSearch(`${item.label} ${item.target_term}`, query));

  async function addTerm(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    try {
      if (user || session?.access_token) {
        const res = await fetch('/api/terms', {
          method: 'POST',
          headers: buildHeaders(session?.access_token, true),
          credentials: 'same-origin',
          body: JSON.stringify({ label: label.trim(), target_term: translation.trim() }),
        });
        if (res.ok) {
          const json = await res.json();
          setTerms((prev) => [json.data, ...prev]);
          setLabel('');
          setTranslation('');
          return;
        }
      }
      setTerms((prev) => [
        { id: crypto.randomUUID(), label: label.trim(), target_term: translation.trim() },
        ...prev,
      ]);
      setLabel('');
      setTranslation('');
    } finally {
      setBusy(false);
    }
  }

  async function deleteTerm(id: string) {
    if (user || session?.access_token) {
      await fetch(`/api/terms?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: buildHeaders(session?.access_token),
        credentials: 'same-origin',
      }).catch(() => {});
    }
    setTerms((prev) => prev.filter((item) => item.id !== id));
  }

  async function importCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const text = decodeCsvBytes(buf);
      const rows = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const parsed = rows
        .slice(1)
        .map((line) => {
          const [a = '', b = ''] = line.split(',');
          return { label: a.trim(), target_term: b.trim() };
        })
        .filter((p) => p.label);

      if ((user || session?.access_token) && parsed.length > 0) {
        const res = await fetch('/api/terms', {
          method: 'POST',
          headers: buildHeaders(session?.access_token, true),
          credentials: 'same-origin',
          body: JSON.stringify({ terms: parsed }),
        });
        if (res.ok) {
          const json = await res.json();
          const added = Array.isArray(json.data) ? json.data : [json.data];
          setTerms((prev) => [...added, ...prev]);
          return;
        }
      }
      setTerms((prev) => [...parsed.map((p) => ({ id: crypto.randomUUID(), ...p })), ...prev]);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Unable to decode CSV.');
    }
  }

  function downloadCsv() {
    const csv = exportCsv(
      ['term', 'equivalent'],
      terms.map((item) => [item.label, item.target_term])
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voxrelay-glossary.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">TERMINOLOGY</span>
          <h1>Multilingual glossary</h1>
        </div>
        <Button variant="secondary" onClick={downloadCsv}>
          Export UTF-8 CSV
        </Button>
      </div>

      <div className="workspace-grid">
        <form className="panel-form" onSubmit={addTerm}>
          <Field label="Term" htmlFor="term-label">
            <Input id="term-label" dir="auto" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </Field>
          <Field label="Target equivalent" htmlFor="term-target">
            <Input
              id="term-target"
              dir="auto"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={busy}>
            Save term
          </Button>
        </form>

        <div className="subpage-card">
          <Field label="Search saved terms" htmlFor="term-search" hint="Accent, harakat, nikud & script normalized">
            <Input
              id="term-search"
              type="search"
              dir="auto"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Latin, Arabic, Hebrew, Devanagari..."
            />
          </Field>
          <Field label="Import UTF-8 / UTF-16 CSV" htmlFor="term-csv">
            <Input id="term-csv" type="file" accept=".csv,text/csv" onChange={importCsv} />
          </Field>
          {csvError && <p className="form-error">{csvError}</p>}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <Skeleton height={80} />
        ) : visible.length === 0 ? (
          <EmptyState
            illustration={<EmptyTerminologyIllustration />}
            icon={<BookOpen size={20} />}
            title="No matching glossary terms"
            description="Save terms manually, import a CSV file, or use Research Prep in the Workspace Assistant."
          />
        ) : (
          <div className="workspace-grid">
            {visible.map((item) => (
              <article key={item.id} className="subpage-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <h2>
                    <bdi dir="auto">{item.label}</bdi>
                  </h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void deleteTerm(item.id)}
                    aria-label={`Delete ${item.label}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                <p>
                  <bdi dir="auto">{item.target_term || '—'}</bdi>
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export function DeviceCheckPage() {
  const { session } = useAuth();
  const [result, setResult] = useState<'idle' | 'pass' | 'fail'>('idle');
  const [level, setLevel] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; result: string; latency_ms: number | null; peak_level: number; created_at: string }>>([]);
  const [message, setMessage] = useState<string>('Verifies browser microphone permission, live signal level, and round-trip latency without recording.');
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const stopStream = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      void ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/ops?resource=device_check', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.data) setHistory(json.data);
      })
      .catch(() => {});
    return () => {
      active = false;
      stopStream();
    };
  }, [session?.access_token, stopStream]);

  async function saveCheck(status: 'pass' | 'fail', rtt: number | null, peak: number) {
    const res = await fetch('/api/ops?resource=device_check', {
      method: 'POST',
      headers: buildHeaders(session?.access_token, true),
      credentials: 'same-origin',
      body: JSON.stringify({ result: status, latency_ms: rtt, peak_level: peak }),
    }).catch(() => null);
    if (res?.ok) {
      const json = await res.json();
      if (json.data) setHistory((prev) => [json.data, ...prev]);
    }
  }

  async function runCheck() {
    stopStream();
    const t0 = performance.now();
    let rtt: number | null = null;
    try {
      const ping = await fetch('/api/health', { cache: 'no-store' });
      if (ping.ok) rtt = Math.max(1, Math.round(performance.now() - t0));
    } catch {
      rtt = null;
    }
    setLatencyMs(rtt);

    if (!navigator.mediaDevices?.getUserMedia) {
      setResult('fail');
      setMessage('Microphone API is unavailable in this browser.');
      await saveCheck('fail', rtt, 0);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      let peak = 0;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        streamRef.current = stream;
        ctxRef.current = ctx;

        const data = new Uint8Array(analyser.fftSize);
        const startedAt = performance.now();
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sumSq = 0;
          for (let i = 0; i < data.length; i += 1) {
            const v = (data[i] - 128) / 128;
            sumSq += v * v;
          }
          const pct = Math.min(100, Math.round(Math.sqrt(sumSq / data.length) * 280));
          peak = Math.max(peak, pct);
          setLevel(pct);
          if (performance.now() - startedAt < 3000) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            stopStream();
            void saveCheck('pass', rtt, peak);
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      } else {
        stream.getTracks().forEach((track) => track.stop());
        await saveCheck('pass', rtt, 0);
      }
      setResult('pass');
      setMessage(`Microphone active (live 3s meter) · Measured RTT: ${rtt ?? '—'} ms (zero audio stored).`);
    } catch {
      setResult('fail');
      setMessage('Microphone access failed or was denied.');
      await saveCheck('fail', rtt, 0);
    }
  }

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">DEVICE CHECK</span>
          <h1>Audio readiness check</h1>
        </div>
      </div>
      <div className="subpage-card" style={{ maxWidth: 580 }}>
        <p>{message}</p>
        <div className="meter-track" aria-label="Microphone signal level">
          <div className="meter-fill" style={{ width: `${level}%` }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <Button onClick={() => void runCheck()}>
            <Mic size={15} />
            <span>Run microphone &amp; latency check</span>
          </Button>
          <Badge tone={result === 'pass' ? 'success' : result === 'fail' ? 'danger' : 'neutral'}>
            {result === 'pass' ? `Passed (${latencyMs ?? '—'} ms)` : result === 'fail' ? 'Failed' : 'Not tested'}
          </Badge>
        </div>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ marginBottom: 12 }}>Recent checks ({history.length})</h2>
          <div className="workspace-grid">
            {history.slice(0, 6).map((h) => (
              <article key={h.id} className="subpage-card">
                <Badge tone={h.result === 'pass' ? 'success' : 'danger'}>{h.result}</Badge>
                <p className="mono-ltr" style={{ marginTop: 8 }}>
                  RTT: {h.latency_ms ?? '—'} ms · Peak: {h.peak_level}%
                </p>
              </article>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

export function BillingPage() {
  const { session, user } = useAuth();
  const [rateDollars, setRateDollars] = useState(45);
  const [minutes, setMinutes] = useState(60);
  const [minimumMinutes, setMinimumMinutes] = useState(30);
  const [roundTo, setRoundTo] = useState(15);
  const [records, setRecords] = useState<Array<{ id: string; minutes: number; amount_cents: number; status: 'invoiced' | 'paid' }>>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/ops?resource=billing', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.records) setRecords(json.records);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  async function addRecord(e: FormEvent) {
    e.preventDefault();
    if (user || session?.access_token) {
      const res = await fetch('/api/ops?resource=billing', {
        method: 'POST',
        headers: buildHeaders(session?.access_token, true),
        credentials: 'same-origin',
        body: JSON.stringify({
          minutes,
          rate_cents: Math.round(rateDollars * 100),
          minimum_minutes: minimumMinutes,
          round_to_minutes: roundTo,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setRecords((prev) => [json.data, ...prev]);
          return;
        }
      }
    }
    const floored = Math.max(minutes, minimumMinutes);
    const billable = Math.ceil(floored / Math.max(1, roundTo)) * Math.max(1, roundTo);
    const amount_cents = Math.round((billable / 60) * rateDollars * 100);
    setRecords((prev) => [{ id: crypto.randomUUID(), minutes: billable, amount_cents, status: 'invoiced' }, ...prev]);
  }

  async function markPaid(id: string) {
    if (user || session?.access_token) {
      await fetch('/api/ops?resource=billing', {
        method: 'PATCH',
        headers: buildHeaders(session?.access_token, true),
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      }).catch(() => {});
    }
    setRecords((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'paid' } : x)));
  }

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">BILLING LOG</span>
          <h1>Interpreter billing tracker</h1>
        </div>
      </div>
      <form className="panel-form" onSubmit={(e) => void addRecord(e)} style={{ marginBottom: 24 }}>
        <div className="form-row-2">
          <Field label="Hourly rate (USD)" htmlFor="bill-rate">
            <Input id="bill-rate" type="number" min={0} value={rateDollars} onChange={(e) => setRateDollars(Number(e.target.value))} />
          </Field>
          <Field label="Session minutes" htmlFor="bill-mins">
            <Input id="bill-mins" type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </Field>
        </div>
        <div className="form-row-2">
          <Field label="Minimum minutes" htmlFor="bill-min">
            <Input id="bill-min" type="number" min={0} value={minimumMinutes} onChange={(e) => setMinimumMinutes(Number(e.target.value))} />
          </Field>
          <Field label="Round up to (min)" htmlFor="bill-round">
            <Input id="bill-round" type="number" min={1} value={roundTo} onChange={(e) => setRoundTo(Number(e.target.value))} />
          </Field>
        </div>
        <Button type="submit">Add billing record</Button>
      </form>
      <div className="workspace-grid">
        {records.map((r) => (
          <article key={r.id} className="subpage-card">
            <p className="mono-ltr">
              {r.minutes} min · ${(r.amount_cents / 100).toFixed(2)}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <Badge tone={r.status === 'paid' ? 'success' : 'warning'}>{r.status}</Badge>
              {r.status === 'invoiced' && (
                <Button size="sm" variant="secondary" onClick={() => void markPaid(r.id)}>
                  Mark paid
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}

export function SupportPage() {
  const { user, session } = useAuth();
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('general');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    const res = await fetch('/api/support', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    });
    if (res.ok) {
      const json = await res.json();
      setTickets(json.tickets || []);
    }
    setLoading(false);
  }, [session?.access_token]);

  useEffect(() => {
    let active = true;
    fetch('/api/support', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active) {
          setTickets(json?.tickets || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  async function submitTicket(e: FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/support', {
      method: 'POST',
      headers: buildHeaders(session?.access_token, true),
      credentials: 'same-origin',
      body: JSON.stringify({ category, subject, body }),
    });
    if (res.ok) {
      setSubject('');
      setBody('');
      setNotice('Ticket queued for human support and confirmation logged in email outbox.');
      await loadTickets();
    } else {
      const err = await res.json().catch(() => ({}));
      setNotice(err.error || 'Unable to create ticket.');
    }
  }

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">HUMAN SUPPORT</span>
          <h1>Support tickets &amp; coordinator queue</h1>
        </div>
      </div>

      <div className="workspace-grid">
        <form className="panel-form" onSubmit={submitTicket}>
          <Field label="Category" htmlFor="sup-cat">
            <Select
              id="sup-cat"
              value={category}
              onValueChange={setCategory}
              options={[
                { value: 'general', label: 'General operational question' },
                { value: 'access', label: 'Access or organization invite' },
                { value: 'technical', label: 'Audio / browser setup issue' },
                { value: 'billing', label: 'Billing or duration dispute' },
                { value: 'boundary_escalation', label: 'Human boundary escalation' },
              ]}
            />
          </Field>
          <Field label="Subject" htmlFor="sup-subj">
            <Input id="sup-subj" value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} />
          </Field>
          <Field label="Details (no patient or session content)" htmlFor="sup-body">
            <Textarea id="sup-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} required minLength={3} />
          </Field>
          <Button type="submit">Open support ticket</Button>
          {notice && <p className="form-success">{notice}</p>}
        </form>

        <div>
          {!user ? (
            <EmptyState
              icon={<Headset size={20} />}
              title="Sign in to view ticket history"
              description="Tickets submitted while signed in appear here with status and timestamps."
            />
          ) : loading ? (
            <Skeleton height={80} />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={<Headset size={20} />}
              title="No support tickets yet"
              description="Open a ticket whenever you need human coordination or boundary escalation."
            />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {tickets.map((t) => (
                <article key={t.id} className="subpage-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="eyebrow">{t.category}</span>
                    <Badge tone="accent">{t.status}</Badge>
                  </div>
                  <h2>{t.subject}</h2>
                  <p className="mono-ltr" style={{ fontSize: 12 }}>
                    {t.created_at}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export function AdminReviewPage() {
  const { user, session } = useAuth();
  const [requests, setRequests] = useState<
    Array<{
      id: string;
      full_name: string;
      work_email: string;
      role: string;
      organization: string;
      languages: string;
      message: string;
      status: string;
      created_at: string;
    }>
  >([]);
  const [outbox, setOutbox] = useState<
    Array<{ id: string; to_email: string; kind: string; subject: string; text_body: string; created_at: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    const res = await fetch('/api/admin', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    });
    if (res.ok) {
      const json = await res.json();
      setRequests(json.requests || []);
      setOutbox(json.outbox || []);
    }
    setLoading(false);
  }, [session?.access_token]);

  useEffect(() => {
    let active = true;
    fetch('/api/admin', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json) {
          setRequests(json.requests || []);
          setOutbox(json.outbox || []);
        }
        if (active) setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: buildHeaders(session?.access_token, true),
      credentials: 'same-origin',
      body: JSON.stringify({ id, decision }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.inviteUrl) {
      setInviteBanner(`Invite generated & queued in outbox: ${json.inviteUrl}`);
    }
    await loadAdmin();
  }

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">ADMIN REVIEW &amp; EMAIL OUTBOX</span>
          <h1>Access requests &amp; local outbox</h1>
        </div>
      </div>

      {!user ? (
        <EmptyState
          icon={<ShieldCheck size={20} />}
          title="Sign in to review requests"
          description="Create or sign in to an account at /login to review incoming Request Access submissions and inspect queued emails."
          action={
            <Link className="button-primary" to="/login?returnTo=/app/admin">
              Sign in
            </Link>
          }
        />
      ) : loading ? (
        <Skeleton height={100} />
      ) : (
        <>
          {inviteBanner && (
            <div className="subpage-card" style={{ marginBottom: 20, borderColor: 'var(--sage)' }}>
              <p className="form-success mono-ltr">{inviteBanner}</p>
            </div>
          )}

          <h2 style={{ marginBottom: 12 }}>Access request queue ({requests.length})</h2>
          {requests.length === 0 ? (
            <EmptyState
              icon={<Inbox size={20} />}
              title="No access requests yet"
              description="Submit the Request Access form at /contact to test the full approval and one-time invite flow."
            />
          ) : (
            <div className="workspace-grid" style={{ marginBottom: 32 }}>
              {requests.map((r) => (
                <article key={r.id} className="subpage-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="eyebrow">{r.role}</span>
                    <Badge tone={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>
                      {r.status}
                    </Badge>
                  </div>
                  <h2>{r.full_name || r.work_email}</h2>
                  <p className="mono-ltr" style={{ fontSize: 12 }}>
                    {r.work_email}
                  </p>
                  {r.languages && <p>Languages: {r.languages}</p>}
                  <p>{r.message}</p>
                  {r.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <Button size="sm" onClick={() => void decide(r.id, 'approve')}>
                        <Check size={14} />
                        <span>Approve &amp; invite</span>
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void decide(r.id, 'reject')}>
                        Reject
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          <h2 style={{ marginBottom: 12 }}>Email outbox inspector ({outbox.length})</h2>
          <div className="workspace-grid">
            {outbox.map((mail) => (
              <article key={mail.id} className="subpage-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="eyebrow">{mail.kind}</span>
                  <span className="mono-ltr" style={{ fontSize: 11 }}>
                    {mail.to_email}
                  </span>
                </div>
                <h2>{mail.subject}</h2>
                <p style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{mail.text_body}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

export function SettingsPage() {
  const { user, session } = useAuth();
  const { locale, setLocale } = useLocale();
  const [fullName, setFullName] = useState('');
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [languagePairs, setLanguagePairs] = useState('EN-AR, EN-ES');
  const [weeklyHours, setWeeklyHours] = useState(30);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user && !session?.access_token) return;
    let active = true;
    fetch('/api/ops?resource=profile', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.data) {
          setFullName(json.data.full_name || '');
          if (json.data.time_zone) setTimeZone(json.data.time_zone);
          if (json.data.language_pairs) setLanguagePairs(json.data.language_pairs);
          if (json.data.weekly_hours) setWeeklyHours(Number(json.data.weekly_hours));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, session?.access_token]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavedNotice(null);
    const res = await fetch('/api/ops?resource=profile', {
      method: 'POST',
      headers: buildHeaders(session?.access_token, true),
      credentials: 'same-origin',
      body: JSON.stringify({
        full_name: fullName,
        locale,
        time_zone: timeZone,
        language_pairs: languagePairs,
        weekly_hours: weeklyHours,
      }),
    });
    if (res.ok) {
      setSavedNotice('Settings saved.');
    } else {
      setSavedNotice('Sign in first to save profile settings.');
    }
  }

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">SETTINGS</span>
          <h1>Profile, locale &amp; capacity</h1>
        </div>
      </div>

      <form className="panel-form" onSubmit={(e) => void saveProfile(e)}>
        <Field label="Display name" htmlFor="set-name">
          <Input id="set-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Interface language" htmlFor="set-locale">
          <Select
            id="set-locale"
            value={locale}
            onValueChange={(v) => setLocale(v === 'ar' ? 'ar' : 'en')}
            options={[
              { value: 'en', label: 'English (LTR)' },
              { value: 'ar', label: 'العربية (RTL)' },
            ]}
          />
        </Field>
        <div className="form-row-2">
          <Field label="Time zone" htmlFor="set-tz">
            <Input id="set-tz" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
          </Field>
          <Field label="Weekly hours" htmlFor="set-hours">
            <Input
              id="set-hours"
              type="number"
              min={1}
              max={100}
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Language pairs" htmlFor="set-pairs">
          <Input id="set-pairs" value={languagePairs} onChange={(e) => setLanguagePairs(e.target.value)} />
        </Field>
        <Button type="submit">Save settings</Button>
        {savedNotice && <p className="form-success">{savedNotice}</p>}
      </form>
    </AppShell>
  );
}

export function ReportsPage() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<{
    sessions?: number;
    totalMinutes?: number;
    byPair?: Record<string, { sessions: number; minutes: number }>;
    byModality?: Record<string, { sessions: number; minutes: number }>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/ops?resource=reports', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json) setSummary(json);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">REPORTS</span>
          <h1>Interpreter &amp; organization totals</h1>
        </div>
      </div>
      <div className="workspace-grid">
        <article className="subpage-card">
          <h2>Completed sessions</h2>
          <p className="mono-ltr">{summary?.sessions ?? 0}</p>
        </article>
        <article className="subpage-card">
          <h2>Total interpreted minutes</h2>
          <p className="mono-ltr">{summary?.totalMinutes ?? 0} min</p>
        </article>
      </div>
    </AppShell>
  );
}

export function RecordsAssistantPage() {
  const { session } = useAuth();
  const { tr } = useLocale();
  const [question, setQuestion] = useState('');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<string>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!session?.access_token) {
      setEvents([{ type: 'error', message: 'Use the Work Assistant button in the sidebar or sign in first.' }]);
      return;
    }
    setEvents([]);
    await streamAssistantQuestion(
      { question, token: session.access_token },
      (ev) => setEvents((prev) => [...prev, ev]),
      (s) => setStatus(s)
    );
    setStatus('done');
  }

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">RECORDS ASSISTANT</span>
          <h1>Grounded workspace lookup</h1>
        </div>
      </div>
      <form className="panel-form" onSubmit={submit}>
        <Field label="Ask about your assignments, follow-ups, billing, or glossary" htmlFor="rec-q">
          <Input id="rec-q" dir="auto" value={question} onChange={(e) => setQuestion(e.target.value)} required maxLength={400} />
        </Field>
        <Button type="submit">Ask assistant</Button>
      </form>
      <div className="subpage-card" aria-live="polite">
        <p className="mono-ltr">Stream status: {status}</p>
        {events.map((ev, i) => (
          <div key={i}>
            {ev.type === 'block' && <p>{tr(ev.key, ev.vars)}</p>}
            {ev.type === 'error' && <p className="form-error">{ev.message}</p>}
          </div>
        ))}
      </div>
    </AppShell>
  );
}

export function WorkspacePlaceholderPage({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
        </div>
      </div>
      <article className="subpage-card">
        <p>{description}</p>
        <p>Do not enter confidential session content or patient names. Every metric computes from persisted rows.</p>
      </article>
    </AppShell>
  );
}
