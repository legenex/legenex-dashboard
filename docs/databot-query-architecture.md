# DataBot query architecture

Verified 30 July 2026 against live records. Applies to `base44/functions/dataBot/entry.ts`.

## Why it was rewritten

The previous version pre-computed every dimension against every period (six windows, five dimensions each, thirteen econ fields per entry, plus a thirty day series, directories, ad spend arrays and a sample of rows), stringified the lot, and put it in one prompt. That payload ran past 100k characters. The model was doing needle-in-a-haystack retrieval over it and hedged with "the data does not specify" even when the number was present.

Successive attempts to fix this with prompt wording all failed, because it was never a wording problem. One of those attempts added a filter that dropped past conversations containing the phrase "data does not specify", which suppressed the evidence of the failure rather than the failure. That filter is gone.

## The pipeline

1. **Plan.** A `gpt-4o-mini` call at temperature 0 sees only the entity directory and the list of valid options. It returns a structured spec: `intent`, `entity_refs`, `group_by`, `period`, `start_date`, `end_date`, `top_n`, `needs_finance`. No lead data is in this prompt.
2. **Execute.** The spec runs deterministically in TypeScript. The model never counts anything. Output is a small result object, typically well under 4k characters.
3. **Narrate.** A second call sees the question and the result object and writes the answer.

If the planner fails or returns nonsense, it falls back to `intent=aggregate, period=all_time, group_by=none`, which still produces a usable answer.

## Entity resolution

Every supplier and buyer is registered in an alias index under all of its identifiers: supplier `name` and `sid`, buyer `company_name`, `name`, `buyer_code` and record `id`. Lookup normalizes case and strips non-alphanumerics.

Two paths feed resolution, and results are deduplicated:

- whatever the planner extracted into `entity_refs`
- a direct scan of the question text

The direct scan matches on word boundaries. This matters: the supplier "Inbounds" must not resolve from the phrase "inbound leads". Verified in both directions.

When an entity resolves, its figures are returned for all seven standard windows at once (today, yesterday, last 7 days, last 30 days, this month, last month, all time), so a follow-up about a different period needs no second round trip.

When a named entity does not resolve, the result carries `unresolved_refs` plus the directory, and the model is instructed to say so and offer the closest names rather than guess.

## Field shape facts (learned the hard way)

These were wrong in the first draft of the rewrite and would have failed silently in production.

**`Lead.buyer_id` holds the buyer CODE, not a Base44 record id.** Live values are `AG1`, `NW2`, `LF3`, `LFWC5`. The join key is `Buyer.buyer_code`. Any code joining `Lead.buyer_id` to `Buyer.id` will match nothing and degrade quietly.

**`Lead.buyer_name` is a real populated column** and is a valid fallback. The mapped_fields bag also carries `buyer_name` and `buyer_id`. The retired version read `bag.buyer` as both the name and the id, which is why buyer questions were unreliable.

**Sids carry suffixes.** `INBNDS-SURVEY` belongs to supplier `INBNDS` (Inbounds). Supplier resolution therefore does a longest-prefix match on sid, sorted longest first so a short code cannot steal a longer one.

**`Lead.supplier_name` is not always a supplier.** Two live rows carry `supplier_name: "Master"` with `sid: "INBNDS-SURVEY"`. Resolution checks the name against known suppliers first and falls through to the sid when it does not match.

**`ssid` is not a Supplier column.** It appears only in the mapped_fields bag, for example `MVA-AR`.

## Day bucketing

`eventDayKey` mirrors `leadEventInstant` in `src/lib/reportMetrics.js` exactly. DataBot and the Leads page must never disagree about which day a lead lands on.

- Only ISO-shaped timestamps are honoured, matching `^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}`.
- US-format strings like `07/30/2026 05:26:44` are ignored on purpose and fall through to `created_date`. Most live leads are in this shape, so in practice most bucketing runs off `created_date`. This is the dashboard's behavior, not a defect introduced here.
- A naive ISO timestamp is a wall clock in `America/Regina`, not UTC. The dashboard uses `fromZonedTime`; the Deno function cannot import date-fns-tz, so it pins the literal `-06:00` offset. Regina is UTC-6 year round with no DST, so this is exact.
- `created_date` is stored without a zone suffix and is a UTC value, so `Z` is appended when missing.

Consequence worth remembering: a lead created at 02:50 UTC on the 30th buckets to the 29th in Regina.

## Periods

Available windows: `today`, `yesterday`, `this_week`, `last_week`, `last_7_days`, `last_30_days`, `this_month`, `last_month`, `all_time`, `custom`.

`this_week` is the calendar week running Sunday through today, the US convention. `last_week` is the previous full Sunday to Saturday. `last_7_days` is a rolling seven day window ending today. These are deliberately different and must not be aliased to each other. An earlier patch aliased "this week" onto `last_7_days`, which returned a number that was correct for a window the user had not asked about.

Every resolved entity also carries a `requested_period` block echoing the exact window that was asked about, with `resolved_to` naming it. This closes the gap between the user's wording and the key names in the result object, which is what caused the model to hedge even when it held the number.

## Counting rules

Unchanged and matching the dashboard. Archived leads are excluded, they are retired duplicates. CPL is cost per SOLD lead. Conversion is sold over total received. Ad spend is deduplicated to account level so campaign and ad rows are not double counted.

`lead_type` prefers an explicit `lead_type` in the bag and otherwise applies the sid rule: `LEADFLOW` and `LGNX` are Quiz, everything else is Affiliate.

## Scope

Operator scope gets the query pipeline. The supplier-scoped and buyer-scoped branches are deliberately untouched, because portal scoping is a protected surface. Partner accounts continue to receive only their own projection with the same deny-by-default scope note.

## Known limitation

Every message still pages the full non-archived Lead table, because the event day is derived from the mapped_fields bag and cannot be filtered server side. This is a table scan per question and it will eventually hit the function timeout.

The fix is an additive `event_day` column on Lead, written by `processLead` and backfilled. That touches a protected surface and needs explicit approval before anyone attempts it.
