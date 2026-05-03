import type { LogseqApi } from '../../application/ports/logseq-ports';
import { LegacyLogseqApi } from './logseq-runtime';

let currentLogseqApi: LogseqApi | null = null;

export function setCurrentLogseqApi(api: LogseqApi): void {
  currentLogseqApi = api;
}

export function getCurrentLogseqApi(): LogseqApi {
  if (!currentLogseqApi && (window as any).logseq) {
    currentLogseqApi = new LegacyLogseqApi();
  }

  if (!currentLogseqApi) {
    throw new Error('Logseq API runtime not initialized');
  }
  return currentLogseqApi;
}
