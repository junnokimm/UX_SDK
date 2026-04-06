# @legend/ux-sdk

설치형 브라우저 SDK 패키지입니다.

## 설치

현재 이 패키지는 **로컬 패키지 구조까지 구현된 상태**이며, 아직 npm registry에 publish되지는 않았습니다.

즉 아래 명령은 publish 전까지는 바로 동작하지 않습니다.

```bash
npm install @legend/ux-sdk
```

지금은 아래 방식으로 설치할 수 있습니다.

```bash
npm install ../UX_SDK/packages/browser-sdk
```

또는

```bash
npm pack ./packages/browser-sdk
npm install ./legend-ux-sdk-0.1.0.tgz
```

## 사용

```js
import UXSDK from "@legend/ux-sdk";

UXSDK.initUxSdk({
  siteId: "legend-ecommerce",
  sdkBaseUrl: "http://localhost:3001"
});
```

또는

```js
import { initUxSdk } from "@legend/ux-sdk";

initUxSdk({
  siteId: "legend-ecommerce",
  sdkBaseUrl: "http://localhost:3001"
});
```

dashboard/editor는 이 패키지에 포함되지 않으며 별도 대시보드 서비스에서 호스팅됩니다.

대시보드 서비스 실행 예시:

```bash
cd UX_SDK
npm install
npm run dev
```

접속 예시:

- Dashboard: `http://localhost:3001/dashboard?site_id=legend-ecommerce`
- Editor: `http://localhost:3001/editor?site_id=legend-ecommerce`

브라우저 `<script>` 방식으로 사용할 때 전역 이름은 `MiniSDK`입니다.
