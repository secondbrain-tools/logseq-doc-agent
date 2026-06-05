import "@logseq/libs";
import "@logseq/libs";
import { setupPlugin } from "./plugin";

// Force usage of global logseq (Mock in sim, Real in App)
console.log("[src/main.ts] Initializing...");
const logseq = (window as any).logseq;
console.log("[src/main.ts] logseq object:", logseq);

// Initialize the plugin when Logseq is ready
logseq
  .ready(async () => {
    await setupPlugin();
  })
  .catch(console.error);
