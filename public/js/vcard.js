(function () {
'use strict';

/* =========================
   CONFIG & HELPERS
========================= */
const API_ROOT = 'https://smartcardlink-api.onrender.com';
const el = id => document.getElementById(id);

function setHidden(node, hidden) {
  if (!node) return;
  if (hidden) {
    node.style.display = 'none';
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('hidden', '');
  } else {
    node.style.display = 'block';
    node.setAttribute('aria-hidden', 'false');
    node.removeAttribute('hidden');
  }
}

function alertMsg(msg) {
  alert(msg);
}

/* =========================
   DOM REFERENCES
========================= */
const popup1 = el('popup1');
const popup2 = el('popup2');
const photoArea = el('photoArea');
const liveTime = el('liveTime');

const buttons = {
  moreInfo: el('moreInfoBtn'),
  back: el('backBtn'),
  facebook: el('facebookBtn'),
  instagram: el('instagramBtn'),
  x: el('xBtn'),
  linkedin: el('linkedinBtn'),
  tiktok: el('tiktokBtn'),
  youtube: el('youtubeBtn')
};

/* =========================
   PHOTO ? QR SWIPE (LIVE SAFE)
========================= */
function enhancePhotoSwipe() {
  const img = photoArea?.querySelector('img');
  if (!photoArea || !img || photoArea.classList.contains('photo-swipe-ready')) return;

  photoArea.classList.add('photo-swipe-ready');
  photoArea.innerHTML = '';

  let startX = 0;
  let index = 0;
  let lastTap = 0;

  const container = document.createElement('div');
  container.className = 'photo-swipe-container';

  const track = document.createElement('div');
  track.className = 'photo-swipe-track';

  const photoPanel = document.createElement('div');
  photoPanel.className = 'photo-panel';

  const hint = document.createElement('div');
  hint.className = 'swipe-hint';
  hint.textContent = 'Swipe for QR';

  photoPanel.appendChild(img);
  photoPanel.appendChild(hint);

  const qrPanel = document.createElement('div');
  qrPanel.className = 'qr-panel';

  const qr = document.getElementById('qrCode');
  if (qr) qrPanel.appendChild(qr.cloneNode(true));

  track.appendChild(photoPanel);
  track.appendChild(qrPanel);
  container.appendChild(track);
  photoArea.appendChild(container);

  container.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  container.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) {
      index = index === 0 ? 1 : 0;
      track.style.transform = 'translateX(-' + (index * 50) + '%)';
      if (navigator.vibrate) navigator.vibrate(20);
    }
  });

  img.addEventListener('touchend', () => {
    const now = Date.now();
    if (now - lastTap < 300) {
      container.classList.toggle('photo-fullscreen');
    }
    lastTap = now;
  });
}

/* =========================
   DATA LOAD
========================= */
async function fetchProfileData() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  if (!slug) throw new Error('Missing vCard slug');

  const res = await fetch(API_ROOT + '/api/vcard/' + slug);
  if (!res.ok) throw new Error('Failed to load vCard');

  const json = await res.json();
  return json.data;
}

function renderPhoto(url) {
  photoArea.innerHTML = '';
  const img = document.createElement('img');
  img.src = url;
  img.alt = 'Profile Photo';
  photoArea.appendChild(img);
  enhancePhotoSwipe();
}

/* =========================
   INIT
========================= */
async function init() {
  const client = await fetchProfileData();
  if (!client) return;

  renderPhoto(client.photoUrl);

  setHidden(popup1, false);
  setHidden(popup2, true);
}

/* =========================
   NAVIGATION
========================= */
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
  };
}

/* =========================
   LIVE CLOCK
========================= */
if (liveTime) {
  setInterval(() => {
    const options = {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'Africa/Nairobi'
    };
    liveTime.textContent = new Date().toLocaleString('en-GB', options).replace(',', ' ');
  }, 1000);
}

document.addEventListener('DOMContentLoaded', init);

})();
