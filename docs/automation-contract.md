# 상품 자동화 데이터 계약 v1

## 읽기

`/view/?list=<목록 UUID>`를 열고 `html[data-automation-ready="true"]`가 될 때까지 기다립니다. 이후 `script#automation-data`의 `textContent`를 JSON으로 파싱합니다. 화면 테이블의 위치나 한국어 라벨을 기준으로 파싱할 필요가 없습니다.

```js
// 향후 Playwright 등록 프로그램의 읽기 예제
await page.goto(`${toolOrigin}/view/?list=${listId}`);
await page.locator('html[data-automation-ready="true"]').waitFor();
const payload = JSON.parse(await page.locator('#automation-data').textContent());
if (payload.schemaVersion !== 1 || !payload.ready || !payload.saved) {
  throw new Error('저장된 상품 데이터가 준비되지 않았습니다.');
}
if (payload.listId !== listId) throw new Error('요청한 목록과 다릅니다.');
for (const item of payload.items) {
  if (item.done) continue;
  if (item.issues.length) throw new Error(`${item.id}: ${item.issues.join(', ')}`);
  // item.categoryCodes.retail / wholesale를 해당 몰에 입력
  // item.thumbnail.url을 다운로드해 상품 썸네일로 등록
  // item.detailHtml을 상세페이지 HTML 입력창에 복사
}
```

`ready`는 설정과 선택 목록이 로딩됐다는 뜻입니다. 이미지 정상 여부는 `detailImages[].validation`과 `issues`로 별도 확인합니다. 로딩 실패나 존재하지 않는 목록에는 `ready=false`가 유지되므로 자동화 프로그램에서 대기 시간 제한을 두세요. `saved=false`는 편집 중이거나 저장 중이라는 뜻입니다. 상품 JSON 복사에는 상품 객체만, 목록 JSON 내보내기와 DOM에는 아래의 전체 응답이 들어갑니다.

```json
{
  "schemaVersion": 1,
  "ready": true,
  "saved": true,
  "listId": "목록 UUID",
  "items": [
    {
      "id": "상품 UUID",
      "list_id": "목록 UUID",
      "seq": 1,
      "brand": "TILTA",
      "model": "TA-T108-C-B",
      "name_own": "자사몰 상품명",
      "name_naver": "네이버 상품명",
      "need_retail": "필요",
      "need_wholesale": "필요",
      "need_naver": "필요",
      "price_retail": 466000,
      "price_wholesale": null,
      "price_wholesale_master": null,
      "price_naver": 466000,
      "categoryCodes": { "retail": "003001", "wholesale": "003001" },
      "origin": "Made in China",
      "categoryPaths": {
        "retail": "영상장비-틸타리그시스템 > Camera Cage",
        "wholesale": "영상장비-틸타리그시스템 > Camera Cage"
      },
      "thumbnail": {
        "url": "https://<project>.supabase.co/storage/v1/object/public/product-thumbnails/<path>.jpg",
        "path": "<list-id>/<item-id>/<upload-id>.jpg",
        "originalName": "thumbnail.jpg",
        "mimeType": "image/jpeg",
        "size": 102400
      },
      "detailImages": [
        {
          "order": 1,
          "folder": "tilta",
          "filename": "tilta-tat108cb.jpg",
          "url": "https://calla.hgodo.com/product/tilta/tilta-tat108cb.jpg",
          "validation": {
            "status": "valid",
            "url": "https://calla.hgodo.com/product/tilta/tilta-tat108cb.jpg",
            "width": 950,
            "height": 3000,
            "checkedAt": "2026-09-07T00:00:00.000Z"
          }
        }
      ],
      "detailHtml": "<div align=\"center\">\n  <img src=\"https://calla.hgodo.com/product/tilta/tilta-tat108cb.jpg\">\n</div>",
      "done": false,
      "done_at": null,
      "issues": []
    }
  ]
}
```

예제 URL과 검사 크기는 형식 설명용입니다. 기존 상품의 `content`, `image_usage`, `image_url`, `ref_link`, `note`, 생성/수정 시각 등도 함께 전달되며 추가 필드는 무시할 수 있게 처리하세요. 가격 `null`을 임의로 0원으로 바꾸지 마세요. 카테고리 코드는 항상 문자열이며, 화면 경로는 표시용입니다. 저장된 코드가 설정에서 사라지면 경로가 비어 있고 확인 항목에 표시됩니다. 상품과 이미지의 순서는 각각 `seq`, `order`를 사용합니다.

## 이미지 검사

- `valid`: 실제 이미지 로딩과 디코딩에 성공하고 크기가 0보다 큼.
- `unchecked`: 미검사이거나 검사 당시 URL과 현재 URL이 다름.
- `error`: 로딩/디코딩 실패. 브라우저에서는 404, 차단, 네트워크 오류를 정확히 구별하지 않음.
- `timeout`: 기본 15초 내 검사가 끝나지 않음.
- 주소 형식 자체가 잘못되면 빈 URL과 확인 항목을 반환함.

검사 결과는 검사 시점과 브라우저 환경에 한정됩니다. 원격 이미지 내용 변경이나 이후 파일 삭제를 실시간 추적하지 않습니다. 미래 등록 프로그램은 `checkedAt`을 확인하고 실행 직전에 필요하면 재검사해야 합니다. 보기 페이지의 재검사는 해당 화면에서만 반영되며, 검사 결과를 DB에 남기려면 편집 페이지에서 검사 후 저장합니다. 상세페이지 HTML은 현재 순서와 주소로 매번 생성됩니다.

`issues=[]`는 카테고리·썸네일 참조·자사몰 상품명·상세 이미지 검사의 기본 조건만 충족했다는 뜻입니다. 상품 이미지 내용, 고도몰 브랜드 매칭, 실제 판매가격, 몰별 필수 항목은 등록 프로그램에서 별도 검증하세요.

## 저장 위치

DB 직접 연동 시 `product_items.automation.categoryCodes`, `.origin`, `.detailImages`, `.detailHtml`, `.thumbnail`을 사용합니다. `thumbnail`에는 Storage `path`만 있고 공개 URL은 `image_url` 컬럼에 있습니다. 썸네일 공개 URL은 기존 `image_url`에도 저장합니다. 원본 JSON의 이미지에는 내부 ID가 있고 DOM 내보내기에는 `order`가 있습니다. 상세 HTML을 직접 재생성한다면 `js/automation-core.js`의 주소 검증과 생성 규칙을 함께 사용하세요. 이 변경은 실제 고도몰에 상품을 자동 등록하는 프로그램 자체를 포함하지 않습니다.

## 등록 상태 기록

실제 등록 프로그램은 DB를 직접 읽고 `product_registrations`에 결과를 씁니다.

| 컬럼 | 값 |
|---|---|
| `item_id` / `channel` | 상품 UUID / `retail` 또는 `wholesale` (조합 유일) |
| `status` | `pending` → `running` → `success` 또는 `failed` |
| `goods_no` | 고도몰이 발급한 상품번호 (확인된 경우) |
| `error_message` | 실패 사유 |
| `warnings` | 브랜드 미매칭, 썸네일 없음 등 경고 문자열 배열 |
| `attempted_at` | 마지막 시도 시각 |

대상 선정: `need_*`가 "필요"이고 `done=false`이며 해당 채널이 `success`가 아닌 상품. 필요한 채널이 모두 `success`면 프로그램이 `done=true`, `done_at`을 기록합니다. 원산지는 `automation.origin`을 사용합니다.
