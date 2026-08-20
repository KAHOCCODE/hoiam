const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const required = [
  'index.html',
  'completed.html',
  'guide.html',
  'about.html',
  'privacy.html',
  'terms.html',
  'admin.html',
  'assets/app.js',
  'assets/admin.js',
  'assets/site.css',
  'assets/styles.css',
  'assets/images/galaxy.webp',
  'assets/vendor/fontawesome/css/all.min.css',
  'assets/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  'robots.txt',
  'ads.txt',
  'sitemap.xml',
  'supabase.sql',
  'api/index.js',
  'api/_routes/bootstrap.js',
  'api/_routes/admin/bootstrap.js',
];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`Missing required file: ${relative}`);
    process.exit(1);
  }
}

const jsFiles = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute);
    else if (entry.name.endsWith('.js')) jsFiles.push(absolute);
  }
}

collect(root);

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || `Syntax check failed: ${path.relative(root, file)}`);
    process.exit(result.status || 1);
  }
}

const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
for (const name of htmlFiles) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, [], `${name} contains duplicate element IDs`);

  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)/g)) {
    assert.ok(fs.existsSync(path.join(root, match[1])), `${name} references missing ${match[1]}`);
  }
}

const homeHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const completedHtml = fs.readFileSync(path.join(root, 'completed.html'), 'utf8');
const guideHtml = fs.readFileSync(path.join(root, 'guide.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const privacyHtml = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
const termsHtml = fs.readFileSync(path.join(root, 'terms.html'), 'utf8');
const sitemapText = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const siteCss = fs.readFileSync(path.join(root, 'assets/site.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'assets/styles.css'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'assets/admin.js'), 'utf8');
const settingsLib = fs.readFileSync(path.join(root, 'api/_routes/_lib/settings.js'), 'utf8');
const publicStoriesApi = fs.readFileSync(path.join(root, 'api/_routes/stories/index.js'), 'utf8');
const publicSettingsApi = fs.readFileSync(path.join(root, 'api/_routes/settings/index.js'), 'utf8');
const apiUtils = fs.readFileSync(path.join(root, 'api/_routes/_lib/utils.js'), 'utf8');
const vercelConfigText = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
const migrationSql = fs.readFileSync(path.join(root, 'supabase.sql'), 'utf8');
assert.match(homeHtml, /rel="canonical"/i, 'Homepage needs a canonical URL');
assert.match(homeHtml, /application\/ld\+json/i, 'Homepage needs structured data');
assert.match(homeHtml, /id="suggestionHelpPanel"/, 'Suggestion form needs inline help');
assert.match(homeHtml, /id="donationStorySearch"/, 'Donation story picker needs search');
assert.match(homeHtml, /id="donationStoryPicker"/, 'Donation needs one combined searchable story picker');
assert.match(homeHtml, /data-library-view="proposed"/, 'Library needs a proposed-story view');
assert.match(homeHtml, /data-library-view="selected"/, 'Library needs a separate selected-story view');
assert.match(homeHtml, /data-library-view="voted"/, 'Library needs a personal voted-story view');
assert.match(homeHtml, /data-library-view="recent"/, 'Library needs a recent-story view');
assert.match(homeHtml, /id="libraryViewTitle"/, 'Library needs a clear title for the active story group');
assert.match(homeHtml, /class="echo-mascot-art"/, 'Homepage needs the official Hoi Hoi mascot artwork');
assert.doesNotMatch(homeHtml, /Hồi Hồi đang nghe nè!/, 'Mascot artwork must not carry a distracting speech label');
assert.match(homeHtml, /class="filter-select"/, 'Library filters need consistent icon labels');
assert.match(homeHtml, /id="storyDialog"[^>]+aria-labelledby="storyDialogTitle"/, 'Story modal needs an accessible title');
assert.match(homeHtml, /id="suggestionDialog"[^>]+aria-labelledby="suggestionDialogTitle"/, 'Suggestion modal needs an accessible title');
assert.match(homeHtml, /id="donationDialog"[^>]+aria-labelledby="donationTitle"/, 'Donation modal needs an accessible title');
assert.match(homeHtml, /id="replacementDialog"[^>]+aria-labelledby="replacementDialogTitle"/, 'Replacement modal needs an accessible title');
assert.match(homeHtml, /data-modal-initial-focus/, 'Forms need an intentional initial focus target');
assert.match(completedHtml, /id="completedGrid"/, 'Completed page needs its story list');
assert.doesNotMatch(completedHtml, /id="(?:searchInput|versionFilter|sourceFilter|sortSelect)"/, 'Completed page must stay free of unnecessary filters');
assert.match(completedHtml, /id="storyDialog"[^>]+aria-labelledby="storyDialogTitle"/, 'Completed story modal needs the same accessible title');
assert.match(guideHtml, /"@type": "HowTo"/, 'Guide page needs HowTo structured data');
assert.match(guideHtml, /class="guide-hero"/, 'Guide page needs a focused introduction');
assert.match(guideHtml, /class="guide-index"/, 'Guide page needs an action index');
for (const guideId of ['guide-suggest', 'guide-vote', 'guide-donate', 'guide-source']) {
  assert.match(guideHtml, new RegExp(`id="${guideId}"`), `Guide page needs ${guideId}`);
  assert.match(guideHtml, new RegExp(`data-guide-target="${guideId}"`), `Guide navigation needs ${guideId}`);
}
assert.match(guideHtml, /class="guide-rate"/, 'Guide page needs the donation conversion summary');
const aboutHtml = fs.readFileSync(path.join(root, 'about.html'), 'utf8');
assert.match(aboutHtml, /class="about-hero"/, 'About page needs a distinctive channel introduction');
assert.match(aboutHtml, /id="aboutChannels"/, 'About page needs a discoverable destination section');
assert.match(aboutHtml, /id="aboutStructuredData"[^>]+application\/ld\+json/, 'About page needs editable structured data');
assert.match(siteCss, /\.about-link-card\.featured\s*\{/, 'The primary channel needs a prominent destination card');
assert.match(appJs, /aboutLinkPresentation/, 'About links need useful context and fallback descriptions');
assert.match(adminJs, /name="description"[^>]+maxlength="180"/, 'Admin links need an editable short description');
assert.match(settingsLib, /description:\s*safeText\(link\.description/, 'Link descriptions must be sanitized');
assert.match(homeHtml, /name="story_select" type="hidden"/, 'Donation story value needs one hidden form field');
assert.doesNotMatch(homeHtml, /<select[^>]+name="story_select"/, 'Donation must not show a second native story selector');
assert.doesNotMatch(homeHtml, /cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/i, 'Icons must work without the CDN');
assert.match(homeHtml, /data-nav-section="trending"/, 'Homepage navigation needs section tracking');
assert.match(homeHtml, /ca-pub-6051983418402912/, 'Existing AdSense account must be preserved');
for (const pageName of ['index.html', 'completed.html', 'guide.html', 'about.html', 'privacy.html', 'terms.html']) {
  const publicHtml = fs.readFileSync(path.join(root, pageName), 'utf8');
  assert.match(publicHtml, /href="\/privacy\.html"/, `${pageName} needs a privacy link`);
  assert.match(publicHtml, /href="\/terms\.html"/, `${pageName} needs a terms link`);
  assert.match(publicHtml, /\/_vercel\/insights\/script\.js/, `${pageName} needs Vercel Web Analytics`);
}
assert.match(privacyHtml, /Google AdSense/, 'Privacy policy needs an advertising disclosure');
assert.match(privacyHtml, /cookie/i, 'Privacy policy needs a cookie disclosure');
assert.match(privacyHtml, /hoiamdammy@gmail\.com/, 'Privacy policy needs a contact method');
assert.match(privacyHtml, /Vercel Web Analytics/, 'Privacy policy needs an analytics disclosure');
assert.doesNotMatch(privacyHtml, /adsbygoogle\.js/, 'Privacy policy must not load advertising');
assert.doesNotMatch(termsHtml, /adsbygoogle\.js/, 'Terms page must not load advertising');
assert.doesNotMatch(adminHtml, /\/_vercel\/insights\/script\.js/, 'Admin traffic must stay out of public analytics');
assert.match(sitemapText, /privacy\.html/, 'Sitemap needs the privacy policy');
assert.match(sitemapText, /terms\.html/, 'Sitemap needs the terms page');
assert.match(adminHtml, /name="robots" content="noindex/i, 'Admin must not be indexed');
assert.match(adminHtml, /name="admin-ui-version" content="06126"/, 'Admin markup needs an explicit UI version');
assert.match(adminHtml, /id="attentionList"[^>]+hidden/, 'Admin needs a hidden compatibility host for older scripts');
assert.match(adminHtml, /id="storySort"/, 'Admin stories need sorting');
assert.match(adminHtml, /data-story-status="đề xuất"/, 'Admin story navigation needs status submenus');
assert.match(adminHtml, /id="storyAdvancedFilters"[^>]+hidden/, 'Secondary story filters need to stay collapsed by default');
assert.match(adminHtml, /id="storyResultCount"/, 'Admin story manager needs a visible result count');
assert.match(adminHtml, /id="drawerOpenSource"/, 'Story editor needs a direct source action');
assert.match(adminHtml, /id="overviewRing"/, 'Admin overview needs a visual progress summary');
assert.match(adminHtml, /id="storyContentSection"/, 'Story editor needs grouped display fields');
assert.match(adminHtml, /id="storySourceSection"/, 'Story editor needs grouped source controls');
assert.match(adminHtml, /id="donationDetailDialog"/, 'Admin donations need a detail dialog');
assert.match(adminHtml, /responsive-data-table story-data-table/, 'Admin story rows need a mobile card layout');
assert.match(adminHtml, /responsive-data-table donation-data-table/, 'Admin donation rows need a mobile card layout');
assert.match(adminHtml, /id="externalDonationStoryList"/, 'External donations need searchable story choices');
assert.match(adminHtml, /name="page_scope"/, 'Announcements need an editable page scope');
assert.match(adminHtml, /id="settingsSaveState"/, 'Long settings need a visible save state');
assert.match(adminHtml, /id="sidebarClose"/, 'Tablet navigation needs an explicit close button');
for (const previewId of ['storyThumbnailPreview', 'completedThumbnailPreview', 'settingsLogoPreview', 'settingsQrPreview']) {
  assert.match(adminHtml, new RegExp(`id="${previewId}"`), `Admin image URL needs preview host ${previewId}`);
}
assert.match(adminHtml, /name="bankId"/, 'Admin settings need a VietQR bank identifier');
assert.match(siteCss, /\.mobile-nav\[hidden\]\s*\{[^}]*display:\s*none/i, 'Hidden mobile menu must not cover content');
assert.match(siteCss, /\.badge\.convert[^}]*background:/i, 'Convert badge needs its own background');
assert.match(siteCss, /\.badge\.edit[^}]*background:/i, 'Edit badge needs its own background');
assert.match(siteCss, /\.donation-story-menu\s*\{[^}]*overflow:\s*auto/i, 'Story search must scroll naturally with its options');
assert.match(siteCss, /\.story-dialog-content\s*\{[^}]*grid-template-columns:/i, 'Story modal needs a structured desktop layout');
assert.match(siteCss, /max-height:\s*calc\(100dvh/i, 'Modals must fit the mobile viewport');
assert.match(siteCss, /\.mobile-nav\.is-open\s*\{[^}]*opacity:\s*1/i, 'Mobile navigation needs a visible animated state');
assert.match(siteCss, /\.direct-source-link\s*\{/, 'Direct source actions need a consistent visual style');
assert.match(siteCss, /\.guide-layout\s*\{[^}]*grid-template-columns:/i, 'Guide page needs a responsive content layout');
assert.match(siteCss, /\.guide-index\s*\{[^}]*position:\s*sticky/i, 'Guide index needs to remain visible on desktop');
assert.match(siteCss, /\.guide-final-cta\s*\{/, 'Guide page needs a clear final action');
assert.match(adminCss, /\.side-subnav\s*\{/, 'Admin story states need a second-level navigation');
assert.match(adminCss, /\.side-nav-group\.expanded \.side-subnav\s*\{/, 'Admin story submenu must expand independently before choosing a child view');
assert.match(adminHtml, /class="side-subnav-label"/, 'Admin story submenu needs a visible context label');
assert.match(adminCss, /\.side-subnav-label\s*\{/, 'Admin story submenu label needs a distinct visual treatment');
assert.match(adminCss, /\.side-subnav button\{[^}]*min-height:41px!important/, 'Admin story status targets must be easy to read and click');
assert.match(adminCss, /\.data-table td\{font-size:\.79rem\}/, 'Admin table text must remain readable');
assert.match(adminCss, /\.overview-snapshot\s*\{/, 'Admin overview needs a visual snapshot layout');
assert.match(adminCss, /\.story-primary-toolbar\s*\{/, 'Admin story manager needs a focused primary toolbar');
assert.match(adminCss, /\.drawer-form-section\s*\{/, 'Admin story editor needs progressive sections');
assert.match(adminCss, /@media\(max-width:1024px\)/, 'Admin sidebar must collapse on tablets');
assert.match(adminCss, /@media\(max-width:820px\)/, 'Admin tables must become cards on small tablets');
assert.match(adminCss, /\.responsive-data-table tbody tr\{/, 'Admin tables need touch-friendly mobile cards');
assert.match(adminCss, /width:min\(1180px,calc\(100vw - 48px\)\)/, 'Story editing needs a wide workspace on desktop');
assert.match(adminCss, /\.drawer-body\{min-height:0[^}]*overflow-y:auto[^}]*touch-action:pan-y/, 'Story editor content must remain scrollable on touch devices');
assert.match(adminCss, /\.image-url-preview\{/, 'Image URL fields need a consistent preview');
assert.match(adminCss, /\.story-data-table,\.donation-data-table,\.responsive-data-table\{width:100%!important;min-width:0!important;max-width:100%!important\}/, 'Mobile Admin tables must override legacy minimum widths');
assert.match(adminCss, /\.responsive-data-table \.story-cell>div[^}]*min-width:0/, 'Long mobile story titles must be allowed to shrink');
assert.match(adminCss, /\.drawer-panel\{display:flex!important;flex-direction:column/, 'Mobile story editor must use a vertical flex layout');
assert.match(adminCss, /\.drawer-body\{display:block!important;flex:1 1 auto[^}]*overflow-y:auto/, 'Mobile story editor body must own vertical scrolling');
assert.match(adminCss, /\.drawer-body>\.drawer-core-section,\.drawer-body>\.drawer-form-section[^}]*grid-row:auto!important/, 'Mobile story editor sections must not share desktop grid rows');
assert.match(adminJs, /drawerBody\.scrollTop = 0/, 'Story editor must reset its scroll position when opened');
assert.equal(
  fs.readFileSync(path.join(root, 'ads.txt'), 'utf8').trim(),
  'google.com, pub-6051983418402912, DIRECT, f08c47fec0942fa0',
  'ads.txt publisher record must stay exact'
);
assert.match(appJs, /api\('\/api\/bootstrap',\s*\{\s*cache:\s*'no-store'\s*\}\)/, 'Initial public data must use one fresh bootstrap request');
assert.match(appJs, /api\('\/api\/settings',\s*\{\s*cache:\s*'no-store'\s*\}\)/, 'Settings requests must bypass stale browser caches');
assert.match(appJs, /function hydratePublicCache\(/, 'Public pages need immediate cached rendering');
assert.match(appJs, /storiesFromCache/, 'Cached stories need an explicit stale-data state');
assert.match(appJs, /state\.libraryView === 'selected'[^\n]+story\.status === 'đã chọn'/, 'Library views must filter each story status separately');
assert.match(appJs, /recentStoryIds\(\)/, 'Library needs local recent-story history');
assert.match(appJs, /navigator\.share/, 'Story details need native sharing when available');
assert.match(appJs, /story-card-mark/, 'Library cards need one consistent visual marker');
assert.doesNotMatch(publicStoriesApi, /s-maxage|stale-while-revalidate/i, 'Story API must not cache changing vote totals');
assert.doesNotMatch(publicSettingsApi, /s-maxage|stale-while-revalidate/i, 'Settings API must not cache cross-page changes');
assert.match(apiUtils, /setHeader\('Cache-Control',\s*'no-store'\)/, 'Dynamic API responses must disable caching');
assert.match(appJs, /https:\/\/img\.vietqr\.io\/image\//, 'Donation panel needs dynamic VietQR generation');
assert.match(appJs, /searchParams\.set\('amount'/, 'VietQR needs the selected donation amount');
assert.match(appJs, /searchParams\.set\('addInfo'/, 'VietQR needs generated transfer content');
assert.match(settingsLib, /bankId:/, 'VietQR bank identifier must be preserved in settings');
assert.match(appJs, /\$\{platform\}-app-deeplinks/, 'Mobile donation flow needs the current bank app list');
assert.match(appJs, /https:\/\/dl\.vietqr\.io\/pay/, 'Mobile donation flow needs a bank app deeplink');
assert.match(appJs, /hoiam_donation_draft/, 'Donation form must survive the trip to the bank app');
assert.match(vercelConfigText, /script-src 'self' 'unsafe-inline' 'unsafe-eval' https:/, 'CSP must allow changing AdSense resources');
assert.match(vercelConfigText, /"source": "\/ads\.txt"/, 'Vercel needs a dedicated ads.txt header');
assert.match(vercelConfigText, /text\/plain; charset=utf-8/, 'ads.txt must be served as plain text');
assert.match(appJs, /\['guide', 'about', 'privacy', 'terms'\]\.includes\(page\)/, 'Legal pages must not request the story catalog');
assert.match(appJs, /function fallbackBankApps\(/, 'Bank app selection needs an offline fallback');
assert.match(appJs, /controller\.abort\(\)/, 'Bank app discovery needs a timeout');
assert.match(appJs, /Đang tải ứng dụng ngân hàng/, 'Bank app selection needs immediate loading feedback');
assert.match(appJs, /closeDialog\(\$\('#donationDialog'\)\)/, 'Bank picker must not render behind the native donation dialog');
assert.match(appJs, /id=\"bankAppSearch\"/, 'Bank app picker needs search');
assert.match(appJs, /Number\(b\.autofill\) - Number\(a\.autofill\)/, 'Autofill bank apps must stay at the top');
assert.match(appJs, /app\.autofill \? 'Ưu tiên' : 'Mở app'/, 'Autofill bank apps need a priority label');
assert.match(appJs, /const dialogReturnFocus = new WeakMap\(\)/, 'Modals need to remember the opener');
assert.match(appJs, /addEventListener\('cancel'/, 'Native dialog cancellation needs controlled cleanup');
assert.match(appJs, /restoreDialogFocus\(dialog\)/, 'Closing a modal needs to restore keyboard focus');
assert.match(appJs, /function directSourceLink\(/, 'Story cards need a reusable direct source action');
assert.match(appJs, /link\.target = '_blank'/, 'Direct source actions need to open separately');
assert.match(appJs, /function setMobileMenu\(open\)/, 'Mobile menu needs one consistent state controller');
assert.match(appJs, /window\.addEventListener\('scroll', requestSync/, 'Section navigation needs to follow scrolling');
assert.match(appJs, /function setupGuidePage\(\)/, 'Guide page needs focused interaction behavior');
assert.match(adminJs, /function selectStoryStatus\(/, 'Admin story state navigation needs one controller');
assert.match(adminJs, /setAttribute\('aria-current', 'location'\)/, 'Admin story submenu needs an accessible active state');
assert.match(adminJs, /storyFilterToggle/, 'Admin secondary filters need an explicit toggle');
assert.match(adminJs, /statReplacementPending/, 'Admin overview needs pending replacement data');
assert.match(adminJs, /function ensureCompatibleMarkup\(/, 'Admin must detect mixed HTML and JavaScript versions');
assert.match(adminJs, /function reloadStories\(/, 'Story mutations need a focused data refresh');
assert.match(adminJs, /function openAnnouncementDialog\(/, 'Existing announcements need an edit flow');
assert.match(adminJs, /Khôi phục truyện/, 'Trash needs an explicit restore action');
assert.match(adminJs, /request\('\/admin\/bootstrap'\)/, 'Admin startup must use one bootstrap request');
assert.match(adminJs, /window\.innerWidth <= 1024/, 'Admin navigation must switch to a drawer on tablets');
assert.match(adminJs, /restoreDialogFocus\(dialog\)/, 'Admin dialogs need to restore keyboard focus');
assert.match(adminJs, /const imagePreviews = \[/, 'Admin must initialize image URL previews');
assert.match(adminJs, /\$\('#sidebarClose'\)\.addEventListener/, 'Mobile and tablet navigation needs an explicit close action');
assert.match(adminJs, /\$\('#storyContentSection'\)\.open = true/, 'Common story display fields should open immediately');
const switchViewBlock = adminJs.slice(adminJs.indexOf('function switchView('), adminJs.indexOf('function selectStoryStatus('));
assert.doesNotMatch(switchViewBlock, /setSidebar\(false\)/, 'Selecting an Admin section must not close mobile navigation automatically');
assert.match(vercelConfigText, /"source": "\/admin\.html"[\s\S]*?private, no-store, no-cache, must-revalidate/, 'Admin HTML must bypass stale caches');
assert.doesNotMatch(vercelConfigText, /stale-while-revalidate/, 'Changing interface assets must not be served stale');
assert.match(appJs, /detail\.addEventListener\('toggle'/, 'Guide sections need synchronized active states');
assert.match(appJs, /\['ArrowLeft', 'ArrowRight'\]/, 'Library tabs need keyboard navigation');
assert.match(appJs, /dataset\.locked = String\(locked\)/, 'Story card donations must lock the selected story');
assert.match(appJs, /hoiam_bank_trip_started/, 'Donation flow must remember a trip to the bank app');
assert.match(appJs, /addEventListener\('visibilitychange'/, 'Donation form must return when the bank app becomes hidden');
assert.match(appJs, /addEventListener\('focus'/, 'Donation form must return when the browser regains focus');
assert.match(appJs, /addEventListener\('pageshow'/, 'Donation form must return after browser history navigation');

const dropStatusConstraint = migrationSql.indexOf('drop constraint if exists stories_status_check');
const normalizeStatuses = migrationSql.indexOf('update public.stories');
const addStatusConstraint = migrationSql.indexOf('add constraint stories_status_check');
assert.ok(
  dropStatusConstraint >= 0 && dropStatusConstraint < normalizeStatuses && normalizeStatuses < addStatusConstraint,
  'Migration must replace the legacy status constraint around status normalization'
);

const { calculateDonation, makeTransferContent } = require(path.join(root, 'api/_routes/_lib/donations'));
assert.deepEqual(calculateDonation(50_000), { amountVnd: 50_000, stoneCount: 50, suggestedVotes: 10, pricePerVote: 5000 });
assert.equal(calculateDonation(100_000).suggestedVotes, 22);
assert.equal(calculateDonation(200_000).suggestedVotes, 50);
assert.equal(calculateDonation(500_000).suggestedVotes, 142);
assert.equal(calculateDonation(1_000_000).suggestedVotes, 333);
assert.equal(makeTransferContent('{story} - {name}', 'Truyện Đam Mỹ Rất Dài', 'Nguyễn Văn A'), 'Truyen Dam My Rat Dai Nguyen Van A');
assert.ok(makeTransferContent('{story} - {name}', 'A'.repeat(100), 'B'.repeat(100)).length <= 50);

const { normalizeStatus } = require(path.join(root, 'api/_routes/_lib/utils'));
assert.equal(normalizeStatus('đang đọc'), 'đang lên sóng');
assert.equal(normalizeStatus('ĐÃ HOÀN THÀNH'), 'đã hoàn thành');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_project_check';
const { normalizeTableName } = require(path.join(root, 'api/_routes/_lib/supabase'));
assert.equal(normalizeTableName('stories'), 'stories');
assert.equal(normalizeTableName(' public.stories '), 'stories');
assert.throws(() => normalizeTableName('stories?select=*'), /SUPABASE_STORIES_TABLE/);

const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.deepEqual(vercelConfig.rewrites?.[0], {
  source: '/api/(.*)',
  destination: '/api?path=$1',
}, 'Vercel must rewrite every nested API route to the shared function');
assert.doesNotMatch(vercelConfigText, /:path\*/, 'Vercel CLI 59 must not receive the legacy repeated path parameter');

const deployableFunctions = [];
function collectFunctions(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFunctions(absolute);
    else if (entry.name.endsWith('.js')) deployableFunctions.push(absolute);
  }
}
collectFunctions(path.join(root, 'api'));
assert.equal(deployableFunctions.length, 1, 'Hobby deployment must expose exactly one Vercel Function');

console.log(`Project check passed (${jsFiles.length} JavaScript files, ${htmlFiles.length} pages, ${deployableFunctions.length} Vercel Function).`);
