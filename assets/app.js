const page = document.body.dataset.page || 'home';
const state = {
  stories: [],
  settings: null,
  announcements: [],
  visibleLimit: 12,
  activeStory: null,
  voteBusy: new Set(),
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

function openDialog(dialog) {
  if (!dialog) return;
  if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  document.body.classList.add('modal-open');
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog.open && dialog.close) dialog.close(); else dialog.removeAttribute('open');
  document.body.classList.remove('modal-open');
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
  const card = element('article', 'story-card');
  card.tabIndex = 0;
  const head = element('div', 'story-card-head');
  const badges = element('div', 'badge-row');
  badges.append(badge(story.version, story.version.toLowerCase()), badge(sourceDomain(story), 'source'));
  head.append(badges, voteButton(story, true));
  const title = element('h3', '', story.title);
  const note = element('p', 'story-note', story.note || 'Chưa có ghi chú.');
  const footer = element('div', 'story-card-footer');
  footer.append(badge(statusLabel(story.status), `status status-${story.status.replaceAll(' ', '-')}`));
  const view = element('button', 'text-button', 'Xem chi tiết');
  view.type = 'button';
  view.append(icon('arrow-right'));
  view.addEventListener('click', () => showStory(story.id));
  footer.append(view);
  card.append(head, title, note);
  if (story.sourceWarningPublic && story.sourceStatus === 'confirmed') {
    const warning = element('div', 'source-alert');
    warning.append(icon('triangle-exclamation'), element('span', '', deadlineText(story) || 'Nguồn đang cần thay thế'));
    card.append(warning);
  }
  card.append(footer);
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
  const list = state.stories.filter((story) => story.status === 'đề xuất' || story.status === 'đã chọn')
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
  if (!select || select.dataset.ready) return;
  const domains = [...new Set(stories.map(sourceDomain).filter((item) => item !== 'Không rõ nguồn'))].sort();
  domains.forEach((domain) => {
    const option = element('option', '', domain);
    option.value = domain;
    select.append(option);
  });
  select.dataset.ready = '1';
}

function renderLibrary() {
  const host = $('#storyGrid');
  if (!host) return;
  renderSourceOptions();
  const list = libraryStories();
  $('#resultCount').textContent = `${number.format(list.length)} truyện`;
  host.replaceChildren(...(list.length ? list.slice(0, state.visibleLimit).map(storyCard) : [empty('Không tìm thấy truyện', 'Hãy thử thay đổi bộ lọc.') ]));
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

function detailRow(label, value) {
  const row = element('div', 'detail-row'); row.append(element('span', '', label), element('strong', '', value)); return row;
}

function showStory(id) {
  const story = state.stories.find((item) => item.id === id);
  const dialog = $('#storyDialog'); const host = $('#storyDialogContent');
  if (!story || !dialog || !host) return;
  state.activeStory = story;
  host.replaceChildren();
  const image = storyImage(story);
  if (image) {
    const cover = element('div', 'detail-cover'); cover.style.backgroundImage = `url("${image.replace(/"/g, '')}")`; host.append(cover);
  }
  const body = element('div', 'detail-body');
  const chips = element('div', 'badge-row'); chips.append(badge(story.version, story.version.toLowerCase()), badge(statusLabel(story.status), 'status'), badge(sourceDomain(story), 'source'));
  body.append(chips, element('h2', '', story.title));
  const info = element('div', 'detail-stats'); info.append(detailRow('Tổng vote', number.format(story.votes)), detailRow('Trạng thái', statusLabel(story.status)), detailRow('Nguồn', sourceDomain(story))); body.append(info);
  if (story.note) body.append(element('p', 'detail-note', story.note));
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

function fillDonationStories() {
  const select = $('#donationForm [name="story_select"]'); if (!select) return;
  select.replaceChildren(element('option', '', 'Chọn truyện…'));
  select.firstChild.value = '';
  donationStories().forEach((story) => { const option = element('option', '', story.title); option.value = String(story.id); select.append(option); });
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
  form.reset(); fillDonationStories();
  form.elements.source_channel.value = external ? 'youtube' : 'website';
  form.elements.story_select.disabled = Boolean(storyId && !external);
  if (storyId) form.elements.story_select.value = String(storyId);
  form.elements.story_id.value = storyId ? String(storyId) : '';
  $('#donationTitle').textContent = external ? 'Báo đã donate' : 'Tặng Cá cho truyện';
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
    await window.Swal?.fire({ icon: 'success', title: 'Admin đã nhận thông báo', html: `Mã báo nhận: <strong>#${result.donation?.id || ''}</strong><br>Hệ thống đề xuất ${number.format(result.donation?.suggested_votes || 0)} vote. Admin sẽ kiểm tra trước khi cộng.`, confirmButtonText: 'Đã hiểu', customClass: { popup: 'cosmic-swal' } });
  } catch (error) { notify(error.message, 'danger'); }
  finally { button.disabled = false; }
}

function openReplacement(storyId) {
  const form = $('#replacementForm'); if (!form) return;
  form.reset(); form.elements.story_id.value = String(storyId); openDialog($('#replacementDialog'));
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
    const count = $('#resultCount'); if (count) count.textContent = 'Không thể tải';
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
  $$('dialog.modal').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); }));
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
  $('#loadMoreButton')?.addEventListener('click', () => { state.visibleLimit += 12; renderLibrary(); });
  const donationForm = $('#donationForm');
  ['story_select', 'donor_name', 'amount_vnd'].forEach((name) => donationForm?.elements[name]?.addEventListener('input', () => {
    donationForm.elements.story_id.value = donationForm.elements.story_select.value; updateDonationPanel();
  }));
}

bindEvents();
setupNavigation();
Promise.all([loadSettings(), page === 'guide' || page === 'about' ? Promise.resolve() : loadStories()]);
