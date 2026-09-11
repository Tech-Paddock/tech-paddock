import Link from "next/link";
import { loadDashboard } from "@/lib/dashboard";
import { links } from "@/lib/links";
import type { Severity, TouchSource } from "@/lib/signals";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — Pipeline Tracker",
};

/**
 * Tailwind purges on literal class strings, so severity styling is a lookup
 * rather than an interpolated class name.
 */
const SEVERITY: Record<Severity, { border: string; chip: string }> = {
  urgent: { border: "border-red-300", chip: "bg-red-50 text-red-800" },
  warn: { border: "border-amber-300", chip: "bg-amber-50 text-amber-900" },
  info: { border: "border-line", chip: "bg-paper text-ink/70" },
};

const TOUCH_LABEL: Record<TouchSource, string> = {
  recorded: "from the date you recorded",
  message: "from a message you sent",
  render: "from a resume you submitted",
  meeting: "from a meeting that happened",
};

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">{title}</h2>
        {hint && <p className="text-xs text-ink/40">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-ink/45 border border-dashed border-line rounded-xl px-4 py-3">
      {children}
    </p>
  );
}

export default async function DashboardPage() {
  const now = new Date();
  const data = await loadDashboard(now);
  const contactName = (id: string | null) => (id ? (data.contacts.get(id)?.name ?? null) : null);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-ink/50">
            {data.threads.length} thread{data.threads.length === 1 ? "" : "s"} tracked
          </p>
        </div>
        <Link
          href="/"
          className="px-3 py-2 rounded-lg border border-line bg-white text-sm font-medium"
        >
          All threads →
        </Link>
      </header>

      {data.degraded.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg px-4 py-3">
          <p className="font-medium">Some sources did not load, so these numbers are incomplete.</p>
          <ul className="mt-1 list-disc pl-5">
            {data.degraded.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      <Section title="On the clock" hint="next 48 hours">
        {data.commitments.length === 0 ? (
          <Empty>
            Nothing booked. Once Outlook is connected, interviews and calls land here with the
            resume they have and your last message attached.
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {data.commitments.map((c) => (
              <a
                key={c.meetingId}
                href={c.threadId ? links.thread(c.threadId) : "#"}
                className="border border-red-300 rounded-xl p-4 bg-white flex items-center justify-between gap-4"
              >
                <div>
                  <p className="font-semibold">{c.company ?? c.label}</p>
                  <p className="text-sm text-ink/60">{c.company ? c.label : "Calendar event"}</p>
                </div>
                <span className="text-xs font-medium text-red-800 bg-red-50 px-2 py-1 rounded-full whitespace-nowrap">
                  in {c.hoursAway}h
                </span>
              </a>
            ))}
          </div>
        )}
      </Section>

      <Section title="Going quiet" hint="threshold varies by stage">
        {data.decay.length === 0 ? (
          <Empty>Nothing past its threshold. Every live thread has been touched recently.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {data.decay.map(({ thread, touch, days, threshold, reason, severity }) => (
              <a
                key={thread.id}
                href={links.thread(thread.id)}
                className={`border rounded-xl p-4 bg-white flex flex-col gap-1 ${SEVERITY[severity].border}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold">{thread.company}</p>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${SEVERITY[severity].chip}`}
                  >
                    {days}d quiet · {thread.stage}
                  </span>
                </div>
                <p className="text-sm text-ink/60">
                  {reason === "interviewing_stall"
                    ? "Interviewing, with nothing booked next. This is the expensive kind of silence."
                    : reason === "offer_silence"
                      ? "An offer thread has gone quiet."
                      : `Past the ${threshold}-day mark for ${thread.stage}.`}
                </p>
                <p className="text-xs text-ink/40">
                  Last touch {TOUCH_LABEL[touch.source]}
                  {touch.aheadOfRecord && " — newer than the date on the thread"}
                  {contactName(thread.contact_id) && ` · ${contactName(thread.contact_id)}`}
                </p>
              </a>
            ))}
          </div>
        )}
      </Section>

      <Section title="Loose ends" hint="work already done, not yet cashed in">
        {data.looseEnds.length === 0 ? (
          <Empty>Nothing hanging. Every rendered resume went out and every thread has a next step.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {data.looseEnds.map((end, i) => (
              <a
                key={`${end.kind}-${end.threadId ?? end.renderId ?? i}`}
                href={
                  end.kind === "unsent_render"
                    ? end.renderId
                      ? links.render(end.renderId)
                      : links.renderHistory()
                    : end.kind === "follow_up_gap" && end.contactId
                      ? links.draftTo(end.contactId)
                      : end.threadId
                        ? links.thread(end.threadId)
                        : "#"
                }
                className={`border rounded-xl p-4 bg-white flex flex-col gap-1 ${SEVERITY[end.severity].border}`}
              >
                <p className="font-medium">{end.label}</p>
                <p className="text-sm text-ink/60">{end.detail}</p>
              </a>
            ))}
          </div>
        )}
      </Section>

      <Section title="This week" hint={`since ${data.rhythm.since}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Messages", value: data.rhythm.messages },
            { label: "Applications", value: data.rhythm.applications },
            { label: "Threads opened", value: data.rhythm.threadsOpened },
            { label: "Meetings", value: data.rhythm.meetings },
          ].map((stat) => (
            <div key={stat.label} className="border border-line rounded-xl p-4 bg-white">
              <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
              <p className="text-xs text-ink/50">{stat.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink/40">
          Effort, not outcomes. Conversion rates over a few dozen threads are noise; showing up
          consistently is the part you control.
        </p>
      </Section>

      {data.health.length > 0 && (
        <Section title="Needs setup">
          <div className="flex flex-col gap-2">
            {data.health.map((h) => (
              <div
                key={h.kind}
                className={`border rounded-xl p-4 bg-white ${SEVERITY[h.severity].border}`}
              >
                <p className="font-medium">{h.label}</p>
                <p className="text-sm text-ink/60">{h.detail}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </main>
  );
}
