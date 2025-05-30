
// Generic Animated GIF Cursor Script
(function() {
    if (window.hasAnimatedCursorScriptRan) {
        // Script has already run, functions should be defined.
        // We might want to ensure the functions are up-to-date if this script is re-loaded,
        // but for now, assume the first load defines them correctly.
        return;
    }

    let animatedCursorEl = null;
    const cursorWidth = 32; // Default width of the cursor image
    const cursorHeight = 32; // Default height of the cursor image
    const cursorId = "animated-cursor-element"; // Specific ID for the cursor div

    let mousePosX = 0;
    let mousePosY = 0;

    let isGloballyStopped = true; // True if explicitly stopped, false if running
    let isHiddenByHover = false; // True if hidden due to hover over interactive element

    function updatePosition(event) {
        if (event) {
            mousePosX = event.clientX;
            mousePosY = event.clientY;
        }
        if (animatedCursorEl && !isGloballyStopped && !isHiddenByHover) {
            // Align top-left of the cursor div with the mouse pointer
            animatedCursorEl.style.transform = `translate(${mousePosX}px, ${mousePosY}px)`;
        }
    }

    function removeExistingCursorElement() {
        const oldCursor = document.getElementById(cursorId);
        if (oldCursor) {
            oldCursor.remove();
        }
    }

    window.startAnimatedGifCursor = function(gifUrl) {
        isGloballyStopped = false;
        isHiddenByHover = false;

        removeExistingCursorElement(); // Ensure any old instance is removed

        animatedCursorEl = document.createElement("div");
        animatedCursorEl.id = cursorId;
        animatedCursorEl.style.position = "fixed";
        animatedCursorEl.style.width = `${cursorWidth}px`;
        animatedCursorEl.style.height = `${cursorHeight}px`;
        animatedCursorEl.style.backgroundImage = `url('${gifUrl}')`;
        animatedCursorEl.style.backgroundSize = "contain"; // Ensure GIF fits
        animatedCursorEl.style.backgroundRepeat = "no-repeat";
        animatedCursorEl.style.backgroundPosition = "center";
        animatedCursorEl.style.imageRendering = "pixelated"; // For a sharper look if upscaled
        animatedCursorEl.style.pointerEvents = "none"; // So it doesn't interfere with mouse events
        animatedCursorEl.style.zIndex = "99999"; // Keep it on top
        animatedCursorEl.style.left = "0px"; // Initial position, will be updated by transform
        animatedCursorEl.style.top = "0px";
        animatedCursorEl.style.willChange = "transform"; // Performance hint
        animatedCursorEl.style.display = 'block'; // Make sure it's visible

        document.body.appendChild(animatedCursorEl);

        document.removeEventListener("mousemove", updatePosition); // Remove old listener if any
        document.addEventListener("mousemove", updatePosition);
        
        // Immediately update to current mouse position if known, or a default
        updatePosition({ clientX: mousePosX, clientY: mousePosY });
    };

    window.stopAnimatedGifCursor = function() {
        isGloballyStopped = true;
        isHiddenByHover = false; // Reset hover state
        document.removeEventListener("mousemove", updatePosition);
        removeExistingCursorElement();
        animatedCursorEl = null; // Clear the reference
    };

    window.hideAnimatedGifCursor = function() {
        if (!isGloballyStopped && animatedCursorEl) {
            isHiddenByHover = true;
            animatedCursorEl.style.display = 'none';
        }
    };

    window.showAnimatedGifCursor = function() {
        if (!isGloballyStopped && isHiddenByHover && animatedCursorEl) {
            isHiddenByHover = false;
            animatedCursorEl.style.display = 'block';
            // Re-sync position in case mouse moved while hidden
            updatePosition({ clientX: mousePosX, clientY: mousePosY });
        }
    };
    
    // Track initial mouse position
    document.addEventListener('mousemove', (e) => {
        mousePosX = e.clientX;
        mousePosY = e.clientY;
    }, { once: true });


    window.hasAnimatedCursorScriptRan = true;
})();
