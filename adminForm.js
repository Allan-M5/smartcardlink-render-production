(function () {
  'use strict';

  /* =====================================================
   SMARTCARDLINK ADMIN FORM MODULE
   Canonical merged version

   - Logic source: ORIGINAL 671-line adminForm.js
   - Enhancements: vCard URL box UI, Email Client, QR, View, Reset UI
   - No truncation of core logic
   - Production-ready, single-admin, no auth layer
  ====================================================== */

  /* =========================
     API CONFIGURATION
  ========================= */
  const API_BASE = 'https://smartcardlink-api.onrender.com';
  const API_URL = `${API_BASE}/api`;

  const params = new URLSearchParams(window.location.search);
  const urlClientId = params.get('id');

  /* =========================
     DOM ELEMENTS
  ========================= */
  const form = document.getElementById('adminForm');
  const clientIdInput = document.getElementById('clientId');

  const saveBtn = document.getElementById('save-btn');
  const viewPdfBtn = document.getElementById('view-pdf-btn');
  const createVcardBtn = document.getElementById('create-vcard-btn');

  const photoUploadInput = document.getElementById('photoFile');
  const photoUrlInput = document.getElementById('photoUrl');
  const photoUploadLabel = document.getElementById('photo-upload-label');
  const photoPreviewContainer = document.getElementById('photo-preview-container');
  const photoPreview = document.getElementById('photo-preview');

  const toastMessage = document.getElementById('toast-message');

  // vCard URL box (HTML upgrades)
  const vcardUrlDisplay = document.getElementById('vcardUrlDisplay');
  const copyVcardUrlBtn = document.getElementById('copyVcardUrlBtn');
  const viewQrBtn = document.getElementById('viewQrBtn');
  const viewVcardBtn = document.getElementById('viewVcardBtn');
  const emailClientBtn = document.getElementById('emailClientBtn');
  const resetCopyStateBtn = document.getElementById('resetCopyStateBtn');

  /* =========================
     STATE
  ========================= */
  let isSaving = false;
  let isPdfGenerating = false;
  let pdfAbortController = null;
  let lastVcardUrl = null;

  /* =========================
     CONSTANTS & HELPERS
  ========================= */
  const SOCIAL_PREFIXES = {
    facebook: 'https://facebook.com/',
    instagram: 'https://instagram.com/',
    twitter: 'https://twitter.com/',
    linkedin: 'https://linkedin.com/in/',
    tiktok: 'https://tiktok.com/@',
    youtube: 'https://youtube.com/',
  };

  const showToast = (message, isError = false) => {
    toastMessage.textContent = message;
    toastMessage.style.backgroundColor = isError ? '#ef4444' : '#FFD700';
    toastMessage.style.color = isError ? '#fff' : '#000';
    toastMessage.style.display = 'block';
    setTimeout(() => (toastMessage.style.display = 'none'), 3000);
  };

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const isValidPhone = (phone) => {
    if (!phone) return true;
    if (/[a-zA-Z]/.test(phone)) return false;
    return phone.replace(/\D/g, '').length >= 10;
  };

  const normalizeSocialLink = (platform, input) => {
    if (!input) return null;
    let val = input.trim();
    if (!val) return null;
    const prefix = SOCIAL_PREFIXES[platform];
    if (!prefix) return null;

    if (val.startsWith('http')) return val.replace('http:', 'https:');

    val = val.replace(/^(www\.)?/, '');
    val = val.replace(/^@/, '').replace(/\/$/, '');

    if (platform === 'linkedin') val = val.replace(/^linkedin\.com\/(in\/)?/i, '');
    if (platform === 'tiktok') val = val.replace(/^tiktok\.com\/@?/i, '');

    return prefix + val;
  };

  const toggleVcardButtons = (enabled) => {
    [copyVcardUrlBtn, viewQrBtn, viewVcardBtn, emailClientBtn].forEach((btn) => {
      if (btn) btn.disabled = !enabled;
    });
  };

  const updateVcardUrlBox = (url) => {
    lastVcardUrl = url || null;
    vcardUrlDisplay.value = url || '';
    toggleVcardButtons(!!url);
  };

  const resetVcardUIState = () => {
    updateVcardUrlBox(null);
    copyVcardUrlBtn.textContent = 'Copy URL';
    emailClientBtn.textContent = 'Email Client';
    showToast('UI states reset');
  };

  /* =========================
     DATA POPULATION (CANONICAL)
  ========================= */
  const populateForm = (data) => {
    clientIdInput.value = data._id || '';

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = val;
    };

    setVal('fullName', data.fullName);
    setVal('title', data.title);
    setVal('phone1', data.phone1);
    setVal('phone2', data.phone2);
    setVal('phone3', data.phone3);
    setVal('email1', data.email1);
    setVal('email2', data.email2);
    setVal('email3', data.email3);
    setVal('companyName', data.company);
    setVal('businessWebsite', data.businessWebsite);
    setVal('portfolioWebsite', data.portfolioWebsite);
    setVal('locationMapUrl', data.locationMap);
    setVal('bio', data.bio);
    setVal('address', data.address);

    if (data.photoUrl) {
      photoUrlInput.value = data.photoUrl;
      photoPreview.src = data.photoUrl;
      photoPreviewContainer.style.display = 'block';
      photoUploadLabel.textContent = 'Photo Uploaded';
      photoUploadLabel.style.backgroundColor = '#22c55e';
    }

    if (data.workingHours) {
      Object.keys(data.workingHours).forEach((k) => setVal(k, data.workingHours[k]));
    }

    if (data.socialLinks) {
      Object.keys(data.socialLinks).forEach((k) => setVal(k, data.socialLinks[k]));
    }

    updateVcardUrlBox(data.vcardUrl || null);
  };

  /* =========================
     API OPERATIONS
  ========================= */
  const fetchClientData = async (id) => {
    try {
      const res = await fetch(`${API_URL}/clients/${id}`);
      if (!res.ok) throw new Error('Client not found');
      const json = await res.json();
      populateForm(json.data || json);
    } catch (e) {
      showToast(e.message, true);
    }
  };

  const uploadPhoto = async (file) => {
    const fd = new FormData();
    fd.append('photo', file);

    try {
      photoUploadLabel.innerHTML = 'Uploading... <span class="spinner"></span>';
      photoUploadLabel.style.backgroundColor = '#3b82f6';

      const res = await fetch(`${API_URL}/upload-photo`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Upload failed');

      const url = json.data?.photoUrl || json.photoUrl;
      if (!url) throw new Error('No public photo URL returned');

      photoUrlInput.value = url;
      photoPreview.src = url;
      photoPreviewContainer.style.display = 'block';
      photoUploadLabel.textContent = 'Photo Uploaded';
      photoUploadLabel.style.backgroundColor = '#22c55e';
      showToast('Photo uploaded successfully');
    } catch (e) {
      photoUploadLabel.textContent = 'Upload Failed';
      photoUploadLabel.style.backgroundColor = '#ef4444';
      showToast(e.message, true);
    }
  };

  const handleFormSubmission = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    isSaving = true;
    saveBtn.innerHTML = 'Saving... <span class="spinner"></span>';
    saveBtn.disabled = true;

    resetVcardUIState();

    const fd = new FormData(form);
    const payload = {};
    const workingHours = {};
    const socialLinks = {};

    for (const [k, v] of fd.entries()) {
      if (!v || k === 'photoFile' || k === 'clientId') continue;
      payload[k] = v.trim();
    }

    ['phone1', 'phone2', 'phone3'].forEach((p) => {
      if (payload[p] && !isValidPhone(payload[p])) throw new Error(`Invalid ${p}`);
    });

    ['email1', 'email2', 'email3'].forEach((e) => {
      if (payload[e] && !isValidEmail(payload[e])) throw new Error(`Invalid ${e}`);
    });

    if (payload.companyName) {
      payload.company = payload.companyName;
      delete payload.companyName;
    }

    if (payload.locationMapUrl) {
      payload.locationMap = payload.locationMapUrl;
      delete payload.locationMapUrl;
    }

    ['monFriStart', 'monFriEnd', 'satStart', 'satEnd', 'sunStart', 'sunEnd'].forEach((k) => {
      if (payload[k]) workingHours[k] = payload[k];
      delete payload[k];
    });

    Object.keys(SOCIAL_PREFIXES).forEach((k) => {
      const n = normalizeSocialLink(k, payload[k]);
      if (n) socialLinks[k] = n;
      delete payload[k];
    });

    if (Object.keys(workingHours).length) payload.workingHours = workingHours;
    if (Object.keys(socialLinks).length) payload.socialLinks = socialLinks;

    try {
      const id = clientIdInput.value;
      const url = id ? `${API_URL}/clients/${id}` : `${API_URL}/clients`;
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Save failed');

      showToast('Client info saved successfully');

      if (!id && json.data?._id) {
        clientIdInput.value = json.data._id;
        history.pushState(null, '', `?id=${json.data._id}`);
        viewPdfBtn.disabled = false;
        createVcardBtn.disabled = false;
      }
    } catch (e) {
      showToast(e.message, true);
    } finally {
      isSaving = false;
      saveBtn.innerHTML = 'Save Info';
      saveBtn.disabled = false;
    }
  };

  const handleViewPdf = async () => {
    const id = clientIdInput.value;
    if (!id) return showToast('Save client first', true);

    if (isPdfGenerating) {
      pdfAbortController.abort();
      isPdfGenerating = false;
      viewPdfBtn.innerHTML = 'View Client Info PDF';
      return;
    }

    isPdfGenerating = true;
    pdfAbortController = new AbortController();
    viewPdfBtn.innerHTML = 'Generating... <span class="spinner"></span>';

    try {
      const res = await fetch(`${API_URL}/clients/${id}/pdf`, {
        method: 'POST',
        signal: pdfAbortController.signal,
      });

      if (!res.ok) throw new Error('PDF generation failed');
      const json = await res.json();
      const pdfUrl = json.data?.pdfUrl || json.pdfUrl;
      if (!pdfUrl) throw new Error('No PDF URL returned');

      window.open(pdfUrl, '_blank');
      showToast('PDF opened successfully');
    } catch (e) {
      if (e.name !== 'AbortError') showToast(e.message, true);
    } finally {
      isPdfGenerating = false;
      viewPdfBtn.innerHTML = 'View Client Info PDF';
    }
  };

  const handleCreateVcard = async () => {
    const id = clientIdInput.value;
    if (!id) return showToast('Save client first', true);

    createVcardBtn.innerHTML = 'Creating... <span class="spinner"></span>';
    createVcardBtn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/clients/${id}/vcard`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.data?.vcardUrl) throw new Error(json.message || 'vCard failed');

      updateVcardUrlBox(json.data.vcardUrl);
      showToast('vCard created successfully');
    } catch (e) {
      showToast(e.message, true);
    } finally {
      createVcardBtn.innerHTML = 'Create vCard';
      createVcardBtn.disabled = false;
    }
  };

  /* =========================
     VCARD URL BOX EVENTS
  ========================= */
  copyVcardUrlBtn.addEventListener('click', () => {
    if (!lastVcardUrl) return;
    navigator.clipboard.writeText(lastVcardUrl).then(() => {
      copyVcardUrlBtn.textContent = 'Copied ✓';
      showToast('vCard URL copied');
      setTimeout(() => (copyVcardUrlBtn.textContent = 'Copy URL'), 2000);
    });
  });

  viewQrBtn.addEventListener('click', () => {
    if (!lastVcardUrl) return;
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(lastVcardUrl)}`, '_blank');
  });

  viewVcardBtn.addEventListener('click', () => {
    if (lastVcardUrl) window.open(lastVcardUrl, '_blank');
  });

  emailClientBtn.addEventListener('click', () => {
    if (!lastVcardUrl) return;
    const email = document.getElementById('email1').value;
    if (!email) return showToast('Client email missing', true);

    const name = document.getElementById('fullName').value || 'Client';
    const subject = encodeURIComponent('Your SmartCardLink vCard');
    const body = encodeURIComponent(`Hi ${name},\n\nHere is your vCard URL:\n${lastVcardUrl}\n\nYour physical card will be delivered after printing.\n\nThank you for choosing our vCard services.`);

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  });

  resetCopyStateBtn.addEventListener('click', resetVcardUIState);

  /* =========================
     INIT
  ========================= */
  document.addEventListener('DOMContentLoaded', () => {
    if (urlClientId) {
      clientIdInput.value = urlClientId;
      fetchClientData(urlClientId);
      viewPdfBtn.disabled = false;
      createVcardBtn.disabled = false;
    } else {
      viewPdfBtn.disabled = true;
      createVcardBtn.disabled = true;
      toggleVcardButtons(false);
    }
  });

  photoUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      photoPreview.src = ev.target.result;
      photoPreviewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);

    uploadPhoto(file);
  });

  form.addEventListener('submit', handleFormSubmission);
  viewPdfBtn.addEventListener('click', handleViewPdf);
  createVcardBtn.addEventListener('click', handleCreateVcard);
})();
