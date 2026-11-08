// Барлық беттерге ортақ шағын әрекеттер.
(function () {
  var root = document.documentElement;

  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = root.getAttribute('data-theme');
      if (!cur) cur = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      document.dispatchEvent(new CustomEvent('themechange'));
    });
  }

  // data-confirm: қауіпті әрекет алдында сұрау.
  document.addEventListener('submit', function (e) {
    var f = e.target;
    var msg = f.getAttribute('data-confirm') || (e.submitter && e.submitter.getAttribute('data-confirm'));
    if (msg && !confirm(msg)) e.preventDefault();
  });

  // data-copy: мәтінді алмасу буферіне көшіру.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (!b) return;
    var text = b.getAttribute('data-copy');
    var done = function () { var o = b.textContent; b.textContent = 'Көшірілді'; setTimeout(function () { b.textContent = o; }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
  });

  // Сүзгі формалары: таңдау өзгергенде бірден жіберу.
  document.querySelectorAll('form[data-autosubmit]').forEach(function (f) {
    f.addEventListener('change', function (e) {
      if (e.target.matches('select, input[type=checkbox], input[type=radio]')) f.submit();
    });
  });
})();
