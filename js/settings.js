/* A settings draft is only shared after an explicit save, with revision checking. */
(function () {
  var config, revision, store='retail', selected='', dirty=false, formDirty=false, saving=false;
  var brandSelected=null;   // 수정 중인 브랜드의 비교 키 (null = 추가)
  var byId=function(id){return document.getElementById(id);};
  function mark(){dirty=true;byId('saveSettings').disabled=false;byId('settingsState').textContent='저장 안 됨';}
  function list(){return config.categories[store];}
  function populate(){
    var chosen=list().find(function(c){return c.code===selected;});
    byId('categoryFormTitle').textContent=chosen?'카테고리 수정':'카테고리 추가';
    byId('categoryName').value=chosen?chosen.name:'';
    byId('categoryCode').value=chosen?chosen.code:'';byId('categoryCode').readOnly=!!chosen;
    byId('categoryParent').innerHTML='<option value="">없음 (1차 카테고리)</option>'+list().filter(function(c){return c.code.length<12 && c.code!==selected && !(selected && c.code.startsWith(selected));}).map(function(c){return '<option value="'+esc(c.code)+'">'+esc(AutomationCore.path(list(),c.code))+' ['+c.code+']</option>';}).join('');
    byId('categoryParent').value=chosen?chosen.parentCode:'';byId('categoryParent').disabled=!!chosen;
    byId('categoryFolder').innerHTML='<option value="">미지정 · 상위 연결 사용</option>'+config.folders.map(function(f){return '<option>'+esc(f)+'</option>';}).join('');
    byId('categoryFolder').value=chosen?chosen.folder:'';byId('categoryActive').checked=!chosen || chosen.active!==false;
    formDirty=false;
  }
  function tree(){
    var q=byId('categorySearch').value.toLowerCase();
    var rows=list().slice().sort(function(a,b){return a.code.localeCompare(b.code);}).filter(function(c){return !q || (c.code+' '+AutomationCore.path(list(),c.code)).toLowerCase().includes(q);});
    byId('categoryCount').textContent=list().length+'개 카테고리 · 최대 4차 · '+(store==='retail'?'소매몰':'도매몰')+' 독립 저장';
    byId('categoryHeading').textContent=(store==='retail'?'소매몰':'도매몰')+' 카테고리';
    byId('categoryTree').innerHTML=rows.map(function(c){return '<button class="category-node'+(c.code===selected?' is-active':'')+'" data-code="'+esc(c.code)+'" style="--depth:'+((c.code.length/3)-1)+'"><span>'+esc(c.name)+'</span><code>'+c.code+'</code><small>'+ (c.active===false?'사용 중지':c.folder?esc(c.folder):'')+'</small></button>';}).join('') || '<p class="empty-hint">검색 결과가 없습니다.</p>';
  }
  function folders(){byId('folderList').innerHTML=config.folders.map(function(f){return '<div class="folder-entry"><code>'+esc(f)+'</code><span class="field-note">/product/'+esc(f)+'/</span><button class="btn" data-rename-folder="'+esc(f)+'">수정</button></div>';}).join('');}
  /* ---------- 브랜드 ---------- */
  function brandsOf(c){return (c||config).brands;}
  function brandFind(key){return brandsOf().find(function(b){return AutomationCore.brandKey(b.name)===key;});}
  function brandTree(){
    var q=byId('brandSearch').value.toLowerCase();
    var rows=brandsOf().slice().sort(function(a,b){return a.name.localeCompare(b.name,'en',{sensitivity:'base'});}).filter(function(b){return !q || AutomationCore.brandMatches(b,q);});
    var active=brandsOf().filter(function(b){return b.active!==false;}).length;
    byId('brandCount').textContent=brandsOf().length+'개 브랜드 · 선택 가능 '+active+'개';
    byId('brandList').innerHTML=rows.map(function(b){var key=AutomationCore.brandKey(b.name);return '<button class="category-node'+(key===brandSelected?' is-active':'')+'" data-brand="'+esc(key)+'" style="--depth:0"><span>'+esc(b.name)+'</span><code>'+esc(b.code||'')+'</code><small>'+(b.active===false?'사용 중지':'')+'</small></button>';}).join('') || '<p class="empty-hint">'+(q?'검색 결과가 없습니다.':'등록된 브랜드가 없습니다.')+'</p>';
  }
  function brandPopulate(){
    var chosen=brandSelected?brandFind(brandSelected):null;
    byId('brandFormTitle').textContent=chosen?'브랜드 수정':'브랜드 추가';
    byId('brandName').value=chosen?chosen.name:'';
    byId('brandCode').value=chosen?(chosen.code||''):'';
    byId('brandAliases').value=chosen?(chosen.aliases||[]).join(', '):'';
    byId('brandActive').checked=!chosen || chosen.active!==false;
    byId('deleteBrand').hidden=!chosen;
    formDirty=false;
  }
  function applyBrand(){
    if(!byId('brandForm').reportValidity())return false;
    var candidate=AutomationCore.clone(config),rows=brandsOf(candidate);
    var aliases=byId('brandAliases').value.split(',').map(function(v){return v.trim();}).filter(Boolean);
    var value={code:byId('brandCode').value.trim(),name:byId('brandName').value.trim(),aliases:aliases,active:byId('brandActive').checked};
    var old=brandSelected?rows.find(function(b){return AutomationCore.brandKey(b.name)===brandSelected;}):null;
    if(old)Object.assign(old,value);else rows.push(value);
    try{AutomationCore.validateSettings(candidate);}catch(e){toast(e.message,'error');return false;}
    config=candidate;brandSelected=AutomationCore.brandKey(value.name);mark();brandTree();brandPopulate();return true;
  }
  byId('brandSearch').addEventListener('input',brandTree);
  byId('brandList').addEventListener('click',function(e){var b=e.target.closest('[data-brand]');if(!b || !leaveForm())return;brandSelected=b.dataset.brand;brandTree();brandPopulate();});
  byId('newBrand').addEventListener('click',function(){if(!leaveForm())return;brandSelected=null;brandPopulate();brandTree();byId('brandName').focus();});
  byId('brandForm').addEventListener('input',function(){formDirty=true;byId('saveSettings').disabled=false;byId('settingsState').textContent='저장 안 됨';});
  byId('brandForm').addEventListener('change',function(){formDirty=true;byId('saveSettings').disabled=false;byId('settingsState').textContent='저장 안 됨';});
  byId('brandForm').addEventListener('submit',function(e){e.preventDefault();if(applyBrand())toast('변경을 반영했습니다. 상단에서 설정을 저장하세요.');});
  byId('deleteBrand').addEventListener('click',function(){
    var chosen=brandSelected?brandFind(brandSelected):null;if(!chosen)return;
    if(!confirm('"'+chosen.name+'" 브랜드를 목록에서 삭제할까요?\n이미 저장된 상품의 브랜드 문자열은 그대로 남습니다.'))return;
    var candidate=AutomationCore.clone(config);candidate.brands=candidate.brands.filter(function(b){return AutomationCore.brandKey(b.name)!==brandSelected;});
    config=candidate;brandSelected=null;mark();brandTree();brandPopulate();toast('삭제를 반영했습니다. 상단에서 설정을 저장하세요.');
  });
  function currentTab(){var b=document.querySelector('.settings-tabs [data-settings-tab].is-active');return b?b.dataset.settingsTab:'brands';}
  function leaveForm(){return !formDirty || confirm('아직 변경 반영하지 않은 입력이 있습니다. 입력을 버리고 이동할까요?');}
  document.querySelectorAll('.settings-tabs [data-settings-tab]').forEach(function(b){b.addEventListener('click',function(){
    if(!config || saving || !leaveForm())return;
    var tab=b.dataset.settingsTab;document.querySelectorAll('[data-settings-tab]').forEach(function(n){n.classList.toggle('is-active',n===b);});
    byId('brandSettings').hidden=tab!=='brands';byId('categorySettings').hidden=tab==='folders' || tab==='brands';byId('folderSettings').hidden=tab!=='folders';
    if(tab==='folders'){folders();formDirty=false;}else if(tab==='brands'){brandSelected=null;brandTree();brandPopulate();}else{store=tab;selected='';tree();populate();}
  });});
  byId('categorySearch').addEventListener('input',tree);
  byId('categoryTree').addEventListener('click',function(e){var b=e.target.closest('[data-code]');if(!b || !leaveForm())return;selected=b.dataset.code;tree();populate();});
  byId('newCategory').addEventListener('click',function(){if(!leaveForm())return;selected='';populate();tree();});
  byId('categoryForm').addEventListener('input',function(){formDirty=true;byId("saveSettings").disabled=false;byId("settingsState").textContent="저장 안 됨";});
  byId('categoryForm').addEventListener('change',function(){formDirty=true;byId("saveSettings").disabled=false;byId("settingsState").textContent="저장 안 됨";});
  function applyCategory(){
    if(!byId('categoryForm').reportValidity())return false;
    var candidate=AutomationCore.clone(config),rows=candidate.categories[store],old=rows.find(function(c){return c.code===selected;});
    var value={code:byId('categoryCode').value.trim(),name:byId('categoryName').value.trim(),parentCode:byId('categoryParent').value,folder:byId('categoryFolder').value,active:byId('categoryActive').checked};
    if(old)Object.assign(old,value);else rows.push(value);
    try{AutomationCore.validateSettings(candidate);}catch(e){toast(e.message,'error');return false;}
    config=candidate;selected=value.code;mark();tree();populate();return true;
  }
  byId('categoryForm').addEventListener('submit',function(e){e.preventDefault();if(applyCategory())toast('변경을 반영했습니다. 상단에서 설정을 저장하세요.');});
  byId('folderForm').addEventListener('submit',function(e){e.preventDefault();var value=byId('newFolderName').value.trim(),candidate=AutomationCore.clone(config);candidate.folders.push(value);try{AutomationCore.validateSettings(candidate);}catch(err){toast(err.message,'error');return;}config=candidate;mark();byId('folderForm').reset();folders();});
  byId('folderList').addEventListener('click',function(e){var b=e.target.closest('[data-rename-folder]');if(!b)return;var old=b.dataset.renameFolder,value=prompt('새 폴더 이름',old);if(value===null || value===old)return;value=value.trim();var candidate=AutomationCore.clone(config);candidate.folders[candidate.folders.indexOf(old)]=value;
    ['retail','wholesale'].forEach(function(s){candidate.categories[s].forEach(function(c){if(c.folder===old)c.folder=value;});});
    try{AutomationCore.validateSettings(candidate);}catch(err){toast(err.message,'error');return;}config=candidate;mark();folders();
  });
  byId('saveSettings').addEventListener('click',async function(){
    if(!config || saving)return;
    if(formDirty){var tab=currentTab();if(tab==='brands'?!applyBrand():tab!=='folders' && !applyCategory())return;}
    saving=true;byId('saveSettings').disabled=true;byId('settingsState').textContent='저장 중…';document.querySelector('main').inert=true;
    try{revision=await Api.saveAutomationSettings(config,revision);dirty=false;byId('settingsError').hidden=true;byId('settingsState').textContent='저장됨';toast('설정을 저장했습니다.');}
    catch(err){byId('settingsState').textContent='저장 실패';byId('settingsError').hidden=false;byId('settingsError').textContent=err.message;toast('설정 저장에 실패했습니다. 입력 내용은 유지됩니다.','error');}
    finally{saving=false;byId('saveSettings').disabled=!dirty;document.querySelector('main').inert=false;}
  });
  document.querySelectorAll('[data-route]').forEach(function(a){a.href=a.dataset.route==='settings'&&a.dataset.settingsTab?'../settings/?tab='+encodeURIComponent(a.dataset.settingsTab):'../'+a.dataset.route+'/';a.addEventListener('click',function(e){if(saving || ((dirty || formDirty) && !confirm('저장하지 않은 설정이 있습니다. 저장하지 않고 이동할까요?'))){e.preventDefault();return;}dirty=false;formDirty=false;});});
  window.addEventListener('beforeunload',function(e){if(dirty || formDirty){e.preventDefault();e.returnValue='';}});
  (async function(){try{var row=await Api.fetchAutomationSettings();config=AutomationCore.normalizeSettings(row.value);revision=row.updated_at;brandTree();brandPopulate();tree();populate();var initialTab=new URLSearchParams(location.search).get('tab');if(initialTab==='categories')initialTab='retail';var initial=document.querySelector('.settings-tabs [data-settings-tab="'+(initialTab||'brands')+'"]');if(initial)initial.click();byId('settingsState').textContent='저장된 설정';document.querySelector('main').inert=false;}catch(e){byId('settingsState').textContent='불러오기 실패';byId('settingsError').hidden=false;byId('settingsError').textContent='설정을 불러오지 못했습니다. '+e.message;document.querySelectorAll('main input, main button, main select').forEach(function(el){el.disabled=true;});}})();
})();
