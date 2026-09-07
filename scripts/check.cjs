const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
for (const file of fs.readdirSync('js').filter(f => f.endsWith('.js'))) execFileSync(process.execPath,['--check','js/'+file]);
const core = require('../js/automation-core.js');
core.validateSettings(JSON.parse(fs.readFileSync('data/automation-settings.json')));
console.log('JavaScript 및 카테고리 구조 검사 통과');
