# claude-brief-footer-owner-column
agent: technical director · apps: none · shared files: CLAUDE.md
authorized by: Joel, directly, in session — "After item add owner"

## 2026-09-16 00:55 — claim
Working on: adding an Owner column to the open-items footer, second, straight after Item.
Touching: CLAUDE.md only.
Depends on: #70, which added the footer rule an hour ago. Does not touch
claude/brief-record-livery-merge, which is pushed and unmerged and edits different files.

## 2026-09-16 00:55 — the distinction this makes explicit
The first version had one `Agent` column at the far right doing two jobs badly. In the first footer
it produced, "Send the GitHub Support request" landed with `Joel` in a column named *Agent*, which is
a category error: Joel is not an agent, he is the person who has to act.

Owner is who takes the next action. Agent is whose area it is. They are often the same and the times
they are not are exactly the rows worth seeing — re-uploading the resume template is Joel's to do and
the Resume Formatter's area, and one column cannot say both.

Second position rather than appended, because Joel asked for it after Item and the reason holds up:
reading the item and knowing whose it is should be one movement. The far right of a table is where a
column goes to be missed, which is what happened.

## 2026-09-16 00:56 — handoff
Landed: Owner as the second column, the Owner-versus-Agent distinction spelled out, and the
"Four columns" line corrected to five — which is the sort of thing that survives a careless edit and
then contradicts the table three lines below it.
Open: nothing.
Need from TD: nothing — the TD wrote it.

## 2026-09-16 01:00 — Joel pushed back on the column, correctly
"Owner may not be right. If you're waiting on me to approve a merge I need to see that front and
centre."

He is right and the evidence was in the footer that prompted it: `Owner` read `Joel` on seven of nine
rows. A column whose values are nearly all identical carries no information and costs a column's
width to say nothing, which makes the table harder to scan rather than easier.

The real problem was not the column though. It was that two pending merges sat as ordinary rows among
nine, reading as chores, when a merge is the one item that is purely his yes or no and that nothing
else can move without.

So a pending merge is hoisted out of the table onto its own line above it, named by branch and with
its CI state, and never appears as a row. The line is always written — "nothing" included — for the
same reason a blank Deployment section is indistinguishable from a forgotten one.

`Owner` is kept, because it still does real work on the rows where it differs from `Agent`. What is
added is the warning that produced this correction: if Owner comes out the same on nearly every row,
the fix is not a better column, it is that something belongs above the table.
