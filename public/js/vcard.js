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
 function setHidden(el, hidden) {
  if (!el) return;

  if (hidden) {
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("inert", "");
  } else {
    el.style.display = "flex";
    el.setAttribute("aria-hidden", "false");
    el.removeAttribute("inert");
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



 // --- RENDERING FUNCTIONS ---

/**
 * Populates BOTH popup1 and popup2 using the API client payload.
 * This was previously removed by regex edits, which is why you now see:
 * "populateVCard is not defined"
 */
function populateVCard(client) {
  if (!client) return;

  // Hide any loading/error banner
  const msg = el("messageArea");
  if (msg) setHidden(msg, true);

  // PHOTO + MAIN HEADER
  renderPhoto(client.photoUrl);

  if (fullName) fullName.textContent = client.fullName || "";
  if (jobName) jobName.textContent = client.company || "";
  if (titlePosition) titlePosition.textContent = client.title || "";

  // MAIN CONTACTS
  if (phoneMain) {
    phoneMain.textContent = client.phone1 || "Not Provided";
    phoneMain.href = client.phone1 ? `tel:${client.phone1}` : "#";
  }

  if (emailMain) {
    emailMain.textContent = client.email1 || "Not Provided";
    emailMain.href = client.email1 ? `mailto:${client.email1}` : "#";
  }

  // DROPDOWN LISTS
  buildList(phoneList, [client.phone2, client.phone3].filter(Boolean), "phone");
  buildList(emailList, [client.email2, client.email3].filter(Boolean), "email");

  // POPUP2 FIELDS
  if (bioText) bioText.textContent = client.bio || "No bio provided.";
  renderHours(client.workingHours);

  // BUTTON WIRING
  setupPopup1Actions(client);
  setupPopup2Buttons(client);

  // START STATE: popup1 visible, popup2 hidden
  setHidden(popup1, false);
  setHidden(popup2, true);
}
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
 async function fetchProfileData() {
  try {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");

    if (!slug) {
      console.error("No slug provided in URL");
      return null;
    }

    const res = await fetch(`${API_BASE}/api/vcard/${slug}`);
    if (!res.ok) throw new Error("Failed to fetch vCard");

    return await res.json();
  } catch (err) {
    console.error("vCard fetch error:", err);
    return null;
  }
}

async function init() {
  const client = await fetchProfileData();
  if (client) populateVCard(client);
}

document.addEventListener('DOMContentLoaded', init);

})();











