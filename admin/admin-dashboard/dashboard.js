// dashboard.js - Production-ready Admin Dashboard
const API_BASE = window.SCL_CONFIG?.API_BASE || "http://localhost:8080";
const ADMIN_FORM_PATH = "/admin-form.html";  // corrected path

const $ = (sel) => document.querySelector(sel);
const tbody = $('#clientTableBody');
const searchInput = $('#searchInput');
const noResults = $('#noResults');
const exportBtn = $('#exportBtn');
const searchBtn = $('#searchBtn');

let profilesCache = [];
let filteredProfiles = [];

// --- Modal ---
function showModal(message, isConfirm = false) {
  return new Promise(resolve => {
    const modal = $('#custom-modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <p>${message}</p>
          <div class="mt-4">
            ${isConfirm ? `<button class="modal-btn confirm">Confirm</button>
            <button class="modal-btn cancel">Cancel</button>` :
            `<button class="modal-btn confirm">OK</button>`}
          </div>
        </div>
      </div>`;
    modal.style.display = 'flex';
    const confirmBtn = modal.querySelector('.confirm');
    const cancelBtn = modal.querySelector('.cancel');
    confirmBtn.onclick = () => { modal.style.display = 'none'; resolve(true); };
    if (cancelBtn) cancelBtn.onclick = () => { modal.style.display = 'none'; resolve(false); };
  });
}

// --- Utilities ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                   .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function statusClassName(status) {
  if (!status) return 'status-pending';
  const s = status.toLowerCase();
  if (['approved','active','live'].includes(s)) return 'status-active';
  if (s === 'pending') return 'status-pending';
  if (s === 'disabled') return 'status-disabled';
  if (s === 'deleted') return 'status-deleted';
  return 'status-pending';
}

// --- Row creation ---
function createRow(profile) {
  const tr = document.createElement('tr');
  tr.dataset.id = profile._id || '';
  const photoUrl = profile.photoUrl || 'https://via.placeholder.com/16x16.png';
  const fullName = profile.fullName || '-';
  const phone = profile.phone1 || profile.phone2 || profile.phone3 || '-';
  const email = profile.email1 || profile.email2 || profile.email3 || '-';
  const statusText = (profile.status || 'pending').toUpperCase();
  const statusClass = statusClassName(profile.status);

  tr.innerHTML = `
    <td><img src="${escapeHtml(photoUrl)}" alt="Client Photo" class="client-photo" id="client-photo-${profile._id}"></td>
    <td>${escapeHtml(fullName)}</td>
    <td>${escapeHtml(phone)}</td>
    <td>${escapeHtml(email)}</td>
    <td><span class="status-badge ${statusClass}">${escapeHtml(statusText)}</span></td>
    <td>
      <button class="action-btn btn-process" data-id="${profile._id}">Process</button>
      <button class="action-btn btn-disable" data-id="${profile._id}">${profile.status === 'disabled' ? 'Disabled' : 'Disable'}</button>
      <button class="action-btn btn-reactivate" data-id="${profile._id}">Reactivate</button>
      <button class="action-btn btn-delete" data-id="${profile._id}">Delete</button>
    </td>
  `;
  attachRowListeners(tr, profile);
  return tr;
}

function attachRowListeners(tr, profile) {
  if (!tr) return;
  const processBtn = tr.querySelector('.btn-process');
  if (processBtn) processBtn.onclick = () => {
    if (!profile) return showModal('Profile data missing.');
    const dataStr = encodeURIComponent(JSON.stringify(profile));
    window.open(`${ADMIN_FORM_PATH}?data=${dataStr}`, '_blank');
  };
  const disableBtn = tr.querySelector('.btn-disable');
  if (disableBtn) disableBtn.onclick = async () => {
    if (!profile._id) return showModal('Profile ID missing.');
    if (await showModal('Disable this profile?', true)) await updateStatus(profile._id, 'disabled');
  };
  const reactivateBtn = tr.querySelector('.btn-reactivate');
  if (reactivateBtn) reactivateBtn.onclick = async () => {
    if (!profile._id) return showModal('Profile ID missing.');
    if (await showModal('Reactivate this profile?', true)) await updateStatus(profile._id, 'approved');
  };
  const deleteBtn = tr.querySelector('.btn-delete');
  if (deleteBtn) deleteBtn.onclick = async () => {
    if (!profile._id) return showModal('Profile ID missing.');
    if (await showModal('Delete this profile permanently?', true)) await deleteProfile(profile._id);
  };
}

async function updateStatus(id, status) {
  try {
    const res = await fetch(`${API_BASE}/api/profiles/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ status }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || 'Failed to update status');
    profilesCache = profilesCache.map(p => p._id === id ? (result.profile || {...p, status}) : p);
    filterAndRender(searchInput.value.trim());
  } catch (err) { showModal('Error updating status.'); console.error(err); }
}

async function deleteProfile(id) {
  try {
    const res = await fetch(`${API_BASE}/api/profiles/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || 'Failed to delete profile');
    profilesCache = profilesCache.filter(p => p._id !== id);
    filterAndRender(searchInput.value.trim());
  } catch (err) { showModal('Error deleting profile.'); console.error(err); }
}

async function fetchProfiles() {
  try {
    const res = await fetch(`${API_BASE}/api/profiles`);
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || `Failed to fetch profiles (${res.status})`);
    profilesCache = Array.isArray(result.data) ? result.data : [];
    filterAndRender('');
  } catch (err) {
    showModal('Failed to fetch profiles.');
    console.error(err);
  }
}

function renderTable(profiles) {
  tbody.innerHTML = '';
  if (!profiles || profiles.length === 0) {
    noResults.style.display = 'block';
    return;
  }
  noResults.style.display = 'none';
  profiles.forEach(profile => tbody.appendChild(createRow(profile)));
}

function filterAndRender(query) {
  if (!query) filteredProfiles = [...profilesCache];
  else {
    const q = query.toLowerCase();
    filteredProfiles = profilesCache.filter(p => 
      (p.fullName && p.fullName.toLowerCase().includes(q)) ||
      (p._id && p._id.toLowerCase().includes(q)) ||
      (p.phone1 && p.phone1.toLowerCase().includes(q)) ||
      (p.phone2 && p.phone2.toLowerCase().includes(q)) ||
      (p.phone3 && p.phone3.toLowerCase().includes(q)) ||
      (p.email1 && p.email1.toLowerCase().includes(q)) ||
      (p.email2 && p.email2.toLowerCase().includes(q)) ||
      (p.email3 && p.email3.toLowerCase().includes(q))
    );
  }
  renderTable(filteredProfiles);
}

function exportCSV() {
  if (!filteredProfiles.length) return showModal('No data to export.');
  const headers = ['_id','fullName','phone1','email1','company','status','createdAt'];
  const csvRows = [ headers.join(','), ...filteredProfiles.map(p=> headers.map(h=>p[h]||'').join(',')) ];
  const blob = new Blob([csvRows.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `clients_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

searchBtn.addEventListener('click', ()=> filterAndRender(searchInput.value.trim()));
searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); filterAndRender(searchInput.value.trim()); } });
exportBtn.addEventListener('click', exportCSV);

fetchProfiles();
