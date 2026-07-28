/* ===== 화면 그리기 ===== */

var UI = (function () {

  /* ---------- 열 너비 (마우스로 조절, 브라우저에 기억) ---------- */
  var DEFAULT_COL_W = {
    check: 58, seq: 84, brand: 130, name_own: 240, name_naver: 240, model: 140,
    content: 110, image_usage: 140,
    need_retail: 92, need_wholesale: 92, need_naver: 92,
    price_retail: 120, price_wholesale: 120, price_wholesale_master: 120, price_naver: 120,
    image: 84, ref_link: 110, note: 180, act: 62
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
    var total = 0;
    cols.forEach(function (col) {
      var k = col.dataset.key;
      var w = colWidthOf(k);
      if (k === "act" && State.view !== "editor") w = 0;   // 등록자 뷰에서는 관리 열이 없습니다
      col.style.width = w + "px";
      total += w;
    });
    var grid = document.getElementById("grid");
    if (grid) grid.style.width = total + "px";
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
        ' title="행 선택 (복사·삭제용, 등록 상태는 바뀌지 않습니다)">' +
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
    c.push('<td class="c-brand">' + (editor ? textInput("brand", it.brand) : ro(it.brand, true)) + "</td>");
    c.push('<td class="c-name">' + (editor ? textInput("name_own", it.name_own) : ro(it.name_own, true)) + "</td>");
    c.push('<td class="c-name">' + (editor ? textInput("name_naver", it.name_naver) : ro(it.name_naver, true)) + "</td>");
    c.push('<td class="c-model">' + (editor ? textInput("model", it.model) : ro(it.model, true)) + "</td>");

    // 내용
    c.push('<td class="c-content">' +
      (editor ? selectInput("content", it.content, CONTENT_OPTIONS) : roTag(it.content, "content")) + "</td>");

    // 이미지 사용 여부
    c.push('<td class="c-imguse">' +
      (editor ? textInput("image_usage", it.image_usage) : ro(it.image_usage, true)) + "</td>");

    // 등록 필요 3종 — 편집: 체크박스(체크=필요), 보기: 태그
    ["need_retail", "need_wholesale", "need_naver"].forEach(function (f) {
      var v = it[f];
      if (editor) {
        c.push('<td class="c-need c-need-chk">' +
          '<input type="checkbox" class="chk-need" data-field="' + f + '"' +
          (v === "필요" ? " checked" : "") + ' title="체크하면 등록 필요"></td>');
      } else {
        c.push('<td class="c-need">' +
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
          c.push('<td class="c-price">' +
            '<label class="price-link" title="소매몰 가격과 같게 유지합니다">' +
              '<input type="checkbox" class="chk-price-link"' + (linked ? " checked" : "") +
                (needBlocked ? " disabled" : "") + ">" +
              "<span>소매몰과 동일</span>" +
            "</label>" +
            priceInput(f, it[f], needBlocked || linked) + "</td>");
        } else {
          c.push('<td class="c-price">' + priceInput(f, it[f], needBlocked) + "</td>");
        }
      } else {
        c.push('<td class="c-price">' +
          (it[f] === null || it[f] === undefined
            ? '<span class="ro-empty">—</span>'
            : '<span class="ro-cell"><span class="ro-text price-ro">' + esc(fmtWon(it[f])) + "</span>" +
              '<button class="copy-btn" data-copy="' + esc(String(it[f])) +
              '" title="숫자만 복사">복사</button></span>') + "</td>");
      }
    });

    // 이미지 — 현재 비활성
    c.push('<td class="c-image"><button class="btn-locked" disabled title="이미지 업로드는 추후 지원 예정입니다">준비 중</button></td>');

    // 참고 링크
    if (editor) {
      c.push('<td class="c-link">' + textInput("ref_link", it.ref_link, "https://") + "</td>");
    } else {
      var url = normalizeUrl(it.ref_link);
      c.push('<td class="c-link">' + (url
        ? '<button class="btn-go" data-url="' + esc(url) + '">바로가기</button>'
        : ro(it.ref_link, true)) + "</td>");   // 웹 주소가 아니면(사내 경로 등) 텍스트 + 복사
    }

    // 비고
    c.push('<td class="c-note">' + (editor ? textInput("note", it.note) : ro(it.note, true)) + "</td>");

    // 관리 (편집자 전용)
    c.push('<td class="c-act only-editor-cell">' +
      (editor ? '<button class="mini-btn danger" data-act="del" title="행 삭제">삭제</button>' : "") + "</td>");

    return '<tr class="' + cls + '" data-id="' + esc(it.id) + '">' + c.join("") + "</tr>";
  }

  /* 선택 개수에 따라 툴바(행 복사·행 삭제) 상태를 갱신 */
  function renderToolbar() {
    var n = selectedCount();
    var label = document.getElementById("selCount");
    var copyBtn = document.getElementById("btnCopyRows");
    var delBtn = document.getElementById("btnDeleteRows");
    var all = document.getElementById("chkAll");
    if (label) label.textContent = n ? "선택 " + n + "건" : "행을 체크하면 복사·삭제할 수 있습니다";
    if (copyBtn) copyBtn.disabled = n === 0;
    if (delBtn) delBtn.disabled = n === 0;
    if (all) {
      all.checked = n > 0 && n === State.items.length;
      all.indeterminate = n > 0 && n < State.items.length;
    }
  }

  /* 머리글의 일괄 체크박스 상태(전체/부분/없음)를 행 상태에 맞춰 갱신 */
  function renderHeaderChecks() {
    var total = State.items.length;
    function set(sel, isOn) {
      var el = document.querySelector(sel);
      if (!el) return;
      var n = State.items.filter(isOn).length;
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
          ? "아래 <b>+ 행 추가</b> 버튼으로 상품을 추가하세요."
          : "등록된 상품이 없습니다.") + "</td></tr>";
      renderToolbar();
      renderHeaderChecks();
      return;
    }
    body.innerHTML = State.items.map(renderRow).join("");
    renderToolbar();
    renderHeaderChecks();
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
      case "image_usage": return it.image_usage || "";
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
  var EXTRA_PAD = { seq: 52, content: 46, price_retail: 34, price_wholesale: 34, price_wholesale_master: 34, price_naver: 34 };

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
    setSync: setSync,
    applyColWidths: applyColWidths,
    setColWidth: setColWidth,
    saveColWidths: saveColWidths,
    resetColWidths: resetColWidths,
    colKeyAt: colKeyAt,
    colWidthOf: colWidthOf
  };
})();
