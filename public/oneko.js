
// oneko.js - Neko cat follows your mouse
(function() {
  const nekoEl = document.createElement("div");
  let nekoPosX = 32;
  let nekoPosY = 32;
  let mousePosX = 0;
  let mousePosY = 0;
  let frameCount = 0;
  let idleTime = 0;
  let idleAnimation = null;
  let idleAnimationFrame = 0;
  const nekoSpeed = 10;
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

  let isCreated = false;
  let animationFrameId;

  function setSprite(name, frame) {
    const sprite = spriteSets[name][frame % spriteSets[name].length];
    nekoEl.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`;
  }

  function resetIdleAnimation() {
    idleAnimation = null;
    idleAnimationFrame = 0;
  }

  function idle() {
    idleTime += 1;

    if (
      idleTime > 10 &&
      Math.floor(Math.random() * 200) === 0 &&
      idleAnimation == null
    ) {
      idleAnimation = ["sleeping", "scratch"][
        Math.floor(Math.random() * 2)
      ];
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
    frameCount += 1;
    const diffX = nekoPosX - mousePosX;
    const diffY = nekoPosY - mousePosY;
    const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

    if (distance < nekoSpeed || distance < 48) {
      idle();
      animationFrameId = requestAnimationFrame(frame);
      return;
    }

    idleAnimation = null;
    idleAnimationFrame = 0;

    if (idleTime > 1) {
      setSprite("alert", 0);
      idleTime = Math.min(idleTime, 7);
      idleTime -= 1;
      animationFrameId = requestAnimationFrame(frame);
      return;
    }

    let direction = diffY / distance > 0.5 ? "N" : "";
    direction += diffY / distance < -0.5 ? "S" : "";
    direction += diffX / distance > 0.5 ? "W" : "";
    direction += diffX / distance < -0.5 ? "E" : "";
    setSprite(direction, frameCount);

    nekoPosX -= (diffX / distance) * nekoSpeed;
    nekoPosY -= (diffY / distance) * nekoSpeed;
    
    // Clamp position to viewport
    const nekoRect = nekoEl.getBoundingClientRect();
    nekoPosX = Math.max(nekoRect.width / 2, Math.min(window.innerWidth - nekoRect.width / 2, nekoPosX));
    nekoPosY = Math.max(nekoRect.height / 2, Math.min(window.innerHeight - nekoRect.height / 2, nekoPosY));

    nekoEl.style.left = `${nekoPosX - 16}px`;
    nekoEl.style.top = `${nekoPosY - 16}px`;

    animationFrameId = requestAnimationFrame(frame);
  }
  
  function onMouseMove(event) {
    mousePosX = event.clientX;
    mousePosY = event.clientY;
  }

  window.startOneko = function() {
    if (isCreated) return; // Don't create multiple instances
    
    nekoEl.id = "oneko";
    nekoEl.style.width = "32px";
    nekoEl.style.height = "32px";
    nekoEl.style.position = "fixed";
    nekoEl.style.backgroundImage = "url('https://github.com/ekansh28/files/blob/main/oneko.gif?raw=true')";
    nekoEl.style.imageRendering = "pixelated";
    nekoEl.style.left = "16px"; // Initial position
    nekoEl.style.top = "16px";  // Initial position
    nekoEl.style.zIndex = "9999"; // Keep on top

    // Set initial position to a corner or center
    nekoPosX = window.innerWidth - 50;
    nekoPosY = window.innerHeight - 50;
    mousePosX = nekoPosX; // Start idle
    mousePosY = nekoPosY; // Start idle


    document.body.appendChild(nekoEl);
    document.addEventListener("mousemove", onMouseMove);
    
    animationFrameId = requestAnimationFrame(frame);
    isCreated = true;
  };

  window.stopOneko = function() {
    if (!isCreated) return;
    
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    document.removeEventListener("mousemove", onMouseMove);
    if (nekoEl.parentNode) {
      nekoEl.parentNode.removeChild(nekoEl);
    }
    isCreated = false;
  };

})();
