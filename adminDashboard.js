// C:\Users\ADMIN\Desktop\smartcardlink-app\public\js\adminDashboard.js

// --- Global Variables ---
let allClientData = [];
// CRITICAL FIX: Use the consistent API_ROOT defined in adminDashboard.html config block (Finding F).
const API_ROOT = window.SCL_CONFIG?.API_ROOT || `${window.location.origin}/api`;
const ADMIN_FORM_URL = window.SCL_CONFIG?.ADMIN_FORM_URL || 'admin-form.html';

// --- DOM Elements (Defensive access for elements that might be missing - Finding D) ---
const loginCard = document.getElementById('loginCard');
const adminLoginForm = document.getElementById('adminLoginForm');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const dashboardContainer = document.getElementById('dashboardContainer');
const clientTableBody = document.getElementById('clientTableBody');
// FIX: Using 'filterInput' to match the corrected HTML ID
const filterInput = document.getElementById('filterInput'); 
const statusFilter = document.getElementById('statusFilter');
const exportBtn = document.getElementById('exportBtn');
const noResultsDiv = document.getElementById('noResults'); 
const totalsDiv = document.getElementById('totals');       
const searchBtn = document.getElementById('searchBtn');

// --- Helper Functions ---
function getToken() {
    return localStorage.getItem('adminToken');
}

function saveToken(token) {
    localStorage.setItem('adminToken', token);
}

function removeToken() {
    localStorage.removeItem('adminToken');
}

// FIX (Finding C): Standardize status badge formatting for consistent CSS class names.
function getStatusBadge(status) {
    // Ensures status is not null/undefined and capitalizes the first letter for consistency (e.g., 'pending' -> 'Pending')
    const statusClean = status 
        ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() 
        : 'Pending';
    
    // The class name only strips whitespace if any exists (e.g., 'In Review' -> 'InReview')
    const statusClass = statusClean.replace(/\s/g, ''); 
    
    return `<span class="status-badge status-${statusClass}">${statusClean}</span>`;
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
        // Add click listener to row for opening the client form (Process/View logic)
        tr.onclick = (e) => {
             // Only open if the click target wasn't an action button
             if (e.target.tagName !== 'BUTTON' && e.target.parentElement.tagName !== 'BUTTON') {
                 processClient(client._id);
             }
        };

        tr.innerHTML = `
            <td><img src="${client.photoUrl || 'https://placehold.co/50x50?text=No+Photo'}" alt="Client Photo" class="client-photo" onerror="this.onerror=null; this.src='https://placehold.co/50x50/111/fff?text=No+Photo';" /></td>
            <td>${client.fullName || 'N/A'}</td>
            <td>${client.company || 'N/A'}</td>
            <td>${client.email1 || 'N/A'}</td>
            <td>${client.phone1 || 'N/A'}</td>
            <td>${getStatusBadge(client.status)}</td>
            <td>${client.vcardUrl ? `<a href="${client.vcardUrl}" target="_blank" class="text-blue-500 hover:underline">View</a>` : 'N/A'}</td>
            <td>${client.qrCodeUrl ? `<a href="${client.qrCodeUrl}" download="qrcode.png"><img src="${client.qrCodeUrl}" alt="QR Code" class="qr-code mx-auto" /></a>` : 'N/A'}</td>
            <td class="actions-cell">
                ${client.status === 'Pending' ? 
                    `<button class="action-btn btn-process" onclick="event.stopPropagation(); processClient('${client._id}')">Process</button>` :
                    `<button class="action-btn btn-view" onclick="event.stopPropagation(); processClient('${client._id}')">View</button>`
                }
                ${client.status === 'Active' ? 
                    `<button class="action-btn btn-disable" onclick="event.stopPropagation(); changeClientStatus('${client._id}', 'Disabled')">Disable</button>` :
                    client.status === 'Disabled' ?
                    `<button class="action-btn btn-enable" onclick="event.stopPropagation(); changeClientStatus('${client._id}', 'Active')">Enable</button>` :
                    ''
                }
                ${client.status !== 'Deleted' ?
                    `<button class="action-btn btn-delete" onclick="event.stopPropagation(); changeClientStatus('${client._id}', 'Deleted')">Delete</button>` :
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
        // ENHANCEMENT (Finding B): Added company to the search filter
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

// FIX (Finding A): Implemented placeholder function for export button
function exportToCsv() {
    if (allClientData.length === 0) {
        alert("No client data loaded to export.");
        return;
    }
    
    // Placeholder implementation (Server-side export is the best practice for production)
    alert(`Initiating export of ${allClientData.length} client records... This functionality is currently a client-side placeholder. For a scalable and secure solution, it is recommended to implement server-side CSV generation.`);
    console.log("Client data available for export:", allClientData);
    
    // A fully featured implementation would involve:
    // 1. Fetching all data from an API endpoint designed for export.
    // 2. Creating a Blob or using the response header to trigger a download.
}

async function changeClientStatus(clientId, newStatus, notes = 'Admin dashboard action') {
    if (!API_ROOT) return alert('Configuration Error: API root not defined.');

    if (!confirm(`Are you sure you want to change this client's status to '${newStatus}'?`)) {
        return;
    }

    const token = getToken();
    if (!token) {
        alert('Unauthorized. Please log in.');
        removeToken();
        window.location.reload();
        return;
    }
    
    try {
        // FIX: Using API_ROOT
        const response = await fetch(`${API_ROOT}/clients/${clientId}/status/${newStatus}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ notes })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                alert('Session expired or unauthorized. Please log in.');
                removeToken();
                window.location.reload();
                return;
            }
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
        }
        
        alert(`Status updated to ${newStatus}.`);
        await fetchAllClients(); 
    } catch (error) {
        console.error("Error changing client status:", error);
        alert(`Failed to change status: ${error.message}`);
    }
}

async function fetchAllClients() {
    if (!API_ROOT) return;

    const token = getToken();
    if (!token) return; // Login required, init() will handle it.
    
    if (clientTableBody) clientTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Loading client data...</td></tr>';
    
    try {
        // FIX: Using API_ROOT
        const response = await fetch(`${API_ROOT}/clients/all`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            alert('Session expired or unauthorized. Please log in.');
            removeToken();
            window.location.reload();
            return;
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
        }
        
        allClientData = await response.json();
        renderTable(allClientData);
    } catch (error) {
        console.error("Error fetching all clients:", error);
        if (clientTableBody) {
             clientTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: #ef4444;">Failed to load data. Please check network connection and API_ROOT configuration.</td></tr>';
        }
        alert(`Failed to fetch clients: ${error.message}`);
    }
}

function processClient(clientId) {
    // Uses the robust ADMIN_FORM_URL configuration
    const url = new URL(ADMIN_FORM_URL, window.location.href);
    url.searchParams.set('id', clientId);
    window.open(url.toString(), '_blank');
}

async function adminLogin(email, password) {
    if (!API_ROOT) return alert('Configuration Error: API root not defined.');

    try {
        // FIX: Using API_ROOT
        const response = await fetch(`${API_ROOT}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Authentication failed');
        }
        
        const data = await response.json();
        saveToken(data.token);
        
        // Defensive check before manipulating styles
        if (loginCard) loginCard.style.display = 'none';
        if (dashboardContainer) dashboardContainer.style.display = 'block';
        
        await fetchAllClients();
    } catch (error) {
        alert('Login failed. Please check your credentials.');
        console.error('Login error:', error);
    }
}

// --- Event Listeners ---
if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Defensive check for input elements
        if (!emailInput || !passwordInput) {
            console.error('Login input fields are missing from the HTML.');
            return;
        }
        const email = emailInput.value;
        const password = passwordInput.value;
        await adminLogin(email, password);
    });
}

if (searchBtn) searchBtn.addEventListener('click', filterAndSearch);
if (filterInput) filterInput.addEventListener('keyup', filterAndSearch); 
if (statusFilter) statusFilter.addEventListener('change', filterAndSearch);
if (exportBtn) exportBtn.addEventListener('click', exportToCsv);

// --- Initialization ---
async function init() {
    // Check for critical configuration early
    if (!API_ROOT) {
         console.error('CRITICAL: API_ROOT is not configured. Check the SCL_CONFIG block in adminDashboard.html.');
         if (clientTableBody) clientTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: red;">API Configuration Missing. Check Console.</td></tr>';
         return;
    }

    if (getToken()) {
        // Show dashboard if token exists
        if (loginCard) loginCard.style.display = 'none';
        if (dashboardContainer) dashboardContainer.style.display = 'block';
        await fetchAllClients();
    } else {
        // Show login page
        if (loginCard) loginCard.style.display = 'block';
        if (dashboardContainer) dashboardContainer.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', init);

// Expose functions to the global scope for onclick attributes in HTML
window.changeClientStatus = changeClientStatus;
window.processClient = processClient;
window.exportToCsv = exportToCsv;