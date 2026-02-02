(function () {
  'use strict';

  function getClientData() {
    try {
      return window.__SMARTCARD_CLIENT__ || null;
    } catch {
      return null;
    }
  }

  function openBooking() {
    const client = getClientData();

    // OPTION A: Booking provider (RECOMMENDED)
    if (client && client.bookingLink) {
      window.open(client.bookingLink, '_blank', 'noopener,noreferrer');
      return;
    }

    // OPTION B: Google Calendar fallback
    const name = client?.fullName || 'Contact';
    const phone = client?.phone1 || 'N/A';
    const email = client?.email1 || 'N/A';

    const title = encodeURIComponent('Meeting with ' + name);
    const details = encodeURIComponent(
      'SmartCardLink vCard\n' +
      window.location.href +
      '\n\nPhone: ' + phone +
      '\nEmail: ' + email
    );

    const url =
      'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + title +
      '&details=' + details;

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('bookAppointmentBtn');
    if (!btn) return;

    btn.disabled = false;
    btn.removeAttribute('disabled');
    btn.classList.remove('disabled');

    btn.addEventListener('click', openBooking);
  });

})();
