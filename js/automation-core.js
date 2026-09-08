/* Shared data contract. No DOM or database dependencies. */
var AutomationCore = (function () {
  var BASE = 'https://calla.hgodo.com/product/';
  var EXTENSIONS = ['jpg', 'png', 'webp', 'gif'];
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function slug(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  /* 브랜드 비교 키: 대소문자·공백·기호 차이를 무시합니다. (TILTA = tilta = Tilta-) */
  function brandKey(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3]/g, ''); }
  /* 입력 문자열과 같은 브랜드를 목록에서 찾습니다. 없으면 null. */
  function matchBrand(brands, text) {
    var key = brandKey(text);
    if (!key) return null;
    return (brands || []).find(function (b) { return brandKey(b.name) === key; }) || null;
  }
  function normalizeSettings(s) {
    if (s && typeof s === 'object' && !Array.isArray(s.brands)) s.brands = [];
    return s;
  }
  function normalize(value) {
    var a = value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : {};
    a.categoryCodes = Object.assign({ retail: '', wholesale: '' }, a.categoryCodes);
    a.detailImages = Array.isArray(a.detailImages) ? a.detailImages : [];
    a.generator = Object.assign({ brand: '', product: '', folder: '', extension: 'jpg', count: 1 }, a.generator);
    a.origin = typeof a.origin === 'string' ? a.origin.trim() : '';
    a.schemaVersion = 1;
    return a;
  }
  function path(categories, code) {
    var parts = [], seen = new Set();
    while (code && !seen.has(code)) {
      seen.add(code);
      var c = categories.find(function (n) { return n.code === code; });
      if (!c) return '';
      parts.unshift(c.name); code = c.parentCode;
    }
    return parts.join(' > ');
  }
  function defaultFolder(categories, code) {
    var seen = new Set();
    while (code && !seen.has(code)) {
      seen.add(code);
      var c = categories.find(function (n) { return n.code === code; });
      if (!c) break;
      if (c.folder) return c.folder;
      code = c.parentCode;
    }
    return '';
  }
  function imageUrl(image) {
    var folder = String(image.folder || '').trim();
    var filename = String(image.filename || '').trim();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(folder)) return '';
    if (!/^[a-z0-9][a-z0-9_.-]*\.(jpg|png|webp|gif)$/.test(filename) || filename.includes('..')) return '';
    return BASE + folder + '/' + filename;
  }
  function generate(g) {
    var brand = slug(g.brand), product = slug(g.product), count = Number(g.count);
    if (!brand || !product) throw new Error('영문 브랜드와 파일명용 제품명을 입력해 주세요.');
    if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('이미지 수는 1~50장으로 입력해 주세요.');
    if (!EXTENSIONS.includes(g.extension)) throw new Error('확장자를 선택해 주세요.');
    var images = Array.from({ length: count }, function (_, i) {
      return { folder: g.folder, filename: brand + '-' + product + (count > 1 ? '-' + (i + 1) : '') + '.' + g.extension };
    });
    if (!imageUrl(images[0])) throw new Error('이미지 폴더를 선택해 주세요.');
    return images;
  }
  function html(images) {
    if (!images.length || images.some(function (i) { return !imageUrl(i); })) return '';
    return '<div align="center">\n' + images.map(function (i) { return '  <img src="' + imageUrl(i) + '">'; }).join('\n') + '\n</div>';
  }
  function validation(image) {
    var v = image.validation;
    if (!v || v.url !== imageUrl(image) || v.status === 'checking') return { status: 'unchecked' };
    return clone(v);
  }
  function readyIssues(item, settings) {
    var a = normalize(item.automation), issues = [];
    ['retail', 'wholesale'].forEach(function (store) {
      if (item['need_' + store] !== '필요') return;
      var c = settings.categories[store].find(function (c) { return c.code === a.categoryCodes[store]; });
      if (!c || c.active === false) issues.push((store === 'retail' ? '소매몰' : '도매몰') + ' 카테고리 미선택 또는 사용 중지');
    });
    if (!item.name_own) issues.push('자사몰 상품명 미입력');
    if (!item.image_url && !(item.done && a.thumbnail && a.thumbnail.deletedAt)) issues.push('썸네일 미등록');
    if (!a.detailImages.length) issues.push('상세 이미지 미등록');
    a.detailImages.forEach(function (img, i) {
      if (!imageUrl(img)) issues.push((i + 1) + '번 이미지 주소 형식 오류');
      else if (validation(img).status !== 'valid') issues.push((i + 1) + '번 이미지 정상 확인 필요');
    });
    return issues;
  }
  function exportItem(item, settings) {
    var a = normalize(item.automation), brand = matchBrand(settings.brands, item.brand);
    return Object.assign({}, item, { automation: undefined, brand_custom: undefined, link_np: undefined, categoryCodes: a.categoryCodes, origin: a.origin,
      brandCode: brand ? brand.code : '', brandRegistered: !!brand,
      categoryPaths: { retail: path(settings.categories.retail, a.categoryCodes.retail), wholesale: path(settings.categories.wholesale, a.categoryCodes.wholesale) },
      thumbnail: Object.assign({}, a.thumbnail, { url: item.image_url || '' }),
      detailImages: a.detailImages.map(function (img, i) { return { order: i + 1, folder: img.folder, filename: img.filename, url: imageUrl(img), validation: validation(img) }; }),
      detailHtml: html(a.detailImages), issues: readyIssues(item, settings) });
  }
  function validateSettings(s) {
    if (!s || !s.categories || !Array.isArray(s.folders)) throw new Error('설정 형식이 올바르지 않습니다.');
    normalizeSettings(s);
    var brandKeys = new Set(), brandCodes = new Set();
    s.brands.forEach(function (b) {
      var name = String(b && b.name || '').trim(), code = String(b && b.code || '').trim();
      if (!name || name.length > 30 || name !== b.name) throw new Error('브랜드 이름은 1~30자이며 앞뒤 공백이 없어야 합니다.');
      if (brandKeys.has(brandKey(name))) throw new Error('"' + name + '" 브랜드가 이미 있습니다. 대소문자·공백만 다른 이름도 같은 브랜드로 봅니다.');
      brandKeys.add(brandKey(name));
      if (code) {
        if (!/^[A-Za-z0-9_-]{1,20}$/.test(code) || code !== b.code) throw new Error('브랜드 코드는 20자 이내의 영문·숫자·대시·밑줄입니다.');
        if (brandCodes.has(code)) throw new Error('브랜드 코드 ' + code + '이(가) 중복됩니다.');
        brandCodes.add(code);
      }
    });
    var folders = new Set();
    s.folders.forEach(function (f) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(f) || folders.has(f)) throw new Error('폴더 이름은 중복 없는 영문 소문자·숫자·대시·밑줄이어야 합니다.');
      folders.add(f);
    });
    ['retail','wholesale'].forEach(function (store) {
      var cats = s.categories[store], codes = new Set();
      if (!Array.isArray(cats)) throw new Error('몰별 카테고리 목록이 필요합니다.');
      cats.forEach(function (c) {
        if (!/^(?:\d{3}){1,4}$/.test(c.code) || codes.has(c.code) || !String(c.name || '').trim()) throw new Error('카테고리 이름·코드를 확인해 주세요. 코드는 3·6·9·12자리이며 몰 안에서 중복될 수 없습니다.');
        codes.add(c.code);
        if (c.folder && !folders.has(c.folder)) throw new Error('카테고리에 연결한 폴더가 없습니다.');
      });
      cats.forEach(function (c) {
        var expected = c.code.slice(0, -3);
        if ((c.parentCode || '') !== expected || (expected && !codes.has(expected))) throw new Error(c.code + ': 상위 카테고리와 코드가 맞지 않습니다.');
      });
    });
    return s;
  }
  return { BASE: BASE, EXTENSIONS: EXTENSIONS, clone: clone, slug: slug, brandKey: brandKey, matchBrand: matchBrand, normalizeSettings: normalizeSettings, normalize: normalize, path: path, defaultFolder: defaultFolder, imageUrl: imageUrl, generate: generate, html: html, validation: validation, readyIssues: readyIssues, exportItem: exportItem, validateSettings: validateSettings };
})();
if (typeof module !== 'undefined') module.exports = AutomationCore;
