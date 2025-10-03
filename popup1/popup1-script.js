// popup1/popup1-script.js
// Full replacement: Fetch real client data from /api/vcard/:idOrSlug (or fallback to /api/clients/all)
// - Keeps all existing styles & HTML container structure intact.
// - Replaces innerHTML of placeholders with real data, preserving layout.

document.addEventListener('DOMContentLoaded', () => {
  const placeholders = {
    header: 'header-placeholder',
    profile: 'profile-placeholder',
    nameTitle: 'name-business-title-placeholder',
    contact: 'contact-placeholder',
    buttons: 'buttons-placeholder',
    moreinfo: 'moreinfo-placeholder'
  };

  // Helper: load modular fragment (keeps your current fragments working for fallback)
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

  // Load the fragments (same files you already use)
  // Using the same filenames as in your popup1.html so nothing else changes
  loadFragment(placeholders.header, 'popup1/popup1-header.html');
  loadFragment(placeholders.profile, 'popup1/popup1-profile.html');
  loadFragment(placeholders.nameTitle, 'popup1/popup1-name-business-title.html');
  loadFragment(placeholders.contact, 'popup1/popup1-contact.html');
  loadFragment(placeholders.buttons, 'popup1/popup1-buttons.html');
  loadFragment(placeholders.moreinfo, 'popup1/popup1-moreinfo.html');

  // Utility: get id or slug from URL
  const getIdOrSlugFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || params.get('slug') || null;
  };

  // Utility: safe text
  const esc = (s) => {
    if (s === undefined || s === null) return '';
    return String(s);
  };

  // Build profile HTML to match existing structure and styling (keeps layout)
  const buildProfileHtml = (client) => {
    // profile picture and basic info
    const photoTag = client.photoUrl ? `<img src="${esc(client.photoUrl)}" alt="photo" class="profile-photo" style="width:120px;height:120px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 10px"/>` : '';
    return `
      <div class="profile-block" style="text-align:center;color:white;">
        ${photoTag}
        <h1 style="margin:6px 0 2px 0;color:gold;font-size:20px;">${esc(client.fullName)}</h1>
        <h3 style="margin:0 0 8px 0;color:#ddd;font-weight:normal;">${esc(client.company || '')} ${client.title ? '— ' + esc(client.title) : ''}</h3>
        <p style="margin:8px 10px;color:#e6e6e6;">${esc(client.bio || '')}</p>
      </div>
    `;
  };

  // Build name/title block (keeps design consistent)
  const buildNameTitleHtml = (client) => {
    return `
      <div style="text-align:center;color:white;margin-top:6px;">
        <div style="font-size:18px;font-weight:bold;color:gold;">${esc(client.fullName)}</div>
        <div style="font-size:13px;color:#ddd;">${esc(client.title || '')} ${client.company ? ' — ' + esc(client.company) : ''}</div>
      </div>
    `;
  };

  // Build contact block
  const buildContactHtml = (client) => {
    const phones = [client.phone1, client.phone2, client.phone3].filter(Boolean);
    const emails = [client.email1, client.email2, client.email3].filter(Boolean);

    const phoneListHtml = phones.length
      ? phones.map((p, i) => `<div><button class="phone-btn" data-phone="${esc(p)}">Call ${i===0? '(Primary)':''}</button> <span style="color:#ddd; margin-left:8px;">${esc(p)}</span></div>`).join('')
      : `<div style="color:#ddd">No phone</div>`;

    const emailListHtml = emails.length
      ? emails.map((em, i) => `<div><button class="email-btn" data-email="${esc(em)}">Email ${i===0? '(Primary)':''}</button> <span style="color:#ddd; margin-left:8px;">${esc(em)}</span></div>`).join('')
      : `<div style="color:#ddd">No email</div>`;

    const addressHtml = client.address ? `<div style="margin-top:8px;color:#ddd;"><strong>Address:</strong> ${esc(client.address)}</div>` : '';

    return `
      <div class="contact-block" style="color:white;">
        <div style="margin-bottom:8px;"><strong style="color:gold">Phone</strong><div>${phoneListHtml}</div></div>
        <div style="margin-bottom:8px;"><strong style="color:gold">Email</strong><div>${emailListHtml}</div></div>
        ${addressHtml}
      </div>
    `;
  };

  // Build buttons (socials and links)
  const buildButtonsHtml = (client) => {
    const s = client.socialLinks || {};
    const socials = [];
    if (s.facebook) socials.push(`<button class="social-btn" data-url="${esc(s.facebook)}">Facebook</button>`);
    if (s.instagram) socials.push(`<button class="social-btn" data-url="${esc(s.instagram)}">Instagram</button>`);
    if (s.twitter) socials.push(`<button class="social-btn" data-url="${esc(s.twitter)}">X</button>`);
    if (s.linkedin) socials.push(`<button class="social-btn" data-url="${esc(s.linkedin)}">LinkedIn</button>`);
    if (s.tiktok) socials.push(`<button class="social-btn" data-url="${esc(s.tiktok)}">TikTok</button>`);
    if (s.youtube) socials.push(`<button class="social-btn" data-url="${esc(s.youtube)}">YouTube</button>`);

    if (client.businessWebsite) socials.push(`<button class="website-btn" data-url="${esc(client.businessWebsite)}">Website</button>`);
    if (client.portfolioWebsite) socials.push(`<button class="website-btn" data-url="${esc(client.portfolioWebsite)}">Portfolio</button>`);
    if (client.locationMap) socials.push(`<button class="map-btn" data-url="${esc(client.locationMap)}">View Location</button>`);

    if (socials.length === 0) socials.push(`<div style="color:#ddd">No social links</div>`);

    return `<div class="buttons-block" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">${socials.join('')}</div>`;
  };

  // Build more info (bio, working hours)
  const buildMoreInfoHtml = (client) => {
    let hoursHtml = '';
    if (client.workingHours) {
      const wh = client.workingHours;
      // attempt to render days if present
      const days = wh.days || null; // support both shapes
      if (days && typeof days === 'object') {
        hoursHtml = '<table style="width:100%;color:#ddd;border-collapse:collapse">';
        for (const day of Object.keys(days)) {
          hoursHtml += `<tr><td style="padding:4px;border:1px solid rgba(255,255,255,0.06)">${esc(day)}</td><td style="padding:4px;border:1px solid rgba(255,255,255,0.06)">${esc(days[day])}</td></tr>`;
        }
        hoursHtml += '</table>';
      } else if (wh.monFriStart) {
        hoursHtml = `
          <div style="color:#ddd">
            Mon-Fri: ${esc(wh.monFriStart)} - ${esc(wh.monFriEnd || '')}<br/>
            Sat: ${esc(wh.sat || '')} Sun: ${esc(wh.sun || '')}
          </div>
        `;
      }
    }

    const mapHtml = client.locationMap ? `<div style="margin-top:8px;"><a href="${esc(client.locationMap)}" target="_blank" style="color:gold">View Map</a></div>` : '';

    return `
      <div class="moreinfo-block" style="color:white;">
        ${client.bio ? `<div><strong style="color:gold">Bio</strong><p style="color:#ddd">${esc(client.bio)}</p></div>` : ''}
        ${hoursHtml ? `<div style="margin-top:8px;"><strong style="color:gold">Working Hours</strong>${hoursHtml}</div>` : ''}
        ${mapHtml}
      </div>
    `;
  };

  // Attach interactive behavior for generated buttons
  const attachGeneratedHandlers = (root = document) => {
    // phones
    root.querySelectorAll('.phone-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const p = btn.dataset.phone;
        if (!p) return;
        window.open(`tel:${p}`, '_self');
      });
    });
    // emails
    root.querySelectorAll('.email-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const em = btn.dataset.email;
        if (!em) return;
        window.open(`mailto:${em}`, '_self');
      });
    });
    // social & website buttons
    root.querySelectorAll('.social-btn, .website-btn, .map-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (!url) return;
        window.open(url, '_blank');
      });
    });
    // More-info (navigate to popup2.html preserving id/slug)
    root.querySelectorAll('.more-info-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const key = getIdOrSlugFromUrl() || window.location.pathname;
        // try to preserve id param
        const param = getIdOrSlugFromUrl() ? `?id=${encodeURIComponent(getIdOrSlugFromUrl())}` : '';
        window.location.href = `popup2.html${param}`;
      });
    });
  };

  // Populate the placeholders with data
  const populateAll = (client) => {
    if (!client) return;
    // profile
    const profileEl = document.getElementById(placeholders.profile);
    if (profileEl) profileEl.innerHTML = buildProfileHtml(client);
    // name/title
    const nameTitleEl = document.getElementById(placeholders.nameTitle);
    if (nameTitleEl) nameTitleEl.innerHTML = buildNameTitleHtml(client);
    // contact
    const contactEl = document.getElementById(placeholders.contact);
    if (contactEl) contactEl.innerHTML = buildContactHtml(client);
    // buttons
    const buttonsEl = document.getElementById(placeholders.buttons);
    if (buttonsEl) buttonsEl.innerHTML = buildButtonsHtml(client);
    // more info
    const moreinfoEl = document.getElementById(placeholders.moreinfo);
    if (moreinfoEl) moreinfoEl.innerHTML = buildMoreInfoHtml(client);

    // attach handlers
    attachGeneratedHandlers(document);
  };

  // Fetch vCard by id or slug. Return client object (or null)
  const fetchClientByKey = async (key) => {
    try {
      const res = await fetch(`/api/vcard/${encodeURIComponent(key)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to fetch vcard');
      const client = json?.data?.client || json?.data || null;
      return client;
    } catch (err) {
      console.warn('fetchClientByKey', err);
      return null;
    }
  };

  // Fallback: get first public client if no id/slug provided
  const fetchFirstClient = async () => {
    try {
      const res = await fetch(`/api/clients/all`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to fetch clients/all');
      const arr = json?.data || json || [];
      if (!Array.isArray(arr) || arr.length === 0) return null;
      // pick first active client record
      return arr[0];
    } catch (err) {
      console.warn('fetchFirstClient', err);
      return null;
    }
  };

  // Main init flow
  (async () => {
    try {
      const key = getIdOrSlugFromUrl();
      let client = null;
      if (key) {
        client = await fetchClientByKey(key);
      }
      if (!client) {
        client = await fetchFirstClient();
      }
      if (client) {
        // Some endpoints return {client:..., recentLogs:...} or return client directly
        // Normalize:
        if (client.client) client = client.client;
        populateAll(client);
      } else {
        // no client found — leave fragments as-is (they may contain dummy content) but warn in console
        console.warn('No client data found for popup. Make sure to provide ?id= or ?slug= or have clients in DB.');
      }
    } catch (err) {
      console.error('Popup initialization error:', err);
    }
  })();

  // Keep previous click handlers used by your fragments (phone/email toggles, more-info)
  document.addEventListener('click', (e) => {
    // phone / email toggle (if fragments have these)
    if (e.target.classList.contains('phone-expand-btn')) {
      const extraList = e.target.closest('.contact-box')?.querySelector('.contact-extra-list');
      if (extraList) extraList.classList.toggle('open');
    }
    if (e.target.classList.contains('email-expand-btn')) {
      const extraList = e.target.closest('.contact-box')?.querySelector('.email-extra-list');
      if (extraList) extraList.classList.toggle('open');
    }
    if (e.target.classList.contains('more-info-btn')) {
      e.preventDefault();
      const popupContainer = document.querySelector('.popup-container');
      if (popupContainer) {
        popupContainer.style.transition = 'opacity 0.5s ease';
        popupContainer.style.opacity = '0';
        setTimeout(() => {
          const key = getIdOrSlugFromUrl();
          const param = key ? `?id=${encodeURIComponent(key)}` : '';
          window.location.href = `popup2.html${param}`;
        }, 500);
      } else {
        const key = getIdOrSlugFromUrl();
        const param = key ? `?id=${encodeURIComponent(key)}` : '';
        window.location.href = `popup2.html${param}`;
      }
    }
  });

});
