/* Guest gate: guests send a request, reception approves it by assigning a room,
   and only then Guest Services unlocks. Reception check-out locks it again.
   Data is shared with the Reception dashboard through js/dyafa-store.js */
(function () {
  var COUNTRIES = ["Afghanistan","Albania","Algeria","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahrain","Bangladesh","Belgium","Brazil","Bulgaria","Canada","Chile","China","Colombia","Croatia","Cyprus","Czechia","Denmark","Egypt","Estonia","Finland","France","Georgia","Germany","Greece","Hungary","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Latvia","Lebanon","Libya","Lithuania","Malaysia","Mexico","Morocco","Netherlands","New Zealand","Nigeria","Norway","Oman","Pakistan","Palestine","Philippines","Poland","Portugal","Qatar","Romania","Russia","Saudi Arabia","Serbia","Singapore","Slovakia","Slovenia","South Africa","South Korea","Spain","Sri Lanka","Sudan","Sweden","Switzerland","Syria","Taiwan","Thailand","Tunisia","Turkey","Ukraine","United Arab Emirates","United Kingdom","United States","Uzbekistan","Vietnam","Yemen","Other"];
  var root = document.documentElement;
  var Store = window.DyafaStore;

  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function nightsBetween(a, b) {
    if (!a || !b) return 0;
    return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
  }

  /* The logged-in guest = the approved request of this browser (null otherwise) */
  function approvedGuest() {
    if (!Store) return null;
    var r = Store.session();
    return Store.hasAccess(r) ? r : null;
  }

  // Public helpers used by guest-services.js
  window.DyafaGuest = {
    get: function () {
      var r = approvedGuest(); if (!r) return null;
      return { type: "registered", roomNumber: r.roomNumber, registrationName: r.name, companionName: r.companionName || "", country: r.country, checkIn: r.checkIn, checkOut: r.checkOut, nights: r.nights, adults: r.adults, children: r.children };
    },
    summary: function () {
      var g = this.get(); if (!g) return "";
      var s = "\ud83c\udfe8 Registered guest\n\ud83d\udd11 Room: " + g.roomNumber + "\n\ud83d\udc64 Registration name: " + g.registrationName;
      if (g.companionName) s += "\n\ud83d\udc65 Staying with: " + g.companionName;
      if (g.checkIn && g.checkOut) s += "\n\ud83d\udcc5 Check-in: " + g.checkIn + " | Check-out: " + g.checkOut + " (" + g.nights + " night" + (g.nights > 1 ? "s" : "") + ")";
      return s + "\n\n";
    }
  };

  // Lock immediately (before paint) unless this browser holds an approved request
  if (!approvedGuest()) root.classList.add("gate-locked");

  document.addEventListener("DOMContentLoaded", function () {
    var overlay = document.getElementById("guestGate");
    var chip = document.getElementById("guestChip");
    if (!overlay) return;
    var $ = function (id) { return document.getElementById(id); };
    var form = $("ggForm"), regForm = $("ggRegForm"), pending = $("ggPending"), ended = $("ggEnded");
    var tabs = overlay.querySelector(".gg-tabs"), head = overlay.querySelector(".gg-head");
    var today = iso(new Date());

    // Returning, already-approved guest: skip the welcome splash and go straight to the services
    if (approvedGuest()) { var sp = $("splashScreen"); if (sp) sp.style.display = "none"; }

    $("ggCountry").innerHTML = '<option value="">Select country\u2026</option>' +
      COUNTRIES.map(function (c) { return "<option>" + c + "</option>"; }).join("");
    $("ggIn").min = today; $("ggOut").min = today;

    function updateNights() {
      var inV = $("ggIn").value;
      if (inV) {
        var next = new Date(inV + "T00:00:00"); next.setDate(next.getDate() + 1);
        $("ggOut").min = iso(next);
        if ($("ggOut").value && $("ggOut").value <= inV) $("ggOut").value = "";
      }
      var n = nightsBetween(inV, $("ggOut").value);
      $("ggNights").value = n > 0 ? n : "";
    }
    $("ggIn").addEventListener("change", updateNights);
    $("ggOut").addEventListener("change", updateNights);

    function renderChip(r) {
      if (!chip) return;
      if (!r) { chip.classList.remove("show"); return; }
      chip.querySelector(".gg-chip__text").innerHTML = '<i class="fas fa-user-circle"></i> Welcome, <b>' + esc(r.companionName || r.name) + '</b> \u00b7 Room <b>' + esc(r.roomNumber) + "</b>";
      chip.classList.add("show");
    }

    function prefillNames(r) {
      if (!r) return;
      ["roomNumber", "tourRoomNumber", "laundryRoomNumber", "housekeepingRoomNumber"].forEach(function (id) { var el = $(id); if (el && !el.value) el.value = r.roomNumber; });
      ["customerName", "tourCustomerName", "laundryCustomerName", "housekeepingCustomerName"].forEach(function (id) {
        var el = $(id); if (!el) return;
        el.value = r.companionName || r.name;          /* same name as "Welcome, <name> · Room N" */
        el.readOnly = true; el.title = "Your name is taken from your check-in";
        el.style.opacity = ".9";
      });
    }

    function showTab(t) {
      regForm.hidden = t !== "reg"; form.hidden = t !== "new";
      overlay.querySelectorAll(".gg-tab").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-gg") === t); });
    }
    overlay.querySelectorAll(".gg-tab").forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-gg")); }); });

    /* Which panel the gate shows: forms / waiting for reception / stay ended */
    function showPanel(p) {
      var f = p === "forms";
      head.hidden = !f; tabs.hidden = !f;
      pending.hidden = p !== "pending"; ended.hidden = p !== "ended";
      if (f) showTab(tabs.querySelector(".gg-tab.active").getAttribute("data-gg"));
      else { form.hidden = true; regForm.hidden = true; }
    }

    var lastEnded = null;
    function refresh() {
      var r = Store ? Store.session() : null;
      if (Store.hasAccess(r)) {
        root.classList.remove("gate-locked");
        renderChip(r); prefillNames(r); return;
      }
      // not approved: keep everything locked
      root.classList.add("gate-locked"); renderChip(null);
      if (!r) { showPanel("forms"); return; }
      if (r.status === "pending") {
        $("ggPendName").textContent = r.companionName || r.name;
        $("ggPendInfo").textContent = r.type === "registered"
          ? "Room " + r.requestedRoom + " \u00b7 registration name: " + r.name + (r.companionName ? " \u00b7 with: " + r.companionName : "")
          : r.country + " \u00b7 " + r.checkIn + " \u2192 " + r.checkOut + " (" + r.nights + " night" + (r.nights > 1 ? "s" : "") + ")";
        showPanel("pending"); return;
      }
      // rejected or checked-out
      lastEnded = r.status;
      var msg = {
        "checked-out": ["Your stay has ended", "You have been checked out, so Guest Services is no longer available. Thank you for staying with us!"],
        "revoked": ["Access removed", "Reception has removed your Guest Services access. Please contact the front desk if you think this is a mistake."],
        "rejected": ["Request not approved", "Reception could not approve this request. Please visit the front desk or send a new request."]
      }[r.status] || ["Access ended", "Please contact the front desk."];
      $("ggEndedTitle").textContent = msg[0]; $("ggEndedText").textContent = msg[1];
      showPanel("ended");
    }

    function setInvalid(id, bad) { $(id).closest(".gg-field").classList.toggle("invalid", bad); return bad; }

    /* New check-in -> creates a PENDING request for reception */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = {
        firstName: $("ggFirst").value.trim(), lastName: $("ggLast").value.trim(),
        checkIn: $("ggIn").value, checkOut: $("ggOut").value,
        adults: parseInt($("ggAdults").value, 10), children: parseInt($("ggChildren").value, 10),
        country: $("ggCountry").value
      };
      d.nights = nightsBetween(d.checkIn, d.checkOut);
      var bad = [
        setInvalid("ggFirst", !d.firstName), setInvalid("ggLast", !d.lastName),
        setInvalid("ggIn", !d.checkIn || d.checkIn < today), setInvalid("ggOut", !d.checkOut || d.nights < 1),
        setInvalid("ggAdults", !(d.adults >= 1)), setInvalid("ggChildren", !(d.children >= 0)), setInvalid("ggCountry", !d.country)
      ].some(Boolean);
      if (bad) return;
      showNewError("");
      if (!Store || !Store.enabled) { showNewError("The hotel system is not connected yet. Please ask the front desk."); return; }
      var btn = form.querySelector(".gg-submit"); btn.disabled = true;
      Store.guestCreate({ firstName: d.firstName, lastName: d.lastName, checkIn: d.checkIn, checkOut: d.checkOut, adults: d.adults, children: d.children, country: d.country })
        .then(refresh)
        .catch(function (err) { showNewError(err && err.message === "busy" ? "Reception is receiving many requests right now. Please try again in a minute." : "We could not send your request. Please check your internet connection and try again."); })
        .then(function () { btn.disabled = false; });
    });
    function showNewError(m) { var el = $("ggNewError"); if (el) { el.textContent = m; el.hidden = !m; } }

    var roomErr = $("ggRoom").parentNode.querySelector(".gg-err"), roomErrDefault = roomErr.textContent;
    $("ggRoom").addEventListener("input", function () { roomErr.textContent = roomErrDefault; });

    /* Already registered -> the server checks room + name, then logs in at once if this exact guest was approved before, otherwise sends a pending request to Reception > Guest Requests */
    regForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var room = $("ggRoom").value.trim(), name = $("ggRegName").value.trim(), companion = $("ggCompanion").value.trim();
      var err = $("ggRegError"); err.hidden = true; err.style.display = "";
      var bad = [setInvalid("ggRoom", !room), setInvalid("ggRegName", !name), setInvalid("ggCompanion", !companion)].some(Boolean);
      if (bad) return;
      function showErr(m) { err.textContent = m; err.hidden = false; err.style.display = "block"; }
      if (!Store || !Store.enabled) { showErr("The hotel system is not connected yet. Please ask the front desk."); return; }
      var btn = regForm.querySelector(".gg-submit"); btn.disabled = true;
      Store.guestLogin(room, name, companion).then(function (res) {
        if (res.ok) { refresh(); return; }
        if (res.error === "companion_required") { setInvalid("ggCompanion", true); return; }
        if (res.error === "no_room") { roomErr.textContent = "No registration in this room"; setInvalid("ggRoom", true); return; }
        showErr("We couldn't find a registered stay for this room number and registration name. Please check both and try again, or ask the front desk.");
      }).catch(function (ex) {
        showErr(ex && ex.message === "busy" ? "Reception is receiving many requests right now. Please try again in a minute." : "We could not reach the hotel system. Please check your internet connection and try again.");
      }).then(function () { btn.disabled = false; });
    });

    function leave() {
      Store.guestLeave();   // cancels a waiting request / signs this browser out
      form.reset(); regForm.reset(); $("ggNights").value = "";
      refresh();
    }
    var out = $("ggSignOut"); if (out) out.addEventListener("click", leave);
    $("ggCancel").addEventListener("click", leave);
    $("ggNewReq").addEventListener("click", leave);

    /* Esc closes the check-in card (same as the X): back to the home page */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.documentElement.classList.contains("gate-locked")) window.location.href = "index.html";
    });

    refresh();
    Store && Store.onChange(refresh);                 // reception changed something in another tab
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
    setInterval(refresh, 3000);                       // safety net (same-tab / missed events)
  });
})();
