
(function animatedCursorScope() {
  let cursorEl = null;
  let mousePosX = 0;
  let mousePosY = 0;
  let animationFrameId = null;
  const cursorSize = 32; // Default size, can be adjusted

  function onMouseMove(event) {
    mousePosX = event.clientX;
    mousePosY = event.clientY;
  }

  function updatePosition() {
    if (cursorEl) {
      cursorEl.style.left = `${mousePosX - cursorSize / 2}px`;
      cursorEl.style.top = `${mousePosY - cursorSize / 2}px`;
    }
    animationFrameId = requestAnimationFrame(updatePosition);
  }

  window.startAnimatedCursor = function (gifUrl) {
    if (!gifUrl) return;

    // Stop any existing animated cursor
    if (window.stopAnimatedCursor) {
      window.stopAnimatedCursor();
    }
     // Stop Neko specifically if it was running under old name
    if (typeof window.stopOneko === 'function') {
        window.stopOneko();
    }


    if (!cursorEl) {
      cursorEl = document.createElement("div");
      cursorEl.id = "animated-cursor-element";
      cursorEl.style.width = `${cursorSize}px`;
      cursorEl.style.height = `${cursorSize}px`;
      cursorEl.style.position = "fixed";
      cursorEl.style.pointerEvents = "none";
      cursorEl.style.imageRendering = "pixelated"; // Good for pixel art GIFs
      cursorEl.style.zIndex = "99999"; // Keep it on top
      // Ensure no default cursor is shown over the page
      document.body.style.cursor = 'none';
    }

    cursorEl.style.backgroundImage = `url('${gifUrl}')`;
    cursorEl.style.backgroundSize = "contain"; // Or "cover" or "auto" depending on desired effect
    cursorEl.style.backgroundRepeat = "no-repeat";
    cursorEl.style.backgroundPosition = "center";

    if (!document.body.contains(cursorEl)) {
      document.body.appendChild(cursorEl);
    }

    document.addEventListener("mousemove", onMouseMove);
    animationFrameId = requestAnimationFrame(updatePosition);
  };

  window.stopAnimatedCursor = function () {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    document.removeEventListener("mousemove", onMouseMove);
    if (cursorEl && document.body.contains(cursorEl)) {
      document.body.removeChild(cursorEl);
    }
    cursorEl = null; // Reset the element
    // Restore default system cursor if no other custom cursor is set
    if (!localStorage.getItem('selectedCursorUrl') && !localStorage.getItem('animatedCursorUrl')) {
        document.body.style.cursor = 'auto';
    }
  };

  // Clean up if the script is reloaded (e.g., during development with HMR)
  // This is a simple check; more robust cleanup might be needed in complex scenarios.
  if (document.getElementById("animated-cursor-element")) {
     // Potentially stop a previously running instance if script re-evaluates
     if(window.stopAnimatedCursor) window.stopAnimatedCursor();
  }
})();
