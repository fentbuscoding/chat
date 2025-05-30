
// oneko.js - Neko Cat Follows Mouse Cursor
// Adapted from https://github.com/adryd/oneko.js

(function() {
  let nekoEl = null;
  let nekoPosX = 32;
  let nekoPosY = 32;
  let mousePosX = 0;
  let mousePosY = 0;
  let frameCount = 0;
  let idleTime = 0;
  let idleAnimation = null;
  let idleAnimationFrame = 0;
  const nekoSpeed = 7; // Default: 10 - Reduced for slower movement
  const nekoTickSpeed = 150; // Default: 100 - Increased for slower animation
  let onekoIntervalId = null; // To store the interval ID
  let isRunning = false;

  // Sprite positions (x, y) in pixels from the top-left of oneko.gif
  const spriteSets = {
    idle: [[-3, -3]],
    alert: [[-7, -3]],
    scratch: [[-5, 0], [-6, 0], [-7, 0]],
    tired: [[-3, -2]],
    sleeping: [[-2, 0], [-2, -1]],
    N: [[-1, -2], [-1, -3]],
    NE: [[0, -2], [0, -3]],
    E: [[-3, 0], [-3, -1]],
    SE: [[-5, -1], [-5, -2]],
    S: [[-6, -3], [-7, -2]],
    SW: [[-5, -3], [-6, -1]],
    W: [[-4, -2], [-4, -3]],
    NW: [[-1, 0], [-1, -1]],
  };

  function createNekoElement() {
    if (document.getElementById("oneko")) {
      nekoEl = document.getElementById("oneko"); // Use existing if it's there (e.g. after hot reload)
      return;
    }
    nekoEl = document.createElement("div");
    nekoEl.id = "oneko";
    nekoEl.style.width = "32px";
    nekoEl.style.height = "32px";
    nekoEl.style.position = "fixed";
    // Use the direct GitHub raw link for the image
    nekoEl.style.backgroundImage = "url('https://github.com/ekansh28/files/blob/main/oneko.gif?raw=true')";
    nekoEl.style.imageRendering = "pixelated";
    nekoEl.style.left = "16px"; // Initial position
    nekoEl.style.top = "16px";  // Initial position
    nekoEl.style.zIndex = "9999"; // Try to keep Neko on top
    nekoEl.style.pointerEvents = "none"; // So it doesn't interfere with mouse events on other elements
    document.body.appendChild(nekoEl);
  }

  function setSprite(name, frame) {
    if (!nekoEl) return;
    const sprite = spriteSets[name][frame % spriteSets[name].length];
    nekoEl.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`;
  }

  function resetIdleAnimation() {
    idleAnimation = null;
    idleAnimationFrame = 0;
  }

  function idle() {
    idleTime += 1;

    // Every ~20 seconds or so, Neko may do something
    if (idleTime > 10 && Math.random() < 0.005 && idleAnimation == null) {
      const availableIdleAnimations = ["sleeping", "scratch"];
      idleAnimation = availableIdleAnimations[Math.floor(Math.random() * availableIdleAnimations.length)];
    }

    switch (idleAnimation) {
      case "sleeping":
        if (idleAnimationFrame < 8) {
          setSprite("tired", 0);
        } else {
          setSprite("sleeping", Math.floor(idleAnimationFrame / 4));
        }
        if (idleAnimationFrame > 192) { // Longer sleep
          resetIdleAnimation();
        }
        break;
      case "scratch":
        setSprite("scratch", idleAnimationFrame);
        if (idleAnimationFrame > 9) {
          resetIdleAnimation();
        }
        break;
      default:
        setSprite("idle", 0);
        return;
    }
    idleAnimationFrame += 1;
  }

  function frame() {
    if (!nekoEl) return;
    frameCount += 1;
    const diffX = nekoPosX - mousePosX;
    const diffY = nekoPosY - mousePosY;
    const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

    // If close to cursor or moving very slowly, consider idle
    if (distance < nekoSpeed || distance < 48) {
      idle();
      return;
    }

    resetIdleAnimation();

    if (idleTime > 1) {
      setSprite("alert", 0);
      idleTime = Math.min(idleTime, 7);
      idleTime -= 1;
      return;
    }

    let direction = "";
    if (diffY / distance > 0.5) direction += "N";
    if (diffY / distance < -0.5) direction += "S";
    if (diffX / distance > 0.5) direction += "W";
    if (diffX / distance < -0.5) direction += "E";
    
    if (direction && spriteSets[direction]) {
        setSprite(direction, frameCount);
    } else {
        setSprite("idle", 0); // Fallback if direction is somehow invalid
    }


    nekoPosX -= (diffX / distance) * nekoSpeed;
    nekoPosY -= (diffY / distance) * nekoSpeed;

    // Clamp Neko's position to be within the viewport
    nekoPosX = Math.max(16, Math.min(nekoPosX, window.innerWidth - 16));
    nekoPosY = Math.max(16, Math.min(nekoPosY, window.innerHeight - 16));

    nekoEl.style.left = `${nekoPosX - 16}px`;
    nekoEl.style.top = `${nekoPosY - 16}px`;
  }

  function startOneko() {
    if (isRunning || document.getElementById("oneko")) return; // Don't start if already running or element exists
    
    createNekoElement();
    
    document.addEventListener('mousemove', onMouseMove);
    onekoIntervalId = setInterval(frame, nekoTickSpeed);
    isRunning = true;
  }

  function stopOneko() {
    if (!isRunning && !document.getElementById("oneko")) return;

    if (onekoIntervalId) {
      clearInterval(onekoIntervalId);
      onekoIntervalId = null;
    }
    document.removeEventListener('mousemove', onMouseMove);
    if (nekoEl) {
      if (nekoEl.parentNode) {
        nekoEl.parentNode.removeChild(nekoEl);
      }
      nekoEl = null;
    }
    isRunning = false;
     // Reset positions for next start
    nekoPosX = 32;
    nekoPosY = 32;
    frameCount = 0;
    idleTime = 0;
    resetIdleAnimation();
  }

  function onMouseMove(event) {
    mousePosX = event.clientX;
    mousePosY = event.clientY;
  }

  // Expose controls to the window object
  window.startOneko = startOneko;
  window.stopOneko = stopOneko;

  // Check if it should start based on localStorage on script load
  // This part is now handled by layout.tsx, but we keep the functions exposed.
  // if (localStorage.getItem('nekoActive') === 'true') {
  //  startOneko();
  // }

})();
