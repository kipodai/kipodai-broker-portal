// Sign out of the private demos. The cookie is HttpOnly, so the page cannot
// clear it itself: ask the Worker to. Nothing is stored in the browser.
const button = document.getElementById('sign-out');
const note = document.getElementById('sign-out-note');

button?.addEventListener('click', async () => {
  button.disabled = true;
  note.textContent = '';
  try {
    const res = await fetch('/demo-logout', { method: 'POST', credentials: 'same-origin' });
    if (res.ok) {
      window.location.assign('/product-tour.html');
      return;
    }
  } catch {
    // fall through to the message below
  }
  // Do not pretend the visitor is signed out when the cookie was not cleared.
  note.textContent = 'Could not sign out. Please try again.';
  button.disabled = false;
});

// Coming back with the browser's back button must not leave the button stuck.
window.addEventListener('pageshow', () => {
  if (button) button.disabled = false;
});
