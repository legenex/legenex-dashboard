// GENERATED FILE - DO NOT EDIT BY HAND.
// Source of truth: src/lib/distribution/backend-entry.js and its imports.
// Regenerate: node scripts/generate-backend-engine.mjs
// canonical-engine-sha256: de251facd931486d4befcb9643df408be2a1a41b54acaf921b02446b19cdb52b
// src/lib/distribution/engine.js
var REASON = {
  ELIGIBLE: "ELIGIBLE",
  BUYER_LIFECYCLE_INELIGIBLE: "BUYER_LIFECYCLE_INELIGIBLE",
  MEMBER_INACTIVE: "MEMBER_INACTIVE",
  OUTSIDE_SCHEDULE: "OUTSIDE_SCHEDULE",
  FILTER_STATE: "FILTER_STATE",
  FILTER_ZIP: "FILTER_ZIP",
  FILTER_COUNTY: "FILTER_COUNTY",
  FILTER_VERTICAL: "FILTER_VERTICAL",
  FILTER_BRAND: "FILTER_BRAND",
  FILTER_SUPPLIER: "FILTER_SUPPLIER",
  FILTER_SOURCE: "FILTER_SOURCE",
  QUALIFICATION_FAILED: "QUALIFICATION_FAILED",
  SUPPRESSED: "SUPPRESSED",
  CAP_TOTAL: "CAP_TOTAL",
  CAP_HOURLY: "CAP_HOURLY",
  CAP_DAILY: "CAP_DAILY",
  CAP_WEEKLY: "CAP_WEEKLY",
  CAP_MONTHLY: "CAP_MONTHLY",
  LOW_BALANCE: "LOW_BALANCE",
  OVER_CREDIT_LIMIT: "OVER_CREDIT_LIMIT",
  DESTINATION_UNHEALTHY: "DESTINATION_UNHEALTHY",
  BELOW_RESERVE: "BELOW_RESERVE",
  NO_ELIGIBLE_MEMBER: "NO_ELIGIBLE_MEMBER"
};
var TRUSTEDFORM_RE = /^https?:\/\/cert\.trustedform\.com\/[0-9a-fA-F]{40}(\?.*)?$/;
function isValidTrustedForm(url) {
  return typeof url === "string" && TRUSTEDFORM_RE.test(url.trim());
}
function missingRequiredFields(data, required) {
  const d = data || {};
  return (required || []).filter((f) => {
    const v = d[f];
    return v === void 0 || v === null || String(v).trim() === "";
  });
}
function passesListFilter(filterList, value) {
  if (!Array.isArray(filterList) || filterList.length === 0) return true;
  const v = String(value ?? "").trim().toLowerCase();
  return filterList.some((f) => String(f).trim().toLowerCase() === v);
}
var CAP_WINDOWS = [
  ["total", REASON.CAP_TOTAL],
  ["hourly", REASON.CAP_HOURLY],
  ["daily", REASON.CAP_DAILY],
  ["weekly", REASON.CAP_WEEKLY],
  ["monthly", REASON.CAP_MONTHLY]
];
function exhaustedCap(caps) {
  const c = caps || {};
  for (const [key, reason] of CAP_WINDOWS) {
    const w = c[key];
    if (w && w.limit != null && Number(w.count || 0) + 1 > Number(w.limit)) {
      return reason;
    }
  }
  return null;
}
function evaluateMember(member, lead, opts = {}) {
  const m = member || {};
  const l = lead || {};
  const buyer = m.buyer || {};
  if (m.active === false) return fail(REASON.MEMBER_INACTIVE);
  const status = String(buyer.status || "").toLowerCase();
  const lifecycleOk = status === "active" && buyer.active === true;
  if (!lifecycleOk) return fail(REASON.BUYER_LIFECYCLE_INELIGIBLE);
  if (m.withinSchedule === false) return fail(REASON.OUTSIDE_SCHEDULE);
  const f = m.filters || {};
  if (!passesListFilter(f.states, l.state)) return fail(REASON.FILTER_STATE);
  if (!passesListFilter(f.zips, l.zip)) return fail(REASON.FILTER_ZIP);
  if (!passesListFilter(f.counties, l.county)) return fail(REASON.FILTER_COUNTY);
  if (!passesListFilter(f.verticals, l.vertical)) return fail(REASON.FILTER_VERTICAL);
  if (!passesListFilter(f.brands, l.brand)) return fail(REASON.FILTER_BRAND);
  if (!passesListFilter(f.suppliers, l.supplier)) return fail(REASON.FILTER_SUPPLIER);
  if (!passesListFilter(f.sources, l.source)) return fail(REASON.FILTER_SOURCE);
  if (m.conditions && typeof opts.evalConditions === "function") {
    if (!opts.evalConditions(m.conditions, l)) return fail(REASON.QUALIFICATION_FAILED);
  }
  if (Array.isArray(m.suppression) && matchesSuppression(m.suppression, l)) {
    return fail(REASON.SUPPRESSED);
  }
  const cap = exhaustedCap(m.caps);
  if (cap) return fail(cap);
  const price = resolvePrice(m);
  const wallet = m.wallet;
  if (wallet) {
    if (wallet.mode === "prepaid" && Number(wallet.balance || 0) < price) {
      return fail(REASON.LOW_BALANCE);
    }
    if (wallet.mode === "postpaid") {
      const projected = Number(wallet.outstanding || 0) + price;
      if (wallet.creditLimit != null && projected > Number(wallet.creditLimit)) {
        return fail(REASON.OVER_CREDIT_LIMIT);
      }
    }
  }
  if (m.health && m.health.state === "open") return fail(REASON.DESTINATION_UNHEALTHY);
  if (opts.enforceReserve && m.reservePrice != null && price < Number(m.reservePrice)) {
    return fail(REASON.BELOW_RESERVE);
  }
  return { eligible: true, reason: REASON.ELIGIBLE };
}
function fail(reason) {
  return { eligible: false, reason };
}
function matchesSuppression(list, lead) {
  const email = String(lead.email || "").trim().toLowerCase();
  const phone = String(lead.mobile || lead.phone || "").replace(/\D/g, "");
  return list.some((s) => {
    const v = String(s || "").trim().toLowerCase();
    return email && v === email || phone && v.replace(/\D/g, "") === phone;
  });
}
function resolvePrice(member) {
  const m = member || {};
  if (m.priceMode === "auction" && m.bid != null) return Number(m.bid);
  if (m.price != null) return Number(m.price);
  if (m.fixedPrice != null) return Number(m.fixedPrice);
  return 0;
}
function selectPriority(members) {
  if (!members.length) return null;
  return [...members].sort(
    (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || String(a.id).localeCompare(String(b.id))
  )[0];
}
function selectWeighted(members, seed) {
  if (!members.length) return null;
  const weights = members.map((m) => Math.max(0, Number(m.weight ?? 1)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return selectPriority(members);
  const r = hashToUnit(String(seed || "")) * total;
  let acc = 0;
  for (let i = 0; i < members.length; i++) {
    acc += weights[i];
    if (r < acc) return members[i];
  }
  return members[members.length - 1];
}
function selectRoundRobin(members, cursor) {
  if (!members.length) return { member: null, nextCursor: cursor || 0 };
  const ordered = [...members].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const idx = ((Number(cursor) || 0) % ordered.length + ordered.length) % ordered.length;
  return { member: ordered[idx], nextCursor: (idx + 1) % ordered.length };
}
function selectAuction(members) {
  if (!members.length) return null;
  return [...members].sort(
    (a, b) => resolvePrice(b) - resolvePrice(a) || (a.priority ?? Infinity) - (b.priority ?? Infinity) || String(a.id).localeCompare(String(b.id))
  )[0];
}
function selectHybrid(members, weights = {}) {
  if (!members.length) return null;
  const priceW = weights.price ?? 0.5;
  const prioW = weights.priority ?? 0.5;
  const prices = members.map(resolvePrice);
  const maxPrice = Math.max(1, ...prices);
  const priorities = members.map((m) => m.priority ?? 1);
  const maxPrio = Math.max(1, ...priorities);
  const scored = members.map((m, i) => ({
    m,
    // higher price is better; lower priority number is better -> invert priority
    score: priceW * (prices[i] / maxPrice) + prioW * (1 - (priorities[i] - 1) / maxPrio)
  }));
  scored.sort((a, b) => b.score - a.score || String(a.m.id).localeCompare(String(b.m.id)));
  return scored[0].m;
}
function routeWaterfall(groups, lead, ctx = {}) {
  const trace = [];
  const orderedGroups = [...groups || []].sort(
    (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
  );
  const rrOut = {};
  for (const group of orderedGroups) {
    if (group.active === false) continue;
    const evaluated = (group.members || []).map((m) => {
      const res = evaluateMember(m, lead, {
        enforceReserve: group.method === "auction",
        evalConditions: ctx.evalConditions
      });
      return { memberId: m.id, eligible: res.eligible, reason: res.reason, price: resolvePrice(m) };
    });
    trace.push({ groupId: group.id, method: group.method, candidates: evaluated });
    const eligible = (group.members || []).filter(
      (m) => evaluated.find((e) => e.memberId === m.id)?.eligible
    );
    if (!eligible.length) continue;
    let winner = null;
    switch (group.method) {
      case "weighted":
        winner = selectWeighted(eligible, ctx.idempotencyKey);
        break;
      case "round_robin": {
        const rr = selectRoundRobin(eligible, (ctx.rrCursors || {})[group.id]);
        winner = rr.member;
        rrOut[group.id] = rr.nextCursor;
        break;
      }
      case "auction":
        winner = selectAuction(eligible);
        break;
      case "hybrid":
        winner = selectHybrid(eligible, group.weights);
        break;
      case "priority":
      default:
        winner = selectPriority(eligible);
    }
    if (winner) {
      return {
        winner,
        groupId: group.id,
        method: group.method,
        price: resolvePrice(winner),
        fallthroughPath: orderedGroups.slice(0, orderedGroups.indexOf(group)).map((g) => g.id),
        rrCursors: rrOut,
        trace
      };
    }
  }
  return { winner: null, reason: REASON.NO_ELIGIBLE_MEMBER, rrCursors: rrOut, trace };
}
function capWindowStart(nowMs, window, tzOffsetMinutes = 0) {
  const local = new Date(nowMs + tzOffsetMinutes * 6e4);
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth();
  const d = local.getUTCDate();
  let startLocalMs;
  switch (window) {
    case "hourly":
      startLocalMs = Date.UTC(y, mo, d, local.getUTCHours());
      break;
    case "weekly": {
      const dow = local.getUTCDay();
      startLocalMs = Date.UTC(y, mo, d) - dow * 864e5;
      break;
    }
    case "monthly":
      startLocalMs = Date.UTC(y, mo, 1);
      break;
    case "daily":
    default:
      startLocalMs = Date.UTC(y, mo, d);
  }
  return new Date(startLocalMs - tzOffsetMinutes * 6e4).toISOString();
}
async function idempotencyKey({ supplierKeyId, dedupFields = {}, campaignId = "" }) {
  const keys = Object.keys(dedupFields).sort();
  const stable = keys.map((k) => `${k}=${String(dedupFields[k]).trim().toLowerCase()}`).join("&");
  const material = `${supplierKeyId || ""}:${stable}:${campaignId}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var DEFAULT_SECRET_KEYS = [
  "authorization",
  "api_key",
  "apikey",
  "x-api-key",
  "password",
  "secret",
  "token",
  "bearer",
  "stripe",
  "card",
  "cvv",
  "ssn"
];
function redact(obj, secretKeys = DEFAULT_SECRET_KEYS) {
  const keys = secretKeys.map((k) => k.toLowerCase());
  const seen = /* @__PURE__ */ new WeakSet();
  const walk = (v) => {
    if (v == null || typeof v !== "object") return v;
    if (seen.has(v)) return "[circular]";
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = keys.some((s) => k.toLowerCase().includes(s)) ? "[redacted]" : walk(val);
    }
    return out;
  };
  return walk(obj);
}
function hashToUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1e6 / 1e6;
}

// src/lib/distribution/conditions.js
var OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "matches",
  "exists",
  "not_exists",
  "within_months"
];
function asNumber(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : NaN;
}
function asString(v) {
  return String(v ?? "").trim().toLowerCase();
}
function asList(v) {
  if (Array.isArray(v)) return v.map(asString);
  return asString(v).split(",").map((s) => s.trim()).filter(Boolean);
}
function asDateMs(v) {
  if (v == null || v === "") return NaN;
  const t = Date.parse(v);
  return Number.isNaN(t) ? NaN : t;
}
function evalLeaf(leaf, data, ctx = {}) {
  const raw = (data || {})[leaf.field];
  const val = leaf.value;
  switch (leaf.operator) {
    case "exists":
      return raw !== void 0 && raw !== null && String(raw).trim() !== "";
    case "not_exists":
      return raw === void 0 || raw === null || String(raw).trim() === "";
    case "equals":
      return asString(raw) === asString(val);
    case "not_equals":
      return asString(raw) !== asString(val);
    case "contains":
      return asString(raw).includes(asString(val));
    case "not_contains":
      return !asString(raw).includes(asString(val));
    case "in":
      return asList(val).includes(asString(raw));
    case "not_in":
      return !asList(val).includes(asString(raw));
    case "gt":
      return asNumber(raw) > asNumber(val);
    case "gte":
      return asNumber(raw) >= asNumber(val);
    case "lt":
      return asNumber(raw) < asNumber(val);
    case "lte":
      return asNumber(raw) <= asNumber(val);
    case "between": {
      const [lo, hi] = Array.isArray(val) ? val : asList(val);
      const n = asNumber(raw);
      return n >= asNumber(lo) && n <= asNumber(hi);
    }
    case "matches": {
      try {
        return new RegExp(String(val), "i").test(String(raw ?? ""));
      } catch {
        return false;
      }
    }
    case "within_months": {
      const t = asDateMs(raw);
      if (Number.isNaN(t) || ctx.nowMs == null) return false;
      const months = asNumber(val);
      const cutoff = ctx.nowMs - months * 30 * 864e5;
      return t >= cutoff && t <= ctx.nowMs;
    }
    default:
      return false;
  }
}
function evalConditionTree(node, data, ctx = {}) {
  if (!node) return true;
  if (Array.isArray(node)) return node.every((c) => evalConditionTree(c, data, ctx));
  if (node.op === "and") return (node.children || []).every((c) => evalConditionTree(c, data, ctx));
  if (node.op === "or") return (node.children || []).some((c) => evalConditionTree(c, data, ctx));
  if (node.field && node.operator) return evalLeaf(node, data, ctx);
  return true;
}

// src/lib/distribution/schedule.js
var DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function wallClock(nowMs, timeZone = "UTC") {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = dtf.formatToParts(new Date(nowMs));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const dow = DOW[get("weekday")] ?? 0;
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(get("minute"), 10);
  return { dow, minutes: hour * 60 + minute };
}
function toMinutes(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
function isWithinSchedule(nowMs, schedule, fallbackTz) {
  if (!schedule || !Array.isArray(schedule.windows) || schedule.windows.length === 0) return true;
  const tz = schedule.timezone || fallbackTz || "UTC";
  const { dow, minutes } = wallClock(nowMs, tz);
  return schedule.windows.some((w) => {
    const days = Array.isArray(w.days) ? w.days : null;
    if (days && !days.includes(dow)) return false;
    const start = toMinutes(w.start ?? "00:00");
    const end = toMinutes(w.end ?? "24:00");
    if (end <= start) return minutes >= start || minutes < end;
    return minutes >= start && minutes < end;
  });
}

// src/lib/distribution/snapshot.js
var KNOWN_OPS = new Set(OPERATORS);
function strictJson(raw, onError) {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    onError();
    return null;
  }
}
function validConditionTree(node) {
  if (!node) return true;
  if (Array.isArray(node)) return node.every(validConditionTree);
  if (node.op === "and" || node.op === "or") return (node.children || []).every(validConditionTree);
  if (node.field && node.operator) return KNOWN_OPS.has(node.operator);
  return false;
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function buildCaps(capsCfg, memberId, capCountsFor, onError) {
  if (capsCfg == null || capsCfg === "") return {};
  const parsed = strictJson(capsCfg, onError);
  if (parsed === null) return null;
  const out = {};
  for (const w of ["total", "hourly", "daily", "weekly", "monthly"]) {
    if (parsed[w] == null) continue;
    const limit = num(typeof parsed[w] === "object" ? parsed[w].limit : parsed[w]);
    if (limit == null || limit < 0) {
      onError();
      return null;
    }
    out[w] = { limit, count: Number(capCountsFor(memberId, w) || 0) };
  }
  return out;
}
function buildWallet(buyer) {
  if (!buyer) return null;
  const mode = String(buyer.billing_type || buyer.billing_mode || "").toLowerCase().startsWith("prepay") ? "prepaid" : String(buyer.billing_type || "").toLowerCase().startsWith("invoice") ? "postpaid" : null;
  if (!mode) return null;
  if (mode === "prepaid") {
    return { mode, balance: num(buyer.prepay_balance ?? buyer.balance) ?? 0, minBalance: num(buyer.min_balance) ?? 0 };
  }
  return { mode, outstanding: num(buyer.outstanding) ?? 0, creditLimit: num(buyer.credit_limit) };
}
function buildRoutingSnapshot(records, ctx = {}) {
  const { campaignId, configVersionId } = ctx;
  const capCountsFor = ctx.capCountsFor || (() => 0);
  const buyersById = indexBy(records.buyers, "id");
  const destById = indexBy(records.destinations, "id");
  const healthByDest = indexBy(records.health, "destination_id");
  const configErrors = [];
  const groups = (records.groups || []).filter((g) => g.active === true && String(g.lifecycle || "").toLowerCase() === "active" && String(g.campaign_id) === String(campaignId) && (!configVersionId || String(g.config_version_id || "") === String(configVersionId))).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map((g) => ({
    id: g.id,
    orderIndex: g.order_index || 0,
    method: g.method || "priority",
    weights: { price: num(g.price_weight) ?? 0.5, priority: num(g.priority_weight) ?? 0.5 },
    members: (records.members || []).filter((m) => String(m.route_group_id) === String(g.id)).sort((a, b) => (a.priority || 0) - (b.priority || 0)).map((m) => buildMember(m, { buyersById, destById, healthByDest, capCountsFor, configErrors, nowMs: ctx.nowMs }))
  }));
  return { groups, configVersionId: configVersionId || null, configErrors, configHash: hashConfig(records) };
}
function buildMember(m, { buyersById, destById, healthByDest, capCountsFor, configErrors, nowMs }) {
  let invalid = false;
  const err = (code, detail) => {
    invalid = true;
    configErrors.push({ member_id: m.id, code: code || "CONFIG_INVALID", detail });
  };
  const buyer = buyersById[m.buyer_id];
  if (!buyer) err("CONFIG_INVALID", "missing buyer");
  if (!destById[m.destination_id]) err("CONFIG_INVALID", "missing destination");
  const filters = strictJson(m.filters, () => err("CONFIG_INVALID", "bad filters json"));
  const conditions = strictJson(m.conditions, () => err("CONFIG_INVALID", "bad conditions json"));
  const hasConditions = conditions && typeof conditions === "object" && Object.keys(conditions).length > 0;
  if (hasConditions && !validConditionTree(conditions)) err("CONFIG_INVALID", "unknown condition operator");
  const schedule = strictJson(m.schedule, () => err("CONFIG_INVALID", "bad schedule json"));
  const caps = buildCaps(m.caps, m.id, capCountsFor, () => err("CONFIG_INVALID", "bad caps"));
  const priceMode = ["fixed", "rule", "auction"].includes(m.price_mode) ? m.price_mode : "fixed";
  const fixedPrice = num(m.fixed_price);
  const reservePrice = num(m.reserve_price);
  if (priceMode === "fixed" && (fixedPrice == null || fixedPrice < 0)) err("CONFIG_INVALID", "invalid price");
  const buyerSnap = buyer ? { active: buyer.active, status: buyer.status } : { active: false, status: "missing" };
  return {
    id: m.id,
    buyerId: m.buyer_id,
    destinationId: m.destination_id,
    // PB-017: invalid config makes the member ineligible, never unrestricted.
    active: m.active !== false && !invalid,
    _configInvalid: invalid,
    priority: num(m.priority) ?? 1,
    weight: num(m.weight) ?? 1,
    reservePrice,
    priceMode,
    fixedPrice: fixedPrice ?? 0,
    price: fixedPrice ?? 0,
    filters: invalid ? {} : filters || {},
    conditions: invalid ? null : hasConditions ? conditions : null,
    schedule: schedule || null,
    // Pre-resolve the schedule to the boolean the engine reads. Absent schedule
    // means always-on. nowMs must be supplied for correct dayparting.
    withinSchedule: schedule && Object.keys(schedule).length ? isWithinSchedule(nowMs ?? 0, schedule) : void 0,
    caps: caps || {},
    buyer: buyerSnap,
    wallet: buildWallet(buyer),
    health: { state: healthByDest[m.destination_id]?.state || "closed" }
  };
}
function indexBy(arr, key) {
  const out = {};
  for (const r of arr || []) out[String(r[key])] = r;
  return out;
}
function hashConfig(records) {
  const material = JSON.stringify({
    g: (records.groups || []).map((g) => [g.id, g.method, g.order_index, g.lifecycle, g.active]),
    m: (records.members || []).map((m) => [m.id, m.route_group_id, m.buyer_id, m.destination_id, m.priority, m.filters, m.caps])
  });
  let h = 2166136261;
  for (let i = 0; i < material.length; i++) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// src/lib/distribution/pingpost.js
var BID_REASON = {
  ELIGIBLE: "ELIGIBLE",
  BID_EXPIRED: "BID_EXPIRED",
  BELOW_RESERVE: "BELOW_RESERVE",
  NO_BID: "NO_BID",
  NO_ELIGIBLE_BID: "NO_ELIGIBLE_BID"
};
function rankBids(bids, opts = {}) {
  const nowMs = opts.nowMs;
  const reserve = opts.reservePrice != null ? Number(opts.reservePrice) : null;
  const evaluated = (bids || []).map((b) => {
    const amount = Number(b.amount);
    let reason = BID_REASON.ELIGIBLE;
    if (!(amount > 0)) reason = BID_REASON.NO_BID;
    else if (b.expiresAtMs != null && nowMs != null && b.expiresAtMs < nowMs) reason = BID_REASON.BID_EXPIRED;
    else if (reserve != null && amount < reserve) reason = BID_REASON.BELOW_RESERVE;
    return { ...b, amount, reason };
  });
  const eligible = evaluated.filter((b) => b.reason === BID_REASON.ELIGIBLE);
  eligible.sort((a, b) => b.amount - a.amount || String(a.id).localeCompare(String(b.id)));
  return {
    winner: eligible[0] || null,
    winnerReason: eligible.length ? BID_REASON.ELIGIBLE : BID_REASON.NO_ELIGIBLE_BID,
    ranked: eligible,
    excluded: evaluated.filter((b) => b.reason !== BID_REASON.ELIGIBLE).map((b) => ({ id: b.id, reason: b.reason }))
  };
}

// src/lib/distribution/deliveryAttempt.js
var ATTEMPT_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  DUPLICATE: "duplicate",
  QUEUED: "queued",
  ERROR: "error",
  DEAD_LETTER: "dead_letter"
};
var TERMINAL = /* @__PURE__ */ new Set([
  ATTEMPT_STATUS.ACCEPTED,
  ATTEMPT_STATUS.REJECTED,
  ATTEMPT_STATUS.DUPLICATE,
  ATTEMPT_STATUS.DEAD_LETTER
]);
function computeBackoffMs(attemptNumber, opts = {}) {
  const base = opts.baseMs ?? 1e3;
  const factor = opts.factor ?? 2;
  const max = opts.maxMs ?? 60 * 60 * 1e3;
  const n = Math.max(1, attemptNumber);
  return Math.min(max, base * Math.pow(factor, n - 1));
}
function nextRetryAtIso(nowMs, attemptNumber, opts = {}) {
  return new Date(nowMs + computeBackoffMs(attemptNumber, opts)).toISOString();
}
function shouldRetry(status, attemptNumber, maxAttempts = 5) {
  if (TERMINAL.has(status)) return false;
  if (status === ATTEMPT_STATUS.ACCEPTED) return false;
  const retryable = status === ATTEMPT_STATUS.ERROR || status === ATTEMPT_STATUS.QUEUED;
  return retryable && attemptNumber < maxAttempts;
}
function classifyResponse({ httpStatus, body, error, mapping = {} } = {}) {
  if (error) return ATTEMPT_STATUS.ERROR;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const test = (re) => {
    try {
      return re && new RegExp(re, "i").test(text);
    } catch {
      return false;
    }
  };
  if (mapping.duplicate && test(mapping.duplicate)) return ATTEMPT_STATUS.DUPLICATE;
  if (mapping.reject && test(mapping.reject)) return ATTEMPT_STATUS.REJECTED;
  if (mapping.queue && test(mapping.queue)) return ATTEMPT_STATUS.QUEUED;
  if (mapping.accept && test(mapping.accept)) return ATTEMPT_STATUS.ACCEPTED;
  if (httpStatus == null) return ATTEMPT_STATUS.ERROR;
  if (httpStatus >= 200 && httpStatus < 300) return ATTEMPT_STATUS.ACCEPTED;
  if (httpStatus === 409) return ATTEMPT_STATUS.DUPLICATE;
  if (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) return ATTEMPT_STATUS.ERROR;
  if (httpStatus >= 400) return ATTEMPT_STATUS.REJECTED;
  return ATTEMPT_STATUS.ERROR;
}
function buildAttemptRecord({
  leadId,
  destinationId,
  trigger,
  attemptNumber = 1,
  idempotencyKey: idempotencyKey2,
  isPrimary = false,
  status,
  request = {},
  response = {},
  httpStatus = null,
  latencyMs = null,
  errorClass = null,
  nowMs = 0,
  retryOpts = {}
}) {
  const willRetry = shouldRetry(status, attemptNumber, retryOpts.maxAttempts ?? 5);
  const finalStatus = !willRetry && (status === ATTEMPT_STATUS.ERROR || status === ATTEMPT_STATUS.QUEUED) && attemptNumber >= (retryOpts.maxAttempts ?? 5) ? ATTEMPT_STATUS.DEAD_LETTER : status;
  return {
    lead_id: leadId,
    destination_id: destinationId,
    trigger: trigger ?? null,
    attempt_number: attemptNumber,
    idempotency_key: idempotencyKey2 ?? null,
    is_primary: !!isPrimary,
    status: finalStatus,
    request_meta: JSON.stringify(redact(minimizeRequest(request))),
    response_meta: JSON.stringify(minimizeResponse(response)),
    http_status: httpStatus,
    latency_ms: latencyMs,
    error_class: errorClass,
    next_retry_at: willRetry ? nextRetryAtIso(nowMs, attemptNumber, retryOpts) : null,
    completed_at: new Date(nowMs).toISOString()
  };
}
function minimizeRequest(req) {
  return { method: req.method, url: req.url, headers: req.headers, body_present: req.body != null };
}
function minimizeResponse(res) {
  const text = typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? {});
  return { status: res.status ?? null, body_excerpt: text.slice(0, 500) };
}
export {
  ATTEMPT_STATUS,
  BID_REASON,
  OPERATORS,
  REASON,
  buildAttemptRecord,
  buildRoutingSnapshot,
  capWindowStart,
  classifyResponse,
  computeBackoffMs,
  evalConditionTree,
  evalLeaf,
  evaluateMember,
  exhaustedCap,
  idempotencyKey,
  isValidTrustedForm,
  isWithinSchedule,
  missingRequiredFields,
  nextRetryAtIso,
  rankBids,
  redact,
  resolvePrice,
  routeWaterfall,
  selectAuction,
  selectHybrid,
  selectPriority,
  selectRoundRobin,
  selectWeighted,
  shouldRetry,
  wallClock
};
