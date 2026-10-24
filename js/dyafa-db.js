/* Creates the one shared Supabase client for the whole website (loaded after supabase-js and supabase-config.js).
   window.DyafaDB.enabled is false until js/supabase-config.js has real values – the site still opens, it just can't save. */
(function () {
  var cfg = window.DYAFA_SUPABASE || {};
  var ok = !!(cfg.url && cfg.anonKey && !/YOUR[-_]/i.test(cfg.url + cfg.anonKey) && window.supabase && window.supabase.createClient);
  var client = null;
  if (ok) {
    try { client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } }); }
    catch (e) { console.error("Supabase could not start:", e); ok = false; }
  } else {
    console.warn("[Dyafa] Supabase is not configured yet – edit js/supabase-config.js");
  }

  /* Website forms (contact, newsletter, booking request). Resolves true when saved. */
  var FORM_TABLES = { contact_messages: 1, newsletter_subscribers: 1, booking_inquiries: 1 };
  function submit(table, row) {
    if (!client || !FORM_TABLES[table]) return Promise.resolve(false);
    return client.from(table).insert(row).then(function (res) {
      if (res.error) {
        if (res.error.code === "23505") return true;          // newsletter: already subscribed = fine
        console.error("Could not save form:", res.error); return false;
      }
      return true;
    }, function (e) { console.error(e); return false; });
  }

  window.DyafaDB = { enabled: ok, client: client, submit: submit };
})();
