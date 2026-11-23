// Readiness = checklist items done + 1 if a device check counts, out of items + 1.
// A device check counts when it passed and ran for that assignment or within
// 24 hours before the assignment start time.

const DAY_MS = 24 * 60 * 60 * 1000;

export function deviceCheckCounts(check, assignmentId, startAt) {
  if (!check || check.result === 'fail') return false;
  if (assignmentId && check.assignment_id === assignmentId) return true;
  if (!startAt) return false;
  const start = new Date(startAt).getTime();
  const ran = new Date(check.created_at).getTime();
  if (Number.isNaN(start) || Number.isNaN(ran)) return false;
  return ran <= start && start - ran <= DAY_MS;
}

export function computeReadiness({
  checklist = [],
  deviceChecks = [],
  assignmentId = null,
  startAt = null,
} = {}) {
  const items = Array.isArray(checklist) ? checklist : [];
  const done = items.filter((i) => i && i.done === true).length;
  const counts = (Array.isArray(deviceChecks) ? deviceChecks : []).some((c) =>
    deviceCheckCounts(c, assignmentId, startAt)
  );
  const total = items.length + 1;
  const achieved = done + (counts ? 1 : 0);
  return {
    done: achieved,
    total,
    ready: achieved === total,
    checklistDone: done,
    checklistItems: items.length,
    deviceCheckCounts: counts,
  };
}
