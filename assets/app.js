const page = document.body.dataset.page || 'home';
const state = {
  stories: [],
  settings: null,
  announcements: [],
  visibleLimit: 12,
  libraryView: 'proposed',
  activeStory: null,
  voteBusy: new Set(),
  bankApps: [],
  bankCodes: new Map(),
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const number = new Intl.NumberFormat('vi-VN');
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const node = element('i', `fa-solid fa-${name}`);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function safeUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch { return ''; }
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
    id: Number(item?.id),
    title: String(item?.title || '').trim(),
    linkstory: safeUrl(item?.linkstory),
    youtubelink: safeUrl(item?.youtubelink),
    thumbnail: safeUrl(item?.thumbnail_url),
    version: item?.version === 'Edit' ? 'Edit' : 'Convert',
    note: String(item?.note || '').trim(),
    votes: Math.max(0, Math.floor(Number(item?.votes || 0))),
    status: normalizeStatus(item?.status),
    sourceStatus: ['suspected', 'confirmed', 'replaced'].includes(item?.source_status)
      ? item.source_status : 'normal',
    sourceReason: String(item?.source_reason || '').trim(),
    sourceDeadline: item?.source_deadline || null,
    sourceWarningPublic: item?.source_warning_public === true,
    createdAt: item?.createdat || new Date(0).toISOString(),
    completedAt: item?.completedat || null,
    views: Math.max(0, Number(item?.views || 0)),
    youtubeClicks: Math.max(0, Number(item?.youtube_clicks || 0)),
  };
}

function storageGet(key, session = false) {
  try { return (session ? sessionStorage : localStorage).getItem(key); } catch { return null; }
}
function storageSet(key, value, session = false) {
  try { (session ? sessionStorage : localStorage).setItem(key, value); } catch { /* private mode */ }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
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

function notify(message, tone = 'success') {
  if (window.Swal) {
    return window.Swal.fire({
      toast: true,
      position: 'top-end',
      icon: tone === 'danger' ? 'error' : tone,
      title: message,
      showConfirmButton: false,
      timer: 3200,
      timerProgressBar: true,
      customClass: { popup: 'cosmic-swal' },
    });
  }
  window.alert(message);
}

const dialogReturnFocus = new WeakMap();

function syncModalState() {
  document.body.classList.toggle('modal-open', Boolean(document.querySelector('dialog.modal[open]')));
}

function restoreDialogFocus(dialog) {
  syncModalState();
  const target = dialogReturnFocus.get(dialog);
  dialogReturnFocus.delete(dialog);
  if (target?.isConnected && typeof target.focus === 'function') {
    window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }
}

function openDialog(dialog) {
  if (!dialog) return;
  if (dialog.open) return;
  dialogReturnFocus.set(dialog, document.activeElement);
  if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  document.body.classList.add('modal-open');
  window.requestAnimationFrame(() => {
    const initial = dialog.querySelector('[data-modal-initial-focus]:not(:disabled), .modal-close');
    initial?.focus({ preventScroll: true });
  });
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog.open && dialog.close) dialog.close(); else dialog.removeAttribute('open');
  if (!dialog.close) restoreDialogFocus(dialog);
}

function statusLabel(status) {
  return ({
    'đề xuất': 'Đề xuất',
    'đã chọn': 'Đã chọn',
    'đang lên sóng': 'Đang lên sóng',
    'đã hoàn thành': 'Đã hoàn thành',
  })[status] || 'Đề xuất';
}

function sourceDomain(story) {
  try { return new URL(story.linkstory).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return 'Không rõ nguồn'; }
}

function youtubeId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
    if (host.endsWith('youtube.com')) {
      if (url.pathname === '/watch') return url.searchParams.get('v') || '';
      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || '';
    }
  } catch { /* invalid */ }
  return '';
}

function storyImage(story) {
  if (story.thumbnail) return story.thumbnail;
  const id = youtubeId(story.youtubelink);
  return id ? `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : '';
}

function deadlineText(story) {
  if (!story.sourceDeadline) return '';
  const days = Math.ceil((new Date(story.sourceDeadline).getTime() - Date.now()) / 86_400_000);
  if (!Number.isFinite(days)) return '';
  return days > 0 ? `Còn ${days} ngày tìm nguồn mới` : 'Đã hết thời hạn tìm nguồn';
}

function badge(text, className = '') {
  return element('span', `badge ${className}`.trim(), text);
}

function voteButton(story, compact = false) {
  const voted = Boolean(storageGet(`hoiam_vote_${story.id}`));
  const busy = state.voteBusy.has(story.id);
  const button = element('button', `vote-button${voted ? ' voted' : ' unvoted'}${busy ? ' voting' : ''}${compact ? ' compact' : ''}`);
  button.type = 'button';
  button.disabled = story.status !== 'đề xuất' || busy;
  button.setAttribute('aria-pressed', String(voted));
  button.setAttribute('aria-label', voted ? `Bỏ vote ${story.title}` : `Vote ${story.title}`);
  const voteIcon = icon(busy ? 'spinner' : (voted ? 'heart-circle-check' : 'heart'));
  if (busy) voteIcon.classList.add('fa-spin');
  const copy = element('span', 'vote-copy');
  copy.append(element('small', '', busy ? 'Đang lưu' : (voted ? 'Đã vote' : 'Vote')), element('strong', '', number.format(story.votes)));
  button.append(voteIcon, copy);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleVote(story.id);
  });
  return button;
}

async function toggleVote(id) {
  const story = state.stories.find((item) => item.id === id);
  if (!story || story.status !== 'đề xuất' || state.voteBusy.has(id)) return;
  const voted = Boolean(storageGet(`hoiam_vote_${id}`));
  const previousVotes = story.votes;
  state.voteBusy.add(id);
  story.votes = Math.max(0, story.votes + (voted ? -1 : 1));
  if (voted) {
    try { localStorage.removeItem(`hoiam_vote_${id}`); } catch { /* ignored */ }
  } else storageSet(`hoiam_vote_${id}`, '1');
  renderHome();
  try {
    const payload = await api(`/api/stories/${id}/vote`, {
      method: voted ? 'DELETE' : 'POST',
      body: '{}',
    });
    story.votes = Number(payload.votes ?? story.votes + (voted ? -1 : 1));
    if (payload.voted) storageSet(`hoiam_vote_${id}`, '1');
    else {
      try { localStorage.removeItem(`hoiam_vote_${id}`); } catch { /* ignored */ }
    }
    voteNotice(payload.voted, story.title);
  } catch (error) {
    if (error.status === 409 && typeof error.payload?.voted === 'boolean') {
      story.votes = previousVotes;
      if (error.payload.voted) storageSet(`hoiam_vote_${id}`, '1');
      else { try { localStorage.removeItem(`hoiam_vote_${id}`); } catch { /* ignored */ } }
      if (Number.isFinite(Number(error.payload?.votes))) story.votes = Number(error.payload.votes);
    } else {
      story.votes = previousVotes;
      if (voted) storageSet(`hoiam_vote_${id}`, '1');
      else { try { localStorage.removeItem(`hoiam_vote_${id}`); } catch { /* ignored */ } }
    }
    notify(error.message, 'danger');
  } finally {
    state.voteBusy.delete(id);
    renderHome();
  }
}

function voteNotice(voted, title) {
  if (!window.Swal) return notify(voted ? 'Đã vote cho truyện.' : 'Đã bỏ vote.', 'success');
  return window.Swal.fire({
    toast: true, position: 'top-end', icon: voted ? 'success' : 'info',
    title: voted ? 'Đã vote rồi nhé!' : 'Bạn đã bỏ vote', text: title,
    timer: 3600, timerProgressBar: true, showConfirmButton: false,
    customClass: { popup: 'cosmic-swal vote-swal' },
  });
}

function storyCard(story) {
  const selected = story.status === 'đã chọn';
  const card = element('article', `story-card${selected ? ' selected-story' : ' proposed-story'}`);
  card.tabIndex = 0;
  const mark = element('span', 'story-card-mark');
  mark.append(icon(selected ? 'bookmark' : 'book-open'));
  const body = element('div', 'story-card-body');
  const head = element('div', 'story-card-head');
  const identity = element('div', 'story-identity');
  identity.append(badge(story.version, story.version.toLowerCase()));
  const source = element('span', 'story-source');
  source.append(icon('link'), element('span', '', sourceDomain(story)));
  identity.append(source); head.append(identity);
  if (selected) {
    const stage = element('span', 'selection-label');
    stage.append(icon('bookmark'), document.createTextNode(' Đã chọn'));
    head.append(stage);
  } else head.append(voteButton(story, true));
  const title = element('h3', '', story.title);
  const note = element('p', 'story-note', story.note || 'Chưa có ghi chú.');
  const footer = element('div', 'story-card-footer');
  if (selected) {
    const progress = element('span', 'selection-progress');
    progress.append(icon('heart'), document.createTextNode(` ${number.format(story.votes)} lượt chọn`));
    footer.append(progress);
  }
  const view = element('button', 'text-button', 'Xem chi tiết');
  view.type = 'button';
  view.append(icon('arrow-right'));
  view.addEventListener('click', () => showStory(story.id));
  footer.append(view);
  body.append(head, title, note);
  if (story.sourceWarningPublic && story.sourceStatus === 'confirmed') {
    const warning = element('div', 'source-alert');
    warning.append(icon('triangle-exclamation'), element('span', '', deadlineText(story) || 'Nguồn đang cần thay thế'));
    body.append(warning);
  }
  body.append(footer); card.append(mark, body);
  card.addEventListener('click', (event) => {
    if (!event.target.closest('button,a')) showStory(story.id);
  });
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') showStory(story.id);
  });
  return card;
}

function topCard(story, index) {
  const card = element('article', `top-card rank-${index + 1}`);
  const visual = element('div', 'top-cover');
  const image = storyImage(story);
  if (image) visual.style.backgroundImage = `linear-gradient(180deg,rgba(7,7,22,.05),rgba(7,7,22,.82)),url("${image.replace(/"/g, '')}")`;
  else visual.append(icon(index === 0 ? 'crown' : 'book-open'));
  const rank = element('span', 'rank-number', String(index + 1));
  if (index === 0) {
    const crown = element('span', 'top-crown');
    crown.append(icon('crown'), document.createTextNode(' Dẫn đầu'));
    visual.append(crown);
  }
  visual.append(rank);
  const content = element('div', 'top-card-copy');
  const badges = element('div', 'badge-row');
  badges.append(badge(story.version, story.version.toLowerCase()), badge(sourceDomain(story), 'source'));
  content.append(badges, element('h3', '', story.title));
  const meta = element('div', 'top-meta');
  const source = element('span'); source.append(icon('link'), document.createTextNode(` ${sourceDomain(story)}`));
  const votes = element('span'); votes.append(icon('heart'), document.createTextNode(` ${number.format(story.votes)} vote`));
  meta.append(source, votes);
  const note = element('p', 'top-note', story.note || 'Mở chi tiết để xem thông tin truyện.');
  const actions = element('div', 'top-actions');
  actions.append(voteButton(story, true));
  const detail = element('span', 'top-detail', 'Xem chi tiết '); detail.append(icon('arrow-right')); actions.append(detail);
  content.append(meta, note, actions);
  card.append(visual, content);
  card.addEventListener('click', (event) => { if (!event.target.closest('button')) showStory(story.id); });
  return card;
}

function empty(title, message) {
  const node = element('div', 'empty-state');
  node.append(icon('moon'), element('strong', '', title), element('p', '', message));
  return node;
}

function renderTop() {
  const host = $('#topStories');
  if (!host) return;
  const top = state.stories.filter((item) => item.status === 'đề xuất')
    .sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title, 'vi')).slice(0, 3);
  host.replaceChildren(...(top.length ? top.map(topCard) : [empty('Chưa có bảng xếp hạng', 'Hãy gửi đề xuất đầu tiên.') ]));
}

function renderAiring() {
  const host = $('#airingStories');
  if (!host) return;
  const stories = state.stories.filter((item) => item.status === 'đang lên sóng');
  if (!stories.length) return host.replaceChildren(empty('Chưa có truyện đang lên sóng', 'Khi admin bắt đầu đăng, truyện sẽ xuất hiện ở đây.'));
  host.replaceChildren(...stories.slice(0, 6).map((story) => {
    const card = element('article', 'airing-card');
    const image = storyImage(story);
    const visual = element('div', 'airing-visual');
    if (image) visual.style.backgroundImage = `linear-gradient(180deg,transparent,rgba(5,5,20,.88)),url("${image.replace(/"/g, '')}")`;
    visual.append(element('span', 'live-pill', 'ĐANG LÊN SÓNG'));
    const copy = element('div', 'airing-copy');
    copy.append(element('h3', '', story.title));
    const meta = element('div', 'airing-meta');
    const version = element('span'); version.append(icon('book'), document.createTextNode(story.version));
    const source = element('span'); source.append(icon('link'), document.createTextNode(sourceDomain(story)));
    const votes = element('span'); votes.append(icon('heart'), document.createTextNode(`${number.format(story.votes)} vote`));
    meta.append(version, source, votes);
    copy.append(meta);
    if (story.note) copy.append(element('p', 'airing-note', story.note));
    const actions = element('div', 'airing-actions');
    if (story.youtubelink) {
      const link = element('a', 'play-button');
      link.href = story.youtubelink; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.append(icon('play'), document.createTextNode(' Nghe trên YouTube'));
      link.addEventListener('click', () => trackMetric(story.id, 'youtube'));
      actions.append(link);
    }
    const detail = element('button', 'icon-button'); detail.type = 'button'; detail.append(icon('arrow-right')); detail.addEventListener('click', () => showStory(story.id));
    actions.append(detail); copy.append(actions); card.append(visual, copy); return card;
  }));
}

function libraryStories() {
  const query = ($('#searchInput')?.value || '').trim().toLocaleLowerCase('vi');
  const version = $('#versionFilter')?.value || 'all';
  const source = $('#sourceFilter')?.value || 'all';
  const sort = $('#sortSelect')?.value || 'votes-desc';
  const status = state.libraryView === 'selected' ? 'đã chọn' : 'đề xuất';
  const list = state.stories.filter((story) => story.status === status)
    .filter((story) => !query || `${story.title} ${story.note}`.toLocaleLowerCase('vi').includes(query))
    .filter((story) => version === 'all' || story.version === version)
    .filter((story) => source === 'all' || sourceDomain(story) === source);
  list.sort((a, b) => {
    if (sort === 'votes-asc') return a.votes - b.votes;
    if (sort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (sort === 'title') return a.title.localeCompare(b.title, 'vi');
    return b.votes - a.votes;
  });
  return list;
}

function renderSourceOptions(stories = state.stories) {
  const select = $('#sourceFilter');
  if (!select) return;
  const current = select.value || 'all';
  const domains = [...new Set(stories.map(sourceDomain).filter((item) => item !== 'Không rõ nguồn'))].sort();
  select.replaceChildren();
  const all = element('option', '', 'Mọi nguồn'); all.value = 'all'; select.append(all);
  domains.forEach((domain) => {
    const option = element('option', '', domain);
    option.value = domain;
    select.append(option);
  });
  select.value = domains.includes(current) ? current : 'all';
}

function renderLibrary() {
  const host = $('#storyGrid');
  if (!host) return;
  const viewStatus = state.libraryView === 'selected' ? 'đã chọn' : 'đề xuất';
  renderSourceOptions(state.stories.filter((story) => story.status === viewStatus));
  const list = libraryStories();
  const proposedCount = state.stories.filter((story) => story.status === 'đề xuất').length;
  const selectedCount = state.stories.filter((story) => story.status === 'đã chọn').length;
  const isSelected = state.libraryView === 'selected';
  $('#proposedStoryCount').textContent = number.format(proposedCount);
  $('#selectedStoryCount').textContent = number.format(selectedCount);
  const count = $('#resultCount');
  if (count) count.replaceChildren(icon('layer-group'), document.createTextNode(` ${number.format(list.length)} ${isSelected ? 'đã chọn' : 'đề xuất'}`));
  const title = $('#libraryViewTitle');
  if (title) title.textContent = isSelected ? 'Truyện đã được chọn' : 'Truyện được đề xuất';
  $$('[data-library-view]').forEach((button) => {
    const active = button.dataset.libraryView === state.libraryView;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const emptyTitle = isSelected ? 'Chưa có truyện đã chọn' : 'Không tìm thấy truyện';
  const emptyMessage = isSelected ? 'Khi admin chọn truyện, danh sách sẽ xuất hiện tại đây.' : 'Hãy thử thay đổi bộ lọc.';
  host.replaceChildren(...(list.length ? list.slice(0, state.visibleLimit).map(storyCard) : [empty(emptyTitle, emptyMessage)]));
  const more = $('#loadMoreButton');
  if (more) more.hidden = list.length <= state.visibleLimit;
}

function renderCompleted() {
  const host = $('#completedGrid');
  if (!host) return;
  renderSourceOptions(state.stories.filter((item) => item.status === 'đã hoàn thành'));
  const query = ($('#searchInput')?.value || '').trim().toLocaleLowerCase('vi');
  const version = $('#versionFilter')?.value || 'all';
  const source = $('#sourceFilter')?.value || 'all';
  const sort = $('#sortSelect')?.value || 'newest';
  const list = state.stories.filter((story) => story.status === 'đã hoàn thành')
    .filter((story) => !query || story.title.toLocaleLowerCase('vi').includes(query))
    .filter((story) => version === 'all' || story.version === version)
    .filter((story) => source === 'all' || sourceDomain(story) === source);
  list.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'vi')
    : sort === 'oldest' ? new Date(a.completedAt || a.createdAt) - new Date(b.completedAt || b.createdAt)
      : new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
  host.replaceChildren(...(list.length ? list.map((story) => {
    const card = element('article', 'completed-card');
    const visual = element('button', 'completed-visual'); visual.type = 'button';
    const image = storyImage(story); if (image) visual.style.backgroundImage = `url("${image.replace(/"/g, '')}")`;
    visual.append(element('span', 'completed-badge', 'HOÀN THÀNH'), icon('circle-play'));
    visual.addEventListener('click', () => showStory(story.id));
    const copy = element('div', 'completed-copy');
    copy.append(element('h2', '', story.title), element('p', '', `${story.version} · ${sourceDomain(story)}`));
    if (story.youtubelink) {
      const link = element('a', 'button button-primary compact', 'Nghe trên YouTube ');
      link.href = story.youtubelink; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.append(icon('arrow-up-right-from-square'));
      link.addEventListener('click', () => trackMetric(story.id, 'youtube'));
      copy.append(link);
    }
    card.append(visual, copy); return card;
  }) : [empty('Kho hoàn thành đang trống', 'Admin có thể thêm lại các truyện cũ trong dashboard.') ]));
}

function renderHome() {
  renderTop(); renderAiring(); renderLibrary(); renderCompleted();
}

async function trackMetric(id, metric) {
  try { await api(`/api/stories/${id}/metrics`, { method: 'POST', body: JSON.stringify({ metric }) }); }
  catch { /* thống kê không được cản thao tác chính */ }
}

function detailRow(label, value, iconName = '') {
  const row = element('div', 'detail-row');
  const caption = element('span');
  if (iconName) caption.append(icon(iconName));
  caption.append(document.createTextNode(label));
  row.append(caption, element('strong', '', value));
  return row;
}

function showStory(id) {
  const story = state.stories.find((item) => item.id === id);
  const dialog = $('#storyDialog'); const host = $('#storyDialogContent');
  if (!story || !dialog || !host) return;
  state.activeStory = story;
  host.replaceChildren();
  const image = storyImage(story);
  const cover = element('div', `detail-cover${image ? ' has-image' : ''}`);
  if (image) cover.style.backgroundImage = `url("${image.replace(/"/g, '')}")`;
  cover.append(icon('book-open-reader'), element('span', 'detail-cover-label', image ? 'Ảnh từ nội dung đang lên sóng' : 'Bìa truyện đang cập nhật'));
  host.append(cover);
  const body = element('div', 'detail-body');
  const chips = element('div', 'badge-row'); chips.append(badge(story.version, story.version.toLowerCase()), badge(statusLabel(story.status), 'status'), badge(sourceDomain(story), 'source'));
  const title = element('h2', '', story.title); title.id = 'storyDialogTitle';
  body.append(chips, title);
  const info = element('div', 'detail-stats');
  info.append(detailRow('Tổng vote', number.format(story.votes), 'heart'), detailRow('Trạng thái', statusLabel(story.status), 'signal'), detailRow('Nguồn', sourceDomain(story), 'link'));
  body.append(info);
  if (story.note) {
    const section = element('section', 'detail-section');
    const heading = element('h3'); heading.append(icon('align-left'), document.createTextNode(' Thông tin truyện'));
    section.append(heading, element('p', 'detail-note', story.note)); body.append(section);
  }
  if (story.sourceWarningPublic && story.sourceStatus === 'confirmed') {
    const warning = element('div', 'detail-warning');
    warning.append(icon('triangle-exclamation'), element('div', '', ''));
    const copy = $('div', warning); copy.append(element('strong', '', deadlineText(story) || 'Nguồn đang cần thay thế'), element('p', '', story.sourceReason || 'Admin đang tìm nguồn phù hợp.'));
    body.append(warning);
  }
  const actions = element('div', 'detail-actions');
  if (story.linkstory) {
    const source = element('a', 'button button-ghost', 'Mở nguồn '); source.href = story.linkstory; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.append(icon('arrow-up-right-from-square')); actions.append(source);
  }
  if (story.status === 'đề xuất') actions.append(voteButton(story));
  if (story.status === 'đề xuất' && state.settings?.donation?.enabled) {
    const donate = element('button', 'button button-primary', 'Tặng Cá '); donate.type = 'button'; donate.append(icon('fish-fins')); donate.addEventListener('click', () => { closeDialog(dialog); openDonation(story.id, false); }); actions.append(donate);
  }
  if (story.youtubelink) {
    const youtube = element('a', 'button button-primary', 'Nghe YouTube '); youtube.href = story.youtubelink; youtube.target = '_blank'; youtube.rel = 'noopener noreferrer'; youtube.append(icon('play')); youtube.addEventListener('click', () => trackMetric(story.id, 'youtube')); actions.append(youtube);
  }
  if (story.sourceWarningPublic && story.sourceStatus === 'confirmed') {
    const replace = element('button', 'button button-ghost', 'Gửi nguồn thay thế'); replace.type = 'button'; replace.addEventListener('click', () => { closeDialog(dialog); openReplacement(story.id); }); actions.append(replace);
  }
  body.append(actions); host.append(body); openDialog(dialog); trackMetric(story.id, 'view');
}

function calculateDonation(amount) {
  const value = Math.floor(Number(amount || 0));
  let price = 5000;
  if (value >= 1_000_000) price = 3000; else if (value >= 500_000) price = 3500; else if (value >= 200_000) price = 4000; else if (value >= 100_000) price = 4500;
  return { stones: Math.floor(value / 1000), votes: Math.floor(value / price), price };
}

function donationStories() {
  return state.stories.filter((story) => story.status !== 'đã hoàn thành');
}

function donationStorySearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi');
}

function closeDonationStoryPicker() {
  const menu = $('#donationStoryMenu'); const toggle = $('#donationStoryToggle');
  if (menu) menu.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
}

function setDonationStory(storyId, closePicker = true) {
  const form = $('#donationForm'); const valueNode = $('#donationStoryValue');
  if (!form) return;
  const value = storyId ? String(storyId) : '';
  const story = state.stories.find((item) => String(item.id) === value);
  form.elements.story_select.value = story ? value : '';
  form.elements.story_id.value = story ? value : '';
  if (valueNode) valueNode.textContent = story?.title || 'Chọn truyện…';
  const optionsHost = $('#donationStoryOptions');
  if (optionsHost) $$('.donation-story-option', optionsHost).forEach((button) => {
    const selected = button.dataset.storyId === value;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  if (closePicker) closeDonationStoryPicker();
  updateDonationPanel();
}

function fillDonationStories(query = '', preferredId = null) {
  const form = $('#donationForm'); const host = $('#donationStoryOptions');
  if (!form || !host) return;
  const current = String(preferredId === null ? (form.elements.story_select.value || '') : (preferredId || ''));
  const keyword = donationStorySearchText(query).trim();
  const visible = donationStories().filter((story) => !keyword || donationStorySearchText(story.title).includes(keyword));
  host.replaceChildren();
  visible.forEach((story) => {
    const button = element('button', 'donation-story-option');
    button.type = 'button';
    button.dataset.storyId = String(story.id);
    button.setAttribute('role', 'option');
    const selected = String(story.id) === current;
    button.setAttribute('aria-selected', String(selected));
    if (selected) button.classList.add('selected');
    const copy = element('span', 'donation-story-option-copy');
    copy.append(element('strong', '', story.title), element('small', '', `${story.version || 'Convert'} · ${number.format(Number(story.votes || 0))} vote`));
    button.append(icon(selected ? 'circle-check' : 'book'), copy);
    button.addEventListener('click', () => setDonationStory(story.id));
    host.append(button);
  });
  if (!visible.length) host.append(element('p', 'donation-story-empty', 'Không tìm thấy truyện phù hợp.'));
  setDonationStory(current, false);
}

function toggleDonationStoryPicker() {
  const picker = $('#donationStoryPicker'); const menu = $('#donationStoryMenu'); const toggle = $('#donationStoryToggle');
  if (!picker || !menu || !toggle || picker.dataset.locked === 'true') return;
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  toggle.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) {
    const search = $('#donationStorySearch');
    if (search) search.value = '';
    fillDonationStories('', null);
    window.setTimeout(() => search?.focus(), 30);
  }
}

function transferContent(story, name) {
  const template = state.settings?.donation?.transferTemplate || '{story} - {name}';
  const compactStory = vietQrText(story?.title, 32);
  const compactName = vietQrText(name, 15);
  return vietQrText(template.replaceAll('{story}', compactStory).replaceAll('{name}', compactName));
}

function vietQrText(value, max = 50) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (letter) => (letter === 'đ' ? 'd' : 'D'))
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function vietQrUrl(donation, amount, content) {
  const bankId = String(donation?.bankId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  const account = String(donation?.accountNumber || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 19);
  if (!bankId || !account) return '';

  const url = new URL(`https://img.vietqr.io/image/${bankId}-${account}-compact2.png`);
  const value = Math.max(0, Math.floor(Number(amount || 0)));
  const description = vietQrText(content);
  const accountName = vietQrText(donation?.accountName);
  if (value > 0) url.searchParams.set('amount', String(value));
  if (description) url.searchParams.set('addInfo', description);
  if (accountName) url.searchParams.set('accountName', accountName);
  return url.href;
}

function appendBankQr(host, donation, amount, content) {
  const dynamicUrl = vietQrUrl(donation, amount, content);
  const fallbackUrl = safeUrl(donation?.qrUrl);
  const initialUrl = dynamicUrl || fallbackUrl;
  if (!initialUrl) return;

  const card = element('div', 'bank-qr-card');
  const image = new Image();
  image.src = initialUrl;
  image.alt = dynamicUrl ? 'Mã VietQR chuyển khoản tự động' : 'Mã QR chuyển khoản';
  image.className = 'bank-qr';
  const status = element('p', 'bank-qr-status');
  status.append(icon(dynamicUrl ? 'wand-magic-sparkles' : 'image'), document.createTextNode(dynamicUrl
    ? 'QR đã điền sẵn tài khoản, số tiền và nội dung.'
    : 'Ảnh QR do admin cung cấp.'));
  const open = element('a', 'bank-qr-open');
  open.href = initialUrl;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.append(icon('expand'), document.createTextNode(' Mở mã QR'));

  image.addEventListener('error', () => {
    if (dynamicUrl && fallbackUrl && image.src !== fallbackUrl) {
      image.src = fallbackUrl;
      open.href = fallbackUrl;
      status.replaceChildren(icon('image'), document.createTextNode(' Đang dùng ảnh QR dự phòng.'));
      return;
    }
    image.hidden = true;
    open.hidden = true;
    status.replaceChildren(icon('triangle-exclamation'), document.createTextNode(' Chưa tải được mã QR. Bạn vẫn có thể dùng thông tin bên dưới.'));
  });
  card.append(image, status, open);
  host.append(card);
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth <= 1180);
}

function normalizeBankApp(item) {
  const appId = String(item?.appId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (!appId) return null;
  return {
    appId,
    appName: String(item?.appName || item?.bankName || appId).trim().slice(0, 100),
    bankName: String(item?.bankName || '').trim().slice(0, 140),
    autofill: Number(item?.autofill || 0) === 1,
    popularity: Math.max(0, Number(item?.monthlyInstall || 0)),
  };
}

function fallbackBankApps() {
  return [
    { appId: 'mb', appName: 'MB Bank', bankName: 'Ngân hàng TMCP Quân đội', autofill: 1, monthlyInstall: 500000 },
    { appId: 'icb', appName: 'VietinBank iPay', bankName: 'Ngân hàng TMCP Công thương Việt Nam', autofill: 1, monthlyInstall: 200000 },
    { appId: 'bidv', appName: 'BIDV SmartBanking', bankName: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam', autofill: 1, monthlyInstall: 200000 },
    { appId: 'ocb', appName: 'OCB OMNI', bankName: 'Ngân hàng TMCP Phương Đông', autofill: 1, monthlyInstall: 80000 },
    { appId: 'acb', appName: 'ACB One', bankName: 'Ngân hàng TMCP Á Châu', autofill: 1, monthlyInstall: 70000 },
    { appId: 'vcb', appName: 'Vietcombank', bankName: 'Ngân hàng TMCP Ngoại Thương Việt Nam', autofill: 0, monthlyInstall: 300000 },
    { appId: 'vba', appName: 'Agribank E-Mobile Banking', bankName: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam', autofill: 0, monthlyInstall: 300000 },
    { appId: 'tcb', appName: 'Techcombank Mobile', bankName: 'Ngân hàng TMCP Kỹ thương Việt Nam', autofill: 0, monthlyInstall: 200000 },
  ].map(normalizeBankApp).filter(Boolean);
}

function seedBankCodes() {
  state.bankCodes = new Map([
    ['vcb', 'vcb'], ['vietcombank', 'vcb'], ['970436', 'vcb'],
    ['mb', 'mb'], ['mbbank', 'mb'], ['970422', 'mb'],
    ['icb', 'icb'], ['vietinbank', 'icb'], ['970415', 'icb'],
    ['bidv', 'bidv'], ['970418', 'bidv'],
    ['acb', 'acb'], ['970416', 'acb'],
    ['ocb', 'ocb'], ['970448', 'ocb'],
    ['tcb', 'tcb'], ['techcombank', 'tcb'], ['970407', 'tcb'],
    ['vba', 'vba'], ['agribank', 'vba'], ['970405', 'vba'],
  ]);
}

async function loadBankApps() {
  if (state.bankApps.length) return state.bankApps;
  const platform = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'android';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  seedBankCodes();
  try {
    const [appResponse, bankResponse] = await Promise.all([
      fetch(`https://api.vietqr.io/v2/${platform}-app-deeplinks`, { cache: 'force-cache', signal: controller.signal }),
      fetch('https://api.vietqr.io/v2/banks', { cache: 'force-cache', signal: controller.signal }),
    ]);
    if (!appResponse.ok || !bankResponse.ok) throw new Error('VietQR không phản hồi.');
    const [appPayload, bankPayload] = await Promise.all([appResponse.json(), bankResponse.json()]);
    state.bankApps = (Array.isArray(appPayload?.apps) ? appPayload.apps : [])
      .map(normalizeBankApp)
      .filter(Boolean);
    (Array.isArray(bankPayload?.data) ? bankPayload.data : []).forEach((bank) => {
      const code = String(bank?.code || '').trim().toLowerCase();
      [bank?.code, bank?.bin, bank?.shortName].forEach((key) => {
        const normalized = String(key || '').trim().toLowerCase();
        if (normalized && code) state.bankCodes.set(normalized, code);
      });
    });
  } catch {
    state.bankApps = fallbackBankApps();
  } finally {
    window.clearTimeout(timeout);
  }
  if (!state.bankApps.length) state.bankApps = fallbackBankApps();
  state.bankApps.sort((a, b) => Number(b.autofill) - Number(a.autofill) || b.popularity - a.popularity || a.appName.localeCompare(b.appName, 'vi'));
  return state.bankApps;
}

function bankSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi');
}

function chooseBankApp(apps, selectedId = '') {
  return new Promise((resolve) => {
    let chosen = false;
    window.Swal.fire({
      icon: 'info',
      title: 'Chọn ứng dụng ngân hàng',
      html: '<div class="bank-app-picker"><p class="bank-app-guide"><i class="fa-solid fa-bolt"></i> Ứng dụng mở thẳng chuyển tiền được ưu tiên ở đầu danh sách.</p><label class="bank-app-search"><i class="fa-solid fa-magnifying-glass"></i><input id="bankAppSearch" type="search" placeholder="Tìm tên ngân hàng hoặc ứng dụng…" autocomplete="off"></label><div id="bankAppChoices" class="bank-app-choices"></div></div>',
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Quay lại',
      customClass: { popup: 'cosmic-swal bank-app-swal' },
      didOpen: () => {
        const search = document.getElementById('bankAppSearch');
        const host = document.getElementById('bankAppChoices');
        const render = () => {
          const keyword = bankSearchText(search?.value).trim();
          const visible = apps.filter((app) => !keyword || bankSearchText(`${app.appName} ${app.bankName}`).includes(keyword));
          host.replaceChildren();
          visible.forEach((app) => {
            const button = element('button', `bank-app-choice${app.appId === selectedId ? ' recent' : ''}`);
            button.type = 'button';
            const mark = element('span', `bank-app-mark${app.autofill ? ' autofill' : ''}`); mark.append(icon(app.autofill ? 'bolt' : 'building-columns'));
            const copy = element('span', 'bank-app-copy');
            copy.append(element('strong', '', app.appName), element('small', '', app.autofill ? `${app.bankName} · Mở thẳng chuyển tiền` : app.bankName));
            const badgeNode = element('b', app.autofill ? 'autofill' : 'open-only', app.autofill ? 'Ưu tiên' : 'Mở app');
            button.append(mark, copy, badgeNode);
            button.addEventListener('click', () => { chosen = true; resolve(app); window.Swal.close(); });
            host.append(button);
          });
          if (!visible.length) host.append(element('p', 'bank-app-empty', 'Không tìm thấy ứng dụng phù hợp.'));
        };
        search?.addEventListener('input', render);
        render();
        window.setTimeout(() => search?.focus(), 50);
      },
    }).then(() => { if (!chosen) resolve(null); });
  });
}

function saveDonationDraft() {
  const form = $('#donationForm');
  if (!form) return;
  const values = {};
  ['story_select', 'donor_name', 'amount_vnd', 'transaction_ref', 'donatedat', 'donor_email', 'note', 'source_channel']
    .forEach((name) => { values[name] = form.elements[name]?.value || ''; });
  const storyLocked = $('#donationStoryPicker')?.dataset.locked === 'true';
  storageSet('hoiam_donation_draft', JSON.stringify({ savedAt: Date.now(), storyLocked, values }), true);
}

function restoreDonationDraft() {
  const raw = storageGet('hoiam_donation_draft', true);
  if (!raw || !$('#donationForm') || !state.settings?.donation?.enabled || !state.stories.length) return false;
  try {
    const draft = JSON.parse(raw);
    if (!draft?.savedAt || Date.now() - Number(draft.savedAt) > 30 * 60_000) {
      sessionStorage.removeItem('hoiam_donation_draft');
      sessionStorage.removeItem('hoiam_bank_trip_started');
      return false;
    }
    const draftStoryId = Number(draft.values?.story_select || 0) || null;
    const external = draft.values?.source_channel === 'youtube';
    openDonation(draft.storyLocked ? draftStoryId : null, external);
    const form = $('#donationForm');
    Object.entries(draft.values || {}).forEach(([name, value]) => {
      if (form.elements[name]) form.elements[name].value = String(value || '');
    });
    fillDonationStories('', form.elements.story_select.value);
    $('#donationModeNote').textContent = 'Thông tin vẫn còn nguyên. Nếu đã chuyển khoản, bấm “Tôi đã tặng Cá” ở cuối form để báo admin nhé.';
    updateDonationPanel();
    const submitButton = $('#submitDonationButton');
    submitButton?.classList.add('return-ready');
    window.setTimeout(() => submitButton?.classList.remove('return-ready'), 4200);
    return true;
  } catch {
    try { sessionStorage.removeItem('hoiam_donation_draft'); } catch { /* ignored */ }
    return false;
  }
}

function restoreDonationAfterBankTrip() {
  const startedAt = Number(storageGet('hoiam_bank_trip_started', true) || 0);
  if (!startedAt || document.visibilityState === 'hidden') return;
  const elapsed = Date.now() - startedAt;
  if (elapsed < 800) {
    window.setTimeout(restoreDonationAfterBankTrip, 820 - elapsed);
    return;
  }
  if (!storageGet('hoiam_donation_draft', true)) {
    try { sessionStorage.removeItem('hoiam_bank_trip_started'); } catch { /* ignored */ }
    return;
  }
  if ($('#donationDialog')?.open || window.Swal?.isVisible?.()) return;
  if (restoreDonationDraft()) {
    try { sessionStorage.removeItem('hoiam_bank_trip_started'); } catch { /* ignored */ }
  }
}

function scheduleDonationReturnCheck() {
  window.setTimeout(restoreDonationAfterBankTrip, 180);
}

async function openBankPayment(donation, amount, content) {
  if (!window.Swal) return notify('Trình duyệt chưa hỗ trợ chọn ứng dụng ngân hàng.', 'warning');
  const account = String(donation?.accountNumber || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 19);
  const bankId = String(donation?.bankId || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const value = Math.max(0, Math.floor(Number(amount || 0)));
  if (!account || !bankId) return notify('Admin chưa cập nhật đủ thông tin VietQR.', 'warning');
  if (value < 1000 || !content) return notify('Hãy chọn truyện, nhập tên và số tiền trước.', 'warning');

  saveDonationDraft();
  closeDialog($('#donationDialog'));
  try {
    window.Swal.fire({
      title: 'Đang tải ứng dụng ngân hàng…',
      text: 'Chỉ mất vài giây.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => window.Swal.showLoading(),
      customClass: { popup: 'cosmic-swal' },
    });
    const apps = await loadBankApps();
    window.Swal.close();
    const lastApp = storageGet('hoiam_bank_app') || '';
    const selected = await chooseBankApp(apps, lastApp);
    if (!selected) return restoreDonationDraft();
    if (!selected.autofill) {
      const warning = await window.Swal.fire({
        icon: 'warning',
        title: 'Ứng dụng này chỉ hỗ trợ mở app',
        text: 'Ngân hàng chưa hỗ trợ đi thẳng đến màn hình chuyển tiền từ website. Bạn vẫn có thể mở app hoặc quay lại dùng mã QR.',
        showCancelButton: true,
        confirmButtonText: 'Vẫn mở ứng dụng',
        cancelButtonText: 'Quay lại QR',
        customClass: { popup: 'cosmic-swal' },
      });
      if (!warning.isConfirmed) return restoreDonationDraft();
    }
    storageSet('hoiam_bank_app', selected.appId);
    const receiverBank = state.bankCodes.get(bankId) || bankId;
    const deepLink = new URL('https://dl.vietqr.io/pay');
    deepLink.searchParams.set('app', selected.appId);
    deepLink.searchParams.set('ba', `${account}@${receiverBank}`);
    deepLink.searchParams.set('am', String(value));
    deepLink.searchParams.set('tn', vietQrText(content));
    deepLink.searchParams.set('bn', vietQrText(donation.accountName));
    deepLink.searchParams.set('url', `${location.origin}${location.pathname}${location.search}`);
    storageSet('hoiam_bank_trip_started', String(Date.now()), true);
    window.location.assign(deepLink.href);
  } catch (error) {
    try { sessionStorage.removeItem('hoiam_bank_trip_started'); } catch { /* ignored */ }
    window.Swal.close();
    await window.Swal.fire({
      icon: 'error',
      title: 'Chưa mở được ứng dụng ngân hàng',
      text: error.message || 'Bạn có thể tiếp tục dùng mã QR.',
      confirmButtonText: 'Quay lại mã QR',
      customClass: { popup: 'cosmic-swal' },
    });
    restoreDonationDraft();
  }
}

function appendBankAppButton(host, donation, amount, content) {
  if (!isMobileDevice()) return;
  const button = element('button', 'bank-app-button');
  button.type = 'button';
  button.disabled = amount < 1000 || !content;
  button.append(icon('building-columns'), document.createTextNode(button.disabled
    ? ' Chọn truyện, nhập tên và số tiền'
    : ' Mở ứng dụng ngân hàng'));
  button.addEventListener('click', () => openBankPayment(donation, amount, content));
  host.append(button);
  if (!button.disabled) host.append(element('p', 'bank-app-note', 'Chuyển xong hãy quay lại và bấm “Tôi đã tặng Cá”.'));
}

function copyButton(value, label = 'Sao chép') {
  const button = element('button', 'copy-button', label); button.type = 'button';
  button.addEventListener('click', async () => { try { await navigator.clipboard.writeText(value); notify('Đã sao chép.', 'success'); } catch { notify('Không sao chép được.', 'danger'); } });
  return button;
}

function updateDonationPanel() {
  const form = $('#donationForm'); const host = $('#bankPanel'); const preview = $('#donationPreview');
  if (!form || !host || !preview) return;
  const story = state.stories.find((item) => item.id === Number(form.elements.story_select.value));
  const name = form.elements.donor_name.value.trim(); const amount = Number(form.elements.amount_vnd.value || 0);
  const calc = calculateDonation(amount);
  preview.textContent = amount > 0
    ? `${money.format(amount)} = ${number.format(calc.stones)} Cá/Linh Thạch · đề xuất ${number.format(calc.votes)} vote (${money.format(calc.price)}/vote)`
    : '1 Cá = 1 Linh Thạch = 1.000đ';
  host.replaceChildren();
  const donation = state.settings?.donation;
  if (!donation?.enabled) return host.append(element('p', 'muted', 'Kênh đang tạm đóng nhận donate trên website.'));
  const content = story && name ? transferContent(story, name) : '';
  appendBankQr(host, donation, amount, content);
  appendBankAppButton(host, donation, amount, content);
  host.append(element('span', 'eyebrow', donation.bankName || 'Thông tin chuyển khoản'));
  host.append(detailRow('Chủ tài khoản', donation.accountName || 'Chưa cập nhật'));
  const account = detailRow('Số tài khoản', donation.accountNumber || 'Chưa cập nhật');
  if (donation.accountNumber) account.append(copyButton(donation.accountNumber)); host.append(account);
  if (story && name) {
    const block = element('div', 'transfer-content'); block.append(element('small', '', 'Nội dung chuyển khoản'), element('strong', '', content), copyButton(content)); host.append(block);
  } else host.append(element('p', 'muted', 'Chọn truyện và nhập tên để tạo nội dung chuyển khoản.'));
  if (donation.note) host.append(element('p', 'bank-note', donation.note));
}

function openDonation(storyId = null, external = false) {
  if (!state.settings?.donation?.enabled) return notify('Kênh đang tạm đóng nhận donate trên website.', 'warning');
  const dialog = $('#donationDialog'); const form = $('#donationForm'); if (!dialog || !form) return;
  form.reset();
  const story = state.stories.find((item) => item.id === Number(storyId));
  const locked = Boolean(story && !external);
  const storyPicker = $('#donationStoryPicker'); const storyToggle = $('#donationStoryToggle');
  if (storyPicker) storyPicker.dataset.locked = String(locked);
  if (storyToggle) storyToggle.disabled = locked;
  if ($('#donationStorySearch')) $('#donationStorySearch').value = '';
  closeDonationStoryPicker();
  fillDonationStories('', story ? String(story.id) : '');
  form.elements.source_channel.value = external ? 'youtube' : 'website';
  $('#donationStoryHint').textContent = locked ? 'Truyện đã được chọn từ nút Tặng Cá.' : 'Bấm để chọn hoặc tìm truyện.';
  $('#donationTitle').textContent = external ? 'Báo đã donate' : (locked ? 'Tặng Cá cho truyện này' : 'Tặng Cá cho truyện');
  $('#donationModeNote').textContent = external
    ? 'Bạn đã ủng hộ qua YouTube hoặc email? Điền thông tin bên dưới để admin đối chiếu giúp nhé.'
    : 'Chọn số tiền, dùng nội dung chuyển khoản được tạo sẵn rồi bấm “Tôi đã tặng Cá”.';
  $('#submitDonationButton').innerHTML = external
    ? '<i class="fa-solid fa-paper-plane"></i> Gửi admin kiểm tra'
    : '<i class="fa-solid fa-fish-fins"></i> Tôi đã tặng Cá';
  updateDonationPanel(); openDialog(dialog);
}

async function submitDonation(event) {
  event.preventDefault(); const form = event.currentTarget;
  const storyId = Number(form.elements.story_select.value || form.elements.story_id.value);
  if (!storyId) return notify('Hãy chọn truyện.', 'warning');
  const button = $('#submitDonationButton'); button.disabled = true;
  try {
    const payload = {
      story_id: storyId,
      donor_name: form.elements.donor_name.value,
      amount_vnd: Number(form.elements.amount_vnd.value),
      transaction_ref: form.elements.transaction_ref.value,
      donatedat: form.elements.donatedat.value || null,
      donor_email: form.elements.donor_email.value,
      note: form.elements.note.value,
      source_channel: form.elements.source_channel.value,
      website: form.elements.website.value,
    };
    const result = await api('/api/donations', { method: 'POST', body: JSON.stringify(payload) });
    closeDialog($('#donationDialog')); form.reset();
    try {
      sessionStorage.removeItem('hoiam_donation_draft');
      sessionStorage.removeItem('hoiam_bank_trip_started');
    } catch { /* ignored */ }
    await window.Swal?.fire({ icon: 'success', title: 'Admin đã nhận thông báo', html: `Mã báo nhận: <strong>#${result.donation?.id || ''}</strong><br>Hệ thống đề xuất ${number.format(result.donation?.suggested_votes || 0)} vote. Admin sẽ kiểm tra trước khi cộng.`, confirmButtonText: 'Đã hiểu', customClass: { popup: 'cosmic-swal' } });
  } catch (error) { notify(error.message, 'danger'); }
  finally { button.disabled = false; }
}

function openReplacement(storyId) {
  const form = $('#replacementForm'); if (!form) return;
  const story = state.stories.find((item) => item.id === Number(storyId));
  form.reset(); form.elements.story_id.value = String(storyId);
  const name = $('#replacementStoryName');
  if (name) name.textContent = story ? `Nguồn mới cho “${story.title}”` : 'Gửi một đường dẫn khác để admin kiểm tra.';
  openDialog($('#replacementDialog'));
}

async function submitReplacement(event) {
  event.preventDefault(); const form = event.currentTarget;
  try {
    await api('/api/source-replacements', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    closeDialog($('#replacementDialog')); form.reset(); notify('Nguồn mới đã được gửi để admin kiểm tra.', 'success');
  } catch (error) { notify(error.message, 'danger'); }
}

async function submitSuggestion(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const button = $('#submitSuggestionButton'); button.disabled = true;
  try {
    await api('/api/suggestions', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset(); closeDialog($('#suggestionDialog')); notify('Đã gửi đề xuất. Cảm ơn bạn!', 'success'); await loadStories();
  } catch (error) { notify(error.message, 'danger'); }
  finally { button.disabled = false; }
}

function applySettings() {
  const settings = state.settings;
  if (!settings) return;
  $$('[data-channel-name]').forEach((node) => { node.textContent = settings.channelName; });
  $$('[data-channel-tagline]').forEach((node) => { node.textContent = settings.tagline; });
  if (page === 'about') {
    $('#aboutTitle').textContent = settings.aboutTitle || settings.channelName;
    const body = $('#aboutBody'); body.replaceChildren();
    String(settings.aboutBody || 'Thông tin kênh đang được cập nhật.').split(/\n+/).filter(Boolean).forEach((line) => body.append(element('p', '', line)));
    const avatar = $('#aboutAvatar');
    if (settings.logoUrl && avatar) { avatar.replaceChildren(); const img = new Image(); img.src = settings.logoUrl; img.alt = settings.channelName; avatar.append(img); }
    const links = $('#aboutLinks');
    if (links) {
      links.replaceChildren();
      const items = [...(settings.socialLinks || [])];
      if (settings.youtubeUrl) items.unshift({ label: 'YouTube', url: settings.youtubeUrl, icon: 'fa-youtube', color: '#ff496f', visible: true });
      if (settings.contactEmail) items.push({ label: settings.contactEmail, url: `mailto:${settings.contactEmail}`, icon: 'fa-envelope', color: '#a78bfa', visible: true });
      items.filter((item) => item.visible !== false).forEach((item) => {
        const link = element('a', 'social-link'); link.href = item.url; link.target = item.url.startsWith('mailto:') ? '_self' : '_blank'; link.rel = 'noopener noreferrer'; link.style.setProperty('--link-color', item.color || '#a78bfa');
        const brandIcon = /(?:youtube|facebook|instagram|tiktok|discord|x-twitter|threads)/.test(item.icon || '');
        const iconNode = element('i', `${brandIcon ? 'fa-brands' : 'fa-solid'} ${item.icon || 'fa-link'}`); link.append(iconNode, element('span', '', item.label)); links.append(link);
      });
    }
  }
}

function setActiveNavigation(className) {
  $$('.desktop-nav a,.mobile-nav a').forEach((link) => {
    if (link.classList.contains(className)) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function setupNavigation() {
  const pageNav = { completed: 'nav-completed', guide: 'nav-guide', about: 'nav-about' }[page];
  if (pageNav) return setActiveNavigation(pageNav);
  if (page !== 'home') return;

  const sections = ['trending', 'airing', 'library']
    .map((id) => document.getElementById(id)).filter(Boolean);
  const activate = (id) => setActiveNavigation(`nav-${id}`);
  activate((location.hash || '#trending').slice(1));

  $$('[data-nav-section]').forEach((link) => link.addEventListener('click', () => activate(link.dataset.navSection)));
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) activate(visible.target.id);
  }, { rootMargin: '-18% 0px -58% 0px', threshold: [0, .15, .35, .6] });
  sections.forEach((section) => observer.observe(section));
}

function renderAnnouncements() {
  const host = $('#announcementHost');
  const relevant = state.announcements.filter((item) => item.page_scope === 'all' || item.page_scope === page);
  relevant.forEach((item) => {
    if (storageGet(`announcement_${item.id}`, true)) return;
    if (item.display_mode === 'toast') return notify(`${item.title}: ${item.message}`, item.tone);
    if (item.display_mode === 'modal' && window.Swal) {
      window.Swal.fire({ icon: item.tone === 'danger' ? 'error' : item.tone, title: item.title, text: item.message, confirmButtonText: 'Đã hiểu', customClass: { popup: 'cosmic-swal' } });
      storageSet(`announcement_${item.id}`, '1', true); return;
    }
    if (!host) return;
    const banner = element('aside', `announcement tone-${item.tone}`);
    banner.append(icon(item.tone === 'warning' || item.tone === 'danger' ? 'triangle-exclamation' : 'bell'));
    const copy = element('div'); copy.append(element('strong', '', item.title), element('p', '', item.message)); banner.append(copy);
    if (item.dismissible) { const close = element('button', 'announcement-close', '×'); close.type = 'button'; close.addEventListener('click', () => { storageSet(`announcement_${item.id}`, '1', true); banner.remove(); }); banner.append(close); }
    host.append(banner);
  });
}

async function loadSettings() {
  try {
    const payload = await api('/api/settings', { cache: 'no-store' });
    state.settings = payload.settings;
    state.announcements = payload.announcements || [];
    applySettings(); renderAnnouncements();
  } catch { /* giao diện vẫn hoạt động với nội dung mặc định */ }
}

async function loadStories() {
  try {
    const payload = await api('/api/stories', { cache: 'no-store' });
    state.stories = Array.isArray(payload.stories) ? payload.stories.map(normalizeStory).filter((item) => item.id && item.title) : [];
    renderHome(); fillDonationStories();
  } catch (error) {
    ['#topStories', '#airingStories', '#storyGrid', '#completedGrid'].forEach((selector) => {
      const host = $(selector); if (host) host.replaceChildren(empty('Không tải được dữ liệu', 'Kiểm tra kết nối Supabase rồi thử lại.'));
    });
    const count = $('#resultCount'); if (count) count.replaceChildren(icon('triangle-exclamation'), document.createTextNode(' Không thể tải'));
    notify(error.message, 'danger');
  }
}

function bindEvents() {
  const menu = $('#menuButton'); const nav = $('#mobileNav');
  menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') === 'true'; menu.setAttribute('aria-expanded', String(!open)); nav.hidden = open; });
  $$('#mobileNav a').forEach((link) => link.addEventListener('click', () => { nav.hidden = true; menu?.setAttribute('aria-expanded', 'false'); }));
  $$('[data-open-suggestion]').forEach((button) => button.addEventListener('click', () => openDialog($('#suggestionDialog'))));
  $$('[data-open-external-donation]').forEach((button) => button.addEventListener('click', () => openDonation(null, true)));
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  $$('dialog.modal').forEach((dialog) => {
    dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); });
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener('close', () => restoreDialogFocus(dialog));
  });
  $('#suggestionHelp')?.addEventListener('click', () => {
    const button = $('#suggestionHelp'); const panel = $('#suggestionHelpPanel');
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open)); panel.hidden = open;
  });
  $('#suggestionForm')?.addEventListener('submit', submitSuggestion);
  $('#donationForm')?.addEventListener('submit', submitDonation);
  $('#replacementForm')?.addEventListener('submit', submitReplacement);
  ['searchInput', 'versionFilter', 'sourceFilter', 'sortSelect'].forEach((id) => {
    $(`#${id}`)?.addEventListener(id === 'searchInput' ? 'input' : 'change', () => { state.visibleLimit = 12; renderLibrary(); renderCompleted(); });
  });
  $$('[data-library-view]').forEach((button) => button.addEventListener('click', () => {
    state.libraryView = button.dataset.libraryView === 'selected' ? 'selected' : 'proposed';
    state.visibleLimit = 12;
    renderLibrary();
  }));
  $('#loadMoreButton')?.addEventListener('click', () => { state.visibleLimit += 12; renderLibrary(); });
  const donationForm = $('#donationForm');
  $('#donationStoryToggle')?.addEventListener('click', toggleDonationStoryPicker);
  $('#donationStorySearch')?.addEventListener('input', (event) => {
    fillDonationStories(event.currentTarget.value, null);
  });
  document.addEventListener('click', (event) => {
    const picker = $('#donationStoryPicker');
    if (picker && !picker.contains(event.target)) closeDonationStoryPicker();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDonationStoryPicker(); });
  window.addEventListener('focus', scheduleDonationReturnCheck);
  window.addEventListener('pageshow', scheduleDonationReturnCheck);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleDonationReturnCheck(); });
  ['donor_name', 'amount_vnd'].forEach((name) => donationForm?.elements[name]?.addEventListener('input', updateDonationPanel));
}

bindEvents();
setupNavigation();
Promise.all([loadSettings(), ['guide', 'about', 'privacy', 'terms'].includes(page) ? Promise.resolve() : loadStories()])
  .then(() => {
    if (restoreDonationDraft()) {
      try { sessionStorage.removeItem('hoiam_bank_trip_started'); } catch { /* ignored */ }
    }
  });
