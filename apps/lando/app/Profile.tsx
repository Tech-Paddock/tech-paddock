"use client";

import { useState } from "react";
import { VET_REASONS, health, latestWeight, round1, weight as asWeight, type JournalEvent } from "@/lib/events";
import { shortDate } from "@/lib/localtime";
import { medReasonLabel, type Medication } from "@/lib/medications";
import {
  PROFILE_MAX,
  VACCINE_STATUS_WORDS,
  ageText,
  lastVisit,
  medRows,
  nextVisit,
  telHref,
  vaccineRows,
  type ProfileDetails,
} from "@/lib/profile";
import { dayText, dueText, type Upcoming, type UpcomingInput } from "@/lib/upcoming";
import { Box, Field, inputFull } from "./LogForm";
import Sheet from "./Sheet";
import UpcomingList from "./UpcomingList";

/**
 * Lando's Profile (TEC-260), opened from the app icon in the app bar (RULES.md, Surface: app); the tabs stay five. A
 * page with a Back, built from the form Boxes and Fields and the upcoming rows' status colours (`lando-pill`).
 *
 * Basics and Vet are stored (`lando.profile`) and edited through a small Edit form. Everything else is read from what
 * has been logged and planned: the latest weight, the last and next vet visit, each vaccine's last date and status
 * (green good, amber due soon, red overdue, also in words), and each regular medication's reason and next date. Plan
 * next adds a vaccine's next dose as an upcoming plan. The microchip and policy numbers are shown here and never
 * logged or stored anywhere but the database.
 */
export default function Profile({
  details,
  loadError,
  events,
  upcoming,
  medications,
  today,
  onBack,
  onRetry,
  onSave,
  onPlanNext,
  onDone,
  onEditPlan,
}: {
  details: ProfileDetails | null;
  loadError: string | null;
  events: JournalEvent[];
  upcoming: Upcoming[] | null;
  medications: Medication[];
  today: string;
  onBack: () => void;
  onRetry: () => void;
  onSave: (d: ProfileDetails) => Promise<{ error: string | null }>;
  onPlanNext: (item: UpcomingInput) => Promise<{ error: string | null }>;
  onDone: (item: Upcoming) => Promise<{ error: string | null } | void>;
  onEditPlan: (item: Upcoming) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const plans = upcoming ?? [];
  const w = latestWeight(events);
  const visit = lastVisit(events);
  const next = nextVisit(plans);
  const vaccines = vaccineRows(events, plans, details?.birth_on ?? null, today);
  const meds = medRows(medications, plans);
  const tel = telHref(details?.clinic_phone ?? null);
  const age = ageText(details?.birth_on ?? null, today);
  const none = <span className="text-ink-soft">Not set</span>;
  const show = (v: string | null) => (v ? <span className="break-words text-[15px]">{v}</span> : none);

  async function planNext(id: string, item: UpcomingInput) {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    const r = await onPlanNext(item);
    setBusy(null);
    if (r.error) setErrors((e) => ({ ...e, [id]: r.error! }));
  }

  const visitReason = visit ? VET_REASONS.find(([id]) => id === health(visit).reasons?.[0])?.[1] : null;

  return (
    <div className="mx-auto max-w-md px-3 pb-10 pt-3">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] rounded-[10px] border border-line bg-surface px-3 text-[15px] font-semibold"
        >
          <span aria-hidden="true">‹ </span>Back
        </button>
        <h2 className="text-xl font-bold leading-tight">Profile</h2>
      </div>

      {loadError && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-urgent/40 bg-urgent/10 px-3 py-2 text-sm">
          <span className="flex-1">Couldn&apos;t load the profile. ({loadError})</span>
          <button type="button" onClick={onRetry} className="min-h-[44px] font-medium underline">
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Basics</h3>
            <button
              type="button"
              disabled={!details}
              onClick={() => setEditing(true)}
              className="min-h-[44px] px-1 text-sm font-semibold text-accent underline underline-offset-2 disabled:opacity-60"
            >
              Edit
            </button>
          </div>
          <Box section="basics" label="Basics">
            <div className="grid grid-cols-2 gap-x-2 gap-y-2">
              <Field label="Breed">{show(details?.breed ?? null)}</Field>
              <Field label="Birthday">
                {details?.birth_on ? <span className="text-[15px]">{dayText(details.birth_on)}, {details.birth_on.slice(0, 4)}</span> : none}
                {age && <span className="text-[13px] text-ink-soft">{age}</span>}
              </Field>
              <Field label="Latest weight">
                {w ? (
                  <>
                    <span className="text-[15px]">
                      {round1(asWeight(w).value)} {asWeight(w).unit}
                    </span>
                    <span className="text-[13px] text-ink-soft">{shortDate(w.at)} · from the journal</span>
                  </>
                ) : (
                  none
                )}
              </Field>
              <Field label="Microchip">{show(details?.microchip ?? null)}</Field>
              <Field label="Insurance">{show(details?.insurance_provider ?? null)}</Field>
              <Field label="Policy number">{show(details?.insurance_policy ?? null)}</Field>
            </div>
          </Box>
        </div>

        <div className="grid gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Vet</h3>
          <Box section="vet" label="Vet">
            <div className="grid grid-cols-2 gap-x-2 gap-y-2">
              <Field label="Clinic">{show(details?.clinic_name ?? null)}</Field>
              <Field label="Phone">
                {tel ? (
                  <a href={tel} className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-accent underline underline-offset-2">
                    {details?.clinic_phone}
                  </a>
                ) : (
                  none
                )}
              </Field>
            </div>
            <Field label="Last visit">
              {visit ? (
                <span className="text-[15px]">
                  {shortDate(visit.at)}
                  {visitReason && <span className="text-ink-soft"> · {visitReason}</span>}
                </span>
              ) : (
                <span className="text-ink-soft">None logged</span>
              )}
            </Field>
            <Field label="Next visit">
              {next ? (
                <UpcomingList compact items={[next]} today={today} onDone={onDone} onEdit={onEditPlan} />
              ) : (
                <span className="text-ink-soft">{upcoming ? "None planned" : "Loading…"}</span>
              )}
            </Field>
          </Box>
        </div>

        <section aria-label="Vaccines" className="grid gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Vaccines</h3>
          <ul className="flex flex-col gap-1">
            {vaccines.map((v) => (
              <li
                key={v.id}
                data-status={v.status ?? undefined}
                className="lando-pill grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-xl border border-line bg-surface px-2.5 py-1"
              >
                <div className="min-w-0 py-1">
                  <div className="truncate">
                    <b>{v.label}</b>
                    <span className="text-ink-soft"> · {v.status ? VACCINE_STATUS_WORDS[v.status] : "not logged"}</span>
                  </div>
                  <div className="truncate text-sm text-ink-soft">
                    {v.lastOn ? `Given ${shortDate(`${v.lastOn}T12:00:00`)}` : "Never given"}
                    {v.nextOn && ` · ${v.planned ? "planned" : "next"} ${dayText(v.nextOn)}`}
                  </div>
                  {errors[v.id] && <div className="text-[13px] font-semibold text-danger">{errors[v.id]}</div>}
                </div>
                {v.offer && (
                  <button
                    type="button"
                    disabled={busy === v.id || !upcoming}
                    onClick={() => void planNext(v.id, v.offer!)}
                    aria-label={`Plan next ${v.label}`}
                    className="min-h-[44px] rounded-[10px] bg-accent px-3 font-semibold text-accent-ink disabled:opacity-60"
                  >
                    Plan next
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">Regular medications</h3>
          <Box section="medications" label="Regular medications">
            {meds.length === 0 ? (
              <span className="text-[15px] text-ink-soft">None added</span>
            ) : (
              <ul className="flex min-w-0 flex-col">
                {meds.map(({ med, next: due }) => (
                  <li key={med.id} className="border-b border-line/40 py-1.5 last:border-b-0">
                    <div className="truncate text-[15px]">
                      <b>{med.name}</b> <span className="text-ink-soft">{medReasonLabel(med.reason)}</span>
                    </div>
                    <div className="truncate text-[13px] text-ink-soft">{due ? `Next ${dueText(due)}` : upcoming ? "No next date planned" : "Loading…"}</div>
                  </li>
                ))}
              </ul>
            )}
          </Box>
        </div>
      </div>

      {editing && details && (
        <Sheet title="Edit profile" onClose={() => setEditing(false)}>
          <EditForm details={details} onSave={onSave} onDone={() => setEditing(false)} />
        </Sheet>
      )}
    </div>
  );
}

/** The small Edit form for the stored details: Basics, then Vet. Empty boxes clear a detail. */
function EditForm({ details, onSave, onDone }: { details: ProfileDetails; onSave: (d: ProfileDetails) => Promise<{ error: string | null }>; onDone: () => void }) {
  const [v, setV] = useState({
    breed: details.breed ?? "",
    birth_on: details.birth_on ?? "",
    microchip: details.microchip ?? "",
    insurance_provider: details.insurance_provider ?? "",
    insurance_policy: details.insurance_policy ?? "",
    clinic_name: details.clinic_name ?? "",
    clinic_phone: details.clinic_phone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await onSave({
      breed: v.breed || null,
      birth_on: v.birth_on || null,
      microchip: v.microchip || null,
      insurance_provider: v.insurance_provider || null,
      insurance_policy: v.insurance_policy || null,
      clinic_name: v.clinic_name || null,
      clinic_phone: v.clinic_phone || null,
    });
    setSaving(false);
    if (r.error) setError(r.error);
    else onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Box section="basics" label="Basics">
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          <Field label="Breed" htmlFor="pf-breed">
            <input id="pf-breed" value={v.breed} onChange={set("breed")} maxLength={PROFILE_MAX.breed} autoComplete="off" className={inputFull} />
          </Field>
          <Field label="Birthday" htmlFor="pf-birth">
            <input id="pf-birth" type="date" value={v.birth_on} onChange={set("birth_on")} className={inputFull} />
          </Field>
          <Field label="Microchip" htmlFor="pf-chip">
            <input id="pf-chip" value={v.microchip} onChange={set("microchip")} maxLength={PROFILE_MAX.microchip} autoComplete="off" className={inputFull} />
          </Field>
          <Field label="Insurance provider" htmlFor="pf-ins">
            <input id="pf-ins" value={v.insurance_provider} onChange={set("insurance_provider")} maxLength={PROFILE_MAX.insurance_provider} autoComplete="off" className={inputFull} />
          </Field>
          <Field label="Policy number" htmlFor="pf-policy">
            <input id="pf-policy" value={v.insurance_policy} onChange={set("insurance_policy")} maxLength={PROFILE_MAX.insurance_policy} autoComplete="off" className={inputFull} />
          </Field>
        </div>
      </Box>
      <Box section="vet" label="Vet">
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          <Field label="Clinic" htmlFor="pf-clinic">
            <input id="pf-clinic" value={v.clinic_name} onChange={set("clinic_name")} maxLength={PROFILE_MAX.clinic_name} autoComplete="off" className={inputFull} />
          </Field>
          <Field label="Phone" htmlFor="pf-phone">
            <input id="pf-phone" type="tel" inputMode="tel" value={v.clinic_phone} onChange={set("clinic_phone")} maxLength={PROFILE_MAX.clinic_phone} autoComplete="off" className={inputFull} />
          </Field>
        </div>
      </Box>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={saving} className="min-h-[44px] rounded-[10px] bg-accent px-4 font-semibold text-accent-ink disabled:opacity-60">
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
