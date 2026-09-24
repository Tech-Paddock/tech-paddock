Requested by Joel on YYYY-MM-DD — "what he said"

## What changed

## Why

## Blast radius
<!-- Which apps does this touch? Which shared files? "One app, no shared files" is a fine answer. -->

## Verification
- [ ] `npm run test --if-present` passes in every touched app
- [ ] `npm run build` passes in every touched app
- [ ] CI is green — the `gate` job covers the per-app builds and `drift`; a new app under `apps/` needs no workflow change
- [ ] No personal information anywhere in the diff — names, addresses, phone numbers, emails, employers, schools, resume content. For any `.docx`, that includes hyperlink targets in `.rels` parts and the author fields in `docProps/`, not just `document.xml`.
- [ ] `HANDOFF.md` updated for every area this touches, and it describes what this change leaves behind
- [ ] Any schema change has its migration file in this PR, and its shape is stated below

## Deployment
<!--
Four things, every time. "Nothing — it deploys itself on merge" is a valid answer and must be
written; a blank section is indistinguishable from a forgotten one.

- What happens by itself when this merges?
- What does a human have to do, and in what order?
- How do you verify it is genuinely live?
- What breaks if the steps are skipped?
-->

## Rules impact
<!--
Does this change contradict anything settled — CLAUDE.md, your own charter at
.claude/agents/<you>/RULES.md, the domain map, env vars, or a stated decision?

If so it should already have been raised with Joel BEFORE the work, not here.
Flagging it at this point is the backstop for something you only discovered
late, not the normal path — code already written applies pressure to approve it,
which is what the rule exists to prevent.

CLAUDE.md changes only with Joel's approval, given before the change is made.
Charters are drafted by the technical director and approved by Joel. For your
own charter, propose the change here, in your handoff or in a Linear issue —
do not make it.

Write "none" if nothing settled is affected.
-->
