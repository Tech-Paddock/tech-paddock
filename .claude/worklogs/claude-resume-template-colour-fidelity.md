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

## 2026-09-16 00:05 — handoff
Landed on this branch: the renderer reads the template's colours and the three sizes of its
employer/title/date line. `apps/resume` only — no schema, no `middleware.ts`, no shared auth file,
no other app, no migration.

`npm run test` 109 passed (23 new), `npx tsc --noEmit` clean, `npm run build` clean. Those are the
two things CI runs, so a push is fully checked.

**Measured against the two files Joel sent, not eyeballed.** Employer 11pt bold `#1A1A1A`, title
10.5pt grey italic `#666666`, date 10pt grey — the three numbers he named, with 10.5pt resolved out
of docDefaults where the run itself states nothing. Highlights metric 12.5pt `#1F3864` over a 9pt
`#444444` description. Name and headings `#1F3864`, contact line `#666666`, document default
`#1A1A1A`. Coverage 100% with nothing dropped, ATS audit empty.

**Two bugs found while reading the trio, both fixed here.** An entry line's first run is set at the
heading size, so "the first paragraph at the heading size" could land on an employer — it was a
heading today only because one happens to come first in the document, and every heading would
otherwise have taken the grey of the title beside it. And `{ ...DEFAULT_SPEC }` shares its nested
objects, so writing to `spec.entry.company` wrote into the defaults themselves; in a long-lived
server process every later template would have inherited whatever the last one measured. Both have
a test.

**One judgement call worth Joel's eye.** His contact line hyperlinks the email and the LinkedIn in
the accent colour and sets the phone number grey. The output renders that line as a single run, so
one colour has to win. By length the accent does — and a phone number in link blue is not what the
template looks like — so a link's colour is treated as the link's, and grey wins. Say the word if
you want the accent instead; it is one rule.

**Deliberately not changed: body size.** The template's bullets inherit 10.5pt from docDefaults and
the renderer emits 10pt, because `bodySize` is the commonest explicitly-stated size and that rule is
deliberate. Half a point, nobody has mentioned it, and changing it reflows the whole document — so
it is flagged rather than fixed.

Open: nothing in this change.

**No pull request opened.** Joel has not asked. The branch is the deliverable and `HANDOFF.md` is
written at the moment a pull request exists, which also keeps this out of the technical director's
way — see the claim above: `claude/resume-ratify-template-deletion` is already editing that file and
should merge first.

Need from TD: nothing yet. When this does become a pull request, the merge order in the claim
applies.

**Deployment.** Nothing happens by itself beyond the rebuild, and there is one manual step that
matters.

1. On merge, Vercel rebuilds `tp-resume` and only `tp-resume`. No environment variable, no dashboard
   setting, no migration, no DNS.
2. **Joel must re-upload the active template afterwards.** `app/api/reformat/route.ts` renders from
   the spec stored on the template row, not from the stored `.docx`, so the colours cannot appear
   until a fresh upload re-extracts them. Templates tab → upload → make it active.
3. Verify: reformat a Jobright export and open the result. The name and section headings are dark
   blue, the employer is black-ish bold 11pt with a grey italic title and a grey date beside it, and
   the Career Highlights metrics are blue over grey descriptions. If any of it is black, the active
   template predates this change and step 2 has not been done.
4. Skip step 2 and nothing breaks — every existing template renders exactly as it does today,
   because `normalizeSpec` fills in the fields it is missing. The change is simply invisible.

**The re-upload is the third of these in a week, and it has a root cause.** Re-extracting the spec
from the stored template file at render time would end it permanently, and `renders.template_snapshot`
already preserves reproducibility so nothing is lost. Not built here: Joel did not ask, and it
changes how every render resolves its formatting, which is his call.

## 2026-09-16 00:20 — correction, and the handoff written
**The merge-order note in my claim above is stale and I got it wrong by not re-checking.**
`claude/resume-ratify-template-deletion` had already merged as #63 by the time I wrote it; there is
no branch to sequence against and no conflict to pay. I said the opposite to Joel in the message
handing this branch over. Two other claims in that note are also now resolved on `main`:
`RULES.md` and `HANDOFF.md` carry the ratification, and `supabase/README.md` documents applying
through the hosted API.

Merged `origin/main` in — five changes, `apps/resume` untouched by any of them, no conflict. The
merge does touch `supabase/` (four coffee migrations renamed to their real timestamps), so CI now
builds every app on this branch rather than resume alone. Re-ran on the merged tree: 109 tests,
`tsc --noEmit` and `npm run build` clean.

**`HANDOFF.md` is now current, which it should have been before I handed the branch over.** The
brief's rule is that a finished branch is a checkpoint and everything that has to survive is in the
repo *before* the handover message — not at pull-request time, which is what I was working from.
Corrected rather than left for later, because after may not exist.

What the handoff now says that it did not: the branch exists and is finished so a later session does
not restart it; what `TemplateSpec` carries and the four traps behind reading it; that `extractSpec`
starts from `normalizeSpec(null)` and must not go back to a spread of `DEFAULT_SPEC`; that
`normalizeSpec` is the one place a future spec field has to be taught about; the test count
(109 here, 86 on `main`); and that the migration-documentation gap it described as open is closed.
