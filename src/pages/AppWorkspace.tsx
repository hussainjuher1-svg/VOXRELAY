import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Headset,
  Inbox,
  Mic,
  Monitor,
  ShieldCheck,
  Trash2,
  Volume2,
  Wifi,
  XCircle,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { EmptyAssignmentsIllustration, EmptyTerminologyIllustration } from '../components/EditorialIllustrations';
import { Button } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Field';
import { Badge, EmptyState, Skeleton } from '../components/ui/Primitives';
import { Select } from '../components/ui/Select';
import { useAuth, useLocale } from '../context/hooks';
import { streamAssistantQuestion, type StreamEvent } from '../lib/assistantStream';
import {
  detectEnvironment,
  probeNetworkDiagnostics,
  scoreReadiness,
  type EnvironmentReport,
  type NetworkReport,
  type PeripheralReport,
  type ReadinessProfile,
} from '../lib/diagnostics';
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

  const readyCount = assignments.filter((a) => a.status === 'ready' || a.status === 'in_session').length;
  const nextUp = assignments.find((a) => a.status !== 'completed' && a.status !== 'cancelled') || assignments[0];

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">OVERVIEW</span>
          <h1>Interpreter workspace</h1>
        </div>
        <div className="hero-actions">
          <Link className="button-secondary" to="/app/device-check">
            Run device check
          </Link>
          <Link className="button-primary" to="/app/assignments">
            Manage assignments
          </Link>
        </div>
      </div>

      {!user && (
        <div className="vx-guest-banner">
          <div>
            <span className="eyebrow" style={{ color: '#96b5aa' }}>WORKSPACE SESSION</span>
            <h2>Sign in to save schedules, terminology &amp; billing</h2>
            <p>
              Timing-only assignments, glossary terms, device checks, and support queues sync directly to your account.
            </p>
          </div>
          <div className="hero-actions">
            <Link className="button-secondary" to="/login?returnTo=/app">
              Sign in
            </Link>
            <Link className="button-primary" to="/login?mode=signup&returnTo=/app">
              Create free account
            </Link>
          </div>
        </div>
      )}

      {loading ? (
        <div className="vx-kpi-grid">
          <div className="vx-kpi-card">
            <Skeleton height={24} width="60%" />
            <Skeleton height={16} />
          </div>
          <div className="vx-kpi-card">
            <Skeleton height={24} width="50%" />
            <Skeleton height={16} />
          </div>
        </div>
      ) : (
        <>
          <div className="vx-kpi-grid">
            <article className="vx-kpi-card is-live-beam">
              <span className="vox-border-beam-glow" aria-hidden="true" />
              <span className="vox-border-beam" aria-hidden="true" />
              <span className="eyebrow">Scheduled</span>
              <span className="vx-kpi-value">{assignments.length}</span>
              <Link className="inline-link" to="/app/assignments">
                Open assignments
              </Link>
            </article>
            <article className={`vx-kpi-card${readyCount > 0 ? ' is-live-beam' : ''}`}>
              <span className="vox-border-beam-glow" aria-hidden="true" />
              <span className="vox-border-beam" aria-hidden="true" />
              <span className="eyebrow">Ready / active</span>
              <span className="vx-kpi-value">{readyCount}</span>
              <Link className="inline-link" to="/app/ops">
                Inspect ops queues
              </Link>
            </article>
            <article className="vx-kpi-card">
              <span className="vox-border-beam-glow" aria-hidden="true" />
              <span className="vox-border-beam" aria-hidden="true" />
              <span className="eyebrow">Glossary terms</span>
              <span className="vx-kpi-value">{termsCount}</span>
              <Link className="inline-link" to="/app/terminology">
                Open terminology
              </Link>
            </article>
            {!user && (
              <article className="vx-kpi-card is-live-beam">
                <span className="vox-border-beam-glow" aria-hidden="true" />
                <span className="vox-border-beam" aria-hidden="true" />
                <span className="eyebrow">Session status</span>
                <span className="vx-kpi-value" style={{ fontSize: 22, paddingTop: 6 }}>
                  Guest
                </span>
                <Link className="inline-link" to="/login?returnTo=/app">
                  Sign in to sync records
                </Link>
              </article>
            )}
          </div>

          <div className="workspace-grid">
            <article className={`subpage-card vx-kpi-card${nextUp ? ' is-live-beam' : ''}`}>
              <span className="vox-border-beam-glow" aria-hidden="true" />
              <span className="vox-border-beam" aria-hidden="true" />
              <span className="eyebrow">NEXT SESSION</span>
              <h2 style={{ marginTop: 6 }}>{nextUp ? `${nextUp.ref} · ${nextUp.language_pair}` : 'No upcoming assignments'}</h2>
              <p>
                {nextUp
                  ? `${new Date(nextUp.start_at).toLocaleString()} · ${nextUp.modality} · ${nextUp.duration_minutes} min`
                  : 'Create an assignment or import a timing-only .ics calendar file.'}
              </p>
              <div style={{ marginTop: 12 }}>
                <Link className="inline-link" to={nextUp ? `/app/session/${nextUp.id}` : '/app/assignments'}>
                  {nextUp ? 'Enter focus mode' : 'Add assignment'}
                </Link>
              </div>
            </article>

            <article className="subpage-card">
              <span className="eyebrow">AUDIO &amp; GOVERNANCE</span>
              <h2 style={{ marginTop: 6 }}>T3 Human-Only Policy active</h2>
              <p>Zero audio recording. Real-time browser microphone metering and latency checks stay in your tab.</p>
              <div style={{ marginTop: 12 }}>
                <Link className="inline-link" to="/app/device-check">
                  Test microphone &amp; latency
                </Link>
              </div>
            </article>
          </div>
        </>
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
  const [icsDragOver, setIcsDragOver] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');

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
      const parsed = parseIcsTimingOnly(txt);
      setIcsSlots(parsed);
      if (parsed.length === 0) {
        setFeedback({ kind: 'error', text: 'No valid VEVENT timing slots (DTSTART/DTEND) found in that .ics file.' });
      } else {
        setFeedback(null);
      }
    });
  }

  async function saveImportedIcsSlots() {
    if (!user && !session?.access_token) {
      setFeedback({ kind: 'error', text: 'Sign in via /login first to import .ics slots.' });
      return;
    }
    if (icsSlots.length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      let savedCount = 0;
      for (const slot of icsSlots.slice(0, 20)) {
        const res = await fetch('/api/assignments', {
          method: 'POST',
          headers: buildHeaders(session?.access_token, true),
          credentials: 'same-origin',
          body: JSON.stringify({
            start_at: slot.startAt,
            duration_minutes: slot.durationMinutes,
            time_zone: tz,
            language_pair: pair,
            modality,
          }),
        });
        if (res.ok) savedCount += 1;
      }
      setIcsSlots([]);
      setFeedback({ kind: 'success', text: `Imported ${savedCount} timing slot(s) into schedule.` });
      await refresh();
    } finally {
      setBusy(false);
    }
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
        <form className="panel-form vx-beam-focus-card" onSubmit={createAssignment}>
          <span className="vox-border-beam-glow" aria-hidden="true" />
          <span className="vox-border-beam" aria-hidden="true" />
          <div className="vx-preset-strip" role="group" aria-label="Quick session presets">
            {[
              { label: '30m Medical VRI', pair: 'EN-AR', modality: 'video_remote', duration: 30 },
              { label: '60m Legal Consecutive', pair: 'EN-AR', modality: 'onsite', duration: 60 },
              { label: '45m Phone OPI', pair: 'EN-BN', modality: 'over_the_phone', duration: 45 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="vx-preset-chip"
                onClick={() => {
                  setPair(preset.pair);
                  setModality(preset.modality);
                  setDuration(preset.duration);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="form-row-2">
            <Field label="Language pair" htmlFor="assign-pair">
              <Input id="assign-pair" value={pair} onChange={(e) => setPair(e.target.value)} required />
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

          <Field label="Start (local time)" htmlFor="assign-start">
            <Input
              id="assign-start"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              required
            />
          </Field>

          <Button type="submit" loading={busy}>
            Create assignment
          </Button>
          {feedback && (
            <p className={feedback.kind === 'error' ? 'form-error' : 'form-success'} role="status">
              {feedback.text}
            </p>
          )}
        </form>

        <div
          className={`subpage-card vx-ics-dropzone${icsDragOver ? ' is-dragover' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIcsDragOver(true);
          }}
          onDragLeave={() => setIcsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIcsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) {
              void file.text().then((txt) => {
                const parsed = parseIcsTimingOnly(txt);
                setIcsSlots(parsed);
                if (parsed.length === 0) {
                  setFeedback({
                    kind: 'error',
                    text: 'No valid VEVENT timing slots (DTSTART/DTEND) found in that .ics file.',
                  });
                } else {
                  setFeedback(null);
                }
              });
            }
          }}
        >
          <span className="vox-border-beam-glow" aria-hidden="true" />
          <span className="vox-border-beam" aria-hidden="true" />
          <h2>Timing-only .ics import</h2>
          <p>Reads DTSTART and DTEND only. Event titles, attendees, and descriptions are discarded.</p>
          <div className="vx-ics-drop-area">
            <span style={{ fontSize: 12, color: 'var(--vr-ink-2)' }}>
              Drop a `.ics` calendar file here or choose from your device
            </span>
            <Input type="file" accept=".ics,text/calendar" onChange={handleIcsImport} aria-label="Import ICS file" />
          </div>
          {icsSlots.length > 0 && (
            <>
              <ul style={{ marginTop: 14, paddingInlineStart: 18 }}>
                {icsSlots.map((slot, idx) => (
                  <li key={idx} className="mono-ltr">
                    {slot.startAt} ({slot.durationMinutes} min)
                  </li>
                ))}
              </ul>
              <Button size="sm" onClick={() => void saveImportedIcsSlots()} loading={busy} style={{ marginTop: 10 }}>
                Import {icsSlots.length} slot(s) into schedule
              </Button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {items.length > 0 && (
          <div className="vx-filter-row">
            <div className="vx-filter-chips" role="group" aria-label="Filter assignments by status">
              {[
                { key: 'all', label: `All (${items.length})` },
                { key: 'scheduled', label: 'Scheduled' },
                { key: 'preparation_required', label: 'Preparing' },
                { key: 'ready', label: 'Ready' },
                { key: 'in_progress', label: 'In session' },
                { key: 'completed', label: 'Completed' },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  className={`vx-filter-chip${statusFilter === st.key ? ' is-active' : ''}`}
                  onClick={() => setStatusFilter(st.key)}
                >
                  {st.label}
                </button>
              ))}
            </div>
            <Input
              type="search"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter ref, pair, modality..."
              aria-label="Filter assignments"
              style={{ maxWidth: 240 }}
            />
          </div>
        )}
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
            {items
              .filter((a) => statusFilter === 'all' || a.status === statusFilter)
              .filter((a) => !searchFilter.trim() || matchesSearch(`${a.ref} ${a.language_pair} ${a.modality}`, searchFilter))
              .map((a) => (
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

const STARTER_BY_LANG: Record<string, Array<{ label: string; target_term: string }>> = {
  es: [
    { label: 'Informed consent', target_term: 'Consentimiento informado' },
    { label: 'Shortness of breath', target_term: 'Dificultad para respirar' },
    { label: 'Sworn affirmation', target_term: 'Declaración bajo juramento' },
    { label: 'Repeat slowly', target_term: 'Por favor repita más despacio' },
  ],
  ar: [
    { label: 'Informed consent', target_term: 'الموافقة المستنيرة' },
    { label: 'Shortness of breath', target_term: 'ضيق في التنفس' },
    { label: 'Sworn affirmation', target_term: 'إقرار تحت القسم' },
    { label: 'Clarification pause', target_term: 'وقفة استيضاح' },
  ],
  bn: [
    { label: 'Informed consent', target_term: 'অবহিত সম্মতি' },
    { label: 'Shortness of breath', target_term: 'শ্বাসকষ্ট' },
    { label: 'Sworn affirmation', target_term: 'শপথবদ্ধ ঘোষণা' },
    { label: 'Repeat slowly', target_term: 'অনুগ্রহ করে ধীরে বলুন' },
  ],
  fr: [
    { label: 'Informed consent', target_term: 'Consentement éclairé' },
    { label: 'Shortness of breath', target_term: 'Essoufflement' },
    { label: 'Sworn affirmation', target_term: 'Déclaration sous serment' },
    { label: 'Repeat slowly', target_term: 'Veuillez répéter lentement' },
  ],
  hi: [
    { label: 'Informed consent', target_term: 'सूचित सहमति' },
    { label: 'Shortness of breath', target_term: 'सांस लेने में तकलीफ' },
    { label: 'Sworn affirmation', target_term: 'शपथपूर्वक कथन' },
    { label: 'Repeat slowly', target_term: 'कृपया धीरे बोलें' },
  ],
  he: [
    { label: 'Informed consent', target_term: 'הסכמה מדעת' },
    { label: 'Shortness of breath', target_term: 'קוצר נשימה' },
    { label: 'Sworn affirmation', target_term: 'הצהרה בשבועה' },
    { label: 'Repeat slowly', target_term: 'נא לחזור לאט' },
  ],
  ur: [
    { label: 'Informed consent', target_term: 'باخبر رضامندی' },
    { label: 'Shortness of breath', target_term: 'سانس لینے میں دشواری' },
    { label: 'Sworn affirmation', target_term: 'حلفیہ بیان' },
    { label: 'Repeat slowly', target_term: 'براہِ کرم آہستہ دہرائیں' },
  ],
  pt: [
    { label: 'Informed consent', target_term: 'Consentimento informado' },
    { label: 'Shortness of breath', target_term: 'Falta de ar' },
    { label: 'Sworn affirmation', target_term: 'Declaração sob juramento' },
    { label: 'Repeat slowly', target_term: 'Por favor repita devagar' },
  ],
  zh: [
    { label: 'Informed consent', target_term: '知情同意书' },
    { label: 'Shortness of breath', target_term: '呼吸困难' },
    { label: 'Sworn affirmation', target_term: '宣誓声明' },
    { label: 'Repeat slowly', target_term: '请慢一点重复一遍' },
  ],
  de: [
    { label: 'Informed consent', target_term: 'Aufgeklärte Einwilligung' },
    { label: 'Shortness of breath', target_term: 'Atemnot' },
    { label: 'Sworn affirmation', target_term: 'Eidesstattliche Versicherung' },
    { label: 'Repeat slowly', target_term: 'Bitte langsam wiederholen' },
  ],
  ja: [
    { label: 'Informed consent', target_term: 'インフォームド・コンセント' },
    { label: 'Shortness of breath', target_term: '息切れ' },
    { label: 'Sworn affirmation', target_term: '宣誓供述' },
    { label: 'Repeat slowly', target_term: 'ゆっくり繰り返してください' },
  ],
  ko: [
    { label: 'Informed consent', target_term: '사전 동의' },
    { label: 'Shortness of breath', target_term: '호흡 곤란' },
    { label: 'Sworn affirmation', target_term: '선서 진술' },
    { label: 'Repeat slowly', target_term: '천천히 다시 말씀해 주세요' },
  ],
  it: [
    { label: 'Informed consent', target_term: 'Consenso informato' },
    { label: 'Shortness of breath', target_term: 'Mancanza di respiro' },
    { label: 'Sworn affirmation', target_term: 'Dichiarazione giurata' },
    { label: 'Repeat slowly', target_term: 'Per favore ripeta lentamente' },
  ],
  ru: [
    { label: 'Informed consent', target_term: 'Информированное согласие' },
    { label: 'Shortness of breath', target_term: 'Одышка' },
    { label: 'Sworn affirmation', target_term: 'Заявление под присягой' },
    { label: 'Repeat slowly', target_term: 'Пожалуйста, повторите медленнее' },
  ],
  tr: [
    { label: 'Informed consent', target_term: 'Aydınlatılmış onam' },
    { label: 'Shortness of breath', target_term: 'Nefes darlığı' },
    { label: 'Sworn affirmation', target_term: 'Yeminli beyan' },
    { label: 'Repeat slowly', target_term: 'Lütfen daha yavaş tekrarlayın' },
  ],
  vi: [
    { label: 'Informed consent', target_term: 'Đồng thuận sau giải thích' },
    { label: 'Shortness of breath', target_term: 'Khó thở' },
    { label: 'Sworn affirmation', target_term: 'Lời cam đoan tuyên thệ' },
    { label: 'Repeat slowly', target_term: 'Xin vui lòng nói chậm lại' },
  ],
  so: [
    { label: 'Informed consent', target_term: 'Ogolaansho xog-ogaal ah' },
    { label: 'Shortness of breath', target_term: 'Neef-qabatin' },
    { label: 'Sworn affirmation', target_term: 'Dhaar sharci ah' },
    { label: 'Repeat slowly', target_term: 'Fadlan si tartiib ah ugu celi' },
  ],
};

const WORLD_LANGUAGE_CODES = [
  'ar', 'bn', 'es', 'fr', 'hi', 'he', 'ur', 'pt', 'zh', 'de', 'ja', 'ko', 'it', 'ru', 'tr',
  'fa', 'uk', 'pl', 'nl', 'vi', 'so', 'sw', 'ta', 'te', 'gu', 'pa', 'ne', 'mr', 'ml', 'kn',
  'si', 'th', 'id', 'ms', 'tl', 'el', 'sv', 'no', 'da', 'fi', 'cs', 'ro', 'hu', 'am', 'ps',
  'my', 'km', 'lo', 'ha', 'yo', 'ig', 'zu', 'ca', 'eu', 'gl', 'cy', 'ga', 'is', 'lv', 'lt',
  'et', 'sk', 'sl', 'hr', 'sr', 'bg', 'ka', 'hy', 'mn', 'kk', 'uz', 'az', 'sq', 'bs', 'mk',
];

const LANGUAGE_CATALOG: Array<{
  code: string;
  name: string;
  nativeName: string;
  starterTerms: Array<{ label: string; target_term: string }>;
}> = (() => {
  const enDisplay =
    typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames(['en'], { type: 'language' })
      : null;

  return WORLD_LANGUAGE_CODES.map((code) => {
    const name = enDisplay?.of(code) || code.toUpperCase();
    let nativeName = name;
    try {
      const nativeDisplay = new Intl.DisplayNames([code], { type: 'language' });
      nativeName = nativeDisplay.of(code) || name;
    } catch {
      nativeName = name;
    }
    return {
      code,
      name,
      nativeName,
      starterTerms: STARTER_BY_LANG[code] || [],
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
})();

export function TerminologyPage() {
  const { user, session } = useAuth();
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const [translation, setTranslation] = useState('');
  const [targetLang, setTargetLang] = useState('es');
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

  const trimmedQuery = query.trim();
  const matchedLanguages =
    trimmedQuery.length >= 2
      ? LANGUAGE_CATALOG.filter((lang) =>
          matchesSearch(`${lang.name} ${lang.nativeName} ${lang.code}`, trimmedQuery)
        ).slice(0, 8)
      : [];

  const visible = trimmedQuery
    ? terms.filter((item) => {
        const langEntry = LANGUAGE_CATALOG.find((l) => l.code === (item.target_lang || '').toLowerCase());
        return matchesSearch(
          `${item.label} ${item.target_term} ${item.source_lang || ''} ${item.target_lang || ''} ${langEntry?.name || ''} ${langEntry?.nativeName || ''}`,
          trimmedQuery
        );
      })
    : terms;

  async function selectOrLoadLanguage(langCode: string) {
    const lang = LANGUAGE_CATALOG.find((l) => l.code === langCode);
    if (!lang) return;
    setTargetLang(lang.code);
    if (lang.starterTerms.length === 0) return;

    const existing = new Set(
      terms.map((t) => `${t.label.toLowerCase()}::${(t.target_lang || '').toLowerCase()}`)
    );
    const fresh = lang.starterTerms
      .filter((p) => !existing.has(`${p.label.toLowerCase()}::${lang.code}`))
      .map((p) => ({ ...p, source_lang: 'en', target_lang: lang.code }));
    if (fresh.length === 0) return;

    setBusy(true);
    try {
      if (user || session?.access_token) {
        const res = await fetch('/api/terms', {
          method: 'POST',
          headers: buildHeaders(session?.access_token, true),
          credentials: 'same-origin',
          body: JSON.stringify({ terms: fresh }),
        });
        if (res.ok) {
          const json = await res.json();
          const added = Array.isArray(json.data) ? json.data : [json.data];
          setTerms((prev) => [...added, ...prev]);
          return;
        }
      }
      setTerms((prev) => [...fresh.map((p) => ({ id: crypto.randomUUID(), ...p })), ...prev]);
    } finally {
      setBusy(false);
    }
  }

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
          body: JSON.stringify({
            label: label.trim(),
            target_term: translation.trim(),
            source_lang: 'en',
            target_lang: targetLang,
          }),
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
        {
          id: crypto.randomUUID(),
          label: label.trim(),
          target_term: translation.trim(),
          source_lang: 'en',
          target_lang: targetLang,
        },
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
          <Field label="Target language" htmlFor="term-lang">
            <Select
              id="term-lang"
              value={targetLang}
              onValueChange={setTargetLang}
              ariaLabel="Target language"
              options={LANGUAGE_CATALOG.map((l) => ({
                value: l.code,
                label: `${l.name} (${l.code.toUpperCase()})`,
              }))}
            />
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
          <Field label="Search terms or languages" htmlFor="term-search">
            <Input
              id="term-search"
              type="search"
              dir="auto"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any language or saved term..."
            />
          </Field>

          {matchedLanguages.length > 0 && (
            <div className="vx-lang-matches" role="region" aria-label="Related languages">
              <div className="vx-preset-strip">
                {matchedLanguages.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    className="vx-preset-chip vx-preset-chip--lang"
                    disabled={busy}
                    onClick={() => void selectOrLoadLanguage(lang.code)}
                  >
                    {lang.starterTerms.length > 0
                      ? `+ ${lang.name} (${lang.nativeName})`
                      : `Use ${lang.name} (${lang.code.toUpperCase()})`}
                  </button>
                ))}
              </div>
            </div>
          )}

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
            title={
              matchedLanguages.length > 0
                ? `${matchedLanguages[0].name} selected — no saved terms yet`
                : 'No matching glossary terms'
            }
            description={
              matchedLanguages.length > 0
                ? matchedLanguages[0].starterTerms.length > 0
                  ? `Load starter ${matchedLanguages[0].name} terms or save your own term on the left.`
                  : `Target language can be set to ${matchedLanguages[0].name} on the left to save terms.`
                : 'Save terms manually or import a UTF-8 / UTF-16 CSV file.'
            }
            action={
              matchedLanguages.length > 0 ? (
                <Button size="sm" onClick={() => void selectOrLoadLanguage(matchedLanguages[0].code)} loading={busy}>
                  {matchedLanguages[0].starterTerms.length > 0
                    ? `Load ${matchedLanguages[0].name} starter terms`
                    : `Select ${matchedLanguages[0].name}`}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="workspace-grid">
            {visible.map((item) => (
              <article key={item.id} className="subpage-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h2>
                      <bdi dir="auto">{item.label}</bdi>
                    </h2>
                    {item.target_lang && (
                      <Badge tone="teal">
                        {(item.source_lang || 'en').toUpperCase()} → {item.target_lang.toUpperCase()}
                      </Badge>
                    )}
                  </div>
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
  const { session, user } = useAuth();
  const { locale } = useLocale();
  const [profile, setProfile] = useState<ReadinessProfile>('video');
  const [envReport, setEnvReport] = useState<EnvironmentReport | null>(null);
  const [netReport, setNetReport] = useState<NetworkReport | null>(null);
  const [periph, setPeriph] = useState<PeripheralReport>({
    micTested: false,
    micPermission: 'prompt',
    micRmsDb: null,
    micPeakPct: 0,
    micClipping: false,
    micSampleRate: null,
    cameraTested: false,
    cameraPermission: 'prompt',
    cameraResolution: null,
    cameraFps: null,
    speakerConfirmed: null,
    screenShareSupported: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia),
    screenShareTested: false,
  });

  const dc = {
    en: {
      eyebrow: 'DEVICE & NETWORK READINESS LAB',
      title: 'Live hardware & network check',
      json: 'Export JSON',
      csv: 'Export CSV',
      print: 'Print PDF',
      readinessProfile: 'READINESS PROFILE',
      readyPrefix: 'Ready for',
      remainingSuffix: 'remaining',
      runSuite: 'Run full check',
      voice: 'Voice-only',
      video: 'Voice + Video',
      full: 'Full (Screen)',
      audioEyebrow: 'AUDIO STUDIO',
      audioTitle: 'Microphone & tone',
      signal: 'Signal',
      peak: 'Peak',
      rate: 'Rate',
      testMic: 'Test mic',
      playTone: 'Play 440Hz',
      audible: 'Audible ✓',
      confirmAudible: 'Confirm audible',
      netEyebrow: 'NETWORK & HARDWARE',
      rtt: 'Median RTT',
      jitter: 'Jitter / p95',
      downLoss: 'Down / Loss',
      reNet: 'Re-run network',
      testCam: 'Test camera',
      testScreen: 'Test screen',
      screenOk: 'Screen OK ✓',
      rescan: 'Re-scan',
      ledgerTitle: 'Live checks',
      probesLabel: 'live probes',
      openFullTab: 'Open full tab',
      retry: 'Retry',
      dismiss: 'Dismiss',
      initialMsg: 'Measured live in your browser. Zero audio recorded or uploaded.',
    },
    bn: {
      eyebrow: 'ডিভাইস ও নেটওয়ার্ক যাচাই',
      title: 'লাইভ হার্ডওয়্যার ও নেটওয়ার্ক পরীক্ষা',
      json: 'JSON রপ্তানি',
      csv: 'CSV রপ্তানি',
      print: 'PDF প্রিন্ট',
      readinessProfile: 'প্রস্তুতি প্রোফাইল',
      readyPrefix: 'প্রস্তুত:',
      remainingSuffix: 'টি বাকি',
      runSuite: 'সম্পূর্ণ পরীক্ষা চালান',
      voice: 'শুধু ভয়েস',
      video: 'ভয়েস + ভিডিও',
      full: 'পূর্ণ (স্ক্রিন শেয়ার)',
      audioEyebrow: 'অডিও স্টুডিও',
      audioTitle: 'মাইক্রোফোন ও টোন',
      signal: 'সিগন্যাল',
      peak: 'পিক',
      rate: 'হার্টজ',
      testMic: 'মাইক পরীক্ষা',
      playTone: '৪৪০Hz টোন',
      audible: 'শোনা গেছে ✓',
      confirmAudible: 'শোনা নিশ্চিত করুন',
      netEyebrow: 'নেটওয়ার্ক ও হার্ডওয়্যার',
      rtt: 'গড় RTT',
      jitter: 'জিটার / p95',
      downLoss: 'গতি / লস',
      reNet: 'নেটওয়ার্ক পরীক্ষা',
      testCam: 'ক্যামেরা পরীক্ষা',
      testScreen: 'স্ক্রিন শেয়ার',
      screenOk: 'স্ক্রিন ঠিক আছে ✓',
      rescan: 'পুনরায় স্ক্যান',
      ledgerTitle: 'লাইভ চেক তালিকা',
      probesLabel: 'টি লাইভ প্রোব',
      openFullTab: 'নতুন ট্যাবে খুলুন',
      retry: 'আবার চেষ্টা করুন',
      dismiss: 'বন্ধ করুন',
      initialMsg: 'সরাসরি আপনার ব্রাউজারে পরিমাপ করা। কোনো অডিও সংরক্ষিত হয় না।',
    },
    ar: {
      eyebrow: 'مختبر جاهزية الجهاز والشبكة',
      title: 'فحص حي للأجهزة والشبكة',
      json: 'تصدير JSON',
      csv: 'تصدير CSV',
      print: 'طباعة PDF',
      readinessProfile: 'ملف الجاهزية',
      readyPrefix: 'جاهز لـ',
      remainingSuffix: 'متبقية',
      runSuite: 'تشغيل الفحص الكامل',
      voice: 'صوت فقط',
      video: 'صوت + فيديو',
      full: 'كامل (مشاركة شاشة)',
      audioEyebrow: 'استوديو الصوت',
      audioTitle: 'الميكروفون والنغمة',
      signal: 'الإشارة',
      peak: 'الذروة',
      rate: 'التردد',
      testMic: 'فحص الميكروفون',
      playTone: 'تشغيل 440Hz',
      audible: 'مسموع ✓',
      confirmAudible: 'تأكيد السماع',
      netEyebrow: 'الشبكة والعتاد',
      rtt: 'متوسط RTT',
      jitter: 'التذبذب / p95',
      downLoss: 'السرعة / الفقد',
      reNet: 'إعادة فحص الشبكة',
      testCam: 'فحص الكاميرا',
      testScreen: 'فحص الشاشة',
      screenOk: 'الشاشة جاهزة ✓',
      rescan: 'إعادة المسح',
      ledgerTitle: 'الفحوصات الحية',
      probesLabel: 'فحوصات حية',
      openFullTab: 'فتح في تبويب كامل',
      retry: 'إعادة المحاولة',
      dismiss: 'إغلاق',
      initialMsg: 'قياس فوري داخل متصفحك. لا يتم تسجيل أو رفع أي صوت.',
    },
  }[locale];

  const [level, setLevel] = useState(0);
  const [liveDb, setLiveDb] = useState<number | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [nextAssignment, setNextAssignment] = useState<AssignmentItem | null>(null);
  const [markingReady, setMarkingReady] = useState(false);
  const [deviceAlert, setDeviceAlert] = useState<{
    tone: 'error' | 'warn';
    title: string;
    detail: string;
    retryKind?: 'mic' | 'camera' | 'screen';
    canOpenNewTab?: boolean;
  } | null>(null);
  const [message, setMessage] = useState<string>(dc.initialMsg);
  const [history, setHistory] = useState<
    Array<{ id: string; profile: string; score: number; verdict: string; created_at: string }>
  >([]);

  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  function explainMediaError(kind: 'Microphone' | 'Camera' | 'Screen share', err: unknown) {
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
    const inIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (!window.isSecureContext) {
      return {
        permission: 'unsupported' as const,
        title: `${kind} blocked — HTTPS required`,
        detail: `Browser security requires HTTPS or localhost to prompt for ${kind.toLowerCase()} access.`,
        canOpenNewTab: inIframe,
      };
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      if (inIframe) {
        return {
          permission: 'denied' as const,
          title: `${kind} blocked by preview frame`,
          detail: `This embedded preview frame blocks ${kind.toLowerCase()} prompts and new-tab popups. Click Copy link and open it in a browser tab, or allow ${kind} in site settings.`,
          canOpenNewTab: true,
        };
      }
      return {
        permission: 'denied' as const,
        title: `${kind} permission denied`,
        detail: `Your browser or OS blocked ${kind.toLowerCase()} access. Click the lock/site-settings icon in the address bar, set ${kind} to Allow, then click Retry.`,
        canOpenNewTab: false,
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        permission: 'unavailable' as const,
        title: `No ${kind.toLowerCase()} detected`,
        detail: `No ${kind.toLowerCase()} hardware was reported by this device. Connect or enable one in OS settings and retry.`,
        canOpenNewTab: false,
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        permission: 'denied' as const,
        title: `${kind} is busy or locked`,
        detail: `Another app or OS privacy setting is holding the ${kind.toLowerCase()}. Close other call apps and retry.`,
        canOpenNewTab: false,
      };
    }
    if (name === 'AbortError') {
      return {
        permission: 'denied' as const,
        title: `${kind} prompt dismissed`,
        detail: `The ${kind.toLowerCase()} prompt was closed before selecting a device. Click Retry to ask again.`,
        canOpenNewTab: false,
      };
    }
    return {
      permission: 'unavailable' as const,
      title: `${kind} check failed`,
      detail: `Your browser could not start ${kind.toLowerCase()} capture (${name || 'device unavailable'}).`,
      canOpenNewTab: inIframe,
    };
  }

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
    void detectEnvironment().then((r) => {
      if (active) setEnvReport(r);
    });
    void probeNetworkDiagnostics(6).then((net) => {
      if (active) setNetReport(net);
    });
    if (user || session?.access_token) {
      fetch('/api/ops?resource=diagnostics', {
        headers: buildHeaders(session?.access_token),
        credentials: 'same-origin',
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (active && Array.isArray(json?.data)) setHistory(json.data);
        })
        .catch(() => {});

      fetch('/api/assignments', {
        headers: buildHeaders(session?.access_token),
        credentials: 'same-origin',
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (!active || !Array.isArray(json?.data)) return;
          const upcoming = (json.data as AssignmentItem[]).find(
            (a) => a.status === 'scheduled' || a.status === 'preparation_required' || a.status === 'rescheduled'
          );
          setNextAssignment(upcoming || null);
        })
        .catch(() => {});
    }

    const onDeviceChange = () => {
      void detectEnvironment().then((r) => {
        if (active) setEnvReport(r);
      });
    };
    const onNetChange = () => {
      void probeNetworkDiagnostics(6).then((net) => {
        if (active) setNetReport(net);
      });
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    window.addEventListener('online', onNetChange);
    window.addEventListener('offline', onNetChange);
    const navConn = (navigator as Navigator & { connection?: EventTarget }).connection;
    navConn?.addEventListener?.('change', onNetChange);

    let micPermStatus: PermissionStatus | null = null;
    let camPermStatus: PermissionStatus | null = null;
    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (!active) return;
          micPermStatus = status;
          status.onchange = () => {
            if (!active) return;
            setPeriph((p) => ({ ...p, micPermission: status.state }));
            if (status.state === 'granted') setDeviceAlert(null);
          };
        })
        .catch(() => {});
      void navigator.permissions
        .query({ name: 'camera' as PermissionName })
        .then((status) => {
          if (!active) return;
          camPermStatus = status;
          status.onchange = () => {
            if (!active) return;
            setPeriph((p) => ({ ...p, cameraPermission: status.state }));
            if (status.state === 'granted') setDeviceAlert(null);
          };
        })
        .catch(() => {});
    }

    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      window.removeEventListener('online', onNetChange);
      window.removeEventListener('offline', onNetChange);
      navConn?.removeEventListener?.('change', onNetChange);
      if (micPermStatus) micPermStatus.onchange = null;
      if (camPermStatus) camPermStatus.onchange = null;
      stopStream();
    };
  }, [user, session?.access_token, stopStream]);

  const readiness = scoreReadiness(envReport, netReport, periph, profile);

  async function persistDiagnostics(scoreVal: number, verdictVal: string, payloadObj: unknown): Promise<{ saved: boolean; note?: string }> {
    if (!user && !session?.access_token) {
      return { saved: false, note: 'Measured locally — sign in to save runs to diagnostic history.' };
    }
    const res = await fetch('/api/ops?resource=diagnostics', {
      method: 'POST',
      headers: buildHeaders(session?.access_token, true),
      credentials: 'same-origin',
      body: JSON.stringify({
        profile,
        score: scoreVal,
        verdict: verdictVal,
        payload: payloadObj,
      }),
    }).catch(() => null);
    if (res?.ok) {
      const json = await res.json();
      if (json.data) {
        setHistory((prev) => [json.data, ...prev]);
      }
      return { saved: true };
    }
    const err = res ? await res.json().catch(() => ({})) : {};
    return { saved: false, note: err.error || 'Could not save diagnostic run to server.' };
  }

  async function runNetworkProbe() {
    setBusyStep('network');
    setMessage('Running 12 sequenced latency probes & 3-run payload throughput check...');
    const net = await probeNetworkDiagnostics(12);
    setNetReport(net);
    setBusyStep(null);
    if (net.probesSucceeded === 0) {
      setDeviceAlert({
        tone: 'error',
        title: 'Network probes could not reach server',
        detail: 'All 12 latency requests failed or were blocked. Check your connection and retry.',
      });
      setMessage('Network unreachable — 0 of 12 probes succeeded.');
    } else {
      setMessage(
        `Network measured: median ${net.medianMs ?? '—'} ms, p95 ${net.p95Ms ?? '—'} ms, jitter ${net.jitterMs ?? '—'} ms, loss ${net.lossPct}%.`
      );
    }
    return net;
  }

  async function runMicProbe(): Promise<PeripheralReport> {
    stopStream();
    setBusyStep('mic');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      const inIframe = typeof window !== 'undefined' && window.self !== window.top;
      const next: PeripheralReport = {
        ...periph,
        micTested: true,
        micPermission: !window.isSecureContext ? 'unsupported' : 'unavailable',
        micRmsDb: null,
        micPeakPct: 0,
        micSampleRate: null,
      };
      setPeriph(next);
      setDeviceAlert({
        tone: 'error',
        title: !window.isSecureContext ? 'Microphone blocked — HTTPS required' : 'Microphone API unavailable',
        detail: !window.isSecureContext
          ? 'Browser security requires HTTPS or localhost to access microphone hardware.'
          : 'This browser does not expose navigator.mediaDevices.getUserMedia.',
        retryKind: 'mic',
        canOpenNewTab: inIframe,
      });
      setMessage('Microphone unavailable in this browser.');
      setBusyStep(null);
      return next;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      let peakPct = 0;
      let clipping = false;
      let lastDb: number | null = null;
      let sampleRate: number | null = null;

      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        sampleRate = ctx.sampleRate;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        streamRef.current = stream;
        ctxRef.current = ctx;

        const data = new Uint8Array(analyser.fftSize);
        const startedAt = performance.now();
        await new Promise<void>((resolve) => {
          const tick = () => {
            analyser.getByteTimeDomainData(data);
            let sumSq = 0;
            let maxSample = 0;
            for (let i = 0; i < data.length; i += 1) {
              const v = (data[i] - 128) / 128;
              sumSq += v * v;
              maxSample = Math.max(maxSample, Math.abs(v));
            }
            const rms = Math.sqrt(sumSq / data.length);
            const db = Math.max(-60, Math.round(20 * Math.log10(Math.max(rms, 0.001))));
            const pct = Math.min(100, Math.round(rms * 280));
            if (maxSample >= 0.98) clipping = true;
            peakPct = Math.max(peakPct, pct);
            lastDb = db;
            setLevel(pct);
            setLiveDb(db);

            if (performance.now() - startedAt < 2500) {
              rafRef.current = requestAnimationFrame(tick);
            } else {
              stopStream();
              resolve();
            }
          };
          rafRef.current = requestAnimationFrame(tick);
        });
      } else {
        stream.getTracks().forEach((t) => t.stop());
      }

      const next: PeripheralReport = {
        ...periph,
        micTested: true,
        micPermission: 'granted',
        micRmsDb: lastDb,
        micPeakPct: peakPct,
        micClipping: clipping,
        micSampleRate: sampleRate,
      };
      setPeriph(next);
      setDeviceAlert(null);
      setMessage(`Microphone checked (${sampleRate ?? '—'} Hz · ${lastDb ?? '—'} dBFS · peak ${peakPct}%).`);
      return next;
    } catch (err) {
      const info = explainMediaError('Microphone', err);
      const next: PeripheralReport = {
        ...periph,
        micTested: true,
        micPermission: info.permission,
        micRmsDb: null,
        micPeakPct: 0,
        micSampleRate: null,
      };
      setPeriph(next);
      setDeviceAlert({
        tone: 'error',
        title: info.title,
        detail: info.detail,
        retryKind: 'mic',
        canOpenNewTab: info.canOpenNewTab,
      });
      setMessage(info.title);
      return next;
    } finally {
      setBusyStep(null);
    }
  }

  async function runCameraProbe(): Promise<PeripheralReport> {
    setBusyStep('camera');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      const inIframe = typeof window !== 'undefined' && window.self !== window.top;
      const next: PeripheralReport = {
        ...periph,
        cameraTested: true,
        cameraPermission: !window.isSecureContext ? 'unsupported' : 'unavailable',
        cameraResolution: null,
        cameraFps: null,
      };
      setPeriph(next);
      setDeviceAlert({
        tone: 'error',
        title: !window.isSecureContext ? 'Camera blocked — HTTPS required' : 'Camera API unavailable',
        detail: !window.isSecureContext
          ? 'Browser security requires HTTPS or localhost to access camera hardware.'
          : 'This browser does not expose camera capture APIs.',
        retryKind: 'camera',
        canOpenNewTab: inIframe,
      });
      setBusyStep(null);
      return next;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.() || {};
      const resLabel = settings.width && settings.height ? `${settings.width}×${settings.height}` : 'Active';
      const fps = settings.frameRate ? Math.round(settings.frameRate) : null;
      stream.getTracks().forEach((t) => t.stop());
      const next: PeripheralReport = {
        ...periph,
        cameraTested: true,
        cameraPermission: 'granted',
        cameraResolution: resLabel,
        cameraFps: fps,
      };
      setPeriph(next);
      setDeviceAlert(null);
      setMessage(`Camera active: ${resLabel}${fps ? ` @ ${fps} fps` : ''}.`);
      return next;
    } catch (err) {
      const info = explainMediaError('Camera', err);
      const next: PeripheralReport = {
        ...periph,
        cameraTested: true,
        cameraPermission: info.permission,
        cameraResolution: info.permission === 'denied' ? 'Denied' : 'Unavailable',
        cameraFps: null,
      };
      setPeriph(next);
      setDeviceAlert({
        tone: 'error',
        title: info.title,
        detail: info.detail,
        retryKind: 'camera',
        canOpenNewTab: info.canOpenNewTab,
      });
      setMessage(info.title);
      return next;
    } finally {
      setBusyStep(null);
    }
  }

  async function runScreenShareProbe() {
    setBusyStep('screen');
    if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
      setDeviceAlert({
        tone: 'warn',
        title: 'Screen share unsupported here',
        detail: 'Your browser or embedded context does not allow getDisplayMedia screen sharing.',
        retryKind: 'screen',
        canOpenNewTab: typeof window !== 'undefined' && window.self !== window.top,
      });
      setBusyStep(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setPeriph((p) => ({ ...p, screenShareTested: true, screenShareSupported: true }));
      setDeviceAlert(null);
      setMessage('Screen share permission verified (zero frames recorded).');
    } catch (err) {
      const info = explainMediaError('Screen share', err);
      setDeviceAlert({
        tone: 'warn',
        title: info.title,
        detail: info.detail,
        retryKind: 'screen',
        canOpenNewTab: info.canOpenNewTab,
      });
      setMessage(info.title);
    } finally {
      setBusyStep(null);
    }
  }

  async function playSpeakerTone() {
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        setDeviceAlert({
          tone: 'error',
          title: 'Web Audio output unavailable',
          detail: 'This browser does not support Web Audio API playback.',
        });
        return;
      }
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      if (ctx.state !== 'running') {
        void ctx.close().catch(() => {});
        setDeviceAlert({
          tone: 'warn',
          title: 'Audio output blocked by browser autoplay policy',
          detail: 'Click Play 440Hz tone directly or unmute this browser tab, then retry.',
        });
        return;
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 440;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      window.setTimeout(() => {
        osc.stop();
        void ctx.close().catch(() => {});
      }, 650);
      setDeviceAlert(null);
      setMessage('Playing 440 Hz tone — click Confirm audible if you heard it.');
    } catch {
      setDeviceAlert({
        tone: 'error',
        title: 'Audio output failed',
        detail: 'Your browser or OS audio device blocked tone playback.',
      });
      setMessage('Audio output tone could not be played in this browser.');
    }
  }

  async function runEnvRescan() {
    setBusyStep('env');
    try {
      const env = await detectEnvironment();
      setEnvReport(env);
      setMessage('Browser & hardware environment re-scanned.');
    } finally {
      setBusyStep(null);
    }
  }

  function triggerRowAction(kind: 'mic' | 'tone' | 'camera' | 'screen' | 'network' | 'env') {
    if (kind === 'mic') void runMicProbe();
    else if (kind === 'tone') void playSpeakerTone();
    else if (kind === 'camera') void runCameraProbe();
    else if (kind === 'screen') void runScreenShareProbe();
    else if (kind === 'network') void runNetworkProbe();
    else void runEnvRescan();
  }

  async function runFullSuite() {
    setBusyStep('all');
    const [env, net] = await Promise.all([detectEnvironment(), probeNetworkDiagnostics(12)]);
    setEnvReport(env);
    setNetReport(net);
    const freshPeriph = await runMicProbe();
    const finalScore = scoreReadiness(env, net, freshPeriph, profile);
    const saved = await persistDiagnostics(finalScore.score, finalScore.verdict, {
      env,
      net,
      periph: freshPeriph,
      checks: finalScore.checks,
    });
    if (saved.note) {
      setMessage((prev) => `${prev} · ${saved.note}`);
    } else {
      setMessage(`Suite complete: ${finalScore.score}/100 (${finalScore.verdict}) saved to history.`);
    }
    setBusyStep(null);
  }

  function exportReportJson() {
    const blob = new Blob([JSON.stringify({ readiness, envReport, netReport, periph }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxrelay-readiness-${profile}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportReportCsv() {
    const csv = exportCsv(
      ['category', 'check', 'measured', 'threshold', 'status', 'points', 'max_points'],
      readiness.checks.map((c) => [c.category, c.label, c.measured, c.threshold, c.status, String(c.impactPoints), String(c.maxPoints)])
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxrelay-readiness-${profile}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ringCircumference = 2 * Math.PI * 54;
  const ringOffset = ringCircumference * (1 - readiness.score / 100);
  const ringColor = readiness.verdict === 'pass' ? '#96b5aa' : readiness.verdict === 'warn' ? '#f2b632' : '#de4e26';
  const waveBars = Array.from({ length: 18 }, (_, i) => {
    const base = Math.max(8, level * (0.45 + 0.55 * Math.abs(Math.sin((i + 1) * 0.7))));
    return Math.min(100, Math.round(level === 0 ? 10 : base));
  });

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">{dc.eyebrow}</span>
          <h1>{dc.title}</h1>
        </div>
        <div className="hero-actions">
          <Button variant="secondary" size="sm" onClick={exportReportJson}>
            <Download size={14} />
            <span>{dc.json}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={exportReportCsv}>
            <Download size={14} />
            <span>{dc.csv}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <span>{dc.print}</span>
          </Button>
        </div>
      </div>

      <section className="vx-diag-hero" aria-label="Readiness score summary">
        <span className="vox-border-beam-glow vox-border-beam-glow--hero vox-border-beam-glow--always" aria-hidden="true" />
        <span className="vox-border-beam vox-border-beam--hero vox-border-beam--always" aria-hidden="true" />
        <div className="vx-score-ring">
          <svg viewBox="0 0 124 124" aria-hidden="true">
            <circle cx="62" cy="62" r="54" fill="none" stroke="#1e4239" strokeWidth="10" />
            <circle
              cx="62"
              cy="62"
              r="54"
              fill="none"
              stroke={ringColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
            />
          </svg>
          <div className="vx-score-ring-center">
            <span className="vx-score-ring-num">{readiness.score}</span>
            <span className="vx-score-ring-cap">{readiness.verdict} · /100</span>
          </div>
        </div>

        <div className="vx-diag-hero-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <span className="eyebrow" style={{ color: '#96b5aa' }}>{dc.readinessProfile}</span>
              <h2>
                {readiness.verdict === 'pass'
                  ? `${dc.readyPrefix} ${profile === 'voice' ? dc.voice : profile === 'video' ? dc.video : dc.full}`
                  : `${readiness.deductions.length} ${dc.remainingSuffix}`}
              </h2>
            </div>
            <Button onClick={() => void runFullSuite()} loading={busyStep === 'all'}>
              <Activity size={15} />
              <span>{dc.runSuite}</span>
            </Button>
          </div>

          <div className="vx-profile-pills" role="group" aria-label="Threshold profile">
            {(['voice', 'video', 'full'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`vx-profile-pill${profile === p ? ' is-active' : ''}`}
                onClick={() => setProfile(p)}
              >
                {p === 'voice' ? dc.voice : p === 'video' ? dc.video : dc.full}
              </button>
            ))}
          </div>

          <div className="vx-comp-bars">
            {(Object.entries(readiness.components) as Array<[string, { score: number; max: number }]>).map(([k, val]) => {
              const pct = val.max > 0 ? Math.round((val.score / val.max) * 100) : 0;
              return (
                <div key={k} className="vx-comp-item">
                  <div className="vx-comp-head">
                    <span>{k}</span>
                    <span>{val.score}/{val.max}</span>
                  </div>
                  <div className="vx-comp-track">
                    <div className="vx-comp-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#b7ccc4' }}>{message}</p>
        </div>
      </section>

      <div className="vx-studio-grid">
        <article className="vx-studio-card vx-studio-card--cream">
          <div className="vx-studio-head">
            <div>
              <span className="eyebrow">{dc.audioEyebrow}</span>
              <h2>{dc.audioTitle}</h2>
            </div>
            <Badge tone={periph.micPermission === 'granted' ? 'success' : periph.micPermission === 'denied' ? 'danger' : 'neutral'}>
              {periph.micTested ? periph.micPermission : 'Ready'}
            </Badge>
          </div>

          <div className="vx-wave-meter" role="progressbar" aria-label="Microphone signal level" aria-valuenow={level} aria-valuemin={0} aria-valuemax={100}>
            {waveBars.map((h, i) => (
              <span
                key={i}
                className="vx-wave-bar"
                style={{
                  height: `${h}%`,
                  background: periph.micClipping ? '#f2b632' : level > 0 ? '#de4e26' : '#355f54',
                }}
              />
            ))}
          </div>

          <div className="vx-stat-strip">
            <div className="vx-stat-cell">
              <span>{dc.signal}</span>
              <strong>{liveDb ?? periph.micRmsDb ?? '—'} dBFS</strong>
            </div>
            <div className="vx-stat-cell">
              <span>{dc.peak}</span>
              <strong>{periph.micPeakPct}%</strong>
            </div>
            <div className="vx-stat-cell">
              <span>{dc.rate}</span>
              <strong>{periph.micSampleRate ?? '—'} Hz</strong>
            </div>
          </div>

          <div className="vx-studio-actions">
            <Button size="sm" onClick={() => void runMicProbe()} loading={busyStep === 'mic'}>
              <Mic size={14} />
              <span>{dc.testMic}</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void playSpeakerTone()}>
              <Volume2 size={14} />
              <span>{dc.playTone}</span>
            </Button>
            <Button
              size="sm"
              variant={periph.speakerConfirmed === true ? 'primary' : 'secondary'}
              onClick={() => {
                setPeriph((p) => ({ ...p, speakerConfirmed: true }));
                setMessage('Speaker output confirmed audible.');
              }}
            >
              {periph.speakerConfirmed ? dc.audible : dc.confirmAudible}
            </Button>
          </div>
        </article>

        <article className="vx-studio-card">
          <div className="vx-studio-head">
            <div>
              <span className="eyebrow">{dc.netEyebrow}</span>
              <h2>{envReport ? `${envReport.browserName} · ${envReport.osName}` : 'Detecting environment…'}</h2>
            </div>
            <Badge tone={netReport ? 'success' : 'neutral'}>{netReport ? `${netReport.medianMs ?? '—'} ms RTT` : 'Probing'}</Badge>
          </div>

          <div className="vx-stat-strip">
            <div className="vx-stat-cell">
              <span>{dc.rtt}</span>
              <strong>{netReport?.medianMs != null ? `${netReport.medianMs} ms` : 'Probing…'}</strong>
            </div>
            <div className="vx-stat-cell">
              <span>{dc.jitter}</span>
              <strong>
                {netReport ? `${netReport.jitterMs ?? '—'} / ${netReport.p95Ms ?? '—'} ms` : '—'}
              </strong>
            </div>
            <div className="vx-stat-cell">
              <span>{dc.downLoss}</span>
              <strong>
                {netReport ? `${netReport.downMbps ?? '—'} Mbps · ${netReport.lossPct}%` : '—'}
              </strong>
            </div>
          </div>

          <p className="vx-studio-hw">
            {envReport
              ? `${envReport.hardware.cpuCores ?? '—'} cores · ${envReport.display.width}×${envReport.display.height}${envReport.display.refreshHz ? ` · ${envReport.display.refreshHz} Hz` : ''} · ICE ${envReport.webrtc.iceCandidatesGathered} (${envReport.webrtc.gatheringMs ?? '—'} ms)`
              : 'Scanning CPU, display, and WebRTC ICE candidates…'}
          </p>

          {envReport && (
            <div className="vx-codec-strip">
              {[
                ['Opus', envReport.codecs.opus],
                ['VP8', envReport.codecs.vp8],
                ['VP9', envReport.codecs.vp9],
                ['H.264', envReport.codecs.h264],
                ['AV1', envReport.codecs.av1],
              ].map(([name, ok]) => (
                <span key={String(name)} className={`vx-codec-chip${ok ? ' is-ok' : ''}`}>
                  {String(name)} {ok ? '✓' : '—'}
                </span>
              ))}
            </div>
          )}

          <div className="vx-studio-actions">
            <Button size="sm" onClick={() => void runNetworkProbe()} loading={busyStep === 'network'}>
              <Wifi size={14} />
              <span>{dc.reNet}</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void runCameraProbe()} loading={busyStep === 'camera'}>
              <Camera size={14} />
              <span>{periph.cameraPermission === 'granted' && periph.cameraResolution ? `Cam ${periph.cameraResolution}` : dc.testCam}</span>
            </Button>
            {profile === 'full' && (
              <Button size="sm" variant="secondary" onClick={() => void runScreenShareProbe()} loading={busyStep === 'screen'}>
                <Monitor size={14} />
                <span>{periph.screenShareTested ? dc.screenOk : dc.testScreen}</span>
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => void runEnvRescan()} loading={busyStep === 'env'}>
              <Monitor size={14} />
              <span>{dc.rescan}</span>
            </Button>
          </div>
        </article>
      </div>

      {deviceAlert && (
        <div className={`vx-device-alert vx-device-alert--${deviceAlert.tone}`} role="alert">
          <div>
            <strong>{deviceAlert.title}</strong>
            <p>{deviceAlert.detail}</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {deviceAlert.retryKind && (
              <button
                type="button"
                className="vx-device-alert-close"
                onClick={() => triggerRowAction(deviceAlert.retryKind!)}
              >
                {dc.retry}
              </button>
            )}
            {deviceAlert.canOpenNewTab && (
              <button
                type="button"
                className="vx-device-alert-close"
                onClick={() => {
                  void navigator.clipboard?.writeText(window.location.href).then(() => {
                    setCopiedUrl(true);
                    window.setTimeout(() => setCopiedUrl(false), 2000);
                  });
                }}
              >
                <Copy size={12} aria-hidden="true" />
                <span>{copiedUrl ? 'Copied ✓' : 'Copy link'}</span>
              </button>
            )}
            <button
              type="button"
              className="vx-device-alert-close"
              onClick={() => setDeviceAlert(null)}
              aria-label="Dismiss device alert"
            >
              {dc.dismiss}
            </button>
          </div>
        </div>
      )}

      <section className="vx-ledger" aria-label="Readiness score breakdown">
        <div className="vx-ledger-head">
          <div>
            <h2>{dc.ledgerTitle}</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            {nextAssignment && (
              <div className="vx-next-gate">
                <span>
                  Next: <strong>{nextAssignment.ref}</strong> ({nextAssignment.language_pair})
                </span>
                <button
                  type="button"
                  className="vx-ledger-action"
                  disabled={markingReady || readiness.verdict === 'fail'}
                  title={
                    readiness.verdict === 'fail'
                      ? 'Pass readiness checks first to mark assignment ready'
                      : `Mark ${nextAssignment.ref} ready`
                  }
                  onClick={async () => {
                    setMarkingReady(true);
                    const res = await fetch(`/api/assignments?id=${encodeURIComponent(nextAssignment.id)}`, {
                      method: 'PATCH',
                      headers: buildHeaders(session?.access_token, true),
                      credentials: 'same-origin',
                      body: JSON.stringify({ action: 'mark_ready' }),
                    }).catch(() => null);
                    setMarkingReady(false);
                    if (res?.ok) {
                      setMessage(`Marked ${nextAssignment.ref} ready for session.`);
                      setNextAssignment(null);
                    } else {
                      const err = res ? await res.json().catch(() => ({})) : {};
                      setMessage(err.error || 'Could not update assignment status.');
                    }
                  }}
                >
                  {markingReady ? 'Updating…' : 'Mark ready'}
                </button>
              </div>
            )}
            <span className="vx-ledger-meta">
              {profile === 'voice' ? dc.voice : profile === 'video' ? dc.video : dc.full} · {readiness.checks.length} {dc.probesLabel}
            </span>
          </div>
        </div>
        <div className="vx-ledger-body">
          {readiness.checks.map((c) => {
            const isMic = c.id === 'periph_mic';
            const isAv = c.id === 'periph_av';
            const isNet = c.id === 'net_latency' || c.id === 'net_loss_bw';
            const isEnv = c.id === 'browser_webrtc' || c.id === 'device_cpu' || c.id === 'device_storage';

            const isRunningRow =
              (isMic && (busyStep === 'mic' || busyStep === 'all')) ||
              (isAv && busyStep === 'camera') ||
              (isNet && (busyStep === 'network' || busyStep === 'all')) ||
              (isEnv && (busyStep === 'env' || busyStep === 'all'));

            const scoreTier =
              c.status === 'pass' && c.impactPoints === c.maxPoints
                ? 'pass'
                : c.status === 'fail' || c.impactPoints === 0
                  ? 'fail'
                  : 'warn';
            const rowPct = c.maxPoints > 0 ? Math.round((c.impactPoints / c.maxPoints) * 100) : 0;

            let actionLabel: string | null = null;
            let actionKind: 'mic' | 'tone' | 'camera' | 'screen' | 'network' | 'env' | null = null;
            if (isMic && c.impactPoints < c.maxPoints) {
              actionLabel = busyStep === 'mic' ? 'Testing…' : dc.testMic;
              actionKind = 'mic';
            } else if (isAv && c.impactPoints < c.maxPoints) {
              if (profile === 'voice') {
                actionLabel = dc.playTone;
                actionKind = 'tone';
              } else if (profile === 'full' && periph.cameraPermission === 'granted' && !periph.screenShareTested) {
                actionLabel = busyStep === 'screen' ? 'Testing…' : dc.testScreen;
                actionKind = 'screen';
              } else {
                actionLabel = busyStep === 'camera' ? 'Testing…' : dc.testCam;
                actionKind = 'camera';
              }
            } else if (isNet && c.impactPoints < c.maxPoints) {
              actionLabel = busyStep === 'network' ? 'Probing…' : 'Re-check';
              actionKind = 'network';
            } else if (isEnv && c.impactPoints < c.maxPoints) {
              actionLabel = busyStep === 'env' ? 'Scanning…' : 'Re-check';
              actionKind = 'env';
            }

            return (
              <div key={c.id} className={`vx-ledger-row vx-ledger-row--${scoreTier}${isRunningRow ? ' is-running' : ''}`}>
                {isRunningRow && (
                  <>
                    <span className="vox-border-beam-glow vox-border-beam-glow--row vox-border-beam-glow--always" aria-hidden="true" />
                    <span className="vox-border-beam vox-border-beam--row vox-border-beam--always" aria-hidden="true" />
                  </>
                )}
                <span className="vx-ledger-cat">{c.category}</span>
                <div className="vx-ledger-title">
                  <strong className="vx-ledger-name">
                    {scoreTier === 'pass' ? (
                      <CheckCircle2 size={15} className="vx-row-ico vx-row-ico--pass" aria-hidden="true" />
                    ) : scoreTier === 'warn' ? (
                      <AlertTriangle size={15} className="vx-row-ico vx-row-ico--warn" aria-hidden="true" />
                    ) : (
                      <XCircle size={15} className="vx-row-ico vx-row-ico--fail" aria-hidden="true" />
                    )}
                    <span>{c.label}</span>
                  </strong>
                  {c.status !== 'pass' && <span>{c.threshold}</span>}
                </div>
                <div className="vx-ledger-val-stack">
                  <span className="vx-ledger-val">{c.measured}</span>
                  <div className="vx-row-meter" aria-hidden="true">
                    <div className={`vx-row-meter-fill vx-row-meter-fill--${scoreTier}`} style={{ width: `${rowPct}%` }} />
                  </div>
                  {c.measuredDetail && <span className="vx-ledger-val-sub">{c.measuredDetail}</span>}
                </div>
                <div className="vx-ledger-end">
                  {actionLabel && actionKind && (
                    <button
                      type="button"
                      className="vx-ledger-action"
                      disabled={Boolean(busyStep)}
                      onClick={() => triggerRowAction(actionKind)}
                    >
                      {actionLabel}
                    </button>
                  )}
                  <span className={`vx-score-pill vx-score-pill--${scoreTier}`}>
                    {c.impactPoints}/{c.maxPoints}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {history.length > 0 && (
        <section className="vx-ledger" aria-label="Saved readiness runs">
          <div className="vx-ledger-head">
            <h2>Saved diagnostic history</h2>
            <span className="vx-ledger-meta">{history.length} saved run(s)</span>
          </div>
          <div className="vx-ledger-body">
            {history.slice(0, 8).map((h) => {
              const tier = h.verdict === 'pass' ? 'pass' : h.verdict === 'warn' ? 'warn' : 'fail';
              return (
                <div key={h.id} className="vx-ledger-row">
                  <span className="vx-ledger-cat">{h.profile}</span>
                  <div className="vx-ledger-title">
                    <strong>Readiness score: {h.score} / 100</strong>
                    <span>{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  <span className="vx-ledger-val">Run {h.id.slice(0, 8)}</span>
                  <div className="vx-ledger-end">
                    <span className={`vx-score-pill vx-score-pill--${tier}`}>
                      {h.verdict}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
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
  const [billingNotice, setBillingNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

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
    setBillingNotice(null);
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
      }).catch(() => null);
      if (res?.ok) {
        const json = await res.json();
        if (json.data) {
          setRecords((prev) => [json.data, ...prev]);
          setBillingNotice({ kind: 'success', text: 'Billing entry saved.' });
          return;
        }
      }
      const err = res ? await res.json().catch(() => ({})) : {};
      setBillingNotice({ kind: 'error', text: err.error || 'Could not save billing entry to the server.' });
      return;
    }
    const floored = Math.max(minutes, minimumMinutes);
    const billable = Math.ceil(floored / Math.max(1, roundTo)) * Math.max(1, roundTo);
    const amount_cents = Math.round((billable / 60) * rateDollars * 100);
    setRecords((prev) => [{ id: crypto.randomUUID(), minutes: billable, amount_cents, status: 'invoiced' }, ...prev]);
    setBillingNotice({ kind: 'success', text: 'Calculated locally (sign in to persist billing entries).' });
  }

  async function markPaid(id: string) {
    setBillingNotice(null);
    if (user || session?.access_token) {
      const res = await fetch('/api/ops?resource=billing', {
        method: 'PATCH',
        headers: buildHeaders(session?.access_token, true),
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      }).catch(() => null);
      if (!res?.ok) {
        const err = res ? await res.json().catch(() => ({})) : {};
        setBillingNotice({ kind: 'error', text: err.error || 'Could not update billing status on the server.' });
        return;
      }
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
        {billingNotice && (
          <p className={billingNotice.kind === 'error' ? 'form-error' : 'form-success'} role="status">
            {billingNotice.text}
          </p>
        )}
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
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

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
      setNotice({ kind: 'success', text: 'Ticket queued for human support and confirmation logged in email outbox.' });
      await loadTickets();
    } else {
      const err = await res.json().catch(() => ({}));
      setNotice({ kind: 'error', text: err.error || 'Unable to create ticket.' });
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
          {notice && (
            <p className={notice.kind === 'error' ? 'form-error' : 'form-success'} role="status">
              {notice.text}
            </p>
          )}
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
  const [auditEvents, setAuditEvents] = useState<
    Array<{ id: number; actor_id: string | null; area: string; type: string; result: string; created_at: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    const [res, auditRes] = await Promise.all([
      fetch('/api/admin', { headers: buildHeaders(session?.access_token), credentials: 'same-origin' }),
      fetch('/api/ops?resource=audit', { headers: buildHeaders(session?.access_token), credentials: 'same-origin' }),
    ]);
    if (res.ok) {
      const json = await res.json();
      setRequests(json.requests || []);
      setOutbox(json.outbox || []);
    }
    if (auditRes.ok) {
      const aJson = await auditRes.json();
      setAuditEvents(aJson.data || []);
    }
    setLoading(false);
  }, [session?.access_token]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/admin', { headers: buildHeaders(session?.access_token), credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/ops?resource=audit', { headers: buildHeaders(session?.access_token), credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([json, aJson]) => {
        if (active && json) {
          setRequests(json.requests || []);
          setOutbox(json.outbox || []);
        }
        if (active && aJson?.data) {
          setAuditEvents(aJson.data);
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

  function exportAuditCsv() {
    const csv = exportCsv(
      ['id', 'actor_id', 'area', 'type', 'result', 'created_at'],
      auditEvents.map((e) => [String(e.id), e.actor_id || '', e.area, e.type, e.result, e.created_at])
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voxrelay-audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

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
          <div className="workspace-grid" style={{ marginBottom: 32 }}>
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2>Immutable audit log ({auditEvents.length})</h2>
            <Button size="sm" variant="secondary" onClick={exportAuditCsv}>
              <Download size={14} />
              <span>Export audit CSV</span>
            </Button>
          </div>
          <div className="workspace-grid">
            {auditEvents.slice(0, 12).map((ev) => (
              <article key={ev.id} className="subpage-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="eyebrow">{ev.area}</span>
                  <Badge tone={ev.result === 'ok' || ev.result === 'pass' ? 'success' : 'warning'}>{ev.result}</Badge>
                </div>
                <strong className="mono-ltr" style={{ fontSize: 13 }}>{ev.type}</strong>
                <p className="mono-ltr" style={{ fontSize: 11, marginTop: 4 }}>{ev.created_at}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

export function SettingsPage() {
  const { user, session, signOut } = useAuth();
  const { locale, setLocale } = useLocale();
  const [fullName, setFullName] = useState('');
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [languagePairs, setLanguagePairs] = useState('EN-AR, EN-ES');
  const [weeklyHours, setWeeklyHours] = useState(30);
  const [sessionsList, setSessionsList] = useState<
    Array<{ id: string; user_agent: string; created_at: string; expires_at: string; isCurrent?: boolean }>
  >([]);
  const [savedNotice, setSavedNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadSessions = useCallback(async () => {
    const res = await fetch('/api/auth', { credentials: 'same-origin' });
    if (res.ok) {
      const json = await res.json();
      setSessionsList(json.sessions || []);
    }
  }, []);

  useEffect(() => {
    if (!user && !session?.access_token) return;
    let active = true;
    Promise.all([
      fetch('/api/ops?resource=profile', {
        headers: buildHeaders(session?.access_token),
        credentials: 'same-origin',
      }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/auth', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([json, authJson]) => {
        if (active && json?.data) {
          setFullName(json.data.full_name || '');
          if (json.data.time_zone) setTimeZone(json.data.time_zone);
          if (json.data.language_pairs) setLanguagePairs(json.data.language_pairs);
          if (json.data.weekly_hours) setWeeklyHours(Number(json.data.weekly_hours));
        }
        if (active && Array.isArray(authJson?.sessions)) {
          setSessionsList(authJson.sessions);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, session?.access_token]);

  async function revokeSession(sessionId: string) {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'revoke_session', sessionId }),
    });
    await loadSessions();
  }

  async function revokeAllSessions() {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'revoke_all' }),
    });
    await signOut();
  }

  async function downloadGdprExport() {
    const res = await fetch('/api/ops?resource=gdpr_export', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    });
    if (!res.ok) return;
    const payload = await res.json();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voxrelay-gdpr-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

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
      setSavedNotice({ kind: 'success', text: 'Settings saved.' });
    } else {
      setSavedNotice({ kind: 'error', text: 'Sign in first to save profile settings.' });
    }
  }

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">SETTINGS &amp; SECURITY</span>
          <h1>Profile, sessions &amp; GDPR export</h1>
        </div>
        {user && (
          <Button variant="secondary" onClick={() => void downloadGdprExport()}>
            <Download size={14} />
            <span>Export my data (JSON)</span>
          </Button>
        )}
      </div>

      <div className="workspace-grid">
        <form className="panel-form" onSubmit={(e) => void saveProfile(e)}>
          <Field label="Display name" htmlFor="set-name">
            <Input id="set-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Interface language" htmlFor="set-locale">
            <Select
              id="set-locale"
              value={locale}
              onValueChange={(v) => setLocale(v === 'ar' || v === 'bn' ? v : 'en')}
              options={[
                { value: 'en', label: 'English (LTR)' },
                { value: 'bn', label: 'বাংলা (Bengali)' },
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
          {savedNotice && (
            <p className={savedNotice.kind === 'error' ? 'form-error' : 'form-success'} role="status">
              {savedNotice.text}
            </p>
          )}
        </form>

        <article className="subpage-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2>Active sessions ({sessionsList.length})</h2>
            {sessionsList.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => void revokeAllSessions()}>
                Revoke all
              </Button>
            )}
          </div>
          {sessionsList.length === 0 ? (
            <p>Sign in with email &amp; password to view and manage active sessions.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {sessionsList.map((s) => (
                <div key={s.id} className="subpage-card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 12 }}>{s.user_agent.slice(0, 48)}</strong>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {s.isCurrent && <Badge tone="success">Current</Badge>}
                      <Button size="sm" variant="ghost" onClick={() => void revokeSession(s.id)}>
                        Revoke
                      </Button>
                    </div>
                  </div>
                  <p className="mono-ltr" style={{ fontSize: 11, marginTop: 4 }}>
                    Started: {s.created_at}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
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

  const pairsList = Object.entries(summary?.byPair || {});
  const modalityList = Object.entries(summary?.byModality || {});

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">REPORTS</span>
          <h1>Interpreter &amp; organization totals</h1>
        </div>
      </div>
      <div className="vx-kpi-grid">
        <article className="vx-kpi-card vx-kpi-card--terracotta">
          <span className="eyebrow">Completed sessions</span>
          <span className="vx-kpi-value">{summary?.sessions ?? 0}</span>
        </article>
        <article className="vx-kpi-card vx-kpi-card--forest">
          <span className="eyebrow">Interpreted minutes</span>
          <span className="vx-kpi-value">{summary?.totalMinutes ?? 0} min</span>
        </article>
      </div>

      <section className="vx-ledger">
        <div className="vx-ledger-head">
          <h2>Breakdown by language pair &amp; modality</h2>
        </div>
        {pairsList.length === 0 && modalityList.length === 0 ? (
          <div className="vx-ledger-row">
            <span className="vx-ledger-cat">EMPTY</span>
            <div className="vx-ledger-title">
              <strong>No completed sessions yet</strong>
              <span>Close out an assignment to generate language-pair and modality totals.</span>
            </div>
            <span className="vx-ledger-val">—</span>
            <Link className="inline-link" to="/app/assignments">Open assignments</Link>
          </div>
        ) : (
          <>
            {pairsList.map(([pair, val]) => (
              <div key={pair} className="vx-ledger-row">
                <span className="vx-ledger-cat">PAIR</span>
                <div className="vx-ledger-title"><strong>{pair}</strong></div>
                <span className="vx-ledger-val">{val.sessions} session(s)</span>
                <Badge tone="accent">{val.minutes} min</Badge>
              </div>
            ))}
            {modalityList.map(([mod, val]) => (
              <div key={mod} className="vx-ledger-row">
                <span className="vx-ledger-cat">MODALITY</span>
                <div className="vx-ledger-title"><strong>{mod}</strong></div>
                <span className="vx-ledger-val">{val.sessions} session(s)</span>
                <Badge tone="neutral">{val.minutes} min</Badge>
              </div>
            ))}
          </>
        )}
      </section>
    </AppShell>
  );
}

export function RecordsAssistantPage() {
  const { user, session } = useAuth();
  const { tr } = useLocale();
  const [question, setQuestion] = useState('');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<string>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user && !session?.access_token) {
      setEvents([{ type: 'error', message: 'Use the Work Assistant button in the sidebar or sign in first.' }]);
      return;
    }
    setEvents([]);
    await streamAssistantQuestion(
      { question, token: session?.access_token },
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

export function OpsDashboardPage() {
  const { session } = useAuth();
  const [counts, setCounts] = useState({ assignments: 0, ready: 0, billing: 0, tickets: 0, checks: 0 });

  useEffect(() => {
    let active = true;
    const headers = buildHeaders(session?.access_token);
    Promise.all([
      fetch('/api/assignments', { headers, credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/ops?resource=billing', { headers, credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/support', { headers, credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/ops?resource=device_check', { headers, credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([a, b, s, d]) => {
        if (!active) return;
        const list: AssignmentItem[] = a?.data || [];
        setCounts({
          assignments: list.length,
          ready: list.filter((x) => x.status === 'ready').length,
          billing: (b?.records || []).length,
          tickets: (s?.tickets || []).length,
          checks: (d?.data || []).length,
        });
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
          <span className="eyebrow">OPS DASHBOARD</span>
          <h1>Live operational queues</h1>
        </div>
      </div>
      <div className="vx-kpi-grid vx-kpi-grid--4">
        <article className="vx-kpi-card vx-kpi-card--terracotta is-live-beam">
          <span className="vox-border-beam-glow" aria-hidden="true" />
          <span className="vox-border-beam" aria-hidden="true" />
          <span className="eyebrow">Assignments</span>
          <span className="vx-kpi-value">{counts.assignments}</span>
          <span className="vx-kpi-sub">{counts.ready} ready</span>
          <Link className="inline-link" to="/app/assignments">Open assignments</Link>
        </article>
        <article className="vx-kpi-card vx-kpi-card--forest">
          <span className="vox-border-beam-glow" aria-hidden="true" />
          <span className="vox-border-beam" aria-hidden="true" />
          <span className="eyebrow">Device checks</span>
          <span className="vx-kpi-value">{counts.checks}</span>
          <span className="vx-kpi-sub">Audio &amp; network RTT</span>
          <Link className="inline-link" to="/app/device-check">Run device check</Link>
        </article>
        <article className="vx-kpi-card vx-kpi-card--gold">
          <span className="vox-border-beam-glow" aria-hidden="true" />
          <span className="vox-border-beam" aria-hidden="true" />
          <span className="eyebrow">Billing records</span>
          <span className="vx-kpi-value">{counts.billing}</span>
          <span className="vx-kpi-sub">Logged entries</span>
          <Link className="inline-link" to="/app/billing">Open billing</Link>
        </article>
        <article className="vx-kpi-card vx-kpi-card--sage">
          <span className="vox-border-beam-glow" aria-hidden="true" />
          <span className="vox-border-beam" aria-hidden="true" />
          <span className="eyebrow">Support queue</span>
          <span className="vx-kpi-value">{counts.tickets}</span>
          <span className="vx-kpi-sub">Human coordinator</span>
          <Link className="inline-link" to="/app/support">Open support</Link>
        </article>
      </div>
    </AppShell>
  );
}

export function AvailabilityPage() {
  const { session, user } = useAuth();
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [kind, setKind] = useState<'unavailable' | 'custom'>('unavailable');
  const [windowLabel, setWindowLabel] = useState('09:00–13:00');
  const [overrides, setOverrides] = useState<Array<{ id: string; date: string; kind: string; window_label: string }>>([]);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadAvailability = useCallback(async () => {
    const res = await fetch('/api/ops?resource=availability', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    });
    if (res.ok) {
      const json = await res.json();
      setOverrides(json.data || []);
    }
  }, [session?.access_token]);

  useEffect(() => {
    let active = true;
    fetch('/api/ops?resource=availability', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.data) setOverrides(json.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  async function saveOverride(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (!user && !session?.access_token) {
      setNotice({ kind: 'error', text: 'Sign in first to save availability overrides.' });
      return;
    }
    const res = await fetch('/api/ops?resource=availability', {
      method: 'POST',
      headers: buildHeaders(session?.access_token, true),
      credentials: 'same-origin',
      body: JSON.stringify({ date, kind, window_label: kind === 'custom' ? windowLabel : '' }),
    });
    if (res.ok) {
      setNotice({ kind: 'success', text: `Saved override for ${date}.` });
      await loadAvailability();
    } else {
      const err = await res.json().catch(() => ({}));
      setNotice({ kind: 'error', text: err.error || 'Unable to save override.' });
    }
  }

  async function removeOverride(id: string) {
    await fetch(`/api/ops?resource=availability&id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    });
    await loadAvailability();
  }

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">AVAILABILITY</span>
          <h1>Date overrides &amp; capacity windows</h1>
        </div>
      </div>

      <div className="workspace-grid">
        <form className="panel-form" onSubmit={(e) => void saveOverride(e)}>
          <Field label="Date" htmlFor="avail-date">
            <Input id="avail-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Window type" htmlFor="avail-kind">
            <Select
              id="avail-kind"
              value={kind}
              onValueChange={(v) => setKind(v === 'custom' ? 'custom' : 'unavailable')}
              options={[
                { value: 'unavailable', label: 'Unavailable all day' },
                { value: 'custom', label: 'Custom hours window' },
              ]}
            />
          </Field>
          {kind === 'custom' && (
            <Field label="Hours window" htmlFor="avail-win">
              <Input id="avail-win" value={windowLabel} onChange={(e) => setWindowLabel(e.target.value)} placeholder="09:00–13:00" />
            </Field>
          )}
          <Button type="submit">Save availability override</Button>
          {notice && (
            <p className={notice.kind === 'error' ? 'form-error' : 'form-success'} role="status">
              {notice.text}
            </p>
          )}
        </form>

        <div>
          {overrides.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={20} />}
              title="No date overrides saved"
              description="Add unavailable dates or custom capacity windows on the left."
            />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {overrides.map((o) => (
                <article key={o.id} className="subpage-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="mono-ltr">{o.date}</strong>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Badge tone={o.kind === 'custom' ? 'accent' : 'warning'}>{o.kind}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => void removeOverride(o.id)} aria-label={`Delete ${o.date}`}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  {o.window_label && <p className="mono-ltr">{o.window_label}</p>}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export function QualityPage() {
  const { session, user } = useAuth();
  const [indicators, setIndicators] = useState<
    Array<{ key: string; label?: string; numerator: number; denominator: number; ratio?: number | null }>
  >([]);

  useEffect(() => {
    let active = true;
    fetch('/api/ops?resource=quality', {
      headers: buildHeaders(session?.access_token),
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!active || !json?.indicators) return;
        const raw = json.indicators;
        if (Array.isArray(raw)) {
          setIndicators(raw);
        } else {
          setIndicators(
            Object.entries(raw).map(([key, val]) => ({
              key,
              ...(val as { numerator: number; denominator: number; ratio?: number | null }),
            }))
          );
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  const defaultMetrics = [
    { key: 'device_checks_passed', title: 'Device check pass rate', link: '/app/device-check', cta: 'Run device check' },
    { key: 'sessions_without_tech_exception', title: 'Sessions without tech exception', link: '/app/assignments', cta: 'Review sessions' },
    { key: 'on_time_starts', title: 'On-time session starts', link: '/app/assignments', cta: 'Open schedule' },
    { key: 'documentation_completed', title: 'Close-out documentation complete', link: '/app/reports', cta: 'View reports' },
  ];

  const indicatorMap = new Map(indicators.map((i) => [i.key, i]));
  const cards = indicators.length > 0
    ? indicators.map((i) => ({
        key: i.key,
        title: i.label || i.key.replace(/_/g, ' '),
        numerator: i.numerator,
        denominator: i.denominator,
        link: i.key.includes('device') ? '/app/device-check' : '/app/assignments',
        cta: i.key.includes('device') ? 'Run device check' : 'Open schedule',
      }))
    : defaultMetrics.map((m) => {
        const found = indicatorMap.get(m.key);
        return {
          ...m,
          numerator: found?.numerator ?? 0,
          denominator: found?.denominator ?? 0,
        };
      });

  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">QUALITY MONITORING</span>
          <h1>Operational readiness indicators</h1>
        </div>
        <Link className="button-secondary" to="/app/device-check">
          Run device check
        </Link>
      </div>

      {!user && (
        <div className="vx-guest-banner">
          <div>
            <span className="eyebrow" style={{ color: '#96b5aa' }}>LIVE METRICS</span>
            <h2>Sign in to compute personal quality ratios</h2>
            <p>Every ratio is calculated directly from your persisted assignments and audio readiness checks.</p>
          </div>
          <Link className="button-primary" to="/login?mode=signup&returnTo=/app/quality">
            Sign in / Create account
          </Link>
        </div>
      )}

      <div className="vx-kpi-grid">
        {cards.map((ind, idx) => {
          const pct = ind.denominator > 0 ? Math.round((ind.numerator / ind.denominator) * 100) : 0;
          const accentClass = ['vx-kpi-card--terracotta', 'vx-kpi-card--forest', 'vx-kpi-card--gold', 'vx-kpi-card--sage'][idx % 4];
          return (
            <article key={ind.key} className={`vx-kpi-card ${accentClass}`}>
              <span className="eyebrow">{ind.title}</span>
              <span className="vx-kpi-value">
                {ind.denominator > 0 ? `${pct}%` : '0 / 0'}
              </span>
              <div className="meter-track" aria-label={ind.title}>
                <div className="meter-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="mono-ltr" style={{ fontSize: 12, color: 'var(--vr-ink-2)' }}>
                {ind.numerator} of {ind.denominator} recorded
              </span>
              <Link className="inline-link" to={ind.link}>
                {ind.cta}
              </Link>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}

export function OrganizationPage() {
  const { user } = useAuth();
  return (
    <AppShell>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">ORGANIZATION</span>
          <h1>Governance, T0–T3 policy &amp; audit</h1>
        </div>
        <Link className="button-primary" to="/app/admin">
          Open access review queue
        </Link>
      </div>
      <div className="workspace-grid">
        <article className="subpage-card">
          <h2>Active operator</h2>
          <p>{user ? user.email : 'Sign in to inspect organization access'}</p>
        </article>
        <article className="subpage-card">
          <h2>T0–T3 Policy lock</h2>
          <p>T0 deterministic utilities enabled; T1/T2 opt-in only; T3 decisions locked to humans.</p>
        </article>
      </div>
    </AppShell>
  );
}

export function OnboardingPage() {
  return <SettingsPage />;
}
