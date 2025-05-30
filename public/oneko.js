
// oneko.js - Neko cat that follows your cursor with sprite animations

(function() {
  if (window.hasRunOneko) {
    // console.log("Original Oneko: Already initialized or running, skipping re-initialization.");
    return;
  }
  window.hasRunOneko = true;

  const nekoEl = document.createElement("div");
  let nekoPosX = 32;
  let nekoPosY = 32;
  let mousePosX = 0;
  let mousePosY = 0;
  let frameCount = 0;
  let idleTime = 0;
  let idleAnimation = null;
  let idleAnimationFrame = 0;
  const nekoSpeed = 10; // Original speed
  const nekoTickSpeed = 100; // Original tick speed for animation

  let isNekoActive = false;
  let onekoIntervalId = null;

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
    if (document.getElementById("oneko")) return; // Already exists

    nekoEl.id = "oneko";
    nekoEl.style.width = "32px";
    nekoEl.style.height = "32px";
    nekoEl.style.position = "fixed";
    nekoEl.style.backgroundImage = "url('https://github.com/ekansh28/files/blob/main/oneko.gif?raw=true')";
    nekoEl.style.imageRendering = "pixelated";
    nekoEl.style.left = "16px"; // Initial position
    nekoEl.style.top = "16px";
    nekoEl.style.zIndex = "9999"; // Keep on top
    nekoEl.style.pointerEvents = "none"; // Prevent interference with mouse events
    document.body.appendChild(nekoEl);
    nekoEl.style.display = "block"; // Ensure it's visible
  }

  function setSprite(name, frame) {
    if (!isNekoActive || !spriteSets[name]) return;
    const sprite = spriteSets[name][frame % spriteSets[name].length];
    nekoEl.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`;
  }

  function resetIdleAnimation() {
    idleAnimation = null;
    idleAnimationFrame = 0;
  }

  function nekoIdle() {
    if (!isNekoActive) return;
    idleTime += 1;

    if (idleTime > 10 && Math.floor(Math.random() * 200) === 0 && idleAnimation == null) {
      idleAnimation = ["sleeping", "scratch"][Math.floor(Math.random() * 2)];
    }

    switch (idleAnimation) {
      case "sleeping":
        if (idleAnimationFrame < 8) {
          setSprite("tired", 0);
          break;
        }
        setSprite("sleeping", Math.floor(idleAnimationFrame / 4));
        if (idleAnimationFrame > 192) {
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
    if (!isNekoActive) return;
    frameCount += 1;
    const diffX = nekoPosX - mousePosX;
    const diffY = nekoPosY - mousePosY;
    const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

    if (distance < nekoSpeed || distance < 48) {
      nekoIdle();
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
    if (direction) {
      setSprite(direction, frameCount);
    } else {
      setSprite("idle", 0); // Fallback if no clear direction
    }
    

    nekoPosX -= (diffX / distance) * nekoSpeed;
    nekoPosY -= (diffY / distance) * nekoSpeed;

    // Basic viewport clamping
    nekoPosX = Math.max(16, Math.min(nekoPosX, window.innerWidth - 16));
    nekoPosY = Math.max(16, Math.min(nekoPosY, window.innerHeight - 16));

    nekoEl.style.left = `${nekoPosX - 16}px`;
    nekoEl.style.top = `${nekoPosY - 16}px`;
  }

  function mouseMoveHandler(event) {
    mousePosX = event.clientX;
    mousePosY = event.clientY;
  }

  window.startOriginalOneko = function() {
    if (isNekoActive) return;
    createNekoElement(); // Ensures nekoEl is created and appended if not already
    nekoEl.style.display = "block";
    isNekoActive = true;
    document.addEventListener("mousemove", mouseMoveHandler);
    if (onekoIntervalId) clearInterval(onekoIntervalId); // Clear previous interval if any
    onekoIntervalId = setInterval(frame, nekoTickSpeed);
    // Reset position to be near the cursor initially
    if (mousePosX > 0 && mousePosY > 0) { // Check if mouse position is known
        nekoPosX = mousePosX;
        nekoPosY = mousePosY;
    } else { // Fallback to default if mouse hasn't moved yet
        nekoPosX = 32;
        nekoPosY = 32;
    }
    // Initialize sprite
    setSprite("idle", 0);
    // console.log("Original Oneko: Started");
  };

  window.stopOriginalOneko = function() {
    if (!isNekoActive) return;
    isNekoActive = false;
    document.removeEventListener("mousemove", mouseMoveHandler);
    if (onekoIntervalId) {
      clearInterval(onekoIntervalId);
      onekoIntervalId = null;
    }
    if (document.getElementById("oneko")) {
      nekoEl.style.display = "none"; // Hide instead of removing to keep state
    }
    // console.log("Original Oneko: Stopped");
  };

  // Optional: Auto-start if a flag is set, or defer to explicit call
  // Example for debugging: if (localStorage.getItem('nekoActive') === 'true') window.startOriginalOneko();
})();
