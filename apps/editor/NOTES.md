# Message Editor — notes

- `tp-message-editor` is paused: every deployment reads `BLOCKED`, and the live app is its last good
  build. A merge here reaches the repo, never the running app.
- It stays on Next 14 with `middleware.ts` until it is unparked or retired.
