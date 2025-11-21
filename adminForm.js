// C:\Users\ADMIN\Desktop\smartcardlink-app\public\js\adminForm.js

// --- Global Variables and Constants ---
// CRITICAL: Hardcode the production URL here as per the blueprint
const API_URL = window.RENDER_API_BASE_URL;
const params = new URLSearchParams(window.location.search);
const clientId = params.get('id');

// --- DOM Elements ---
const form = document.getElementById('adminForm');
const viewPdfBtn = document.getElementById('view-pdf-btn');
const createVcardBtn = document.getElementById('create-vcard-btn');
const photoUploadInput = document.getElementById('photoFile');
const photoUrlInput = document.getElementById('photoUrl');
const photoUploadLabel = document.getElementById('photo-upload-label');
const photoPreviewContainer = document.getElementById('photo-preview-container');
const photoPreview = document.getElementById('photo-preview');
const saveBtn = document.getElementById('save-btn');
const toastMessage = document.getElementById('toast-message');

let isSaving = false;

// --- Helper Functions ---

/**
 * Displays a toast message to the user.
 * @param {string} message The message to display.
 * @param {boolean} isError Whether the message is an error.
 */
const showToast = (message, isError = false) => {
    toastMessage.textContent = message;
    toastMessage.style.backgroundColor = isError ? '#ef4444' : '#FFD700';
    toastMessage.style.color = isError ? 'white' : 'black';
    toastMessage.style.display = 'block';
    setTimeout(() => {
        toastMessage.style.display = 'none';
    }, 3000);
};

/**
 * Populates form fields from a client data object.
 * @param {object} data The client data object.
 */
const populateForm = (data) => {
    // Personal Details
    document.getElementById('fullName').value = data.fullName || '';
    document.getElementById('title').value = data.title || '';
    document.getElementById('phone1').value = data.phone1 || '';
    document.getElementById('phone2').value = data.phone2 || '';
    document.getElementById('phone3').value = data.phone3 || '';
    document.getElementById('email1').value = data.email1 || '';
    document.getElementById('email2').value = data.email2 || '';
    document.getElementById('email3').value = data.email3 || '';
    
    // Business Details
    document.getElementById('companyName').value = data.companyName || '';
    document.getElementById('businessWebsite').value = data.businessWebsite || '';
    document.getElementById('portfolioWebsite').value = data.portfolioWebsite || '';
    document.getElementById('locationMapUrl').value = data.locationMapUrl || '';

    // Photo URL
    if (data.photoUrl) {
        photoUrlInput.value = data.photoUrl;
        photoPreview.src = data.photoUrl;
        photoPreviewContainer.style.display = 'block';
        photoUploadLabel.textContent = 'Photo Uploaded';
        photoUploadLabel.style.backgroundColor = '#22c55e';
    }

    // Working Hours
    if (data.workingHours) {
        for (const day in data.workingHours) {
            const input = document.getElementById(day);
            if (input) input.value = data.workingHours[day];
        }
    }

    // Social Links
    if (data.socialLinks) {
        for (const platform in data.socialLinks) {
            const input = document.getElementById(platform);
            if (input) input.value = data.socialLinks[platform];
        }
    }

    // Bio & Address
    document.getElementById('bio').value = data.bio || '';
    document.getElementById('address').value = data.address || '';
};

// --- Core Application Logic ---

/**
 * Fetches client data from the backend.
 * @param {string} id The ID of the client to fetch.
 */
const fetchClientData = async (id) => {
    try {
        const response = await fetch(`${API_URL}/clients/${id}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch client data for ID: ${id}`);
        }
        const data = await response.json();
        populateForm(data);
        console.log(`Form populated with client data for ID: ${id}`);
    } catch (error) {
        console.error('Error fetching client data:', error);
        showToast(`Error fetching data: ${error.message}`, true);
    }
};

/**
 * Uploads a photo to the backend for processing by Cloudinary.
 * @param {File} file The image file to upload.
 */
const uploadPhoto = async (file) => {
    if (!file) return;

    const formData = new FormData();
    formData.append('photo', file); // 'photo' matches the field name your backend expects

    try {
        photoUploadLabel.innerHTML = 'Uploading... <span class="spinner"></span>';
        photoUploadLabel.style.backgroundColor = '#3b82f6';

        const response = await fetch(`${API_URL}/upload-photo`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Photo upload failed on the server.');
        }

        const data = await response.json();
        const photoUrl = data.photoUrl;
        photoUrlInput.value = photoUrl;
        showToast('Photo uploaded successfully!');
        
        // Update the preview image with the new URL
        photoPreview.src = photoUrl;
        photoPreviewContainer.style.display = 'block';

        photoUploadLabel.textContent = 'Photo Uploaded';
        photoUploadLabel.style.backgroundColor = '#22c55e';
    } catch (error) {
        console.error('Photo upload error:', error);
        showToast(`Photo upload failed: ${error.message}`, true);
        photoUploadLabel.textContent = 'Photo Upload Failed';
        photoUploadLabel.style.backgroundColor = '#ef4444';
    }
};

/**
 * Handles the form submission to save client data.
 */
const handleFormSubmission = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    isSaving = true;
    saveBtn.innerHTML = 'Saving... <span class="spinner"></span>';
    saveBtn.disabled = true;

    const formData = new FormData(form);
    const payload = {};
    for (const [key, value] of formData.entries()) {
        if (value) {
            payload[key] = value.trim();
        }
    }
    
    // Separate nested objects for workingHours and socialLinks
    const workingHours = {};
    const socialLinks = {};
    const workingHoursKeys = ['monFriStart', 'monFriEnd', 'satStart', 'satEnd', 'sunStart', 'sunEnd'];
    const socialLinksKeys = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube'];

    for (const key of workingHoursKeys) {
        if (payload[key] && payload[key] !== '--:--') {
            workingHours[key] = payload[key];
            delete payload[key];
        }
    }
    for (const key of socialLinksKeys) {
        if (payload[key]) {
            socialLinks[key] = payload[key];
            delete payload[key];
        }
    }

    if (Object.keys(workingHours).length > 0) payload.workingHours = workingHours;
    if (Object.keys(socialLinks).length > 0) payload.socialLinks = socialLinks;

    try {
        const url = clientId ? `${API_URL}/clients/${clientId}` : `${API_URL}/clients`;
        const method = clientId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error('Failed to save client info.');
        }
        
        showToast('Client info saved successfully!');
        
        // If a new client, redirect to the new admin page
        const data = await response.json();
        if (!clientId && data._id) {
            window.location.href = `/adminForm.html?id=${data._id}`;
        }
        
    } catch (error) {
        console.error('Save error:', error);
        showToast(`Save failed: ${error.message}`, true);
    } finally {
        isSaving = false;
        saveBtn.innerHTML = 'Save Info';
        saveBtn.disabled = false;
    }
};

/**
 * Handles the "View Client Info PDF" button click.
 */
const handleViewPdfClick = () => {
    if (!clientId) {
        showToast('Please save client info first.', true);
        return;
    }
    viewPdfBtn.classList.add('pressed');
    // Open a fresh tab with the PDF generated from the backend.
    window.open(`${API_URL}/pdf-viewer/${clientId}`, '_blank');
};

/**
 * Handles the "Create vCard" button click.
 */
const handleCreateVcardClick = async () => {
    if (!clientId) {
        showToast('Please save client info first.', true);
        return;
    }
    
    createVcardBtn.classList.add('pressed');
    createVcardBtn.innerHTML = 'Creating... <span class="spinner"></span>';
    createVcardBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/create-vcard/${clientId}`, {
            method: 'POST',
        });
        
        if (!response.ok) {
            throw new Error('Failed to create vCard.');
        }

        const data = await response.json();
        showToast('vCard and QR code created and sent successfully!');
        
        // Open a new tab with the QR code image for printing
        window.open(data.qrCodeUrl, '_blank');
        
    } catch (error) {
        console.error('vCard creation error:', error);
        showToast(`vCard creation failed: ${error.message}`, true);
    } finally {
        createVcardBtn.innerHTML = 'Create vCard';
        createVcardBtn.disabled = false;
    }
};

// --- Initialization & Event Listeners ---
window.onload = () => {
    if (clientId) {
        fetchClientData(clientId);
    }
};

photoUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        // Show an instant preview of the selected image
        const reader = new FileReader();
        reader.onload = (event) => {
            photoPreview.src = event.target.result;
            photoPreviewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);

        // Now upload the photo to the backend
        uploadPhoto(file);
    }
});
    
form.addEventListener('submit', handleFormSubmission);
viewPdfBtn.addEventListener('click', handleViewPdfClick);
createVcardBtn.addEventListener('click', handleCreateVcardClick);