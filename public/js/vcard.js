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
    // QR REVEAL: Horizontal slide on tap
    const track = document.querySelector('.photo-swipe-track');
    if (track) {
        let showingQR = false;
        track.style.cursor = 'pointer';
        track.onclick = () => {
            showingQR = !showingQR;
            track.style.transform = showingQR ? 'translateX(-50%)' : 'translateX(0)';
        };
    }
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
        node.style.display = hidden ? "none" : "block";
        node.setAttribute("aria-hidden", hidden);
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
    function renderPhoto(url) {
        if (!photoArea) return;
        const img = new Image();
        img.src = url || '/public/images/default-photo.png';
        img.alt = "Profile";
        img.onload = () => { photoArea.innerHTML = ''; photoArea.appendChild(img); };
        img.onerror = () => { photoArea.innerHTML = `<img src="/public/images/default-photo.png">`; };
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
        renderPhoto(client.photoUrl);
        
        fullName.textContent = client.fullName || '';
        jobName.textContent = client.company || '';
        titlePosition.textContent = client.title || '';
        phoneMain.textContent = client.phone1 || 'Not Provided';
        emailMain.textContent = client.email1 || 'Not Provided';

        bioText.textContent = client.bio || 'Professional Profile';
        
        setupActions(client);
        setHidden(popup1, false);

        // Standard Navigation
        if (buttons.moreInfo) buttons.moreInfo.onclick = () => { setHidden(popup1, true); setHidden(popup2, false); };
        if (buttons.back) buttons.back.onclick = () => { setHidden(popup2, true); setHidden(popup1, false); };
    }

    
document.addEventListener('click',function(e){
 const fs=document.querySelector('.photo-fullscreen');
 if(!fs) return;
 fs.remove();
});
document.addEventListener('DOMContentLoaded', init);
})();

function showPopup(show) { popup2.hidden = !show; if(show){ popup2.removeAttribute('inert'); } else { popup2.setAttribute('inert', ''); } }


let startX=0;

const photo=document.getElementById('photoArea');

if(photo){

photo.addEventListener('touchstart',e=>{
startX=e.touches[0].clientX;
});

photo.addEventListener('touchend',e=>{

const endX=e.changedTouches[0].clientX;

if(startX-endX>60)
 document.getElementById('photoArea').style.display='block';

if(endX-startX>60)
 document.getElementById('photoArea').style.display='none';

});

}

