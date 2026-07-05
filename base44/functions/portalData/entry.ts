import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Authenticated buyer-portal data endpoint. Returns everything the portal needs,
// strictly scoped to a single buyer_id. Uses the service role to read Lead
// (which is admin-RLS) but never returns another buyer's data.
//
// Scoping rules:
// - A buyer-role user is scoped to their own user.linked_buyer_id.
// - An operator (admin) may pass ?buyer_id= to PREVIEW a buyer's portal.
//   Non-admin callers cannot override their linked buyer.

async function resolveBuyerScope(base44: any, user: any, requestedBuyerId: string | null) {
  const isOperator = user.role === 'admin';
  if (isOperator && requestedBuyerId) return requestedBuyerId;
  if (user.linked_buyer_id) return user.linked_buyer_id;
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const requestedBuyerId = body.buyer_id || null;
    const buyerId = await resolveBuyerScope(base44, user, requestedBuyerId);
    if (!buyerId) return Response.json({ error: 'No buyer linked to this account' }, { status: 403 });

    const buyer = await base44.asServiceRole.entities.Buyer.get(buyerId).catch(() => null);
    if (!buyer) return Response.json({ error: 'Buyer not found' }, { status: 404 });
    if (!buyer.portal_enabled && user.role !== 'admin') {
      return Response.json({ error: 'Portal is not enabled for this buyer' }, { status: 403 });
    }

    // Only leads delivered to this buyer.
    const leads = await base44.asServiceRole.entities.Lead.filter({ buyer_id: buyerId }, '-created_date', 2000);
    const feedback = await base44.asServiceRole.entities.BuyerFeedback.filter({ buyer_id: buyerId }, '-created_date', 2000);
    const returns = await base44.asServiceRole.entities.ReturnRequest.filter({ buyer_id: buyerId }, '-created_date', 2000);

    // Trim lead payloads to portal-safe fields (never expose raw payloads / traces).
    const safeLeads = leads.map((l: any) => ({
      id: l.id,
      lead_id: l.lead_id,
      first_name: l.first_name,
      last_name: l.last_name,
      mobile: l.mobile,
      email: l.email,
      final_status: l.final_status,
      revenue: l.revenue,
      cost: l.cost,
      buyer_feedback: l.buyer_feedback,
      created_date: l.created_date,
    }));

    return Response.json({
      buyer: {
        id: buyer.id,
        company_name: buyer.company_name,
        email: buyer.email,
        portal_enabled: buyer.portal_enabled,
      },
      leads: safeLeads,
      feedback,
      returns,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});