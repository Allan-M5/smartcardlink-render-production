(function () {
  'use strict';

  const API_ROOT = 'https://smartcardlink-api.onrender.com';
  const APPLY_VCARD_URL = 'https://smartcardlink-dashboard-frontend.onrender.com/client-form.html';
  const PRO_ONLY_MESSAGE = 'Available to PRO users';

  const el = (id) => document.getElementById(id);
  const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function forceClick(selector, handler) {
  qsa(selector).forEach((node) => {
    node.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      handler(node, e);
    }, true);
  });
}

  const vcardContainer = el('vcard');
  const popup1 = el('popup1');
  const popup2 = el('popup2');
  const photoArea = el('photoArea');
  const brandHeader = el('brandHeader');

  const fullName = el('fullName');
  const jobName = el('jobName');
  const titlePosition = el('titlePosition');
  const phoneMain = el('phoneMain');
  const emailMain = el('emailMain');
  const phoneDropdownBtn = el('phoneDropdownBtn');
  const emailDropdownBtn = el('emailDropdownBtn');
  const phoneList = el('phoneList');
  const emailList = el('emailList');

  const actions = {
    call: el('callBtn'),
    sms: el('smsBtn'),
    wa: el('waBtn'),
    mail: el('mailBtn'),
    print: el('printBtn'),
    save: el('saveBtn')
  };

  const buttons = {
    moreInfo: el('moreInfoBtn'),
    back: el('backBtn'),
    book: el('bookAppointmentBtn'),
    business: el('businessWebsite'),
    portfolio: el('portfolioWebsite'),
    location: el('locationMap'),
    physical: el('physicalAddress'),
    facebook: el('facebookBtn'),
    instagram: el('instagramBtn'),
    x: el('xBtn'),
    linkedin: el('linkedinBtn'),
    tiktok: el('tiktokBtn'),
    youtube: el('youtubeBtn'),
    apply: el('applyVcardLink'),
    shareApply: el('shareApplyBtn'),
    analytics: el('analyticsBtn'),
    reminder: el('contactReminderBtn'),
    reminderLocked: el('contactReminderLockedBtn'),
    viewResume: el('viewResumeBtn'),
    downloadResume: el('downloadResumeBtn'),
    viewResumeLocked: el('viewResumeLockedBtn'),
    downloadResumeLocked: el('downloadResumeLockedBtn'),
    resumeAccessCancel: el('resumeAccessCancelBtn'),
    resumeAccessConfirm: el('resumeAccessConfirmBtn'),
    analyticsAccessCancel: el('analyticsAccessCancelBtn'),
    analyticsAccessConfirm: el('analyticsAccessConfirmBtn')
  };

  const sections = {
    resume: el('resumeSection'),
    resumeLocked: el('resumeLockedSection'),
    analyticsPanel: el('analyticsPanel'),
    reminderWrap: el('contactReminderWrap'),
    reminderLockedWrap: el('contactReminderLockedWrap'),
    resumeAccessModal: el('resumeAccessModal'),
    analyticsAccessModal: el('analyticsAccessModal')
  };

  const inputs = {
    resumeAccess: el('resumeAccessInput'),
    analyticsAccess: el('analyticsAccessInput')
  };

  const errors = {
    resumeAccess: el('resumeAccessError'),
    analyticsAccess: el('analyticsAccessError')
  };

  const counts = {
    profileAccessed: el('profileAccessCount'),
    resumeViewed: el('resumeViewedCount'),
    resumeDownloaded: el('resumeDownloadedCount'),
    resumeAccessCode: el('resumeAccessCode')
  };

  const labels = {
    bioText: el('bioText'),
    reminderText: el('contactReminderText'),
    reminderLockedText: el('contactReminderLockedText'),
    analyticsProTag: el('analyticsProTag')
  };

  let currentClient = null;
  let pendingResumeMode = 'view';

  function setHidden(node, hidden) {
    if (!node) return;
    node.hidden = !!hidden;
    node.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if (node === popup2) {
      if (hidden) node.setAttribute('inert', '');
      else node.removeAttribute('inert');
    }
  }

  function ensureToastHost() {
    let host = el('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    return host;
  }

  function showToast(message, isError = false) {
    const host = ensureToastHost();
    const toast = document.createElement('div');
    toast.className = `toast-message${isError ? ' is-error' : ''}`;
    toast.textContent = message;
    host.appendChild(toast);
    window.setTimeout(() => toast.classList.add('show'), 10);
    window.setTimeout(() => {
      toast.classList.remove('show');
      window.setTimeout(() => toast.remove(), 240);
    }, 2400);
  }

  function showError(node, message) {
    if (!node) return;
    node.textContent = message || '';
    node.hidden = !message;
  }

  function openModal(modal, focusNode, errorNode) {
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    if (typeof modal.inert !== 'undefined') modal.inert = false;
    showError(errorNode, '');
    if (focusNode) {
      focusNode.value = '';
      window.setTimeout(() => focusNode.focus(), 0);
    }
  }

  function closeModal(modal, errorNode) {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    if (typeof modal.inert !== 'undefined') modal.inert = true;
    showError(errorNode, '');
  }

  function showMessage(msg, isError = false) {
    if (!vcardContainer) return;
    setHidden(popup1, true);
    setHidden(popup2, true);
    let msgEl = el('messageArea');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.id = 'messageArea';
      msgEl.style.cssText = 'text-align:center;padding:24px;';
      vcardContainer.prepend(msgEl);
    }
    msgEl.style.color = isError ? '#ef4444' : 'var(--theme-color, #FFD700)';
    msgEl.innerHTML = `<h3>${msg}</h3>`;
    msgEl.hidden = false;
  }

  function hideMessageArea() {
    const msgEl = el('messageArea');
    if (msgEl) msgEl.hidden = true;
  }

  function normalizePackageType(client) {
    return String(
      client?.packageType ||
      client?.selectedPackage ||
      client?.package ||
      client?.plan ||
      ''
    ).trim().toLowerCase();
  }

  function isProPackage(client) {
    return normalizePackageType(client) === 'pro';
  }

  function getThemeColor(client) {
    return isProPackage(client)
      ? String(client?.themeColor || '#FFD700').trim() || '#FFD700'
      : '#FFD700';
  }

  function applyTheme(client) {
    const theme = getThemeColor(client);
    document.documentElement.style.setProperty('--theme-color', theme);
  }

  async function fetchProfileData() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const clientSlug = urlParams.get('slug') || window.location.pathname.split('/').pop();

      if (!clientSlug || clientSlug === 'index.html') {
        throw new Error('VCard identifier not found.');
      }

      showMessage('Loading Professional vCard...');
      const res = await fetch(`${API_ROOT}/api/vcard/${encodeURIComponent(clientSlug)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Card not found.');

      const json = await res.json();
      if (json.status !== 'success') {
        throw new Error(json.message || 'Inactive card');
      }

      hideMessageArea();
      return json.data;
    } catch (err) {
      showMessage(err.message, true);
      return null;
    }
  }

  function renderPhoto(url, qrUrl = '') {
    if (!photoArea) return;

    const photoSrc = url || '/public/images/default-photo.png';
    const qrSrc = qrUrl || '';

    if (!qrSrc) {
      photoArea.innerHTML = `<img src="${photoSrc}" alt="Profile" class="profile-main-image">`;
      return;
    }

    photoArea.innerHTML = `
      <div class="photo-swipe-container">
        <div class="photo-swipe-track">
          <div class="photo-panel">
            <img src="${photoSrc}" alt="Profile" class="profile-main-image">
          </div>
          <div class="qr-panel">
            <img data-src="${qrSrc}" alt="QR Code" class="profile-qr-image lazy-qr">
          </div>
        </div>
        <div class="swipe-hint" id="swipeHint">Swipe to view QR</div>
      </div>
    `;

    const track = qs('.photo-swipe-track', photoArea);
    const panels = photoArea.querySelectorAll('img');
    const qrImg = qs('.lazy-qr', photoArea);
    const swipeHint = el('swipeHint');

    let startX = 0;
    let showingQR = false;
    let pressTimer;
    let qrLoaded = false;

    function ensureQrLoaded() {
      if (!qrImg || qrLoaded) return;
      const pendingSrc = qrImg.getAttribute('data-src');
      if (!pendingSrc) return;
      qrImg.src = pendingSrc;
      qrLoaded = true;
    }

    function restartSwipeHintAnimation() {
      if (!swipeHint) return;
      swipeHint.classList.remove('animate');
      void swipeHint.offsetWidth;
      swipeHint.classList.add('animate');
    }

    function updateView() {
      if (!track) return;
      track.style.transform = showingQR ? 'translateX(-50%)' : 'translateX(0)';

      if (swipeHint) {
        swipeHint.textContent = showingQR ? 'Swipe to view Photo' : 'Swipe to view QR';
        restartSwipeHintAnimation();
      }

      if (showingQR) ensureQrLoaded();
    }

    function openFullscreen(src) {
      const overlay = document.createElement('div');
      overlay.className = 'photo-fullscreen';
      overlay.innerHTML = `<img src="${src}" alt="Fullscreen">`;
      document.body.appendChild(overlay);
    }

    function startPress(src) {
      clearTimeout(pressTimer);
      pressTimer = window.setTimeout(() => openFullscreen(src), 600);
    }

    function cancelPress() {
      clearTimeout(pressTimer);
    }

    window.setTimeout(ensureQrLoaded, 900);

    track?.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
    }, { passive: true });

    track?.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;
      if (diff > 60) showingQR = true;
      if (diff < -60) showingQR = false;
      updateView();
    }, { passive: true });

    track?.addEventListener('click', () => {
      showingQR = !showingQR;
      updateView();
    });

    panels.forEach((img) => {
      const src = () => img.currentSrc || img.src || img.dataset.src;
      img.addEventListener('mousedown', () => startPress(src()));
      img.addEventListener('mouseup', cancelPress);
      img.addEventListener('mouseleave', cancelPress);
      img.addEventListener('touchstart', () => startPress(src()), { passive: true });
      img.addEventListener('touchend', cancelPress, { passive: true });
    });
  }

  function setupActions(client) {
    const phone = String(client.phone1 || '').trim();
    const email = String(client.email1 || '').trim();

    const bind = (btn, task, condition, emptyMessage = 'Not Provided') => {
      if (!btn) return;
      if (condition) {
        btn.onclick = task;
        btn.classList.remove('disabled');
      } else {
        btn.onclick = () => showToast(emptyMessage, true);
        btn.classList.add('disabled');
      }
    };

    bind(actions.call, () => { window.location.href = `tel:${phone}`; }, phone);
    bind(actions.sms, () => { window.location.href = `sms:${phone}`; }, phone);
    bind(actions.mail, () => { window.location.href = `mailto:${email}`; }, email);
    bind(actions.wa, () => { window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer'); }, phone);
    bind(actions.print, () => window.print(), true);
    bind(actions.save, () => {
      const vcf = `BEGIN:VCARD\nVERSION:3.0\nFN:${client.fullName || ''}\nTEL;TYPE=CELL:${client.phone1 || ''}\nEMAIL:${client.email1 || ''}\nORG:${client.company || ''}\nTITLE:${client.title || ''}\nEND:VCARD`;
      const blob = new Blob([vcf], { type: 'text/vcard' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${client.fullName || 'contact'}.vcf`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }, client.fullName);
  }

  function bindLinkButton(btn, value, mode = 'url', emptyMessage = 'Not Provided') {
    if (!btn) return;

    const finalValue = String(value || '').trim();
    btn.classList.remove('disabled');

    if (!finalValue) {
      btn.onclick = () => showToast(emptyMessage, true);
      btn.classList.add('disabled');
      return;
    }

    if (mode === 'address') {
      btn.onclick = () => showToast(finalValue);
      return;
    }

    btn.onclick = () => window.open(finalValue, '_blank', 'noopener,noreferrer');
  }

  function setAnalyticsCounts(analytics) {
    const safe = analytics || {};
    if (counts.profileAccessed) counts.profileAccessed.textContent = String(safe.profileViews || 0);
    if (counts.resumeViewed) counts.resumeViewed.textContent = String(safe.resumeViews || 0);
    if (counts.resumeDownloaded) counts.resumeDownloaded.textContent = String(safe.resumeDownloads || 0);
    if (counts.resumeAccessCode) counts.resumeAccessCode.textContent = String(safe.resumeAccessCode || '');
  }

  function renderWorkingHours(client) {
    const table = el('hoursTable');
    if (!table) return;
    const tbody = qs('tbody', table);
    if (!tbody) return;

    const hours = client.workingHours || {};
    const safe = (value) => String(value || '').trim() || '—';

    const rows = [
      ['Mon-Fri', safe(hours.monFriStart), safe(hours.monFriEnd)],
      ['Saturday', safe(hours.satStart), safe(hours.satEnd)],
      ['Sunday', safe(hours.sunStart), safe(hours.sunEnd)]
    ];

    tbody.innerHTML = rows.map(([day, start, end]) => `
      <tr>
        <td>${day}</td>
        <td>${start}</td>
        <td>${end}</td>
      </tr>
    `).join('');
  }

  function getExtraValues(client, baseKey) {
    const values = [];
    const add = (value) => {
      const text = String(value || '').trim();
      if (text && !values.includes(text)) values.push(text);
    };

    add(client[`${baseKey}2`]);
    add(client[`${baseKey}3`]);
    add(client[`${baseKey}4`]);

    const pluralKeys = [
      `${baseKey}s`,
      `${baseKey}Numbers`,
      `${baseKey}Addresses`,
      `additional${baseKey.charAt(0).toUpperCase()}${baseKey.slice(1)}s`
    ];

    pluralKeys.forEach((key) => {
      const source = client[key];
      if (Array.isArray(source)) source.forEach(add);
    });

    return values;
  }

function renderContactDropdown(listNode, buttonNode, values, mode) {
  if (!listNode || !buttonNode) return;

  const normalized = Array.isArray(values) ? values.filter(Boolean) : [];

  // Always start collapsed
  listNode.hidden = true;
  buttonNode.setAttribute('aria-expanded', 'false');
  buttonNode.classList.remove('open');

  if (!normalized.length) {
    listNode.innerHTML = `<div class="list-item disabled"><em>No additional contact</em></div>`;
  } else {
    listNode.innerHTML = normalized
      .map((value) => `<button type="button" class="list-item contact-list-btn">${value}</button>`)
      .join('');

    listNode.querySelectorAll('.contact-list-btn').forEach((item, index) => {
      item.addEventListener('click', () => {
        const value = normalized[index];
        if (mode === 'phone') {
          window.location.href = `tel:${value}`;
        } else {
          window.location.href = `mailto:${value}`;
        }
      });
    });
  }

  buttonNode.onclick = () => {
    const willOpen = listNode.hidden;

    // close sibling dropdown first
    const parentSection = listNode.closest('.contact-section');
    if (parentSection) {
      parentSection.querySelectorAll('.box-list').forEach((box) => {
        if (box !== listNode) box.hidden = true;
      });

      parentSection.querySelectorAll('.dropdown-btn').forEach((btn) => {
        if (btn !== buttonNode) {
          btn.setAttribute('aria-expanded', 'false');
          btn.classList.remove('open');
        }
      });
    }

    listNode.hidden = !willOpen;
    buttonNode.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    buttonNode.classList.toggle('open', willOpen);
  };
}

function renderPackageUI(client) {
  const isPro = isProPackage(client);
  const resumeEnabled = !!(client.resume && client.resume.enabled && client.resume.fileUrl);
  const name = client.fullName || 'this profile owner';

  if (brandHeader) {
    brandHeader.textContent = isPro ? 'SMARTCARDLINK - PRO' : 'SMARTCARDLINK';
  }

  if (labels.bioText) {
    labels.bioText.textContent = client.bio || 'Professional Profile';
  }

  if (labels.reminderText) {
    labels.reminderText.textContent = `Remind me to contact ${name}`;
  }

  if (labels.reminderLockedText) {
    labels.reminderLockedText.textContent = `Remind me to contact ${name}`;
  }

  // Standard = locked resume section only
  // PRO = actual resume section always visible, even if no PDF uploaded yet
  setHidden(sections.resume, !isPro);
  setHidden(sections.resumeLocked, isPro);

  setHidden(sections.reminderWrap, !isPro);
  setHidden(sections.reminderLockedWrap, isPro);

  if (labels.analyticsProTag) {
    labels.analyticsProTag.hidden = isPro;
  }
}

function buildReminderIcs(client, selectedDateTime) {
  const chosen = selectedDateTime ? new Date(selectedDateTime) : new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (Number.isNaN(chosen.getTime())) {
    throw new Error('Invalid reminder date/time');
  }

  const start = new Date(chosen);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const toUtcStamp = (value) => {
    const yyyy = value.getUTCFullYear();
    const mm = String(value.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(value.getUTCDate()).padStart(2, '0');
    const hh = String(value.getUTCHours()).padStart(2, '0');
    const min = String(value.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}${mm}${dd}T${hh}${min}00Z`;
  };

  const title = `Contact ${client.fullName || 'Profile Owner'} — ${client.title || 'Professional'}`;
  const description = [
    `Remember to contact ${client.fullName || 'this profile owner'}.`,
    client.title ? `Title: ${client.title}` : '',
    client.phone1 ? `Phone: ${client.phone1}` : '',
    client.email1 ? `Email: ${client.email1}` : '',
    window.location.href ? `Profile: ${window.location.href}` : ''
  ].filter(Boolean).join('\n');

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SmartCardLink//Reminder//EN
BEGIN:VEVENT
UID:${Date.now()}@smartcardlink
DTSTAMP:${toUtcStamp(new Date())}
DTSTART:${toUtcStamp(start)}
DTEND:${toUtcStamp(end)}
SUMMARY:${title}
DESCRIPTION:${description}
END:VEVENT
END:VCALENDAR`;
}

function openReminderPicker(client) {
  const overlay = document.createElement('div');
  overlay.className = 'access-modal';
  overlay.innerHTML = `
    <div class="access-card">
      <div class="access-title">Set Reminder Time</div>
      <div class="access-subtitle">Choose the exact date and time for this reminder.</div>
      <input type="datetime-local" class="access-input" id="reminderDateTimeInput">
      <div class="access-actions">
        <button type="button" class="access-btn secondary" id="reminderCancelBtn">Cancel</button>
        <button type="button" class="access-btn" id="reminderConfirmBtn">Download</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector('#reminderDateTimeInput');
  const cancelBtn = overlay.querySelector('#reminderCancelBtn');
  const confirmBtn = overlay.querySelector('#reminderConfirmBtn');

  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  input.min = local;
  input.value = local;

  cancelBtn.onclick = () => overlay.remove();

  confirmBtn.onclick = () => {
    try {
      const ics = buildReminderIcs(client, input.value);
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `contact-${(client.fullName || 'profile-owner').toLowerCase().replace(/\s+/g, '-')}-reminder.ics`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      overlay.remove();
    } catch (error) {
      showToast('Invalid reminder date/time', true);
    }
  };
}

function downloadReminder(client) {
  openReminderPicker(client);
}

async function requestResumeAccess(mode) {
  if (!currentClient || !isProPackage(currentClient)) return;

  const slug = currentClient.slug || '';
  const password = String(inputs.resumeAccess?.value || '').trim();

  if (!password) {
    showError(errors.resumeAccess, 'Password is required.');
    return;
  }

  const previewTab = mode === 'view' ? window.open('', '_blank') : null;

  try {
    showError(errors.resumeAccess, '');

    const res = await fetch(`${API_ROOT}/api/vcard/${encodeURIComponent(slug)}/resume-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, mode })
    });

    const json = await res.json();

    if (!res.ok || json.status !== 'success') {
      throw new Error(json.message || 'Resume access denied.');
    }

    const payload = json.data || {};
    closeModal(sections.resumeAccessModal, errors.resumeAccess);

    if (!payload.fileUrl) {
      throw new Error(mode === 'download' ? 'No Resume to Download' : 'Resume Not Provided');
    }

    if (mode === 'download') {
      const a = document.createElement('a');
      a.href = payload.fileUrl;
      a.download = payload.fileName || 'resume.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      if (previewTab) {
        previewTab.location.href = payload.fileUrl;
      } else {
        window.open(payload.fileUrl, '_blank', 'noopener,noreferrer');
      }
    }
  } catch (error) {
    if (previewTab && !previewTab.closed) {
      previewTab.close();
    }
    showError(errors.resumeAccess, error.message || 'Resume access denied.');
  }
}

async function requestAnalyticsAccess() {
  if (!currentClient || !isProPackage(currentClient)) return;

  const slug = currentClient.slug || '';
  const accessToken = String(inputs.analyticsAccess?.value || '').trim();

  if (!accessToken) {
    showError(errors.analyticsAccess, 'Access token is required.');
    return;
  }

  try {
    showError(errors.analyticsAccess, '');

    const res = await fetch(`${API_ROOT}/api/vcard/${encodeURIComponent(slug)}/analytics-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken })
    });

    const json = await res.json();

    if (!res.ok || json.status !== 'success') {
      throw new Error(json.message || 'Access denied.');
    }

    const analytics = json.data?.analytics || {};
    setAnalyticsCounts({
      ...analytics,
      resumeAccessCode: json.data?.resumeAccessCode || ''
    });

    closeModal(sections.analyticsAccessModal, errors.analyticsAccess);

    if (sections.analyticsPanel) {
      sections.analyticsPanel.hidden = false;
    }
  } catch (error) {
    showError(errors.analyticsAccess, error.message || 'Access denied.');
  }
}

  function wireFooterActions(client) {
    if (buttons.apply) buttons.apply.href = APPLY_VCARD_URL;

    if (buttons.shareApply) {
      buttons.shareApply.onclick = async () => {
        const shareData = {
          title: 'Apply for SmartCardLink vCard',
          text: 'Use this link to apply for your SmartCardLink vCard profile.',
          url: APPLY_VCARD_URL
        };

        try {
          if (navigator.share) {
            await navigator.share(shareData);
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(APPLY_VCARD_URL);
            showToast('Client form URL copied');
          } else {
            showToast(APPLY_VCARD_URL);
          }
        } catch (error) {
          if (error?.name !== 'AbortError') showToast('Share failed', true);
        }
      };
    }

    if (buttons.analytics) {
      buttons.analytics.onclick = () => {
        if (!isProPackage(client)) {
          showToast(PRO_ONLY_MESSAGE);
          return;
        }
        openModal(sections.analyticsAccessModal, inputs.analyticsAccess, errors.analyticsAccess);
      };
    }
  }

function wireResumeButtons(client) {
  const isPro = isProPackage(client);
  const resumeEnabled = !!(client.resume && client.resume.enabled && client.resume.fileUrl);

  const viewSelectors = '#viewResumeBtn, #viewResumeLockedBtn';
  const downloadSelectors = '#downloadResumeBtn, #downloadResumeLockedBtn';
  const reminderSelectors = '#contactReminderBtn, #contactReminderLockedBtn';

  if (!isPro) {
    forceClick(viewSelectors, () => showToast(PRO_ONLY_MESSAGE));
    forceClick(downloadSelectors, () => showToast(PRO_ONLY_MESSAGE));
    forceClick(reminderSelectors, () => showToast(PRO_ONLY_MESSAGE));
    return;
  }

  forceClick(reminderSelectors, () => openReminderPicker(client));

  if (!resumeEnabled) {
    forceClick(viewSelectors, () => showToast('Resume Not Provided', true));
    forceClick(downloadSelectors, () => showToast('No Resume to Download', true));
    return;
  }

  forceClick(viewSelectors, () => {
    pendingResumeMode = 'view';
    openModal(sections.resumeAccessModal, inputs.resumeAccess, errors.resumeAccess);
  });

  forceClick(downloadSelectors, () => {
    pendingResumeMode = 'download';
    openModal(sections.resumeAccessModal, inputs.resumeAccess, errors.resumeAccess);
  });
}
function buildGoogleCalendarUrl(client) {
  const now = new Date();
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const toLocalCalendarStamp = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}${mm}${dd}T${hh}${min}00`;
  };

  const title = `Appointment with ${client.fullName || 'SmartCardLink Contact'}`;
  const details = [
    client.title ? `Title: ${client.title}` : '',
    client.company ? `Company: ${client.company}` : '',
    client.phone1 ? `Phone: ${client.phone1}` : '',
    client.email1 ? `Email: ${client.email1}` : '',
    window.location.href ? `Profile: ${window.location.href}` : ''
  ].filter(Boolean).join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details,
    dates: `${toLocalCalendarStamp(start)}/${toLocalCalendarStamp(end)}`
  });

  if (client.email1) {
    params.set('add', client.email1);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function setupPrimaryLinks(client) {
  const socials = client.socialLinks || {};

  bindLinkButton(buttons.business, client.businessWebsite, 'url', 'Business URL not provided');
  bindLinkButton(buttons.portfolio, client.portfolioWebsite, 'url', 'Portfolio URL not provided');
  bindLinkButton(buttons.location, client.locationMap || client.locationMapUrl, 'url', 'Location map not provided');
  bindLinkButton(buttons.physical, client.address || client.physicalAddress, 'address', 'Physical address not provided');

forceClick('#bookAppointmentBtn', () => {
  const calendarUrl = buildGoogleCalendarUrl(client);
  const win = window.open(calendarUrl, '_blank', 'noopener,noreferrer');
  if (!win) {
    window.location.href = calendarUrl;
  }
});

qsa('#bookAppointmentBtn').forEach((node) => {
  if (node.tagName === 'A') {
    node.setAttribute('href', buildGoogleCalendarUrl(client));
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

  bindLinkButton(buttons.facebook, socials.facebook || client.facebook, 'url', 'Facebook link not provided');
  bindLinkButton(buttons.instagram, socials.instagram || client.instagram, 'url', 'Instagram link not provided');
  bindLinkButton(buttons.x, socials.twitter || socials.x || client.twitter || client.x, 'url', 'X link not provided');
  bindLinkButton(buttons.linkedin, socials.linkedin || client.linkedin, 'url', 'LinkedIn link not provided');
  bindLinkButton(buttons.tiktok, socials.tiktok || client.tiktok, 'url', 'TikTok link not provided');
  bindLinkButton(buttons.youtube, socials.youtube || client.youtube, 'url', 'YouTube link not provided');
}

  function wireModalButtons() {
    if (buttons.resumeAccessCancel) {
      buttons.resumeAccessCancel.onclick = () => closeModal(sections.resumeAccessModal, errors.resumeAccess);
    }
    if (buttons.resumeAccessConfirm) {
      buttons.resumeAccessConfirm.onclick = () => requestResumeAccess(pendingResumeMode);
    }
    if (buttons.analyticsAccessCancel) {
      buttons.analyticsAccessCancel.onclick = () => closeModal(sections.analyticsAccessModal, errors.analyticsAccess);
    }
    if (buttons.analyticsAccessConfirm) {
      buttons.analyticsAccessConfirm.onclick = () => requestAnalyticsAccess();
    }

    if (inputs.resumeAccess) {
      inputs.resumeAccess.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') requestResumeAccess(pendingResumeMode);
        if (e.key === 'Escape') closeModal(sections.resumeAccessModal, errors.resumeAccess);
      });
    }

    if (inputs.analyticsAccess) {
      inputs.analyticsAccess.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') requestAnalyticsAccess();
        if (e.key === 'Escape') closeModal(sections.analyticsAccessModal, errors.analyticsAccess);
      });
    }
  }

  async function init() {
    const client = await fetchProfileData();
    if (!client) return;

    currentClient = client;

    applyTheme(client);
    renderPhoto(client.photoUrl, client.qrCodeUrl);

    if (fullName) fullName.textContent = client.fullName || '';
    if (jobName) jobName.textContent = client.company || '';
    if (titlePosition) titlePosition.textContent = client.title || '';
    if (phoneMain) phoneMain.textContent = client.phone1 || 'Not Provided';
    if (emailMain) emailMain.textContent = client.email1 || 'Not Provided';

    renderContactDropdown(phoneList, phoneDropdownBtn, getExtraValues(client, 'phone'), 'phone');
    renderContactDropdown(emailList, emailDropdownBtn, getExtraValues(client, 'email'), 'email');

    setupActions(client);
    setupPrimaryLinks(client);
    renderPackageUI(client);
    renderWorkingHours(client);
    setAnalyticsCounts(client.analytics || {});
    wireFooterActions(client);
    wireResumeButtons(client);
    wireModalButtons();

    closeModal(sections.resumeAccessModal, errors.resumeAccess);
    closeModal(sections.analyticsAccessModal, errors.analyticsAccess);
    if (sections.analyticsPanel) sections.analyticsPanel.hidden = true;

    setHidden(popup1, false);
    setHidden(popup2, true);

    if (buttons.moreInfo) {
      buttons.moreInfo.onclick = () => {
        setHidden(popup1, true);
        setHidden(popup2, false);
      };
    }

    if (buttons.back) {
      buttons.back.onclick = () => {
        setHidden(popup2, true);
        setHidden(popup1, false);
        if (sections.analyticsPanel) sections.analyticsPanel.hidden = true;
      };
    }
  }

  document.addEventListener('click', (e) => {
    const fs = qs('.photo-fullscreen');
    if (fs && e.target === fs) fs.remove();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeModal(sections.resumeAccessModal, errors.resumeAccess);
    closeModal(sections.analyticsAccessModal, errors.analyticsAccess);
  });

  document.addEventListener('DOMContentLoaded', init);
})();