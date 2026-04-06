# UX-Stream (Capstone) - Draft Repo

이 레포는 **설치형 브라우저 SDK**와 **별도 대시보드 서비스**를 함께 운영하는 초안입니다. 브라우저 SDK는 웹사이트에 설치되고, dashboard/editor/API는 이 서비스에서 별도로 호스팅됩니다.

## 현재 구조(요약)

- `server.js`
  - `POST /collect`: SDK 이벤트를 `data/events.jsonl`에 JSONL로 적재
  - `GET /api/metrics`: A/B 지표 집계(MVP)
  - `GET /api/sessions`: 세션 요약 + 라벨 결과
  - `GET /api/labels/summary`: 라벨 분포/기본 지표
  - `GET /api/insights`: 라벨별 인사이트(현재는 더미 생성)
- `packages/browser-sdk/*`: 설치형 브라우저 SDK 패키지 (`@legend/ux-sdk`)
- `GET /sdk.js`: dashboard 서비스가 패키지 `main` 엔트리를 브라우저 SDK로 서빙하는 경로
- `public/dashboard.*`: 실험 관리 + A/B metrics 대시보드(MVP)
- `public/editor.*`: Visual Editor(MVP+ Real 적용)
- `data/sites.json`: site별 dashboard/editor preview 설정 레지스트리
- `analytics/*`: 원시 이벤트 -> 세션화 -> 요약 -> 규칙 라벨링 파이프라인
- `insights/*`: 인사이트 I/O 계약 + provider 추상화 + fallback 생성기
- `docs/*`: 라벨 규칙, LLM 인사이트 I/O 스펙
- `personas/*`, `load/*`: persona 정의 + `k6` 부하 테스트 시나리오
- `eval/*`, `test/*`: 최소 평가셋/단위 테스트

## 실행 방법

현재 이 레포는 두 부분으로 나뉩니다.

- **대시보드 서비스**: `UX_SDK/`
- **설치형 SDK 패키지**: `UX_SDK/packages/browser-sdk`

### 1) 대시보드 서비스 실행

```bash
npm install
npm run dev
```

- 서버: `http://localhost:3001`
- 대시보드: `http://localhost:3001/dashboard`
- 에디터: `http://localhost:3001/editor`

### 2) 설치형 SDK 패키지 tarball 생성

```bash
npm pack ./packages/browser-sdk
```

생성 결과 예시:

```bash
legend-ux-sdk-0.1.0.tgz
```

## 설치형 SDK 패키지

- 패키지 경로: `packages/browser-sdk`
- 패키지 이름: `@legend/ux-sdk`

### 현재 상태

현재는 **패키지 구조 구현까지 완료된 상태**이고, 아직 npm registry에 `publish` 하지는 않았습니다.

즉 아래 명령은 **아직 바로 동작하지 않습니다**.

```bash
npm install @legend/ux-sdk
```

위 명령이 실제로 동작하게 하려면 나중에 다음 작업이 추가로 필요합니다.

1. npm 계정 준비
2. 패키지명 사용 가능 여부 확인
3. `npm login`
4. `npm publish --access public`

### 지금 가능한 설치 방식

#### 방법 A. 로컬 경로로 설치

웹페이지 프로젝트 루트에서:

```bash
npm install ../UX_SDK/packages/browser-sdk
```

또는 절대경로:

```bash
npm install "C:\Users\ssm05\OneDrive\Desktop\capstone\UX_SDK\packages\browser-sdk"
```

#### 방법 B. tarball 파일로 설치

먼저 `UX_SDK`에서 tarball 생성:

```bash
npm pack ./packages/browser-sdk
```

그 다음 웹페이지 프로젝트에서:

```bash
npm install ./legend-ux-sdk-0.1.0.tgz
```

### 웹페이지에서 사용하는 방식

설치 후 앱 시작 코드에서 SDK를 초기화합니다.

```js
import UXSDK from "@legend/ux-sdk";

UXSDK.initUxSdk({
  siteId: "legend-ecommerce",
  sdkBaseUrl: "http://localhost:3001"
});
```

또는 named import:

```js
import { initUxSdk } from "@legend/ux-sdk";

initUxSdk({
  siteId: "legend-ecommerce",
  sdkBaseUrl: "http://localhost:3001"
});
```

### 일반 HTML 사이트에서 사용하는 방식

대시보드 서비스가 실행 중이면 `/sdk.js`를 직접 로드할 수도 있습니다.

```html
<script src="http://localhost:3001/sdk.js"></script>
<script>
  MiniSDK.create({
    siteId: "legend-ecommerce",
    appId: "legend-ecommerce",
    endpoint: "http://localhost:3001/collect",
    configEndpoint: "http://localhost:3001/api/config"
  }).install();
</script>
```

관리 화면은 설치된 웹사이트에서 보는 것이 아니라, 별도 dashboard 서비스 URL에서 봅니다.

### 대시보드는 어디서 보나?

SDK를 웹사이트에 설치해도 dashboard는 그 웹사이트 안에서 보는 것이 아니라, **별도 서비스 URL**에서 봅니다.

예시:

- Ecommerce dashboard: `http://localhost:3001/dashboard?site_id=legend-ecommerce`
- Ecommerce editor: `http://localhost:3001/editor?site_id=legend-ecommerce`

즉 사용 흐름은 다음과 같습니다.

1. `UX_SDK` 대시보드 서비스를 실행한다.
2. 웹페이지 프로젝트에 SDK 패키지를 설치한다.
3. `siteId`를 넣고 SDK를 초기화한다.
4. 사용자는 웹사이트를 방문한다.
5. 운영자는 별도 dashboard URL에서 데이터/실험/editor를 확인한다.

## 웹페이지에서 실제로 돌리는 명령어 예시

### A. 대시보드 서비스 실행

```bash
cd UX_SDK
npm install
npm run dev
```

### B. 웹페이지 프로젝트에 SDK 설치

```bash
cd my-web-app
npm install ../UX_SDK/packages/browser-sdk
```

### C. 웹페이지 코드에 SDK 초기화 추가

```js
import { initUxSdk } from "@legend/ux-sdk";

initUxSdk({
  siteId: "my-site-id",
  sdkBaseUrl: "http://localhost:3001"
});
```

### D. 웹페이지 실행

```bash
npm run dev
```

### E. 대시보드 접속

```text
http://localhost:3001/dashboard?site_id=my-site-id
```

## 남은 작업

코드 구현은 완료됐지만, 아래는 아직 남아 있습니다.

1. npm registry publish
   - `npm install @legend/ux-sdk`가 어디서나 바로 되게 하려면 필요
2. package metadata 정리
   - repository, homepage, bugs, keywords 등
3. 버전 정책 정리
   - 예: `0.1.0` → `0.1.1` → `0.2.0`
4. publish 자동화
   - 필요하면 GitHub Actions 등으로 배포 자동화
5. 예제 앱 문서화 강화
   - React/Vite/HTML 별 설치 예시 분리

즉 현재 상태를 한 줄로 말하면:

> **로컬 설치와 로컬 실행은 가능하고, npm registry 공개 배포만 아직 안 한 상태**입니다.

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
