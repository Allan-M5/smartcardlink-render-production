// C:\Users\ADMIN\Desktop\smartcardlink-app\adminForm.js

(function () {
  'use strict';

  // Add global API override
  const API_URL = window.API_BASE_URL || `${window.location.origin}/api`; 

  const params = new URLSearchParams(window.location.search);
  const clientId = params.get('id');

  // ------------------------
  // DOM Elements
  // ------------------------
  const form = document.getElementById('adminForm');
  const clientIdInput = document.getElementById('clientId'); // Assuming you have a hidden input for client ID
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

  // ------------------------
  // Helper Constants and Functions
  // ------------------------

  const SOCIAL_PREFIXES = {
    facebook: 'https://facebook.com/',
    instagram: 'https://instagram.com/',
    twitter: 'https://twitter.com/',
    linkedin: 'https://linkedin.com/in/',
    tiktok: 'https://tiktok.com/@',
    youtube: 'https://youtube.com/',
  };

  /**
   * Normalizes a social media link to the required full URL format.
   * @param {string} platform - The social platform key.
   * @param {string} input - The raw user input.
   * @returns {string | null} The normalized full URL, or null if invalid/empty.
   */
  const normalizeSocialLink = (platform, input) => {
    if (!input || typeof input !== 'string' || input.trim() === '') return null;

    let value = input.trim();
    const prefix = SOCIAL_PREFIXES[platform];
    if (!prefix) return null;

    // Check if it's already a correct full URL (only enforce https)
    if (value.startsWith(prefix.replace('https', 'http'))) {
        return value.replace('http:', 'https:');
    }
    
    // 1. Remove common prefixes and handles (www, http/s, handle symbols)
    value = value.replace(/^(https?:\/\/)?(www\.)?/, '');
    
    if (platform === 'linkedin') {
        value = value.replace(/^linkedin\.com\/(in\/)?/i, '');
    } else if (platform === 'tiktok') {
        value = value.replace(/^tiktok\.com\/@/i, '');
        value = value.replace(/^@/, '');
    } else if (platform === 'instagram' || platform === 'twitter') {
        value = value.replace(/^(instagram|twitter)\.com\//i, '');
        value = value.replace(/^@/, '');
    } else if (platform === 'facebook') {
        value = value.replace(/^facebook\.com\//i, '');
    } else if (platform === 'youtube') {
        // Handle common youtube URL paths: /user/, /c/, /channel/, /
        value = value.replace(/^youtube\.com\/(user\/|c\/|channel\/)?/i, '');
    }

    // 2. Remove trailing slashes
    value = value.replace(/\/$/, '');
    
    // If the value is empty after normalization, return null
    if (value === '') return null;

    // 3. Reconstruct the final, correct URL
    return prefix + value;
  };

  /**
   * Validates if a string is a valid email format.
   * @param {string} email
   * @returns {boolean}
   */
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  /**
   * Validates if a string is a valid phone number (no letters, >= 10 digits).
   * @param {string} phone
   * @returns {boolean}
   */
  const isValidPhone = (phone) => {
    if (!phone) return true; // Allow empty/optional phone fields to pass
    
    // Reject any letters
    if (/[a-zA-Z]/.test(phone)) return false; 
    
    const cleaned = phone.replace(/\D/g, ''); // Remove all non-digits (spaces, dashes, parens)
    return cleaned.length >= 10; // Check length
  };
  
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
   * Populates form fields from a client data object fetched from the backend.
   * @param {object} data The client data object.
   */
  const populateForm = (data) => {
    // Assuming you have a hidden input field named 'clientId'
    if (data._id && clientIdInput) {
      clientIdInput.value = data._id;
    }

    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.value = value;
    };

    // Personal Details
    setValue('fullName', data.fullName);
    setValue('title', data.title);
    setValue('phone1', data.phone1);
    setValue('phone2', data.phone2);
    setValue('phone3', data.phone3);
    setValue('email1', data.email1);
    setValue('email2', data.email2);
    setValue('email3', data.email3);

    // Business Details
    setValue('companyName', data.company); 
    setValue('businessWebsite', data.businessWebsite);
    setValue('portfolioWebsite', data.portfolioWebsite);
    setValue('locationMapUrl', data.locationMap); 

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
      ['monFriStart', 'monFriEnd', 'satStart', 'satEnd', 'sunStart', 'sunEnd'].forEach(day => {
        setValue(day, data.workingHours[day]);
      });
    }

    // Social Links
    if (data.socialLinks) {
      // IMPORTANT: We populate the form fields with the *normalized* URL from the DB.
      ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube'].forEach(platform => {
        setValue(platform, data.socialLinks[platform]);
      });
    }

    // Bio & Address
    setValue('bio', data.bio);
    setValue('address', data.address);
  };

  // ------------------------
  // Core Application Logic
  // ------------------------

  const fetchClientData = async (id) => {
    try {
      const response = await fetch(`${API_URL}/clients/${id}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch client data for ID: ${id}`);
      }
      const json = await response.json();
      const data = json.data || json; 
      populateForm(data);
      console.log(`Form populated with client data for ID: ${id}`);
    } catch (error) {
      console.error('Error fetching client data:', error);
      showToast(`Error fetching data: ${error.message}`, true);
    }
  };

  const uploadPhoto = async (file) => {
    if (!file) return;

    const formData = new FormData();
    formData.append('photo', file); 

    try {
      photoUploadLabel.innerHTML = 'Uploading... <span class="spinner"></span>';
      photoUploadLabel.style.backgroundColor = '#3b82f6';

      const response = await fetch(`${API_URL}/upload-photo`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Photo upload failed on the server.');
      }

      showToast('Photo uploaded successfully!', false);
      // FIX 3.1: Update the hidden input with the Cloudinary URL
      if (result.data && result.data.photoUrl) {
          photoUrlInput.value = result.data.photoUrl; 
      } else {
          throw new Error('Upload failed: Server did not return photo URL.');
      }

      photoUploadLabel.textContent = 'Photo Uploaded';
      photoUploadLabel.style.backgroundColor = '#22c55e';
    } catch (error) {
      console.error('Photo upload error:', error);
      showToast(`Photo upload failed: ${error.message}`, true);
      photoUploadLabel.textContent = 'Photo Upload Failed';
      photoUploadLabel.style.backgroundColor = '#ef4444';
    }
  };

  const handleFormSubmission = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    isSaving = true;
    saveBtn.innerHTML = 'Saving... <span class="spinner"></span>';
    saveBtn.disabled = true;

    const formData = new FormData(form);
    const payload = {};
    const socialLinks = {}; // Will hold normalized links
    const workingHours = {};
    const workingHoursKeys = ['monFriStart', 'monFriEnd', 'satStart', 'satEnd', 'sunStart', 'sunEnd'];
    const socialLinksKeys = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube'];
    
    // 1. Populate flat payload fields and remove temporary/nested keys
    for (const [key, value] of formData.entries()) {
      // Exclude the file input from the JSON payload
      if (key !== 'photoFile' && value !== undefined) { 
        payload[key] = value.trim();
      }
    }
    
    try {
      // --- Client-Side Validation of Phone and Email ---
      const phoneFields = ['phone1', 'phone2', 'phone3'];
      const emailFields = ['email1', 'email2', 'email3'];

      for (const key of phoneFields) {
          if (payload[key] && !isValidPhone(payload[key])) {
              throw new Error(`Invalid phone number for ${key}: Must be 10 digits or more and contain no letters.`);
          }
      }

      for (const key of emailFields) {
          if (payload[key] && !isValidEmail(payload[key])) {
              throw new Error(`Invalid email address for ${key}.`);
          }
      }

      // 2. Normalize and structure nested data for server merge
      
      // Map and remove flat working hours keys
      for (const key of workingHoursKeys) {
        if (payload[key] && payload[key] !== '--:--') {
          workingHours[key] = payload[key];
        } else {
          workingHours[key] = ''; // Ensure field is explicitly cleared if submitted blank
        }
        delete payload[key];
      }
      
      // Normalize, map, and remove flat social links keys
      for (const key of socialLinksKeys) {
        const normalizedUrl = normalizeSocialLink(key, payload[key]);
        if (normalizedUrl) {
          socialLinks[key] = normalizedUrl;
        } else {
          socialLinks[key] = ''; // Ensure field is explicitly cleared if submitted blank
        }
        delete payload[key]; 
      }

      // Map remaining temporary keys to schema keys
      if (payload.companyName) {
        payload.company = payload.companyName;
        delete payload.companyName;
      }
      if (payload.locationMapUrl) {
        payload.locationMap = payload.locationMapUrl;
        delete payload.locationMapUrl;
      }
      
      // FIX 3.2 (CORRECTED): Attach the normalized nested objects to the payload
      payload.workingHours = workingHours;
      payload.socialLinks = socialLinks;

      // 3. API Call (PUT/POST)
      const url = clientId ? `${API_URL}/clients/${clientId}` : `${API_URL}/clients`;
      const method = clientId ? 'PUT' : 'POST';
      
      // console.log('Final Payload:', JSON.stringify(payload, null, 2)); // Debugging payload

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save client info.');
      }
      
      showToast('Client info saved successfully!');
      
      // If creating a new client (POST), redirect to the edit view (PUT)
      if (!clientId && data.data && data.data.recordId) {
        window.location.href = `admin-form.html?id=${data.data.recordId}`;
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

  const handleViewPdfClick = async () => {
    if (!clientId) return showToast('Please save client info first.', true);
    
    viewPdfBtn.classList.add('pressed');
    viewPdfBtn.innerHTML = 'Generating... <span class="spinner"></span>';
    viewPdfBtn.disabled = true;

    try {
      const response = await fetch(`${API_URL}/clients/${clientId}/pdf`, {
        method: 'POST' // Changed to POST to match server implementation
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to retrieve PDF.');
      }
      
      const data = await response.json();
      const pdfUrl = data.pdfUrl || data.url || (data.data && data.data.pdfUrl);

      if (pdfUrl) {
        window.open(pdfUrl, '_blank');
        showToast('PDF opened successfully!');
      } else {
         throw new Error('PDF URL not returned by server.');
      }
      
    } catch (error) {
      console.error('PDF retrieval error:', error);
      showToast(`PDF retrieval failed: ${error.message}`, true);
    } finally {
      viewPdfBtn.innerHTML = 'View Client Info PDF';
      viewPdfBtn.classList.remove('pressed');
      viewPdfBtn.disabled = false;
    }
  };

  // FIX 4.1: Helper function to handle vCard creation
  const handleCreateVcardClick = async () => {
      const currentId = clientId; // Use the global clientId if present
      if (!currentId) {
          return showToast('Please save client data first.', true);
      }
      
      createVcardBtn.disabled = true;
      createVcardBtn.textContent = 'Generating...';

      try {
          // Call the correct new backend route POST /api/clients/:id/vcard
          const response = await fetch(`${API_URL}/clients/${currentId}/vcard`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
          });

          const result = await response.json();

          if (!response.ok) {
              throw new Error(result.message || 'vCard generation failed.');
          }

          showToast(`vCard created, status set to Active, and email sent to client!`, false);
          
      } catch (error) {
          console.error('vCard generation error:', error);
          showToast(`Generation Failed: ${error.message}`, true);
      } finally {
          createVcardBtn.disabled = false;
          createVcardBtn.textContent = 'Generate vCard';
      }
  };

  // ------------------------
  // Initialization & Event Listeners
  // ------------------------

  document.addEventListener('DOMContentLoaded', () => {
    if (clientId) {
      fetchClientData(clientId);
    }
  });

  photoUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      // Instant preview
      const reader = new FileReader();
      reader.onload = (event) => {
        photoPreview.src = event.target.result;
        photoPreviewContainer.style.display = 'block';
      };
      reader.readAsDataURL(file);

      // Start upload
      uploadPhoto(file);
    }
  });

  form.addEventListener('submit', handleFormSubmission);
  viewPdfBtn.addEventListener('click', handleViewPdfClick);
  createVcardBtn.addEventListener('click', handleCreateVcardClick);

})();