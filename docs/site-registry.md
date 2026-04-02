# Site Registry 운영 가이드

`UX_SDK`는 이제 `site_id`별 preview 대상과 editor/dashboard 동작을 `data/sites.json`에서 관리합니다.

## 목적

- dashboard에서 어떤 사이트 데이터를 보여줄지 결정
- visual editor에서 어떤 실제 페이지를 iframe preview로 띄울지 결정
- site별 기본 실험 key / url prefix를 통일된 설정으로 관리

## 설정 파일 위치

- `data/sites.json`

## 구조

```json
{
  "sites": [
    {
      "site_id": "legend-ecommerce",
      "name": "Legend Ecommerce",
      "preview_base_url": "http://127.0.0.1:8080",
      "api_base_url": "http://127.0.0.1:3000",
      "preview_targets": [
        {
          "id": "home",
          "label": "홈",
          "path": "/",
          "url_prefix": "/",
          "default": true,
          "experiment_key": "exp_home_cta_v1"
        }
      ]
    }
  ]
}
```

## 필드 설명

### site level

- `site_id`: analytics / experiment / dashboard 구분 키
- `name`: dashboard, editor에서 보여줄 이름
- `preview_base_url`: editor iframe이 preview할 실제 프론트엔드 주소
- `api_base_url`: preview iframe 안의 `/api/*` 요청을 프록시할 실제 백엔드 주소
- `preview_targets`: editor target 목록

### preview_targets level

- `id`: 내부 식별자
- `label`: editor target dropdown 표시 이름
- `path`: 실제 preview할 페이지 경로 또는 query 포함 경로
- `url_prefix`: SDK 실험 config 매칭에 쓰는 prefix
- `default`: 이 site의 기본 target 여부
- `experiment_key`: editor가 기본으로 채울 experiment key

## 새 사이트 추가 방법

1. `data/sites.json`의 `sites` 배열에 새 항목 추가
2. `site_id`는 기존 값과 겹치지 않게 지정
3. `preview_base_url`에는 실제 프론트 주소 입력
4. `api_base_url`에는 해당 사이트 백엔드 주소 입력
5. `preview_targets`에 editor에서 열고 싶은 주요 페이지들을 등록
6. SDK를 설치하는 웹사이트 쪽에서도 같은 `site_id`를 사용하도록 설정

## 예시: 새 사이트 추가

```json
{
  "site_id": "brand-x",
  "name": "Brand X Store",
  "preview_base_url": "http://127.0.0.1:4173",
  "api_base_url": "http://127.0.0.1:4000",
  "preview_targets": [
    {
      "id": "home",
      "label": "홈",
      "path": "/",
      "url_prefix": "/",
      "default": true,
      "experiment_key": "exp_brandx_home_v1"
    },
    {
      "id": "product",
      "label": "상품상세",
      "path": "/product/1",
      "url_prefix": "/product",
      "experiment_key": "exp_brandx_product_v1"
    }
  ]
}
```

## 실행 시 동작

- `GET /api/sites` → dashboard/editor가 site 목록과 preview target을 읽음
- `GET /api/sites/:siteId` → editor가 현재 site 설정을 읽음
- `GET /preview/:siteId/*` → 실제 프론트엔드를 same-origin preview로 보여줌
- `ALL /preview-api/:siteId/*` → iframe 안의 `/api/*` 요청을 실제 백엔드로 전달

## 현재 제약

- `preview-api`는 현재 JSON/text 중심으로 맞춰져 있음
- multipart upload, binary 응답, 특수 redirect 흐름은 추가 보강이 필요할 수 있음
- visual editor overlay는 same-origin 전제를 쓰므로, preview는 반드시 `UX_SDK` proxy 경유가 안전함

## 운영 팁

- `url_prefix`는 실제 실험이 적용될 경로 prefix와 맞춰야 함
- `default: true`는 site마다 하나만 두는 것이 좋음
- dashboard를 특정 site로 바로 열고 싶으면:
  - `/dashboard?site_id=legend-ecommerce`
  - `/editor?site_id=legend-ecommerce`
