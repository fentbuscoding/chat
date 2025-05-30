
(function() {
  let animatedCursorEl = null;
  const CURSOR_ID = "generic-animated-cursor-element";
  const cursorWidth = 32; // Default width for the cursor div
  const cursorHeight = 32; // Default height for the cursor div
  let mousePosX = 0;
  let mousePosY = 0;
  let lastRequestId = null;

  let isGloballyStopped = true; // True if stopAnimatedGifCursor was called
  let isHiddenByHover = false;  // True if temporarily hidden by hover over interactive element

  function updatePosition() {
    if (animatedCursorEl && !isGloballyStopped && !isHiddenByHover) {
      // This positions the top-left of the div at the mouse coordinates
      animatedCursorEl.style.transform = `translate(${mousePosX}px, ${mousePosY}px)`;
    }
    if (!isGloballyStopped) {
      lastRequestId = requestAnimationFrame(updatePosition);
    }
  }

  function onMouseMove(event) {
    mousePosX = event.clientX;
    mousePosY = event.clientY;
  }

  function createAnimatedCursorElement(gifUrl) {
    const el = document.createElement("div");
    el.id = CURSOR_ID;
    el.style.position = 'fixed';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '10000'; // High z-index
    el.style.width = `${cursorWidth}px`;
    el.style.height = `${cursorHeight}px`;
    el.style.backgroundImage = `url('${gifUrl}')`;
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = '0 0'; // Changed from 'center' to '0 0'
    el.style.backgroundSize = 'contain'; // Ensures the GIF fits and maintains aspect ratio
    el.style.willChange = "transform"; // Performance hint
    el.style.display = 'none'; // Initially hidden
    return el;
  }

  window.startAnimatedGifCursor = function(gifUrl) {
    if (!gifUrl) return;

    // Stop any existing generic animated cursor and Neko
    window.stopAnimatedGifCursor?.();
    // window.stopOriginalOneko?.(); // Managed by calling code in page.tsx

    if (!animatedCursorEl) {
      animatedCursorEl = createAnimatedCursorElement(gifUrl);
      document.body.appendChild(animatedCursorEl);
    } else {
      // Update existing element's image if it already exists
      animatedCursorEl.style.backgroundImage = `url('${gifUrl}')`;
    }
    
    isGloballyStopped = false;
    isHiddenByHover = false;
    animatedCursorEl.style.display = 'block';
    document.body.style.cursor = 'none'; // Hide system cursor

    document.addEventListener('mousemove', onMouseMove);
    if (lastRequestId) {
      cancelAnimationFrame(lastRequestId);
    }
    lastRequestId = requestAnimationFrame(updatePosition);
  };

  window.stopAnimatedGifCursor = function() {
    isGloballyStopped = true;
    if (animatedCursorEl) {
      animatedCursorEl.style.display = 'none';
      // Consider removing the element if it's not going to be reused soon,
      // or keep it for faster restart. For now, just hide.
      // If you want to remove:
      // animatedCursorEl.remove();
      // animatedCursorEl = null;
    }
    if (lastRequestId) {
      cancelAnimationFrame(lastRequestId);
      lastRequestId = null;
    }
    document.removeEventListener('mousemove', onMouseMove);
    // Do not reset document.body.style.cursor here,
    // as another cursor type might be activated immediately.
    // The calling code (e.g., handleDefaultCursor) should handle this.
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
    }
  };

  // Initial check to stop if script re-runs due to hot reload etc.
  // (This specific auto-stop might be too aggressive if the page fully reloads
  // and layout.tsx tries to re-apply it from localStorage.
  // The start/stop logic in page.tsx and layout.tsx should ideally manage this better.)
  // window.addEventListener('DOMContentLoaded', () => {
  //   if (animatedCursorEl) { // If an old one somehow exists
  //     window.stopAnimatedGifCursor();
  //   }
  // });

})();
