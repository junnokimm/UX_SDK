# UX-Stream (Capstone) - Draft Repo

이 레포는 가상의 이커머스 웹에 설치 가능한 행동 수집 SDK + 서버 저장/집계 + (규칙 기반) 이탈 유형 라벨링 + (플러그인) LLM 인사이트 생성을 목표로 하는 초안입니다.

## 현재 구조(요약)

- `server.js`
  - `POST /collect`: SDK 이벤트를 `data/events.jsonl`에 JSONL로 적재
  - `GET /api/metrics`: A/B 지표 집계(MVP)
  - `GET /api/sessions`: 세션 요약 + 라벨 결과
  - `GET /api/labels/summary`: 라벨 분포/기본 지표
  - `GET /api/insights`: 라벨별 인사이트(현재는 더미 생성)
- `public/sdk.js`: 브라우저 SDK(페이지뷰/클릭/체류시간) + A/B config 적용
- `public/dashboard.*`: 실험 관리 + A/B metrics 대시보드(MVP)
- `public/editor.*`: Visual Editor(MVP+ Real 적용)
- `data/sites.json`: site별 dashboard/editor preview 설정 레지스트리
- `analytics/*`: 원시 이벤트 -> 세션화 -> 요약 -> 규칙 라벨링 파이프라인
- `insights/*`: 인사이트 I/O 계약 + provider 추상화 + fallback 생성기
- `docs/*`: 라벨 규칙, LLM 인사이트 I/O 스펙
- `personas/*`, `load/*`: persona 정의 + `k6` 부하 테스트 시나리오
- `eval/*`, `test/*`: 최소 평가셋/단위 테스트

## 실행 방법

```bash
npm install
npm run dev
```

- 서버: `http://localhost:3001`
- 대시보드: `http://localhost:3001/dashboard`
- 에디터: `http://localhost:3001/editor`

### site별 dashboard / editor

- Ecommerce dashboard: `http://localhost:3001/dashboard?site_id=legend-ecommerce`
- Ecommerce editor: `http://localhost:3001/editor?site_id=legend-ecommerce`
- Sample dashboard: `http://localhost:3001/dashboard?site_id=ab-sample`

site별 preview 대상과 editor target 목록은 `data/sites.json`에서 관리합니다.

## API 빠른 확인

- 세션 요약: `GET /api/sessions?site_id=ab-sample&limit=50`
- 라벨 분포: `GET /api/labels/summary?site_id=ab-sample`
- 인사이트(더미): `GET /api/insights?site_id=ab-sample&reps=3`

## 이탈 유형 규칙 / 인사이트 계약

- 라벨 규칙 스펙: `docs/label-rules.md`
- 인사이트 I/O 계약: `docs/insights-contract.md`
- site registry 운영 가이드: `docs/site-registry.md`

## 테스트(회귀 체크)

```bash
npm test
```

- 픽스처 이벤트: `eval/sample-events.jsonl`
- 기대 라벨: `eval/expected-labels.json`

## Persona 시뮬레이션 / k6 부하 테스트

기존 Node 시뮬레이터:

```bash
npm run simulate -- --users 100 --sessions 2
```

`k6` 기반 persona 부하 테스트:

```bash
npm run load:k6
```

- 공용 persona 정의: `personas/catalog.json`
- `k6` 시나리오: `load/persona-load.js`
- 상세 가이드: `docs/load-testing.md`

## LLM UX 인사이트 파이프라인

`GET /api/insights`는 이제 입력 계약 생성 후 provider 추상화 계층을 통해 인사이트를 만듭니다.

- 기본값: deterministic fallback generator
- `UX_INSIGHTS_PROVIDER=openai` 설정 시 OpenAI 호환 Chat Completions API 호출
- 관련 env
  - `UX_INSIGHTS_PROVIDER`
  - `UX_INSIGHTS_API_KEY`
  - `UX_INSIGHTS_BASE_URL`
  - `UX_INSIGHTS_MODEL`

예시:

```bash
curl "http://localhost:3001/api/insights?site_id=ab-sample&reps=3"
```
