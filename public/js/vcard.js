// public/js/vcard.js - VCard Data Fetch and Logic
(function () {
 'use strict';

 // CRITICAL FIX: Use the explicit API root or window.location.origin for consistency
 // Using window.location.origin is generally best practice for connected frontends/backends
 const API_ROOT = "https://smartcardlink-api.onrender.com"; 
 const el = id => document.getElementById(id);

 // DOM References
 const vcardContainer = el('vcard'); // Assuming the main wrapper has this ID for full control
 const popup1 = el('popup1');
 const popup2 = el('popup2');
 const photoArea = el('photoArea');

 // Text Fields
 const fullName = el('fullName');
 const jobName = el('jobName');
 const titlePosition = el('titlePosition');
 const phoneMain = el('phoneMain');
 const emailMain = el('emailMain');

 // Lists
 const phoneList = el('phoneList');
 const emailList = el('emailList');
 const phoneDropdownBtn = el('phoneDropdownBtn');
 const emailDropdownBtn = el('emailDropdownBtn');

 // Action Buttons (Popup1)
 const actions = {
  call: el('callBtn'),
  sms: el('smsBtn'),
  wa: el('waBtn'),
  mail: el('mailBtn'),
  print: el('printBtn'),
  save: el('saveBtn')
 };

 // Popup2 Action Buttons
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
  youtube: el('youtubeBtn')
 };

 // Popup2 Fields
 const bioText = el('bioText');
 const liveTime = el('liveTime');
 const hoursTable = document.querySelector('#hoursTable tbody');

 // --- UTILITY FUNCTIONS ---
 function setHidden(node, hidden) {
  if (!node) return;

  if (hidden) {
    node.style.display = "none";
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("hidden", "");
  } else {
    node.style.display = "block";
    node.setAttribute("aria-hidden", "false");
    node.removeAttribute("hidden");
  }
}

 function alertMsg(msg) {
  if (typeof Swal !== 'undefined') {
   Swal.fire({ title: msg, icon: 'info', confirmButtonColor: '#FFD700' });
  } else {
   alert(msg);
  }
 }
 
 /**
  * Manages global messages (loading, success, error) at the top of the VCard.
  */
 function showMessage(msg, isError = false) {
  if (!vcardContainer) return;

  // Hide main content popups
  setHidden(popup1, true);
  setHidden(popup2, true);

  let msgEl = el('messageArea'); 
  if (!msgEl) {
    msgEl = document.createElement('div');
    msgEl.id = 'messageArea';
    msgEl.style.cssText = 'text-align: center; padding: 20px;';
    vcardContainer.prepend(msgEl);
  }
  msgEl.style.color = isError ? '#ef4444' : '#FFD700';
  msgEl.innerHTML = `<h3 style="margin: 0; padding: 0;">${msg}</h3>`;
  setHidden(msgEl, false);
 }

 /**
 * Checks if a URL is non-empty and starts with http(s).
 * @param {string} url 
 * @returns {boolean}
 */
 function isValidUrl(url) {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return false;
  }
  const lowerUrl = url.toLowerCase();
  return lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://');
 }
 
 /**
 * Handles opening a social media link with validation and logging.
 * @param {string} url 
 * @param {string} platform 
 */
 function openSocialLink(url, platform) {
   if (isValidUrl(url)) {
     window.open(url, '_blank');
   } else {
     alertMsg(`${platform} URL Not Provided or Invalid`);
   }
 }

function releaseFocus(container) {
  if (!container) return;
  const active = document.activeElement;
  if (container.contains(active)) active.blur();
}

// --- DATA FETCHING ---
async function fetchProfileData() {
  try {
    // FINAL FIX: Extract slug from Query Parameters (?slug=name) instead of Pathname
    const urlParams = new URLSearchParams(window.location.search);
    const clientSlug = urlParams.get('slug');
    
    if (!clientSlug) {
        console.error("Missing vCard slug in URL parameters.");
        throw new Error('VCard not found. Missing slug identifier.');
    }
   // Display loading state
   showMessage(`
    <span class="loading-spinner" style="
      border: 3px solid #f3f3f3; border-top: 3px solid #FFD700; 
      border-radius: 50%; width: 16px; height: 16px; 
      animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; 
      margin-right: 5px;"></span>
    Loading VCard...
   `);
   
   // CRITICAL FIX: Use the specific API slug endpoint
   const res = await fetch(`${API_ROOT.replace(/\/$/, "")}/api/vcard/${clientSlug}`); 
   
   if (!res.ok) {
     throw new Error('Network error or server unavailable.');
   }
   
   const json = await res.json();
   
   if (json.status !== 'success' || !json.data) {
     // Use the message from the API if provided
     const msg = json.message || 'Card not found or currently inactive.';
     throw new Error(msg); 
   }
   
   // Hide message area on success
   setHidden(el('messageArea'), true); 

   return json.data || null; 
   
  } catch (err) {
   console.error("Error fetching profile data:", err);
   showMessage(err.message || 'Failed to load profile data.', true);
   return null;
  }
 }

 // --- RENDERING FUNCTIONS ---

 function renderPhoto(url) {
  if (!photoArea) return;
  photoArea.innerHTML = '';
  const defaultPhoto = '/public/images/default-photo.png';
  
  if (url) {
   const img = document.createElement('img');
   img.src = url; 
   img.alt = "Profile Photo";
   // Fallback to a default image on error
   img.onerror = () => { img.src = defaultPhoto; }; 
   photoArea.appendChild(img);
  } else {
   photoArea.innerHTML = `<img src="${defaultPhoto}" alt="Default Profile Photo">`;
  }
 }

 function buildList(container, items, type) {
  if (!container) return;
  container.innerHTML = '';
  
  const validItems = (items || []).filter(i => i && i.trim()); 
  if (validItems.length === 0) {
   const div = document.createElement('div');
   div.className = 'list-item disabled';
   div.textContent = 'No additional contacts';
   container.appendChild(div);
   return;
  }

  validItems.forEach(val => {
   const div = document.createElement('div');
   div.className = 'list-item';
   div.textContent = val;
   div.onclick = () => {
    if (type === 'phone') window.location.href = `tel:${val.replace(/\s+/g,'')}`;
    if (type === 'email') window.location.href = `mailto:${val}`;
   };
   container.appendChild(div);
  });
 }

 function renderHours(hours) {
  if (!hoursTable) return;
  hoursTable.innerHTML = '';
  
  // Determine if the whole table should be hidden
  const hasHours = hours && Object.values(hours).some(h => h && h.trim());
  const hoursSection = el('hoursSection'); // Assuming there is a wrapper for the table
  if (!hasHours) {
   if (hoursSection) setHidden(hoursSection, true);
   return;
  }
  if (hoursSection) setHidden(hoursSection, false);

  const days = [
   { label: 'MonFri', start: hours.monFriStart, end: hours.monFriEnd },
   { label: 'Sat', start: hours.satStart, end: hours.satEnd },
   { label: 'Sun', start: hours.sunStart, end: hours.sunEnd }
  ];

  days.forEach(d => {
   const tr = document.createElement('tr');
   // Display '-' if data is missing for start or end time
   tr.innerHTML = `<td>${d.label}</td><td>${d.start || '-'}</td><td>${d.end || '-'}</td>`;
   hoursTable.appendChild(tr);
  });
 }

 // --- ACTION SETUP ---

 function setupPopup1Actions(client) {
  const phone = client.phone1;
  const email = client.email1;
  const vcfDownloadUrl = client.vcardUrl; 

  // Helper to disable/enable buttons based on data availability
  const setAction = (btn, callback, condition) => {
   if (!btn) return;
   if (condition) {
    btn.onclick = callback;
    btn.classList.remove('disabled');
   } else {
    btn.onclick = () => alertMsg(btn.textContent + " is not provided");
    btn.classList.add('disabled');
   }
  };

  setAction(actions.call, () => window.location.href = `tel:${phone}`, phone);
  setAction(actions.sms, () => window.location.href = `sms:${phone}`, phone);
  setAction(actions.mail, () => window.location.href = `mailto:${email}`, email);

  setAction(actions.wa, () => {
   const digits = phone.replace(/\D/g, '');
   window.open(`https://wa.me/${digits}`, '_blank');
  }, phone);

  setAction(actions.save, () => window.location.href = vcfDownloadUrl, vcfDownloadUrl);

  // Print button is always active
  if(actions.print) actions.print.onclick = () => window.print();
 }

 function setupPopup2Buttons(client) {
  const socialLinks = client.socialLinks || {};

  // Helper for non-social URLs
  const openOrAlert = (btn, url, fallback='URL Not Provided') => {
   if (!btn) return;
   if (url && url.trim()) {
    btn.onclick = () => window.open(url, '_blank');
    btn.classList.remove('disabled');
   } else {
    btn.onclick = () => alertMsg(fallback);
    btn.classList.add('disabled');
   }
  };
  
  // Helper for social links
  const setSocialAction = (btn, platformKey, platformName) => {
   if (!btn) return;
   const url = socialLinks[platformKey];
   if (url && url.trim()) {
    btn.onclick = () => openSocialLink(url, platformName);
    btn.classList.remove('disabled');
   } else {
    btn.onclick = () => alertMsg(`${platformName} Not Provided`);
    btn.classList.add('disabled');
   }
  };

  // Website Links
  openOrAlert(buttons.business, client.businessWebsite || client.website, 'Business Website Not Provided'); 
  openOrAlert(buttons.portfolio, client.portfolioWebsite, 'Portfolio Website Not Provided');
  openOrAlert(buttons.location, client.locationMap, 'Location Map Not Provided');
  
  // Physical Address (is just information, so alert text content)
  if(buttons.physical) {
   const address = client.address;
   if(address) {
    buttons.physical.onclick = () => alertMsg(address);
    buttons.physical.classList.remove('disabled');
   } else {
    buttons.physical.onclick = () => alertMsg('Physical Address Not Provided');
    buttons.physical.classList.add('disabled');
   }
  }

  // Social Media Buttons
  setSocialAction(buttons.facebook, 'facebook', 'Facebook');
  setSocialAction(buttons.instagram, 'instagram', 'Instagram');
  setSocialAction(buttons.x, 'twitter', 'X (Twitter)'); // Maps 'xBtn' to 'twitter' schema field
  setSocialAction(buttons.linkedin, 'linkedin', 'LinkedIn');
  setSocialAction(buttons.tiktok, 'tiktok', 'TikTok');
  setSocialAction(buttons.youtube, 'youtube', 'YouTube');

  // Book Appointment Logic (Assumes presence of an appointment link)
  if (buttons.book) {
   openOrAlert(buttons.book, client.appointmentLink, 'Appointment Link Not Provided');
  }
 }

 // --- INITIALIZATION ---
 async function init() {
  const client = await fetchProfileData();

  if (client) {
   // Populate Popup 1 Data
   renderPhoto(client.photoUrl);
   fullName.textContent = client.fullName || '';
   jobName.textContent = client.company || '';
   titlePosition.textContent = client.title || '';
   
   phoneMain.textContent = client.phone1 || 'Not Provided';
   phoneMain.href = client.phone1 ? `tel:${client.phone1}` : '#';
   
   emailMain.textContent = client.email1 || 'Not Provided';
   emailMain.href = client.email1 ? `mailto:${client.email1}` : '#';

   // Additional Contacts
   // Filter out falsy values like null/undefined/empty string from phone2/3, email2/3
   buildList(phoneList, [client.phone2, client.phone3].filter(Boolean), 'phone');
   buildList(emailList, [client.email2, client.email3].filter(Boolean), 'email');

   // Populate Popup 2 Data
   bioText.textContent = client.bio || 'No bio provided.';
   renderHours(client.workingHours);
   
   // Setup all buttons
   setupPopup1Actions(client);
   setupPopup2Buttons(client);

   // Show the main VCard popup
   setHidden(popup1, false);
   setHidden(popup2, true);
  }

  // Dropdown Toggles (Kept intact)
  [ [phoneDropdownBtn, phoneList], [emailDropdownBtn, emailList] ].forEach(([btn, list]) => {
   if(!btn || !list) return;
   setHidden(list, true);
   btn.onclick = () => {
    const isHidden = list.style.display === 'none';
    setHidden(list, !isHidden);
    const icon = btn.querySelector('i');
    if (icon) icon.className = isHidden ? 'fa fa-chevron-up' : 'fa fa-chevron-down';
   };
  });

  // Popup Navigation & Sizing Logic (Kept intact)
  if (buttons.moreInfo && popup1 && popup2) {
   buttons.moreInfo.onclick = () => {
  // FORCE popup toggle – override index.html interference
  popup1.hidden = true;
  popup2.hidden = false;

  popup1.style.display = "none";
  popup2.style.display = "block";

  popup2.scrollTop = 0;
};
  }
  
  if (buttons.back) {
   buttons.back.onclick = () => {
  releaseFocus(popup2);

  setHidden(popup2, true);
  setHidden(popup1, false);

  if (buttons.moreInfo) buttons.moreInfo.focus();
};
  }

  // Live Time Update (Kept intact)
  if (liveTime) {
   setInterval(() => {
    const options = { 
     day: 'numeric', month: 'short', year: 'numeric', 
     hour: '2-digit', minute: '2-digit', second: '2-digit', 
     hour12: false, timeZone: 'Africa/Nairobi' 
    };
    const dateStr = new Date().toLocaleString('en-GB', options);
    liveTime.textContent = dateStr.replace(',', ' ');
   }, 1000);
  }
 }

 document.addEventListener('DOMContentLoaded', init);

})();







