# Pipeline Tracker — notes

- `tp-tracker` is paused: every deployment reads `BLOCKED`, and the live app is its last good build.
- It stays on Next 14 with `middleware.ts` until it is unparked or retired.
- Its state when parked is on TEC-36.
