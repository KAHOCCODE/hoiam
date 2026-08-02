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
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const privacyHtml = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
const termsHtml = fs.readFileSync(path.join(root, 'terms.html'), 'utf8');
const sitemapText = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const siteCss = fs.readFileSync(path.join(root, 'assets/site.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
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
assert.match(homeHtml, /name="story_select" type="hidden"/, 'Donation story value needs one hidden form field');
assert.doesNotMatch(homeHtml, /<select[^>]+name="story_select"/, 'Donation must not show a second native story selector');
assert.doesNotMatch(homeHtml, /cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/i, 'Icons must work without the CDN');
assert.match(homeHtml, /data-nav-section="trending"/, 'Homepage navigation needs section tracking');
assert.match(homeHtml, /ca-pub-6051983418402912/, 'Existing AdSense account must be preserved');
for (const pageName of ['index.html', 'completed.html', 'guide.html', 'about.html']) {
  const publicHtml = fs.readFileSync(path.join(root, pageName), 'utf8');
  assert.match(publicHtml, /href="\/privacy\.html"/, `${pageName} needs a privacy link`);
  assert.match(publicHtml, /href="\/terms\.html"/, `${pageName} needs a terms link`);
}
assert.match(privacyHtml, /Google AdSense/, 'Privacy policy needs an advertising disclosure');
assert.match(privacyHtml, /cookie/i, 'Privacy policy needs a cookie disclosure');
assert.match(privacyHtml, /hoiamdammy@gmail\.com/, 'Privacy policy needs a contact method');
assert.doesNotMatch(privacyHtml, /adsbygoogle\.js/, 'Privacy policy must not load advertising');
assert.doesNotMatch(termsHtml, /adsbygoogle\.js/, 'Terms page must not load advertising');
assert.match(sitemapText, /privacy\.html/, 'Sitemap needs the privacy policy');
assert.match(sitemapText, /terms\.html/, 'Sitemap needs the terms page');
assert.match(adminHtml, /name="robots" content="noindex/i, 'Admin must not be indexed');
assert.match(adminHtml, /id="storySort"/, 'Admin stories need sorting');
assert.match(adminHtml, /id="donationDetailDialog"/, 'Admin donations need a detail dialog');
assert.match(adminHtml, /name="bankId"/, 'Admin settings need a VietQR bank identifier');
assert.match(siteCss, /\.mobile-nav\[hidden\]\s*\{[^}]*display:\s*none/i, 'Hidden mobile menu must not cover content');
assert.match(siteCss, /\.badge\.convert[^}]*background:/i, 'Convert badge needs its own background');
assert.match(siteCss, /\.badge\.edit[^}]*background:/i, 'Edit badge needs its own background');
assert.match(siteCss, /\.donation-story-menu\s*\{[^}]*overflow:\s*auto/i, 'Story search must scroll naturally with its options');
assert.equal(
  fs.readFileSync(path.join(root, 'ads.txt'), 'utf8').trim(),
  'google.com, pub-6051983418402912, DIRECT, f08c47fec0942fa0',
  'ads.txt publisher record must stay exact'
);
assert.match(appJs, /api\('\/api\/stories',\s*\{\s*cache:\s*'no-store'\s*\}\)/, 'Story requests must bypass stale browser caches');
assert.match(appJs, /api\('\/api\/settings',\s*\{\s*cache:\s*'no-store'\s*\}\)/, 'Settings requests must bypass stale browser caches');
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

const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.deepEqual(vercelConfig.rewrites?.[0], {
  source: '/api/:path*',
  destination: '/api?path=:path*',
}, 'Vercel must rewrite every nested API route to the shared function');

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
