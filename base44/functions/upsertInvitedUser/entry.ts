import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Creates or updates a User record for an invited email using the service role,
// so invited users appear immediately in Settings Users and Roles (custom auth
// otherwise only creates a pending invitation until the user logs in).
// Admin-gated: only admins may provision users.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (caller.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { email, base_role, permissions, role } = await req.json();
    if (!email) return Response.json({ error: 'email is required' }, { status: 400 });

    const existing = await base44.asServiceRole.entities.User.filter({ email });
    let user;
    if (existing && existing[0]) {
      user = await base44.asServiceRole.entities.User.update(existing[0].id, {
        role,
        base_role,
        permissions,
      });
    } else {
      const fullName = String(email).split('@')[0];
      user = await base44.asServiceRole.entities.User.create({
        email,
        full_name: fullName,
        role,
        base_role,
        permissions,
      });
    }

    return Response.json({ user });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});