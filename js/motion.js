/* anime.js 기반 공통 모션.
   업무 흐름에 필요한 피드백에만 사용합니다: 세그먼트 탭 인디케이터, 화면 전환,
   목록에 반영된 행 강조, 버튼 결과 피드백.
   라이브러리를 불러오지 못했거나 prefers-reduced-motion 이면 조용히 아무 것도 하지 않고,
   CSS 기본 상태만으로도 화면이 올바르게 보이도록 둡니다. */
var Motion = (function () {
  function reduced() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function ready() { return typeof anime === 'function' && !reduced(); }

  /* 결과 피드백 — 복사 성공, 저장 완료처럼 '됐다'를 알려야 할 때만 씁니다. */
  function pulse(el) {
    if (!el || !ready()) return;
    anime.remove(el);
    anime({ targets: el, scale: [1, 1.06, 1], duration: 240, easing: 'easeOutQuad' });
  }

  /* 화면·단계 전환 — 짧은 페이드와 아주 작은 이동만 줍니다. */
  function enter(el) {
    if (!el) return;
    if (!ready()) { el.style.opacity = ''; el.style.transform = ''; return; }
    anime.remove(el);
    anime({
      targets: el, opacity: [0, 1], translateY: [6, 0], duration: 200, easing: 'easeOutQuad',
      complete: function () { el.style.transform = ''; }
    });
  }

  /* 목록에 반영된 행을 잠깐 강조합니다. 행 위치와 높이는 그대로 둡니다. */
  function flashRow(id) {
    var row = document.querySelector('#gridBody tr[data-id="' + id + '"]');
    if (!row) return;
    if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    if (!ready()) return;
    var state = { level: 0 };
    row.classList.add('is-flash');
    anime.remove(state);
    anime({
      targets: state,
      level: [{ value: 1, duration: 140 }, { value: 1, duration: 420 }, { value: 0, duration: 320 }],
      easing: 'easeOutQuad',
      update: function () { row.style.setProperty('--row-flash', state.level); },
      complete: function () { row.classList.remove('is-flash'); row.style.removeProperty('--row-flash'); }
    });
  }

  /* 세그먼트 탭 — 선택 표시가 미끄러지듯 이동합니다.
     인디케이터를 만들지 못하면 CSS의 선택 배경이 그대로 쓰입니다. */
  function indicatorOf(container) {
    var indicator = container.querySelector(':scope > .seg-indicator');
    if (indicator) return indicator;
    if (!ready()) return null;
    indicator = document.createElement('span');
    indicator.className = 'seg-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    container.prepend(indicator);
    container.classList.add('has-indicator');
    return indicator;
  }
  function segTabs(container, animate) {
    if (!container) return;
    var indicator = indicatorOf(container);
    if (!indicator) return;
    var active = container.querySelector('[aria-selected="true"]') || container.querySelector('.is-active');
    if (!active || !active.offsetWidth) return;
    var left = active.offsetLeft, width = active.offsetWidth;
    if (!animate || !ready()) {
      anime.remove(indicator);
      indicator.style.transform = 'translateX(' + left + 'px)';
      indicator.style.width = width + 'px';
      return;
    }
    anime.remove(indicator);
    anime({ targets: indicator, translateX: left, width: width, duration: 240, easing: 'easeOutCubic' });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', function () {
      document.querySelectorAll('.seg-tabs.has-indicator').forEach(function (container) { segTabs(container, false); });
    });
  }

  return { pulse: pulse, enter: enter, flashRow: flashRow, segTabs: segTabs, reduced: reduced, ready: ready };
})();
