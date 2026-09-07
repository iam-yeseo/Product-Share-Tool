const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'templates/product-page.html'), 'utf8');
for (const [page, title, body] of [['edit','편집','view-editor'],['view','보기','view-registrar']]) {
  fs.mkdirSync(path.join(root,page),{recursive:true});
  fs.writeFileSync(path.join(root,page,'index.html'), template.replaceAll('{{PAGE}}',page).replaceAll('{{TITLE}}',title).replaceAll('{{BODY_CLASS}}',body));
}
console.log('edit/index.html, view/index.html 생성 완료');
