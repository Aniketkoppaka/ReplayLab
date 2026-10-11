/**
 * @replaylab/web
 * Frontend baseline exports.
 */
import { CONTRACTS_VERSION } from '@replaylab/contracts';

export const WEB_APP_VERSION = '0.1.0';

export function getWebClientInfo() {
  return {
    webVersion: WEB_APP_VERSION,
    contractsVersion: CONTRACTS_VERSION,
  };
}
