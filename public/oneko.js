
// oneko.js - Neko cat cursor follower (Sprite Sheet Version)
(function onekoSprite() {
  let nekoEl = null;
  let nekoPosX = 32;
  let nekoPosY = 32;
  let mousePosX = 0;
  let mousePosY = 0;
  let frameCount = 0;
  let idleTime = 0;
  let idleAnimation = null;
  let idleAnimationFrame = 0;
  const nekoSpeed = 20; // Keep speed as per user request
  const nekoTickSpeed = 150; // Keep animation speed as per user request
  let onekoIntervalId = null;

  let isOnekoGloballyStopped = true;
  let isOnekoHiddenByHover = false;

  const spriteSets = {
    idle: [[-3, -3]],
    alert: [[-7, -3]],
    scratch: [
      [-5, 0],
      [-6, 0],
      [-7, 0],
    ],
    tired: [[-3, -2]],
    sleeping: [
      [-2, 0],
      [-2, -1],
    ],
    N: [
      [-1, -2],
      [-1, -3],
    ],
    NE: [
      [0, -2],
      [0, -3],
    ],
    E: [
      [-3, 0],
      [-3, -1],
    ],
    SE: [
      [-5, -1],
      [-5, -2],
    ],
    S: [
      [-6, -3],
      [-7, -2],
    ],
    SW: [
      [-5, -3],
      [-6, -1],
    ],
    W: [
      [-4, -2],
      [-4, -3],
    ],
    NW: [
      [-1, 0],
      [-1, -1],
    ],
  };

  function createNekoElement() {
    if (!nekoEl) {
      nekoEl = document.createElement("div");
      nekoEl.id = "oneko";
      nekoEl.style.width = "32px";
      nekoEl.style.height = "32px";
      nekoEl.style.position = "fixed";
      nekoEl.style.backgroundImage = "url('/oneko.gif)";
      nekoEl.style.imageRendering = "pixelated";
      nekoEl.style.zIndex = "9999";
      nekoEl.style.pointerEvents = "none"; // Neko itself should not capture mouse events
      nekoEl.style.willChange = "transform";
      document.body.appendChild(nekoEl);
    }
    // Initial position on screen, can be adjusted
    nekoEl.style.left = `${nekoPosX}px`;
    nekoEl.style.top = `${nekoPosY}px`;
    nekoEl.style.display = "block";
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

  function idleNeko() {
    if (isOnekoGloballyStopped || isOnekoHiddenByHover || !nekoEl) return;
    idleTime += 1;

    if (idleTime > 10 && Math.floor(Math.random() * 200) === 0 && idleAnimation == null) {
      idleAnimation = ["sleeping", "scratch"][Math.floor(Math.random() * 2)];
    }

    switch (idleAnimation) {
      case "sleeping":
        if (idleAnimationFrame < 8) {
          setSprite("tired", 0);
        } else {
          setSprite("sleeping", Math.floor(idleAnimationFrame / 4));
        }
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
    if (isOnekoGloballyStopped || isOnekoHiddenByHover || !nekoEl) return;

    frameCount += 1;
    const diffX = nekoPosX - mousePosX;
    const diffY = nekoPosY - mousePosY;
    const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

    if (distance < nekoSpeed || distance < 48) {
      idleNeko();
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
    
    if (direction === "") { // If no strong direction, default to idle or a diagonal
        const absDiffX = Math.abs(diffX);
        const absDiffY = Math.abs(diffY);
        if (absDiffX > absDiffY) {
            direction = diffX > 0 ? "W" : "E";
        } else if (absDiffY > absDiffX) {
            direction = diffY > 0 ? "N" : "S";
        } else {
            direction = "idle"; // Fallback if perfectly diagonal or still
        }
    }
    if (spriteSets[direction]) {
        setSprite(direction, frameCount);
    } else {
        setSprite("idle", 0); // Fallback if direction is invalid
    }


    nekoPosX -= (diffX / distance) * nekoSpeed;
    nekoPosY -= (diffY / distance) * nekoSpeed;

    // Clamp Neko's position to be within the viewport
    nekoPosX = Math.max(0, Math.min(nekoPosX, window.innerWidth - 32));
    nekoPosY = Math.max(0, Math.min(nekoPosY, window.innerHeight - 32));

    // Align top-left of Neko sprite with its calculated position
    nekoEl.style.transform = `translate(${nekoPosX}px, ${nekoPosY}px)`;
  }

  function onMouseMoveNeko(event) {
    mousePosX = event.clientX;
    mousePosY = event.clientY;
  }

  window.startOriginalOneko = function () {
    if (!onekoIntervalId) { // Only start if not already running
      createNekoElement();
      isOnekoGloballyStopped = false;
      isOnekoHiddenByHover = false;
      if (nekoEl) nekoEl.style.display = "block";
      document.addEventListener("mousemove", onMouseMoveNeko);
      onekoIntervalId = setInterval(frame, nekoTickSpeed);
    } else if (isOnekoGloballyStopped && nekoEl) { // Restart if stopped
      isOnekoGloballyStopped = false;
      isOnekoHiddenByHover = false;
      nekoEl.style.display = "block";
      document.addEventListener("mousemove", onMouseMoveNeko); // Re-add listener if removed
       if (!onekoIntervalId) { // Ensure interval is running
           onekoIntervalId = setInterval(frame, nekoTickSpeed);
       }
    } else if (nekoEl) { // If already running but maybe hidden
        isOnekoGloballyStopped = false; // Ensure it's not marked as stopped
        isOnekoHiddenByHover = false;
        nekoEl.style.display = "block";
    }
  };

  window.stopOriginalOneko = function () {
    isOnekoGloballyStopped = true;
    if (nekoEl) {
      nekoEl.style.display = "none";
    }
    if (onekoIntervalId) {
      clearInterval(onekoIntervalId);
      onekoIntervalId = null;
    }
    document.removeEventListener("mousemove", onMouseMoveNeko);
  };

  window.hideOriginalOneko = function () {
    if (!isOnekoGloballyStopped && nekoEl) {
      isOnekoHiddenByHover = true;
      nekoEl.style.display = "none";
    }
  };

  window.showOriginalOneko = function () {
    if (!isOnekoGloballyStopped && isOnekoHiddenByHover && nekoEl) {
      isOnekoHiddenByHover = false;
      nekoEl.style.display = "block";
    }
  };
})();
