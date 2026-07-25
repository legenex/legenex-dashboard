# Legenex static audit report

Run `run_static_20260725110211` generated 2026-07-25T11:02:26.150Z

**6 checks:** 2 pass, 2 fail, 1 warn, 1 needs-env

| Verdict | Check | Severity | Surface | Observed |
|---|---|---|---|---|
| fail | design.tokens.raw_color | medium | src/components/shared/PortalEnablementCard.jsx:67 | src/components/shared/PortalEnablementCard.jsx:67:56  raw-hsl-rgb  border-[hsl( |
| fail | ui.nav.distribution_buyers_missing | high | /app/src/components/distribution/DistributionNav.jsx | Buyers section absent from nav; route /distribution/buyers exists but is unreachable from the distribution nav |
| warn | entity.orphaned | low | ContractVersion, SupplierStateCoverage | 2 unreferenced: ContractVersion, SupplierStateCoverage |
| needs_env | tests.suite | high | [22m[49m | ? failed of 0 |
| pass | engine.parity | info | scripts/check-engine-parity.mjs | parity check OK: backend engine matches canonical source; no hand-written mirror. |
| pass | function.caller_model | info | base44/functions | All service-role functions carry a gate |
