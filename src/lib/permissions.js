// Granular access-control catalog + base-role presets for Users & Roles.
// Every user stores a `permissions` JSON object: { [key]: true } of ticked sections.

export const PERMISSION_GROUPS = [
  {
    group: 'Dashboard',
    items: [
      { key: 'overview', label: 'Overview' },
    ],
  },
  {
    group: 'Leads',
    items: [
      { key: 'leads_all', label: 'All Leads' },
      { key: 'leads_sold', label: 'Sold' },
      { key: 'leads_unsold', label: 'Unsold' },
      { key: 'leads_disqualified', label: 'Disqualified' },
      { key: 'leads_rejected', label: 'Rejected' },
      { key: 'leads_queued', label: 'Queued' },
    ],
  },
  {
    group: 'Lead Distribution',
    items: [
      { key: 'dist_campaigns', label: 'Campaigns' },
      { key: 'dist_verticals', label: 'Verticals' },
      { key: 'dist_buyers', label: 'Buyers' },
      { key: 'dist_suppliers', label: 'Suppliers' },
      { key: 'dist_brands', label: 'Brands' },
      { key: 'dist_deliveries', label: 'Deliveries' },
      { key: 'dist_conversion_events', label: 'Conversion Events' },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { key: 'reports', label: 'Reports' },
      { key: 'finances', label: 'Finances' },
      { key: 'bank_feed', label: 'Bank Feed' },
      { key: 'tools', label: 'Tools' },
    ],
  },
  {
    group: 'Settings',
    items: [
      { key: 'set_integrations', label: 'Integrations' },
      { key: 'set_data_sources', label: 'Data Sources' },
      { key: 'set_custom_fields', label: 'Custom Fields' },
      { key: 'set_field_mapping', label: 'Field Mapping' },
      { key: 'set_api_keys', label: 'API Keys' },
      { key: 'set_error_logs', label: 'Error Logs' },
      { key: 'set_knowledge_base', label: 'Knowledge Base' },
      { key: 'set_users', label: 'Users and Roles' },
      { key: 'set_billing', label: 'Billing' },
    ],
  },
  {
    group: 'Portal',
    items: [
      { key: 'portal_access', label: 'Portal access' },
    ],
  },
];

export const ALL_KEYS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

// Keys that Supplier/Buyer roles must NEVER have (enforced hard).
const DIST_KEYS = PERMISSION_GROUPS.find(g => g.group === 'Lead Distribution').items.map(i => i.key);
const FINANCE_KEYS = ['finances', 'bank_feed'];
export const RESTRICTED_FOR_PARTNERS = [...DIST_KEYS, ...FINANCE_KEYS];

const all = () => Object.fromEntries(ALL_KEYS.map(k => [k, true]));
const only = (keys) => Object.fromEntries(keys.map(k => [k, true]));
const allExcept = (excluded) => Object.fromEntries(ALL_KEYS.filter(k => !excluded.includes(k)).map(k => [k, true]));

export const ROLE_PRESETS = {
  owner: { label: 'Owner', description: 'Everything. Can delete users, including the Owner.', canDeleteOwner: true, permissions: all() },
  admin: { label: 'Admin', description: 'Everything except deleting the Owner. Finances & Bank Feed off by default.', canDeleteOwner: false, permissions: allExcept(['finances', 'bank_feed']) },
  manager: { label: 'Manager', description: 'Most things except Finances & Bank Feed.', canDeleteOwner: false, permissions: allExcept(FINANCE_KEYS) },
  supplier: { label: 'Supplier', description: 'Own data only. No Lead Distribution, no Finances.', canDeleteOwner: false, permissions: only(['overview', 'leads_all', 'leads_sold', 'leads_unsold', 'reports', 'portal_access']) },
  buyer: { label: 'Buyer', description: 'Own data only. No Lead Distribution, no Finances.', canDeleteOwner: false, permissions: only(['overview', 'leads_all', 'leads_sold', 'reports', 'portal_access']) },
};

// Enforce partner restrictions regardless of ticked boxes.
export function sanitizePermissions(baseRole, perms) {
  const out = { ...perms };
  if (baseRole === 'supplier' || baseRole === 'buyer') {
    RESTRICTED_FOR_PARTNERS.forEach(k => { delete out[k]; });
  }
  return out;
}