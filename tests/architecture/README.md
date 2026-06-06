# Architecture tests

## Commands

- `npm run test:arch` — run the active architecture guards
- `npm run test:arch:reports` — generate dependency graph reports under `reports/archunit/`

## Pending guards

These target-state guards are defined but skipped by default until the codebase is aligned:

- `application -> infra`
- `application -> ui`
- `infra -> ui`

Run them explicitly with:

```bash
ARCHUNIT_ENABLE_PENDING_GUARDS=1 npm run test:arch
```

## Full target diagram

The full PlantUML conformance check is also opt-in for now:

```bash
ARCHUNIT_ENFORCE_TARGET_DIAGRAM=1 npm run test:arch
```
