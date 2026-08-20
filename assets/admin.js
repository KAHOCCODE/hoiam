const ADMIN_UI_VERSION = '06129';
const state = {
  stories: [], donations: [], replacements: [], announcements: [], settings: null, activeStory: null,
  activeView: sessionStorage.getItem('hoiam_admin_view') || 'overview',
  storyStatus: sessionStorage.getItem('hoiam_admin_story_status') || 'all',
  storyPage: Math.max(1, Number(sessionStorage.getItem('hoiam_admin_story_page') || 1)),
  storyPageSize: 30,
  storyBaseline: '', storyDirty: false,
  activeAnnouncement: null,
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('vi-VN');
const returnFocus = new WeakMap();

function setAdminLoading(loading) {
  $('#adminApp')?.setAttribute('aria-busy', String(loading));
  const refresh = $('#refreshButton');
  if (refresh) {
    refresh.disabled = loading;
    refresh.classList.toggle('loading', loading);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(payload?.error || 'Có lỗi xảy ra.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function toast(message, icon = 'success') {
  if (!window.Swal) return window.alert(message);
  return Swal.fire({ toast: true, position: 'top-end', icon, title: message, timer: 3000, timerProgressBar: true, showConfirmButton: false, customClass: { popup: 'cosmic-swal' } });
}

async function confirmAction(title, text, confirmText = 'Xác nhận', icon = 'warning') {
  if (!window.Swal) return window.confirm(`${title}\n${text}`);
  const result = await Swal.fire({ title, text, icon, showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: 'Hủy', reverseButtons: true, customClass: { popup: 'cosmic-swal' } });
  return result.isConfirmed;
}

function safeUrl(value) {
  try { const url = new URL(String(value || '').trim()); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}

const imagePreviews = [
  { input: '#storyEditForm [name="thumbnail_url"]', host: '#storyThumbnailPreview', label: 'Ảnh bìa truyện' },
  { input: '#completedForm [name="thumbnail_url"]', host: '#completedThumbnailPreview', label: 'Ảnh bìa truyện hoàn thành' },
  { input: '#settingsForm [name="logoUrl"]', host: '#settingsLogoPreview', label: 'Logo kênh' },
  { input: '#settingsForm [name="qrUrl"]', host: '#settingsQrPreview', label: 'Mã QR dự phòng' },
];

function updateImagePreview(spec) {
  const input = $(spec.input); const host = $(spec.host);
  if (!input || !host) return;
  const url = safeUrl(input.value);
  host.replaceChildren();
  host.classList.toggle('hidden', !url);
  host.classList.remove('loaded', 'failed');
  if (!url) return;
  const image = new Image(); image.alt = spec.label; image.loading = 'lazy'; image.decoding = 'async';
  const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = 'Mở ảnh gốc'; link.append(image);
  const message = document.createElement('figcaption'); message.textContent = 'Đang tải ảnh xem trước…';
  image.addEventListener('load', () => { host.classList.add('loaded'); message.textContent = `${spec.label} · Bấm ảnh để mở`; });
  image.addEventListener('error', () => { host.classList.add('failed'); message.textContent = 'Không mở được ảnh từ đường dẫn này.'; link.remove(); });
  image.src = url; host.append(link, message);
}

function refreshImagePreviews(scope = '') {
  imagePreviews.filter((spec) => !scope || spec.host === scope).forEach(updateImagePreview);
}

function bindImagePreviews() {
  imagePreviews.forEach((spec) => {
    const input = $(spec.input);
    if (!input) return;
    input.addEventListener('input', () => updateImagePreview(spec));
    input.addEventListener('change', () => updateImagePreview(spec));
  });
}

function normalizeStatus(value) {
  const status = String(value || '').normalize('NFC').trim().toLowerCase();
  if (['đang đọc', 'đang lên sóng'].includes(status)) return 'đang lên sóng';
  if (status === 'đã chọn') return 'đã chọn';
  if (status === 'đã hoàn thành') return 'đã hoàn thành';
  return 'đề xuất';
}

function normalizeStory(item) {
  return {
    id: Number(item.id), title: String(item.title || ''), linkstory: safeUrl(item.linkstory),
    youtubelink: safeUrl(item.youtubelink), thumbnail_url: safeUrl(item.thumbnail_url),
    version: item.version === 'Edit' ? 'Edit' : 'Convert', note: String(item.note || ''),
    votes: Math.max(0, Math.floor(Number(item.votes || 0))), status: normalizeStatus(item.status),
    visible: item.visible !== false, source_status: item.source_status || 'normal',
    source_reason: String(item.source_reason || ''), source_deadline: item.source_deadline || null,
    source_warning_public: item.source_warning_public === true, completedat: item.completedat || null,
    deletedat: item.deletedat || null, views: Number(item.views || 0), youtube_clicks: Number(item.youtube_clicks || 0),
    createdat: item.createdat || null,
  };
}

function normalizeDonation(item) {
  return {
    ...item, id: Number(item.id), story_id: Number(item.story_id), amount_vnd: Number(item.amount_vnd || 0),
    stone_count: Number(item.stone_count || 0), suggested_votes: Number(item.suggested_votes || 0),
    applied_votes: Number(item.applied_votes || 0), donor_name: String(item.donor_name || ''),
    story_title: String(item.story_title || ''), status: item.status || 'pending',
  };
}

function sourceDomain(value) {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return 'Không rõ nguồn'; }
}

function statusLabel(status) {
  return ({ 'đề xuất': 'Đề xuất', 'đã chọn': 'Đã chọn', 'đang lên sóng': 'Đang lên sóng', 'đã hoàn thành': 'Đã hoàn thành', trash: 'Thùng rác' })[status] || status;
}

function donationLabel(status) {
  return ({ pending: 'Chờ kiểm tra', confirmed: 'Đã xác nhận', waiting_votes: 'Chờ cộng vote', applied: 'Đã cộng vote', rejected: 'Từ chối' })[status] || status;
}

function sourceLabel(status) {
  return ({ normal: 'Bình thường', suspected: 'Nghi ngờ', confirmed: 'Đã xác nhận lỗi', replaced: 'Đã thay thế' })[status] || status;
}

function setAuthenticated(authenticated) {
  $('#loginView').classList.toggle('hidden', authenticated);
  $('#adminApp').classList.toggle('hidden', !authenticated);
}

async function loadAll() {
  setAdminLoading(true);
  try {
    const payload = await request('/admin/bootstrap');
    state.stories = (payload.stories || []).map(normalizeStory);
    state.donations = (payload.donations || []).map(normalizeDonation);
    state.replacements = payload.replacements || [];
    state.announcements = payload.announcements || [];
    state.settings = payload.settings || null;
    renderAll();
    selectStoryStatus(state.storyStatus, false);
    switchView(['overview','stories','donations','sources','announcements','settings'].includes(state.activeView) ? state.activeView : 'overview');
    if (payload.setup_required) toast('Một số mục cần chạy supabase.sql V06 trước.', 'warning');
  } finally { setAdminLoading(false); }
}

async function reloadStories() {
  const payload = await request('/admin/stories');
  state.stories = (payload.stories || []).map(normalizeStory);
  renderStorySourceOptions(); renderDashboard(); renderStories(); renderSources(); fillStorySelects();
}

async function reloadDonations() {
  const payload = await request('/admin/donations');
  state.donations = (payload.donations || []).map(normalizeDonation);
  renderDashboard(); renderDonations();
}

async function reloadReplacements() {
  const payload = await request('/admin/source-replacements');
  state.replacements = payload.replacements || [];
  renderDashboard(); renderSources();
}

async function reloadAnnouncements() {
  const payload = await request('/admin/announcements');
  state.announcements = payload.announcements || [];
  renderAnnouncements();
}

async function reloadSettings() {
  const payload = await request('/admin/settings');
  state.settings = payload.settings;
  renderSettings();
}

async function trySession() {
  try { await loadAll(); setAuthenticated(true); }
  catch (error) { setAuthenticated(false); if (error.status !== 401) toast(error.message, 'error'); }
}

async function login(event) {
  event.preventDefault();
  try {
    await request('/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value, remember: $('#rememberAdmin').checked }) });
    $('#password').value = '';
    await loadAll();
    setAuthenticated(true);
    toast('Đăng nhập thành công.');
  } catch (error) { setAuthenticated(false); toast(error.message, 'error'); }
}

async function logout() {
  try { await request('/admin/logout', { method: 'POST', body: '{}' }); } catch { /* vẫn đóng giao diện */ }
  setAuthenticated(false);
}

function setSidebar(open) {
  const sidebar = $('.sidebar'); const toggle = $('#sidebarToggle'); const backdrop = $('#sidebarBackdrop');
  if (!sidebar || !toggle || !backdrop) return;
  const active = Boolean(open && window.innerWidth <= 1024);
  sidebar.classList.toggle('open', active);
  toggle.setAttribute('aria-expanded', String(active));
  toggle.setAttribute('aria-label', active ? 'Đóng thanh điều hướng' : 'Mở thanh điều hướng');
  backdrop.hidden = !active;
  document.body.classList.toggle('sidebar-open', active);
}

function setStoryMenu(open) {
  const group = $('[data-nav-group="stories"]');
  if (!group) return;
  group.classList.toggle('expanded', Boolean(open));
  $('[data-view="stories"]', group)?.setAttribute('aria-expanded', String(Boolean(open)));
}

function switchView(name) {
  state.activeView = name;
  sessionStorage.setItem('hoiam_admin_view', name);
  $$('.admin-view').forEach((view) => view.classList.toggle('active', view.dataset.section === name));
  $$('#adminNav [data-view]').forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const storyNavGroup = $('[data-nav-group="stories"]');
  storyNavGroup?.classList.toggle('active', name === 'stories');
  setStoryMenu(name === 'stories');
  const label = ({ overview: 'Tổng quan', stories: 'Truyện', donations: 'Donate', sources: 'Nguồn truyện', announcements: 'Thông báo', settings: 'Cài đặt' })[name];
  $('#currentViewLabel').textContent = name === 'stories' ? `Kho truyện / ${statusLabel($('#storyStatusFilter').value === 'all' ? 'Tất cả' : $('#storyStatusFilter').value)}` : label || name;
}

function selectStoryStatus(status, openView = true) {
  const allowed = ['all', 'đề xuất', 'đã chọn', 'đang lên sóng', 'đã hoàn thành', 'trash'];
  const value = allowed.includes(status) ? status : 'all';
  if (state.storyStatus !== value) state.storyPage = 1;
  state.storyStatus = value;
  sessionStorage.setItem('hoiam_admin_story_status', value);
  sessionStorage.setItem('hoiam_admin_story_page', String(state.storyPage));
  $('#storyStatusFilter').value = value;
  $$('[data-story-status]').forEach((button) => {
    const active = button.dataset.storyStatus === value;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'location');
    else button.removeAttribute('aria-current');
  });
  const scopes = {
    all: ['Tất cả truyện', 'Toàn bộ truyện đang hoạt động trong hệ thống.'],
    'đề xuất': ['Truyện đề xuất', 'Danh sách cộng đồng gửi và đang chờ bạn lựa chọn.'],
    'đã chọn': ['Truyện đã chọn', 'Những truyện đang được chuẩn bị và biên tập.'],
    'đang lên sóng': ['Đang lên sóng', 'Những truyện đang được đăng trên YouTube.'],
    'đã hoàn thành': ['Truyện hoàn thành', 'Kho truyện đã được đăng trọn bộ trên kênh.'],
    trash: ['Thùng rác', 'Các truyện đã ẩn khỏi website nhưng chưa bị xóa cứng.'],
  };
  const [title, description] = scopes[value];
  $('#storyScopeTitle').textContent = title;
  $('#storyScopeDescription').textContent = description;
  if (openView) switchView('stories');
  renderStories();
}

function renderAll() {
  renderStorySourceOptions(); renderDashboard(); renderStories(); renderDonations(); renderSources(); renderAnnouncements(); renderSettings(); fillStorySelects();
}

function renderDashboard() {
  const active = state.stories.filter((story) => !story.deletedat);
  const statusCounts = {
    proposed: active.filter((story) => story.status === 'đề xuất').length,
    selected: active.filter((story) => story.status === 'đã chọn').length,
    airing: active.filter((story) => story.status === 'đang lên sóng').length,
    completed: active.filter((story) => story.status === 'đã hoàn thành').length,
  };
  $('#statTotal').textContent = number.format(active.length);
  $('#statCompleted').textContent = number.format(statusCounts.completed);
  $('#statProposed').textContent = number.format(statusCounts.proposed);
  $('#statSelected').textContent = number.format(statusCounts.selected);
  $('#statAiring').textContent = number.format(statusCounts.airing);
  $('#pipelineCompleted').textContent = number.format(statusCounts.completed);
  $('#overviewRing').style.setProperty('--completion', `${active.length ? statusCounts.completed / active.length * 360 : 0}deg`);
  [['pipelineProposed', statusCounts.proposed], ['pipelineSelected', statusCounts.selected], ['pipelineAiring', statusCounts.airing], ['pipelineCompletedBar', statusCounts.completed]].forEach(([id, count]) => {
    $(`#${id}`).style.width = `${count ? Math.max(7, count / Math.max(1, active.length) * 100) : 0}%`;
  });
  const pendingDonations = state.donations.filter((item) => item.status === 'pending').length;
  $('#statDonationPending').textContent = number.format(pendingDonations);
  $('#navStoryCount').textContent = active.length;
  $('#storyNavAllCount').textContent = active.length;
  $('#storyNavProposedCount').textContent = statusCounts.proposed;
  $('#storyNavSelectedCount').textContent = statusCounts.selected;
  $('#storyNavAiringCount').textContent = statusCounts.airing;
  $('#storyNavCompletedCount').textContent = statusCounts.completed;
  $('#storyNavTrashCount').textContent = state.stories.filter((story) => story.deletedat).length;
  $('#navDonationCount').textContent = pendingDonations;
  const sourceProblems = active.filter((story) => ['suspected', 'confirmed'].includes(story.source_status)).length;
  const pendingReplacements = state.replacements.filter((item) => item.status === 'pending').length;
  $('#navSourceCount').textContent = sourceProblems + pendingReplacements;
  $('#statSourceProblems').textContent = number.format(sourceProblems);
  $('#statReplacementPending').textContent = number.format(pendingReplacements);

  const topHost = $('#dashboardTop'); topHost.replaceChildren();
  active.filter((story) => story.status === 'đề xuất').sort((a, b) => b.votes - a.votes).slice(0, 3).forEach((story, index) => {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'rank-item';
    row.innerHTML = `<span>0${index + 1}</span><div><strong></strong><small></small></div><b>${number.format(story.votes)} ♥</b>`;
    $('strong', row).textContent = story.title; $('small', row).textContent = `${story.version} · ${sourceDomain(story.linkstory)}`;
    row.addEventListener('click', () => openStoryDrawer(story.id)); topHost.append(row);
  });
  if (!topHost.children.length) topHost.innerHTML = '<div class="empty">Chưa có truyện đề xuất.</div>';

  const counts = new Map(); active.forEach((story) => { const source = sourceDomain(story.linkstory); counts.set(source, (counts.get(source) || 0) + 1); });
  const sourceHost = $('#sourceStats'); sourceHost.replaceChildren();
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([source, count]) => { const row = document.createElement('div'); row.innerHTML = `<div class="source-bar-head"><span></span><b>${count}</b></div><div class="bar"><i style="width:${Math.max(8, count / Math.max(1, active.length) * 100)}%"></i></div>`; $('.source-bar-head span', row).textContent = source; sourceHost.append(row); });
  if (!sourceHost.children.length) sourceHost.innerHTML = '<div class="empty">Chưa có dữ liệu nguồn.</div>';

  const popular = $('#popularStories'); popular.replaceChildren();
  [...active].sort((a, b) => (b.views + b.youtube_clicks) - (a.views + a.youtube_clicks)).slice(0, 6).forEach((story) => { const row = document.createElement('div'); row.className = 'popular-row'; row.innerHTML = '<strong></strong><span></span><span></span>'; $('strong', row).textContent = story.title; const spans = $$('span', row); spans[0].textContent = `${number.format(story.views)} lượt mở`; spans[1].textContent = `${number.format(story.youtube_clicks)} YouTube`; popular.append(row); });
  if (!popular.children.length) popular.innerHTML = '<div class="empty">Chưa có dữ liệu lượt xem.</div>';
}

function storyFilters() {
  const query = ($('#storySearch').value || '').trim().toLocaleLowerCase('vi');
  const status = $('#storyStatusFilter').value; const source = $('#storySourceFilter').value;
  const version = $('#storyVersionFilter').value; const sort = $('#storySort').value;
  const list = state.stories.filter((story) => {
    const deleted = Boolean(story.deletedat);
    const statusMatch = status === 'all' ? !deleted : status === 'trash' ? deleted : !deleted && story.status === status;
    const sourceMatch = source === 'all' || (source === 'problem' && ['suspected', 'confirmed'].includes(story.source_status)) || sourceDomain(story.linkstory) === source;
    return statusMatch && sourceMatch && (version === 'all' || story.version === version) && (!query || `${story.title} ${sourceDomain(story.linkstory)}`.toLocaleLowerCase('vi').includes(query));
  });
  list.sort((a, b) => {
    if (sort === 'votes-asc') return a.votes - b.votes;
    if (sort === 'newest') return new Date(b.createdat || 0) - new Date(a.createdat || 0);
    if (sort === 'oldest') return new Date(a.createdat || 0) - new Date(b.createdat || 0);
    if (sort === 'title') return a.title.localeCompare(b.title, 'vi');
    return b.votes - a.votes;
  });
  return list;
}

function renderStorySourceOptions() {
  const select = $('#storySourceFilter'); const current = select.value || 'all';
  const domains = [...new Set(state.stories.map((story) => sourceDomain(story.linkstory)).filter((item) => item !== 'Không rõ nguồn'))].sort();
  select.replaceChildren();
  [['all','Mọi nguồn'],['problem','Nguồn cần xử lý'], ...domains.map((domain) => [domain, domain])].forEach(([value, label]) => {
    const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
  });
  select.value = [...select.options].some((option) => option.value === current) ? current : 'all';
}

function renderStories() {
  const host = $('#storyTable'); host.replaceChildren();
  const stories = storyFilters();
  $('#storyResultCount').textContent = number.format(stories.length);
  const missingCovers = state.stories.filter((story) => !story.deletedat && story.linkstory && !story.thumbnail_url).length;
  $('#missingCoverCount').textContent = number.format(missingCovers);
  $('#scanStoryCovers').disabled = !missingCovers;
  const activeFilters = [];
  if ($('#storyVersionFilter').value !== 'all') activeFilters.push($('#storyVersionFilter').value);
  if ($('#storySourceFilter').value !== 'all') activeFilters.push($('#storySourceFilter').selectedOptions[0]?.textContent || 'Nguồn');
  $('#storyFilterSummary').textContent = activeFilters.length ? `Đang lọc: ${activeFilters.join(' · ')}` : 'Đang hiển thị mọi loại bản và nguồn';
  $('#storyFilterCount').textContent = activeFilters.length;
  $('#storyFilterCount').hidden = !activeFilters.length;
  const totalPages = Math.max(1, Math.ceil(stories.length / state.storyPageSize));
  state.storyPage = Math.min(Math.max(1, state.storyPage), totalPages);
  sessionStorage.setItem('hoiam_admin_story_page', String(state.storyPage));
  const visibleStories = stories.slice((state.storyPage - 1) * state.storyPageSize, state.storyPage * state.storyPageSize);
  $('#storyPageNumber').textContent = number.format(state.storyPage);
  $('#storyPageTotal').textContent = number.format(totalPages);
  $('#storyPrevPage').disabled = state.storyPage <= 1;
  $('#storyNextPage').disabled = state.storyPage >= totalPages;
  $('#storyPager').hidden = stories.length <= state.storyPageSize;
  visibleStories.forEach((story) => {
    const tr = document.createElement('tr');
    const status = story.deletedat ? 'trash' : story.status;
    tr.innerHTML = `<td data-label="Truyện"><div class="story-cell"><span class="admin-story-cover"><i class="fa-solid fa-book"></i></span><div><strong></strong><small><b class="story-version"></b><i></i></small></div></div></td><td data-label="Nguồn"><div class="source-state"><strong></strong><small></small></div></td><td data-label="Quan tâm"><div class="story-interest"><strong><i class="fa-solid fa-heart"></i> ${number.format(story.votes)}</strong><small>${number.format(story.views)} mở · ${number.format(story.youtube_clicks)} YouTube</small></div></td><td data-label="Trạng thái"><span class="status-pill" data-status="${status}">${statusLabel(status)}</span></td><td data-label="Thao tác"><div class="row-actions"><a target="_blank" rel="noopener noreferrer" title="Mở nguồn" aria-label="Mở nguồn truyện trong tab mới"><i class="fa-solid fa-arrow-up-right-from-square"></i></a><button type="button" title="Mở chỉnh sửa" aria-label="Mở chỉnh sửa truyện"><i class="fa-solid fa-pen"></i></button></div></td>`;
    $('.story-cell strong', tr).textContent = story.title;
    $('.story-version', tr).textContent = story.version;
    $('.story-version', tr).dataset.version = story.version.toLowerCase();
    $('.story-cell small i', tr).textContent = `#${story.id}`;
    if (story.thumbnail_url) {
      const cover = $('.admin-story-cover', tr); const image = new Image(); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
      image.addEventListener('load', () => cover.classList.add('has-image'));
      image.addEventListener('error', () => image.remove());
      image.src = story.thumbnail_url; cover.append(image);
    }
    $('.source-state strong', tr).textContent = sourceDomain(story.linkstory); $('.source-state small', tr).textContent = sourceLabel(story.source_status);
    const sourceAction = $('.row-actions a', tr); sourceAction.href = story.linkstory || '#'; sourceAction.hidden = !story.linkstory;
    if (['suspected', 'confirmed'].includes(story.source_status)) $('.source-state', tr).classList.add('problem');
    $('button', tr).addEventListener('click', () => openStoryDrawer(story.id));
    tr.tabIndex = 0;
    tr.addEventListener('click', (event) => { if (!event.target.closest('button,a,input,select')) openStoryDrawer(story.id); });
    tr.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.target.closest('button,a,input,select')) openStoryDrawer(story.id); });
    host.append(tr);
  });
  if (!host.children.length) host.innerHTML = '<tr class="empty-row"><td colspan="5"><div class="empty">Không có truyện phù hợp.</div></td></tr>';
}

function refreshStoryState(rawStory) {
  if (!rawStory) return;
  const story = normalizeStory(rawStory);
  const index = state.stories.findIndex((item) => item.id === story.id);
  if (index >= 0) state.stories[index] = story;
  else state.stories.unshift(story);
  renderStorySourceOptions(); renderDashboard(); renderStories(); renderSources(); fillStorySelects();
}

function localDateTime(value) {
  if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function storyFormSnapshot() {
  const form = $('#storyEditForm');
  if (!form) return '';
  const values = Object.fromEntries(new FormData(form));
  values.visible = form.elements.visible.checked;
  values.source_warning_public = form.elements.source_warning_public.checked;
  return JSON.stringify(values);
}

function updateDrawerSourceAction() {
  const link = $('#drawerOpenSource'); if (!link) return;
  const url = safeUrl($('#editLinkStory')?.value);
  link.href = url || '#'; link.classList.toggle('disabled', !url); link.setAttribute('aria-disabled', String(!url));
}

function markStoryDirty() {
  state.storyDirty = Boolean(state.activeStory && state.storyBaseline && storyFormSnapshot() !== state.storyBaseline);
  $('#storyEditForm')?.classList.toggle('has-unsaved-changes', state.storyDirty);
}

async function openStoryDrawer(id) {
  if ($('#storyDrawer').classList.contains('open') && state.storyDirty) {
    const discard = await confirmAction('Bỏ thay đổi chưa lưu?', 'Nội dung bạn vừa sửa sẽ không được giữ.', 'Bỏ thay đổi');
    if (!discard) return;
  }
  const story = state.stories.find((item) => item.id === id); if (!story) return;
  state.activeStory = story; const form = $('#storyEditForm');
  for (const name of ['id','title','linkstory','youtubelink','thumbnail_url','version','votes','status','note','source_status','source_reason']) form.elements[name].value = story[name] ?? '';
  form.elements.source_deadline.value = localDateTime(story.source_deadline);
  form.elements.source_warning_public.checked = story.source_warning_public;
  form.elements.visible.checked = story.visible && !story.deletedat;
  $('#storyContentSection').open = true;
  $('#storySourceSection').open = story.source_status !== 'normal' || Boolean(story.source_deadline || story.source_warning_public);
  $('#drawerStoryTitle').textContent = story.title; $('#sourceCheckResult').className = 'inline-result hidden';
  const trashButton = $('#trashStoryButton');
  trashButton.dataset.action = story.deletedat ? 'restore' : 'trash';
  trashButton.className = `btn ${story.deletedat ? 'btn-success' : 'btn-danger'}`;
  trashButton.innerHTML = story.deletedat ? '<i class="fa-solid fa-trash-arrow-up"></i> Khôi phục truyện' : '<i class="fa-solid fa-trash"></i> Chuyển vào thùng rác';
  refreshImagePreviews('#storyThumbnailPreview');
  updateDrawerSourceAction();
  state.storyBaseline = storyFormSnapshot(); state.storyDirty = false; form.classList.remove('has-unsaved-changes');
  const drawer = $('#storyDrawer'); returnFocus.set(drawer, document.activeElement);
  const drawerBody = $('.drawer-body', drawer); if (drawerBody) drawerBody.scrollTop = 0;
  drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); document.body.classList.add('drawer-open');
  window.requestAnimationFrame(() => $('[data-close-drawer]', drawer)?.focus({ preventScroll: true }));
}

function closeDrawer() {
  const drawer = $('#storyDrawer'); drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); document.body.classList.remove('drawer-open'); state.activeStory = null;
  state.storyBaseline = ''; state.storyDirty = false; $('#storyEditForm')?.classList.remove('has-unsaved-changes');
  const target = returnFocus.get(drawer); returnFocus.delete(drawer);
  if (target?.isConnected) window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
}

async function requestCloseDrawer() {
  if (state.storyDirty) {
    const discard = await confirmAction('Bỏ thay đổi chưa lưu?', 'Nếu đóng bây giờ, nội dung bạn vừa sửa sẽ mất.', 'Đóng không lưu');
    if (!discard) return;
  }
  closeDrawer();
}

async function saveStory(event) {
  event.preventDefault(); const form = event.currentTarget; const id = Number(form.elements.id.value); const old = state.activeStory;
  let status = form.elements.status.value;
  const newYoutube = form.elements.youtubelink.value.trim();
  if (old && !old.youtubelink && newYoutube && !['đang lên sóng','đã hoàn thành'].includes(status)) {
    const switchStatus = await confirmAction('Đã thêm link YouTube', 'Chuyển truyện sang “Đang lên sóng”?', 'Chuyển trạng thái', 'question');
    if (switchStatus) status = 'đang lên sóng';
  }
  const payload = {
    title: form.elements.title.value, linkstory: form.elements.linkstory.value,
    youtubelink: newYoutube, thumbnail_url: form.elements.thumbnail_url.value,
    auto_thumbnail: !safeUrl(form.elements.thumbnail_url.value),
    version: form.elements.version.value, votes: Number(form.elements.votes.value), status,
    note: form.elements.note.value, source_status: form.elements.source_status.value,
    source_reason: form.elements.source_reason.value, source_deadline: form.elements.source_deadline.value || null,
    source_warning_public: form.elements.source_warning_public.checked,
    visible: form.elements.visible.checked, deletedat: null,
  };
  const button = form.querySelector('[type="submit"]');
  try {
    if (button) { button.disabled = true; button.classList.add('loading'); }
    const result = await request(`/admin/stories/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    refreshStoryState(result.story); state.storyDirty = false; closeDrawer(); toast('Đã lưu truyện.');
  }
  catch (error) { toast(error.message, 'error'); }
  finally { if (button) { button.disabled = false; button.classList.remove('loading'); } }
}

async function trashStory() {
  const id = Number($('#storyEditForm').elements.id.value); if (!id) return;
  if ($('#trashStoryButton').dataset.action === 'restore') {
    if (!await confirmAction('Khôi phục truyện?', 'Truyện sẽ xuất hiện lại trong kho theo trạng thái đã lưu.', 'Khôi phục', 'question')) return;
    try {
      const result = await request(`/admin/stories/${id}`, { method: 'PATCH', body: JSON.stringify({ deletedat: null, visible: true }) });
      refreshStoryState(result.story); state.storyDirty = false; closeDrawer(); toast('Đã khôi phục truyện.');
    } catch (error) { toast(error.message, 'error'); }
    return;
  }
  if (!await confirmAction('Chuyển vào thùng rác?', 'Truyện sẽ bị ẩn nhưng dữ liệu vẫn được giữ.', 'Chuyển vào thùng rác')) return;
  try { const result = await request(`/admin/stories/${id}`, { method: 'DELETE', body: '{}' }); refreshStoryState(result.story); state.storyDirty = false; closeDrawer(); toast('Đã chuyển vào thùng rác.'); }
  catch (error) { toast(error.message, 'error'); }
}

async function checkSource() {
  const url = $('#storyEditForm').elements.linkstory.value; const result = $('#sourceCheckResult');
  if (!url) return toast('Truyện chưa có link nguồn.', 'warning');
  result.className = 'inline-result'; result.textContent = 'Đang kiểm tra phản hồi…';
  try {
    const payload = await request('/admin/check-source', { method: 'POST', body: JSON.stringify({ url }) });
    result.className = `inline-result ${payload.reachable ? 'ok' : 'warn'}`;
    result.textContent = `${payload.status ? `HTTP ${payload.status} · ` : ''}${payload.note}`;
    if (!payload.reachable) result.textContent += ' · Bạn quyết định trạng thái nguồn trước khi lưu.';
  } catch (error) { result.className = 'inline-result warn'; result.textContent = error.message; }
}

async function findStoryCover(silent = false) {
  const form = $('#storyEditForm'); const button = $('#findStoryCoverButton');
  const sourceUrl = safeUrl(form?.elements.linkstory.value);
  if (!sourceUrl) {
    if (!silent) toast('Truyện chưa có link nguồn hợp lệ.', 'warning');
    return '';
  }
  if (button?.disabled) return '';
  try {
    if (button) { button.disabled = true; button.classList.add('loading'); }
    const payload = await request('/admin/cover-image', { method: 'POST', body: JSON.stringify({ url: sourceUrl }) });
    const imageUrl = safeUrl(payload.image_url);
    if (!imageUrl) throw new Error(payload.reason || 'Trang nguồn không có ảnh bìa phù hợp.');
    form.elements.thumbnail_url.value = imageUrl;
    form.elements.thumbnail_url.dispatchEvent(new Event('input', { bubbles: true }));
    refreshImagePreviews('#storyThumbnailPreview');
    markStoryDirty();
    if (!silent) toast('Đã lấy ảnh bìa từ trang nguồn.');
    return imageUrl;
  } catch (error) {
    if (!silent) toast(error.message, error.status === 404 ? 'info' : 'warning');
    return '';
  } finally {
    if (button) { button.disabled = false; button.classList.remove('loading'); }
  }
}

async function scanMissingStoryCovers() {
  const queue = state.stories.filter((story) => !story.deletedat && story.linkstory && !story.thumbnail_url);
  if (!queue.length) return toast('Tất cả truyện có thể nhận diện đều đã có ảnh bìa.', 'info');
  const accepted = await confirmAction(
    `Rà ${number.format(queue.length)} truyện chưa có ảnh?`,
    'Hệ thống sẽ đọc lần lượt các website nguồn và lưu ngay ảnh tìm được. Có thể đóng rồi chạy tiếp nếu chưa hoàn tất.',
    'Bắt đầu rà',
    'question'
  );
  if (!accepted) return;

  const button = $('#scanStoryCovers'); const label = $('span', button);
  let cursor = 0; let finished = 0; let found = 0; let notFound = 0;
  button.disabled = true; button.classList.add('loading');

  async function worker() {
    while (cursor < queue.length) {
      const story = queue[cursor]; cursor += 1;
      try {
        const payload = await request('/admin/cover-image', {
          method: 'POST',
          body: JSON.stringify({ url: story.linkstory, story_id: story.id }),
        });
        if (payload.story) {
          const normalized = normalizeStory(payload.story);
          const index = state.stories.findIndex((item) => item.id === normalized.id);
          if (index >= 0) state.stories[index] = normalized;
          found += 1;
        } else notFound += 1;
      } catch { notFound += 1; }
      finished += 1;
      label.textContent = `Đang rà ${number.format(finished)}/${number.format(queue.length)}`;
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
    renderStorySourceOptions(); renderDashboard(); renderStories(); renderSources();
    toast(`Đã thêm ${number.format(found)} ảnh bìa${notFound ? ` · ${number.format(notFound)} trang chưa tìm thấy ảnh` : ''}.`, found ? 'success' : 'info');
  } finally {
    label.textContent = 'Rà ảnh bìa'; button.classList.remove('loading');
    button.disabled = !state.stories.some((story) => !story.deletedat && story.linkstory && !story.thumbnail_url);
  }
}

function donationFilters() {
  const query = ($('#donationSearch').value || '').trim().toLocaleLowerCase('vi');
  const status = $('#donationFilter').value; const source = $('#donationSourceFilter').value; const sort = $('#donationSort').value;
  const list = state.donations.filter((item) => (status === 'all' || item.status === status)
    && (source === 'all' || item.source_channel === source)
    && (!query || `${item.donor_name} ${item.story_title} ${item.transaction_ref || ''}`.toLocaleLowerCase('vi').includes(query)));
  list.sort((a, b) => {
    if (sort === 'oldest') return new Date(a.createdat || a.donatedat || 0) - new Date(b.createdat || b.donatedat || 0);
    if (sort === 'amount-desc') return b.amount_vnd - a.amount_vnd;
    if (sort === 'amount-asc') return a.amount_vnd - b.amount_vnd;
    return new Date(b.createdat || b.donatedat || 0) - new Date(a.createdat || a.donatedat || 0);
  });
  return list;
}

function renderDonations() {
  $('#donationPendingCount').textContent = number.format(state.donations.filter((item) => item.status === 'pending').length);
  $('#donationTotalAmount').textContent = money.format(state.donations.filter((item) => item.status !== 'rejected').reduce((sum, item) => sum + item.amount_vnd, 0));
  $('#donationTotalStones').textContent = number.format(state.donations.filter((item) => item.status !== 'rejected').reduce((sum, item) => sum + item.stone_count, 0));
  $('#donationAppliedVotes').textContent = number.format(state.donations.reduce((sum, item) => sum + item.applied_votes, 0));
  const host = $('#donationTable'); host.replaceChildren();
  donationFilters().forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td data-label="Người gửi"><div class="story-cell donation-person"><span><i class="fa-solid fa-user"></i></span><div><strong></strong><small></small></div></div></td><td data-label="Truyện"><strong></strong></td><td data-label="Giá trị"><b>${money.format(item.amount_vnd)}</b><small class="cell-sub">${number.format(item.stone_count)} Cá/LT</small></td><td data-label="Vote"><b>${number.format(item.status === 'applied' ? item.applied_votes : item.suggested_votes)}</b><small class="cell-sub">${item.status === 'applied' ? 'đã cộng' : 'đề xuất'}</small></td><td data-label="Trạng thái"><span class="status-pill" data-status="${item.status}">${donationLabel(item.status)}</span></td><td data-label="Thao tác"><div class="row-actions donation-row-actions"></div></td>`;
    $('.story-cell strong', tr).textContent = item.donor_name; $('.story-cell small', tr).textContent = ({ website: 'Website', youtube: 'YouTube / email', admin: 'Admin nhập' })[item.source_channel] || 'Website'; $$('td strong', tr)[1].textContent = item.story_title;
    const actions = $('.row-actions', tr);
    function action(iconName, title, handler, className = '') { const button = document.createElement('button'); button.type = 'button'; button.title = title; button.setAttribute('aria-label', title); button.className = className; button.innerHTML = `<i class="fa-solid fa-${iconName}"></i>`; button.addEventListener('click', handler); actions.append(button); }
    action('eye', 'Xem chi tiết', () => openDonationDetail(item.id), 'action-view');
    if (item.status === 'pending') action('check', 'Xác nhận', () => updateDonation(item.id, 'confirm'));
    if (['confirmed','waiting_votes'].includes(item.status)) action('heart-circle-plus', 'Cộng vote', () => applyDonationVotes(item));
    if (!['applied','rejected'].includes(item.status)) action('xmark', 'Từ chối', () => updateDonation(item.id, 'reject'));
    if (item.status === 'applied' && item.email_status === 'failed') action('envelope-circle-check', 'Gửi lại email', () => updateDonation(item.id, 'retry_email'));
    tr.tabIndex = 0;
    tr.addEventListener('click', (event) => { if (!event.target.closest('button,a,input,select')) openDonationDetail(item.id); });
    tr.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.target.closest('button,a,input,select')) openDonationDetail(item.id); });
    host.append(tr);
  });
  if (!host.children.length) host.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty">Không có donate phù hợp.</div></td></tr>';
}

function donationDetailRow(iconName, label, value) {
  const row = document.createElement('div'); row.className = 'donation-detail-row';
  row.innerHTML = `<span><i class="fa-solid fa-${iconName}"></i></span><div><small></small><strong></strong></div>`;
  $('small', row).textContent = label; $('strong', row).textContent = value || '—'; return row;
}

function openDonationDetail(id) {
  const item = state.donations.find((donation) => donation.id === id); if (!item) return;
  $('#donationDetailTitle').textContent = item.story_title || `Donate #${item.id}`;
  const body = $('#donationDetailBody'); body.replaceChildren();
  const status = document.createElement('div'); status.className = 'donation-detail-status'; status.innerHTML = `<span class="status-pill" data-status="${item.status}">${donationLabel(item.status)}</span><b>${money.format(item.amount_vnd)}</b>`; body.append(status);
  const grid = document.createElement('div'); grid.className = 'donation-detail-grid';
  grid.append(
    donationDetailRow('user', 'Người gửi', item.donor_name),
    donationDetailRow('fish-fins', 'Cá / Linh Thạch', number.format(item.stone_count)),
    donationDetailRow('heart', 'Vote đề xuất', number.format(item.suggested_votes)),
    donationDetailRow('circle-check', 'Vote đã cộng', number.format(item.applied_votes)),
    donationDetailRow('envelope', 'Email nhận kết quả', item.donor_email),
    donationDetailRow('hashtag', 'Mã giao dịch', item.transaction_ref),
    donationDetailRow('calendar', 'Thời gian', item.donatedat ? new Date(item.donatedat).toLocaleString('vi-VN') : ''),
    donationDetailRow('globe', 'Nguồn báo', ({ website: 'Website', youtube: 'YouTube / email', admin: 'Admin nhập' })[item.source_channel] || item.source_channel),
  );
  body.append(grid);
  if (item.transfer_content) body.append(donationDetailRow('money-bill-transfer', 'Nội dung chuyển khoản', item.transfer_content));
  if (item.note) body.append(donationDetailRow('note-sticky', 'Ghi chú', item.note));
  const actions = $('#donationDetailActions'); actions.replaceChildren();
  const addAction = (label, iconName, className, handler) => { const button = document.createElement('button'); button.type = 'button'; button.className = `btn ${className}`; button.innerHTML = `<i class="fa-solid fa-${iconName}"></i> ${label}`; button.addEventListener('click', () => { closeDialog($('#donationDetailDialog')); handler(); }); actions.append(button); };
  const close = document.createElement('button'); close.type = 'button'; close.className = 'btn btn-ghost'; close.textContent = 'Đóng'; close.addEventListener('click', () => closeDialog($('#donationDetailDialog'))); actions.append(close);
  if (item.status === 'pending') addAction('Xác nhận', 'check', 'btn-success', () => updateDonation(item.id, 'confirm'));
  if (['confirmed','waiting_votes'].includes(item.status)) addAction('Cộng vote', 'heart-circle-plus', 'btn-primary', () => applyDonationVotes(item));
  if (!['applied','rejected'].includes(item.status)) addAction('Từ chối', 'xmark', 'btn-danger', () => updateDonation(item.id, 'reject'));
  if (item.status === 'applied' && item.email_status === 'failed') addAction('Gửi lại email', 'envelope-circle-check', 'btn-primary', () => updateDonation(item.id, 'retry_email'));
  openDialog($('#donationDetailDialog'));
}

async function updateDonation(id, action, extra = {}) {
  const labels = { confirm: 'xác nhận giao dịch', reject: 'từ chối giao dịch', retry_email: 'gửi lại email' };
  if (action !== 'retry_email' && !await confirmAction('Xác nhận thao tác?', `Bạn sắp ${labels[action]}.`, 'Tiếp tục')) return;
  try { const result = await request(`/admin/donations/${id}`, { method: 'PATCH', body: JSON.stringify({ action, ...extra }) }); await reloadDonations(); if (result.email?.error) toast(`Vote đã giữ, nhưng email lỗi: ${result.email.error}`, 'warning'); else toast('Đã cập nhật donate.'); }
  catch (error) { toast(error.message, 'error'); }
}

async function applyDonationVotes(item) {
  let votes = item.suggested_votes;
  if (window.Swal) {
    const result = await Swal.fire({ title: 'Số vote sẽ cộng', html: `<p>${item.story_title}</p><p>${money.format(item.amount_vnd)} · ${number.format(item.stone_count)} Cá/Linh Thạch</p>`, input: 'number', inputValue: votes, inputAttributes: { min: 0, max: 1000000, step: 1 }, showCancelButton: true, confirmButtonText: 'Cộng vote', cancelButtonText: 'Hủy', customClass: { popup: 'cosmic-swal' } });
    if (!result.isConfirmed) return; votes = Math.max(0, Math.floor(Number(result.value)));
  }
  try {
    const result = await request(`/admin/donations/${item.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'apply_votes', applied_votes: votes }) });
    await Promise.all([reloadStories(), reloadDonations()]);
    if (result.result?.already_applied) toast('Giao dịch đã được cộng trước đó, không cộng lần hai.', 'info');
    else if (result.email?.error) toast(`Đã cộng ${votes} vote; email lỗi và có thể gửi lại.`, 'warning');
    else toast(`Đã cộng ${votes} vote.`);
  } catch (error) { toast(error.message, 'error'); }
}

function renderSources() {
  const problems = state.stories.filter((story) => !story.deletedat && ['suspected','confirmed'].includes(story.source_status));
  const host = $('#problemSourceList'); host.replaceChildren();
  problems.forEach((story) => { const item = document.createElement('div'); item.className = 'source-item'; item.innerHTML = '<div><strong></strong><small></small></div><div class="actions"><button class="small-btn" type="button">Mở</button></div>'; $('strong', item).textContent = story.title; $('small', item).textContent = `${sourceLabel(story.source_status)}${story.source_deadline ? ` · hạn ${new Date(story.source_deadline).toLocaleDateString('vi-VN')}` : ''}`; $('button', item).addEventListener('click', () => openStoryDrawer(story.id)); host.append(item); });
  if (!host.children.length) host.innerHTML = '<div class="empty">Không có nguồn cần chú ý.</div>';
  const replacements = $('#replacementList'); replacements.replaceChildren();
  state.replacements.filter((item) => item.status === 'pending').forEach((item) => { const story = state.stories.find((s) => s.id === Number(item.story_id)); const row = document.createElement('div'); row.className = 'source-item'; row.innerHTML = '<div><strong></strong><small></small><a target="_blank" rel="noopener noreferrer">Mở nguồn mới</a></div><div class="actions"><button class="small-btn approve" type="button">Duyệt</button><button class="small-btn reject" type="button">Từ chối</button></div>'; $('strong', row).textContent = story?.title || `Truyện #${item.story_id}`; $('small', row).textContent = item.sender_name ? `Gửi bởi ${item.sender_name}` : 'Cộng đồng gửi'; $('a', row).href = item.replacement_url; $('.approve', row).addEventListener('click', () => reviewReplacement(item.id, 'approve')); $('.reject', row).addEventListener('click', () => reviewReplacement(item.id, 'reject')); replacements.append(row); });
  if (!replacements.children.length) replacements.innerHTML = '<div class="empty">Không có nguồn thay thế chờ duyệt.</div>';
}

async function reviewReplacement(id, action) {
  if (!await confirmAction(action === 'approve' ? 'Dùng nguồn mới?' : 'Từ chối nguồn?', action === 'approve' ? 'Link truyện sẽ được thay và cảnh báo được tắt.' : 'Nguồn hiện tại của truyện không thay đổi.', action === 'approve' ? 'Duyệt nguồn' : 'Từ chối')) return;
  try { await request(`/admin/source-replacements/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) }); await Promise.all([reloadStories(), reloadReplacements()]); toast('Đã xử lý nguồn thay thế.'); }
  catch (error) { toast(error.message, 'error'); }
}

function renderAnnouncements() {
  const host = $('#announcementList'); host.replaceChildren();
  const modeLabels = { banner: 'Thanh thông báo', toast: 'Góc màn hình', modal: 'Hộp thoại' };
  const scopeLabels = { all: 'Toàn website', home: 'Trang chủ', library: 'Kho truyện', completed: 'Đã hoàn thành', guide: 'Hướng dẫn', about: 'About Me', privacy: 'Quyền riêng tư', terms: 'Điều khoản' };
  state.announcements.forEach((item) => {
    const row = document.createElement('div'); row.className = `announcement-item${item.enabled ? '' : ' disabled'}`;
    row.innerHTML = `<span class="announcement-tone"><i class="fa-solid fa-bell"></i></span><div><strong></strong><small></small></div><div class="actions"><button class="small-btn edit" type="button"><i class="fa-solid fa-pen"></i> Sửa</button><button class="small-btn toggle" type="button">${item.enabled ? 'Tạm ẩn' : 'Bật lại'}</button><button class="small-btn delete" type="button" aria-label="Xóa thông báo"><i class="fa-solid fa-trash"></i></button></div>`;
    $('strong', row).textContent = item.title;
    $('small', row).textContent = `${modeLabels[item.display_mode] || 'Thanh thông báo'} · ${scopeLabels[item.page_scope] || 'Toàn website'} · ${item.message}`;
    $('.edit', row).addEventListener('click', () => openAnnouncementDialog(item));
    $('.toggle', row).addEventListener('click', () => editAnnouncement(item.id, { enabled: !item.enabled }));
    $('.delete', row).addEventListener('click', () => deleteAnnouncement(item.id)); host.append(row);
  });
  if (!host.children.length) host.innerHTML = '<div class="empty">Chưa có thông báo.</div>';
}

function openAnnouncementDialog(item = null) {
  const form = $('#announcementForm'); form.reset(); state.activeAnnouncement = item;
  form.elements.id.value = item?.id || '';
  for (const name of ['title','message','tone','display_mode','page_scope']) {
    if (item && form.elements[name]) form.elements[name].value = item[name] || (name === 'page_scope' ? 'all' : '');
  }
  form.elements.startsat.value = localDateTime(item?.startsat);
  form.elements.endsat.value = localDateTime(item?.endsat);
  form.elements.dismissible.checked = item ? item.dismissible !== false : true;
  $('#announcementEyebrow').textContent = item ? 'Chỉnh sửa thông báo' : 'Thông báo mới';
  $('#announcementDialogTitle').textContent = item ? 'Cập nhật thông báo' : 'Đăng thông báo';
  $('#saveAnnouncementButton').innerHTML = item ? '<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi' : '<i class="fa-solid fa-paper-plane"></i> Đăng thông báo';
  openDialog($('#announcementDialog'));
}

async function editAnnouncement(id, payload) { try { await request(`/admin/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); await reloadAnnouncements(); toast('Đã cập nhật thông báo.'); } catch (error) { toast(error.message, 'error'); } }
async function deleteAnnouncement(id) { if (!await confirmAction('Xóa thông báo?', 'Thông báo sẽ biến mất khỏi website.', 'Xóa')) return; try { await request(`/admin/announcements/${id}`, { method: 'DELETE', body: '{}' }); await reloadAnnouncements(); toast('Đã xóa thông báo.'); } catch (error) { toast(error.message, 'error'); } }

function socialRow(item = {}) {
  const row = document.createElement('div'); row.className = 'social-row';
  row.innerHTML = '<div class="social-row-fields"><input name="label" aria-label="Tên liên kết" placeholder="Tên hiển thị"><input name="url" type="url" aria-label="Đường dẫn" placeholder="https://…"><input name="icon" aria-label="Mã icon" placeholder="fa-link"><input name="color" type="color" aria-label="Màu nhận diện"><button type="button" aria-label="Xóa liên kết"><i class="fa-solid fa-trash"></i></button></div><input class="social-description" name="description" maxlength="180" aria-label="Mô tả liên kết" placeholder="Mô tả ngắn để người xem muốn khám phá liên kết này…">';
  row.elements = { label: $('[name="label"]', row), url: $('[name="url"]', row), description: $('[name="description"]', row), icon: $('[name="icon"]', row), color: $('[name="color"]', row) };
  row.elements.label.value = item.label || ''; row.elements.url.value = item.url || ''; row.elements.description.value = item.description || ''; row.elements.icon.value = item.icon || 'fa-link'; row.elements.color.value = /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : '#a78bfa';
  $('button', row).addEventListener('click', () => row.remove()); return row;
}

function renderSettings() {
  if (!state.settings) return;
  const form = $('#settingsForm'); const settings = state.settings; const donation = settings.donation || {};
  for (const key of ['channelName','tagline','youtubeUrl','logoUrl','aboutTitle','aboutBody','contactEmail']) form.elements[key].value = settings[key] || '';
  form.elements.donationEnabled.checked = donation.enabled === true;
  for (const key of ['bankName','bankId','accountName','accountNumber','qrUrl','transferTemplate']) form.elements[key].value = donation[key] || '';
  form.elements.donationNote.value = donation.note || '';
  const host = $('#socialLinkRows'); host.replaceChildren(...(settings.socialLinks || []).map(socialRow));
  if (!host.children.length) host.append(socialRow());
  refreshImagePreviews('#settingsLogoPreview');
  refreshImagePreviews('#settingsQrPreview');
  markSettingsDirty(false);
}

function markSettingsDirty(dirty = true) {
  const stateNode = $('#settingsSaveState'); const button = $('#saveSettingsButton');
  if (stateNode) {
    stateNode.classList.toggle('dirty', dirty);
    stateNode.innerHTML = dirty ? '<i class="fa-solid fa-pen"></i> Có thay đổi chưa lưu' : '<i class="fa-solid fa-circle-check"></i> Mọi thay đổi đã được lưu';
  }
  if (button) button.classList.toggle('save-pending', dirty);
}

async function saveSettings(event) {
  event?.preventDefault();
  const form = $('#settingsForm');
  const socialLinks = $$('.social-row', $('#socialLinkRows')).map((row, index) => ({ id: `link-${index + 1}`, label: row.elements.label.value, url: row.elements.url.value, description: row.elements.description.value, icon: row.elements.icon.value, color: row.elements.color.value, visible: true })).filter((item) => item.label && item.url);
  const settings = {
    channelName: form.elements.channelName.value, tagline: form.elements.tagline.value,
    youtubeUrl: form.elements.youtubeUrl.value, logoUrl: form.elements.logoUrl.value,
    aboutTitle: form.elements.aboutTitle.value, aboutBody: form.elements.aboutBody.value,
    contactEmail: form.elements.contactEmail.value, socialLinks,
    donation: {
      enabled: form.elements.donationEnabled.checked, bankName: form.elements.bankName.value,
      bankId: form.elements.bankId.value,
      accountName: form.elements.accountName.value, accountNumber: form.elements.accountNumber.value,
      qrUrl: form.elements.qrUrl.value, transferTemplate: form.elements.transferTemplate.value,
      note: form.elements.donationNote.value, unitLabel: 'Cá/Linh Thạch',
    },
  };
  try { await request('/admin/settings', { method: 'PATCH', body: JSON.stringify({ settings }) }); await reloadSettings(); markSettingsDirty(false); toast('Đã lưu cài đặt website.'); }
  catch (error) { toast(error.message, 'error'); }
}

function fillStorySelects() {
  const list = $('#externalDonationStoryList');
  if (!list) return;
  list.replaceChildren(...state.stories.filter((story) => !story.deletedat).map((story) => {
    const option = document.createElement('option'); option.value = `${story.id} · ${story.title}`; return option;
  }));
}

function openDialog(dialog) {
  if (!dialog || dialog.open) return;
  returnFocus.set(dialog, document.activeElement);
  if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  window.requestAnimationFrame(() => $('input:not([type="hidden"]),button,select,textarea', dialog)?.focus({ preventScroll: true }));
}
function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog.open && dialog.close) dialog.close(); else dialog.removeAttribute('open');
}

function restoreDialogFocus(dialog) {
  const target = returnFocus.get(dialog); returnFocus.delete(dialog);
  if (target?.isConnected) window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
}

async function addCompleted(event) {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
  try { await request('/admin/stories', { method: 'POST', body: JSON.stringify(data) }); closeDialog($('#completedDialog')); form.reset(); await reloadStories(); toast('Đã thêm truyện vào kho hoàn thành.'); }
  catch (error) { toast(error.message, 'error'); }
}

async function addExternalDonation(event) {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
  const storyText = form.elements.story_display.value.trim();
  const story = state.stories.find((item) => `${item.id} · ${item.title}` === storyText && !item.deletedat);
  if (!story) { form.elements.story_display.setCustomValidity('Hãy chọn một truyện trong danh sách.'); form.elements.story_display.reportValidity(); return; }
  form.elements.story_display.setCustomValidity(''); data.story_id = story.id; delete data.story_display; data.amount_vnd = Number(data.amount_vnd);
  try { await request('/admin/donations', { method: 'POST', body: JSON.stringify(data) }); closeDialog($('#externalDonationDialog')); form.reset(); await reloadDonations(); toast('Đã thêm giao dịch ngoài website.'); }
  catch (error) { toast(error.message, 'error'); }
}

async function saveAnnouncement(event) {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); data.dismissible = form.elements.dismissible.checked;
  const id = Number(data.id || 0); delete data.id;
  try {
    await request(id ? `/admin/announcements/${id}` : '/admin/announcements', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    closeDialog($('#announcementDialog')); form.reset(); state.activeAnnouncement = null; await reloadAnnouncements(); toast(id ? 'Đã lưu thông báo.' : 'Đã đăng thông báo.');
  }
  catch (error) { toast(error.message, 'error'); }
}

function bindEvents() {
  $('#loginForm').addEventListener('submit', login); $('#logoutButton').addEventListener('click', logout);
  $$('#adminNav [data-view]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.view === 'stories') { setStoryMenu(!$('[data-nav-group="stories"]').classList.contains('expanded')); return; }
    switchView(button.dataset.view); setSidebar(false);
  }));
  $$('[data-story-status]').forEach((button) => button.addEventListener('click', () => { selectStoryStatus(button.dataset.storyStatus); setSidebar(false); }));
  $$('[data-dashboard-status]').forEach((button) => button.addEventListener('click', () => selectStoryStatus(button.dataset.dashboardStatus)));
  $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.goView)));
  $('#sidebarToggle').addEventListener('click', () => setSidebar(!$('.sidebar').classList.contains('open')));
  $('#sidebarClose').addEventListener('click', () => setSidebar(false));
  $('#sidebarBackdrop').addEventListener('click', () => setSidebar(false));
  window.addEventListener('resize', () => { if (window.innerWidth > 1024) setSidebar(false); });
  $('#refreshButton').addEventListener('click', async () => { try { await loadAll(); toast('Đã tải dữ liệu mới.'); } catch (error) { toast(error.message, 'error'); } });
  let storySearchTimer = null;
  ['storySearch','storyVersionFilter','storySourceFilter','storySort'].forEach((id) => $(`#${id}`).addEventListener(id === 'storySearch' ? 'input' : 'change', () => {
    state.storyPage = 1;
    if (id !== 'storySearch') return renderStories();
    window.clearTimeout(storySearchTimer); storySearchTimer = window.setTimeout(renderStories, 120);
  }));
  $('#storyFilterToggle').addEventListener('click', () => {
    const panel = $('#storyAdvancedFilters'); const open = panel.hidden;
    panel.hidden = !open; $('#storyFilterToggle').setAttribute('aria-expanded', String(open));
  });
  $('#resetStoryFilters').addEventListener('click', () => {
    $('#storyVersionFilter').value = 'all'; $('#storySourceFilter').value = 'all'; state.storyPage = 1; renderStories();
  });
  $('#storyPrevPage').addEventListener('click', () => { state.storyPage = Math.max(1, state.storyPage - 1); renderStories(); $('#storySearch').focus({ preventScroll: true }); });
  $('#storyNextPage').addEventListener('click', () => { state.storyPage += 1; renderStories(); $('#storySearch').focus({ preventScroll: true }); });
  ['donationSearch','donationFilter','donationSourceFilter','donationSort'].forEach((id) => $(`#${id}`).addEventListener(id === 'donationSearch' ? 'input' : 'change', renderDonations));
  $$('[data-close-drawer]').forEach((node) => node.addEventListener('click', requestCloseDrawer));
  $('#storyEditForm').addEventListener('input', markStoryDirty);
  $('#storyEditForm').addEventListener('change', markStoryDirty);
  $('#editLinkStory').addEventListener('input', updateDrawerSourceAction);
  $('#editLinkStory').addEventListener('change', () => {
    if (!safeUrl($('#storyEditForm').elements.thumbnail_url.value)) findStoryCover(true);
  });
  $('#drawerOpenSource').addEventListener('click', (event) => { if (event.currentTarget.classList.contains('disabled')) event.preventDefault(); });
  $('#storyEditForm').addEventListener('submit', saveStory); $('#trashStoryButton').addEventListener('click', trashStory); $('#checkSourceButton').addEventListener('click', checkSource);
  $('#findStoryCoverButton').addEventListener('click', () => findStoryCover(false));
  $('#scanStoryCovers').addEventListener('click', scanMissingStoryCovers);
  $$('[data-open-completed]').forEach((button) => button.addEventListener('click', () => {
    $('#completedForm').reset(); refreshImagePreviews('#completedThumbnailPreview'); openDialog($('#completedDialog'));
  }));
  $('#completedForm').addEventListener('submit', addCompleted);
  $('#openExternalDonation').addEventListener('click', () => openDialog($('#externalDonationDialog'))); $('#externalDonationForm').addEventListener('submit', addExternalDonation);
  $('#externalDonationForm').elements.story_display.addEventListener('input', (event) => event.currentTarget.setCustomValidity(''));
  $('#newAnnouncement').addEventListener('click', () => openAnnouncementDialog()); $('#announcementForm').addEventListener('submit', saveAnnouncement);
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  $$('.admin-dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); });
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener('close', () => restoreDialogFocus(dialog));
  });
  $('#settingsForm').addEventListener('submit', saveSettings);
  $('#settingsForm').addEventListener('input', () => markSettingsDirty(true));
  $('#settingsForm').addEventListener('change', () => markSettingsDirty(true));
  $('#addSocialLink').addEventListener('click', () => { $('#socialLinkRows').append(socialRow()); markSettingsDirty(true); });
  bindImagePreviews();
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if ($('#storyDrawer').classList.contains('open')) requestCloseDrawer();
    else if ($('.sidebar').classList.contains('open')) setSidebar(false);
  });
  window.addEventListener('beforeunload', (event) => { if (state.storyDirty) event.preventDefault(); });
}

function ensureCompatibleMarkup() {
  const markupVersion = document.querySelector('meta[name="admin-ui-version"]')?.content || '';
  if (markupVersion === ADMIN_UI_VERSION) return true;
  const url = new URL(window.location.href);
  if (url.searchParams.get('_admin_ui') !== ADMIN_UI_VERSION) {
    url.searchParams.set('_admin_ui', ADMIN_UI_VERSION);
    window.location.replace(url.href);
  }
  return false;
}

if (ensureCompatibleMarkup()) {
  bindEvents();
  trySession();
}
