# claude-resume-template-colour-fidelity
agent: Resume Formatter · apps: apps/resume · shared files: none

## 2026-09-15 23:50 — claim
Working on: making the renderer reproduce the template's colours and its employer/title/date
trio, which Joel asked for after running the app on a real job.
Touching: `apps/resume/lib/docx/{paragraphs,spec,build}.ts`, `apps/resume/app/api/reformat/route.ts`,
and the resume tests. No schema, no `middleware.ts`, no shared auth file, no other app.
Depends on: nothing.

**Already claimed by someone else, so flagged before touching it.** The technical director's
`claude/resume-ratify-template-deletion` edits `.claude/agents/resume/HANDOFF.md` and
`.claude/agents/resume/RULES.md`. I have to update my own handoff when this becomes a pull request,
so those two branches will collide in `HANDOFF.md`. **Merge the ratification first** — it is one
paragraph and the correction others are waiting on — and this branch's handoff edit is then the
second to merge and pays the conflict, which is the right way round because this branch is still
being worked.

Also deleted `claude-doc-resume-handoff-migration.md`: that branch merged as #60 and has been
deleted, so per the worklog README its log goes with it. Nothing was lost — the migration section it
produced is in the handoff on `main`.

### The second-order questions, before building

1. **What does this contradict?** Nothing. "No model calls, ever" holds — every colour and size
   here is read out of the template's own XML. The brief's "model choice is per task" is untouched
   because there is no call to choose a model for. The ATS constraints hold: still one table, still
   no images, still contact in the body.
2. **Who else depends on it?** Nobody. `TemplateSpec` is read only by `apps/resume`, and the spec
   JSON is stored only in `resume.templates.spec`. No shared file, no cross-app contract.
3. **What becomes true afterwards that is not true now?** `TemplateSpec` grows nested objects
   (`entry`, `highlight`), so a spec stored before this change no longer has the shape the builder
   reads. That is a crash, not a degradation, unless it is handled — so `normalizeSpec` fills any
   missing field from the defaults and `/api/reformat` runs every stored spec through it. Old
   templates then render exactly as they do today; the colours appear once the template is
   re-uploaded.
4. **What does this make harder to change later?** The stored spec shape, which is now nested. It
   is versionless and always has been; `normalizeSpec` is what makes that survivable, and it is the
   one place a future shape change has to be taught about.
5. **Who decides this — the TD or Joel?** Joel, and he already did: he named the exact sizes and
   colours he wants kept.

### The thing Joel has to know, and the reason it keeps recurring

`app/api/reformat/route.ts` renders from the **stored** spec, not from the stored template file. So
every change to the spec's shape needs the active template re-uploaded before it takes effect. This
is the third time in a week.

Re-extracting the spec from the stored `.docx` at render time would end that for good, and
`renders.template_snapshot` already preserves reproducibility so nothing is lost. **Not built here** —
Joel did not ask for it, and it is a change to how every render resolves its formatting, which is his
call and not a thing to slip in alongside a colour fix.
