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
 */
export type ChangeAction =
  | "replaced"
  | "kept-unchanged"
  | "cloned-overflow"
  | "template-trimmed"
  | "input-dropped"
  | "not-found-in-input"
  | "passthrough";

export interface ChangeLogEntry {
  section: string;
  detail: string;
  action: ChangeAction;
}
