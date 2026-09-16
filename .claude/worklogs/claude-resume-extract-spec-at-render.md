# claude-resume-extract-spec-at-render
agent: Resume Formatter · apps: apps/resume · shared files: none

## 2026-09-16 00:15 — claim
Working on: making `/api/reformat` re-extract the spec from the stored template `.docx` at render
time instead of trusting the `spec` column, so a template never needs re-uploading after a
spec-shape change again.
Touching: `apps/resume/app/api/reformat/route.ts`, `apps/resume/app/page.tsx` (two lines), and the
resume tests. No schema, no migration, no `middleware.ts`, no shared auth file, no other app.
Depends on: #67, which is merged and live.

Authorized by Joel, directly, in session on 2026-09-16 — he picked it off a list of what to do next.
Recorded before it as the last section of #67's body, where the technical director wrote that he had
said yes. I asked him again rather than building on a quote I could not see the source of.

### The second-order questions, before building

1. **What does this contradict?** Nothing, and I checked rather than assumed. `renders.template_snapshot`
   carries this comment in `20260911034533_reformatter_schema.sql`: *"The spec as it was at render
   time, so a saved render stays reproducible even after the template moves on."* Re-extracting at
   render time is **inside** that design rather than against it — the snapshot is what makes a
   derived spec auditable. `RULES.md` already says the template's original bytes are kept and not
   just its spec; this makes those bytes load-bearing instead of only downloadable. No model call is
   added — extraction is pure XML reading. The ATS constraints are untouched.
2. **Who else depends on it?** Nobody outside `apps/resume`. No shared file, no cross-app contract,
   no environment variable. `resume.templates.file_path` is `text not null`, so every template has
   its bytes — there is no schema-level case of a template without a file to design around.
3. **What becomes true afterwards that is not true now?** Three things, and the first is the one that
   matters.
   - **A render's formatting is derived from the template file plus the code that reads it, not from
     a value frozen at upload.** So two renders from the same template row, at different times, can
     legitimately differ. That is the entire point, and `template_snapshot` is what keeps each one
     auditable after the fact.
   - **The `spec` column stops being the source of truth for rendering.** It becomes a cache for the
     Templates list and a fallback for when the file cannot be read. It is still written at upload
     and still displayed, so it is not dead — but a reader who treats it as what will render is now
     wrong, which is why the Templates tab is relabelled to say "as uploaded".
   - **`extractSpec` now runs on every saved render**, so a bug in it becomes a render-time failure
     rather than an upload-time one. That raises the value of the fallback, and of `extractSpec`
     staying total: it must not throw on a `.docx` that reads.
   One extra storage read per saved render. A template is tens of kilobytes; this is noise next to
   the two uploads the same request already does.
4. **What does this make harder to change later?** Less, not more — this is the change that removes
   the coupling between a spec-shape change and a manual re-upload, which is the thing that has been
   costing a step every time. Nothing new is pinned: no schema, no API contract narrowed, no name
   fixed.
5. **Who decides this — the technical director or Joel?** Joel, and he has, twice.

### The design decision worth arguing with

**When the file cannot be read, this falls back to the stored spec and says so out loud rather than
failing the render.** The stored spec is not a guess — it was extracted from those same bytes, so it
is a true if possibly stale description of that template. A transient storage blip should not block
a render Joel needs for an application he is sending now.

But a **silent** fallback is exactly how "the fixes did not work" happens again, and that has already
cost a round in this app. So the response carries `specSource` and, when it is not the file, a
sentence saying why — and the Reformat tab prints it. Visible degradation, never quiet.

## 2026-09-16 00:25 — handoff
Landed on this branch: `/api/reformat` reads the active template's stored `.docx` and extracts the
spec from it. `apps/resume` only — no schema, no migration, no `middleware.ts`, no shared auth file,
no other app, no environment variable.

`npm run test` **120 passed** (11 new), `npx tsc --noEmit` clean, `npm run build` clean. Those are
the two things CI runs.

**The re-upload step is gone.** That was the point, and it is the thing to check when this deploys:
the active template already on the row will start rendering in the template's own colours without
being touched, because the colours are read out of its file rather than out of a spec column written
before the colour fields existed.

**Only two things still read `templates.spec`**, and I checked rather than assumed: the fallback in
this route, and the Templates tab fingerprint line. That line now says "as uploaded", because after
this change those four numbers are no longer what a render will use and a reader would have been
entitled to think they were.

**What I decided that the next session could get wrong.** The fallback is loud on purpose. If the
download fails or the bytes do not parse, the render still happens off the stored spec *and the
response says which source it used and why*, and the Reformat tab prints it. Making that quiet
reintroduces the exact bug this change kills — three rounds of "why didn't that work". There is also
a test pinning that a `TypeError` is **not** caught: only `StorageError` and `DocxReadError` fall
back, because laundering a programming error into a degraded render is the obvious way to get this
wrong.

Open: nothing in this change.

Need from TD: nothing. No schema change, so no migration to apply at the gate.

**Deployment.**

1. **On merge, automatically:** Vercel rebuilds `tp-resume` and only `tp-resume`. No environment
   variable, no dashboard setting, no migration, no required-check change, no DNS.
2. **What a human has to do: nothing.** That is the change. Contrast #67, which needed a template
   re-upload before its colours appeared — this removes that step for #67 and for every future
   spec-shape change.
3. **How to verify it is genuinely live:** reformat a Jobright export at `resume.techpaddock.io`
   **without re-uploading anything**. The name and section headings should come out dark blue, the
   employer bold with a grey italic title and grey date, the highlights metrics blue over grey. If a
   sentence appears under the download button saying the formatting came from the spec saved at
   upload, the template file could not be read and it says why — that is the fallback reporting
   itself, not a silent failure.
4. **What breaks if it is skipped:** nothing, and nothing regresses. Without this deploy, `#67`'s
   colours still work — they just keep needing a re-upload after every spec change.

**One caveat worth stating rather than burying.** `extractSpec` now runs on every saved render
instead of once per upload, so a bug in it becomes a render-time failure. That is why the fallback
exists and why `extractSpec` has to stay total: it must not throw on a `.docx` that reads. The cost
is one extra storage read per saved render — a template is tens of kilobytes, against the two
uploads the same request already performs.
