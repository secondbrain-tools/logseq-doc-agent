import type { ISettingsPort } from "../../application/ports/settings-port";

/**
 * Adapter to access Logseq settings from the global window object
 */
export class LogseqSettingsAdapter implements ISettingsPort {
  get<T = any>(key: string, defaultValue?: T): T {
    const logseq = (window as any).logseq;
    const settings = logseq?.settings || {};
    const value = settings[key];

    if (value === undefined || value === null) {
      return defaultValue as T;
    }

    return value as T;
  }
}
