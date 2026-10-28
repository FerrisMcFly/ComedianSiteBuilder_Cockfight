// Who someone is on a site, for the server functions. Mirrors the database's rules (supabase/99_rules.sql):
//   ComicTable admin: everything. ComicTable staff: every site's content, but not its team.
//   Site owner: everything on the site, including the team. Editor: everything but the team.
//   Shows only: dates, clubs and the show finder. Moderator: forum and chat.
export async function accessFor(db, userId, siteId) {
  const [{ data: row }, { data: plat }] = await Promise.all([
    db.from("admins").select("*").eq("user_id", userId).eq("site_id", siteId).maybeSingle(),
    db.from("platform_admins").select("*").eq("user_id", userId).maybeSingle()]);
  const platform = plat ? (plat.role || "admin") : null;
  // ComicTable admins act as a site's owner; staff as an editor. Otherwise it's their role on this site.
  const role = platform === "admin" ? "owner" : platform === "staff" ? "editor" : row ? (row.role || "owner") : null;
  const full = role === "owner" || role === "editor";
  return {
    platform, role, full,
    // one part of a site: "shows" (dates, clubs, show finder) or "community" (forum, chat)
    can: (area) => full || (area === "shows" && role === "shows") || (area === "community" && role === "moderator"),
  };
}
