/**
 * Port for accessing application settings (e.g. from Logseq)
 */
export interface ISettingsPort {
  /**
   * Get a setting value by key
   * @param key The setting key
   * @param defaultValue Optional default value if setting is missing
   */
  get<T = any>(key: string, defaultValue?: T): T;
}
