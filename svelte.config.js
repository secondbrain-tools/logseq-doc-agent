import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
  // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
  // for more information about preprocessors
  preprocess: vitePreprocess(),
  
  // Svelte 5 compiler options
  compilerOptions: {
    // Enable experimental async features for better async/await support
    // This is needed because components use async patterns like:
    // - onMount(async () => {...})
    // - async function handleClick()
    // - await calls in component logic
    experimental: {
      async: true
    },
    
    // Enable Svelte 5 runes mode for modern reactive programming
    // This ensures components can use $state, $derived, $effect, etc.
    runes: true
  }
}
