import './sdk.js';

const sdk = globalThis.MiniSDK;

if (!sdk) {
  throw new Error('@legend/ux-sdk failed to initialize MiniSDK global');
}

export const { create, createSdk, initUxSdk, DEFAULTS } = sdk;
export default sdk;
