// C:\Users\ADMIN\Desktop\smartcardlink-app\public\js\dashboard.js

// --- Global Variables ---
let allClientData = [];
// CRITICAL: Hardcode the production URL here. This file is on the frontend.
const API_URL = window.RENDER_API_BASE_URL;

// --- DOM Elements ---
const clientTableBody = document.getElementById('clientTableBody');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const statusFilter = document.getElementById('statusFilter');
const exportBtn = document.getElementById('exportBtn');
const noResultsDiv = document.getElementById('noResults');
const totalsDiv = document.getElementById('totals');

// --- Helper Functions ---
function getToken() {
  return localStorage.getItem('token');
}

function getStatusBadge(status) {
  const statusClass = status ? status.toLowerCase() : 'pending';
  return `<span class="status-badge status-${statusClass}">${status || 'Pending'}</span>`;
}

function renderTable(data) {
  clientTableBody.innerHTML = '';
  if (data.length === 0) {
    noResultsDiv.style.display = 'block';
    totalsDiv.style.display = 'none';
    return;
  }

  noResultsDiv.style.display = 'none';
  
  data.forEach((client, index) => {
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

        if (response.status === 401) {
            alert('Session expired or unauthorized. Please log in.');
            window.location.href = '/admin-login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        alert(`Status updated to ${newStatus}.`);
        await fetchAllClients(); // Re-fetch and re-render the data
    } catch (error) {
        console.error("Error changing client status:", error);
        alert(`Failed to change status: ${error.message}`);
    }
}

function exportToCsv() {
    const tableRows = clientTableBody.querySelectorAll('tr');
    if (tableRows.length === 0) {
        alert("No data to export.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = ["Photo", "Full Name", "Company", "Email", "Phone", "Status", "vCard Link", "QR Code", "Actions"];
    csvContent += headers.join(",") + "\n";

    tableRows.forEach(row => {
        const rowData = Array.from(row.querySelectorAll('td')).map(cell => {
            let text = cell.innerText.trim();
            if (text.includes(',') || text.includes('"')) {
                text = `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        });
        csvContent += rowData.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "client_register.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function fetchAllClients() {
  const token = getToken();
  if (!token) {
    alert('Not authenticated. Please log in.');
    window.location.href = '/staff-login.html';
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/clients/staff`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.status === 401) {
      alert('Session expired or unauthorized. Please log in.');
      window.location.href = '/staff-login.html';
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

// --- Initialization ---
function init() {
  if (getToken()) {
    fetchAllClients();
  } else {
    window.location.href = '/staff-login.html';
  }

  searchBtn.addEventListener('click', filterAndSearch);
  searchInput.addEventListener('keyup', filterAndSearch);
  statusFilter.addEventListener('change', filterAndSearch);
  exportBtn.addEventListener('click', exportToCsv);
}

document.addEventListener('DOMContentLoaded', init);