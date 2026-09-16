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
}

export type ChangeAction =
  | "replaced"
  | "kept-unchanged"
  | "cloned-overflow"
  | "trimmed-surplus"
  | "not-found-in-input"
  | "passthrough";

export interface ChangeLogEntry {
  section: string;
  detail: string;
  action: ChangeAction;
}
