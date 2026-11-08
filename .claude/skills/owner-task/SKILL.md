---
name: owner-task
description: File work for the owner as its own short Linear issue, assigned to the owner, that blocks the issue it is for (or, for a check after live, is related to it). Use whenever something waits on the owner — an approval, a decision, a manual step, a test — instead of a step inside a long issue.
---

# Owner task

The owner reads these and nothing else (TEC-238; the owner's words: "I need something that is just
the work for me, and very limited outside context to get it done"). One task is one thing to do.

## When

- **Blocks its issue:** work cannot go on without the owner: an approval on CLAUDE.md's list, a
  decision, a manual step (a `DROP` in the SQL Editor, a Vercel setting), a test before merge.
  File it with `blocks: ["TEC-n"]`, and say in the issue's Next steps `**Owner:** TEC-m`.
- **Related only:** a check after the change is live. Live still closes the issue; file it with
  `relatedTo: ["TEC-n"]`. Only when the owner asks for one, or the change cannot be tested signed
  out.

Before filing, look for an open owner task for the same issue and thing; update it instead.

## The task

- **Title:** a verb, then the thing: `Test: grocery picklist shows the exact product`,
  `Decide: keep or drop the coupon import`, `Run: the DROP for cookbook.old_prices`,
  `Approve: Vercel firewall rule for tp-lando`.
- **Labels:** `Owner task`, plus the issue's `app:` label.
- **Assignee:** the owner. Read the owner's Linear account at run time with `list_users` (the
  workspace's human member, not the agent account `_claude`); `"me"` is the agent. Never write the
  owner's name or account into the repo.
- **Status:** Todo. **Body**, 150 words or fewer, nothing a builder knows that the owner does not
  need:

```
For TEC-240 — Cookbook grocery rows show the exact product.
Needed: confirm the List popup picks the right product on your phone.

## Steps
1. Open https://cookbook.techpaddock.io/list
2. Tap any grocery row, then "Pick product"

## Test
- [ ] The popup lists products for that item only
- [ ] Picking one updates the row's name

Done when: both boxes pass. If not, comment what you saw.
```

`## Test` is there only when there is something to check. Every link is clickable. The guard
refuses a task without `For TEC-n`, `## Steps` or `Done when`, or over 150 words.

## After

- **Done by the owner:** the blocked issue goes on; carry on with it, or name the next command.
- **A comment saying it failed:** file a `Bug` sub-issue of the issue it was for, with what the
  owner saw, and close the task. Its fix gets a new task if it needs the owner again.
- **No longer needed:** cancel it, with one line why.
