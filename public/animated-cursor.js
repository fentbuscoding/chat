
(function animatedGifCursor() {
  const cursorWidth = 32; // Define cursor width
  const cursorHeight = 32; // Define cursor height
  let animatedCursorEl = null;
  let mousePosX = 0;
  let mousePosY = 0;
  let isGloballyStopped = true;
  let isHiddenByHover = false;
  let currentGifUrl = null;

  function createCursorElement() {
    if (!animatedCursorEl) {
      animatedCursorEl = document.createElement("div");
      animatedCursorEl.id = "animated-gif-cursor";
      animatedCursorEl.style.width = `${cursorWidth}px`;
      animatedCursorEl.style.height = `${cursorHeight}px`;
      animatedCursorEl.style.position = "fixed";
      animatedCursorEl.style.pointerEvents = "none";
      animatedCursorEl.style.imageRendering = "pixelated";
      animatedCursorEl.style.zIndex = "10000"; // High z-index
      animatedCursorEl.style.willChange = "transform";
      document.body.appendChild(animatedCursorEl);
    }
  }

  function updatePosition() {
    if (animatedCursorEl && !isGloballyStopped && !isHiddenByHover) {
      // Align top-left of the cursor div with the mouse pointer
      animatedCursorEl.style.transform = `translate(${mousePosX}px, ${mousePosY}px)`;
    }
    requestAnimationFrame(updatePosition);
  }

  function onMouseMove(event) {
    mousePosX = event.clientX;
    mousePosY = event.clientY;
  }

  window.startAnimatedGifCursor = function (gifUrl) {
    if (!gifUrl) return;
    createCursorElement();

    isGloballyStopped = false;
    isHiddenByHover = false;
    currentGifUrl = gifUrl;

    if (animatedCursorEl) {
      animatedCursorEl.style.backgroundImage = `url('${gifUrl}')`;
      animatedCursorEl.style.display = "block";
    }
    document.addEventListener("mousemove", onMouseMove);
    requestAnimationFrame(updatePosition); // Start the animation frame loop
  };

  window.stopAnimatedGifCursor = function () {
    isGloballyStopped = true;
    if (animatedCursorEl) {
      animatedCursorEl.style.display = "none";
    }
    document.removeEventListener("mousemove", onMouseMove);
    // No need to cancelAnimationFrame if updatePosition checks isGloballyStopped
  };

  window.hideAnimatedGifCursor = function () {
    if (!isGloballyStopped && animatedCursorEl) {
      isHiddenByHover = true;
      animatedCursorEl.style.display = "none";
    }
  };

  window.showAnimatedGifCursor = function () {
    if (!isGloballyStopped && isHiddenByHover && animatedCursorEl) {
      isHiddenByHover = false;
      animatedCursorEl.style.display = "block";
    }
  };
})();
