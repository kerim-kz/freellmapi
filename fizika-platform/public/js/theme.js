// Тақырыпты бет көрсетілмей тұрып қолдану (жыпылықтамау үшін).
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* жеке режимде localStorage болмауы мүмкін */ }
})();
