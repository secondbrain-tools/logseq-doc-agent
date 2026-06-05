/// <reference types="@sveltejs/kit" />

declare namespace svelteHTML {
  interface HTMLAttributes<T> {
    onmaxedout?: (event: CustomEvent<boolean>) => void;
  }
}
