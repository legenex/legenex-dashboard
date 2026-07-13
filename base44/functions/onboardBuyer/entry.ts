import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Operator-only buyer onboarding orchestrator (/functions/onboardBuyer).
//
// Drives a BuyerOnboarding record through an ordered list of steps. This build
// implements only the local steps that touch no external system (validate,
// create_buyer, allocate_code, schedule_intro_email). The external steps
// (Xero, Stripe, deposit invoice, LeadByte, disposition scope, onboarding
// email, GHL/CRM contact) are seeded into the steps array as pending so the
// record shape is stable, and are inserted in order in a later build.
//
// The buyer is always created in draft and is never made active here.

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

// The full ordered list of step keys. This shape is fixed now so later builds
// can drop in the external steps without reshaping the record.
const STEP_ORDER = [
  'validate',
  'create_buyer',
  'allocate_code',
  'xero_contact',
  'stripe_customer',
  'deposit_invoice',
  'xero_invoice',
  'payment_link',
  'leadbyte_buyer',
  'dispo_scope',
  'onboarding_email',
  'crm_contact',
  'schedule_intro_email',
];

// Steps implemented in this build. Everything else stays pending.
const IMPLEMENTED_STEPS = new Set(['validate', 'create_buyer', 'allocate_code', 'schedule_intro_email']);

const APP_TIMEZONE = 'America/Regina';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim());
}

// Build a fresh steps array with every key present. Merge in any existing
// records by key so completed steps and their metadata survive a resume.
function buildSteps(existing: any[]): any[] {
  const byKey: Record<string, any> = {};
  for (const s of (Array.isArray(existing) ? existing : [])) {
    if (s && s.key) byKey[s.key] = s;
  }
  return STEP_ORDER.map((key) => {
    const prior = byKey[key];
    return {
      key,
      status: prior?.status || 'pending',
      attempts: Number(prior?.attempts) || 0,
      error: prior?.error ?? null,
      external_id: prior?.external_id ?? null,
      completed_at: prior?.completed_at ?? null,
    };
  });
}

function getStep(steps: any[], key: string): any {
  return steps.find((s) => s.key === key);
}

// Resolve the current wall-clock time in the app timezone as separate parts, so
// scheduling logic can reason about local hour and weekday without pulling in a
// date library.
function localParts(now: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[map.weekday] ?? 0,
    hour: Number(map.hour === '24' ? '0' : map.hour) || 0,
    minute: Number(map.minute) || 0,
  };
}

// Return the UTC offset (in minutes) for the app timezone at a given instant.
// Used to convert a desired local wall-clock time into a UTC ISO string.
function tzOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === '24' ? '0' : map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return (asUTC - at.getTime()) / 60000;
}

// Build a UTC ISO string for a local wall-clock time on a specific local date.
// daysAhead is measured against the current local date.
function localWallClockToUtcIso(baseNow: Date, daysAhead: number, localHour: number, localMinute: number): string {
  // Establish the current local Y/M/D.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = dtf.formatToParts(baseNow);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const y = Number(map.year);
  const m = Number(map.month);
  const d = Number(map.day) + daysAhead;
  // Treat the desired local time as if it were UTC, then correct by the
  // timezone offset at that instant.
  const naiveUtc = Date.UTC(y, m - 1, d, localHour, localMinute, 0);
  const offset = tzOffsetMinutes(new Date(naiveUtc));
  return new Date(naiveUtc - offset * 60000).toISOString();
}

// Resolve the intro email send time per the exact rules:
// - if local time is after 8am and before 3pm, schedule one hour from now;
// - otherwise if today is before Friday, schedule 10am the next local day;
// - otherwise schedule 10am on the coming Monday.
function resolveIntroEmailTime(now: Date): string {
  const { weekday, hour } = localParts(now);
  if (hour >= 8 && hour < 15) {
    return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }
  // weekday: 0 Sun .. 5 Fri .. 6 Sat. "Before Friday" means Mon-Thu (1..4)
  // and also Sunday (0), which is before the coming Friday.
  if (weekday >= 1 && weekday <= 4) {
    return localWallClockToUtcIso(now, 1, 10, 0);
  }
  // Friday (5), Saturday (6) or Sunday (0): schedule 10am the coming Monday.
  let daysUntilMonday: number;
  if (weekday === 5) daysUntilMonday = 3;      // Fri -> Mon
  else if (weekday === 6) daysUntilMonday = 2; // Sat -> Mon
  else daysUntilMonday = 1;                     // Sun -> Mon
  return localWallClockToUtcIso(now, daysUntilMonday, 10, 0);
}

// Promote the operational fields from the raw form payload onto a Buyer create.
// Only defined values are copied so we never clobber schema defaults with null.
function buildBuyerFromPayload(payload: any, companyName: string): Record<string, any> {
  const out: Record<string, any> = {
    company_name: companyName,
    status: 'draft',
  };
  const copyString = (dest: string, src: string) => {
    const v = str(payload[src]);
    if (v) out[dest] = v;
  };
  const copyNumber = (dest: string, src: string) => {
    if (payload[src] !== undefined && payload[src] !== null && payload[src] !== '') {
      const n = Number(payload[src]);
      if (!Number.isNaN(n)) out[dest] = n;
    }
  };

  copyString('client_type', 'client_type');
  copyString('vertical', 'vertical');
  copyString('billing_type', 'billing_type');
  copyNumber('ipl_fee_pct', 'ipl_fee_pct');

  // CPL related fields land on the buyer as plain fields. No BuyerStateCpl rows
  // are created here.
  copyNumber('credit_limit', 'credit_limit');
  copyString('billing_model', 'billing_model');
  copyString('billing_email', 'billing_email');

  copyString('delivery_method', 'delivery_method');
  copyString('api_docs_url', 'api_docs_url');
  copyString('api_docs_file_url', 'api_docs_file_url');
  copyString('buyer_api_key', 'buyer_api_key');
  copyString('unique_identifier', 'unique_identifier');
  copyString('qualification_criteria', 'qualification_criteria');

  // JSON-array style fields: store the raw string if a value is present.
  const copyJson = (dest: string, src: string) => {
    if (payload[src] !== undefined && payload[src] !== null && payload[src] !== '') {
      out[dest] = typeof payload[src] === 'string' ? payload[src] : JSON.stringify(payload[src]);
    }
  };
  copyJson('lead_notification_emails', 'lead_notification_emails');
  copyJson('disposition_method', 'disposition_method');

  // TCPA fields.
  copyString('tcpa_inbound_phone', 'tcpa_inbound_phone');
  copyJson('tcpa_outbound_phones', 'tcpa_outbound_phones');
  copyString('tcpa_inbound_email', 'tcpa_inbound_email');
  copyString('tcpa_outbound_email', 'tcpa_outbound_email');
  copyString('tcpa_reply_to_email', 'tcpa_reply_to_email');

  // Secondary contact.
  copyString('secondary_contact_name', 'secondary_contact_name');
  copyString('secondary_contact_email', 'secondary_contact_email');
  copyString('secondary_contact_phone', 'secondary_contact_phone');
  copyString('secondary_contact_role', 'secondary_contact_role');

  // Billing / accounts.
  copyString('billing_address', 'billing_address');
  copyString('accounts_contact_name', 'accounts_contact_name');
  copyString('accounts_email', 'accounts_email');
  copyNumber('initial_batch_size', 'initial_batch_size');
  copyString('taxpayer_form_url', 'taxpayer_form_url');

  // Primary contact from the intake maps onto the buyer's own contact fields.
  const primaryEmail = str(payload.primary_contact_email);
  if (primaryEmail && !out.email) out.email = primaryEmail;
  const primaryPhone = str(payload.primary_contact_phone);
  if (primaryPhone && !out.phone) out.phone = primaryPhone;

  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Operator authorization guard, copied from operationsData exactly. ──
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const record = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
    const caller = record || user;

    if (caller.base_role === 'supplier' || caller.base_role === 'buyer') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (caller.linked_buyer_id || caller.linked_supplier_id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let permissions: Record<string, any> = {};
    try {
      permissions = typeof caller.permissions === 'string'
        ? JSON.parse(caller.permissions || '{}')
        : (caller.permissions || {});
    } catch { permissions = {}; }
    const hasOperatorPermission = OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
    if (!hasOperatorPermission && caller.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Arguments ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const onboardingId = str(body.onboarding_id);
    const fromStep = str(body.from_step) || null;
    if (!onboardingId) {
      return Response.json({ error: 'onboarding_id is required.' }, { status: 400 });
    }
    if (fromStep && !STEP_ORDER.includes(fromStep)) {
      return Response.json({ error: `Unknown from_step: ${fromStep}` }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    const onboarding = await svc.entities.BuyerOnboarding.get(onboardingId).catch(() => null);
    if (!onboarding) {
      return Response.json({ error: 'BuyerOnboarding record not found.' }, { status: 404 });
    }

    let payload: any = {};
    try {
      payload = typeof onboarding.form_payload === 'string'
        ? JSON.parse(onboarding.form_payload || '{}')
        : (onboarding.form_payload || {});
    } catch { payload = {}; }

    let existingSteps: any[] = [];
    try {
      existingSteps = typeof onboarding.steps === 'string'
        ? JSON.parse(onboarding.steps || '[]')
        : (onboarding.steps || []);
    } catch { existingSteps = []; }

    const steps = buildSteps(existingSteps);
    let buyerId = onboarding.buyer_id || null;
    let introEmailTime = onboarding.intro_email_scheduled_for || null;

    // Persist the current steps array (and optional extra patch) to the record.
    const persist = async (patch: Record<string, any> = {}) => {
      await svc.entities.BuyerOnboarding.update(onboardingId, {
        steps: JSON.stringify(steps),
        ...patch,
      });
    };

    // Mark onboarding in_progress at the start (never regress to submitted).
    await persist({ status: 'in_progress', current_step: null });

    // The index to resume from. from_step overrides; otherwise start at 0 and
    // rely on per-step completion checks to skip finished work.
    const startIndex = fromStep ? STEP_ORDER.indexOf(fromStep) : 0;

    // Run one step. Returns true to continue, false to stop (blocked).
    const runStep = async (key: string): Promise<boolean> => {
      const step = getStep(steps, key);

      // Not implemented in this build: leave pending, do not run, do not block.
      if (!IMPLEMENTED_STEPS.has(key)) {
        return true;
      }

      // Idempotent: skip anything already complete.
      if (step.status === 'complete') {
        return true;
      }

      await persist({ current_step: key });
      step.attempts = (Number(step.attempts) || 0) + 1;

      try {
        if (key === 'validate') {
          const status = onboarding.status;
          if (status === 'cancelled' || status === 'complete') {
            throw new Error(`Cannot onboard a ${status} record.`);
          }
          const errs: string[] = [];
          if (!str(payload.company_name)) errs.push('company_name');
          if (!str(payload.primary_contact_name)) errs.push('primary contact name');
          const email = str(payload.primary_contact_email);
          if (!email) errs.push('email');
          else if (!EMAIL_RE.test(email)) errs.push('a valid email');
          if (!str(payload.primary_contact_phone)) errs.push('phone');
          const rawStates = Array.isArray(payload.target_states) ? payload.target_states : [];
          if (rawStates.filter((s: unknown) => str(s)).length === 0) errs.push('at least one target state');
          if (!str(payload.client_type)) errs.push('client_type');
          if (payload.cpl === undefined || payload.cpl === null || payload.cpl === '' || Number.isNaN(Number(payload.cpl))) {
            errs.push('cpl');
          }
          if (!str(payload.billing_type)) errs.push('billing_type');
          if (errs.length > 0) {
            throw new Error(`Submission is missing required fields: ${errs.join(', ')}.`);
          }
        } else if (key === 'create_buyer') {
          if (!buyerId) {
            const companyName = str(payload.company_name) || onboarding.company_name;
            const buyerData = buildBuyerFromPayload(payload, companyName);
            const created = await svc.entities.Buyer.create(buyerData);
            buyerId = created.id;
            step.external_id = created.id;
            await persist({ buyer_id: buyerId });
          } else {
            step.external_id = buyerId;
          }
        } else if (key === 'allocate_code') {
          const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
          if (!buyer) throw new Error('Buyer record not found for code allocation.');
          if (buyer.buyer_code) {
            // Already allocated: never allocate twice.
            step.external_id = buyer.buyer_code;
          } else {
            const result = await base44.asServiceRole.functions.invoke('allocateBuyerCode', {
              client_type: buyer.client_type,
            });
            const data = result?.data !== undefined ? result.data : result;
            const code = data?.buyer_code;
            if (!code) {
              throw new Error(data?.error || 'allocateBuyerCode did not return a code.');
            }
            await svc.entities.Buyer.update(buyerId, { buyer_code: code, leadbyte_bid: code });
            step.external_id = code;
          }
        } else if (key === 'schedule_intro_email') {
          introEmailTime = resolveIntroEmailTime(new Date());
          await persist({ intro_email_scheduled_for: introEmailTime });
          step.external_id = introEmailTime;
        }

        step.status = 'complete';
        step.error = null;
        step.completed_at = new Date().toISOString();
        await persist();
        return true;
      } catch (stepErr) {
        step.status = 'failed';
        step.error = (stepErr as Error).message;
        await persist({ status: 'blocked', current_step: key });
        return false;
      }
    };

    // Execute steps in order from the resume point. schedule_intro_email depends
    // only on the clock, so it runs even though the external steps before it are
    // still pending.
    for (let i = startIndex; i < STEP_ORDER.length; i++) {
      const ok = await runStep(STEP_ORDER[i]);
      if (!ok) {
        return Response.json({
          onboarding_id: onboardingId,
          status: 'blocked',
          steps,
          intro_email_scheduled_for: introEmailTime,
        }, { status: 200 });
      }
    }

    // Do NOT set status to complete: external steps remain pending. Leave the
    // record in_progress and clear the current_step marker.
    await persist({ current_step: null });

    return Response.json({
      onboarding_id: onboardingId,
      status: 'in_progress',
      steps,
      intro_email_scheduled_for: introEmailTime,
    }, { status: 200 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});