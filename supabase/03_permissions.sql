-- Table permissions for the public site and the admin page. Safe to run more than once.
grant usage on schema public to anon, authenticated;
grant select on hosts, shows, episodes, settings, threads, posts to anon, authenticated;
grant insert on threads, posts to anon, authenticated;
grant insert, update, delete on hosts, shows, episodes, settings to authenticated;
grant delete on threads, posts to authenticated;
