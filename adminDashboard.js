// C:\Users\ADMIN\Desktop\smartcardlink-app\public\js\adminDashboard.js

// --- Global Variables ---
let allClientData = [];
const MAX_RETRIES = 3;
let isFetching = false;

// CRITICAL: Robust API_ROOT configuration using window.SCL_CONFIG
const API_ROOT = window.SCL_CONFIG?.API_ROOT || `${window.location.origin}/api`;
const ADMIN_FORM_URL = window.SCL_CONFIG?.ADMIN_FORM_URL || 'admin-form.html';

// --- DOM Elements (Defensive checks are kept) ---
const dashboardContainer = document.getElementById('dashboardContainer');
const clientTableBody = document.getElementById('clientTableBody');
const filterInput = document.getElementById('filterInput'); 
const statusFilter = document.getElementById('statusFilter');
const exportBtn = document.getElementById('exportBtn');
const noResultsDiv = document.getElementById('noResults'); 
const totalsDiv = document.getElementById('totals');       
const searchBtn = document.getElementById('searchBtn');

// --- Modal & Toast Elements (New) ---
const notesModal = document.getElementById('notesModal');
const modalTitle = document.getElementById('modalTitle');
const modalTextarea = document.getElementById('modalTextarea');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalCloseBtn = document.querySelector('.modal-content .close-btn'); 
const toastContainer = document.getElementById('toast-container');


// --- UI Feedback & Helper Functions ---

function showToast(message, type = 'success') {
    if (!toastContainer) return;
    
    // 1. Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // 2. Add message and close button
    toast.innerHTML = `
        <span>${message}</span>
        <button class="toast-close-btn" style="background: none; border: none; color: white; margin-left: 10px; cursor: pointer;">&times;</button>
    `;
    
    // 3. Handle manual close
    const closeBtn = toast.querySelector('.toast-close-btn');
    const closeToast = () => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    };
    closeBtn.addEventListener('click', closeToast);

    // 4. Append and show
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); }, 10);
    
    // 5. Auto-dismiss after 5 seconds
    setTimeout(closeToast, 5000);
}

function hideModal() {
    if (notesModal) {
        notesModal.style.display = 'none';
        modalTextarea.value = ''; // Clear notes when hiding
    }
}

function getStatusBadge(status) {
    const statusClean = status 
        ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() 
        : 'Pending';
    const statusClass = statusClean.replace(/\s/g, ''); 
    return `<span class="status-badge status-${statusClass}">${statusClean}</span>`;
}

function getLoadingHtml(attempt = 0) {
    // Adding aria-live="polite" for accessibility announcement
    const spinner = `<i class="fas fa-spinner fa-spin" style="margin-right: 10px;"></i>`;
    const attemptMsg = attempt > 0 ? ` (Attempt ${attempt}/${MAX_RETRIES})` : '';
    return `<span aria-live="polite">${spinner} Loading client data...${attemptMsg}</span>`;
}

function showFinalError(message) {
    if (!clientTableBody) return;
    
    // Also show toast notification for better UX
    showToast(`Failed to load data: ${message}`, 'error');
    
    clientTableBody.innerHTML = `
        <tr>
            <td colspan="9" style="text-align:center; color: #ef4444; padding: 20px;">
                <i class="fas fa-exclamation-triangle" style="margin-right: 10px;"></i>
                Failed to load data: ${message}
                <button onclick="fetchAllClients()" style="margin-left: 15px; background: #FFD700; color: black; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </td>
        </tr>
    `;
}

function showNotesModal(action, clientId, newStatus) {
    if (!notesModal || !modalTitle || !modalTextarea || !modalConfirmBtn) return;

    modalTitle.innerText = `Reason for ${action} Action`;
    modalTextarea.placeholder = `Please provide a MANDATORY reason for this ${action} action.`;
    modalTextarea.value = '';

    // UX Improvement: Focus on the textarea when modal opens
    setTimeout(() => { modalTextarea.focus(); }, 10); 

    modalConfirmBtn.onclick = () => {
        const notes = modalTextarea.value.trim();
        if (!notes) {
            showToast('A reason is required to proceed.', 'error');
            return;
        }

        hideModal(); 
        
        if (action === 'Process') {
            processClient(clientId, notes); 
        } else {
            changeClientStatus(clientId, newStatus, notes);
        }
    };
    
    notesModal.style.display = 'block';
}

function renderTable(data) {
    if (!clientTableBody) return;

    clientTableBody.innerHTML = '';
    
    if (data.length === 0) {
        if (noResultsDiv) {
            noResultsDiv.style.display = 'block';
            clientTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No clients found.</td></tr>';
        }
        if (totalsDiv) totalsDiv.style.display = 'none';
        return;
    }

    if (noResultsDiv) noResultsDiv.style.display = 'none';
    
    data.forEach(client => {
        const tr = document.createElement('tr');
        tr.dataset.clientId = client._id; 
        
        // Row Click: Opens modal for Process/View
        tr.onclick = (e) => {
             // CRITICAL: Ensure click target is not a button or part of a button
             if (e.target.closest('button')) return; 
             showNotesModal('Process', client._id, null);
        };

        const currentStatus = client.status || 'Pending';
        
        // SECURITY NOTE: In a real-world scenario, all URL/text inputs injected via innerHTML
        // (like photoUrl, vcardUrl, qrCodeUrl) should be sanitized if they can be
        // user-submitted to prevent XSS. Assuming they are safe, backend-generated URLs here.
        
        tr.innerHTML = `
            <td><img src="${client.photoUrl || 'https://placehold.co/50x50?text=No+Photo'}" alt="Client Photo" class="client-photo" onerror="this.onerror=null; this.src='https://placehold.co/50x50/111/fff?text=No+Photo';" /></td>
            <td>${client.fullName || 'N/A'}</td>
            <td>${client.company || 'N/A'}</td>
            <td>${client.email1 || 'N/A'}</td>
            <td>${client.phone1 || 'N/A'}</td>
            <td>${getStatusBadge(currentStatus)}</td>
            <td>${client.vcardUrl ? `<a href="${client.vcardUrl}" target="_blank" class="text-blue-500 hover:underline">View</a>` : 'N/A'}</td>
            <td>${client.qrCodeUrl ? `<a href="${client.qrCodeUrl}" download="qrcode.png"><img src="${client.qrCodeUrl}" alt="QR Code" class="qr-code mx-auto" /></a>` : 'N/A'}</td>
            <td class="actions-cell">
                ${currentStatus === 'Pending' ? 
                    // event.stopPropagation() is crucial to prevent tr.onclick
                    `<button class="action-btn btn-process" onclick="event.stopPropagation(); showNotesModal('Process', '${client._id}', null)">Process</button>` :
                    `<button class="action-btn btn-view" onclick="event.stopPropagation(); showNotesModal('Process', '${client._id}', null)">View</button>`
                }
                ${currentStatus === 'Active' ? 
                    `<button class="action-btn btn-disable" onclick="event.stopPropagation(); showNotesModal('Disable', '${client._id}', 'Disabled')">Disable</button>` :
                    currentStatus === 'Disabled' ?
                    `<button class="action-btn btn-enable" onclick="event.stopPropagation(); showNotesModal('Enable', '${client._id}', 'Active')">Enable</button>` :
                    ''
                }
                ${currentStatus !== 'Deleted' ?
                    `<button class="action-btn btn-delete" onclick="event.stopPropagation(); showNotesModal('Delete', '${client._id}', 'Deleted')">Delete</button>` :
                    ''
                }
            </td>
        `;
        clientTableBody.appendChild(tr);
    });
    
    updateTotals(data);
}

function updateTotals(data) {
    if (!totalsDiv) return; 
    
    const activeCount = data.filter(client => client.status === 'Active').length;
    const pendingCount = data.filter(client => client.status === 'Pending').length;
    const processedCount = data.filter(client => client.status === 'Processed').length;
    const disabledCount = data.filter(client => client.status === 'Disabled').length;
    const deletedCount = data.filter(client => client.status === 'Deleted').length;
    
    totalsDiv.style.display = 'block';
    totalsDiv.innerHTML = `
        Total Clients: ${data.length} | 
        Active: ${activeCount} | 
        Pending: ${pendingCount} | 
        Processed: ${processedCount} |
        Disabled: ${disabledCount} |
        Deleted: ${deletedCount}
    `;
}

function filterAndSearch() {
    if (!filterInput || !statusFilter) return;

    const searchTerm = filterInput.value.toLowerCase(); 
    const selectedStatus = statusFilter.value;
    
    const filteredData = allClientData.filter(client => {
        const matchesSearch = 
            (client.fullName && client.fullName.toLowerCase().includes(searchTerm)) ||
            (client.phone1 && client.phone1.toLowerCase().includes(searchTerm)) ||
            (client.email1 && client.email1.toLowerCase().includes(searchTerm)) ||
            (client.company && client.company.toLowerCase().includes(searchTerm)); 
        
        const matchesStatus = selectedStatus === '' || client.status === selectedStatus;
        
        return matchesSearch && matchesStatus;
    });
    
    renderTable(filteredData);
}

function exportToCsv() {
    if (allClientData.length === 0) {
        showToast("No client data loaded to export.", 'error');
        return;
    }
    
    const headers = ["ID", "Name", "Company", "Email", "Phone", "Status", "vCard URL", "QR Code URL"];
    
    const data = allClientData.map(client => [
        client._id || '',
        client.fullName || '',
        client.company || '',
        client.email1 || '',
        client.phone1 || '',
        client.status || 'Pending',
        client.vcardUrl || '',
        client.qrCodeUrl || ''
    ]);

    let csvContent = headers.join(",") + "\n";
    data.forEach(row => {
        const rowString = row.map(field => `"${field.toString().replace(/"/g, '""')}"`).join(",");
        csvContent += rowString + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `smartcardlink_clients_${new Date().toISOString().slice(0, 10)}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast(`Successfully generated and downloaded CSV for ${allClientData.length} clients.`);
}

async function changeClientStatus(clientId, newStatus, notes) {
    if (!API_ROOT) return showToast('Configuration Error: API root not defined.', 'error');

    try {
        const response = await fetch(`${API_ROOT}/clients/${clientId}/status/${newStatus}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes }) 
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
        }
        
        showToast(`Status updated to ${newStatus}. Reason: ${notes.substring(0, 30)}...`);
        
        const row = document.querySelector(`tr[data-client-id="${clientId}"]`);
        if (row) {
            row.classList.add('row-success');
            setTimeout(() => { row.classList.remove('row-success'); }, 2000); 
        }

        await fetchAllClients(); 
    } catch (error) {
        console.error("Error changing client status:", error);
        showToast(`Failed to change status: ${error.message}`, 'error');
    }
}

async function fetchAllClients() {
    if (isFetching || !API_ROOT) return;
    
    isFetching = true;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (clientTableBody) clientTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;">${getLoadingHtml(attempt)}</td></tr>`;
        
        try {
            // CORRECTION: Use the Admin API route /admin/clients which should exist on the backend.
            const response = await fetch(`${API_ROOT}/admin/clients`);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Server responded with error status.' }));
                throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
            }
            
            allClientData = await response.json();
            renderTable(allClientData);
            isFetching = false;
            return; 

        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error);
            
            if (attempt === MAX_RETRIES) {
                // Final failure: show both inline error and toast
                showFinalError(error.message); 
                isFetching = false;
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1500 * attempt)); 
        }
    }
}

function processClient(clientId, notes = 'No reason provided') {
    // Log notes for auditing purposes (e.g., in a separate audit service or log file)
    console.log(`Processing client ${clientId}. Admin notes: ${notes}`); 
    showToast(`Opening client form for ${clientId}. Notes logged.`);

    const url = new URL(ADMIN_FORM_URL, window.location.href);
    url.searchParams.set('id', clientId);
    window.open(url.toString(), '_blank');
}

// --- Event Listeners ---
if (searchBtn) searchBtn.addEventListener('click', filterAndSearch);
if (filterInput) filterInput.addEventListener('keyup', filterAndSearch); 
if (statusFilter) statusFilter.addEventListener('change', filterAndSearch);
if (exportBtn) exportBtn.addEventListener('click', exportToCsv);

// Modal close listeners
if (modalCloseBtn) modalCloseBtn.addEventListener('click', hideModal);
if (notesModal) {
    window.addEventListener('click', (event) => {
        if (event.target === notesModal) hideModal();
    });
}

// --- Initialization ---
async function init() {
    if (!API_ROOT) {
         console.error('CRITICAL: API_ROOT is not configured. Check the SCL_CONFIG block in adminDashboard.html.');
         if (clientTableBody) clientTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: red;">API Configuration Missing. Check Console.</td></tr>';
         return;
    }

    if (dashboardContainer) dashboardContainer.style.display = 'block';
    
    await fetchAllClients();
}

document.addEventListener('DOMContentLoaded', init);

// Expose functions to the global scope for onclick attributes in HTML
window.changeClientStatus = changeClientStatus;
window.processClient = processClient;
window.fetchAllClients = fetchAllClients;
window.exportToCsv = exportToCsv;
window.showNotesModal = showNotesModal;