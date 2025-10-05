// popup2/popup2-script.js
// Replacement to fetch detailed client data for popup2 (More Info)
// Preserves all styling & structure of the popup2 fragments.

document.addEventListener('DOMContentLoaded', () => {
  const placeholders = {
    header: 'header-placeholder',
    bio: 'bio-placeholder',
    buttons: 'buttons-placeholder',
    morebuttons: 'morebuttons-placeholder',
    footer: 'footer-placeholder'
  };

  const loadFragment = async (id, file) => {
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
      const html = await res.text();
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    } catch (err) {
      console.warn(err);
    }
  };

  // load fragments (same filenames as your layout)
  loadFragment(placeholders.header, 'popup2/popup2-header.html');
  loadFragment(placeholders.bio, 'popup2/popup2-bio.html');
  loadFragment(placeholders.buttons, 'popup2/popup2-buttons.html');
  loadFragment(placeholders.morebuttons, 'popup2/popup2-morebuttons.html');
  loadFragment(placeholders.footer, 'popup2/popup2-footer.html');

  const params = new URLSearchParams(window.location.search);
  const key = params.get('id') || params.get('slug') || null;

  const esc = (s) => {
    if (s === undefined || s === null) return '';
    return String(s);
  };

  const fetchClient = async (k) => {
    if (!k) return null;
    try {
      const res = await fetch(`/api/vcard/${encodeURIComponent(k)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to fetch vcard');
      const client = json?.data?.client || json?.data || null;
      return client.client ? client.client : client;
    } catch (err) {
      console.warn('popup2 fetchClient error', err);
      return null;
    }
  };

  const renderBio = (client) => {
    const bioPlaceholder = document.getElementById(placeholders.bio);
    if (!bioPlaceholder) return;
    if (!client) {
      bioPlaceholder.innerHTML = `<div style="color:#ddd;text-align:center">No client data available.</div>`;
      return;
    }
    const socialLinks = client.socialLinks || {};
    const socialsHtml = [
      socialLinks.facebook ? `<a href="${esc(socialLinks.facebook)}" target="_blank">Facebook</a>` : '',
      socialLinks.instagram ? `<a href="${esc(socialLinks.instagram)}" target="_blank">Instagram</a>` : '',
      socialLinks.twitter ? `<a href="${esc(socialLinks.twitter)}" target="_blank">X</a>` : '',
      socialLinks.linkedin ? `<a href="${esc(socialLinks.linkedin)}" target="_blank">LinkedIn</a>` : '',
      socialLinks.tiktok ? `<a href="${esc(socialLinks.tiktok)}" target="_blank">TikTok</a>` : '',
      socialLinks.youtube ? `<a href="${esc(socialLinks.youtube)}" target="_blank">YouTube</a>` : ''
    ].filter(Boolean).join(' | ');

    bioPlaceholder.innerHTML = `
      <div style="color:#ddd;">
        <h2 style="color:gold;text-align:center;margin:6px 0">${esc(client.fullName)}</h2>
        <p style="text-align:center;color:#eee;margin-bottom:10px">${esc(client.bio || '')}</p>
        <div style="text-align:center;color:gold;margin-bottom:8px">${socialsHtml}</div>
        <div style="margin-top:8px;color:#ddd"><strong>Address:</strong> ${esc(client.address || 'N/A')}</div>
        <div style="margin-top:6px;color:#ddd"><strong>Website:</strong> ${esc(client.businessWebsite || client.portfolioWebsite || 'N/A')}</div>
      </div>
    `;
  };

  (async () => {
    let client = null;
    if (key) client = await fetchClient(key);
    if (!client) {
      // fallback to first client
      try {
        const res = await fetch('/api/clients/all');
        const json = await res.json();
        const arr = json?.data || [];
        if (Array.isArray(arr) && arr.length > 0) client = arr[0];
      } catch (e) {
        console.warn(e);
      }
    }
    renderBio(client);
  })();

  // robust delegated click handler for back button (works if the click target is inner icon/span etc.)
  document.addEventListener('click', (e) => {
    const backEl = e.target.closest('.back-button, .back-btn, .btn-back, [data-action="back"], .popup-back');
    if (!backEl) return;

    // Prefer history.back() so we truly "toggle back" to the previous page state (preserves search params if present)
    try {
      if (window.history && window.history.length > 1) {
        // go back in history (this will restore the previous popup1 state if user navigated there)
        window.history.back();
        return;
      }
    } catch (err) {
      // swallow and fallback below
      console.warn('history.back() failed, falling back to direct navigation', err);
    }

    // fallback: direct navigation to root or to popup1 with preserved id/slug param
    const param = key ? `?id=${encodeURIComponent(key)}` : '';
    // prefer popup1.html if present (explicit file) else root
    const fallbackPath = '/popup1.html';
    // try to navigate to popup1.html first; if not set up, root will still work
    window.location.href = `${fallbackPath}${param}` || `/${param}`;
  });
});
