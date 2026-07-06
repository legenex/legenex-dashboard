import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const out = {};

    // 1) Does the service-role User entity return pending invitees when asked?
    try {
      const withPending = await base44.asServiceRole.entities.User.filter({}, '-created_date', 100);
      out.serviceRoleUsers = { len: withPending.length, sample: withPending.map(u => ({ email: u.email, role: u.role, is_verified: u.is_verified, disabled: u.disabled })) };
    } catch (e) { out.serviceRoleErr = e.message; }

    // 2) Try passing include_pending through the entity list (some SDKs forward extra params)
    try {
      const r = await base44.asServiceRole.entities.User.filter({ include_pending: true }, '-created_date', 100);
      out.includePending = { len: r.length };
    } catch (e) { out.includePendingErr = e.message; }

    return Response.json(out);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});