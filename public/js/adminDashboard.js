(function () {
    'use strict';

    const API_ROOT = (window.SCL_CONFIG && window.SCL_CONFIG.API_ROOT) || 'https://smartcardlink-api.onrender.com/api';
    const ADMIN_FORM_URL = (window.SCL_CONFIG && window.SCL_CONFIG.ADMIN_FORM_URL) || 'admin-form.html';

    const dashboardContainer = document.getElementById('dashboardContainer');
    const clientTableBody = document.getElementById('clientTableBody');
    const filterInput = document.getElementById('filterInput');
    const statusFilter = document.getElementById('statusFilter');
    const exportBtn = document.getElementById('exportBtn');
    const noResultsDiv = document.getElementById('noResults');
    const totalsDiv = document.getElementById('totals');
    const searchBtn = document.getElementById('searchBtn');
    const refreshBtn = document.getElementById('refreshBtn');

    const notesModal = document.getElementById('notesModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalTextarea = document.getElementById('modalTextarea');
    const modalConfirmBtn = document.getElementById('modalConfirmBtn');
    const modalCloseBtn = document.querySelector('.modal-content .close-btn');
    const toastContainer = document.getElementById('toast-container');

    let allClientData = [];
    let filteredClientData = [];
    let activeModalAction = null;
    let currentFetchController = null;
    let isBusy = false;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showToast(message, type) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'toast ' + (type || 'success');
        toast.innerHTML = '<span>' + escapeHtml(message) + '</span><button class="toast-close-btn" type="button" style="background:none;border:none;color:white;margin-left:10px;cursor:pointer;">&times;</button>';
        const closeBtn = toast.querySelector('.toast-close-btn');

        function removeToast() {
            toast.classList.remove('show');
            window.setTimeout(function () {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 250);
        }

        closeBtn.addEventListener('click', removeToast);
        toastContainer.appendChild(toast);
        window.setTimeout(function () {
            toast.classList.add('show');
        }, 10);
        window.setTimeout(removeToast, 4500);
    }

    function setLoadingState(message) {
        if (!clientTableBody) return;
        clientTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">' + escapeHtml(message || 'Loading client data...') + '</td></tr>';
    }

    function showTableError(message) {
        if (!clientTableBody) return;
        clientTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:20px;">' + escapeHtml(message) + '</td></tr>';
        showToast(message, 'error');
    }

    function normalizeStatus(value) {
        const raw = String(value || 'Pending').trim().toLowerCase();
        if (raw === 'disabled') return 'Disabled';
        if (raw === 'suspended') return 'Suspended';
        if (raw === 'processed') return 'Processed';
        if (raw === 'active') return 'Active';
        if (raw === 'deleted') return 'Deleted';
        return 'Pending';
    }

    function getStatusBadge(status) {
        const clean = normalizeStatus(status);
        const cssClass = clean === 'Suspended' ? 'Disabled' : clean;
        return '<span class="status-badge status-' + cssClass + '">' + clean + '</span>';
    }

    function updateTotals(data) {
        if (!totalsDiv) return;
        const source = Array.isArray(data) ? data : [];
        const counts = {
            Pending: 0,
            Processed: 0,
            Active: 0,
            Disabled: 0,
            Deleted: 0
        };

        source.forEach(function (client) {
            const status = normalizeStatus(client.status);
            if (status === 'Suspended') {
                counts.Disabled += 1;
                return;
            }
            if (counts[status] !== undefined) {
                counts[status] += 1;
            }
        });

        totalsDiv.style.display = 'block';
        totalsDiv.textContent = 'Total: ' + source.length + ' | Pending: ' + counts.Pending + ' | Processed: ' + counts.Processed + ' | Active: ' + counts.Active + ' | Disabled: ' + counts.Disabled + ' | Deleted: ' + counts.Deleted;
    }

    function buildActions(client) {
        const id = escapeHtml(client._id || client.id || '');
        const status = normalizeStatus(client.status);
        const parts = [];

        parts.push('<button type="button" class="action-btn btn-process" data-action="process" data-id="' + id + '">' + (status === 'Pending' ? 'Process' : 'View') + '</button>');

        if (status === 'Active') {
            parts.push('<button type="button" class="action-btn btn-disable" data-action="status" data-id="' + id + '" data-status="Disabled">Disable</button>');
        }

        if (status === 'Disabled' || status === 'Suspended') {
            parts.push('<button type="button" class="action-btn btn-enable" data-action="status" data-id="' + id + '" data-status="Active">Enable</button>');
        }

        if (client.vcardUrl) {
            parts.push('<button type="button" class="action-btn btn-view" data-action="public" data-url="' + escapeHtml(client.vcardUrl) + '">Public</button>');
        }

        if (client.qrCodeUrl) {
            parts.push('<button type="button" class="action-btn btn-view" data-action="qr" data-url="' + escapeHtml(client.qrCodeUrl) + '">QR</button>');
        }

        if (status !== 'Deleted') {
            parts.push('<button type="button" class="action-btn btn-delete" data-action="delete" data-id="' + id + '">Delete</button>');
        }

        return parts.join('');
    }

    function renderTable(data) {
        if (!clientTableBody) return;

        const source = Array.isArray(data) ? data : [];
        filteredClientData = source.slice();
        clientTableBody.innerHTML = '';

        if (source.length === 0) {
            if (noResultsDiv) noResultsDiv.style.display = 'block';
            clientTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">No clients found.</td></tr>';
            updateTotals([]);
            return;
        }

        if (noResultsDiv) noResultsDiv.style.display = 'none';
        updateTotals(source);

        source.forEach(function (client) {
            const tr = document.createElement('tr');
            tr.setAttribute('data-client-id', client._id || client.id || '');
            tr.innerHTML = '' +
                '<td><img src="' + escapeHtml(client.photoUrl || 'https://placehold.co/50x50?text=No+Photo') + '" alt="Client Photo" class="client-photo" onerror="this.onerror=null;this.src=\'https://placehold.co/50x50/111/fff?text=No+Photo\';" /></td>' +
                '<td>' + escapeHtml(client.fullName || 'N/A') + '</td>' +
                '<td>' + escapeHtml(client.company || client.companyName || 'N/A') + '</td>' +
                '<td>' + escapeHtml(client.email1 || 'N/A') + '</td>' +
                '<td>' + escapeHtml(client.phone1 || 'N/A') + '</td>' +
                '<td>' + getStatusBadge(client.status) + '</td>' +
                '<td class="actions-cell">' + buildActions(client) + '</td>';
            clientTableBody.appendChild(tr);
        });
    }

    function applyFilters() {
        const searchValue = String(filterInput && filterInput.value || '').trim().toLowerCase();
        const statusValue = normalizeStatus(statusFilter && statusFilter.value || '');
        const useStatusFilter = !!(statusFilter && statusFilter.value);

        const results = allClientData.filter(function (client) {
            const haystack = [
                client.fullName,
                client.company,
                client.companyName,
                client.email1,
                client.phone1,
                client.slug,
                client._id,
                client.id
            ].join(' ').toLowerCase();

            const searchPass = !searchValue || haystack.indexOf(searchValue) !== -1;
            const statusPass = !useStatusFilter || normalizeStatus(client.status) === statusValue;
            return searchPass && statusPass;
        });

        renderTable(results);
    }

    function exportToCsv() {
        const source = filteredClientData.length ? filteredClientData : allClientData;
        if (!source.length) {
            showToast('No client data available for export.', 'error');
            return;
        }

        const headers = ['ID', 'Name', 'Company', 'Email', 'Phone', 'Status', 'Slug', 'Public URL'];
        const rows = source.map(function (client) {
            return [
                client._id || client.id || '',
                client.fullName || '',
                client.company || client.companyName || '',
                client.email1 || '',
                client.phone1 || '',
                normalizeStatus(client.status),
                client.slug || '',
                client.vcardUrl || ''
            ];
        });

        const csv = [headers].concat(rows).map(function (row) {
            return row.map(function (field) {
                return '"' + String(field).replace(/"/g, '""') + '"';
            }).join(',');
        }).join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'smartcardlink_clients_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('CSV exported successfully.', 'success');
    }

    function openModal(config) {
        activeModalAction = config || null;
        if (!notesModal || !modalTitle || !modalTextarea || !modalConfirmBtn) return;

        modalTitle.textContent = config.title;
        modalTextarea.value = '';
        modalTextarea.placeholder = config.placeholder || 'Enter reason';
        notesModal.style.display = 'block';
        window.setTimeout(function () {
            modalTextarea.focus();
        }, 20);
    }

    function closeModal() {
        activeModalAction = null;
        if (!notesModal || !modalTextarea) return;
        notesModal.style.display = 'none';
        modalTextarea.value = '';
    }

    async function requestJson(url, options) {
        const response = await fetch(url, options || {});
        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok) {
            const message = payload && payload.message ? payload.message : 'Request failed with status ' + response.status;
            throw new Error(message);
        }

        return payload;
    }

    async function fetchAllClients(forceStatus) {
        if (!API_ROOT || isBusy) return;

        isBusy = true;
        if (refreshBtn) refreshBtn.disabled = true;
        if (searchBtn) searchBtn.disabled = true;
        setLoadingState('Loading client data...');

        if (currentFetchController) {
            currentFetchController.abort();
        }
        currentFetchController = new AbortController();

        try {
            const selectedStatus = typeof forceStatus === 'string' ? forceStatus : String(statusFilter && statusFilter.value || '').trim();
            const query = selectedStatus
                ? '?status=' + encodeURIComponent(selectedStatus)
                : '?includeDeleted=true';

            const payload = await requestJson(API_ROOT + '/admin/clients' + query, {
                method: 'GET',
                signal: currentFetchController.signal,
                cache: 'no-store'
            });

            allClientData = Array.isArray(payload && payload.data) ? payload.data : [];
            applyFilters();
        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }
            showTableError(error.message || 'Failed to load clients.');
        } finally {
            isBusy = false;
            if (refreshBtn) refreshBtn.disabled = false;
            if (searchBtn) searchBtn.disabled = false;
        }
    }

    function openAdminForm(clientId) {
        const target = new URL(ADMIN_FORM_URL, window.location.href);
        target.searchParams.set('id', clientId);
        window.open(target.toString(), '_blank');
    }

    async function updateStatus(clientId, newStatus, notes) {
        await requestJson(API_ROOT + '/clients/' + encodeURIComponent(clientId) + '/status/' + encodeURIComponent(newStatus), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notes })
        });
    }

    async function deleteClient(clientId, notes) {
        await requestJson(API_ROOT + '/clients/' + encodeURIComponent(clientId), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notes })
        });
    }

    async function handleActionClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const action = button.getAttribute('data-action');
        const clientId = button.getAttribute('data-id') || '';
        const url = button.getAttribute('data-url') || '';
        const status = button.getAttribute('data-status') || '';

        if (action === 'process') {
            openAdminForm(clientId);
            return;
        }

        if (action === 'public' || action === 'qr') {
            window.open(url, '_blank');
            return;
        }

        if (action === 'status') {
            openModal({
                type: 'status',
                title: 'Reason for ' + status,
                placeholder: 'Enter the reason for changing this client to ' + status + '.',
                clientId: clientId,
                status: status
            });
            return;
        }

        if (action === 'delete') {
            openModal({
                type: 'delete',
                title: 'Reason for Delete',
                placeholder: 'Enter the mandatory reason for deleting this client.',
                clientId: clientId
            });
        }
    }

    async function confirmModalAction() {
        if (!activeModalAction) return;
        const notes = String(modalTextarea && modalTextarea.value || '').trim();
        if (!notes) {
            showToast('A reason is required to proceed.', 'error');
            return;
        }

        modalConfirmBtn.disabled = true;

        try {
            if (activeModalAction.type === 'status') {
                await updateStatus(activeModalAction.clientId, activeModalAction.status, notes);
                showToast('Status updated successfully.', 'success');
            }

            if (activeModalAction.type === 'delete') {
                await deleteClient(activeModalAction.clientId, notes);
                showToast('Client deleted successfully.', 'success');
            }

            closeModal();
            await fetchAllClients();
        } catch (error) {
            showToast(error.message || 'Action failed.', 'error');
        } finally {
            modalConfirmBtn.disabled = false;
        }
    }

    function attachEvents() {
        if (searchBtn) {
            searchBtn.addEventListener('click', applyFilters);
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                fetchAllClients();
            });
        }

        if (filterInput) {
            filterInput.addEventListener('input', applyFilters);
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', function () {
                fetchAllClients(statusFilter.value);
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', exportToCsv);
        }

        if (clientTableBody) {
            clientTableBody.addEventListener('click', handleActionClick);
        }

        if (modalConfirmBtn) {
            modalConfirmBtn.addEventListener('click', confirmModalAction);
        }

        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', closeModal);
        }

        if (notesModal) {
            notesModal.addEventListener('click', function (event) {
                if (event.target === notesModal) {
                    closeModal();
                }
            });
        }
    }

    function init() {
        if (!API_ROOT) {
            showTableError('API root is not configured.');
            return;
        }

        if (dashboardContainer) {
            dashboardContainer.style.display = 'block';
        }

        attachEvents();
        fetchAllClients(String(statusFilter && statusFilter.value || ''));
    }

    window.fetchAllClients = fetchAllClients;
    window.exportToCsv = exportToCsv;

    document.addEventListener('DOMContentLoaded', init);
})();
