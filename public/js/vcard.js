(function () {
    'use strict';

    const API_ROOT = window.location.origin;
    const APPLY_VCARD_URL = 'https://smartcardlink-dashboard-frontend.onrender.com/client-form.html';

    const el = (id) => document.getElementById(id);

    const vcardContainer = el('vcard');
    const popup1 = el('popup1');
    const popup2 = el('popup2');
    const photoArea = el('photoArea');

    const fullName = el('fullName');
    const jobName = el('jobName');
    const titlePosition = el('titlePosition');
    const phoneMain = el('phoneMain');
    const emailMain = el('emailMain');

    const actions = {
        call: el('callBtn'),
        sms: el('smsBtn'),
        wa: el('waBtn'),
        mail: el('mailBtn'),
        print: el('printBtn'),
        save: el('saveBtn')
    };

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
        youtube: el('youtubeBtn'),
        apply: el('applyVcardLink'),
        shareApply: el('shareApplyBtn'),
        analytics: el('analyticsBtn'),
        reminder: el('contactReminderBtn'),
        reminderLocked: el('contactReminderLockedBtn'),
        viewResume: el('viewResumeBtn'),
        downloadResume: el('downloadResumeBtn'),
        viewResumeLocked: el('viewResumeLockedBtn'),
        downloadResumeLocked: el('downloadResumeLockedBtn'),
        resumeAccessCancel: el('resumeAccessCancelBtn'),
        resumeAccessConfirm: el('resumeAccessConfirmBtn'),
        analyticsAccessCancel: el('analyticsAccessCancelBtn'),
        analyticsAccessConfirm: el('analyticsAccessConfirmBtn')
    };

    const sections = {
        resume: el('resumeSection'),
        resumeLocked: el('resumeLockedSection'),
        analyticsPanel: el('analyticsPanel'),
        reminderWrap: el('contactReminderWrap'),
        reminderLockedWrap: el('contactReminderLockedWrap'),
        resumeAccessModal: el('resumeAccessModal'),
        analyticsAccessModal: el('analyticsAccessModal')
    };

    const inputs = {
        resumeAccess: el('resumeAccessInput'),
        analyticsAccess: el('analyticsAccessInput')
    };

    const errors = {
        resumeAccess: el('resumeAccessError'),
        analyticsAccess: el('analyticsAccessError')
    };

    const counts = {
        profileAccessed: el('profileAccessCount'),
        resumeViewed: el('resumeViewedCount'),
        resumeDownloaded: el('resumeDownloadedCount')
    };

    const labels = {
        bioText: el('bioText'),
        liveTime: el('liveTime'),
        reminderText: el('contactReminderText'),
        reminderLockedText: el('contactReminderLockedText')
    };

    let currentClient = null;
    let pendingResumeMode = 'view';

    function setHidden(node, hidden) {
        if (!node) return;

        if (hidden) {
            node.hidden = true;
            node.style.display = 'none';
            node.setAttribute('aria-hidden', 'true');
            if (node === popup2) node.setAttribute('inert', '');
            return;
        }

        node.hidden = false;
        node.style.display = node === popup2 ? 'flex' : '';
        node.setAttribute('aria-hidden', 'false');
        if (node === popup2) node.removeAttribute('inert');
    }

    function alertMsg(msg) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: msg,
                icon: 'info',
                confirmButtonColor: getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || '#FFD700'
            });
        } else {
            window.alert(msg);
        }
    }

    function showError(node, message) {
        if (!node) return;
        node.textContent = message || '';
        node.hidden = !message;
    }

    function openModal(modal, input, errorNode) {
        if (errorNode) showError(errorNode, '');
        if (input) input.value = '';
        setHidden(modal, false);
        window.setTimeout(() => {
            if (input) input.focus();
        }, 30);
    }

    function closeModal(modal, errorNode) {
        if (errorNode) showError(errorNode, '');
        setHidden(modal, true);
    }

    function showMessage(msg, isError = false) {
        if (!vcardContainer) return;
        setHidden(popup1, true);
        setHidden(popup2, true);

        let msgEl = el('messageArea');
        if (!msgEl) {
            msgEl = document.createElement('div');
            msgEl.id = 'messageArea';
            msgEl.style.cssText = 'text-align:center;padding:24px;';
            vcardContainer.prepend(msgEl);
        }

        msgEl.style.color = isError ? '#ef4444' : 'var(--theme-color, #FFD700)';
        msgEl.innerHTML = `<h3>${msg}</h3>`;
        setHidden(msgEl, false);
    }

    function hideMessageArea() {
        const msgEl = el('messageArea');
        if (msgEl) setHidden(msgEl, true);
    }

    function applyTheme(client) {
        const packageType = String(client.packageType || 'standard').toLowerCase();
        const theme = packageType === 'pro'
            ? (client.themeColor || '#FFD700')
            : '#FFD700';

        document.documentElement.style.setProperty('--theme-color', theme);

        let style = el('dynamicThemeStyle');
        if (!style) {
            style = document.createElement('style');
            style.id = 'dynamicThemeStyle';
            document.head.appendChild(style);
        }

        style.innerHTML = `
            .btn-primary, .action-button, .save-contact-btn { background-color: ${theme} !important; border-color: ${theme} !important; }
            .profile-header { border-bottom: 3px solid ${theme}; }
        `;
    }

    async function fetchProfileData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const clientSlug = urlParams.get('slug') || window.location.pathname.split('/').pop();

            if (!clientSlug || clientSlug === 'index.html') {
                throw new Error('VCard identifier not found.');
            }

            showMessage('Loading Professional vCard...');

            const res = await fetch(`${API_ROOT}/api/vcard/${encodeURIComponent(clientSlug)}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('Card not found.');

            const json = await res.json();
            if (json.status !== 'success') {
                throw new Error(json.message || 'Inactive card');
            }

            hideMessageArea();
            return json.data;
        } catch (err) {
            showMessage(err.message, true);
            return null;
        }
    }

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
                    <div class="photo-panel"><img src="${photoSrc}" alt="Profile"></div>
                    <div class="qr-panel"><img src="${qrSrc}" alt="QR Code"></div>
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
            track.style.transform = showingQR ? 'translateX(-50%)' : 'translateX(0)';
        }

        function openFullscreen(src) {
            const overlay = document.createElement('div');
            overlay.className = 'photo-fullscreen';
            overlay.innerHTML = `<img src="${src}" alt="Fullscreen">`;
            document.body.appendChild(overlay);
        }

        function startPress(src) {
            clearTimeout(pressTimer);
            pressTimer = setTimeout(() => openFullscreen(src), 600);
        }

        function cancelPress() {
            clearTimeout(pressTimer);
        }

        track.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            const endX = e.changedTouches[0].clientX;
            const diff = startX - endX;

            if (diff > 60) showingQR = true;
            if (diff < -60) showingQR = false;

            updateView();
        }, { passive: true });

        track.addEventListener('click', () => {
            showingQR = !showingQR;
            updateView();
        });

        panels.forEach((img) => {
            img.addEventListener('mousedown', () => startPress(img.src));
            img.addEventListener('mouseup', cancelPress);
            img.addEventListener('mouseleave', cancelPress);
            img.addEventListener('touchstart', () => startPress(img.src), { passive: true });
            img.addEventListener('touchend', cancelPress, { passive: true });
        });
    }

    function setupActions(client) {
        const phone = client.phone1 || '';
        const email = client.email1 || '';

        const bind = (btn, task, condition) => {
            if (!btn) return;
            if (condition) {
                btn.onclick = task;
                btn.classList.remove('disabled');
            } else {
                btn.onclick = () => alertMsg('Not Provided');
                btn.classList.add('disabled');
            }
        };

        bind(actions.call, () => { window.location.href = `tel:${phone}`; }, phone);
        bind(actions.sms, () => { window.location.href = `sms:${phone}`; }, phone);
        bind(actions.mail, () => { window.location.href = `mailto:${email}`; }, email);
        bind(actions.wa, () => { window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer'); }, phone);

        bind(actions.print, () => {
            window.print();
        }, true);

        bind(actions.save, () => {
            const vcf = `BEGIN:VCARD
VERSION:3.0
FN:${client.fullName || ''}
TEL;TYPE=CELL:${client.phone1 || ''}
EMAIL:${client.email1 || ''}
ORG:${client.company || ''}
TITLE:${client.title || ''}
END:VCARD`;
            const blob = new Blob([vcf], { type: 'text/vcard' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${client.fullName || 'contact'}.vcf`;
            a.click();
        }, client.fullName);
    }

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

    function setAnalyticsCounts(analytics) {
        const safe = analytics || {};
        if (counts.profileAccessed) counts.profileAccessed.textContent = String(safe.profileViews || 0);
        if (counts.resumeViewed) counts.resumeViewed.textContent = String(safe.resumeViews || 0);
        if (counts.resumeDownloaded) counts.resumeDownloaded.textContent = String(safe.resumeDownloads || 0);
    }

    function renderResumeAndReminder(client) {
        const isPro = String(client.packageType || 'standard').toLowerCase() === 'pro';
        const name = client.fullName || 'this profile owner';
        const resumeEnabled = !!(client.resume && client.resume.enabled && client.resume.fileUrl);

        if (labels.reminderText) labels.reminderText.textContent = `Remind me to contact ${name}`;
        if (labels.reminderLockedText) labels.reminderLockedText.textContent = `Remind me to contact ${name}`;

        setHidden(sections.resume, !(isPro && resumeEnabled));
        setHidden(sections.resumeLocked, isPro && resumeEnabled);
        setHidden(sections.reminderWrap, !isPro);
        setHidden(sections.reminderLockedWrap, isPro);
    }

    function buildReminderIcs(client) {
        const now = new Date();
        const start = new Date(now.getTime() + (24 * 60 * 60 * 1000));
        start.setHours(9, 0, 0, 0);
        const end = new Date(start.getTime() + (30 * 60 * 1000));

        const yyyy = start.getUTCFullYear();
        const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(start.getUTCDate()).padStart(2, '0');
        const sh = String(start.getUTCHours()).padStart(2, '0');
        const sm = String(start.getUTCMinutes()).padStart(2, '0');

        const eyyyy = end.getUTCFullYear();
        const emm = String(end.getUTCMonth() + 1).padStart(2, '0');
        const edd = String(end.getUTCDate()).padStart(2, '0');
        const eh = String(end.getUTCHours()).padStart(2, '0');
        const em = String(end.getUTCMinutes()).padStart(2, '0');

        const title = `Contact ${client.fullName || 'Profile Owner'} — ${client.title || 'Professional'}`;
        const description = [
            `Remember to contact ${client.fullName || 'this profile owner'}.`,
            client.title ? `Title: ${client.title}` : '',
            client.phone1 ? `Phone: ${client.phone1}` : '',
            client.email1 ? `Email: ${client.email1}` : '',
            client.vcardUrl ? `Profile: ${client.vcardUrl}` : window.location.href
        ].filter(Boolean).join('\\n');

        return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SmartCardLink//Reminder//EN
BEGIN:VEVENT
UID:${Date.now()}@smartcardlink
DTSTAMP:${yyyy}${mm}${dd}T${sh}${sm}00Z
DTSTART:${yyyy}${mm}${dd}T${sh}${sm}00Z
DTEND:${eyyyy}${emm}${edd}T${eh}${em}00Z
SUMMARY:${title}
DESCRIPTION:${description}
END:VEVENT
END:VCALENDAR`;
    }

    function downloadReminder(client) {
        const ics = buildReminderIcs(client);
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `contact-${(client.fullName || 'profile-owner').toLowerCase().replace(/\s+/g, '-')}-reminder.ics`;
        a.click();
    }

    async function requestAnalyticsAccess() {
        if (!currentClient) return;

        const slug = currentClient.slug || '';
        const accessToken = String(inputs.analyticsAccess && inputs.analyticsAccess.value || '').trim();

        if (!accessToken) {
            showError(errors.analyticsAccess, 'Access token is required.');
            return;
        }

        try {
            showError(errors.analyticsAccess, '');

            const res = await fetch(`${API_ROOT}/api/vcard/${encodeURIComponent(slug)}/analytics-access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken })
            });

            const json = await res.json();
            if (!res.ok || json.status !== 'success') {
                throw new Error(json.message || 'Access denied.');
            }

            setAnalyticsCounts(json.data && json.data.analytics ? json.data.analytics : {});
            closeModal(sections.analyticsAccessModal, errors.analyticsAccess);
            if (sections.analyticsPanel) sections.analyticsPanel.hidden = false;
        } catch (error) {
            showError(errors.analyticsAccess, error.message || 'Access denied.');
        }
    }

    async function requestResumeAccess(mode) {
        if (!currentClient) return;

        const slug = currentClient.slug || '';
        const password = String(inputs.resumeAccess && inputs.resumeAccess.value || '').trim();

        if (!password) {
            showError(errors.resumeAccess, 'Password is required.');
            return;
        }

        try {
            showError(errors.resumeAccess, '');

            const res = await fetch(`${API_ROOT}/api/vcard/${encodeURIComponent(slug)}/resume-access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, mode })
            });

            const json = await res.json();
            if (!res.ok || json.status !== 'success') {
                throw new Error(json.message || 'Resume access denied.');
            }

            const payload = json.data || {};
            closeModal(sections.resumeAccessModal, errors.resumeAccess);

            if (mode === 'download') {
                const a = document.createElement('a');
                a.href = payload.fileUrl;
                a.download = payload.fileName || 'resume.pdf';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                window.open(payload.fileUrl, '_blank', 'noopener,noreferrer');
            }

            if (sections.analyticsPanel && !sections.analyticsPanel.hidden) {
                const next = {
                    profileViews: Number(counts.profileAccessed ? counts.profileAccessed.textContent : 0) || 0,
                    resumeViews: Number(counts.resumeViewed ? counts.resumeViewed.textContent : 0) || 0,
                    resumeDownloads: Number(counts.resumeDownloaded ? counts.resumeDownloaded.textContent : 0) || 0
                };

                if (mode === 'download') {
                    next.resumeDownloads += 1;
                } else {
                    next.resumeViews += 1;
                }

                setAnalyticsCounts(next);
            }
        } catch (error) {
            showError(errors.resumeAccess, error.message || 'Resume access denied.');
        }
    }

    function wireFooterActions(client) {
        if (buttons.apply) {
            buttons.apply.href = APPLY_VCARD_URL;
        }

        if (buttons.shareApply) {
            buttons.shareApply.onclick = async () => {
                const shareData = {
                    title: 'Apply for SmartCardLink vCard',
                    text: 'Use this link to apply for your SmartCardLink vCard profile.',
                    url: APPLY_VCARD_URL
                };

                try {
                    if (navigator.share) {
                        await navigator.share(shareData);
                    } else if (navigator.clipboard) {
                        await navigator.clipboard.writeText(APPLY_VCARD_URL);
                        alertMsg('Client form URL copied');
                    } else {
                        alertMsg(APPLY_VCARD_URL);
                    }
                } catch (error) {
                    if (error && error.name !== 'AbortError') {
                        alertMsg('Share failed');
                    }
                }
            };
        }

        if (buttons.analytics) {
            buttons.analytics.onclick = () => {
                const isPro = String(client.packageType || 'standard').toLowerCase() === 'pro';
                if (!isPro) {
                    alertMsg('This feature is available on PRO vCard.');
                    return;
                }

                openModal(sections.analyticsAccessModal, inputs.analyticsAccess, errors.analyticsAccess);
            };
        }
    }

    function wireResumeButtons(client) {
        const isPro = String(client.packageType || 'standard').toLowerCase() === 'pro';
        const resumeEnabled = !!(client.resume && client.resume.enabled && client.resume.fileUrl);

        if (buttons.viewResumeLocked) {
            buttons.viewResumeLocked.onclick = () => alertMsg('This feature is available on PRO vCard.');
        }
        if (buttons.downloadResumeLocked) {
            buttons.downloadResumeLocked.onclick = () => alertMsg('This feature is available on PRO vCard.');
        }
        if (buttons.reminderLocked) {
            buttons.reminderLocked.onclick = () => alertMsg('This feature is available on PRO vCard.');
        }

        if (!isPro) return;

        if (buttons.reminder) {
            buttons.reminder.onclick = () => {
                downloadReminder(client);
            };
        }

        if (!resumeEnabled) {
            if (buttons.viewResume) buttons.viewResume.onclick = () => alertMsg('Resume is not available on this profile.');
            if (buttons.downloadResume) buttons.downloadResume.onclick = () => alertMsg('Resume is not available on this profile.');
            return;
        }

        if (buttons.viewResume) {
            buttons.viewResume.onclick = () => {
                pendingResumeMode = 'view';
                openModal(sections.resumeAccessModal, inputs.resumeAccess, errors.resumeAccess);
            };
        }

        if (buttons.downloadResume) {
            buttons.downloadResume.onclick = () => {
                pendingResumeMode = 'download';
                openModal(sections.resumeAccessModal, inputs.resumeAccess, errors.resumeAccess);
            };
        }
    }

    function setupPrimaryLinks(client) {
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
    }

    function updateLiveClock() {
        if (!labels.liveTime) return;
        const now = new Date();
        labels.liveTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function wireModalButtons() {
        if (buttons.resumeAccessCancel) {
            buttons.resumeAccessCancel.onclick = () => closeModal(sections.resumeAccessModal, errors.resumeAccess);
        }
        if (buttons.resumeAccessConfirm) {
            buttons.resumeAccessConfirm.onclick = () => requestResumeAccess(pendingResumeMode);
        }
        if (buttons.analyticsAccessCancel) {
            buttons.analyticsAccessCancel.onclick = () => closeModal(sections.analyticsAccessModal, errors.analyticsAccess);
        }
        if (buttons.analyticsAccessConfirm) {
            buttons.analyticsAccessConfirm.onclick = () => requestAnalyticsAccess();
        }

        if (inputs.resumeAccess) {
            inputs.resumeAccess.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') requestResumeAccess(pendingResumeMode);
                if (e.key === 'Escape') closeModal(sections.resumeAccessModal, errors.resumeAccess);
            });
        }

        if (inputs.analyticsAccess) {
            inputs.analyticsAccess.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') requestAnalyticsAccess();
                if (e.key === 'Escape') closeModal(sections.analyticsAccessModal, errors.analyticsAccess);
            });
        }
    }

    async function init() {
        const client = await fetchProfileData();
        if (!client) return;

        currentClient = client;

        applyTheme(client);
        renderPhoto(client.photoUrl, client.qrCodeUrl);

        if (fullName) fullName.textContent = client.fullName || '';
        if (jobName) jobName.textContent = client.company || '';
        if (titlePosition) titlePosition.textContent = client.title || '';
        if (phoneMain) phoneMain.textContent = client.phone1 || 'Not Provided';
        if (emailMain) emailMain.textContent = client.email1 || 'Not Provided';
        if (labels.bioText) labels.bioText.textContent = client.bio || 'Professional Profile';

        setupActions(client);
        setupPrimaryLinks(client);
        renderResumeAndReminder(client);
        setAnalyticsCounts(client.analytics || {});
        wireFooterActions(client);
        wireResumeButtons(client);
        wireModalButtons();

        if (sections.analyticsPanel) sections.analyticsPanel.hidden = true;

        setHidden(popup1, false);
        setHidden(popup2, true);

        if (buttons.moreInfo) {
            buttons.moreInfo.onclick = () => {
                setHidden(popup1, true);
                setHidden(popup2, false);
            };
        }

        if (buttons.back) {
            buttons.back.onclick = () => {
                setHidden(popup2, true);
                setHidden(popup1, false);
                if (sections.analyticsPanel) sections.analyticsPanel.hidden = true;
            };
        }

        updateLiveClock();
        window.setInterval(updateLiveClock, 30000);
    }

    document.addEventListener('click', function (e) {
        const fs = document.querySelector('.photo-fullscreen');
        if (fs && e.target === fs) {
            fs.remove();
        }
    });

    document.addEventListener('DOMContentLoaded', init);
})();