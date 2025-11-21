// C:\Users\ADMIN\Desktop\smartcardlink-app\public\js\adminDashboard.js

// --- Global Variables ---
let allClientData = [];
// CRITICAL: Hardcode the production URL here as per the blueprint
const API_URL = window.RENDER_API_BASE_URL;

// --- DOM Elements ---
const loginCard = document.getElementById('loginCard');
const adminLoginForm = document.getElementById('adminLoginForm');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const dashboardContainer = document.getElementById('dashboardContainer');
const clientTableBody = document.getElementById('clientTableBody');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const exportBtn = document.getElementById('exportBtn');
const noResultsDiv = document.getElementById('noResults');
const totalsDiv = document.getElementById('totals');
const searchBtn = document.getElementById('searchBtn'); // Assuming this exists for consistency

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

function getStatusBadge(status) {
    const statusClass = status ? status.toLowerCase() : 'pending';
    return `<span class="status-badge status-${status}">${status || 'Pending'}</span>`;
}

function renderTable(data) {
  clientTableBody.innerHTML = '';
  if (data.length === 0) {
    noResultsDiv.style.display = 'block';
    totalsDiv.style.display = 'none';
    return;
  }

  noResultsDiv.style.display = 'none';
  
  data.forEach(client => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${client.photoUrl || 'https://placehold.co/50x50?text=No+Photo'}" alt="Client Photo" class="client-photo" /></td>
      <td>${client.fullName || 'N/A'}</td>
      <td>${client.company || 'N/A'}</td>
      <td>${client.email1 || 'N/A'}</td>
      <td>${client.phone1 || 'N/A'}</td>
      <td>${getStatusBadge(client.status)}</td>
      <td>${client.vcardUrl ? `<a href="${client.vcardUrl}" target="_blank" class="text-blue-500 hover:underline">View</a>` : 'N/A'}</td>
      <td>${client.qrCodeUrl ? `<a href="${client.qrCodeUrl}" download="qrcode.png"><img src="${client.qrCodeUrl}" alt="QR Code" class="qr-code mx-auto" /></a>` : 'N/A'}</td>
      <td>
        ${client.status === 'Pending' ? 
            `<button class="action-btn btn-process" onclick="processClient('${client._id}')">Process</button>` :
            `<button class="action-btn btn-view" onclick="processClient('${client._id}')">View</button>`
        }
        ${client.status === 'Active' ? 
            `<button class="action-btn btn-disable" onclick="changeClientStatus('${client._id}', 'Disabled')">Disable</button>` :
            `<button class="action-btn btn-enable" onclick="changeClientStatus('${client._id}', 'Active')">Enable</button>`
        }
        <button class="action-btn btn-delete" onclick="changeClientStatus('${client._id}', 'Deleted')">Delete</button>
      </td>
    `;
    clientTableBody.appendChild(tr);
  });
  
  updateTotals(data);
}

function updateTotals(data) {
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
    const searchTerm = searchInput.value.toLowerCase();
    const selectedStatus = statusFilter.value;
    
    const filteredData = allClientData.filter(client => {
        const matchesSearch = 
            (client.fullName && client.fullName.toLowerCase().includes(searchTerm)) ||
            (client.phone1 && client.phone1.toLowerCase().includes(searchTerm)) ||
            (client.email1 && client.email1.toLowerCase().includes(searchTerm));
        
        const matchesStatus = selectedStatus === '' || client.status === selectedStatus;
        
        return matchesSearch && matchesStatus;
    });
    
    renderTable(filteredData);
}

async function changeClientStatus(clientId, newStatus) {
    if (!confirm(`Are you sure you want to change this client's status to '${newStatus}'?`)) {
        return;
    }

    const token = getToken();
    try {
        const response = await fetch(`${API_BASE_URL}/clients/${clientId}/status/${newStatus}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                alert('Session expired or unauthorized. Please log in.');
                removeToken();
                window.location.reload();
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        alert(`Status updated to ${newStatus}.`);
        await fetchAllClients(); // Re-fetch and re-render the data
    } catch (error) {
        console.error("Error changing client status:", error);
        alert(`Failed to change status: ${error.message}`);
    }
}

async function fetchAllClients() {
  const token = getToken();
  if (!token) {
    // If no token, show login page. The init() function handles this already.
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/clients/all`, {
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
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    allClientData = await response.json();
    renderTable(allClientData);
  } catch (error) {
    console.error("Error fetching all clients:", error);
    alert(`Failed to fetch clients: ${error.message}`);
  }
}

// Function to handle the Process/View button click
function processClient(clientId) {
    // This function will open the Admin Form in a new tab
    // and pass the client ID as a URL parameter.
    const url = `/admin_form.html?id=${clientId}`;
    window.open(url, '_blank');
}

// --- Event Listeners ---
adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!response.ok) {
            throw new Error('Authentication failed');
        }
        
        const data = await response.json();
        saveToken(data.token);
        
        loginCard.style.display = 'none';
        dashboardContainer.style.display = 'block';
        
        fetchAllClients();
    } catch (error) {
        alert('Login failed. Please check your credentials.');
        console.error('Login error:', error);
    }
});

searchBtn.addEventListener('click', filterAndSearch);
searchInput.addEventListener('keyup', filterAndSearch);
statusFilter.addEventListener('change', filterAndSearch);
exportBtn.addEventListener('click', exportToCsv);

// --- Initialization ---
async function init() {
    if (getToken()) {
        loginCard.style.display = 'none';
        dashboardContainer.style.display = 'block';
        await fetchAllClients();
    } else {
        loginCard.style.display = 'block';
        dashboardContainer.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', init);

// Expose functions to the global scope for onclick attributes
window.changeClientStatus = changeClientStatus;
window.processClient = processClient;
window.exportToCsv = exportToCsv;