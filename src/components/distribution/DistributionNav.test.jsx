import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import DistributionNav from './DistributionNav.jsx';

// Renders the real DistributionNav (SSR, no jsdom needed) and asserts the
// Campaigns > Deliveries page link is present. A minimal localStorage shim keeps
// the collapse/resize hooks from throwing in the node test environment; the shim
// value also drives the collapsed vs expanded branch.
let storeValue = null;
beforeAll(() => {
  globalThis.localStorage = { getItem: () => storeValue, setItem: () => {} };
});
afterAll(() => { delete globalThis.localStorage; });

function render(path = '/campaigns') {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(DistributionNav)),
  );
}

describe('DistributionNav renders the Deliveries page link', () => {
  it('expanded submenu contains a real link to the Deliveries route (not a tab, not coming-soon)', () => {
    storeValue = null; // collapsed pref absent -> expanded column renders
    const html = render();
    expect(html).toContain('href="/campaigns/deliveries"');
    // It is a real page link, not the ?tab= form, and not a disabled coming-soon item.
    expect(html).not.toContain('href="/campaigns?tab=deliveries"');
    expect(html).not.toContain('Coming soon');
  });

  it('Deliveries sits between Suppliers and Brands', () => {
    storeValue = null;
    const html = render();
    const iDeliveries = html.indexOf('/campaigns/deliveries');
    const iSuppliers = html.indexOf('tab=suppliers');
    const iBrands = html.indexOf('tab=brands');
    expect(iSuppliers).toBeGreaterThanOrEqual(0);
    expect(iDeliveries).toBeGreaterThan(iSuppliers);
    expect(iBrands).toBeGreaterThan(iDeliveries);
  });

  it('collapsed rail still exposes the Deliveries link (reachable when the submenu is collapsed)', () => {
    storeValue = 'true'; // legenex_subnav_collapsed = true -> collapsed rail renders
    const html = render();
    expect(html).toContain('href="/campaigns/deliveries"');
  });
});
