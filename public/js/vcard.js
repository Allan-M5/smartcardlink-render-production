(function () {
    'use strict';
    // SPEED FIX: Prefetch data immediately
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    if (slug) fetch(`${window.location.origin}/api/vcard/${slug}`).then(r => r.json()).then(j => { window.cachedData = j.data; });

    // AUTO-DETECT API ROOT: Works in local and production without manual changes
    const API_ROOT = window.location.origin; 
    const el = id => document.getElementById(id);

    // DOM References
    const vcardContainer = el('vcard');
    const popup1 = el('popup1');
    const popup2 = el('popup2');
    const photoArea = el('photoArea');

    const fullName = el('fullName');
    const jobName = el('jobName');
    const titlePosition = el('titlePosition');
    const phoneMain = el('phoneMain');
    const emailMain = el('emailMain');
    const phoneList = el('phoneList');
    const emailList = el('emailList');
    const phoneDropdownBtn = el('phoneDropdownBtn');
    const emailDropdownBtn = el('emailDropdownBtn');

    const actions = {
        call: el('callBtn'), sms: el('smsBtn'), wa: el('waBtn'),
        mail: el('mailBtn'), print: el('printBtn'), save: el('saveBtn')
    };

    const buttons = {
        moreInfo: el('moreInfoBtn'), back: el('backBtn'), book: el('bookAppointmentBtn'),
        business: el('businessWebsite'), portfolio: el('portfolioWebsite'),
        location: el('locationMap'), physical: el('physicalAddress'),
        facebook: el('facebookBtn'), instagram: el('instagramBtn'),
        x: el('xBtn'), linkedin: el('linkedinBtn'), tiktok: el('tiktokBtn'), youtube: el('youtubeBtn')
    };

    const bioText = el('bioText');
    const liveTime = el('liveTime');
    const hoursTable = document.querySelector('#hoursTable tbody');

    // --- HELPER FUNCTIONS ---
function setHidden(node, hidden) {
    if (!node) return;

    if (hidden) {
        node.style.display = "none";
        node.setAttribute("aria-hidden", "true");

        if (node === popup2) {
            node.setAttribute("inert", "");
        }
        return;
    }

    node.style.display = node === popup2 ? "flex" : "block";
    node.setAttribute("aria-hidden", "false");

    if (node === popup2) {
        node.removeAttribute("inert");
    }
}

    function alertMsg(msg) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({ title: msg, icon: 'info', confirmButtonColor: getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || '#FFD700' });
        } else { alert(msg); }
    }

    function showMessage(msg, isError = false) {
        if (!vcardContainer) return;
        setHidden(popup1, true);
        setHidden(popup2, true);
        let msgEl = el('messageArea') || document.createElement('div');
        msgEl.id = 'messageArea';
        msgEl.style.cssText = 'text-align: center; padding: 20px;';
        if (!el('messageArea')) vcardContainer.prepend(msgEl);
        msgEl.style.color = isError ? '#ef4444' : 'var(--theme-color, #FFD700)';
        msgEl.innerHTML = `<h3>${msg}</h3>`;
        setHidden(msgEl, false);
    }

    // --- THEME ENGINE ---
    function applyTheme(color) {
        if (!color) return;
        document.documentElement.style.setProperty('--theme-color', color);
        // Direct injection for elements that might not use CSS variables
        const style = document.createElement('style');
        style.innerHTML = `
            .btn-primary, .action-button, .save-contact-btn { background-color: ${color} !important; border-color: ${color} !important; }
            .social-icon, .info-icon, i { color: ${color} !important; }
            .profile-header { border-bottom: 3px solid ${color}; }
        `;
        document.head.appendChild(style);
    }

    // --- DATA FETCH ---
    async function fetchProfileData() {
        try {
            // DUAL-STRATEGY SLUG: Tries URL Param, then Tries Pathname
            const urlParams = new URLSearchParams(window.location.search);
            let clientSlug = urlParams.get('slug') || window.location.pathname.split('/').pop();
            
            if (!clientSlug || clientSlug === 'vcard.html') {
                throw new Error('VCard Identifier not found.');
            }

            showMessage('Loading Professional vCard...');
            
            const res = await fetch(`${API_ROOT}/api/vcard/${clientSlug}`);
            if (!res.ok) throw new Error('Card not found.');
            
            const json = await res.json();
            if (json.status !== 'success') throw new Error(json.message || 'Inactive Card');

            setHidden(el('messageArea'), true);
            return json.data;
        } catch (err) {
            showMessage(err.message, true);
            return null;
        }
    }

    // --- UI RENDERING ---
function renderPhoto(url, qrUrl = '') {
    if (!photoArea) return;

    const photoSrc = url || '/public/images/default-photo.png';
    const qrSrc = qrUrl || '';

    if (!qrSrc) {
        photoArea.innerHTML = `<img src="${photoSrc}" alt="Profile">`;
        return;
    }

    photoArea.innerHTML = `
        <div class="photo-swipe-container">
            <div class="photo-swipe-track">
                <div class="photo-panel">
                    <img src="${photoSrc}" alt="Profile">
                </div>
                <div class="qr-panel">
                    <img src="${qrSrc}" alt="QR Code">
                </div>
            </div>
            <div class="swipe-hint">Swipe to view QR</div>
        </div>
    `;

    const track = photoArea.querySelector('.photo-swipe-track');
    const panels = photoArea.querySelectorAll('img');

    let startX = 0;
    let showingQR = false;
    let pressTimer;

    function updateView() {
        track.style.transform = showingQR
            ? 'translateX(-50%)'
            : 'translateX(0)';
    }

    function openFullscreen(src) {
        const overlay = document.createElement('div');
        overlay.className = 'photo-fullscreen';
        overlay.innerHTML = `<img src="${src}">`;
        document.body.appendChild(overlay);
    }

    function startPress(src) {
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => openFullscreen(src), 600);
    }

    function cancelPress() {
        clearTimeout(pressTimer);
    }

    track.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
    }, { passive:true });

    track.addEventListener('touchend', e => {
        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;

        if (diff > 60) showingQR = true;
        if (diff < -60) showingQR = false;

        updateView();
    }, { passive:true });

    track.addEventListener('click', () => {
        showingQR = !showingQR;
        updateView();
    });

    panels.forEach(img => {
        img.addEventListener('mousedown', () => startPress(img.src));
        img.addEventListener('mouseup', cancelPress);
        img.addEventListener('mouseleave', cancelPress);

        img.addEventListener('touchstart', () => startPress(img.src), { passive:true });
        img.addEventListener('touchend', cancelPress, { passive:true });
    });
}

    function setupActions(client) {
        const phone = client.phone1;
        const email = client.email1;

        const bind = (btn, task, condition) => {
            if (!btn) return;
            if (condition) {
                btn.onclick = task;
                btn.classList.remove('disabled');
            } else {
                btn.onclick = () => alertMsg("Not Provided");
                btn.classList.add('disabled');
            }
        };

        bind(actions.call, () => window.location.href = `tel:${phone}`, phone);
        bind(actions.sms, () => window.location.href = `sms:${phone}`, phone);
        bind(actions.mail, () => window.location.href = `mailto:${email}`, email);
        bind(actions.wa, () => window.open(`https://wa.me/${phone.replace(/\D/g,'')}`, '_blank'), phone);
        
        bind(actions.save, () => {
            const vcf = `BEGIN:VCARD
VERSION:3.0
FN:${client.fullName}
TEL;TYPE=CELL:${client.phone1}
EMAIL:${client.email1}
ORG:${client.company || ""}
TITLE:${client.title || ""}
END:VCARD`;
            const blob = new Blob([vcf], { type: "text/vcard" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${client.fullName}.vcf`;
            a.click();
        }, client.fullName);
    }

    async function init() {
        const client = await fetchProfileData();
        if (!client) return;

        applyTheme(client.themeColor || "#FFD700");
        renderPhoto(client.photoUrl, client.qrCodeUrl);
        
        fullName.textContent = client.fullName || '';
        jobName.textContent = client.company || '';
        titlePosition.textContent = client.title || '';
        phoneMain.textContent = client.phone1 || 'Not Provided';
        emailMain.textContent = client.email1 || 'Not Provided';

        bioText.textContent = client.bio || 'Professional Profile';
        
setupActions(client);

/* POPUP2 BUTTON BINDING */
function bindLinkButton(btn, value, mode = 'url', emptyMessage = 'Not Provided') {
    if (!btn) return;

    const finalValue = String(value || '').trim();

    btn.style.display = 'flex';
    btn.classList.remove('disabled');

    if (!finalValue) {
        btn.onclick = () => alertMsg(emptyMessage);
        btn.classList.add('disabled');
        return;
    }

    if (mode === 'address') {
        btn.onclick = () => alertMsg(finalValue);
        return;
    }

    btn.onclick = () => window.open(finalValue, '_blank', 'noopener,noreferrer');
}

const socials = client.socialLinks || {};

bindLinkButton(buttons.business, client.businessWebsite, 'url', 'Business URL not provided');
bindLinkButton(buttons.portfolio, client.portfolioWebsite, 'url', 'Portfolio URL not provided');
bindLinkButton(buttons.location, client.locationMap || client.locationMapUrl, 'url', 'Location map not provided');
bindLinkButton(buttons.physical, client.address, 'address', 'Physical address not provided');
bindLinkButton(buttons.book, client.appointmentUrl || client.bookingLink, 'url', 'Appointment link not provided');

bindLinkButton(buttons.facebook, socials.facebook || client.facebook, 'url', 'Facebook link not provided');
bindLinkButton(buttons.instagram, socials.instagram || client.instagram, 'url', 'Instagram link not provided');
bindLinkButton(buttons.x, socials.twitter || socials.x || client.twitter || client.x, 'url', 'X link not provided');
bindLinkButton(buttons.linkedin, socials.linkedin || client.linkedin, 'url', 'LinkedIn link not provided');
bindLinkButton(buttons.tiktok, socials.tiktok || client.tiktok, 'url', 'TikTok link not provided');
bindLinkButton(buttons.youtube, socials.youtube || client.youtube, 'url', 'YouTube link not provided');

setHidden(popup1, false);

// Standard Navigation
if (buttons.moreInfo) buttons.moreInfo.onclick = () => { setHidden(popup1, true); setHidden(popup2, false); };
if (buttons.back) buttons.back.onclick = () => { setHidden(popup2, true); setHidden(popup1, false); };
    }
    
document.addEventListener('click', function (e) {
    const fs = document.querySelector('.photo-fullscreen');
    if (!fs) return;
    if (e.target === fs) {
        fs.remove();
    }
});

document.addEventListener('DOMContentLoaded', init);
})();

