/* Shared behaviour for every page. Uses the same localStorage key ("theme") as the guest app. */
(function () {
  var root = document.documentElement;

  /* ===== Settings you may want to edit ===== */
  var HOTEL_EMAIL = "dyafapyramidshotel@gmail.com";   // forms open an email to this address
  var SOCIAL = {                                       // paste your real profile links here
    facebook: "", twitter: "", instagram: "", youtube: "", linkedin: ""
  };

  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function toast(msg) {
    var t = document.createElement("div"); t.className = "dy-toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3500);
  }
  function mailto(subject, lines) {
    window.location.href = "mailto:" + HOTEL_EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(lines.join("\n"));
  }

  /* Save a website form in Supabase. If Supabase is not set up / not reachable, fall back to the visitor's e-mail app (old behaviour). */
  function sendForm(table, row, form, okMsg, mailSubject, mailLines) {
    var btn = form.querySelector("[type=submit]"); if (btn) btn.disabled = true;
    var done = window.DyafaDB && window.DyafaDB.enabled ? window.DyafaDB.submit(table, row) : Promise.resolve(false);
    done.then(function (ok) {
      if (ok) { toast(okMsg); form.reset(); }
      else { mailto(mailSubject, mailLines); toast("Opening your email app to send your message…"); }
    }).then(function () { if (btn) btn.disabled = false; });
  }

  /* ===== Keep sticky elements flush under the real header height ===== */
  (function () {
    var nav = document.querySelector(".dy-nav");
    if (!nav) return;
    function sync() { root.style.setProperty("--dy-nav-actual", nav.getBoundingClientRect().height + "px"); }
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("load", sync);
    if (window.ResizeObserver) new ResizeObserver(sync).observe(nav);
  })();

  /* ===== Theme toggle + burger + dropdown ===== */
  function icon(btn) {
    var light = root.getAttribute("data-theme") === "light";
    btn.innerHTML = '<i class="fa-solid fa-' + (light ? "sun" : "moon") + '"></i>';
  }
  $all("[data-dy-theme-toggle]").forEach(function (btn) {
    icon(btn);
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      if (next === "light") root.setAttribute("data-theme", "light"); else root.removeAttribute("data-theme");
      try { localStorage.setItem("theme", next); } catch (e) {}
      icon(btn);
    });
  });
  var burger = document.querySelector("[data-dy-burger]"), links = document.getElementById("dyLinks");
  function closeMenu() { if (links) { links.classList.remove("open"); if (burger) burger.setAttribute("aria-expanded", "false"); } }
  if (burger && links) {
    burger.addEventListener("click", function () {
      var open = links.classList.toggle("open"); burger.setAttribute("aria-expanded", open);
    });
    links.addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(); });
  }
  $all(".dy-drop__btn").forEach(function (b) {
    b.addEventListener("click", function (e) { e.stopPropagation(); b.parentNode.classList.toggle("open"); });
  });
  document.addEventListener("click", function (e) {
    $all(".dy-drop.open").forEach(function (d) { if (!d.contains(e.target)) d.classList.remove("open"); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { $all(".dy-drop.open").forEach(function (d) { d.classList.remove("open"); }); closeMenu(); closeRoom(); }
  });

  /* ===== Header: shadow after scrolling (size stays fixed) ===== */
  var nav = document.querySelector(".dy-nav");
  if (nav) {
    var onScroll = function () { nav.classList.toggle("is-scrolled", window.scrollY > 4); };
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ===== Social links ===== */
  $all("a[data-social]").forEach(function (a) {
    var url = SOCIAL[a.getAttribute("data-social")];
    if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; }
    else a.style.display = "none"; /* no profile link set yet: hide the icon instead of a dead link */
  });

  /* ===== Room "View Detail" pop-up ===== */
  var modal;
  function closeRoom() { if (modal) { modal.classList.remove("open"); document.body.style.overflow = ""; } }
  function openRoom(card) {
    if (!modal) {
      modal = document.createElement("div"); modal.className = "dy-modal";
      modal.innerHTML = '<div class="dy-modal__box" role="dialog" aria-modal="true"><button class="dy-modal__x" type="button" aria-label="Close">&times;</button><div data-body></div></div>';
      document.body.appendChild(modal);
      modal.addEventListener("click", function (e) { if (e.target === modal || e.target.closest(".dy-modal__x") || e.target.closest("[data-close]")) closeRoom(); });
    }
    var img = card.querySelector("img"), h = card.querySelector("h5"), price = card.querySelector("small.bg-primary");
    var name = h.textContent.replace(/\s+/g, " ").trim();
    var feats = $all(".d-flex.mb-3 small", card).map(function (s) { return "<span>" + s.innerHTML + "</span>"; }).join("");
    var desc = card.querySelector("p.text-body");
    var book = card.querySelector('a[href^="booking.html"]');
    modal.querySelector("[data-body]").innerHTML =
      (img ? '<img src="' + img.getAttribute("src") + '" alt="' + name.replace(/"/g, "&quot;") + '">' : "") +
      '<div class="dy-modal__body"><h3></h3>' + (price ? '<span class="dy-modal__price">' + price.textContent + "</span>" : "") +
      '<div class="dy-modal__feat">' + feats + "</div><p>" + (desc ? desc.textContent : "") + '</p><div class="dy-modal__actions"><a href="' +
      (book ? book.getAttribute("href") : "booking.html") + '">Book this room</a><button type="button" data-close>Close</button></div></div>';
    modal.querySelector("h3").textContent = name;
    modal.classList.add("open"); document.body.style.overflow = "hidden";
  }
  $all("[data-dy-room-detail]").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); openRoom(a.closest(".room-item")); });
  });

  /* ===== Availability bar -> booking page ===== */
  $all("[data-dy-availability]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var bar = btn.closest(".booking"), inputs = $all("input", bar), sels = $all("select", bar), p = [];
      if (inputs[0] && inputs[0].value) p.push("checkin=" + encodeURIComponent(inputs[0].value));
      if (inputs[1] && inputs[1].value) p.push("checkout=" + encodeURIComponent(inputs[1].value));
      if (sels[0] && /^\d+$/.test(sels[0].value)) p.push("adults=" + sels[0].value);
      if (sels[1] && /^\d+$/.test(sels[1].value)) p.push("children=" + sels[1].value);
      window.location.href = "booking.html" + (p.length ? "?" + p.join("&") : "");
    });
  });

  /* ===== Booking page: prefill from the link / availability bar ===== */
  var bform = document.querySelector("form[data-dy-booking]");
  if (bform) {
    var qs = new URLSearchParams(location.search);
    function put(sel, v) { var el = bform.querySelector(sel); if (el && v) el.value = v; }
    var room = qs.get("room");
    var rs = bform.querySelector("#select3");
    if (rs && room) {
      var has = $all("option", rs).some(function (o) { return o.value === room; });
      if (!has) { var o = document.createElement("option"); o.value = o.textContent = room; rs.appendChild(o); }
      rs.value = room;
    }
    put("#select1", qs.get("adults")); put("#select2", qs.get("children"));
    window.addEventListener("load", function () { put("#checkin", qs.get("checkin")); put("#checkout", qs.get("checkout")); });
    bform.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!bform.reportValidity()) return;
      var f = new FormData(bform);
      var lines = [
        "Name: " + f.get("name"), "Email: " + f.get("email"), "Check in: " + f.get("checkin"), "Check out: " + f.get("checkout"),
        "Adults: " + f.get("adults"), "Children: " + f.get("children"), "Room: " + f.get("room"), "", "Special request:", f.get("message") || "-"];
      sendForm("booking_inquiries", {
        name: f.get("name"), email: f.get("email"), check_in: f.get("checkin"), check_out: f.get("checkout"),
        adults: String(f.get("adults") || ""), children: String(f.get("children") || ""), room: f.get("room"), message: f.get("message") || ""
      }, bform, "Thank you! Your booking request was sent – we will contact you shortly.",
      "Room booking request - " + f.get("name"), lines);
    });
  }

  /* ===== Contact form + newsletter ===== */
  var cform = document.querySelector("form[data-dy-contact]");
  if (cform) cform.addEventListener("submit", function (e) {
    e.preventDefault(); if (!cform.reportValidity()) return;
    var f = new FormData(cform);
    sendForm("contact_messages", { name: f.get("name"), email: f.get("email"), subject: f.get("subject") || "", message: f.get("message") },
      cform, "Thank you! Your message was sent.",
      f.get("subject") || "Message from the website", ["Name: " + f.get("name"), "Email: " + f.get("email"), "", f.get("message")]);
  });
  $all("form[data-dy-newsletter]").forEach(function (nf) {
    nf.addEventListener("submit", function (e) {
      e.preventDefault(); if (!nf.reportValidity()) return;
      var email = new FormData(nf).get("email");
      sendForm("newsletter_subscribers", { email: email }, nf, "Thank you for subscribing!",
        "Newsletter subscription", ["Please add this address to the hotel updates list:", email]);
    });
  });

  /* ===== Guest-services page: open the tab named in the link (guest-services.html#laundry) ===== */
  function hashTab() {
    var id = location.hash.slice(1);
    if (id && typeof window.switchTab === "function" && document.querySelector('.tab-btn[data-tab="' + id + '"]')) {
      window.switchTab(id); window.scrollTo(0, 0);
    }
  }
  if (document.querySelector(".tab-btn")) { hashTab(); document.addEventListener("DOMContentLoaded", hashTab); window.addEventListener("hashchange", hashTab); }
})();

/* Show floating Book Now only after the booking banner has been scrolled past */
(function () {
  var btn = document.querySelector(".bfloat");
  if (!btn) return;
  var banner = document.querySelector(".bcta");
  function check() {
    var show = banner ? banner.getBoundingClientRect().bottom < 0 : window.scrollY > 600;
    btn.classList.toggle("is-visible", show);
  }
  window.addEventListener("scroll", check, { passive: true });
  window.addEventListener("resize", check);
  check();
})();

/* Menu photos that are not uploaded yet: show the hotel logo instead of a broken image icon */
document.addEventListener("error", function (e) {
  var img = e.target;
  if (!img || img.tagName !== "IMG" || img.dataset.fallback) return;
  if (img.matches("img.item-src, img[data-item-image]")) {
    img.dataset.fallback = "1";
    img.src = "assets/logo-dark-sm.png";
    img.style.objectFit = "contain"; img.style.padding = "10px"; img.style.opacity = ".6";
  }
}, true);
window.addEventListener("load", function () {
  Array.prototype.forEach.call(document.querySelectorAll("img.item-src, img[data-item-image]"), function (img) {
    if (img.complete && img.naturalWidth === 0 && !img.dataset.fallback) img.dispatchEvent(new Event("error"));
  });
});
