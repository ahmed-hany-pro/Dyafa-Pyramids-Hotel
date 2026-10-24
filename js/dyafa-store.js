/* Dyafa data layer – talks to Supabase.
   Two modes, same file:
   • GUEST  (guest-services.html)  – no login. A guest only uses the small "guest_*" database functions and proves
                                     who he is with the request id + secret token that is kept in his browser.
   • STAFF  (reception/)           – Reception signs in with email + password (Supabase Auth). The dashboard keeps a
                                     local copy of the data in memory so the existing screens stay instant; every change
                                     is saved to Supabase and every change made on another device arrives live (Realtime).
   Needs: supabase-js, js/supabase-config.js, js/dyafa-db.js (loaded before this file). */
(function () {
  var DB = window.DyafaDB || {};
  var sb = DB.client || null;

  var SESSION_KEY = "dyafaGuestSession";   // id of this browser's request
  var TOKEN_KEY   = "dyafaGuestToken";     // its secret token (given by the server)
  var CACHE_KEY   = "dyafaGuestRequest";   // last known copy of the request (only so the page paints without flicker)

  var staffMode = false;
  var changeCbs = [], bookingCbs = [], errorCbs = [];
  function fire(list) { list.slice().forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } }); }
  function P(x) { return Promise.resolve(x); }                       // supabase builders are "thenables" – wrap them
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function norm(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
  function newId(p) { return p + Date.now() + Math.floor(Math.random() * 1000); }
  function nowIso() { return new Date().toISOString(); }
  function need() { if (!sb) throw new Error("Supabase is not configured (edit js/supabase-config.js)"); }
  /* JSON with sorted keys – Postgres jsonb does not keep key order, so compare in a canonical form */
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
    return JSON.stringify(v);
  }
  function errMsg(e) { return (e && (e.message || e.error_description)) || String(e || "error"); }

  /* =====================================================================
     GUEST SIDE
     ===================================================================== */
  var guestReq = null;
  try { guestReq = JSON.parse(ls(CACHE_KEY)); } catch (e) { guestReq = null; }
  if (guestReq && guestReq.id !== ls(SESSION_KEY)) guestReq = null;

  function setGuestSession(id, token) {
    lsSet(SESSION_KEY, id || null); lsSet(TOKEN_KEY, token || null);
    if (!id) { guestReq = null; lsSet(CACHE_KEY, null); }
  }
  function guestRefresh() {
    var id = ls(SESSION_KEY), tok = ls(TOKEN_KEY);
    if (!sb || staffMode || !id || !tok) return P();
    return P(sb.rpc("guest_get", { p_id: id, p_token: tok })).then(function (res) {
      if (res.error) return;                                          // offline / server hiccup: keep what we have
      var r = res.data;
      if (!r) { setGuestSession(null); fire(changeCbs); return; }    // request no longer exists
      if (stable(r) !== stable(guestReq)) { guestReq = r; lsSet(CACHE_KEY, JSON.stringify(r)); fire(changeCbs); }
    }, function () {});
  }
  var guestTimer = null;
  function startGuestPolling() {
    if (guestTimer || !sb) return;
    guestTimer = setInterval(function () { if (!document.hidden && !staffMode && ls(SESSION_KEY)) guestRefresh(); }, 4000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) guestRefresh(); });
    window.addEventListener("focus", guestRefresh);
  }

  /* =====================================================================
     STAFF SIDE – in-memory copy + write-through + realtime
     ===================================================================== */
  var TABLES = { requests: "guest_requests", orders: "guest_orders", tours: "tour_bookings", bookings: "bookings" };
  var cache = { requests: [], orders: [], tours: [] };
  var bookingList = [];                 // shared array – the Reception screens use it directly
  var snap = {};                        // bookings as last saved/received: id -> canonical json
  var inflight = {};                    // "key:id" -> number of writes in flight (realtime echoes are ignored meanwhile)
  var channel = null, everSubscribed = false;

  function fail(e) { console.error("[Dyafa] save failed:", e); fire(errorCbs.map(function (cb) { return function () { cb(errMsg(e)); }; })); }
  function withRetry(fn, tries) {
    tries = tries || 3;
    return fn().then(function (res) {
      if (res && res.error) throw res.error;
      return res;
    }).catch(function (e) {
      if (tries <= 1) throw e;
      return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return withRetry(fn, tries - 1); });
    });
  }
  function track(k, promise) {
    inflight[k] = (inflight[k] || 0) + 1;
    return promise.then(function (v) { inflight[k]--; return v; }, function (e) { inflight[k]--; throw e; });
  }
  function pushRow(key, obj) {
    need();
    var row = { id: obj.id, data: JSON.parse(JSON.stringify(obj)) };
    return track(key + ":" + obj.id, withRetry(function () { return P(sb.from(TABLES[key]).upsert(row)); })).catch(fail);
  }
  function deleteRow(key, id) {
    need();
    return track(key + ":" + id, withRetry(function () { return P(sb.from(TABLES[key]).delete().eq("id", id)); })).catch(fail);
  }

  function fetchAll(key) {                     // pages of 1000 (the API limit)
    var out = [], from = 0, size = 1000;
    function next() {
      return P(sb.from(TABLES[key]).select("id,data").order("created_at", { ascending: true }).order("id").range(from, from + size - 1)).then(function (res) {
        if (res.error) throw res.error;
        out = out.concat(res.data || []);
        if ((res.data || []).length === size) { from += size; return next(); }
        return out;
      });
    }
    return next();
  }

  function applyList(key, rows) {              // full replace, but keep rows that are still being written
    var keep = cache[key].filter(function (o) { return inflight[key + ":" + o.id] > 0; });
    var ids = {}; rows.forEach(function (r) { ids[r.id] = 1; });
    var next = rows.filter(function (r) { return !(inflight[key + ":" + r.id] > 0); }).map(function (r) { return r.data; });
    keep.forEach(function (o) { next.push(o); });
    cache[key] = next;
  }
  function mergeBooking(obj) {
    var i = -1; bookingList.forEach(function (b, n) { if (b.id === obj.id) i = n; });
    var json = stable(obj);
    if (i >= 0) {
      var cur = bookingList[i];
      if (stable(cur) !== snap[obj.id]) return false;        // there is an unsaved local edit – it wins
      if (snap[obj.id] === json) return false;               // nothing new
      Object.keys(cur).forEach(function (k) { delete cur[k]; }); Object.assign(cur, obj);
    } else bookingList.push(obj);
    snap[obj.id] = json; return true;
  }
  function applyBookings(rows) {
    var changed = false, ids = {};
    rows.forEach(function (r) { ids[r.id] = 1; if (!(inflight["bookings:" + r.id] > 0) && mergeBooking(r.data)) changed = true; });
    for (var i = bookingList.length - 1; i >= 0; i--) {
      var b = bookingList[i];
      if (!ids[b.id] && snap[b.id] !== undefined && !(inflight["bookings:" + b.id] > 0)) { bookingList.splice(i, 1); delete snap[b.id]; changed = true; }
    }
    return changed;
  }

  function reloadAll() {
    return Promise.all([fetchAll("requests"), fetchAll("orders"), fetchAll("tours"), fetchAll("bookings")]).then(function (r) {
      applyList("requests", r[0]); applyList("orders", r[1]); applyList("tours", r[2]);
      var bch = applyBookings(r[3]);
      fire(changeCbs); if (bch) fire(bookingCbs);
    });
  }

  function onRemote(key, p) {
    var id = (p.eventType === "DELETE" ? p.old : p.new) && (p.eventType === "DELETE" ? p.old : p.new).id;
    if (!id || inflight[key + ":" + id] > 0) return;
    if (key === "bookings") {
      var ch = false;
      if (p.eventType === "DELETE") { for (var i = bookingList.length - 1; i >= 0; i--) if (bookingList[i].id === id) { bookingList.splice(i, 1); delete snap[id]; ch = true; } }
      else ch = mergeBooking(p.new.data);
      if (ch) fire(bookingCbs);
      return;
    }
    var list = cache[key].filter(function (o) { return o.id !== id; });
    if (p.eventType !== "DELETE") list.push(p.new.data);
    cache[key] = list;
    fire(changeCbs);
  }
  function subscribe() {
    if (channel) return;
    channel = sb.channel("dyafa-reception");
    Object.keys(TABLES).forEach(function (key) {
      channel.on("postgres_changes", { event: "*", schema: "public", table: TABLES[key] }, function (p) { onRemote(key, p); });
    });
    channel.subscribe(function (status) {
      if (status === "SUBSCRIBED") { if (everSubscribed) reloadAll().catch(function () {}); everSubscribed = true; }
    });
  }

  /* upsert helpers used by the Store methods below */
  function patchRow(key, id, patch) {
    var o = null;
    cache[key].forEach(function (r) { if (r.id === id) { Object.assign(r, patch); o = r; } });
    if (o) { pushRow(key, o); fire(changeCbs); }
    return o;
  }
  function addRow(key, obj) { cache[key].push(obj); pushRow(key, obj); fire(changeCbs); return obj; }
  function dropRow(key, id) { cache[key] = cache[key].filter(function (r) { return r.id !== id; }); deleteRow(key, id); fire(changeCbs); }

  /* ONE rule for "has Guest Services access" */
  function hasAccess(r) {
    if (!r || r.status !== "approved" || !r.roomNumber) return false;
    if (!staffMode) return true;                         // the server only keeps "approved" while the stay is open
    if (!r.bookingId) return false;
    var b = bookingList.filter(function (x) { return x.id === r.bookingId; })[0];
    return !!(b && b.status !== "checked-out");
  }

  var Store = {
    enabled: !!sb,
    hasAccess: hasAccess,

    /* ---------------- GUEST ---------------- */
    session: function () { return guestReq && guestReq.id === ls(SESSION_KEY) ? guestReq : null; },
    isApproved: function () { return hasAccess(this.session()); },
    refreshSession: guestRefresh,
    /* "New check-in" tab -> pending request. Resolves with the request. */
    guestCreate: function (data) {
      try { need(); } catch (e) { return Promise.reject(e); }
      return P(sb.rpc("guest_create_new", { p: data })).then(function (res) {
        if (res.error) throw new Error(res.error.message === "busy" ? "busy" : "invalid");
        setGuestSession(res.data.id, res.data.token);
        return guestRefresh().then(function () { fire(changeCbs); return Store.session(); });
      });
    },
    /* "Already registered" tab. Resolves {ok:true} or {ok:false, error:"no_room"|"not_found"} */
    guestLogin: function (room, name, companion) {
      try { need(); } catch (e) { return Promise.reject(e); }
      return P(sb.rpc("guest_login", { p_room: room, p_name: name, p_companion: companion || "" })).then(function (res) {
        if (res.error) throw new Error(res.error.message === "busy" ? "busy" : errMsg(res.error));
        var d = res.data;
        if (!d.ok) return d;
        setGuestSession(d.id, d.token);
        return guestRefresh().then(function () { fire(changeCbs); return { ok: true }; });
      });
    },
    /* sign out / cancel a waiting request */
    guestLeave: function () {
      var id = ls(SESSION_KEY), tok = ls(TOKEN_KEY), r = this.session();
      setGuestSession(null);
      fire(changeCbs);
      if (sb && id && tok && r && r.status === "pending") return P(sb.rpc("guest_cancel", { p_id: id, p_token: tok })).then(function () {}, function () {});
      return P();
    },
    /* food / laundry / housekeeping / transport -> Reception. Resolves true when saved. */
    addOrder: function (o) {
      var id = ls(SESSION_KEY), tok = ls(TOKEN_KEY);
      if (!sb || !id || !tok) return P(false);
      return P(sb.rpc("guest_add_order", { p_id: id, p_token: tok, p: o })).then(function (res) {
        if (res.error) { console.error(res.error); return false; } return true;
      }, function (e) { console.error(e); return false; });
    },
    addTour: function (t) {
      var id = ls(SESSION_KEY), tok = ls(TOKEN_KEY);
      if (!sb || !id || !tok) return P(false);
      return P(sb.rpc("guest_add_tour", { p_id: id, p_token: tok, p: t })).then(function (res) {
        if (res.error) { console.error(res.error); return false; } return true;
      }, function (e) { console.error(e); return false; });
    },
    /* public site settings (e.g. hidden menu items) */
    getSetting: function (key) {
      if (!sb) return P(null);
      return P(sb.from("site_settings").select("value").eq("key", key).maybeSingle()).then(function (res) { return res.error || !res.data ? null : res.data.value; }, function () { return null; });
    },

    /* ---------------- STAFF: login ---------------- */
    staffSession: function () {
      if (!sb) return P(null);
      return P(sb.auth.getSession()).then(function (res) {
        if (!res.data || !res.data.session) return null;
        return Store._checkStaff().then(function (ok) { return ok ? res.data.session : null; });
      });
    },
    staffSignIn: function (email, password) {
      try { need(); } catch (e) { return Promise.reject(e); }
      return P(sb.auth.signInWithPassword({ email: email, password: password })).then(function (res) {
        if (res.error) throw new Error("Wrong email or password.");
        return Store._checkStaff().then(function (ok) {
          if (!ok) return P(sb.auth.signOut()).then(function () { throw new Error("This account is not allowed to use Reception. Ask the manager to add you as staff."); });
          return res.data.session;
        });
      });
    },
    _checkStaff: function () { return P(sb.rpc("is_staff")).then(function (r) { return !r.error && r.data === true; }, function () { return false; }); },
    staffSignOut: function () { return sb ? P(sb.auth.signOut()).then(function () { location.reload(); }) : P(); },
    /* load everything and start live updates; call once after sign-in */
    startStaff: function () {
      need(); staffMode = true;
      return reloadAll().then(function () {
        subscribe();
        setInterval(function () { reloadAll().catch(function () {}); }, 60000);   // safety net
        window.addEventListener("focus", function () { reloadAll().catch(function () {}); });
        return true;
      });
    },
    onError: function (cb) { errorCbs.push(cb); },
    onBookingsChange: function (cb) { bookingCbs.push(cb); },

    /* ---------------- STAFF: bookings (array is shared with the dashboard) ---------------- */
    bookingList: bookingList,
    /* call after changing the array: saves what is new / changed / removed */
    saveBookings: function () {
      if (!sb || !staffMode) return;
      var rows = [], seen = {};
      bookingList.forEach(function (b) {
        seen[b.id] = 1;
        var j = stable(b);
        if (snap[b.id] !== j) { snap[b.id] = j; rows.push(b); }
      });
      var gone = Object.keys(snap).filter(function (id) { return !seen[id]; });
      gone.forEach(function (id) { delete snap[id]; });
      if (rows.length) {
        var payload = rows.map(function (b) { return { id: b.id, data: JSON.parse(JSON.stringify(b)) }; });
        var keys = rows.map(function (b) { return "bookings:" + b.id; });
        keys.forEach(function (k) { inflight[k] = (inflight[k] || 0) + 1; });
        withRetry(function () { return P(sb.from("bookings").upsert(payload)); })
          .catch(function (e) { rows.forEach(function (b) { delete snap[b.id]; }); fail(e); setTimeout(function () { Store.saveBookings(); }, 8000); })
          .then(function () { keys.forEach(function (k) { inflight[k]--; }); });
      }
      gone.forEach(function (id) {
        inflight["bookings:" + id] = (inflight["bookings:" + id] || 0) + 1;
        withRetry(function () { return P(sb.from("bookings").delete().eq("id", id)); })
          .catch(function (e) { fail(e); })
          .then(function () { inflight["bookings:" + id]--; });
      });
    },

    /* ---------------- STAFF: guest requests ---------------- */
    withAccess: function () { return cache.requests.filter(hasAccess); },
    all: function () { return cache.requests; },
    get: function (id) { return cache.requests.filter(function (r) { return r.id === id; })[0] || null; },
    update: function (id, patch) { return patchRow("requests", id, patch); },
    remove: function (id) { dropRow("requests", id); },
    approve: function (id, roomNumber, bookingId) { return this.update(id, { status: "approved", roomNumber: String(roomNumber), bookingId: bookingId || null, approvedAt: nowIso() }); },
    reject: function (id) { return this.update(id, { status: "rejected", endedAt: nowIso() }); },
    /* check-out: revoke every approved request linked to this booking / room */
    checkOut: function (bookingId, roomNumber) {
      var n = 0;
      cache.requests.forEach(function (r) {
        if (r.status === "approved" && ((bookingId && r.bookingId === bookingId) || (!bookingId && String(r.roomNumber) === String(roomNumber)))) {
          patchRow("requests", r.id, { status: "checked-out", endedAt: nowIso() }); n++;
        }
      });
      return n;
    },
    /* remove access (guest is logged out, stay stays open) */
    revoke: function (bookingId) {
      var n = 0;
      cache.requests.forEach(function (r) { if (r.status === "approved" && r.bookingId === bookingId) { patchRow("requests", r.id, { status: "revoked", endedAt: nowIso() }); n++; } });
      return n;
    },
    /* give access to an in-house booking */
    grant: function (b) {
      var prev = null;
      cache.requests.forEach(function (r) { if (r.bookingId === b.id && r.status === "revoked") prev = r; });
      if (prev) { delete prev.endedAt; patchRow("requests", prev.id, { status: "approved", roomNumber: String(b.roomNum), name: b.guestName, approvedAt: nowIso() }); }
      else addRow("requests", { id: newId("rq"), type: "registered", status: "approved", createdAt: nowIso(), approvedAt: nowIso(), name: b.guestName,
        requestedRoom: String(b.roomNum), roomNumber: String(b.roomNum), bookingId: b.id, country: b.nationality || "",
        checkIn: b.checkIn, checkOut: b.checkOut, adults: b.adults, children: b.children });
    },

    /* ---------------- STAFF: orders ---------------- */
    orders: function () { return cache.orders; },
    updateOrder: function (id, patch) { return patchRow("orders", id, patch); },
    removeOrder: function (id) { dropRow("orders", id); },
    /* several receptionists can have the dashboard open: only ONE of them may turn an order into a bill */
    claimOrder: function (id) {
      var o = cache.orders.filter(function (x) { return x.id === id; })[0];
      if (!o || o.billed) return P(false);
      o.billed = true;                                   // local guard so we never claim twice
      return P(sb.rpc("staff_claim_order", { p_id: id })).then(function (res) {
        if (res.error) { o.billed = false; fail(res.error); return false; }
        return res.data === true;
      }, function (e) { o.billed = false; fail(e); return false; });
    },

    /* ---------------- STAFF: tours ---------------- */
    tours: function () { return cache.tours; },
    updateTour: function (id, patch) { return patchRow("tours", id, patch); },
    removeTour: function (id) { dropRow("tours", id); },

    /* run cb whenever requests / orders / tours change (this tab, another tab, another device) */
    onChange: function (cb) { changeCbs.push(cb); }
  };

  /* helper kept for the sign-in screen text */
  Store.norm = norm;
  window.DyafaStore = Store;
  if (sb) startGuestPolling();
})();
