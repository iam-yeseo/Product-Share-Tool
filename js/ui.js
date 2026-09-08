/* ===== 화면 그리기 ===== */

var UI = (function () {

  /* ---------- 열 너비 (마우스로 조절, 브라우저에 기억) ---------- */
  var DEFAULT_COL_W = {
    check: 58, seq: 84, brand: 190, name_own: 240, name_naver: 240, model: 140,
    content: 110,
    need_retail: 92, need_wholesale: 92, need_naver: 92,
    price_retail: 120, price_wholesale: 120, price_wholesale_master: 120, price_naver: 120,
    image: 100, ref_link: 110, note: 180, act: 62, automation: 240
  };
  var COL_W_KEY = "productTool.colWidths";
  var colW = (function () {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(COL_W_KEY) || "{}"); } catch (e) { saved = {}; }
    var out = {};
    Object.keys(DEFAULT_COL_W).forEach(function (k) {
      out[k] = typeof saved[k] === "number" ? saved[k] : DEFAULT_COL_W[k];
    });
    return out;
  })();

  function colKeyAt(index) {
    var col = document.querySelectorAll("#gridCols col")[index];
    return col ? col.dataset.key : null;
  }
  function colWidthOf(key) {
    return colW[key] || DEFAULT_COL_W[key] || 100;
  }
  function applyColWidths() {
    var cols = document.querySelectorAll("#gridCols col");
    var hidden = State.hiddenCols || [];
    var entries = [];
    cols.forEach(function (col) {
      var k = col.dataset.key;
      var w = colWidthOf(k);
      if(typeof Workspace !== "undefined") w=Workspace.width(k,w);
      if (k === "act" && State.view !== "editor") w = 0;   // 등록자 뷰에서는 관리 열이 없습니다
      // 보기 뷰에서는 숨긴 열을 접습니다. (편집 뷰에서는 항상 보이며 편집 가능)
      if (State.view === "registrar" && hidden.indexOf(k) > -1) w = 0;
      if (typeof Workspace !== "undefined" && Workspace.compactHidden(k)) w = 0;
      entries.push({ col: col, key: k, width: w });
    });
    var wrap = document.querySelector(".table-wrap");
    if (typeof Workspace !== "undefined") {
      entries = Workspace.fitWidths(entries, wrap ? Math.max(0, wrap.clientWidth - 2) : 0);
    }
    var total = 0;
    entries.forEach(function (entry) {
      entry.col.style.width = entry.width + "px";
      total += entry.width;
    });
    var grid = document.getElementById("grid");
    if (grid) grid.style.width = total + "px";
    if (typeof Workspace !== "undefined") Workspace.columns();
    document.documentElement.style.setProperty("--seq-left", colWidthOf("check") + "px");
  }
  function setColWidth(key, w) {
    colW[key] = Math.max(56, Math.round(w));
    applyColWidths();
  }
  function saveColWidths() {
    try { localStorage.setItem(COL_W_KEY, JSON.stringify(colW)); } catch (e) { /* 무시 */ }
  }
  function resetColWidths() {
    Object.keys(DEFAULT_COL_W).forEach(function (k) { colW[k] = DEFAULT_COL_W[k]; });
    applyColWidths();
    saveColWidths();
  }

  /* ---------- 사이드바 ---------- */
  function renderSidebar() {
    var nav = document.getElementById("listNav");
    var q = State.search.trim().toLowerCase();

    var rows = State.lists.filter(function (l) {
      if (!q) return true;
      return (
        (l.title || "").toLowerCase().indexOf(q) > -1 ||
        (l.author || "").toLowerCase().indexOf(q) > -1
      );
    });

    if (!rows.length) {
      nav.innerHTML = '<p class="empty-hint">' +
        (q ? "검색 결과가 없습니다." : "등록된 리스트가 없습니다.") + "</p>";
      return;
    }

    nav.innerHTML = rows.map(function (l) {
      var active = l.id === State.currentListId ? " is-active" : "";
      var complete = l.total > 0 && l.doneCount === l.total ? " is-complete" : "";
      return (
        '<button class="list-item' + active + complete + '" data-id="' + esc(l.id) + '">' +
          '<span class="li-title">' + esc(l.title || "제목 없는 리스트") + "</span>" +
          '<span class="li-sub">' +
            '<span class="li-date">' + esc(fmtDate(l.created_at)) + "</span>" +
            (l.author ? '<span class="li-author">' + esc(l.author) + "</span>" : "") +
          "</span>" +
          '<span class="li-badge">' + l.doneCount + " / " + l.total + "</span>" +
        "</button>"
      );
    }).join("");
  }

  /* ---------- 리스트 헤더 ---------- */
  function renderHead() {
    var l = State.list;
    if (!l) return;
    document.getElementById("listTitle").value = l.title || "";
    document.getElementById("listTitleRO").textContent = l.title || "제목 없는 리스트";
    document.getElementById("listDate").value = l.work_date || "";
    document.getElementById("listDateRO").textContent = l.work_date || "—";
    document.getElementById("listAuthor").value = l.author || "";
    document.getElementById("listAuthorRO").textContent = l.author || "—";

    var done = State.items.filter(function (i) { return i.done; }).length;
    document.getElementById("listProgress").textContent = done + " / " + State.items.length;

    var created = document.getElementById("listCreated");
    var updated = document.getElementById("listUpdated");
    if (created) created.textContent = l.created_at ? fmtDateTime(l.created_at) : "—";
    if (updated) updated.textContent = l.updated_at ? fmtDateTime(l.updated_at) : "—";
  }

  /* ---------- 셀 헬퍼 ---------- */
  function textInput(field, val, ph) {
    return '<input class="cell-input" data-field="' + field + '" value="' + esc(val) + '"' +
      (ph ? ' placeholder="' + esc(ph) + '"' : "") + ">";
  }

  function selectInput(field, val, options) {
    var opts = '<option value=""></option>' + options.map(function (o) {
      return '<option value="' + esc(o) + '"' + (val === o ? " selected" : "") + ">" + esc(o) + "</option>";
    }).join("");
    return '<select class="cell-select" data-field="' + field + '">' + opts + "</select>";
  }

  /* 브랜드 셀 — 등록된 브랜드 목록에서 고르거나 '직접 입력'으로 바꿔 자유롭게 씁니다.
     저장되는 값은 언제나 브랜드 문자열 하나입니다. */
  var BRAND_CUSTOM = "__custom__";
  function brandCell(it) {
    var brands = AutomationEditor.brands();
    var matched = AutomationCore.matchBrand(brands, it.brand);
    if (isBrandCustom(it, brands)) {
      return '<div class="brand-cell is-custom">' +
        '<input class="cell-input brand-custom" data-field="brand" value="' + esc(it.brand) + '" placeholder="브랜드 직접 입력" maxlength="30">' +
        '<button class="mini-btn" data-act="brand-list" title="등록된 브랜드 목록에서 선택">목록</button>' +
        "</div>";
    }
    var value = matched ? matched.name : "";
    var opts = '<option value="">브랜드 선택</option>';
    brands.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "en", { sensitivity: "base" }); }).forEach(function (b) {
      if (b.active === false && b !== matched) return;   // 사용 중지 브랜드는 이미 선택된 경우에만 보입니다
      opts += '<option value="' + esc(b.name) + '"' + (b === matched ? " selected" : "") + ">" +
        esc(b.name) + (b.active === false ? " · 사용 중지" : "") + "</option>";
    });
    opts += '<option value="' + BRAND_CUSTOM + '">직접 입력…</option>';
    return '<div class="brand-cell"><select class="cell-select brand-select' + (value ? "" : " is-empty") +
      '" data-field="brand" title="' + esc(value || "브랜드를 선택하거나 직접 입력하세요") + '">' + opts + "</select></div>";
  }
  /* 보기 뷰 — 목록에 없는 브랜드는 표시해 둡니다 (자동화 프로그램의 브랜드 매칭 참고용) */
  function brandRO(it) {
    var s = (it.brand || "").trim();
    if (!s) return ro(s, true);
    var matched = AutomationCore.matchBrand(AutomationEditor.brands(), s);
    return '<span class="ro-cell"><span class="ro-text">' + esc(s) + "</span>" +
      (matched ? "" : '<span class="brand-tag" title="등록된 브랜드 목록에 없는 이름입니다 (직접 입력)">직접 입력</span>') +
      '<button class="copy-btn" data-copy="' + esc(s) + '" title="복사">복사</button></span>';
  }

  function priceInput(field, val, disabled) {
    return '<span class="price-wrap' + (disabled ? " is-linked" : "") + '">' +
      '<span class="won">₩</span>' +
      '<input class="cell-input cell-price" data-field="' + field + '" inputmode="numeric" ' +
      (disabled ? "disabled " : "") +
      'value="' + esc(withComma(val)) + '">' +
      "</span>";
  }

  /* 읽기 전용 + 복사 버튼 */
  function ro(val, copyable) {
    var s = (val === null || val === undefined) ? "" : String(val);
    if (!s.trim()) return '<span class="ro-empty">—</span>';
    var body = '<span class="ro-text">' + esc(s) + "</span>";
    if (copyable) {
      body += '<button class="copy-btn" data-copy="' + esc(s) + '" title="복사">복사</button>';
    }
    return '<span class="ro-cell">' + body + "</span>";
  }

  function roTag(val, kind) {
    if (!val) return '<span class="ro-empty">—</span>';
    return '<span class="tag tag-' + kind + '">' + esc(val) + "</span>";
  }

  /* ---------- 몰별 등록 상태 뱃지 (자동화 프로그램이 기록) ---------- */
  var REG_LABEL = { pending: "대기", running: "진행중", success: "완료", failed: "실패" };
  function regBadges(it) {
    var regs = (State.registrations && State.registrations[it.id]) || {};
    var html = [["retail", "소매"], ["wholesale", "도매"]].map(function (ch) {
      var need = it[ch[0] === "retail" ? "need_retail" : "need_wholesale"] === "필요";
      var r = regs[ch[0]];
      if (!need && !r) return "";
      var st = r ? r.status : "pending";
      var tip = [];
      if (r && r.goods_no) tip.push("상품번호 " + r.goods_no);
      if (r && r.error_message) tip.push("사유: " + r.error_message);
      if (r && Array.isArray(r.warnings) && r.warnings.length) tip.push("경고: " + r.warnings.join(" / "));
      if (r && r.attempted_at) tip.push(typeof fmtDateTime === "function" ? fmtDateTime(r.attempted_at) : r.attempted_at);
      return '<span class="reg-badge reg-' + st + '" title="' + esc(tip.join("\n")) + '">' +
        ch[1] + " " + (REG_LABEL[st] || st) + (r && r.goods_no ? " #" + esc(r.goods_no) : "") + "</span>";
    }).join("");
    return html ? '<div class="reg-status">' + html + "</div>" : "";
  }

  /* ---------- 행 ---------- */
  function renderRow(it, idx) {
    var editor = State.view === "editor";
    var selected = editor && !!State.selected[it.id];
    var cls = "row" + (it.done ? " is-done" : "") + (selected ? " is-selected" : "");
    var c = [];

    // 체크
    //  - 등록자 : 등록 완료 체크 (즉시 저장, 행이 회색으로)
    //  - 편집자 : 행 선택용. 등록 완료 상태는 바뀌지 않고, 행 복사/삭제 대상만 고릅니다.
    if (editor) {
      c.push('<td class="c-check">' +
        '<input type="checkbox" class="chk-sel"' + (selected ? " checked" : "") +
        ' title="행 선택 (일괄 설정·복사·삭제용, 등록 상태는 바뀌지 않습니다)">' +
        (it.done ? '<span class="done-mark" title="등록 완료된 행입니다">✓</span>' : "") +
        "</td>");
    } else {
      c.push('<td class="c-check">' +
        '<input type="checkbox" class="chk-done"' + (it.done ? " checked" : "") +
        ' title="등록 완료 체크"></td>');
    }

    // 순번
    if (editor) {
      c.push('<td class="c-seq">' +
        '<div class="seq-cell">' +
          '<input class="seq-input" data-field="seq" type="number" min="1" value="' + (idx + 1) + '">' +
          '<span class="seq-arrows">' +
            '<button class="mini-btn" data-act="up" title="위로">▲</button>' +
            '<button class="mini-btn" data-act="down" title="아래로">▼</button>' +
          "</span>" +
        "</div></td>");
    } else {
      c.push('<td class="c-seq"><span class="seq-ro">' + (idx + 1) + "</span></td>");
    }

    // 브랜드 / 상품명(자사몰) / 상품명(네이버) / 모델명
    c.push('<td class="c-brand k-brand">' + (editor ? brandCell(it) : brandRO(it)) + "</td>");
    c.push('<td class="c-name k-name_own">' + (editor ? textInput("name_own", it.name_own) : ro(it.name_own, true)) + "</td>");
    c.push('<td class="c-name k-name_naver">' + (editor ? textInput("name_naver", it.name_naver) : ro(it.name_naver, true)) + "</td>");
    c.push('<td class="c-model k-model">' + (editor ? textInput("model", it.model) : ro(it.model, true)) + "</td>");

    // 내용
    c.push('<td class="c-content k-content">' +
      (editor ? selectInput("content", it.content, CONTENT_OPTIONS) : roTag(it.content, "content")) + "</td>");

    // 등록 필요 3종 — 편집: 체크박스(체크=필요), 보기: 태그
    ["need_retail", "need_wholesale", "need_naver"].forEach(function (f) {
      var v = it[f];
      if (editor) {
        c.push('<td class="c-need c-need-chk k-' + f + '">' +
          '<input type="checkbox" class="chk-need" data-field="' + f + '"' +
          (v === "필요" ? " checked" : "") + ' title="체크하면 등록 필요"></td>');
      } else {
        c.push('<td class="c-need k-' + f + '">' +
          roTag(v, v === "필요" ? "need" : v === "불필요" ? "noneed" : "content") + "</td>");
      }
    });

    // 소매몰↔네이버 가격 연동 여부 (편집자 세션 한정, 기본 연동)
    if (it.link_np === undefined) it.link_np = (it.price_naver === it.price_retail);
    var linked = editor && it.link_np !== false;

    // 등록 필요가 체크되지 않은(불필요) 가격은 입력할 수 없습니다.
    function needOn(f) {
      if (f === "price_retail") return it.need_retail === "필요";
      if (f === "price_wholesale" || f === "price_wholesale_master") return it.need_wholesale === "필요";
      if (f === "price_naver") return it.need_naver === "필요";
      return true;
    }

    // 가격 4종 (도매몰은 베이직·마스터 등급으로 분리)
    ["price_retail", "price_wholesale", "price_wholesale_master", "price_naver"].forEach(function (f) {
      if (editor) {
        var needBlocked = !needOn(f);
        if (f === "price_naver") {
          c.push('<td class="c-price k-' + f + '">' +
            '<label class="price-link" title="소매몰 가격과 같게 유지합니다">' +
              '<input type="checkbox" class="chk-price-link"' + (linked ? " checked" : "") +
                (needBlocked ? " disabled" : "") + ">" +
              "<span>소매몰과 동일</span>" +
            "</label>" +
            priceInput(f, it[f], needBlocked || linked) + "</td>");
        } else {
          c.push('<td class="c-price k-' + f + '">' + priceInput(f, it[f], needBlocked) + "</td>");
        }
      } else {
        c.push('<td class="c-price k-' + f + '">' +
          (it[f] === null || it[f] === undefined
            ? '<span class="ro-empty">—</span>'
            : '<span class="ro-cell"><span class="ro-text price-ro">' + esc(fmtWon(it[f])) + "</span>" +
              '<button class="copy-btn" data-copy="' + esc(String(it[f])) +
              '" title="숫자만 복사">복사</button></span>') + "</td>");
      }
    });

    c.push('<td class="c-image k-image">' + AutomationEditor.thumbnailCell(it) + '</td>');

    // 참고 링크
    if (editor) {
      c.push('<td class="c-link k-ref_link">' + textInput("ref_link", it.ref_link, "https://") + "</td>");
    } else {
      var url = normalizeUrl(it.ref_link);
      c.push('<td class="c-link k-ref_link">' + (url
        ? '<button class="btn-go" data-url="' + esc(url) + '">바로가기</button>'
        : ro(it.ref_link, true)) + "</td>");   // 웹 주소가 아니면(사내 경로 등) 텍스트 + 복사
    }

    // 비고
    c.push('<td class="c-note k-note">' + (editor ? textInput("note", it.note) : ro(it.note, true)) + "</td>");

    // 관리 (편집자 전용)
    c.push('<td class="c-act only-editor-cell">' +
      (editor ? '<button class="mini-btn danger" data-act="del" title="행 삭제">삭제</button>' : "") + "</td>");

    c.push('<td class="k-automation">' + AutomationEditor.summary(it) + regBadges(it) + '</td>');
    return '<tr class="' + cls + '" data-id="' + esc(it.id) + '">' + c.join("") + "</tr>";
  }

  /* 선택 개수에 따라 툴바(일괄 설정·행 복사·행 삭제) 상태를 갱신 */
  function renderToolbar() {
    var n = selectedCount();
    var label = document.getElementById("selCount");
    var bulkBtn = document.getElementById("btnBulkEdit");
    var copyBtn = document.getElementById("btnCopyRows");
    var delBtn = document.getElementById("btnDeleteRows");
    var all = document.getElementById("chkAll");
    if (label) label.hidden = n === 0;
    if (label) label.textContent = n ? "선택 " + n + "건" : "행을 체크하면 일괄 설정·복사·삭제할 수 있습니다";
    if (bulkBtn) { bulkBtn.disabled = n === 0; bulkBtn.hidden = n === 0; }
    if (copyBtn) { copyBtn.disabled = n === 0; copyBtn.hidden = n === 0; }
    if (delBtn) { delBtn.disabled = n === 0; delBtn.hidden = n === 0; }
    if (all) {
      all.checked = n > 0 && n === (typeof Workspace !== "undefined" ? Workspace.visibleItems() : State.items).length;
      all.indeterminate = n > 0 && n < (typeof Workspace !== "undefined" ? Workspace.visibleItems() : State.items).length;
    }
  }

  /* 머리글의 일괄 체크박스 상태(전체/부분/없음)를 행 상태에 맞춰 갱신 */
  function renderHeaderChecks() {
    var items = typeof Workspace !== "undefined" ? Workspace.visibleItems() : State.items;
    var total = items.length;
    function set(sel, isOn) {
      var el = document.querySelector(sel);
      if (!el) return;
      var n = items.filter(isOn).length;
      el.checked = total > 0 && n === total;
      el.indeterminate = n > 0 && n < total;
    }
    set('.chk-need-all[data-field="need_retail"]', function (it) { return it.need_retail === "필요"; });
    set('.chk-need-all[data-field="need_wholesale"]', function (it) { return it.need_wholesale === "필요"; });
    set('.chk-need-all[data-field="need_naver"]', function (it) { return it.need_naver === "필요"; });
    set(".chk-link-all", function (it) { return it.link_np !== false; });
  }

  function renderGrid() {
    var body = document.getElementById("gridBody");
    if (!State.items.length) {
      var colspan = 19;
      body.innerHTML = '<tr class="row-empty"><td colspan="' + colspan + '">' +
        (State.view === "editor"
          ? "상단 <b>+ 상품 추가</b> 버튼으로 상품을 추가하세요."
          : "등록된 상품이 없습니다.") + "</td></tr>";
      renderToolbar();
      renderHeaderChecks();
      AutomationEditor.publish();
      return;
    }
    body.innerHTML = State.items.map(renderRow).join("");
    if(typeof Workspace !== "undefined") Workspace.filterRows();
    renderToolbar();
    renderHeaderChecks();
    AutomationEditor.publish();
  }

  /* ---------- 열 자동 맞춤 (손잡이 더블클릭) ---------- */
  function cellTextForKey(it, key) {
    switch (key) {
      case "seq": return String(it.seq || "");
      case "brand": return it.brand || "";
      case "name_own": return it.name_own || "";
      case "name_naver": return it.name_naver || "";
      case "model": return it.model || "";
      case "content": return it.content || "";
      case "ref_link": return it.ref_link || "";
      case "note": return it.note || "";
      case "price_retail":
      case "price_wholesale":
      case "price_wholesale_master":
      case "price_naver":
        return (it[key] === null || it[key] === undefined) ? "" : "₩ " + withComma(it[key]);
      default: return "";
    }
  }
  var EXTRA_PAD = { seq: 52, brand: 70, content: 46, price_retail: 34, price_wholesale: 34, price_wholesale_master: 34, price_naver: 34 };

  function autoFitColumn(key) {
    var cols = document.querySelectorAll("#gridCols col");
    var index = -1;
    cols.forEach(function (col, i) { if (col.dataset.key === key) index = i; });
    if (index < 0) return;

    var ctx = autoFitColumn._ctx ||
      (autoFitColumn._ctx = document.createElement("canvas").getContext("2d"));
    function fontOf(el, fallback) {
      if (!el) return fallback;
      var cs = getComputedStyle(el);
      return (cs.fontWeight || "400") + " " + cs.fontSize + " " + cs.fontFamily;
    }
    var bodyFont = fontOf(document.querySelector("#grid tbody td"), "13px sans-serif");
    var th = document.querySelector('#grid thead th[data-col="' + index + '"]');
    var headFont = fontOf(th, "700 11.5px sans-serif");

    var max = 0;
    if (th) { ctx.font = headFont; max = ctx.measureText((th.textContent || "").trim()).width; }
    ctx.font = bodyFont;
    State.items.forEach(function (it) {
      var t = cellTextForKey(it, key);
      if (t) max = Math.max(max, ctx.measureText(t).width);
    });

    var pad = EXTRA_PAD[key] || 30;
    var w = Math.min(600, Math.round(max) + pad);
    setColWidth(key, w);
    saveColWidths();
  }

  /* ---------- 열 숨김 (보기 뷰에서 숨긴 열의 셀을 완전히 접습니다) ---------- */
  function updateHideStyle() {
    var el = document.getElementById("colHideStyle");
    if (!el) {
      el = document.createElement("style");
      el.id = "colHideStyle";
      document.head.appendChild(el);
    }
    var css = (State.hiddenCols || []).map(function (k) {
      var sel = "body.view-registrar .k-" + k;
      return sel + "{padding-left:0;padding-right:0;border-right-width:0;max-width:0;overflow:hidden}" +
             sel + " *{display:none}";
    }).join("");
    el.textContent = css;
  }

  /* 편집 뷰의 '열 표시' 설정 패널 — 체크 해제한 열은 보기 뷰에서 숨겨집니다. */
  function renderColPanel() {
    var panel = document.getElementById("colSettingsPanel");
    if (!panel) return;
    var hidden = State.hiddenCols || [];
    panel.innerHTML =
      '<div class="col-panel-head">보기 뷰에 표시할 열</div>' +
      '<div class="col-panel-list">' +
      HIDEABLE_COLS.map(function (c) {
        var checked = hidden.indexOf(c.key) === -1 ? " checked" : "";
        return '<label class="col-panel-item"><input type="checkbox" class="col-vis" data-key="' +
          esc(c.key) + '"' + checked + "><span>" + esc(c.label) + "</span></label>";
      }).join("") +
      "</div>" +
      '<div class="col-panel-foot">체크 해제한 열은 <b>보기</b> 뷰에서 숨겨집니다. (전체 사용자 공유)</div>';
  }

  function renderAll() {
    renderSidebar();
    var has = !!State.currentListId;
    document.getElementById("emptyState").hidden = has;
    document.getElementById("listPane").hidden = !has;
    if (has) {
      renderHead();
      renderGrid();
      applyColWidths();
    }
  }

  function setSync(text, kind) {
    var el = document.getElementById("syncState");
    el.textContent = text;
    el.className = "sync-state" + (kind ? " sync-" + kind : "");
  }

  return {
    renderAll: renderAll,
    renderSidebar: renderSidebar,
    renderGrid: renderGrid,
    renderHead: renderHead,
    renderToolbar: renderToolbar,
    renderHeaderChecks: renderHeaderChecks,
    autoFitColumn: autoFitColumn,
    BRAND_CUSTOM: BRAND_CUSTOM,
    updateHideStyle: updateHideStyle,
    renderColPanel: renderColPanel,
    setSync: setSync,
    applyColWidths: applyColWidths,
    setColWidth: setColWidth,
    saveColWidths: saveColWidths,
    resetColWidths: resetColWidths,
    colKeyAt: colKeyAt,
    colWidthOf: colWidthOf
  };
})();
