const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'templates/product-page.html'), 'utf8');
for (const [page, title, body] of [['edit','편집','view-editor'],['view','보기','view-registrar']]) {
  fs.mkdirSync(path.join(root,page),{recursive:true});
  fs.writeFileSync(path.join(root,page,'index.html'), template.replaceAll('{{PAGE}}',page).replaceAll('{{TITLE}}',title).replaceAll('{{BODY_CLASS}}',body));
}
const settings = JSON.parse(fs.readFileSync(path.join(root, 'data/automation-settings.json'), 'utf8'));
fs.writeFileSync(path.join(root, 'js/brand-defaults.js'),
  '/* 자동 생성 파일 — data/automation-settings.json 의 brands 를 npm run build 로 변환합니다. 직접 고치지 마세요.\n' +
  '   공용 설정에 brands 가 아직 없을 때(마이그레이션 미적용) 화면에서 쓰는 기본 브랜드 목록입니다. */\n' +
  'var BRAND_DEFAULTS = ' + JSON.stringify(settings.brands) + ';\n');
console.log('edit/index.html, view/index.html, js/brand-defaults.js 생성 완료');
