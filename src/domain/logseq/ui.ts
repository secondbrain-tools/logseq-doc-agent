/**
 * Defines the position where a component can be injected relative to a target element
 */
export enum InjectionPosition {
    NextSibling = 'nextSibling',     // Default: after the target element
    PreviousSibling = 'previousSibling', // Before the target element
    FirstChild = 'firstChild',       // As the first child of the target
    LastChild = 'lastChild',         // As the last child of the target
    Replace = 'replace'              // Replace the target element
}
