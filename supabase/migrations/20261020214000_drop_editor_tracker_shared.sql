-- Drop the retired Message Editor and Pipeline Tracker, and the shared contacts (TEC-117)
--
-- Shape: **destructive, second of two.** The first pull request removed every
-- reader and writer: Resume stopped using `tracker.pipeline_threads` and
-- `renders.thread_id`, and `apps/editor` and `apps/tracker` were deleted. Their
-- data goes with them; nothing is kept or copied.
--
-- Tables are dropped by name and each schema with RESTRICT, so an object nobody
-- listed here fails the migration rather than vanishing silently.
--
-- After it runs, remove `shared`, `editor` and `tracker` from the dashboard's
-- exposed schemas.

alter table resume.renders drop constraint renders_thread_id_fkey;
alter table resume.renders drop column thread_id;

drop table tracker.pipeline_threads;
drop table editor.message_history;
drop table editor.model_status;
drop table editor.style_guide;
drop table shared.contacts;

drop schema tracker restrict;
drop schema editor restrict;
drop schema shared restrict;
