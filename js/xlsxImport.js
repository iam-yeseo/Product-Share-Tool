/* ===== 엑셀(xlsx) 불러오기 =====
   사내에서 쓰는 "신제품 작업 리스트" 양식을 읽어 표 행으로 바꿉니다.

   지원하는 양식
   1) 기본형 : 머리글 한 줄
      No. | 브랜드 | 품명 | 모델명 | 내용 | 이미지 | 링크 | 비고
   2) 확장형 : 머리글 두 줄 (그룹 + 하위)
      품명 → 자사몰 / 스마트스토어,  등록 여부 → 스마트스토어 / 자사몰,  가격 …

   머리글 위치·시트·열 순서가 달라도 이름을 보고 찾아냅니다. */

var XlsxImport = (function () {

  /* 머리글 줄을 찾을 때 쓰는 단어 */
  var HEADER_HINTS = ["브랜드", "모델", "품명", "상품명", "제품명", "내용", "링크", "비고", "이미지", "가격", "등록"];
  /* 두 번째 머리글 줄(하위 항목)을 판별할 때 쓰는 단어 */
  var SUB_HINTS = ["자사몰", "네이버", "스마트", "스토어", "소매", "도매", "전용", "베이직", "마스터"];

  function norm(v) {
    return String(v == null ? "" : v).replace(/\s+/g, "").replace(/[.\-_()[\]/]/g, "").toLowerCase();
  }
  function txt(v) {
    if (v == null) return "";
    if (v instanceof Date) return dateToISO(v);
    return String(v).trim();
  }
  function dateToISO(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function has(n, words) {
    return words.some(function (w) { return n.indexOf(norm(w)) > -1; });
  }

  /* ---------- 시트 → 2차원 배열 (병합 셀 펼침) ----------
     표가 A1이 아닌 곳에서 시작해도 배열 좌표가 시트 좌표와 같도록 항상 A1부터 읽습니다.
     (그래야 !merges 의 좌표와 어긋나지 않습니다) */
  function sheetToRows(ws) {
    var range = XLSX.utils.decode_range(ws["!ref"]);
    range.s.r = 0;
    range.s.c = 0;
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, range: range });
    (ws["!merges"] || []).forEach(function (m) {
      var v = (aoa[m.s.r] || [])[m.s.c];
      if (v == null) return;
      for (var r = m.s.r; r <= m.e.r; r++) {
        if (!aoa[r]) aoa[r] = [];
        for (var c = m.s.c; c <= m.e.c; c++) {
          if (aoa[r][c] == null) aoa[r][c] = v;
        }
      }
    });
    return aoa;
  }

  /* 셀에 걸린 하이퍼링크 (행:열 -> 주소) */
  function linkMap(ws) {
    var map = {};
    Object.keys(ws).forEach(function (a) {
      if (a.charAt(0) === "!") return;
      var cell = ws[a];
      if (cell && cell.l && cell.l.Target) {
        var rc = XLSX.utils.decode_cell(a);
        map[rc.r + ":" + rc.c] = cell.l.Target;
      }
    });
    return map;
  }

  /* ---------- 머리글 찾기 ---------- */
  function findHeaderRow(aoa) {
    for (var r = 0; r < Math.min(aoa.length, 30); r++) {
      var row = aoa[r] || [];
      var hits = 0;
      for (var c = 0; c < row.length; c++) {
        var n = norm(row[c]);
        if (n && has(n, HEADER_HINTS)) hits++;
      }
      if (hits >= 3) return r;
    }
    return -1;
  }

  /* 머리글 바로 다음 줄이 '하위 머리글'인지 (품명 → 자사몰/스마트스토어 같은 구조) */
  function isSubHeaderRow(aoa, r) {
    var row = aoa[r] || [];
    var vals = row.filter(function (c) { return txt(c) !== ""; });
    if (!vals.length) return false;
    // 숫자만 있는 칸이 있으면 데이터 줄로 봅니다 (No. 열)
    var hasNumber = vals.some(function (v) { return typeof v === "number"; });
    if (hasNumber) return false;
    return vals.some(function (v) { return has(norm(v), SUB_HINTS); });
  }

  /* ---------- 열 → 항목 연결 ---------- */
  var FIELD_LABEL = {
    brand: "브랜드",
    name_own: "상품명(자사몰)",
    name_naver: "상품명(네이버)",
    model: "모델명",
    content: "내용",
    image_usage: "이미지 사용 여부",
    need_retail: "등록 필요(소매몰)",
    need_wholesale: "등록 필요(도매몰)",
    need_naver: "등록 필요(네이버)",
    price_retail: "가격(소매몰)",
    price_wholesale: "가격(도매몰 베이직)",
    price_wholesale_master: "가격(도매몰 마스터)",
    price_naver: "가격(네이버)",
    ref_link: "참고 링크",
    note: "비고",
    seq: "순번"
  };

  /* 한 열이 어느 항목에 해당하는지 판단합니다. 여러 항목에 동시에 넣을 수도 있습니다. */
  function mapColumn(parent, sub) {
    var p = norm(parent), s = norm(sub);
    var both = p + s;
    if (!p && !s) return [];

    if (has(p, ["브랜드", "제조사", "메이커"])) return ["brand"];

    if (has(p, ["품명", "상품명", "제품명"])) {
      if (has(s, ["네이버", "스마트", "스토어"])) return ["name_naver"];
      return ["name_own"];
    }
    if (has(p, ["모델", "품목코드", "모델명"])) return ["model"];

    // '이미지 사용 여부'가 '이미지'보다 먼저 걸러져야 합니다.
    if (has(both, ["이미지사용", "이미지여부"])) return ["image_usage"];

    if (has(p, ["내용", "구분"])) return ["content"];

    if (has(p, ["등록"])) {
      if (has(s, ["소매"])) return ["need_retail"];
      if (has(s, ["도매"])) return ["need_wholesale"];
      if (has(s, ["네이버", "스마트", "스토어"])) return ["need_naver"];
      if (has(s, ["자사"])) return ["need_retail"];
      return ["need_retail", "need_wholesale", "need_naver"];   // 하위 구분이 없으면 3곳 모두
    }

    if (has(p, ["가격", "판매가", "단가", "소비자가", "공급가"])) {
      if (has(s, ["소매"])) return ["price_retail"];
      if (has(s, ["도매"])) {
        // 도매몰은 등급별 차등가 — 베이직 / 마스터로 나뉩니다.
        if (has(s, ["마스터", "master"])) return ["price_wholesale_master"];
        return ["price_wholesale"];                              // 도매몰 기본(베이직)
      }
      if (has(s, ["마스터", "master"])) return ["price_wholesale_master"];
      if (has(s, ["베이직", "basic"])) return ["price_wholesale"];
      if (has(s, ["네이버", "스마트", "스토어"])) return ["price_naver"];
      if (has(s, ["자사"])) return ["price_retail"];
      return ["price_retail"];                                   // 하위 구분이 없으면 소매몰 가격
    }

    if (has(p, ["링크", "url", "주소"])) return ["ref_link"];
    if (has(p, ["비고", "메모", "특이"])) return ["note"];
    if (has(p, ["no", "순번", "번호"])) return ["seq"];

    return [];   // 이미지 열 등은 가져오지 않습니다
  }

  /* ---------- 값 다듬기 ---------- */
  function normContent(v) {
    var s = txt(v);
    if (!s) return DEFAULT_CONTENT;
    var n = norm(s);
    if (has(n, ["신규", "신제품", "신상품", "new"])) return "신규 제품";
    if (has(n, ["기존"])) return "기존 제품";
    return CONTENT_OPTIONS.indexOf(s) > -1 ? s : "기타";
  }
  function normNeed(v) {
    var s = txt(v);
    if (!s) return DEFAULT_NEED;
    var n = norm(s);
    if (has(n, ["불필요", "x", "×", "n", "no", "제외"])) return "불필요";
    if (has(n, ["필요", "o", "ㅇ", "○", "●", "v", "√", "y", "yes", "1"])) return "필요";
    return DEFAULT_NEED;
  }
  function normPrice(v) {
    if (typeof v === "number") return Math.round(v);
    // 한 칸에 값이 여러 개(줄바꿈·쉼표 구분)면 첫 번째 숫자만 씁니다.
    var first = String(v == null ? "" : v).split(/[\n\r,;/|]/)[0];
    var d = first.replace(/[^0-9]/g, "");
    if (d === "") return null;
    if (d.length > 12) d = d.slice(0, 12);   // 비정상적으로 긴 값 방어
    return Number(d);
  }

  /* ---------- 본체 ---------- */

  /* 워크북에서 가장 그럴듯한 시트를 고릅니다 (데이터가 가장 많은 시트) */
  function pickSheet(wb) {
    var best = null;
    wb.SheetNames.forEach(function (name) {
      var ws = wb.Sheets[name];
      if (!ws || !ws["!ref"]) return;
      var aoa = sheetToRows(ws);
      var hr = findHeaderRow(aoa);
      if (hr < 0) return;
      var count = 0;
      for (var r = hr + 1; r < aoa.length; r++) {
        if ((aoa[r] || []).some(function (c) { return txt(c) !== ""; })) count++;
      }
      if (!best || count > best.count) best = { name: name, ws: ws, aoa: aoa, headerRow: hr, count: count };
    });
    return best;
  }

  /* ArrayBuffer -> 분석 결과 */
  function parse(buffer) {
    var wb = XLSX.read(buffer, { type: "array", cellDates: true });
    var picked = pickSheet(wb);
    if (!picked) throw new Error("상품 목록으로 보이는 표를 찾지 못했습니다. 머리글에 '브랜드 · 품명 · 모델명' 같은 이름이 있는지 확인해 주세요.");

    var aoa = picked.aoa;
    var links = linkMap(picked.ws);
    var hr = picked.headerRow;
    var subRow = isSubHeaderRow(aoa, hr + 1) ? hr + 1 : -1;
    var dataStart = (subRow > -1 ? subRow : hr) + 1;

    /* 열 연결표 만들기 */
    var header = aoa[hr] || [];
    var sub = subRow > -1 ? (aoa[subRow] || []) : [];
    var width = Math.max(header.length, sub.length);
    var cols = [];       // {c, label, fields}
    var mappings = [];
    var ignored = [];
    var claimed = {};    // 이미 어떤 열이 가져간 항목 (열이 병합되어 중복 매핑되는 것 방지)
    for (var c = 0; c < width; c++) {
      var p = txt(header[c]), s = txt(sub[c]);
      var fields = mapColumn(p, s).filter(function (f) {
        if (f === "seq") return false;
        if (claimed[f]) return false;   // 앞 열이 이미 가져간 항목은 건너뜁니다
        return true;
      });
      var label = (p + (s && s !== p ? " › " + s : "")).trim();
      if (!label) continue;
      fields.forEach(function (f) { claimed[f] = true; });
      cols.push({ c: c, label: label, fields: fields });
      var entry = {
        column: XLSX.utils.encode_col(c),
        label: label,
        to: fields.map(function (f) { return FIELD_LABEL[f]; }).join(", ")
      };
      if (fields.length) mappings.push(entry); else ignored.push(entry);
    }

    /* 작성일 찾기 (머리글 위쪽에서 '작성일'이 적힌 줄)
       라벨 셀("작성일 :")이 병합으로 복제될 수 있으니, 라벨은 건너뛰고
       날짜/엑셀 날짜값/날짜 형태 텍스트만 찾습니다. */
    function serialToISO(n) {
      var d = XLSX.SSF.parse_date_code(n);
      if (!d || !d.y) return "";
      return d.y + "-" + String(d.m).padStart(2, "0") + "-" + String(d.d).padStart(2, "0");
    }
    var workDate = "";
    for (var r = 0; r < hr && !workDate; r++) {
      var row = aoa[r] || [];
      var hasLabel = row.some(function (v) { return norm(v).indexOf("작성일") > -1; });
      if (!hasLabel) continue;
      for (var j = 0; j < row.length; j++) {
        var v = row[j];
        if (norm(v).indexOf("작성일") > -1) continue;      // 라벨 셀은 건너뜀
        if (v instanceof Date) { workDate = dateToISO(v); break; }
        if (typeof v === "number" && v > 20000 && v < 80000) { workDate = serialToISO(v); if (workDate) break; }
        var t = txt(v);
        if (/\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2}/.test(t)) {     // 2026-07-07, 2026.7.7 등
          workDate = t.replace(/[.\/]/g, "-").replace(/-(\d)(?!\d)/g, "-0$1");
          break;
        }
      }
    }

    /* 데이터 행 만들기 */
    var items = [];
    for (var r2 = dataStart; r2 < aoa.length; r2++) {
      var row2 = aoa[r2] || [];
      var it = makeItem(items.length + 1);
      var filled = false;

      cols.forEach(function (col) {
        if (!col.fields.length) return;
        var raw = row2[col.c];
        var s2 = txt(raw);

        col.fields.forEach(function (f) {
          if (f === "content") {
            if (s2) { it.content = normContent(s2); filled = true; }
          } else if (f.indexOf("need_") === 0) {
            if (s2) { it[f] = normNeed(s2); filled = true; }
          } else if (f.indexOf("price_") === 0) {
            var n2 = normPrice(raw);
            if (n2 !== null) { it[f] = n2; filled = true; }
          } else if (f === "ref_link") {
            var link = links[r2 + ":" + col.c] || "";
            var val = /^https?:\/\//i.test(s2) ? s2 : (link || s2);
            if (val) { it.ref_link = val; filled = true; }
          } else {
            if (s2) { it[f] = s2; filled = true; }
          }
        });
      });

      if (filled) items.push(it);
    }

    items.forEach(function (it, i) { it.seq = i + 1; });

    return {
      sheetName: picked.name,
      headerRow: hr + 1,
      subHeaderRow: subRow > -1 ? subRow + 1 : 0,
      workDate: workDate,
      mappings: mappings,
      ignored: ignored,
      items: items
    };
  }

  /* File 객체 -> 분석 결과 (Promise) */
  function parseFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("파일을 읽지 못했습니다.")); };
      reader.onload = function (e) {
        try { resolve(parse(new Uint8Array(e.target.result))); }
        catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  return { parse: parse, parseFile: parseFile };
})();
