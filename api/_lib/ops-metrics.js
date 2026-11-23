// Operational quality indicators and billing calculation helpers.
// Pure functions: no conversation content is ever accepted or scored.

export function computeBillableMinutes(actualMinutes, rules = {}) {
  const raw = Math.max(0, Math.round(Number(actualMinutes) || 0));
  if (raw === 0) return 0;
  const minimum = Math.max(0, Math.round(Number(rules?.minimum_minutes) || 0));
  const increment = Math.max(1, Math.round(Number(rules?.round_to_minutes) || 1));
  const floored = Math.max(raw, minimum);
  return Math.ceil(floored / increment) * increment;
}

export function computeBillingAmountCents(actualMinutes, rateCents, rules = {}) {
  const billableMinutes = computeBillableMinutes(actualMinutes, rules);
  const rate = Math.max(0, Math.round(Number(rateCents) || 0));
  return {
    minutes: billableMinutes,
    amount_cents: Math.round((billableMinutes / 60) * rate),
  };
}

export function computeQualityIndicators({
  assignments = [],
  assignmentEvents = [],
  deviceChecks = [],
  sessionDocs = [],
  followups = [],
} = {}) {
  const completed = assignments.filter((a) => a.status === 'completed');
  const docByAssignment = new Map(sessionDocs.map((d) => [d.assignment_id, d]));
  const eventsByAssignment = new Map();
  for (const ev of assignmentEvents) {
    const arr = eventsByAssignment.get(ev.assignment_id) || [];
    arr.push(ev);
    eventsByAssignment.set(ev.assignment_id, arr);
  }

  // 1. Completed sessions with a passing device check
  const withDevicePass = completed.filter((a) =>
    deviceChecks.some(
      (dc) =>
        dc.result === 'pass' &&
        (dc.assignment_id === a.id ||
          (a.start_at &&
            new Date(dc.created_at).getTime() <= new Date(a.start_at).getTime() &&
            new Date(a.start_at).getTime() - new Date(dc.created_at).getTime() <= 86_400_000))
    )
  );

  // 2. Completed sessions started on time (<= 5 min grace)
  const onTime = completed.filter((a) => {
    if (!a.start_at || !a.started_at) return false;
    return new Date(a.started_at).getTime() - new Date(a.start_at).getTime() <= 5 * 60_000;
  });

  // 3. Completed sessions without a technical exception
  const noTechException = completed.filter((a) => a.exception_category !== 'technical_issue');

  // 4. Completed sessions with submitted or approved documentation
  const documented = completed.filter((a) => {
    const doc = docByAssignment.get(a.id);
    return doc && (doc.status === 'submitted' || doc.status === 'approved');
  });

  // 5. Completed sessions closed out within 24 hours of session end
  const timelyCloseout = completed.filter((a) => {
    const evs = eventsByAssignment.get(a.id) || [];
    const closeEv = evs.find((e) => e.type === 'closed_out');
    if (!a.ended_at || !closeEv) return false;
    return new Date(closeEv.created_at).getTime() - new Date(a.ended_at).getTime() <= 86_400_000;
  });

  // 6. Follow-ups resolved on or before due date
  const dueFollowups = followups.filter((f) => f.due_date);
  const completedFollowups = dueFollowups.filter((f) => f.status === 'completed');

  return [
    {
      key: 'device_check_coverage',
      numerator: withDevicePass.length,
      denominator: completed.length,
      missedRefs: completed.filter((a) => !withDevicePass.includes(a)).map((a) => a.ref),
    },
    {
      key: 'on_time_starts',
      numerator: onTime.length,
      denominator: completed.length,
      missedRefs: completed.filter((a) => !onTime.includes(a)).map((a) => a.ref),
    },
    {
      key: 'no_technical_exceptions',
      numerator: noTechException.length,
      denominator: completed.length,
      missedRefs: completed.filter((a) => !noTechException.includes(a)).map((a) => a.ref),
    },
    {
      key: 'documentation_submitted',
      numerator: documented.length,
      denominator: completed.length,
      missedRefs: completed.filter((a) => !documented.includes(a)).map((a) => a.ref),
    },
    {
      key: 'timely_closeout',
      numerator: timelyCloseout.length,
      denominator: completed.length,
      missedRefs: completed.filter((a) => !timelyCloseout.includes(a)).map((a) => a.ref),
    },
    {
      key: 'followups_completed',
      numerator: completedFollowups.length,
      denominator: dueFollowups.length,
      missedRefs: dueFollowups.filter((f) => f.status !== 'completed').map((f) => f.id),
    },
  ];
}

export function summarizeReports(assignments = []) {
  const completed = assignments.filter((a) => a.status === 'completed');
  const byPair = {};
  const byModality = {};
  let totalMinutes = 0;

  for (const a of completed) {
    const mins =
      a.started_at && a.ended_at
        ? Math.max(1, Math.round((new Date(a.ended_at).getTime() - new Date(a.started_at).getTime()) / 60_000))
        : Number(a.duration_minutes) || 0;
    totalMinutes += mins;

    const pair = a.language_pair || 'unspecified';
    byPair[pair] = byPair[pair] || { sessions: 0, minutes: 0 };
    byPair[pair].sessions += 1;
    byPair[pair].minutes += mins;

    const modality = a.modality || 'unspecified';
    byModality[modality] = byModality[modality] || { sessions: 0, minutes: 0 };
    byModality[modality].sessions += 1;
    byModality[modality].minutes += mins;
  }

  return {
    sessions: completed.length,
    totalMinutes,
    byPair,
    byModality,
  };
}
