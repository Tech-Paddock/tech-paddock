/* Shared field pieces. Imports nothing from LogForm: LogForm, WhenField and VaccineFields all import from here, so no import loop (#71). */

export function Field({ label, htmlFor, children, className = "" }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  const lbl = "text-[11px] uppercase tracking-[0.06em] text-ink-soft";
  return (
    <div className={`grid min-w-0 content-start gap-0.5 ${className}`}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={lbl}>
          {label}
        </label>
      ) : (
        <span className={lbl}>{label}</span>
      )}
      {children}
    </div>
  );
}

/**
 * A box of a form (TEC-199): Box 1 is When and Logging as, Box 2 the entry, Box 3 the secondary things. The
 * `data-section` marks them in order for the tests and for anyone reading the form.
 */
export function Box({ section, label, children, className = "" }: { section: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <section data-section={section} aria-label={label} className={`grid gap-1 rounded-xl border border-line bg-paper p-1.5 ${className}`}>
      {children}
    </section>
  );
}

/**
 * The one field class (TEC-255): every text box, number box and select in the app has this padding and this
 * height (`px-2.5`, 44px), so no two fields differ by a few pixels. It carries no width (TEC-202): Tailwind writes
 * `w-full` after `w-[64px]` and `w-auto`, so a width here would beat every narrow field. A field never sizes
 * itself from its content or its options: it names a width, and the default is half its section (`inputHalf`).
 * `inputFull` is for a field that fills a column which is already sized (a half column, a grid cell), and for the
 * rare field with a reason to be wide, which says why where it is used (the Note: free text).
 */
export const input =
  "min-w-0 min-h-[44px] rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-[15px] outline-none focus:border-accent";

/** Fills its column (a half column, a grid cell). */
export const inputFull = `${input} w-full`;

/** The default: half the section's width. */
export const inputHalf = `${input} w-1/2`;

/** Who in the bottom row, and Logging as on the Log tab: one fixed width, wide enough for a name. */
export const WHO_WIDTH = "w-[140px]";
