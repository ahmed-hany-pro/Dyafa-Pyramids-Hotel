/* Reception start-up: sign in (Supabase Auth) -> load all data -> then run the dashboard code (javascript.js). */
(function () {
  var overlay = document.getElementById('staffLogin');
  var form = document.getElementById('staffLoginForm');
  var err = document.getElementById('staffErr');
  var btn = document.getElementById('staffBtn');
  var started = false;

  if (localStorage.getItem('hotelTheme') === 'light') document.documentElement.classList.add('light');
  if (localStorage.getItem('hotelGridV') === 'off') document.documentElement.classList.add('no-grid-v');   // vertical lines hidden
  if (localStorage.getItem('hotelGridH') === 'off') document.documentElement.classList.add('no-grid-h');   // horizontal lines hidden

  function showErr(m) { err.textContent = m; err.hidden = !m; }

  function startDashboard() {
    if (started) return; started = true;
    btn.disabled = true; btn.textContent = 'Loading…';
    DyafaStore.startStaff().then(function () {
      var s = document.createElement('script');
      s.src = 'javascript.js';
      s.onload = function () { overlay.style.display = 'none'; };
      document.body.appendChild(s);
    }).catch(function (e) {
      started = false; btn.disabled = false; btn.textContent = 'Sign in';
      showErr('Could not load the data: ' + (e && e.message ? e.message : e));
    });
  }

  if (!DyafaStore.enabled) {
    showErr('Supabase is not set up yet. Open js/supabase-config.js and paste your Project URL and anon key.');
    btn.disabled = true; return;
  }

  /* already signed in from before? go straight in */
  DyafaStore.staffSession().then(function (sess) { if (sess) startDashboard(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault(); showErr(''); btn.disabled = true; btn.textContent = 'Signing in…';
    DyafaStore.staffSignIn(document.getElementById('staffEmail').value.trim(), document.getElementById('staffPass').value)
      .then(startDashboard)
      .catch(function (ex) { btn.disabled = false; btn.textContent = 'Sign in'; showErr(ex.message || 'Could not sign in.'); });
  });
})();
