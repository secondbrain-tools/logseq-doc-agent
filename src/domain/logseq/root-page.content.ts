export interface RootPageConfig {
  version: number;
  text: string;
}

export const ROOT_PAGE_CONFIG: RootPageConfig = {
  version: 1,
  text: `\
## Welcome to the Logseq Doc Agent storage root.
This page and its subpages store all the data for the plugin.

- **Available Subpages**
  - [[logseq-doc-agent/prompts]] - Stores user-defined and built-in prompts
  - [[logseq-doc-agent/chatlogs]] - Stores references to your chat logs
  - [[logseq-doc-agent/agents]] - Stores agent definitions
  - [[logseq-doc-agent/skills]] - Stores skill definitions (not yet supported)

- ⚠️ **Notice**
  - Do not manually change the structure of these pages unless you know what you are doing.
`
};
