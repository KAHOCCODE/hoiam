const API_BASE = '/api';

const state = { stories: [], filtered: [] };

const els = {
  loginCard: document.getElementById('loginCard'),
  dashboard: document.getElementById('dashboard'),
  loginForm: document.getElementById('loginForm'),
  password: document.getElementById('password'),
  logoutBtn: document.getElementById('logoutBtn'),
  adminSearch: document.getElementById('adminSearch'),
  adminFilter: document.getElementById('adminFilter'),
  adminVisibility: document.getElementById('adminVisibility'),
  adminTable: document.getElementById('adminTable'),
  editDialog: document.getElementById('editDialog'),
  closeEditDialogBtn: document.getElementById('closeEditDialogBtn'),
  editForm: document.getElementById('editForm'),
  hideBtn: document.getElementById('hideBtn'),
  deleteBtn: document.getElementById('deleteBtn'),
  toastRegion: document.getElementById('toastRegion'),
};

const statEls = {
  total: document.getElementById('aStatTotal'),
  visible: document.getElementById('aStatVisible'),
  hidden: document.getElementById('aStatHidden'),
  onAir: document.getElementById('aStatOnAir'),
};

function showToast(message, tone = 'info') {
  const node = document.createElement('div');
  node.className = 'toast';
  node.dataset.tone = tone;
  node.textContent = message;
  els.toastRegion.appendChild(node);
  setTimeout(() => node.remove(), 3400);
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
  try { payload = await response.json(); } catch { payload = null; }

  if (!response.ok) {
    const error = new Error(payload?.error || 'Có lỗi xảy ra.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function normalize(item) {
  return {
    id: Number(item.id),
    title: String(item.title || ''),
    linkstory: String(item.linkstory || ''),
    youtubelink: String(item.youtubelink || ''),
    version: item.version === 'Convert' ? 'Convert' : 'Edit',
    note: String(item.note || ''),
    status: item.status === 'đang đọc' || item.status === 'đã đọc' ? item.status : 'đề xuất',
    votes: Number.isFinite(Number(item.votes)) ? Math.max(0, Number(item.votes)) : 0,
    visible: item.visible !== false,
    createdat: item.createdat || new Date().toISOString(),
  };
}

function statusLabel(status) {
  return status === 'đang đọc' ? 'Đang phát' : status === 'đã đọc' ? 'Hoàn thành' : 'Đề xuất';
}

function updateStats() {
  statEls.total.textContent = String(state.stories.length);
  statEls.visible.textContent = String(state.stories.filter((item) => item.visible).length);
  statEls.hidden.textContent = String(state.stories.filter((item) => !item.visible).length);
  statEls.onAir.textContent = String(state.stories.filter((item) => item.status === 'đang đọc').length);
}

function applyFilters() {
  const query = (els.adminSearch.value || '').trim().toLowerCase();
  const statusFilter = els.adminFilter.value || 'all';
  const visibilityFilter = els.adminVisibility.value || 'all';

  state.filtered = state.stories.filter((item) => {
    const matchTitle = item.title.toLowerCase().includes(query);
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchVisibility =
      visibilityFilter === 'all' ||
      (visibilityFilter === 'visible' && item.visible) ||
      (visibilityFilter === 'hidden' && !item.visible);
    return matchTitle && matchStatus && matchVisibility;
  });
}

function visibilityLabel(story) {
  return story.visible ? 'Đang hiển thị' : 'Đang ẩn';
}

function createRow(story) {
  const tr = document.createElement('tr');

  const tdTitle = document.createElement('td');
  const title = document.createElement('strong');
  title.textContent = story.title;
  tdTitle.appendChild(title);
  if (story.linkstory) {
    const link = document.createElement('a');
    link.href = story.linkstory;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'inline-link';
    link.textContent = ' Mở link gốc';
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
  tdVotes.textContent = String(story.votes);

  const tdVisible = document.createElement('td');
  const visible = document.createElement('span');
  visible.className = 'status-pill';
  visible.dataset.status = story.visible ? 'đã đọc' : 'đề xuất';
  visible.textContent = visibilityLabel(story);
  tdVisible.appendChild(visible);

  const tdAction = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'admin-row-actions';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'small-btn';
  edit.textContent = 'Sửa';
  edit.addEventListener('click', () => openEdit(story.id));

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'small-btn';
  toggle.textContent = story.visible ? 'Ẩn' : 'Hiện';
  toggle.addEventListener('click', () => toggleVisibility(story.id, !story.visible));

  actions.append(edit, toggle);
  tdAction.appendChild(actions);

  tr.append(tdTitle, tdStatus, tdVotes, tdVisible, tdAction);
  return tr;
}

function renderTable() {
  applyFilters();
  els.adminTable.textContent = '';
  if (!state.filtered.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'Không có dữ liệu phù hợp.';
    tr.appendChild(td);
    els.adminTable.appendChild(tr);
    return;
  }
  state.filtered.forEach((story) => els.adminTable.appendChild(createRow(story)));
}

function setAuthenticated(on) {
  els.loginCard.classList.toggle('hidden', on);
  els.dashboard.classList.toggle('hidden', !on);
  els.logoutBtn.classList.toggle('hidden', !on);
}

async function fetchStories() {
  const payload = await request('/admin/stories');
  state.stories = Array.isArray(payload.stories) ? payload.stories.map(normalize) : [];
  updateStats();
  renderTable();
}

async function trySession() {
  try {
    await fetchStories();
    setAuthenticated(true);
  } catch (error) {
    setAuthenticated(false);
    if (error.status && error.status !== 401) showToast(error.message, 'error');
  }
}

async function login(event) {
  event.preventDefault();
  const password = els.password.value || '';
  if (!password.trim()) return showToast('Hãy nhập mật khẩu.', 'error');

  try {
    await request('/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
    els.password.value = '';
    setAuthenticated(true);
    await fetchStories();
    showToast('Đăng nhập thành công.', 'success');
  } catch (error) {
    showToast(error.message || 'Đăng nhập thất bại.', 'error');
  }
}

async function logout() {
  try { await request('/admin/logout', { method: 'POST', body: '{}' }); } catch {}
  setAuthenticated(false);
  state.stories = [];
  renderTable();
}

function openEdit(id) {
  const story = state.stories.find((item) => item.id === id);
  if (!story) return;

  document.getElementById('editId').value = String(story.id);
  document.getElementById('editTitle').value = story.title;
  document.getElementById('editLinkStory').value = story.linkstory;
  document.getElementById('editYoutubeLink').value = story.youtubelink;
  document.getElementById('editStatus').value = story.status;
  document.getElementById('editVotes').value = String(story.votes);
  document.getElementById('editNote').value = story.note;
  document.getElementById('editVisible').checked = story.visible;
  const versionRadio = document.querySelector(`input[name="editVersion"][value="${story.version}"]`);
  if (versionRadio) versionRadio.checked = true;

  els.deleteBtn.dataset.id = String(story.id);
  els.hideBtn.dataset.id = String(story.id);
  els.hideBtn.textContent = story.visible ? 'Ẩn truyện' : 'Hiện truyện';
  els.editDialog.showModal();
}

function closeEdit() {
  if (els.editDialog.open) els.editDialog.close();
}

async function saveEdit(event) {
  event.preventDefault();
  const id = document.getElementById('editId').value;
  const payload = {
    title: document.getElementById('editTitle').value.trim(),
    linkstory: document.getElementById('editLinkStory').value.trim(),
    youtubelink: document.getElementById('editYoutubeLink').value.trim(),
    status: document.getElementById('editStatus').value,
    votes: Number(document.getElementById('editVotes').value || 0),
    note: document.getElementById('editNote').value.trim(),
    version: document.querySelector('input[name="editVersion"]:checked')?.value || 'Edit',
    visible: document.getElementById('editVisible').checked,
  };

  try {
    await request(`/admin/stories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
    showToast('Đã lưu thay đổi.', 'success');
    closeEdit();
    await fetchStories();
  } catch (error) {
    showToast(error.message || 'Không thể lưu.', 'error');
  }
}

async function toggleVisibility(id, visible) {
  try {
    await request(`/admin/stories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ visible }) });
    showToast(visible ? 'Đã hiện truyện.' : 'Đã ẩn truyện.', 'success');
    closeEdit();
    await fetchStories();
  } catch (error) {
    showToast(error.message || 'Không đổi được trạng thái hiển thị.', 'error');
  }
}

async function removeStory(id) {
  const ok = window.confirm('Bạn chắc chắn muốn xóa hẳn truyện này khỏi database?');
  if (!ok) return;
  try {
    await request(`/admin/stories/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}' });
    showToast('Đã xóa hẳn truyện.', 'success');
    closeEdit();
    await fetchStories();
  } catch (error) {
    showToast(error.message || 'Không thể xóa.', 'error');
  }
}

els.loginForm.addEventListener('submit', login);
els.logoutBtn.addEventListener('click', logout);
els.adminSearch.addEventListener('input', renderTable);
els.adminFilter.addEventListener('change', renderTable);
els.adminVisibility.addEventListener('change', renderTable);
els.closeEditDialogBtn.addEventListener('click', closeEdit);
els.editForm.addEventListener('submit', saveEdit);
els.hideBtn.addEventListener('click', () => {
  const id = els.hideBtn.dataset.id;
  const visible = !document.getElementById('editVisible').checked;
  toggleVisibility(id, visible);
});
els.deleteBtn.addEventListener('click', () => removeStory(els.deleteBtn.dataset.id));
els.editDialog.addEventListener('click', (event) => {
  const rect = els.editDialog.getBoundingClientRect();
  const inDialog = rect.top <= event.clientY && event.clientY <= rect.top + rect.height && rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
  if (!inDialog) closeEdit();
});

trySession();
