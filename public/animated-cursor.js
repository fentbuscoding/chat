// public/animated-cursor.js
(function() {
  let animatedCursorEl = null;
  let animationFrameId = null;
  let mousePosX = 0;
  let mousePosY = 0;
  let isGloballyStopped = true; // True if stopAnimatedGifCursor was called, start stopped
  let isHiddenByHover = false;   // True if hidden due to hover over interactive element

  const cursorWidth = 32; 
  const cursorHeight = 32;

  function createCursorDiv(gifUrl) {
    if (!animatedCursorEl) {
      animatedCursorEl = document.createElement("div");
      animatedCursorEl.id = "animated-gif-cursor";
      animatedCursorEl.style.position = "fixed";
      animatedCursorEl.style.width = `${cursorWidth}px`;
      animatedCursorEl.style.height = `${cursorHeight}px`;
      animatedCursorEl.style.pointerEvents = "none";
      animatedCursorEl.style.zIndex = "10000"; 
      animatedCursorEl.style.imageRendering = "pixelated"; 
      animatedCursorEl.style.willChange = "transform";
      document.body.appendChild(animatedCursorEl);
    }
    animatedCursorEl.style.backgroundImage = `url('${gifUrl}')`;
    animatedCursorEl.style.backgroundRepeat = 'no-repeat';
    animatedCursorEl.style.backgroundPosition = 'center center';
    animatedCursorEl.style.backgroundSize = 'contain'; 
    animatedCursorEl.style.display = 'none'; // Start hidden
  }

  function updatePosition() {
    if (animatedCursorEl && animatedCursorEl.style.display === 'block') {
      animatedCursorEl.style.transform = `translate(${mousePosX - cursorWidth / 2}px, ${mousePosY - cursorHeight / 2}px)`;
    }
    if (!isGloballyStopped) { 
        animationFrameId = requestAnimationFrame(updatePosition);
    }
  }

  function onMouseMove(event) {
    mousePosX = event.clientX;
    mousePosY = event.clientY;
  }

  window.startAnimatedGifCursor = function(gifUrl) {
    if (typeof window === 'undefined') return;
    isGloballyStopped = false;
    isHiddenByHover = false; 
    createCursorDiv(gifUrl);
    if (animatedCursorEl) {
      animatedCursorEl.style.display = 'block';
    }
    document.removeEventListener('mousemove', onMouseMove); 
    document.addEventListener('mousemove', onMouseMove);
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(updatePosition);
  };

  window.stopAnimatedGifCursor = function() {
    if (typeof window === 'undefined') return;
    isGloballyStopped = true;
    isHiddenByHover = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    document.removeEventListener('mousemove', onMouseMove);
    if (animatedCursorEl) {
      animatedCursorEl.style.display = 'none';
    }
  };

  window.hideAnimatedGifCursor = function() {
    if (typeof window === 'undefined') return;
    if (!isGloballyStopped && animatedCursorEl && animatedCursorEl.style.display !== 'none') {
      isHiddenByHover = true;
      animatedCursorEl.style.display = 'none';
    }
  };

  window.showAnimatedGifCursor = function() {
    if (typeof window === 'undefined') return;
    if (!isGloballyStopped && isHiddenByHover && animatedCursorEl) {
      isHiddenByHover = false;
      animatedCursorEl.style.display = 'block';
    }
  };
})();
