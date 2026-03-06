(function () {
    'use strict';

    const API_BASE = 'https://smartcardlink-api.onrender.com';
    const API_URL = API_BASE + '/api';
    const params = new URLSearchParams(window.location.search);
    const urlClientId = params.get('id');

    // DOM Elements
    const form = document.getElementById('adminForm');
    const clientIdInput = document.getElementById('clientId');
    const saveBtn = document.getElementById('save-btn');
    const photoUrlInput = document.getElementById('photoUrl');
    const photoPreviewContainer = document.getElementById('photo-preview-container');
    const photoPreview = document.getElementById('photo-preview');
    const toastMessage = document.getElementById('toast-message');
    const vcardUrlDisplay = document.getElementById('vcardUrlDisplay');
    const themeColorInput = document.getElementById('themeColor');
    const themeColorPicker = document.getElementById('themeColorPicker');

    let isSaving = false;

    const SOCIAL_PREFIXES = {
        facebook: 'https://facebook.com/',
        instagram: 'https://instagram.com/',
        twitter: 'https://twitter.com/',
        linkedin: 'https://linkedin.com/in/',
        tiktok: 'https://tiktok.com/@',
        youtube: 'https://youtube.com/',
    };

    const showToast = (msg, isError = false) => {
        if (!toastMessage) return;
        toastMessage.textContent = msg;
        toastMessage.style.backgroundColor = isError ? '#ef4444' : '#FFD700';
        toastMessage.style.display = 'block';
        setTimeout(() => { toastMessage.style.display = 'none'; }, 3000);
    };

    const populateForm = (data) => {
        if (!data) return;
        if (clientIdInput) clientIdInput.value = data._id || '';
        
        const fieldMap = {
            'fullName': data.fullName,
            'title': data.title,
            'company': data.company,
            'phone1': data.phone1,
            'email1': data.email1,
            'bio': data.bio,
            'address': data.address,
            'themeColor': data.themeColor,
            'themeName': data.themeName
        };

        Object.entries(fieldMap).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el && val) el.value = val;
        });

        if (data.themeColor && themeColorPicker) themeColorPicker.value = data.themeColor;

        if (data.photoUrl && photoPreview) {
            if (photoUrlInput) photoUrlInput.value = data.photoUrl;
            photoPreview.src = data.photoUrl;
            if (photoPreviewContainer) photoPreviewContainer.style.display = 'block';
        }

        if (data.socialLinks) {
            Object.entries(data.socialLinks).forEach(([k, v]) => {
                const el = document.getElementById(k);
                if (el) el.value = v;
            });
        }
        
        if (data.vcardUrl && vcardUrlDisplay) vcardUrlDisplay.value = data.vcardUrl;
    };

    const loadClient = async (id) => {
        try {
            const res = await fetch(API_URL + '/clients/' + id);
            const json = await res.json();
            if (res.ok) populateForm(json.data);
        } catch (err) { console.error("Load failed", err); }
    };

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSaving) return;
            isSaving = true;
            if (saveBtn) saveBtn.innerHTML = 'Saving...';

            const fd = new FormData(form);
            const payload = {
                socialLinks: {},
                workingHours: {}
            };

            for (const [k, v] of fd.entries()) {
                if (!v || k === 'photoFile' || k === 'clientId') continue;
                if (SOCIAL_PREFIXES[k]) {
                    payload.socialLinks[k] = v;
                } else {
                    payload[k] = v;
                }
            }

            try {
                const id = clientIdInput ? clientIdInput.value : '';
                const method = id ? 'PUT' : 'POST';
                const endpoint = id ? (API_URL + '/clients/' + id) : (API_URL + '/clients');

                const res = await fetch(endpoint, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    showToast('Saved Successfully');
                    if (!id) location.reload(); 
                } else {
                    throw new Error('Save failed');
                }
            } catch (err) {
                showToast(err.message, true);
            } finally {
                isSaving = false;
                if (saveBtn) saveBtn.innerHTML = 'Save Info';
            }
        });
    }

    if (themeColorPicker && themeColorInput) {
        themeColorPicker.addEventListener('input', (e) => { themeColorInput.value = e.target.value.toUpperCase(); });
        themeColorInput.addEventListener('input', (e) => { themeColorPicker.value = e.target.value; });
    }

    if (urlClientId) loadClient(urlClientId);
})();