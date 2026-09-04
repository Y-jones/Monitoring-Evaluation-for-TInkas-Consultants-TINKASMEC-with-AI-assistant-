(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('contact-form');
    if (!form) return; // only runs on pages that actually have the form

    var CONTACT_API_URL = (window.TINKASMEC_API_BASE || 'http://localhost:3000') + '/api/contact';

    var submitBtn = document.getElementById('cf-submit');
    var statusEl = document.getElementById('cf-status');

    function showStatus(kind, text) {
      statusEl.textContent = text;
      statusEl.className = 'form-status show ' + kind;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name = document.getElementById('cf-name').value.trim();
      var email = document.getElementById('cf-email').value.trim();
      var message = document.getElementById('cf-message').value.trim();

      if (name.length < 2) return showStatus('error', 'Please enter your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showStatus('error', 'Please enter a valid email address.');
      if (message.length < 5) return showStatus('error', 'Please enter a short message.');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      statusEl.className = 'form-status';

      fetch(CONTACT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email, message: message }),
      })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (result) {
          if (result.ok) {
            showStatus('success', "Thanks — your message has been sent. We'll get back to you soon.");
            form.reset();
          } else {
            showStatus('error', result.data.error || 'Something went wrong. Please try again.');
          }
        })
        .catch(function () {
          showStatus('error', "Couldn't reach the server. Please email us directly at tinkasconsults@gmail.com or call +255 754 513 185.");
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send message';
        });
    });
  });
})();