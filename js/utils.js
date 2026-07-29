/* ===== 공통 유틸 ===== */

/* HTML 이스케이프 — 사용자가 입력한 값을 innerHTML에 넣기 전 반드시 통과시킵니다. */
function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* 오늘 날짜 (YYYY-MM-DD, 로컬 기준) */
function todayISO() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

/* 등록일 표시용: 2026. 07. 24. */
function fmtDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d)) return String(iso);
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + ". " + m + ". " + day + ".";
}

/* 날짜+시간 표시용: 2026. 07. 24. 14:30:05 */
function fmtDateTime(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d)) return String(iso);
  var p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + ". " + p(d.getMonth() + 1) + ". " + p(d.getDate()) + ". " +
    p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

/* 숫자만 남기기 */
function onlyDigits(s) {
  return String(s == null ? "" : s).replace(/[^0-9]/g, "");
}

/* 1,000 단위 쉼표 */
function withComma(n) {
  if (n === null || n === undefined || n === "") return "";
  var d = onlyDigits(n);
  if (d === "") return "";
  return Number(d).toLocaleString("ko-KR");
}

/* 화면 표시용 원화: ₩1,000 */
function fmtWon(n) {
  var c = withComma(n);
  return c === "" ? "" : "₩" + c;
}

/* 숫자 컬럼 저장값 — 빈 값은 null */
function toNumberOrNull(v) {
  var d = onlyDigits(v);
  return d === "" ? null : Number(d);
}

/* 링크 정규화 — 스킴이 없으면 https:// 를 붙입니다.
   javascript:, data: 같은 위험한 스킴은 링크로 열지 않습니다. */
function normalizeUrl(raw) {
  var s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return "";   // 알 수 없는 스킴은 차단
  if (/^[\\/]/.test(s)) return "";                 // \\서버\경로 같은 사내 경로는 링크로 열지 않습니다
  if (!/^[\w가-힣-]+(\.[\w-]+)+/.test(s)) return "";// 도메인 형태가 아니면 링크 아님
  return "https://" + s;
}

/* UUID (구형 브라우저 대비 폴백 포함) */
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* 토스트 알림 */
var _toastTimer = null;
function toast(msg, kind) {
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast" + (kind ? " toast-" + kind : "");
  el.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
}

/* 클립보드 복사 (구형 브라우저 폴백 포함) */
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(
      function () { toast("복사했습니다"); },
      function () { legacyCopy(text); }
    );
  } else {
    legacyCopy(text);
  }
}
function legacyCopy(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    toast("복사했습니다");
  } catch (e) {
    toast("복사에 실패했습니다", "error");
  }
  document.body.removeChild(ta);
}
