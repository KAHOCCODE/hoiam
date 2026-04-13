const API_BASE = '/api';

const state = {
  stories: [],
  filtered: [],
};

const els = {
  loginCard: document.getElementById('loginCard'),
  dashboard: document.getElementById('dashboard'),
  loginForm: document.getElementById('loginForm'),
  password: document.getElementById('password'),
  logoutBtn: document.getElementById('logoutBtn'),

  adminSearch: document.getElementById('adminSearch'),
  adminFilter: document.getElementById('adminFilter'),
  adminTable: document.getElementById('adminTable'),

  editDialog: document.getElementById('editDialog'),
  closeEditDialogBtn: document.getElementById('closeEditDialogBtn'),
  editForm: document.getElementById('editForm'),
  deleteBtn: document.getElementById('deleteBtn'),
  toastRegion: document.getElementById('toastRegion'),
};

const statEls = {
  total: document.getElementById('aStatTotal'),
  suggest: document.getElementById('aStatSuggest'),
  reading: document.getElementById('aStatReading'),
  top: document.getElementById('aStatTop'),
};

function bind(el, event, handler) {
  if (el) el.addEventListener(event, handler);
}

function showToast(message, tone = 'info') {
  if (!els.toastRegion) return;

  const node = document.createElement('div');
  node.className = 'toast';
  node.dataset.tone = tone;
  node.textContent = message;
  els.toastRegion.appendChild(node);

  setTimeout(() => {
    node.remove();
  }, 3400);
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error || 'Có lỗi xảy ra.');
    error.status = response.status;
    throw error;
  }

  return payload;
}

function normalizeStatus(value = '') {
  const cleaned = String(value)
    .normalize('NFC')
    .replace(/\u202F/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (cleaned === 'đang đọc') return 'đang đọc';
  return 'đề xuất';
}

function normalize(item) {
  return {
    id: Number(item.id),
    title: String(item.title || ''),
    linkstory: String(item.linkstory || ''),
    youtubelink: String(item.youtubelink || ''),
    version: item.version === 'Convert' ? 'Convert' : 'Edit',
    note: String(item.note || ''),
    status: normalizeStatus(item.status),
    votes: Number.isFinite(Number(item.votes))
      ? Math.max(0, Number(item.votes))
      : 0,
    createdat: item.createdat || new Date().toISOString(),
  };
}

function statusLabel(status) {
  return status === 'đang đọc' ? 'Đang đọc' : 'Đề xuất';
}

function updateStats() {
  if (statEls.total) {
    statEls.total.textContent = String(state.stories.length);
  }

  if (statEls.suggest) {
    statEls.suggest.textContent = String(
      state.stories.filter((item) => item.status === 'đề xuất').length
    );
  }

  if (statEls.reading) {
    statEls.reading.textContent = String(
      state.stories.filter((item) => item.status === 'đang đọc').length
    );
  }

  if (statEls.top) {
    statEls.top.textContent = '3';
  }
}

function applyFilters() {
  const query = (els.adminSearch?.value || '').trim().toLowerCase();
  const statusFilter = els.adminFilter?.value || 'all';

  state.filtered = state.stories.filter((item) => {
    const matchTitle = item.title.toLowerCase().includes(query);
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchTitle && matchStatus;
  });
}

function createRow(story) {
  const tr = document.createElement('tr');

  const tdTitle = document.createElement('td');
  const title = document.createElement('span');
  title.className = 'story-title';
  title.textContent = story.title;
  tdTitle.appendChild(title);

  if (story.linkstory) {
    const link = document.createElement('a');
    link.href = story.linkstory;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'inline-link';
    link.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Mở link gốc';
    tdTitle.appendChild(document.createElement('br'));
    tdTitle.appendChild(link);
  }

  const tdStatus = document.createElement('td');
  const status = document.createElement('span');
  status.className = 'status-pill';
  status.dataset.status = story.status;
  status.textContent = statusLabel(story.status);
  tdStatus.appendChild(status);

  const tdVotes = document.createElement('td');
  const vote = document.createElement('span');
  vote.className = 'vote-badge';
  vote.innerHTML = `<i class="fa-solid fa-heart"></i> ${story.votes}`;
  tdVotes.appendChild(vote);

  const tdAction = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'admin-row-actions';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'small-btn';
  edit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Sửa';
  edit.addEventListener('click', () => openEdit(story.id));

  actions.appendChild(edit);
  tdAction.appendChild(actions);

  tr.append(tdTitle, tdStatus, tdVotes, tdAction);
  return tr;
}

function renderTable() {
  if (!els.adminTable) return;

  applyFilters();
  els.adminTable.textContent = '';

  if (!state.filtered.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = 'Không có dữ liệu phù hợp.';
    tr.appendChild(td);
    els.adminTable.appendChild(tr);
    return;
  }

  state.filtered.forEach((story) => {
    els.adminTable.appendChild(createRow(story));
  });
}

function setAuthenticated(on) {
  if (els.loginCard) {
    els.loginCard.classList.toggle('hidden', on);
  }

  if (els.dashboard) {
    els.dashboard.classList.toggle('hidden', !on);
  }

  if (els.logoutBtn) {
    els.logoutBtn.classList.toggle('hidden', !on);
  }
}

async function fetchStories() {
  const payload = await request('/admin/stories');
  state.stories = Array.isArray(payload?.stories)
    ? payload.stories.map(normalize)
    : [];

  updateStats();
  renderTable();
}

async function trySession() {
  try {
    await fetchStories();
    setAuthenticated(true);
  } catch (error) {
    setAuthenticated(false);
    if (error.status && error.status !== 401) {
      showToast(error.message || 'Không tải được dữ liệu.', 'error');
    }
  }
}

async function login(event) {
  event.preventDefault();

  const password = els.password?.value || '';
  if (!password.trim()) {
    showToast('Hãy nhập mật khẩu.', 'error');
    return;
  }

  try {
    await request('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });

    if (els.password) {
      els.password.value = '';
    }

    setAuthenticated(true);
    await fetchStories();
    showToast('Đăng nhập thành công.', 'success');
  } catch (error) {
    showToast(error.message || 'Đăng nhập thất bại.', 'error');
  }
}

async function logout() {
  try {
    await request('/admin/logout', {
      method: 'POST',
      body: '{}',
    });
  } catch {
    // bỏ qua
  }

  setAuthenticated(false);
  state.stories = [];
  state.filtered = [];
  renderTable();
}

function openEdit(id) {
  const story = state.stories.find((item) => item.id === id);
  if (!story) return;

  const editId = document.getElementById('editId');
  const editTitle = document.getElementById('editTitle');
  const editLinkStory = document.getElementById('editLinkStory');
  const editYoutubeLink = document.getElementById('editYoutubeLink');
  const editStatus = document.getElementById('editStatus');
  const editVotes = document.getElementById('editVotes');
  const editNote = document.getElementById('editNote');

  if (editId) editId.value = String(story.id);
  if (editTitle) editTitle.value = story.title;
  if (editLinkStory) editLinkStory.value = story.linkstory;
  if (editYoutubeLink) editYoutubeLink.value = story.youtubelink;
  if (editStatus) editStatus.value = story.status;
  if (editVotes) editVotes.value = String(story.votes);
  if (editNote) editNote.value = story.note;

  const versionRadio = document.querySelector(
    `input[name="editVersion"][value="${story.version}"]`
  );
  if (versionRadio) {
    versionRadio.checked = true;
  }

  if (els.deleteBtn) {
    els.deleteBtn.dataset.id = String(story.id);
  }

  if (els.editDialog?.showModal) {
    els.editDialog.showModal();
  }
}

function closeEdit() {
  if (els.editDialog?.open) {
    els.editDialog.close();
  }
}

async function saveEdit(event) {
  event.preventDefault();

  const editId = document.getElementById('editId');
  const editTitle = document.getElementById('editTitle');
  const editLinkStory = document.getElementById('editLinkStory');
  const editYoutubeLink = document.getElementById('editYoutubeLink');
  const editStatus = document.getElementById('editStatus');
  const editVotes = document.getElementById('editVotes');
  const editNote = document.getElementById('editNote');

  const id = editId?.value;
  if (!id) {
    showToast('Không tìm thấy ID truyện.', 'error');
    return;
  }

  const payload = {
    title: (editTitle?.value || '').trim(),
    linkstory: (editLinkStory?.value || '').trim(),
    youtubelink: (editYoutubeLink?.value || '').trim(),
    status: editStatus?.value || 'đề xuất',
    votes: Number(editVotes?.value || 0),
    note: (editNote?.value || '').trim(),
    version:
      document.querySelector('input[name="editVersion"]:checked')?.value || 'Edit',
  };

  try {
    await request(`/admin/stories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    showToast('Đã lưu thay đổi.', 'success');
    closeEdit();
    await fetchStories();
  } catch (error) {
    showToast(error.message || 'Không thể lưu.', 'error');
  }
}

async function removeStory(id) {
  if (!id) return;

  const ok = window.confirm(
    'Bạn chắc chắn muốn xóa hẳn truyện này khỏi database?'
  );
  if (!ok) return;

  try {
    await request(`/admin/stories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: '{}',
    });

    showToast('Đã xóa hẳn truyện.', 'success');
    closeEdit();
    await fetchStories();
  } catch (error) {
    showToast(error.message || 'Không thể xóa.', 'error');
  }
}

bind(els.loginForm, 'submit', login);
bind(els.logoutBtn, 'click', logout);
bind(els.adminSearch, 'input', renderTable);
bind(els.adminFilter, 'change', renderTable);
bind(els.closeEditDialogBtn, 'click', closeEdit);
bind(els.editForm, 'submit', saveEdit);

bind(els.deleteBtn, 'click', () => {
  removeStory(els.deleteBtn?.dataset?.id);
});

bind(els.editDialog, 'click', (event) => {
  const dialog = els.editDialog;
  if (!dialog) return;

  const rect = dialog.getBoundingClientRect();
  const inDialog =
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width;

  if (!inDialog) {
    closeEdit();
  }
});

trySession();
