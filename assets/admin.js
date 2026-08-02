const state = { stories: [], donations: [], replacements: [], announcements: [], settings: null, activeStory: null };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('vi-VN');

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
  const results = await Promise.allSettled([
    request('/admin/stories'), request('/admin/donations'), request('/admin/source-replacements'),
    request('/admin/announcements'), request('/admin/settings'),
  ]);
  if (results[0].status === 'rejected') throw results[0].reason;
  state.stories = (results[0].value.stories || []).map(normalizeStory);
  state.donations = results[1].status === 'fulfilled' ? (results[1].value.donations || []).map(normalizeDonation) : [];
  state.replacements = results[2].status === 'fulfilled' ? results[2].value.replacements || [] : [];
  state.announcements = results[3].status === 'fulfilled' ? results[3].value.announcements || [] : [];
  state.settings = results[4].status === 'fulfilled' ? results[4].value.settings : null;
  renderAll();
  const failed = results.slice(1).filter((item) => item.status === 'rejected');
  if (failed.length) toast('Một số mục cần chạy supabase.sql V06 trước.', 'warning');
}

async function trySession() {
  try { await loadAll(); setAuthenticated(true); }
  catch (error) { setAuthenticated(false); if (error.status !== 401) toast(error.message, 'error'); }
}

async function login(event) {
  event.preventDefault();
  try {
    await request('/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) });
    $('#password').value = ''; setAuthenticated(true); await loadAll(); toast('Đăng nhập thành công.');
  } catch (error) { toast(error.message, 'error'); }
}

async function logout() {
  try { await request('/admin/logout', { method: 'POST', body: '{}' }); } catch { /* vẫn đóng giao diện */ }
  setAuthenticated(false);
}

function switchView(name) {
  $$('.admin-view').forEach((view) => view.classList.toggle('active', view.dataset.section === name));
  $$('#adminNav button').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  const label = ({ overview: 'Tổng quan', stories: 'Truyện', donations: 'Donate', sources: 'Nguồn truyện', announcements: 'Thông báo', settings: 'Cài đặt' })[name];
  $('#currentViewLabel').textContent = label || name;
  $('.sidebar').classList.remove('open');
}

function renderAll() {
  renderDashboard(); renderStories(); renderDonations(); renderSources(); renderAnnouncements(); renderSettings(); fillStorySelects();
}

function renderDashboard() {
  const active = state.stories.filter((story) => !story.deletedat);
  $('#statProposed').textContent = number.format(active.filter((story) => story.status === 'đề xuất').length);
  $('#statSelected').textContent = number.format(active.filter((story) => story.status === 'đã chọn').length);
  $('#statAiring').textContent = number.format(active.filter((story) => story.status === 'đang lên sóng').length);
  const pendingDonations = state.donations.filter((item) => item.status === 'pending').length;
  $('#statDonationPending').textContent = number.format(pendingDonations);
  $('#navStoryCount').textContent = active.length;
  $('#navDonationCount').textContent = pendingDonations;
  const sourceProblems = active.filter((story) => ['suspected', 'confirmed'].includes(story.source_status)).length;
  $('#navSourceCount').textContent = sourceProblems + state.replacements.filter((item) => item.status === 'pending').length;

  const topHost = $('#dashboardTop'); topHost.replaceChildren();
  active.filter((story) => story.status === 'đề xuất').sort((a, b) => b.votes - a.votes).slice(0, 3).forEach((story, index) => {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'rank-item';
    row.innerHTML = `<span>0${index + 1}</span><div><strong></strong><small></small></div><b>${number.format(story.votes)} ♥</b>`;
    $('strong', row).textContent = story.title; $('small', row).textContent = `${story.version} · ${sourceDomain(story.linkstory)}`;
    row.addEventListener('click', () => openStoryDrawer(story.id)); topHost.append(row);
  });
  if (!topHost.children.length) topHost.innerHTML = '<div class="empty">Chưa có truyện đề xuất.</div>';

  const attention = $('#attentionList'); attention.replaceChildren();
  const attentionItems = [
    { icon: 'fish-fins', title: `${pendingDonations} donate chờ kiểm tra`, sub: 'Mở mục Donate', view: 'donations' },
    { icon: 'triangle-exclamation', title: `${sourceProblems} nguồn cần chú ý`, sub: 'Chỉ công khai khi bạn bật', view: 'sources' },
    { icon: 'link', title: `${state.replacements.filter((item) => item.status === 'pending').length} nguồn thay thế`, sub: 'Cộng đồng gửi', view: 'sources' },
  ];
  attentionItems.forEach((item) => { const row = document.createElement('button'); row.type = 'button'; row.className = 'attention-item'; row.innerHTML = `<span><i class="fa-solid fa-${item.icon}"></i></span><div><strong></strong><small></small></div>`; $('strong', row).textContent = item.title; $('small', row).textContent = item.sub; row.addEventListener('click', () => switchView(item.view)); attention.append(row); });

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
  renderStorySourceOptions();
  const host = $('#storyTable'); host.replaceChildren();
  storyFilters().forEach((story) => {
    const tr = document.createElement('tr');
    const status = story.deletedat ? 'trash' : story.status;
    tr.innerHTML = `<td><div class="story-cell"><span><i class="fa-solid fa-book"></i></span><div><strong></strong><small></small></div></div></td><td><div class="source-state"><strong></strong><small></small></div></td><td><span class="status-pill" data-status="${status}">${statusLabel(status)}</span></td><td><b>${number.format(story.votes)}</b></td><td><span>${number.format(story.views)} mở · ${number.format(story.youtube_clicks)} YT</span></td><td><div class="row-actions"><button type="button" title="Sửa"><i class="fa-solid fa-pen"></i></button></div></td>`;
    $('.story-cell strong', tr).textContent = story.title; $('.story-cell small', tr).textContent = `${story.version} · #${story.id}`;
    $('.source-state strong', tr).textContent = sourceDomain(story.linkstory); $('.source-state small', tr).textContent = sourceLabel(story.source_status);
    if (['suspected', 'confirmed'].includes(story.source_status)) $('.source-state', tr).classList.add('problem');
    $('button', tr).addEventListener('click', () => openStoryDrawer(story.id)); host.append(tr);
  });
  if (!host.children.length) host.innerHTML = '<tr><td colspan="6"><div class="empty">Không có truyện phù hợp.</div></td></tr>';
}

function localDateTime(value) {
  if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function openStoryDrawer(id) {
  const story = state.stories.find((item) => item.id === id); if (!story) return;
  state.activeStory = story; const form = $('#storyEditForm');
  for (const name of ['id','title','linkstory','youtubelink','thumbnail_url','version','votes','status','note','source_status','source_reason']) form.elements[name].value = story[name] ?? '';
  form.elements.source_deadline.value = localDateTime(story.source_deadline);
  form.elements.source_warning_public.checked = story.source_warning_public;
  form.elements.visible.checked = story.visible && !story.deletedat;
  $('#drawerStoryTitle').textContent = story.title; $('#sourceCheckResult').className = 'inline-result hidden';
  $('#storyDrawer').classList.add('open');
}

function closeDrawer() { $('#storyDrawer').classList.remove('open'); state.activeStory = null; }

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
    version: form.elements.version.value, votes: Number(form.elements.votes.value), status,
    note: form.elements.note.value, source_status: form.elements.source_status.value,
    source_reason: form.elements.source_reason.value, source_deadline: form.elements.source_deadline.value || null,
    source_warning_public: form.elements.source_warning_public.checked,
    visible: form.elements.visible.checked, deletedat: null,
  };
  try { await request(`/admin/stories/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); closeDrawer(); await loadAll(); toast('Đã lưu truyện.'); }
  catch (error) { toast(error.message, 'error'); }
}

async function trashStory() {
  const id = Number($('#storyEditForm').elements.id.value); if (!id) return;
  if (!await confirmAction('Chuyển vào thùng rác?', 'Truyện sẽ bị ẩn nhưng dữ liệu vẫn được giữ.', 'Chuyển vào thùng rác')) return;
  try { await request(`/admin/stories/${id}`, { method: 'DELETE', body: '{}' }); closeDrawer(); await loadAll(); toast('Đã chuyển vào thùng rác.'); }
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
    if (!payload.reachable && $('#storyEditForm').elements.source_status.value === 'normal') {
      $('#storyEditForm').elements.source_status.value = 'suspected';
    }
  } catch (error) { result.className = 'inline-result warn'; result.textContent = error.message; }
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
    tr.innerHTML = `<td><div class="story-cell donation-person"><span><i class="fa-solid fa-user"></i></span><div><strong></strong><small></small></div></div></td><td><strong></strong></td><td><b>${money.format(item.amount_vnd)}</b><small class="cell-sub">${number.format(item.stone_count)} Cá/LT</small></td><td><b>${number.format(item.status === 'applied' ? item.applied_votes : item.suggested_votes)}</b><small class="cell-sub">${item.status === 'applied' ? 'đã cộng' : 'đề xuất'}</small></td><td><span class="status-pill" data-status="${item.status}">${donationLabel(item.status)}</span></td><td><div class="row-actions donation-row-actions"></div></td>`;
    $('.story-cell strong', tr).textContent = item.donor_name; $('.story-cell small', tr).textContent = ({ website: 'Website', youtube: 'YouTube / email', admin: 'Admin nhập' })[item.source_channel] || 'Website'; $$('td strong', tr)[1].textContent = item.story_title;
    const actions = $('.row-actions', tr);
    function action(iconName, title, handler, className = '') { const button = document.createElement('button'); button.type = 'button'; button.title = title; button.setAttribute('aria-label', title); button.className = className; button.innerHTML = `<i class="fa-solid fa-${iconName}"></i>`; button.addEventListener('click', handler); actions.append(button); }
    action('eye', 'Xem chi tiết', () => openDonationDetail(item.id), 'action-view');
    if (item.status === 'pending') action('check', 'Xác nhận', () => updateDonation(item.id, 'confirm'));
    if (['confirmed','waiting_votes'].includes(item.status)) action('heart-circle-plus', 'Cộng vote', () => applyDonationVotes(item));
    if (!['applied','rejected'].includes(item.status)) action('xmark', 'Từ chối', () => updateDonation(item.id, 'reject'));
    if (item.status === 'applied' && item.email_status === 'failed') action('envelope-circle-check', 'Gửi lại email', () => updateDonation(item.id, 'retry_email'));
    host.append(tr);
  });
  if (!host.children.length) host.innerHTML = '<tr><td colspan="6"><div class="empty">Không có donate phù hợp.</div></td></tr>';
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
  try { const result = await request(`/admin/donations/${id}`, { method: 'PATCH', body: JSON.stringify({ action, ...extra }) }); await loadAll(); if (result.email?.error) toast(`Vote đã giữ, nhưng email lỗi: ${result.email.error}`, 'warning'); else toast('Đã cập nhật donate.'); }
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
    await loadAll();
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
  try { await request(`/admin/source-replacements/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) }); await loadAll(); toast('Đã xử lý nguồn thay thế.'); }
  catch (error) { toast(error.message, 'error'); }
}

function renderAnnouncements() {
  const host = $('#announcementList'); host.replaceChildren();
  state.announcements.forEach((item) => { const row = document.createElement('div'); row.className = 'announcement-item'; row.innerHTML = `<span class="announcement-tone"><i class="fa-solid fa-bell"></i></span><div><strong></strong><small></small></div><div class="actions"><button class="small-btn toggle" type="button">${item.enabled ? 'Tắt' : 'Bật'}</button><button class="small-btn delete" type="button"><i class="fa-solid fa-trash"></i></button></div>`; $('strong', row).textContent = item.title; $('small', row).textContent = `${item.display_mode} · ${item.message}`; $('.toggle', row).addEventListener('click', () => editAnnouncement(item.id, { enabled: !item.enabled })); $('.delete', row).addEventListener('click', () => deleteAnnouncement(item.id)); host.append(row); });
  if (!host.children.length) host.innerHTML = '<div class="empty">Chưa có thông báo.</div>';
}

async function editAnnouncement(id, payload) { try { await request(`/admin/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); await loadAll(); toast('Đã cập nhật thông báo.'); } catch (error) { toast(error.message, 'error'); } }
async function deleteAnnouncement(id) { if (!await confirmAction('Xóa thông báo?', 'Thông báo sẽ biến mất khỏi website.', 'Xóa')) return; try { await request(`/admin/announcements/${id}`, { method: 'DELETE', body: '{}' }); await loadAll(); toast('Đã xóa thông báo.'); } catch (error) { toast(error.message, 'error'); } }

function socialRow(item = {}) {
  const row = document.createElement('div'); row.className = 'social-row';
  row.innerHTML = '<input name="label" placeholder="Tên hiển thị"><input name="url" type="url" placeholder="https://…"><input name="icon" placeholder="fa-link"><input name="color" type="color"><button type="button"><i class="fa-solid fa-trash"></i></button>';
  row.elements = { label: $('[name="label"]', row), url: $('[name="url"]', row), icon: $('[name="icon"]', row), color: $('[name="color"]', row) };
  row.elements.label.value = item.label || ''; row.elements.url.value = item.url || ''; row.elements.icon.value = item.icon || 'fa-link'; row.elements.color.value = /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : '#a78bfa';
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
}

async function saveSettings(event) {
  event?.preventDefault();
  const form = $('#settingsForm');
  const socialLinks = $$('.social-row', $('#socialLinkRows')).map((row, index) => ({ id: `link-${index + 1}`, label: row.elements.label.value, url: row.elements.url.value, icon: row.elements.icon.value, color: row.elements.color.value, visible: true })).filter((item) => item.label && item.url);
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
  try { await request('/admin/settings', { method: 'PATCH', body: JSON.stringify({ settings }) }); await loadAll(); toast('Đã lưu cài đặt website.'); }
  catch (error) { toast(error.message, 'error'); }
}

function fillStorySelects() {
  const selects = $$('#externalDonationForm [name="story_id"]');
  selects.forEach((select) => { select.replaceChildren(); state.stories.filter((story) => !story.deletedat).forEach((story) => { const option = document.createElement('option'); option.value = story.id; option.textContent = story.title; select.append(option); }); });
}

function openDialog(dialog) { if (dialog?.showModal) dialog.showModal(); }
function closeDialog(dialog) { if (dialog?.open) dialog.close(); }

async function addCompleted(event) {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
  try { await request('/admin/stories', { method: 'POST', body: JSON.stringify(data) }); closeDialog($('#completedDialog')); form.reset(); await loadAll(); toast('Đã thêm truyện vào kho hoàn thành.'); }
  catch (error) { toast(error.message, 'error'); }
}

async function addExternalDonation(event) {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); data.amount_vnd = Number(data.amount_vnd);
  try { await request('/admin/donations', { method: 'POST', body: JSON.stringify(data) }); closeDialog($('#externalDonationDialog')); form.reset(); await loadAll(); toast('Đã thêm giao dịch ngoài website.'); }
  catch (error) { toast(error.message, 'error'); }
}

async function createAnnouncement(event) {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); data.dismissible = form.elements.dismissible.checked;
  try { await request('/admin/announcements', { method: 'POST', body: JSON.stringify(data) }); closeDialog($('#announcementDialog')); form.reset(); form.elements.dismissible.checked = true; await loadAll(); toast('Đã đăng thông báo.'); }
  catch (error) { toast(error.message, 'error'); }
}

function bindEvents() {
  $('#loginForm').addEventListener('submit', login); $('#logoutButton').addEventListener('click', logout);
  $$('#adminNav button').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
  $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.goView)));
  $('#sidebarToggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
  $('#refreshButton').addEventListener('click', async () => { try { await loadAll(); toast('Đã tải dữ liệu mới.'); } catch (error) { toast(error.message, 'error'); } });
  ['storySearch','storyStatusFilter','storyVersionFilter','storySourceFilter','storySort'].forEach((id) => $(`#${id}`).addEventListener(id === 'storySearch' ? 'input' : 'change', renderStories));
  ['donationSearch','donationFilter','donationSourceFilter','donationSort'].forEach((id) => $(`#${id}`).addEventListener(id === 'donationSearch' ? 'input' : 'change', renderDonations));
  $$('[data-close-drawer]').forEach((node) => node.addEventListener('click', closeDrawer));
  $('#storyEditForm').addEventListener('submit', saveStory); $('#trashStoryButton').addEventListener('click', trashStory); $('#checkSourceButton').addEventListener('click', checkSource);
  $$('[data-open-completed]').forEach((button) => button.addEventListener('click', () => openDialog($('#completedDialog'))));
  $('#completedForm').addEventListener('submit', addCompleted);
  $('#openExternalDonation').addEventListener('click', () => openDialog($('#externalDonationDialog'))); $('#externalDonationForm').addEventListener('submit', addExternalDonation);
  $('#newAnnouncement').addEventListener('click', () => openDialog($('#announcementDialog'))); $('#announcementForm').addEventListener('submit', createAnnouncement);
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  $('#settingsForm').addEventListener('submit', saveSettings); $('#addSocialLink').addEventListener('click', () => $('#socialLinkRows').append(socialRow()));
}

bindEvents();
trySession();
