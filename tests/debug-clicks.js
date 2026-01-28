
// Monitor all click events on the page to see what's being hit
document.addEventListener('click', (e) => {
    console.log('[Global Click]', e.target, e.composedPath());
}, true);

// Monitor inline diff buttons specifically
setInterval(() => {
    const buttons = document.querySelectorAll('.line-btn');
    if (buttons.length > 0) {
        // console.log('[Monitor] Found line buttons:', buttons.length);
    }
}, 2000);
