(function () {
  const API_BASE = (() => {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || window.location.protocol === 'file:') {
      return 'http://localhost:8080';
    }
    return 'https://smartcardlink-api.onrender.com';
  })();

  const STATUS_ORDER = ['Pending', 'Processed', 'Active', 'Disabled', 'Suspended', 'Deleted'];
  const DEFAULT_VISIBLE_STATUSES = ['Pending', 'Processed', 'Active', 'Disabled', 'Suspended'];

  const els = {
    tableBody: document.getElementById('clientsTableBody') || document.getElementById('tableBody') || document.querySelector('tbody'),
    searchInput: document.getElementById('searchInput') || document.getElementById('searchBox') || document.querySelector('input[type="search"]'),
    statusFilter: document.getElementById('statusFilter') || document.getElementById('filterStatus'),
    refreshBtn: document.getElementById('refreshBtn') || document.getElementById('reloadBtn'),
    exportBtn: document.getElementById('exportBtn') || document.getElementById('downloadCsvBtn'),
    totalCount: document.getElementById('totalCount'),
    emptyState: document.getElementById('emptyState') || document.getElementById('noDataMessage'),
    loadingState: document.getElementById('loadingState'),
  };

  let allClients = [];
  let renderedClients = [];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeStatus(value) {
    const raw = String(value || '').trim().toLowerCase();
    const match = STATUS_ORDER.find((status) => status.toLowerCase() === raw);
    return match || 'Pending';
  }

  function badgeClass(status) {
    switch (status) {
      case 'Pending': return 'status-badge pending';
      case 'Processed': return 'status-badge processed';
      case 'Active': return 'status-badge active';
      case 'Disabled':
      case 'Suspended': return 'status-badge suspended';
      case 'Deleted': return 'status-badge deleted';
      default: return 'status-badge';
    }
  }

  function updateCounters() {
    if (els.totalCount) {
      els.totalCount.textContent = String(renderedClients.length);
    }
    if (els.emptyState) {
      els.emptyState.style.display = renderedClients.length ? 'none' : 'block';
    }
  }

  function openAdminForm(clientId) {
    window.location.href = 'admin-form.html?id=' + encodeURIComponent(clientId);
  }

  async function callApi(url, options) {
    const response = await fetch(API_BASE + url, options || {});
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.message || 'Request failed');
    }
    return json;
  }

  async function updateStatus(clientId, nextStatus, notes) {
    return callApi('/api/clients/' + encodeURIComponent(clientId) + '/status/' + encodeURIComponent(nextStatus), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes || 'Updated from dashboard' }),
    });
  }

  async function deleteClient(clientId, notes) {
    return callApi('/api/clients/' + encodeURIComponent(clientId), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes }),
    });
  }

  function clientMatchesSearch(client, searchTerm) {
    if (!searchTerm) return true;
    const haystack = [
      client.fullName,
      client.company,
      client.email1,
      client.phone1,
      client.slug,
      client.status,
    ].join(' ').toLowerCase();
    return haystack.includes(searchTerm);
  }

  function getSelectedStatus() {
    if (!els.statusFilter) return 'all';
    return String(els.statusFilter.value || 'all');
  }

  function applyFilters() {
    const statusValue = getSelectedStatus();
    const searchTerm = (els.searchInput ? els.searchInput.value : '').trim().toLowerCase();

    renderedClients = allClients.filter((client) => {
      const status = normalizeStatus(client.status);
      const statusAllowed = statusValue === 'all'
        ? DEFAULT_VISIBLE_STATUSES.includes(status)
        : status === normalizeStatus(statusValue);
      return statusAllowed && clientMatchesSearch(client, searchTerm);
    });

    renderTable();
    updateCounters();
  }

  function renderTable() {
    if (!els.tableBody) return;
    els.tableBody.innerHTML = '';

    renderedClients.forEach((client, index) => {
      const status = normalizeStatus(client.status);
      const clientId = client._id || client.id || '';
      const tr = document.createElement('tr');
      tr.innerHTML = ''
        + '<td>' + (index + 1) + '</td>'
        + '<td>' + escapeHtml(client.fullName || '') + '</td>'
        + '<td>' + escapeHtml(client.company || '') + '</td>'
        + '<td>' + escapeHtml(client.email1 || '') + '</td>'
        + '<td>' + escapeHtml(client.phone1 || '') + '</td>'
        + '<td><span class="' + badgeClass(status) + '">' + escapeHtml(status) + '</span></td>'
        + '<td>'
        +   '<button type="button" class="process-btn" data-id="' + escapeHtml(clientId) + '">Process</button> '
        +   (status === 'Active'
              ? '<button type="button" class="disable-btn" data-id="' + escapeHtml(clientId) + '">Disable</button> '
              : (status === 'Disabled' || status === 'Suspended')
                ? '<button type="button" class="enable-btn" data-id="' + escapeHtml(clientId) + '">Enable</button> '
                : '')
        +   '<button type="button" class="delete-btn" data-id="' + escapeHtml(clientId) + '">Delete</button>'
        + '</td>';
      els.tableBody.appendChild(tr);
    });

    els.tableBody.querySelectorAll('.process-btn').forEach((btn) => {
      btn.addEventListener('click', () => openAdminForm(btn.dataset.id));
    });

    els.tableBody.querySelectorAll('.disable-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reason = window.prompt('Enter reason for disabling this client:');
        if (!reason || !reason.trim()) return;
        try {
          await updateStatus(btn.dataset.id, 'Disabled', reason.trim());
          await fetchClients();
        } catch (error) {
          window.alert(error.message);
        }
      });
    });

    els.tableBody.querySelectorAll('.enable-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reason = window.prompt('Enter reason for enabling this client:');
        if (!reason || !reason.trim()) return;
        try {
          await updateStatus(btn.dataset.id, 'Active', reason.trim());
          await fetchClients();
        } catch (error) {
          window.alert(error.message);
        }
      });
    });

    els.tableBody.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reason = window.prompt('Enter delete reason:');
        if (!reason || !reason.trim()) {
          window.alert('Delete reason is required.');
          return;
        }
        const ok = window.confirm('Delete this client?');
        if (!ok) return;
        try {
          await deleteClient(btn.dataset.id, reason.trim());
          await fetchClients();
        } catch (error) {
          window.alert(error.message);
        }
      });
    });
  }

  async function fetchClients() {
    try {
      if (els.loadingState) els.loadingState.style.display = 'block';
      const json = await callApi('/api/admin/clients');
      allClients = Array.isArray(json.data) ? json.data : [];
      applyFilters();
    } catch (error) {
      window.alert(error.message);
    } finally {
      if (els.loadingState) els.loadingState.style.display = 'none';
    }
  }

  function exportCsv() {
    const rows = [
      ['Full Name', 'Company', 'Email', 'Phone', 'Status', 'Slug'],
      ...renderedClients.map((client) => [
        client.fullName || '',
        client.company || '',
        client.email1 || '',
        client.phone1 || '',
        normalizeStatus(client.status),
        client.slug || '',
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => {
      const value = String(cell == null ? '' : cell);
      return '"' + value.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'smartcardlink-clients.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function initStatusFilter() {
    if (!els.statusFilter) return;
    if (!els.statusFilter.options.length) {
      ['all', ...STATUS_ORDER].forEach((status) => {
        const option = document.createElement('option');
        option.value = status === 'all' ? 'all' : status;
        option.textContent = status === 'all' ? 'All Open Clients' : status;
        els.statusFilter.appendChild(option);
      });
    }

    const currentValues = Array.from(els.statusFilter.options).map((option) => String(option.value || '').toLowerCase());
    if (!currentValues.includes('processed')) {
      const option = document.createElement('option');
      option.value = 'Processed';
      option.textContent = 'Processed';
      els.statusFilter.appendChild(option);
    }

    if (!els.statusFilter.value) {
      els.statusFilter.value = 'all';
    }
  }

  function wireEvents() {
    if (els.searchInput) {
      els.searchInput.addEventListener('input', applyFilters);
    }
    if (els.statusFilter) {
      els.statusFilter.addEventListener('change', applyFilters);
    }
    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', fetchClients);
    }
    if (els.exportBtn) {
      els.exportBtn.addEventListener('click', exportCsv);
    }
  }

  initStatusFilter();
  wireEvents();
  fetchClients();
})();