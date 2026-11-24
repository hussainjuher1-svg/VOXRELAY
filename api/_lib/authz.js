// VOXRELAY authorization matrix and privacy serializers.
// Default deny. Cross-organization records answer with 404, not 403.

export const ROLES = Object.freeze(['owner', 'admin', 'coordinator', 'interpreter']);

export const CAPABILITIES = Object.freeze({
  'org.view': ['owner', 'admin', 'coordinator', 'interpreter'],
  'org.rename': ['owner'],
  'org.members.manage': ['owner', 'admin'],
  'org.policy.save': ['owner', 'admin'],
  'org.audit.view': ['owner', 'admin'],
  'org.offers.create': ['owner', 'admin', 'coordinator'],
  'org.support.manage': ['owner', 'admin', 'coordinator'],
  'org.terms.write': ['owner', 'admin', 'coordinator'],
  'org.terms.approve': ['owner', 'admin'],
  'org.terms.read': ['owner', 'admin', 'coordinator', 'interpreter'],
  'ops.org.view': ['owner', 'admin', 'coordinator'],
  'ops.quality.view': ['owner', 'admin'],
});

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function can(role, capability) {
  if (!ROLES.includes(role)) return false;
  const allowed = CAPABILITIES[capability];
  return Array.isArray(allowed) ? allowed.includes(role) : false;
}

export function requireCapability(ctx, capability) {
  if (!ctx?.membership || !can(ctx.membership.role, capability)) {
    throw new HttpError(403, 'You do not have permission for this action.');
  }
}

export function isAdminActor(actorOrCtx) {
  if (!actorOrCtx) return false;
  const appRole = actorOrCtx.appRole || actorOrCtx.user?.app_metadata?.role || actorOrCtx.user?.role;
  if (appRole === 'platform_admin' || appRole === 'org_admin') return true;
  const orgRole = actorOrCtx.membership?.role;
  return Boolean(orgRole && ['owner', 'admin'].includes(orgRole));
}

export function serializeAssignment(row, viewerUserId) {
  if (!row) return null;
  if (row.owner_id === viewerUserId) return { ...row };
  const copy = { ...row };
  delete copy.personal_note;
  delete copy.checklist;
  return copy;
}

export function canReadDoc(doc, ctx) {
  if (!doc || !ctx?.userId) return false;
  if (doc.author_id === ctx.userId) return true;
  if (!doc.org_id || !ctx.membership || ctx.membership.org_id !== doc.org_id) return false;
  if (doc.status === 'draft') return false;
  return ['owner', 'admin', 'coordinator'].includes(ctx.membership.role);
}

export function canReviewDoc(doc, ctx) {
  if (!doc || !ctx?.userId) return false;
  if (doc.author_id === ctx.userId) return false; // reviewer can never approve their own documentation
  if (!doc.org_id || !ctx.membership || ctx.membership.org_id !== doc.org_id) return false;
  if (doc.status !== 'submitted') return false;
  return ['owner', 'admin'].includes(ctx.membership.role);
}

export function followupInitialStatus(orgId) {
  return orgId ? 'proposed' : 'in_progress';
}

export function followupTransition(currentStatus, nextStatus, ctx, followup) {
  if (!ctx?.userId || !followup) return false;
  const isProposer = followup.proposer_id === ctx.userId;
  const isAssignee = followup.assignee_id === ctx.userId;
  const sameOrg = Boolean(followup.org_id && ctx.membership?.org_id === followup.org_id);
  const isStaff = sameOrg && ['owner', 'admin', 'coordinator'].includes(ctx.membership.role);

  if (!followup.org_id) {
    if (!isProposer && !isAssignee) return false;
    return ['in_progress', 'completed', 'cancelled'].includes(nextStatus);
  }

  if (currentStatus === 'proposed' && nextStatus === 'approved') return isStaff;
  if (currentStatus === 'approved' && nextStatus === 'assigned') return isStaff;
  if (currentStatus === 'assigned' && nextStatus === 'in_progress') return isStaff || isAssignee;
  if (['assigned', 'in_progress'].includes(currentStatus) && nextStatus === 'completed') {
    return isStaff || isAssignee;
  }
  if (nextStatus === 'cancelled') return isStaff || (isProposer && currentStatus === 'proposed');
  return false;
}
