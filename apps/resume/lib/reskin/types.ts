export interface ExperienceEntry {
  company: string;
  title: string;
  date: string;
  bullets: string[];
}

export interface CompetencyRow {
  label: string;
  items: string;
}

export interface StatCell {
  stat: string;
  desc: string;
}

/**
 * Plain extracted content — text, no formatting. This is everything the source
 * document contributes; every visual decision comes from the template.
 *
 * Education, Certifications and Hobbies are deliberately absent. They do not
 * change between applications, so they are copied straight from the template and
 * never read from the input. Edit them in the template itself.
 */
export interface SourceContent {
  summary: string | null;
  /** Null means the section was absent from the input, not that it was empty. */
  careerHighlights: StatCell[] | null;
  experience: ExperienceEntry[];
  competencies: CompetencyRow[] | null;
  /**
   * Sections of the source the template has nowhere to put — a "Projects"
   * heading, say — with how many lines sat under each. Absent when there are
   * none. Reported in the change log as `input-dropped`, because they are
   * source text that does not reach the output.
   */
  unplacedSections?: UnplacedSection[];
  /**
   * Career Highlights the source has but that could not be read into pairs — a
   * pipe table whose rows do not line up, or a Word table cell that is not one
   * metric and one description — as the text of each cell or paragraph.
   * Absent when there are none. **Not the same as `careerHighlights: null`**,
   * which means the input had none: reading these as absent once passed the
   * verdict while their text reached the document nowhere (TEC-79). Logged as
   * `input-not-read` and named in coverage's `notRead`, never in `missing`:
   * the report says they were not read and not placed, and the verdict does
   * not fail on it, because Career Highlights repeat items from the body
   * (Joel, 2026-09-29, TEC-87 option 3).
   */
  unreadableHighlights?: string[];
}

export interface UnplacedSection {
  heading: string;
  lines: number;
}

/**
 * What happened to one piece of a section. A closed vocabulary, because
 * `lib/verdict.ts` keys off it and never off the prose in `detail`.
 *
 * **The two kinds of drop are different events and must never share a name.**
 * `template-trimmed` is a line of the *template* the input had no counterpart
 * for — a third bullet under a job the source gives two. Nothing of the source
 * is lost; it is how positional matching works. `input-dropped` is text of the
 * *source* that had nowhere to go in the template — a loss. They were once one
 * action, `trimmed-surplus`, and the verdict read every template-side drop as an
 * input loss: the repo's own fixture pair reported FAIL over 100% coverage.
 *
 * `input-not-read` is source text this reformat refused to read rather than
 * guess at — today only Career Highlights that do not pair up — and so did not
 * place. It is said, never silent, and it is a note rather than a vote: the
 * highlights repeat body items, so no unique content is lost (Joel, 2026-09-29,
 * TEC-87). **It is not `input-dropped`**, which still fails the verdict.
 */
export type ChangeAction =
  | "replaced"
  | "kept-unchanged"
  | "cloned-overflow"
  | "template-trimmed"
  | "input-dropped"
  | "input-not-read"
  | "not-found-in-input"
  | "passthrough";

export interface ChangeLogEntry {
  section: string;
  detail: string;
  action: ChangeAction;
}
