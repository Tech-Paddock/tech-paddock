-- The `health` schema: an empty room with the lights on.
--
-- Deliberately no tables. The standup protocol asks only whether a new tool
-- needs its own schema, and the answer for health is yes — the plan at
-- `.claude/HEALTH-PLAN.md` names `health` alongside the folder, the subdomain
-- and the Vercel project as the four things the name fixes at once.
--
-- **The tables are the Health agent's to design, not the scaffold's.** That
-- plan is explicit that everything in it is the first feature of `health`
-- rather than the whole of it, and shaping the macro tables before the agent
-- exists is exactly the "set of decisions nobody made" the protocol warns
-- about. What ships here is the schema and its grants, because those are what
-- make the agent's first migration a normal one rather than a three-step
-- special case.
--
-- **Shape: additive.** It creates a schema and grants on it. No existing object
-- is touched, nothing can violate it, and no code depends on it yet.

create schema if not exists health;
