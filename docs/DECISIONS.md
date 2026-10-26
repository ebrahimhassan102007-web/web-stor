# Decisions

## D-01 — Do not infer omitted requirements

The high-level directive references a complete original specification, but only the phased summary and identifier ranges are present in this conversation and repository. We will not invent finding descriptions, route checks, tests, or acceptance criteria. All provided IDs are preserved as blocked entries; unenumerated scope is explicitly marked uncountable. Resume implementation after the complete source is supplied and reconciled.

## D-02 — Production isolation

All discovery and baseline operations were local. No production endpoints, data, environment variables, or migrations were accessed or modified. No exploit simulations were performed. Keep all future security probes local/disposable and test-data-only.

## D-03 — Baseline dependency advisories

The current installed dependency graph generated 8 `npm audit` findings. Do not blindly force major dependency changes. Review the upstream advisory ranges and current installed Next.js 16 documentation before any update, then run the complete regression suite specified by the source requirements.

## D-04 — No speculative wallet behavior

Do not add invented balances, payments, account data, or financial functionality. The supplied directive explicitly prohibits this and omits details for the requested wallet/balance interface.
