(function () {
    'use strict';


    // Set global API base URL for stable API calls
    // Note: Using a fixed API base is more reliable than deriving from window.location.origin
    const API_BASE = "https://smartcardlink-api.onrender.com"; 
    const API_URL = `${API_BASE}/api`; 


    const params = new URLSearchParams(window.location.search);
    const urlClientId = params.get('id'); // Renamed to clearly indicate source


    // ------------------------
    // DOM Elements
    // ------------------------
    const form = document.getElementById('adminForm');
    const clientIdInput = document.getElementById('clientId'); // Hidden field
    const viewPdfBtn = document.getElementById('view-pdf-btn');
    const createVcardBtn = document.getElementById('create-vcard-btn');
    const photoUploadInput = document.getElementById('photoFile');
    const photoUrlInput = document.getElementById('photoUrl');
    const photoUploadLabel = document.getElementById('photo-upload-label');
    const photoPreviewContainer = document.getElementById('photo-preview-container');
    const photoPreview = document.getElementById('photo-preview');
    const saveBtn = document.getElementById('save-btn');
    const toastMessage = document.getElementById('toast-message');
    // ADDED: Missing DOM references for robust UI/UX
    const vcardStatusMessage = document.getElementById('vcard-status-message');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const qrCodeImage = document.getElementById('qr-code-image');
    const qrCodeLink = document.getElementById('qr-code-link');


    let isSaving = false;
    
    // ADDED: State variables for cancellation logic (PDF)
    let pdfAbortController = null;
    let isPdfGenerating = false;
    // ADDED: State variable for vCard creation URL
    let lastVcardUrl = null;



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
      */
    const normalizeSocialLink = (platform, input) => {
      if (!input || typeof input !== 'string' || input.trim() === '') return null;


      let value = input.trim();
      const prefix = SOCIAL_PREFIXES[platform];
      if (!prefix) return null;


      // 1. Check if already a correct URL (enforce https)
      if (value.startsWith('http')) {
          value = value.replace('http:', 'https:');
          return value; 
      }


      // 2. Clean common prefixes and handles
      value = value.replace(/^(www\.)?/, '');
      
      if (platform === 'linkedin') {
          value = value.replace(/^linkedin\.com\/(in\/|pub\/)?/i, '');
      } else if (platform === 'tiktok') {
          value = value.replace(/^tiktok\.com\/@/i, '');
          value = value.replace(/^@/, '');
      } else if (platform === 'instagram' || platform === 'twitter' || platform === 'facebook') {
          value = value.replace(/^(instagram|twitter|facebook)\.com\//i, '');
          // Fix: Use toLowerCase() correctly
          value = value.toLowerCase().replace(/^@/, ''); 
      } else if (platform === 'youtube') {
          value = value.replace(/^youtube\.com\//i, '');
      }


      // 3. Remove trailing slashes
      value = value.replace(/\/$/, '');
      
      if (value === '') return null;


      // 4. Reconstruct the final, correct URL
      if (platform === 'linkedin') return prefix + value;
      if (platform === 'tiktok' && !value.startsWith('@')) return prefix + value;


      return prefix + value;
    };


    /**
      * Validates if a string is a valid email format.
      */
    const isValidEmail = (email) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email.trim());
    };


    /**
      * Validates if a string is a valid phone number (no letters, >= 10 digits).
      */
    const isValidPhone = (phone) => {
      if (!phone || phone.trim() === '') return true; 
      if (/[a-zA-Z]/.test(phone)) return false; 
      const cleaned = phone.replace(/\D/g, ''); 
      return cleaned.length >= 10;
    };
    
    /**
      * Displays a toast message to the user.
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
     * ADDED: Resets the state of a download button element.
     * @param {HTMLElement} button - The button element to reset.
     * @param {string} defaultText - The default text for the button.
     */
    const resetDownloadButton = (button, defaultText) => {
      if (button) {
        button.innerHTML = defaultText;
        button.classList.remove('pressed');
        // Re-enable only if a client ID exists
        button.disabled = !clientIdInput.value; 
      }
    };
    
    /**
      * ADDED: Helper to update vCard/QR code display area
      */
    const updateQrCodeDisplay = (qrCodeUrl, vcardUrl) => {
      if (qrCodeUrl && vcardUrl) {
        qrCodeImage.src = qrCodeUrl;
        qrCodeLink.href = vcardUrl;
        qrCodeLink.textContent = vcardUrl; // Display the full URL for clarity
        qrCodeContainer.style.display = 'block';
        vcardStatusMessage.textContent = 'vCard and QR Code successfully generated.';
        vcardStatusMessage.style.color = '#22c55e'; // Green success message
      } else {
        qrCodeImage.src = '';
        qrCodeLink.href = '#';
        qrCodeLink.textContent = '';
        qrCodeContainer.style.display = 'none';
        vcardStatusMessage.textContent = 'vCard and QR Code not yet created.';
        vcardStatusMessage.style.color = '#f97316'; // Orange warning message
      }
    };



    /**
      * Populates form fields from a client data object fetched from the backend.
      */
    const populateForm = (data) => {
      // Set hidden ID
      clientIdInput.value = data._id || '';


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
      setValue('companyName', data.company); // Mapped from 'company'
      setValue('businessWebsite', data.businessWebsite);
      setValue('portfolioWebsite', data.portfolioWebsite);
      setValue('locationMapUrl', data.locationMap); // Mapped from 'locationMap'


      // Photo URL
      if (data.photoUrl) {
        photoUrlInput.value = data.photoUrl;
        photoPreview.src = data.photoUrl;
        photoPreviewContainer.style.display = 'block';
        photoUploadLabel.textContent = 'Photo Uploaded';
        photoUploadLabel.style.backgroundColor = '#22c55e';
      } else {
        photoUploadLabel.textContent = 'Photo Upload';
        photoUploadLabel.style.backgroundColor = '#ef4444';
        photoPreviewContainer.style.display = 'none';
      }


      // Working Hours
      if (data.workingHours) {
        ['monFriStart', 'monFriEnd', 'satStart', 'satEnd', 'sunStart', 'sunEnd'].forEach(day => {
          setValue(day, data.workingHours[day]);
        });
      }


      // Social Links (Need to show the normalized URL in the input fields)
      if (data.socialLinks) {
        ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube'].forEach(platform => {
          setValue(platform, data.socialLinks[platform]);
        });
      }


      // Bio & Address
      setValue('bio', data.bio);
      setValue('address', data.address);
      
      // UPDATED: Save the last VCard URL and update UI if it exists
      lastVcardUrl = data.vcardUrl || null;
      if (lastVcardUrl) {
        updateVcardButton(lastVcardUrl);
        updateQrCodeDisplay(data.qrCodeUrl, lastVcardUrl);
      } else {
        resetVcardButton();
        updateQrCodeDisplay(null, null);
      }
    };


    // ------------------------
    // Core Application Logic
    // ------------------------


    const fetchClientData = async (id) => {
      try {
        const response = await fetch(`${API_URL}/clients/${id}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to fetch client data for ID: ${id}`);
        }
        const json = await response.json();
        // Ensure consistent data retrieval from response
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


        const json = await response.json();


        if (!response.ok || json.status !== 'success') {
          throw new Error(json.message || 'Photo upload failed on the server.');
        }


        // Correctly retrieve photoUrl from response structure
        const photoUrl = json.data?.photoUrl || json.photoUrl;
        
        if (!photoUrl) {
          throw new Error("Server returned success but no public photo URL.");
        }
        
        photoUrlInput.value = photoUrl;
        photoUploadLabel.textContent = 'Photo Uploaded';
        photoUploadLabel.style.backgroundColor = '#22c55e';
        photoPreview.src = photoUrl; // Update preview to confirm the FINAL public URL
        photoPreviewContainer.style.display = 'block';
        showToast('Photo uploaded successfully!');
        return photoUrl;
      } catch (error) {
        console.error('Photo upload error:', error);
        showToast(`Photo upload failed: ${error.message}`, true);
        photoUploadLabel.textContent = 'Upload Failed';
        photoUploadLabel.style.backgroundColor = '#ef4444';
        return null;
      }
    };


    const handleFormSubmission = async (e) => {
      e.preventDefault();
      // Get the client ID from the hidden input field
      const currentId = clientIdInput.value; 


      if (isSaving) return;
      isSaving = true;
      saveBtn.innerHTML = 'Saving... <span class="spinner"></span>';
      saveBtn.disabled = true;
      
      // UPDATED: Reset vCard button/display on save as the vCard data might change
      lastVcardUrl = null;
      resetVcardButton();
      updateQrCodeDisplay(null, null);


      const formData = new FormData(form);
      const payload = {};
      const socialLinks = {}; // Will hold normalized links
      const workingHours = {};
      const workingHoursKeys = ['monFriStart', 'monFriEnd', 'satStart', 'satEnd', 'sunStart', 'sunEnd'];
      const socialLinksKeys = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube'];
      
      for (const [key, value] of formData.entries()) {
        // Exclude file input and the hidden clientId field, and empty strings
        if (key !== 'photoFile' && key !== 'clientId' && value !== '') { 
          payload[key] = value.trim();
        }
      }
      
      try {
        // --- Validation of Phone and Email ---
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


        // 1. Data Normalization for Backend Schema
        
        // Map companyName field to the expected 'company' schema field
        if (payload.companyName) {
          payload.company = payload.companyName;
          delete payload.companyName;
        }
        
        // Map locationMapUrl field to the expected 'locationMap' schema field
        if (payload.locationMapUrl) {
          payload.locationMap = payload.locationMapUrl;
          delete payload.locationMapUrl;
        }
        
        // Populate nested workingHours
        for (const key of workingHoursKeys) {
          // Treat empty string or default time as null/undefined
          if (payload[key] && payload[key] !== '00:00') {
            workingHours[key] = payload[key];
          }
          delete payload[key]; 
        }
        
        // Populate nested socialLinks with normalization
        for (const key of socialLinksKeys) {
          const normalizedUrl = normalizeSocialLink(key, payload[key]);
          if (normalizedUrl) {
            socialLinks[key] = normalizedUrl;
          }
          // Always delete the flat key from the main payload
          delete payload[key]; 
        }


        if (Object.keys(workingHours).length > 0) payload.workingHours = workingHours;
        if (Object.keys(socialLinks).length > 0) payload.socialLinks = socialLinks;


        // 2. API Call (PUT/POST)
        const url = currentId ? `${API_URL}/clients/${currentId}` : `${API_URL}/clients`;
        const method = currentId ? 'PUT' : 'POST';


        const response = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        const json = await response.json();


        // Check for both response.ok and status: 'success'
        if (!response.ok || json.status !== 'success') {
          throw new Error(json.message || 'Failed to save client info.');
        }
        
        showToast('Client info saved successfully!');
        
        // If creating a new client (POST), get the new ID and update the URL/UI
        const newId = json.data?._id || json._id;
        if (!currentId && newId) {
          clientIdInput.value = newId;
          window.history.pushState(null, '', `admin-form.html?id=${newId}`);
          // Enable buttons
          viewPdfBtn.disabled = false;
          createVcardBtn.disabled = false;
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


    // --- TASK 1: FIX THE "VIEW CLIENT INFO PDF" BUTTON ---
    
    const handleViewPdfClick = () => {
      // Using the generic file request handler for robust PDF generation/cancellation
      handleFileRequest(`/clients/${clientIdInput.value}/pdf`, 'PDF', viewPdfBtn);
    };
    
    /**
      * ADDED/REPLACED: Handles the process of fetching a file (like PDF) from the backend and opening/downloading it.
      * Includes cancellation logic for PDF.
      * @param {string} endpoint - The API endpoint to hit (e.g., `/clients/:id/pdf`).
      * @param {string} fileType - The type of file (e.g., 'PDF').
      * @param {HTMLElement} button - The button element being clicked.
      */
    const handleFileRequest = async (endpoint, fileType, button) => {
      const currentId = clientIdInput.value;
      const defaultText = `View Client Info ${fileType}`; // Dynamic default text (PDF only)
      
      if (!currentId) {
        // TASK 1A: If missing ID, show specific toast
        return showToast(`No PDF available. Save client info first.`, true);
      }


      // TASK 1B: Check for cancellation/in-progress state
      if (fileType === 'PDF' && isPdfGenerating) {
        pdfAbortController.abort();
        showToast(`${fileType} generation cancelled.`, false);
        resetDownloadButton(button, defaultText); // Reset state
        isPdfGenerating = false;
        return;
      }
      
      // TASK 1C: Set button to loading state immediately
      button.innerHTML = `Generating... <span class="spinner"></span>`;
      button.classList.add('pressed');
      button.disabled = true;


      // Create controller for cancellation (PDF)
      let signal = null;
      if (fileType === 'PDF') {
        pdfAbortController = new AbortController();
        signal = pdfAbortController.signal;
        isPdfGenerating = true;
      }


      try {
        const response = await fetch(`${API_URL}${endpoint}`, {
          method: 'POST',
          signal: signal,
        });
        
        if (signal && signal.aborted) return; // Exit if aborted


        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to retrieve ${fileType}.`);
        }
        
        const json = await response.json();
        // TASK 1A: Correctly read pdfUrl from either json.data.pdfUrl or json.pdfUrl
        const pdfUrl = json.data?.pdfUrl || json.pdfUrl;


        if (pdfUrl) {
          // TASK 1A: Open it in a new tab.
          window.open(pdfUrl, '_blank');
          showToast(`${fileType} opened successfully!`);
        } else {
          // TASK 1A: If missing or null, show toast.
          showToast(`No PDF available. Save client info first.`, true);
          throw new Error('PDF URL not returned by server.');
        }
        
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log(`${fileType} generation aborted by user.`);
          return; // Do not run finally block if aborted
        }
        if (!error.message.includes("No PDF available")) {
          console.error(`${fileType} retrieval error:`, error);
          showToast(`PDF retrieval failed: ${error.message}`, true);
        }
      } finally {
        // TASK 1C: Must immediately reset after opening the PDF or upon error.
        if (fileType === 'PDF') isPdfGenerating = false;
        resetDownloadButton(button, defaultText);
      }
    };
    
    // --- TASK 2: FIX & ENHANCE THE “CREATE VCARD” BUTTON ---


    // Helper to update vCard button to the success state (TASK 2A)
    const updateVcardButton = (url) => {
      lastVcardUrl = url;
      
      // Use the hostname for display to keep it short, as requested in prompt.
      let urlPath = url;
      try {
        const urlObj = new URL(url);
        urlPath = urlObj.hostname;
      } catch(e) { /* use full URL if parsing fails */ }
      
      // A. Replace the button label with: “vCard Created — <vcardUrl> | Copy URL | ↻”
      // Note: innerHTML removal/replacement is necessary for dynamic children listeners.
      createVcardBtn.innerHTML = `
        vCard Created — ${urlPath}
        <span id="copy-vcard-url" style="color: #FFD700; cursor: pointer; margin-left: 5px;">| Copy URL</span>
        <span id="refresh-vcard-url" style="cursor: pointer; margin-left: 5px;">| ↻</span>
      `;
      createVcardBtn.classList.remove('pressed');
      createVcardBtn.disabled = false;


      // Event listeners MUST be re-added as innerHTML replaced existing elements
      const copyBtn = document.getElementById('copy-vcard-url');
      const refreshBtn = document.getElementById('refresh-vcard-url');
      
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent the main button logic
          navigator.clipboard.writeText(lastVcardUrl || url).then(() => {
            showToast('vCard URL copied to clipboard!');
          }).catch(err => {
            console.error('Copy failed:', err);
            showToast('Failed to copy URL.', true);
          });
        });
      }
      
      if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent the main button logic
          // A. The refresh icon (↻) must reopen the vcardUrl in a new tab.
          if (lastVcardUrl) {
            window.open(lastVcardUrl, '_blank');
            showToast('vCard link reopened.', false);
          }
        });
      }
    };


    // Helper to restore the default vCard button state (TASK 2C)
    const resetVcardButton = () => {
      // Reset the main button's inner HTML to default text
      createVcardBtn.innerHTML = 'Create vCard'; // Restore label
      createVcardBtn.classList.remove('pressed');
      createVcardBtn.disabled = !clientIdInput.value; // Restore state
      lastVcardUrl = null;
    };


    const handleCreateVcardClick = async () => {
      const currentId = clientIdInput.value;
      if (!currentId) return showToast('Please save client info first.', true);


      // Ensure button state is for "Creating"
      createVcardBtn.classList.add('pressed');
      createVcardBtn.innerHTML = 'Creating... <span class="spinner"></span>';
      createVcardBtn.disabled = true;


      try {
        // NOTE: This endpoint remains the same, ensuring email sending logic is kept intact (TASK 2B).
        const response = await fetch(`${API_URL}/clients/${currentId}/vcard`, {
          method: 'POST',
        });


        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create vCard.');
        }


        const json = await response.json();
        
        // Check both nested and top-level response structures
        const data = json.data || json;
        const vcardUrl = data.vcardUrl;
        const qrCodeUrl = data.qrCodeUrl;
        
        // TASK 2D: If backend returns no vcardUrl: Show toast
        if (!vcardUrl) {
          showToast(`vCard creation failed: Missing URL from server.`, true);
          throw new Error("Missing URL from server."); 
        }
        
        // TASK 2A: Update button UI for success (includes saving lastVcardUrl)
        updateVcardButton(vcardUrl);
        updateQrCodeDisplay(qrCodeUrl, vcardUrl);
        showToast('vCard and QR code created successfully! Email sent.', false);
        
        // TASK 2B: Open vcardUrl in a new tab.
        window.open(vcardUrl, '_blank');
        
        // TASK 2B: Open a clean page displaying ONLY the QR code 
        const qrCodeWindow = window.open('', '_blank');
        qrCodeWindow.document.write(`
          <html><head><title>QR Code</title>
          <style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f0f0f0;}</style>
          </head><body>
            <img src="${qrCodeUrl}" alt="QR Code" style="max-width:90%;max-height:90vh;">
          </body></html>
        `);
        qrCodeWindow.document.close();
        
      } catch (error) {
        // Only show general error if not already handled by a specific toast (like missing URL)
        if (!error.message.includes("Missing URL")) {
          console.error('vCard creation error:', error);
          showToast(`vCard creation failed: ${error.message}`, true);
        }
        
        // TASK 2C: Restore button state cleanly if there is an error.
        resetVcardButton();
      } 
    };
    


    // ------------------------
    // Initialization & Event Listeners
    // ------------------------


    document.addEventListener('DOMContentLoaded', () => {
      if (urlClientId) {
        // Set initial ID from URL parameter and fetch data
        clientIdInput.value = urlClientId;
        fetchClientData(urlClientId);
        // Enable buttons (they will be disabled if fetch fails or data is new)
        viewPdfBtn.disabled = false;
        createVcardBtn.disabled = false;
      } else {
        // Disable buttons for new clients until saved
        viewPdfBtn.disabled = true;
        createVcardBtn.disabled = true;
      }
    });


    photoUploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        // Instant local preview (uses FileReader)
        const reader = new FileReader();
        reader.onload = (event) => {
          photoPreview.src = event.target.result;
          photoPreviewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);


        // Start network upload
        uploadPhoto(file);
      }
    });


    form.addEventListener('submit', handleFormSubmission);
    // Bind the initial event listeners
    viewPdfBtn.addEventListener('click', handleViewPdfClick);
    createVcardBtn.addEventListener('click', handleCreateVcardClick);


  })();