(function () {
  'use strict';

  // ==============================
  // Global API Configuration
  // ==============================
  const API_BASE = "https://smartcardlink-api.onrender.com";
  const API_URL = `${API_BASE}/api`;

  const params = new URLSearchParams(window.location.search);
  const urlClientId = params.get('id');

  // ==============================
  // DOM Elements
  // ==============================
  const form = document.getElementById('adminForm');
  const clientIdInput = document.getElementById('clientId');

  const viewPdfBtn = document.getElementById('view-pdf-btn'); // DATA VIEW (PDF replaced)
  const createVcardBtn = document.getElementById('create-vcard-btn');

  const photoUploadInput = document.getElementById('photoFile');
  const photoUrlInput = document.getElementById('photoUrl');
  const photoUploadLabel = document.getElementById('photo-upload-label');
  const photoPreviewContainer = document.getElementById('photo-preview-container');
  const photoPreview = document.getElementById('photo-preview');

  const saveBtn = document.getElementById('save-btn');
  const toastMessage = document.getElementById('toast-message');

  // vCard URL BOX
  const vcardUrlDisplay = document.getElementById('vcardUrlDisplay');
  const copyVcardUrlBtn = document.getElementById('copyVcardUrlBtn');
  const viewQrBtn = document.getElementById('viewQrBtn');
  const viewVcardBtn = document.getElementById('viewVcardBtn');
  const emailClientBtn = document.getElementById('emailClientBtn');
  const resetCopyStateBtn = document.getElementById('resetCopyStateBtn');

  // ==============================
  // State Variables
  // ==============================
  let isSaving = false;
  let isPdfGenerating = false;
  let pdfAbortController = null;
  let lastVcardUrl = null;

  // ==============================
  // Helper Constants
  // ==============================
  const SOCIAL_PREFIXES = {
    facebook: 'https://facebook.com/',
    instagram: 'https://instagram.com/',
    twitter: 'https://twitter.com/',
    linkedin: 'https://linkedin.com/in/',
    tiktok: 'https://tiktok.com/@',
    youtube: 'https://youtube.com/',
  };

  // ==============================
  // Helper Functions
  // ==============================
  const showToast = (message, isError = false) => {
    toastMessage.textContent = message;
    toastMessage.style.backgroundColor = isError ? '#ef4444' : '#FFD700';
    toastMessage.style.color = isError ? '#fff' : '#000';
    toastMessage.style.display = 'block';
    setTimeout(() => toastMessage.style.display = 'none', 3000);
  };

  const setLoading = (btn, label) => {
    btn.disabled = true;
    btn.innerHTML = `${label} <span class="spinner"></span>`;
    btn.classList.add('pressed');
  };

  const resetButton = (btn, label) => {
    btn.innerHTML = label;
    btn.disabled = !clientIdInput.value;
    btn.classList.remove('pressed');
  };

  const normalizeSocialLink = (platform, input) => {
    if (!input || !SOCIAL_PREFIXES[platform]) return null;
    let value = input.trim();
    if (value.startsWith('http')) return value.replace('http:', 'https:');
    value = value.replace(/^@/, '');
    return SOCIAL_PREFIXES[platform] + value;
  };

  const isValidEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const isValidPhone = (phone) => {
    if (!phone) return true;
    if (/[a-zA-Z]/.test(phone)) return false;
    return phone.replace(/\D/g, '').length >= 10;
  };

  const toggleVcardButtons = (enabled) => {
    [copyVcardUrlBtn, viewQrBtn, viewVcardBtn, emailClientBtn]
      .forEach(btn => btn && (btn.disabled = !enabled));
  };

  // ==============================
  // Photo Upload
  // ==============================
  const uploadPhoto = async (file) => {
    const formData = new FormData();
    formData.append('photo', file);

    try {
      photoUploadLabel.innerHTML = 'Uploading... <span class="spinner"></span>';
      const res = await fetch(`${API_URL}/upload-photo`, {
        method: 'POST',
        body: formData
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Upload failed');

      photoUrlInput.value = json.data.photoUrl;
      photoPreview.src = json.data.photoUrl;
      photoPreviewContainer.style.display = 'block';

      photoUploadLabel.textContent = 'Photo Uploaded';
      photoUploadLabel.style.backgroundColor = '#22c55e';
      showToast('Photo uploaded successfully');
    } catch (err) {
      photoUploadLabel.textContent = 'Upload Failed';
      photoUploadLabel.style.backgroundColor = '#ef4444';
      showToast(err.message, true);
    }
  };

  // ==============================
  // Form Submission
  // ==============================
  const handleFormSubmission = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    isSaving = true;
    setLoading(saveBtn, 'Saving');

    const payload = {};
    const socialLinks = {};
    const workingHours = {};
    const fd = new FormData(form);

    try {
      for (const [key, value] of fd.entries()) {
        if (!value || key === 'photoFile' || key === 'clientId') continue;

        if (SOCIAL_PREFIXES[key]) {
          const normalized = normalizeSocialLink(key, value);
          if (normalized) socialLinks[key] = normalized;
        } else if (key.includes('Start') || key.includes('End')) {
          workingHours[key] = value;
        } else {
          payload[key] = value.trim();
        }
      }

      if (payload.email1 && !isValidEmail(payload.email1))
        throw new Error('Invalid primary email');

      if (payload.phone1 && !isValidPhone(payload.phone1))
        throw new Error('Invalid primary phone');

      if (Object.keys(socialLinks).length) payload.socialLinks = socialLinks;
      if (Object.keys(workingHours).length) payload.workingHours = workingHours;

      const method = clientIdInput.value ? 'PUT' : 'POST';
      const endpoint = clientIdInput.value
        ? `${API_URL}/clients/${clientIdInput.value}`
        : `${API_URL}/clients`;

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Save failed');

      if (!clientIdInput.value && json.data?._id) {
        clientIdInput.value = json.data._id;
        window.history.replaceState(null, '', `?id=${json.data._id}`);
        viewPdfBtn.disabled = false;
        createVcardBtn.disabled = false;
      }

      lastVcardUrl = null;
      vcardUrlDisplay.value = '';
      toggleVcardButtons(false);

      showToast('Client info saved');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      isSaving = false;
      resetButton(saveBtn, 'Save Info');
    }
  };

  // ==============================
  // VIEW CLIENT INFO (DATA VIEW)
  // ==============================
  const generateClientViewHTML = (client) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${client.fullName}</title>
<style>
body{font-family:Arial;background:#f4f6f8;padding:30px}
.card{max-width:800px;margin:auto;background:#fff;padding:25px;border-radius:10px}
img{max-width:140px;border-radius:8px}
</style>
</head>
<body>
<div class="card">
<h2>${client.fullName || ''}</h2>
<p>${client.title || ''}</p>
${client.photoUrl ? `<img src="${client.photoUrl}">` : ''}
<p>${client.phone1 || ''}</p>
<p>${client.email1 || ''}</p>
<p>${client.bio || ''}</p>
</div>
</body>
</html>`;

  viewPdfBtn.addEventListener('click', async () => {
    const id = clientIdInput.value;
    if (!id) return showToast('Save client first', true);

    setLoading(viewPdfBtn, 'Opening');

    try {
      const res = await fetch(`${API_URL}/clients/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error('Failed to load client');

      const win = window.open('', '_blank');
      win.document.write(generateClientViewHTML(json.data));
      win.document.close();

      showToast('Client info opened');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      resetButton(viewPdfBtn, 'View Client Info PDF');
    }
  });

  // ==============================
  // CREATE VCARD
  // ==============================
  createVcardBtn.addEventListener('click', async () => {
    if (!clientIdInput.value) return;

    setLoading(createVcardBtn, 'Creating');

    try {
      const res = await fetch(`${API_URL}/clients/${clientIdInput.value}/vcard`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'vCard failed');

      // FINAL SAFE FIX: Ensure authoritative URL is captured and UI is cleared
      const vcardUrl = json.data.vcardUrl;
      
      vcardUrlDisplay.value = ""; // Clear existing to prevent "ghost" data
      vcardUrlDisplay.value = vcardUrl;
      
      lastVcardUrl = vcardUrl;
      toggleVcardButtons(true);

      showToast('vCard generated');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      resetButton(createVcardBtn, 'Create vCard');
    }
  });

  // ==============================
  // VCARD UTILITIES
  // ==============================
  copyVcardUrlBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(vcardUrlDisplay.value)
      .then(() => showToast('URL copied'))
      .catch(() => showToast('Copy failed', true));
  });

  viewQrBtn.addEventListener('click', () => {
    if (!vcardUrlDisplay.value) return;
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(vcardUrlDisplay.value)}`);
  });

  viewVcardBtn.addEventListener('click', () => {
    if (vcardUrlDisplay.value) window.open(vcardUrlDisplay.value, '_blank');
  });

  emailClientBtn.addEventListener('click', () => {
    const email = document.getElementById('email1').value;
    if (!email) return;

    const name = document.getElementById('fullName').value || 'Client';
    const body = encodeURIComponent(
`Hi ${name},

Here is your vCard URL: ${vcardUrlDisplay.value}

Your physical card will be delivered after printing.
Thank you for choosing our vCard services.

Best regards,
SmartCardLink Admin`
    );

    window.location.href = `mailto:${email}?cc=allanmujera91@icloud.com&subject=Your SmartCardLink vCard&body=${body}`;
  });

  resetCopyStateBtn.addEventListener('click', () => {
    copyVcardUrlBtn.textContent = 'Copy URL';
    emailClientBtn.textContent = 'Email Client';
    showToast('UI states reset');
  });

  // ==============================
  // Init
  // ==============================
  if (urlClientId) {
    clientIdInput.value = urlClientId;
    viewPdfBtn.disabled = false;
    createVcardBtn.disabled = false;
  }

  form.addEventListener('submit', handleFormSubmission);
  photoUploadInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      photoPreview.src = ev.target.result;
      photoPreviewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
    uploadPhoto(file);
  });

})();
