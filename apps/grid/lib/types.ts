/** What `GET /api/today` returns: one local day, read in one request. */
export type Task = { id: string; title: string; due_on: string | null; done_on: string | null };
export type Routine = { id: string; name: string; weekdays: number[]; ticked: boolean };
export type JournalVersion = { id: string; body: string; created_at: string };
/** One entry: its versions oldest first; it reads as the last. */
export type JournalEntry = { entry_id: string; versions: JournalVersion[] };
export type Session = { id: string; planned_seconds: number; elapsed_seconds: number; finished: boolean };

export type Today = {
  day: string;
  tasks: Task[];
  routines: Routine[];
  journal: JournalEntry[];
  meditation: { streak: number; sessions: Session[] };
};

/** `GET /api/more`: goals, lists and every routine, for the quiet second page. */
export type Goal = { id: string; title: string; done: boolean };
export type ListItem = { id: string; text: string; done: boolean };
export type GridList = { id: string; name: string; items: ListItem[] };
export type RoutineRow = { id: string; name: string; weekdays: number[] };

export type More = { goals: Goal[]; lists: GridList[]; routines: RoutineRow[] };
