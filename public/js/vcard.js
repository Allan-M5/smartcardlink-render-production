(function () {
  'use strict';

  const API_ROOT = 'https://smartcardlink-api.onrender.com';
  const el = id => document.getElementById(id);

  const popup1 = el('popup1');
  const popup2 = el('popup2');
  const photoArea = el('photoArea');

  function setHidden(node, hidden) {
    if (!node) return;
    node.style.display = hidden ? 'none' : 'block';
    node.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    hidden ? node.setAttribute('hidden','') : node.removeAttribute('hidden');
  }

  async function fetchProfileData() {
    const slug = new URLSearchParams(window.location.search).get('slug');
    if (!slug) throw new Error('Missing slug');

    const res = await fetch(API_ROOT + '/api/vcard/' + slug);
    const json = await res.json();
    return json.data;
  }

  function enhancePhotoSwipe() {
    if (!photoArea || photoArea.classList.contains('photo-swipe-ready')) return;

    const img = photoArea.querySelector('img');
    const qr  = document.getElementById('qrCode');
    if (!img || !qr) return;

    photoArea.classList.add('photo-swipe-ready');
    photoArea.innerHTML = '';

    let startX = 0;
    let index = 0;

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
    qrPanel.appendChild(qr);

    track.appendChild(photoPanel);
    track.appendChild(qrPanel);
    container.appendChild(track);
    photoArea.appendChild(container);

    container.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
    });

    container.addEventListener('touchend', function (e) {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) {
        index = index === 0 ? 1 : 0;
        track.style.transform = 'translateX(-' + (index * 50) + '%)';
      }
    });
  }

  function renderPhoto(photoUrl, qrUrl) {
    photoArea.innerHTML = '';

    const img = document.createElement('img');
    img.src = photoUrl || '/public/images/default-photo.png';
    img.alt = 'Profile Photo';
    photoArea.appendChild(img);

    if (qrUrl) {
      const qrImg = document.createElement('img');
      qrImg.id = 'qrCode';
      qrImg.src = qrUrl;
      qrImg.style.display = 'none';
      photoArea.appendChild(qrImg);
    }

    setTimeout(enhancePhotoSwipe, 0);
  }

  async function init() {
    const client = await fetchProfileData();
    if (!client) return;

    renderPhoto(client.photoUrl, client.qrCodeUrl);
    setHidden(popup1, false);
    setHidden(popup2, true);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
