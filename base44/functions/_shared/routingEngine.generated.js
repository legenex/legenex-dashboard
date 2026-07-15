// GENERATED FILE - DO NOT EDIT BY HAND.
// Source of truth: src/lib/distribution/backend-entry.js and its imports.
// Regenerate: node scripts/generate-backend-engine.mjs
// canonical-engine-sha256: fa83fa0965b1db1f7a70933a842674cf715dfcd0208f42f73e70dfaeff89df65
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

// src/lib/distribution/snapshotLoader.js
var PAGE = 200;
var activeGroupCache = /* @__PURE__ */ new Map();
async function loadAllFiltered(entity, query, { sort = "created_date", maxPages = 25 } = {}) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await entity.filter(query, sort, PAGE, page * PAGE);
    if (!rows || !rows.length) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
async function hasActiveRouteGroup(db, campaignId, nowMs, ttlMs = 5e3) {
  const cached = activeGroupCache.get(campaignId);
  if (cached && cached.expires > nowMs) return cached.has;
  const rows = await db.entities.RouteGroup.filter({ campaign_id: campaignId, active: true, lifecycle: "active" }, "order_index", 1, 0);
  const has = !!(rows && rows.length);
  activeGroupCache.set(campaignId, { has, expires: nowMs + ttlMs });
  return has;
}
function _clearActiveGroupCache() {
  activeGroupCache.clear();
}
async function loadRoutingSnapshot(db, { campaignId, nowMs, configVersionId, capCountsFor }) {
  const groups = await loadAllFiltered(db.entities.RouteGroup, { campaign_id: campaignId, active: true, lifecycle: "active" }, { sort: "order_index" });
  const groupIds = groups.map((g) => g.id);
  let members = [];
  for (const gid of groupIds) {
    members = members.concat(await loadAllFiltered(db.entities.RouteMember, { route_group_id: gid }, { sort: "priority" }));
  }
  const buyerIds = [...new Set(members.map((m) => m.buyer_id).filter(Boolean))];
  const destIds = [...new Set(members.map((m) => m.destination_id).filter(Boolean))];
  const buyers = [];
  for (const id of buyerIds) {
    const r = await db.entities.Buyer.filter({ id });
    if (r && r[0]) buyers.push(r[0]);
  }
  const destinations = [];
  for (const id of destIds) {
    const r = await db.entities.LeadByteConnector.filter({ id });
    if (r && r[0]) destinations.push(r[0]);
  }
  const health = [];
  for (const id of destIds) {
    const r = await db.entities.DestinationHealth.filter({ destination_id: id });
    if (r && r[0]) health.push(r[0]);
  }
  return buildRoutingSnapshot(
    { groups, members, buyers, destinations, health },
    { campaignId, nowMs, configVersionId, capCountsFor: capCountsFor || (() => 0) }
  );
}

// src/lib/distribution/shadowHook.js
async function runShadow(db, ctx) {
  const { distributionMode, leadData, campaignId, idempotencyKey: idempotencyKey2 } = ctx;
  const clock = ctx.clock || (() => Date.now());
  const nowMs = ctx.nowMs ?? clock();
  if (distributionMode === "legacy_only" || !distributionMode) return { ran: false, reason: "legacy_only" };
  try {
    const hasGroups = await hasActiveRouteGroup(db, campaignId, nowMs);
    if (!hasGroups) {
      await db.entities.RouteDecisionTrace.create({
        lead_id: ctx.leadId,
        distribution_mode: distributionMode,
        result: "no_route_config",
        winner_member_id: "",
        evaluated_candidates: "[]",
        fallthrough_path: "[]",
        config_version: null,
        eval_latency_ms: 0,
        created_at: new Date(nowMs).toISOString()
      });
      return { ran: false, reason: "no_route_config" };
    }
    const t0 = clock();
    const snap = await loadRoutingSnapshot(db, { campaignId, nowMs, capCountsFor: ctx.capCountsFor });
    const decision = routeWaterfall(snap.groups, leadData || {}, {
      idempotencyKey: idempotencyKey2,
      evalConditions: (t, d) => evalConditionTree(t, d, { nowMs })
    });
    const latency = clock() - t0;
    await db.entities.RouteDecisionTrace.create({
      lead_id: ctx.leadId,
      idempotency_key: idempotencyKey2 || null,
      distribution_mode: distributionMode,
      evaluated_candidates: JSON.stringify(flattenTrace(decision.trace)),
      winner_member_id: decision.winner ? decision.winner.id : "",
      winning_group_id: decision.groupId || "",
      price: decision.winner ? decision.price : 0,
      fallthrough_path: JSON.stringify(decision.fallthroughPath || []),
      result: decision.winner ? "shadow_selected" : decision.reason || "no_eligible_member",
      config_version: snap.configHash || null,
      eval_latency_ms: latency,
      created_at: new Date(nowMs).toISOString()
    });
    return { ran: true, latencyMs: latency, winner: decision.winner ? decision.winner.id : null };
  } catch (err) {
    try {
      await db.entities.RouteDecisionTrace.create({
        lead_id: ctx.leadId,
        distribution_mode: distributionMode,
        result: "evaluation_error",
        winner_member_id: "",
        evaluated_candidates: "[]",
        fallthrough_path: "[]",
        error_message: String(err && err.message ? err.message : err).slice(0, 300),
        created_at: new Date(nowMs).toISOString()
      });
    } catch {
    }
    return { ran: false, reason: "evaluation_error", error: String(err && err.message ? err.message : err) };
  }
}
function flattenTrace(trace) {
  const out = [];
  for (const g of trace || []) for (const c of g.candidates || []) {
    out.push({ group_id: g.groupId, member_id: c.memberId, eligible: c.eligible, reason_code: c.reason, price: c.price });
  }
  return out;
}

// src/lib/distribution/capStore.js
function makeBase44CapStore(db) {
  async function ensureCounter(key) {
    let rows = await db.entities.CapCounter.filter({ scope_key: key });
    if (!rows.length) {
      await db.entities.CapCounter.create({ scope_key: key, count: 0 });
      rows = await db.entities.CapCounter.filter({ scope_key: key });
    }
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return rows[0];
  }
  async function incrementIfBelow(key, limit, maxRetry = 25) {
    for (let i = 0; i < maxRetry; i++) {
      const row = await ensureCounter(key);
      const value = Number(row.count || 0);
      if (value >= limit) return false;
      const res = await db.entities.CapCounter.updateMany(
        { id: row.id, count: value },
        { $set: { count: value + 1 } }
      );
      if (res && res.updated > 0) return true;
    }
    return false;
  }
  async function decrement(key) {
    for (let i = 0; i < 25; i++) {
      const row = await ensureCounter(key);
      const value = Number(row.count || 0);
      const next = Math.max(0, value - 1);
      const res = await db.entities.CapCounter.updateMany(
        { id: row.id, count: value },
        { $set: { count: next } }
      );
      if (res && res.updated > 0) return;
    }
  }
  async function getCount(key) {
    const row = await ensureCounter(key);
    return Number(row.count || 0);
  }
  async function claim(key) {
    return incrementIfBelow(`claim:${key}`, 1);
  }
  async function getReservation(idempotencyKey2, memberId) {
    const rows = await db.entities.CapReservation.filter({ idempotency_key: idempotencyKey2, route_member_id: memberId });
    return rows[0] || null;
  }
  async function awaitReservation(idempotencyKey2, memberId, tries = 20) {
    for (let i = 0; i < tries; i++) {
      const r = await getReservation(idempotencyKey2, memberId);
      if (r) return r;
      await new Promise((res) => setTimeout(res, 50));
    }
    return null;
  }
  async function putReservation(rec) {
    return db.entities.CapReservation.create(rec);
  }
  async function updateReservation(id, patch) {
    return db.entities.CapReservation.update(id, patch);
  }
  return { incrementIfBelow, decrement, getCount, claim, getReservation, awaitReservation, putReservation, updateReservation };
}

// src/lib/distribution/reservation.js
var RESERVE = {
  OK: "OK",
  ALREADY_RESERVED: "ALREADY_RESERVED",
  // idempotent replay / concurrent duplicate
  CAP_EXCEEDED: "CAP_EXCEEDED"
};
function claimKeyFor(idempotencyKey2, memberId) {
  return `resv:${idempotencyKey2}:${memberId}`;
}
async function reserve(store, { idempotencyKey: idempotencyKey2, leadId, memberId, price = 0, scopes = [] }) {
  const won = await store.claim(claimKeyFor(idempotencyKey2, memberId));
  if (!won) {
    const existing = await store.awaitReservation(idempotencyKey2, memberId);
    if (existing && existing.state === "failed") {
      return { ok: false, code: RESERVE.CAP_EXCEEDED, reservation: existing };
    }
    return { ok: true, code: RESERVE.ALREADY_RESERVED, reservation: existing };
  }
  const incremented = [];
  for (const scope of scopes) {
    if (scope.limit == null) continue;
    const ok = await store.incrementIfBelow(scope.key, Number(scope.limit));
    if (!ok) {
      for (const s of incremented) await store.decrement(s.key);
      const failed = await store.putReservation({
        idempotency_key: idempotencyKey2,
        lead_id: leadId,
        route_member_id: memberId,
        price: Number(price),
        scopes: [],
        state: "failed"
      });
      return { ok: false, code: RESERVE.CAP_EXCEEDED, scope: scope.key, reservation: failed };
    }
    incremented.push(scope);
  }
  const rec = await store.putReservation({
    idempotency_key: idempotencyKey2,
    lead_id: leadId,
    route_member_id: memberId,
    price: Number(price),
    scopes: incremented.map((s) => s.key),
    state: "reserved"
  });
  return { ok: true, code: RESERVE.OK, reservation: rec };
}
async function finalize(store, reservation) {
  if (!reservation || reservation.state === "finalized") return reservation;
  if (reservation.state !== "reserved") return reservation;
  await store.updateReservation(reservation.id, { state: "finalized" });
  return { ...reservation, state: "finalized" };
}
async function release(store, reservation) {
  if (!reservation || reservation.state !== "reserved") return reservation;
  for (const key of reservation.scopes || []) await store.decrement(key);
  await store.updateReservation(reservation.id, { state: "released" });
  return { ...reservation, state: "released" };
}

// src/lib/distribution/walletStore.js
function makeBase44WalletStore(db) {
  async function ensureWallet(buyerId) {
    let rows = await db.entities.BuyerWallet.filter({ buyer_id: buyerId });
    if (!rows.length) {
      await db.entities.BuyerWallet.create({ buyer_id: buyerId, balance: 0, version: 0 });
      rows = await db.entities.BuyerWallet.filter({ buyer_id: buyerId });
    }
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return rows[0];
  }
  async function claimTxn(key) {
    for (let i = 0; i < 25; i++) {
      let rows = await db.entities.CapCounter.filter({ scope_key: `walletclaim:${key}` });
      if (!rows.length) {
        await db.entities.CapCounter.create({ scope_key: `walletclaim:${key}`, count: 0 });
        rows = await db.entities.CapCounter.filter({ scope_key: `walletclaim:${key}` });
      }
      rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const row = rows[0];
      if (Number(row.count || 0) >= 1) return false;
      const res = await db.entities.CapCounter.updateMany({ id: row.id, count: 0 }, { $set: { count: 1 } });
      if (res && res.updated > 0) return true;
    }
    return false;
  }
  async function getBalance(buyerId) {
    const w = await ensureWallet(buyerId);
    return { balance: Number(w.balance || 0), version: Number(w.version || 0), _id: w.id };
  }
  async function casAdjustBalance(buyerId, expectedVersion, newBalance) {
    const w = await ensureWallet(buyerId);
    if (Number(w.version || 0) !== expectedVersion) return false;
    const res = await db.entities.BuyerWallet.updateMany(
      { id: w.id, version: expectedVersion },
      { $set: { balance: newBalance, version: expectedVersion + 1 } }
    );
    return !!(res && res.updated > 0);
  }
  async function appendTxn(txn) {
    return db.entities.WalletTransaction.create(txn);
  }
  async function getTxnByKey(key) {
    const rows = await db.entities.WalletTransaction.filter({ idempotency_key: key });
    return rows[0] || null;
  }
  async function awaitTxnByKey(key, tries = 20) {
    for (let i = 0; i < tries; i++) {
      const t = await getTxnByKey(key);
      if (t) return t;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }
  return { claimTxn, getBalance, casAdjustBalance, appendTxn, getTxnByKey, awaitTxnByKey };
}

// src/lib/distribution/walletLedger.js
var WALLET = { LOW_BALANCE: "LOW_BALANCE", OVER_CREDIT_LIMIT: "OVER_CREDIT_LIMIT" };
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
async function walletDebit(store, { buyerId, amount, idempotencyKey: idempotencyKey2, creditLimit = null, type = "debit", description = "" }) {
  const amt = Number(amount);
  const won = await store.claimTxn(idempotencyKey2);
  if (!won) {
    const existing = await store.awaitTxnByKey(idempotencyKey2);
    return { applied: false, duplicate: true, txn: existing, balanceAfter: existing?.balance_after };
  }
  const floor = creditLimit == null ? 0 : -Math.abs(Number(creditLimit));
  for (let i = 0; i < 200; i++) {
    const { balance, version } = await store.getBalance(buyerId);
    const after = round2(balance - amt);
    if (after < floor) {
      const rej = await store.appendTxn({
        buyer_id: buyerId,
        type,
        amount: amt,
        balance_after: balance,
        idempotency_key: idempotencyKey2,
        status: "rejected",
        description
      });
      return { applied: false, insufficient: true, code: creditLimit == null ? WALLET.LOW_BALANCE : WALLET.OVER_CREDIT_LIMIT, balanceAfter: balance, txn: rej };
    }
    const ok = await store.casAdjustBalance(buyerId, version, after);
    if (!ok) continue;
    const txn = await store.appendTxn({
      buyer_id: buyerId,
      type,
      amount: amt,
      balance_after: after,
      idempotency_key: idempotencyKey2,
      status: "applied",
      description
    });
    return { applied: true, txn, balanceAfter: after };
  }
  return { applied: false, error: "cas_exhausted" };
}
async function walletCredit(store, { buyerId, amount, idempotencyKey: idempotencyKey2, type = "credit", description = "" }) {
  const amt = Number(amount);
  const won = await store.claimTxn(idempotencyKey2);
  if (!won) {
    const existing = await store.awaitTxnByKey(idempotencyKey2);
    return { applied: false, duplicate: true, txn: existing, balanceAfter: existing?.balance_after };
  }
  for (let i = 0; i < 200; i++) {
    const { balance, version } = await store.getBalance(buyerId);
    const after = round2(balance + amt);
    const ok = await store.casAdjustBalance(buyerId, version, after);
    if (!ok) continue;
    const txn = await store.appendTxn({
      buyer_id: buyerId,
      type,
      amount: amt,
      balance_after: after,
      idempotency_key: idempotencyKey2,
      status: "applied",
      description
    });
    return { applied: true, txn, balanceAfter: after };
  }
  return { applied: false, error: "cas_exhausted" };
}
async function walletCreditReturn(store, { buyerId, amount, returnId }) {
  return walletCredit(store, { buyerId, amount, idempotencyKey: `return:${returnId}`, type: "adjustment", description: `return ${returnId}` });
}

// src/lib/distribution/billing.js
function computeBillingLines(leads, approvedReturns = [], dims = ["vertical", "state"]) {
  const returned = new Set((approvedReturns || []).map((r) => r.lead_id));
  const groups = /* @__PURE__ */ new Map();
  for (const lead of leads || []) {
    const key = dims.map((d) => String(lead[d] ?? "")).join("|");
    if (!groups.has(key)) {
      const dimVals = {};
      dims.forEach((d) => {
        dimVals[d] = lead[d] ?? null;
      });
      groups.set(key, { ...dimVals, lead_count: 0, returns: 0, gross: 0, unit_prices: [] });
    }
    const g = groups.get(key);
    g.lead_count += 1;
    g.unit_prices.push(Number(lead.price) || 0);
    if (returned.has(lead.id)) g.returns += 1;
    else g.gross = round22(g.gross + (Number(lead.price) || 0));
  }
  return [...groups.values()].map((g) => ({
    ...g,
    billable_leads: g.lead_count - g.returns,
    unit_price: g.unit_prices.length ? round22(g.unit_prices.reduce((a, b) => a + b, 0) / g.unit_prices.length) : 0,
    amount: g.gross
  })).map(({ unit_prices, ...rest }) => rest);
}
function applyReturnAdjustment(processedReturnIds, returnId) {
  if (processedReturnIds.has(returnId)) return { applied: false, duplicate: true };
  processedReturnIds.add(returnId);
  return { applied: true };
}
function round22(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
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

// src/lib/distribution/transforms.js
function applyTransform(value, transform) {
  const s = value == null ? "" : String(value);
  switch (transform) {
    case "lowercase":
      return s.toLowerCase();
    case "uppercase":
      return s.toUpperCase();
    case "trim":
      return s.trim();
    case "digits":
      return s.replace(/\D/g, "");
    case "phone_us": {
      let d = s.replace(/\D/g, "");
      if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
      return d.length === 10 ? "1" + d : d;
    }
    default:
      return value;
  }
}

// src/lib/distribution/directPost.js
function getPath(obj, path) {
  if (!path) return void 0;
  return String(path).split(".").reduce((o, k) => o == null ? void 0 : o[k], obj);
}
function isLocalhost(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}
function buildPayload(leadData, fieldMap) {
  const out = {};
  for (const f of fieldMap || []) {
    let v = leadData[f.src];
    if (f.transform) v = applyTransform(v, f.transform);
    if (f.required && (v == null || v === "")) continue;
    if (v !== void 0) out[f.dest || f.src] = v;
  }
  return out;
}
async function deliverDirectPost(cfg, ctx) {
  const nowMs = ctx.nowMs ?? 0;
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;
  const attemptNumber = cfg.attemptNumber || 1;
  let url;
  try {
    url = new URL(cfg.targetUrl);
  } catch {
    return failClosed(ctx, cfg, nowMs, "invalid_url", "INVALID_URL");
  }
  if (ctx.testMode) {
    const allowed = ctx.allowlistHosts || [];
    if (!isLocalhost(url.hostname) && !allowed.includes(url.hostname)) {
      return failClosed(ctx, cfg, nowMs, "host_not_allowed", "HOST_NOT_ALLOWED");
    }
  }
  const payload = buildPayload(cfg.leadData || {}, cfg.fieldMap);
  const encoding = cfg.encoding === "form" ? "form" : "json";
  const headers = { ...cfg.headers || {} };
  headers["Idempotency-Key"] = cfg.idempotencyKey;
  let body;
  if (encoding === "form") {
    headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded";
    body = new URLSearchParams(payload).toString();
  } else {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = JSON.stringify(payload);
  }
  const pending = await ctx.store.createAttempt({
    lead_id: cfg.leadId,
    destination_id: cfg.destinationId,
    trigger: cfg.trigger || "primary",
    attempt_number: attemptNumber,
    idempotency_key: cfg.idempotencyKey,
    is_primary: !!cfg.isPrimary,
    status: ATTEMPT_STATUS.PENDING,
    started_at: new Date(nowMs).toISOString()
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs || 1e4);
  let httpStatus = null;
  let bodyText = "";
  let errorClass = null;
  const t0 = nowMs;
  try {
    const resp = await fetchImpl(cfg.targetUrl, {
      method: cfg.method || "POST",
      headers,
      body,
      redirect: "manual",
      signal: controller.signal
    });
    httpStatus = resp.status;
    bodyText = await resp.text();
  } catch (e) {
    errorClass = e && e.name === "AbortError" ? "timeout" : e && e.message ? e.message.slice(0, 60) : "network_error";
  } finally {
    clearTimeout(timer);
  }
  const mapping = cfg.responseMapping || {};
  const status = errorClass ? ATTEMPT_STATUS.ERROR : classifyResponse({ httpStatus, body: bodyText, mapping: {
    accept: mapping.acceptRe,
    reject: mapping.rejectRe,
    duplicate: mapping.duplicateRe,
    queue: mapping.queueRe
  } });
  let parsed = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = null;
  }
  const revenue = status === ATTEMPT_STATUS.ACCEPTED && parsed ? Number(getPath(parsed, mapping.revenuePath)) || 0 : 0;
  const buyerLeadId = parsed ? getPath(parsed, mapping.leadIdPath) ?? null : null;
  const record = buildAttemptRecord({
    leadId: cfg.leadId,
    destinationId: cfg.destinationId,
    trigger: cfg.trigger,
    attemptNumber,
    idempotencyKey: cfg.idempotencyKey,
    isPrimary: cfg.isPrimary,
    status,
    request: { method: cfg.method || "POST", url: cfg.targetUrl, headers, body },
    response: { status: httpStatus, body: bodyText },
    httpStatus,
    latencyMs: (ctx.nowMs ?? 0) - t0,
    errorClass,
    nowMs,
    retryOpts: cfg.retryOpts
  });
  await ctx.store.updateAttempt(pending.id, record);
  return {
    attemptId: pending.id,
    status: record.status,
    httpStatus,
    revenue,
    buyerLeadId,
    retryable: record.next_retry_at != null,
    nextRetryAt: record.next_retry_at,
    errorClass
  };
}
async function failClosed(ctx, cfg, nowMs, errorClass, code) {
  const rec = await ctx.store.createAttempt({
    lead_id: cfg.leadId,
    destination_id: cfg.destinationId,
    attempt_number: cfg.attemptNumber || 1,
    idempotency_key: cfg.idempotencyKey,
    is_primary: !!cfg.isPrimary,
    status: ATTEMPT_STATUS.ERROR,
    error_class: errorClass,
    code,
    started_at: new Date(nowMs).toISOString(),
    completed_at: new Date(nowMs).toISOString()
  });
  return { attemptId: rec.id, status: ATTEMPT_STATUS.ERROR, code, errorClass, retryable: false, revenue: 0, buyerLeadId: null };
}

// src/lib/distribution/pingpostFlow.js
var PING_ALLOWLIST = ["state", "zip", "county", "vertical", "brand", "supplier", "source", "lead_event"];
function buildPingPayload(leadData, allowlist = PING_ALLOWLIST) {
  const out = {};
  for (const f of allowlist) if (leadData[f] !== void 0 && leadData[f] !== null) out[f] = leadData[f];
  return out;
}
function getPath2(obj, path) {
  if (!path) return void 0;
  return String(path).split(".").reduce((o, k) => o == null ? void 0 : o[k], obj);
}
function isAmbiguous(errorClass) {
  if (!errorClass) return false;
  const e = String(errorClass).toLowerCase();
  if (e.includes("refused") || e.includes("econnrefused") || e === "host_not_allowed" || e === "invalid_url") return false;
  return true;
}
async function sendPing({ url, payload, headers, timeoutMs }, ctx) {
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 5e3);
  try {
    const resp = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers || {} },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: controller.signal
    });
    const text = await resp.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { ok: true, status: resp.status, json };
  } catch (e) {
    return { ok: false, errorClass: e && e.name === "AbortError" ? "timeout" : e && e.message ? e.message.slice(0, 60) : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
async function runPingPost(cfg, ctx) {
  const nowMs = ctx.nowMs ?? 0;
  const pingPayload = buildPingPayload(cfg.leadData || {}, cfg.pingAllowlist || PING_ALLOWLIST);
  const trace = { ping_payload_fields: Object.keys(pingPayload), bids: [], excluded: [], fallthrough: [] };
  const pinged = await Promise.all((cfg.bidders || []).map(async (b) => {
    const res = await sendPing({ url: b.pingUrl, payload: pingPayload, headers: b.headers, timeoutMs: b.timeoutMs }, ctx);
    const bm = b.bidMapping || { amountPath: "bid", idPath: "bid_id", expiresAtPath: "expires_at_ms" };
    const amount = res.ok ? Number(getPath2(res.json, bm.amountPath)) || 0 : 0;
    const bidId = res.ok ? getPath2(res.json, bm.idPath) ?? null : null;
    const expiresAtMs = res.ok ? Number(getPath2(res.json, bm.expiresAtPath)) || null : null;
    await ctx.store.createBid({
      lead_id: cfg.leadId,
      route_member_id: b.memberId,
      destination_id: b.destinationId,
      ping_sent_at: new Date(nowMs).toISOString(),
      bid_amount: amount,
      bid_id: bidId,
      bid_expires_at: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
      status: res.ok ? "bid" : "error"
    });
    return { bidder: b, amount, bidId, expiresAtMs, ok: res.ok };
  }));
  const eligible = [];
  for (const p of pinged) {
    let reason = null;
    if (!p.ok || !(p.amount > 0)) reason = "NO_BID";
    else if (p.expiresAtMs != null && p.expiresAtMs < nowMs) reason = "BID_EXPIRED";
    else if (p.bidder.reservePrice != null && p.amount < Number(p.bidder.reservePrice)) reason = "BELOW_RESERVE";
    trace.bids.push({ member_id: p.bidder.memberId, amount: p.amount, bid_id: p.bidId, eligible: !reason, reason });
    if (reason) trace.excluded.push({ member_id: p.bidder.memberId, reason });
    else eligible.push(p);
  }
  eligible.sort((a, b) => b.amount - a.amount || String(a.bidder.memberId).localeCompare(String(b.bidder.memberId)));
  if (!eligible.length) return { won: false, reason: "NO_ELIGIBLE_BID", winner: null, postResult: null, trace };
  for (let i = 0; i < eligible.length; i++) {
    const cand = eligible[i];
    const postRes = await deliverDirectPost({
      destinationId: cand.bidder.destinationId,
      targetUrl: cand.bidder.postUrl,
      method: "POST",
      encoding: cand.bidder.encoding || "json",
      headers: cand.bidder.headers,
      fieldMap: cand.bidder.fieldMap,
      timeoutMs: cand.bidder.timeoutMs,
      responseMapping: cand.bidder.responseMapping,
      idempotencyKey: `${cfg.idempotencyKey}:${cand.bidder.memberId}`,
      leadData: cfg.leadData,
      leadId: cfg.leadId,
      attemptNumber: 1,
      isPrimary: true,
      trigger: "pingpost_win"
    }, ctx);
    if (postRes.status === ATTEMPT_STATUS.ACCEPTED) {
      return { won: true, winner: cand.bidder.memberId, price: cand.amount, postResult: postRes, trace };
    }
    if (postRes.status === ATTEMPT_STATUS.ERROR && isAmbiguous(postRes.errorClass)) {
      trace.ambiguous = { member_id: cand.bidder.memberId, error_class: postRes.errorClass };
      return { won: false, reason: "AMBIGUOUS_WINNER", winner: cand.bidder.memberId, postResult: postRes, needsReconciliation: true, trace };
    }
    trace.fallthrough.push({ member_id: cand.bidder.memberId, status: postRes.status });
  }
  return { won: false, reason: "ALL_WINNERS_FAILED", winner: null, postResult: null, trace };
}

// src/lib/distribution/deliveryStore.js
function makeInMemoryAttemptStore({ yieldFn } = {}) {
  const attempts = [];
  const bids = [];
  let seq = 0;
  const microYield = yieldFn || (() => new Promise((r) => setTimeout(r, 0)));
  return {
    async createAttempt(rec) {
      const row = { ...rec, id: "a" + ++seq };
      attempts.push(row);
      return row;
    },
    async updateAttempt(id, patch) {
      const a = attempts.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
      return a;
    },
    async getAttempt(id) {
      return attempts.find((x) => x.id === id) || null;
    },
    async listDue(nowMs) {
      return attempts.filter((a) => a.status === "error" && a.next_retry_at != null && Date.parse(a.next_retry_at) <= nowMs && (a.lease_until == null || Date.parse(a.lease_until) <= nowMs));
    },
    // Atomic lease claim (honest CAS on lease_version). Exactly one concurrent
    // worker wins an unleased (or expired-lease) attempt.
    async claimLease(id, workerId, nowMs, leaseMs) {
      const a = attempts.find((x) => x.id === id);
      if (!a) return false;
      const version = a.lease_version || 0;
      await microYield();
      const latest = attempts.find((x) => x.id === id);
      const activeLease = latest.lease_until ? Date.parse(latest.lease_until) : 0;
      if (activeLease > nowMs) return false;
      if ((latest.lease_version || 0) !== version) return false;
      latest.lease_until = new Date(nowMs + leaseMs).toISOString();
      latest.leased_by = workerId;
      latest.lease_version = version + 1;
      return true;
    },
    // BidAttempt persistence (ping-post).
    async createBid(rec) {
      const row = { ...rec, id: "b" + ++seq };
      bids.push(row);
      return row;
    },
    async updateBid(id, patch) {
      const b = bids.find((x) => x.id === id);
      if (b) Object.assign(b, patch);
      return b;
    },
    _debug: { attempts, bids }
  };
}
function makeBase44AttemptStore(db) {
  return {
    async createAttempt(rec) {
      return db.entities.DeliveryAttempt.create(rec);
    },
    async updateAttempt(id, patch) {
      return db.entities.DeliveryAttempt.update(id, patch);
    },
    async getAttempt(id) {
      const rows = await db.entities.DeliveryAttempt.filter({ id });
      return rows[0] || null;
    },
    async listDue(nowMs, limit = 100) {
      const iso = new Date(nowMs).toISOString();
      const rows = await db.entities.DeliveryAttempt.filter({ status: "error" }, "next_retry_at", limit);
      return rows.filter((a) => a.next_retry_at && a.next_retry_at <= iso && (!a.lease_until || a.lease_until <= iso));
    },
    async claimLease(id, workerId, nowMs, leaseMs) {
      const rows = await db.entities.DeliveryAttempt.filter({ id });
      const a = rows[0];
      if (!a) return false;
      const activeLease = a.lease_until ? Date.parse(a.lease_until) : 0;
      if (activeLease > nowMs) return false;
      const version = a.lease_version || 0;
      const res = await db.entities.DeliveryAttempt.updateMany(
        { id, lease_version: version },
        { $set: { lease_until: new Date(nowMs + leaseMs).toISOString(), leased_by: workerId, lease_version: version + 1 } }
      );
      return !!(res && res.updated > 0);
    },
    async createBid(rec) {
      return db.entities.BidAttempt.create(rec);
    },
    async updateBid(id, patch) {
      return db.entities.BidAttempt.update(id, patch);
    }
  };
}

// src/lib/distribution/retryWorker.js
function seededUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1e3 / 1e3;
}
function backoffWithJitter(attemptNumber, seed, opts = {}) {
  const base = computeBackoffMs(attemptNumber, opts);
  const u = opts.rng ? opts.rng() : seededUnit(`${seed}:${attemptNumber}`);
  return Math.min(opts.maxMs ?? 36e5, Math.round(base * (0.5 + 0.5 * u)));
}
async function runRetryWorker(store, deliverFn, ctx) {
  const { nowMs, workerId, leaseMs = 3e4, healthStore, maxAttempts = 5, retryOpts = {} } = ctx;
  const due = await store.listDue(nowMs);
  const processed = [];
  for (const a of due) {
    const won = await store.claimLease(a.id, workerId, nowMs, leaseMs);
    if (!won) continue;
    const nextAttemptNum = (a.attempt_number || 1) + 1;
    const res = await deliverFn({ ...a, attempt_number: nextAttemptNum });
    const success = res.status === ATTEMPT_STATUS.ACCEPTED;
    if (healthStore) await healthStore.recordResult(a.destination_id, success, nowMs, ctx.healthOpts);
    if (success || res.status === ATTEMPT_STATUS.REJECTED || res.status === ATTEMPT_STATUS.DUPLICATE) {
      await store.updateAttempt(a.id, { status: res.status, next_retry_at: null, lease_until: null });
    } else if (nextAttemptNum >= maxAttempts) {
      await store.updateAttempt(a.id, { status: ATTEMPT_STATUS.DEAD_LETTER, next_retry_at: null, lease_until: null, attempt_number: nextAttemptNum });
    } else {
      const delay = backoffWithJitter(nextAttemptNum, a.id, retryOpts);
      await store.updateAttempt(a.id, {
        status: ATTEMPT_STATUS.ERROR,
        attempt_number: nextAttemptNum,
        next_retry_at: new Date(nowMs + delay).toISOString(),
        lease_until: null
      });
    }
    processed.push({ id: a.id, worker: workerId, status: res.status });
  }
  return processed;
}
async function manualRetry(store, attemptId, deliverFn, ctx) {
  const a = await store.getAttempt(attemptId);
  if (!a) return { ok: false, reason: "not_found" };
  const won = await store.claimLease(attemptId, ctx.workerId || "manual", ctx.nowMs, ctx.leaseMs || 3e4);
  if (!won) return { ok: false, reason: "leased" };
  const res = await deliverFn({ ...a, attempt_number: (a.attempt_number || 1) + 1 });
  await store.updateAttempt(attemptId, {
    status: res.status,
    lease_until: null,
    next_retry_at: res.status === ATTEMPT_STATUS.ERROR ? new Date(ctx.nowMs).toISOString() : null
  });
  if (ctx.healthStore) await ctx.healthStore.recordResult(a.destination_id, res.status === ATTEMPT_STATUS.ACCEPTED, ctx.nowMs, ctx.healthOpts);
  return { ok: true, status: res.status };
}

// src/lib/distribution/destinationHealth.js
var CIRCUIT = { CLOSED: "closed", OPEN: "open", HALF_OPEN: "half_open" };
function nextHealth(cur, success, nowMs, opts = {}) {
  const threshold = opts.failureThreshold ?? 5;
  const cooldownMs = opts.cooldownMs ?? 6e4;
  const h = cur || { state: CIRCUIT.CLOSED, consecutive_failures: 0 };
  if (success) {
    return { state: CIRCUIT.CLOSED, consecutive_failures: 0, last_success_at: new Date(nowMs).toISOString(), disabled_until: null };
  }
  const failures = (h.consecutive_failures || 0) + 1;
  const open = failures >= threshold;
  return {
    state: open ? CIRCUIT.OPEN : h.state === CIRCUIT.HALF_OPEN ? CIRCUIT.OPEN : CIRCUIT.CLOSED,
    consecutive_failures: failures,
    last_failure_at: new Date(nowMs).toISOString(),
    disabled_until: open ? new Date(nowMs + cooldownMs).toISOString() : h.disabled_until || null
  };
}
function isBlocked(h, nowMs) {
  if (!h || h.state === CIRCUIT.CLOSED) return false;
  if (h.state === CIRCUIT.OPEN) {
    if (h.disabled_until && Date.parse(h.disabled_until) > nowMs) return true;
    return false;
  }
  return false;
}
function makeInMemoryHealthStore() {
  const map = /* @__PURE__ */ new Map();
  return {
    async get(destId) {
      return map.get(destId) || null;
    },
    async set(destId, h) {
      map.set(destId, h);
      return h;
    },
    async recordResult(destId, success, nowMs, opts) {
      const next = nextHealth(map.get(destId), success, nowMs, opts);
      map.set(destId, next);
      return next;
    },
    _debug: { map }
  };
}
function makeBase44HealthStore(db) {
  async function get(destId) {
    const rows = await db.entities.DestinationHealth.filter({ destination_id: destId });
    return rows[0] || null;
  }
  return {
    get,
    async set(destId, h) {
      const rows = await db.entities.DestinationHealth.filter({ destination_id: destId });
      if (rows[0]) return db.entities.DestinationHealth.update(rows[0].id, h);
      return db.entities.DestinationHealth.create({ destination_id: destId, ...h });
    },
    async recordResult(destId, success, nowMs, opts) {
      const cur = await get(destId);
      const next = nextHealth(cur, success, nowMs, opts);
      await this.set(destId, next);
      return next;
    }
  };
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
  const reserve2 = opts.reservePrice != null ? Number(opts.reservePrice) : null;
  const evaluated = (bids || []).map((b) => {
    const amount = Number(b.amount);
    let reason = BID_REASON.ELIGIBLE;
    if (!(amount > 0)) reason = BID_REASON.NO_BID;
    else if (b.expiresAtMs != null && nowMs != null && b.expiresAtMs < nowMs) reason = BID_REASON.BID_EXPIRED;
    else if (reserve2 != null && amount < reserve2) reason = BID_REASON.BELOW_RESERVE;
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
export {
  ATTEMPT_STATUS,
  BID_REASON,
  CIRCUIT,
  OPERATORS,
  PING_ALLOWLIST,
  REASON,
  RESERVE,
  WALLET,
  _clearActiveGroupCache,
  applyReturnAdjustment,
  applyTransform,
  backoffWithJitter,
  buildAttemptRecord,
  buildPingPayload,
  buildRoutingSnapshot,
  capWindowStart,
  classifyResponse,
  computeBackoffMs,
  computeBillingLines,
  deliverDirectPost,
  evalConditionTree,
  evalLeaf,
  evaluateMember,
  exhaustedCap,
  finalize,
  hasActiveRouteGroup,
  idempotencyKey,
  isBlocked,
  isValidTrustedForm,
  isWithinSchedule,
  loadRoutingSnapshot,
  makeBase44AttemptStore,
  makeBase44CapStore,
  makeBase44HealthStore,
  makeBase44WalletStore,
  makeInMemoryAttemptStore,
  makeInMemoryHealthStore,
  manualRetry,
  missingRequiredFields,
  nextHealth,
  nextRetryAtIso,
  rankBids,
  redact,
  release,
  reserve,
  resolvePrice,
  routeWaterfall,
  runPingPost,
  runRetryWorker,
  runShadow,
  selectAuction,
  selectHybrid,
  selectPriority,
  selectRoundRobin,
  selectWeighted,
  shouldRetry,
  wallClock,
  walletCredit,
  walletCreditReturn,
  walletDebit
};
