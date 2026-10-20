---
name: deploy
description: Deploy everything ready. The owner types /deploy; the TD starts Deployment, which holds and reports if any work is unfinished, and otherwise merges each ready branch and confirms it is live.
disable-model-invocation: true
---

# Deploy

The owner's only. The TD does not merge; it briefs Deployment.

1. **List what is ready:** every pushed branch whose builder reported finished, from this session's
   reports and Linear issues In Review.
2. **Start Deployment** (`subagent_type: deployment`) with the brief: for each branch, its name,
   the request line (`Requested on YYYY-MM-DD — "…"`, the owner's words), the Linear issue, the
   blast radius and the Deployment section. Nothing ready: still start it, so the check runs.
3. **Relay its report unchanged** in the `/status-check` format, under **Deploy held** or
   **Deployed**.
