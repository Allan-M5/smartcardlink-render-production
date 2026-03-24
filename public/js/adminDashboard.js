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
    tableBody: document.getElementById('clientsTableBody'),
    searchInput: document.getElementById('searchInput'),
    statusFilter: document.getElementById('statusFilter'),
    refreshBtn: document.getElementById('refreshBtn'),
    resetBtn: document.getElementById('resetBtn'),
    exportBtn: document.getElementById('exportBtn'),
    emptyState: document.getElementById('emptyState'),
    loadingState: document.getElementById('loadingState'),
    refreshNote: document.getElementById('refreshNote'),
    toastContainer: document.getElementById('toastContainer'),
    modal: document.getElementById('actionModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtext: document.getElementById('modalSubtext'),
    actionReason: document.getElementById('actionReason'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalConfirmBtn: document.getElementById('modalConfirmBtn'),
    statVisible: document.getElementById('statVisible'),
    statPending: document.getElementById('statPending'),
    statProcessed: document.getElementById('statProcessed'),
    statActive: document.getElementById('statActive'),
    statDisabled: document.getElementById('statDisabled')
  };

let allClients = [];
let renderedClients = [];
let autoRefreshTimer = null;
let isFetchingClients = false;
let modalState = {
    clientId: null,
    nextStatus: null,
    actionLabel: '',
    requireReason: true,
    deleteAction: false
  };

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

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return new Intl.DateTimeFormat('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function getPackageLabel(client) {
    return String(client.packageType || 'standard').trim().toLowerCase() === 'pro' ? 'PRO' : 'Standard';
  }

  function getPackageClass(client) {
    return getPackageLabel(client) === 'PRO'
      ? 'package-badge package-pro'
      : 'package-badge package-standard';
  }

  function getStatusClass(status) {
    switch (status) {
      case 'Pending':
        return 'status-badge status-pending';
      case 'Processed':
        return 'status-badge status-processed';
      case 'Active':
        return 'status-badge status-active';
      case 'Disabled':
        return 'status-badge status-disabled';
      case 'Suspended':
        return 'status-badge status-suspended';
      case 'Deleted':
        return 'status-badge status-deleted';
      default:
        return 'status-badge';
    }
  }

  function clientMatchesSearch(client, searchTerm) {
    if (!searchTerm) return true;

    const haystack = [
      client.fullName,
      client.company,
      client.email1,
      client.phone1,
      client.status,
      client.packageType
    ].join(' ').toLowerCase();

    return haystack.includes(searchTerm);
  }

  function showToast(title, message, type) {
    if (!els.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type || 'success'}`;
    toast.innerHTML = `
      <div>
        <strong>${escapeHtml(title)}</strong>
        <div style="margin-top:4px;">${escapeHtml(message)}</div>
      </div>
    `;

    els.toastContainer.prepend(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    window.setTimeout(() => {
      toast.classList.remove('show');
      window.setTimeout(() => toast.remove(), 240);
    }, 2600);
  }

  function updateRefreshNote() {
    if (!els.refreshNote) return;
    els.refreshNote.textContent = `Last sync: ${formatDateTime(new Date())}`;
  }

  function updateCounters() {
    const counts = {
      Pending: 0,
      Processed: 0,
      Active: 0,
      Disabled: 0,
      Suspended: 0,
      Deleted: 0
    };

    renderedClients.forEach((client) => {
      const status = normalizeStatus(client.status);
      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
    });

    if (els.statVisible) els.statVisible.textContent = String(renderedClients.length);
    if (els.statPending) els.statPending.textContent = String(counts.Pending);
    if (els.statProcessed) els.statProcessed.textContent = String(counts.Processed);
    if (els.statActive) els.statActive.textContent = String(counts.Active);
    if (els.statDisabled) els.statDisabled.textContent = String(counts.Disabled + counts.Suspended + counts.Deleted);
  }

  function updatePanels() {
    if (els.emptyState) {
      els.emptyState.style.display = renderedClients.length ? 'none' : 'block';
    }
  }

  function closeMenus() {
    document.querySelectorAll('.action-menu.show').forEach((menu) => {
      menu.classList.remove('show');
    });
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
      body: JSON.stringify({
        notes: notes || 'Updated from admin dashboard'
      })
    });
  }

  async function deleteClient(clientId, notes) {
    return callApi('/api/clients/' + encodeURIComponent(clientId), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: notes || 'Deleted from admin dashboard'
      })
    });
  }

  function openActionModal(config) {
    modalState = {
      clientId: config.clientId,
      nextStatus: config.nextStatus || null,
      actionLabel: config.actionLabel || 'Confirm Action',
      requireReason: config.requireReason !== false,
      deleteAction: !!config.deleteAction
    };

    if (els.modalTitle) {
      els.modalTitle.textContent = config.title || 'Confirm Action';
    }

    if (els.modalSubtext) {
      els.modalSubtext.textContent = config.subtext || 'Please review and confirm this account action.';
    }

    if (els.actionReason) {
      els.actionReason.value = '';
      els.actionReason.placeholder = config.placeholder || 'Enter admin note...';
    }

    if (els.modal) {
      els.modal.classList.add('show');
    }
  }

  function closeActionModal() {
    if (els.modal) {
      els.modal.classList.remove('show');
    }

    modalState = {
      clientId: null,
      nextStatus: null,
      actionLabel: '',
      requireReason: true,
      deleteAction: false
    };
  }

  async function confirmModalAction() {
    const reason = String((els.actionReason && els.actionReason.value) || '').trim();

    if (modalState.requireReason && !reason) {
      showToast('Reason needed', 'Please enter an admin note before continuing.', 'error');
      if (els.actionReason) {
        els.actionReason.focus();
      }
      return;
    }

    if (!modalState.clientId) return;

    try {
      if (els.modalConfirmBtn) {
        els.modalConfirmBtn.disabled = true;
      }

      if (modalState.deleteAction) {
        await deleteClient(modalState.clientId, reason);
        showToast('Client deleted', 'The client record was deleted successfully.', 'success');
      } else {
        await updateStatus(modalState.clientId, modalState.nextStatus, reason);
        showToast('Status updated', `${modalState.actionLabel} completed successfully.`, 'success');
      }

      closeActionModal();
      await fetchClients();
    } catch (error) {
      showToast('Action failed', error.message || 'Unable to complete that action.', 'error');
    } finally {
      if (els.modalConfirmBtn) {
        els.modalConfirmBtn.disabled = false;
      }
    }
  }

  function renderTable() {
    if (!els.tableBody) return;

    els.tableBody.innerHTML = '';

    renderedClients.forEach((client) => {
      const status = normalizeStatus(client.status);
      const clientId = client._id || client.id || '';
      const company = client.company || '—';
      const email = client.email1 || '—';
      const phone = client.phone1 || '—';
      const created = client.createdAt || client.createdDate || client.dateCreated || '';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div class="client-name">${escapeHtml(client.fullName || 'Unnamed Client')}</div>
          <div class="client-sub">${escapeHtml(client.title || client.jobTitle || 'Client Record')}</div>
        </td>
        <td>${escapeHtml(company)}</td>
        <td>${escapeHtml(email)}</td>
        <td>${escapeHtml(phone)}</td>
        <td>
          <span class="${getPackageClass(client)}">${escapeHtml(getPackageLabel(client))}</span>
        </td>
        <td class="created-cell">${escapeHtml(formatDate(created))}</td>
        <td>
          <span class="${getStatusClass(status)}">${escapeHtml(status)}</span>
        </td>
        <td>
          <div class="menu-wrap">
            <button type="button" class="menu-btn" data-menu-btn="${escapeHtml(clientId)}" aria-label="Open actions">
              <i class="fas fa-ellipsis"></i>
            </button>
            <div class="action-menu" data-menu="${escapeHtml(clientId)}">
              <button type="button" data-action="process" data-id="${escapeHtml(clientId)}">
                <i class="fas fa-pen-to-square"></i>
                <span>Open Admin Form</span>
              </button>

              ${status === 'Active' ? `
                <button type="button" data-action="disable" data-id="${escapeHtml(clientId)}">
                  <i class="fas fa-user-slash"></i>
                  <span>Disable Client</span>
                </button>
              ` : ''}

              ${(status === 'Disabled' || status === 'Suspended') ? `
                <button type="button" data-action="enable" data-id="${escapeHtml(clientId)}">
                  <i class="fas fa-user-check"></i>
                  <span>Enable Client</span>
                </button>
              ` : ''}

              ${status !== 'Processed' ? `
                <button type="button" data-action="processed" data-id="${escapeHtml(clientId)}">
                  <i class="fas fa-list-check"></i>
                  <span>Mark as Processed</span>
                </button>
              ` : ''}

              ${status !== 'Active' ? `
                <button type="button" data-action="active" data-id="${escapeHtml(clientId)}">
                  <i class="fas fa-bolt"></i>
                  <span>Mark as Active</span>
                </button>
              ` : ''}

              <button type="button" class="danger" data-action="delete" data-id="${escapeHtml(clientId)}">
                <i class="fas fa-trash"></i>
                <span>Delete Client</span>
              </button>
            </div>
          </div>
        </td>
      `;

      els.tableBody.appendChild(row);
    });

    bindRowActions();
  }

  function bindRowActions() {
    document.querySelectorAll('[data-menu-btn]').forEach((btn) => {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        const id = this.getAttribute('data-menu-btn');
        const menu = document.querySelector(`[data-menu="${CSS.escape(id)}"]`);
        if (!menu) return;

        const isOpen = menu.classList.contains('show');
        closeMenus();
        if (!isOpen) {
          menu.classList.add('show');
        }
      });
    });

    document.querySelectorAll('.action-menu button[data-action]').forEach((btn) => {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        closeMenus();

        const clientId = this.getAttribute('data-id');
        const action = this.getAttribute('data-action');

        if (action === 'process') {
          openAdminForm(clientId);
          return;
        }

        if (action === 'disable') {
          openActionModal({
            clientId,
            nextStatus: 'Disabled',
            actionLabel: 'Disable',
            title: 'Disable Client',
            subtext: 'This client will lose active access until re-enabled.',
            placeholder: 'Enter reason for disabling this client...'
          });
          return;
        }

        if (action === 'enable') {
          openActionModal({
            clientId,
            nextStatus: 'Active',
            actionLabel: 'Enable',
            title: 'Enable Client',
            subtext: 'This client will return to active access.',
            placeholder: 'Enter reason for enabling this client...'
          });
          return;
        }

        if (action === 'processed') {
          openActionModal({
            clientId,
            nextStatus: 'Processed',
            actionLabel: 'Mark as Processed',
            title: 'Mark Client as Processed',
            subtext: 'Use this when the record has been reviewed and prepared for handling.',
            placeholder: 'Enter processing note or internal comment...'
          });
          return;
        }

        if (action === 'active') {
          openActionModal({
            clientId,
            nextStatus: 'Active',
            actionLabel: 'Mark as Active',
            title: 'Activate Client',
            subtext: 'Use this when the client should become live and usable.',
            placeholder: 'Enter activation note, payment note, or approval reason...'
          });
          return;
        }

        if (action === 'delete') {
          openActionModal({
            clientId,
            actionLabel: 'Delete',
            title: 'Delete Client',
            subtext: 'This action should be used carefully. A clear reason is required.',
            placeholder: 'Enter delete reason...',
            deleteAction: true
          });
        }
      });
    });
  }

  function applyFilters() {
    const statusValue = String((els.statusFilter && els.statusFilter.value) || 'all');
    const searchTerm = String((els.searchInput && els.searchInput.value) || '').trim().toLowerCase();

    renderedClients = allClients.filter((client) => {
      const status = normalizeStatus(client.status);
      const statusAllowed = statusValue === 'all'
        ? DEFAULT_VISIBLE_STATUSES.includes(status)
        : status === normalizeStatus(statusValue);

      return statusAllowed && clientMatchesSearch(client, searchTerm);
    });

    renderTable();
    updatePanels();
    updateCounters();
  }

async function fetchClients(showLoader = true, silent = false) {
  if (isFetchingClients) return;
  isFetchingClients = true;

  try {
    if (showLoader && els.loadingState) {
      els.loadingState.style.display = 'block';
    }

    const json = await callApi('/api/admin/clients');
    allClients = Array.isArray(json.data) ? json.data : [];

    applyFilters();
    updateRefreshNote();
  } catch (error) {
    if (!silent) {
      showToast('Load failed', error.message || 'Unable to fetch clients.', 'error');
    }
  } finally {
    if (els.loadingState) {
      els.loadingState.style.display = 'none';
    }
    isFetchingClients = false;
  }
}

function startAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }

  autoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    if (els.modal && els.modal.classList.contains('show')) return;

    fetchClients(false, true);
  }, 10000);
}

  function exportCsv() {
    const rows = [
      ['Client', 'Company', 'Email', 'Phone', 'Package', 'Created', 'Status'],
      ...renderedClients.map((client) => [
        client.fullName || '',
        client.company || '',
        client.email1 || '',
        client.phone1 || '',
        getPackageLabel(client),
        formatDate(client.createdAt || client.createdDate || client.dateCreated || ''),
        normalizeStatus(client.status)
      ])
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell == null ? '' : cell);
            return '"' + value.replace(/"/g, '""') + '"';
          })
          .join(',')
      )
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'smartcardlink-admin-clients.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Export ready', 'CSV export downloaded successfully.', 'info');
  }

  function resetFilters() {
    if (els.searchInput) {
      els.searchInput.value = '';
    }
    if (els.statusFilter) {
      els.statusFilter.value = 'all';
    }
    applyFilters();
    showToast('Filters reset', 'Showing the default admin view again.', 'info');
  }

  function wireEvents() {
    if (els.searchInput) {
      els.searchInput.addEventListener('input', applyFilters);
    }

    if (els.statusFilter) {
      els.statusFilter.addEventListener('change', applyFilters);
    }

if (els.refreshBtn) {
  els.refreshBtn.addEventListener('click', () => fetchClients(true, false));
}

    if (els.exportBtn) {
      els.exportBtn.addEventListener('click', exportCsv);
    }

    if (els.resetBtn) {
      els.resetBtn.addEventListener('click', resetFilters);
    }

    if (els.modalCancelBtn) {
      els.modalCancelBtn.addEventListener('click', closeActionModal);
    }

    if (els.modalConfirmBtn) {
      els.modalConfirmBtn.addEventListener('click', confirmModalAction);
    }

    if (els.modal) {
      els.modal.addEventListener('click', function (event) {
        if (event.target === els.modal) {
          closeActionModal();
        }
      });
    }

    document.addEventListener('click', function () {
      closeMenus();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeMenus();
        closeActionModal();
      }
    });
  }

wireEvents();
fetchClients(true, false);
startAutoRefresh();
})();