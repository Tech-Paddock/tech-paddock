# Specs

Design agreed with Joel and written down before it is built, by whoever owns the decision, for
whoever owns the code. One file per thing.

**Why this exists.** Agents here never run at the same time and cannot see each other, so a design
settled in conversation reaches its builder only if it lands in the repo. A charter says what an
agent owns; a handoff says what state their area is in. Neither is the place for "here is a thing
that does not exist yet, and here is what it must and must not do".

**A spec is not a charter.** It describes one change, it is written by the agent who owns the
*decision* rather than the code, and it is done when the thing is built — at which point what
survives moves into the relevant handoff and the spec stops being read.

**Read it, then argue with it.** A spec is an opening position, not an instruction. If building it
shows the design is wrong, say so in your worklog and to Joel before you build it anyway — that is
the same rule as anywhere else here.
