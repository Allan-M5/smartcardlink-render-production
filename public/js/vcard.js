// public/js/vcard.js - POPUP SIZE FIX & DYNAMIC HOURS
(function () {
  'use strict';

  const el = id => document.getElementById(id);

  // DOM References
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

  // UTILS
  function setHidden(node, hidden) {
    if (!node) return;
    if (hidden) {
      node.setAttribute('hidden', '');
      node.setAttribute('aria-hidden', 'true');
    } else {
      node.removeAttribute('hidden');
      node.setAttribute('aria-hidden', 'false');
    }
  }

  function alertMsg(msg) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({ title: msg, icon: 'info', confirmButtonColor: '#FFD700' });
    } else {
      alert(msg);
    }
  }

  async function fetchProfileData() {
    try {
      const res = await fetch('/api/clients/all');
      if (!res.ok) throw new Error('API Error');
      const json = await res.json();
      return (json.data && json.data.length > 0) ? json.data[0] : null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  function renderPhoto(url) {
    photoArea.innerHTML = '';
    if (url) {
      const img = document.createElement('img');
      img.src = url; // Treated verbatim as Cloudinary public URL
      img.alt = "Profile";
      img.onerror = () => { photoArea.innerHTML = '<div class="not-provided">Photo not provided</div>'; };
      photoArea.appendChild(img);
    } else {
      photoArea.innerHTML = '<div class="not-provided">Photo not provided</div>';
    }
  }

  function buildList(container, items, type) {
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
        if (!div.classList.contains('disabled')) {
          if (type === 'phone') window.location.href = `tel:${val.replace(/\s+/g,'')}`;
          if (type === 'email') window.location.href = `mailto:${val}`;
        }
      };
      container.appendChild(div);
    });
  }

  function renderHours(hours) {
    if (!hoursTable) return;
    hoursTable.innerHTML = '';
    
    if (!hours || Object.keys(hours).length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3">Hours not provided</td>`;
      hoursTable.appendChild(tr);
      return;
    }

    const days = [
      { label: 'Mon–Fri', start: hours.monFriStart, end: hours.monFriEnd },
      { label: 'Sat', start: hours.satStart, end: hours.satEnd },
      { label: 'Sun', start: hours.sunStart, end: hours.sunEnd }
    ];

    days.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${d.label}</td><td>${d.start || '-'}</td><td>${d.end || '-'}</td>`;
      hoursTable.appendChild(tr);
    });
  }

  function setupPopup1Actions(client) {
    const phone = client.phone1;
    const email = client.email1;

    actions.call.onclick = () => {
      if(phone) window.location.href = `tel:${phone}`;
      else alertMsg("Phone Not Provided");
    };
    
    actions.sms.onclick = () => {
      if(phone) window.location.href = `sms:${phone}`;
      else alertMsg("Phone Not Provided");
    };

    actions.wa.onclick = () => {
      if(phone) {
        const digits = phone.replace(/\D/g, '');
        window.open(`https://wa.me/${digits}`, '_blank');
      } else {
        alertMsg("Phone Not Provided");
      }
    };

    actions.mail.onclick = () => {
      if(email) window.location.href = `mailto:${email}`;
      else alertMsg("Email Not Provided");
    };

    actions.print.onclick = () => window.print();

    actions.save.onclick = () => {
      if(client.vcfDownloadUrl) window.location.href = client.vcfDownloadUrl;
      else alertMsg("Download link unavailable");
    };
  }

  function setupPopup2Buttons(client) {
    const openOrAlert = (url, fallback='URL Not Provided') => {
      if (url && url.trim()) window.open(url, '_blank');
      else alertMsg(fallback);
    };

    buttons.business.onclick = () => openOrAlert(client.businessUrl);
    buttons.portfolio.onclick = () => openOrAlert(client.portfolioUrl);
    buttons.location.onclick = () => openOrAlert(client.locationUrl, 'Location Not Provided');
    buttons.physical.onclick = () => alertMsg(client.physicalAddress || 'Address Not Provided');

    buttons.facebook.onclick = () => openOrAlert(client.facebookUrl);
    buttons.instagram.onclick = () => openOrAlert(client.instagramUrl);
    buttons.x.onclick = () => openOrAlert(client.xUrl);
    buttons.linkedin.onclick = () => openOrAlert(client.linkedinUrl);
    buttons.tiktok.onclick = () => openOrAlert(client.tiktokUrl);
    buttons.youtube.onclick = () => openOrAlert(client.youtubeUrl);

    buttons.book.onclick = () => {
      const title = encodeURIComponent(client.fullName || 'Appointment');
      const details = encodeURIComponent(client.bio || '');
      const location = encodeURIComponent(client.physicalAddress || '');
      const start = client.appointmentStart || '';
      const end = client.appointmentEnd || '';
      let url = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
      if(title) url += `&text=${title}`;
      if(details) url += `&details=${details}`;
      if(location) url += `&location=${location}`;
      if(start) url += `&dates=${start.replace(/-|:|T/g,'')}Z/${end.replace(/-|:|T/g,'')}Z`;
      window.open(url, '_blank');
    };
  }

  async function init() {
    const client = await fetchProfileData();

    if (client) {
      renderPhoto(client.photoUrl);
      fullName.textContent = client.fullName || '';
      jobName.textContent = client.company || '';
      titlePosition.textContent = client.title || '';
      phoneMain.textContent = client.phone1 || 'Not Provided';
      emailMain.textContent = client.email1 || 'Not Provided';
      buildList(phoneList, [client.phone2, client.phone3], 'phone');
      buildList(emailList, [client.email2, client.email3], 'email');

      bioText.textContent = client.bio || 'No bio provided.';
      renderHours(client.workingHours);
      setupPopup1Actions(client);
      setupPopup2Buttons(client);
    }

    [ [phoneDropdownBtn, phoneList], [emailDropdownBtn, emailList] ].forEach(([btn, list]) => {
      if(!btn) return;
      setHidden(list, true);
      btn.onclick = () => {
        const hidden = list.hasAttribute('hidden');
        setHidden(list, !hidden);
        btn.querySelector('i').className = hidden ? 'fa fa-chevron-up' : 'fa fa-chevron-down';
      };
    });

    // Popup Navigation & Sizing Logic (FIXED)
    buttons.moreInfo.onclick = () => {
      // 1. Measure the current height of Popup1
      const height = popup1.offsetHeight;
      
      // 2. Freeze the main container (pulse wrapper) height
      // This ensures the pulse animation doesn't shrink or jump
      el('vcard').style.height = height + 'px';

      // 3. Force Popup2 to match this exact height
      popup2.style.height = height + 'px';
      
      setHidden(popup1, true);
      setHidden(popup2, false);
      
      // 4. Ensure content starts at top
      popup2.scrollTop = 0;
    };
    
    buttons.back.onclick = () => {
      setHidden(popup2, true);
      setHidden(popup1, false);
      // Optional: Release fixed height if needed, but keeping it is stable
    };

    // Live Time Update
    setInterval(() => {
      if(liveTime) {
        const options = { 
          day: 'numeric', month: 'short', year: 'numeric', 
          hour: '2-digit', minute: '2-digit', second: '2-digit', 
          hour12: false, timeZone: 'Africa/Nairobi' 
        };
        const dateStr = new Date().toLocaleString('en-GB', options);
        liveTime.textContent = dateStr.replace(',', ' —');
      }
    }, 1000);

    setHidden(popup1, false);
    setHidden(popup2, true);
  }

  document.addEventListener('DOMContentLoaded', init);

})();