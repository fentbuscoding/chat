
// oneko.js (Neko Gato - Cat)
// https://github.com/adryd325/oneko.js

// State
let nekoEl = null;
let nekoPosX = 32;
let nekoPosY = 32;
let mousePosX = 0;
let mousePosY = 0;
let frameCount = 0;
let idleTime = 0;
let idleAnimation = null;
let idleAnimationFrame = 0;

// Config (Adjust these to change Neko's behavior)
const nekoSpeed = 20; // Speed at which Neko chases the mouse
const nekoTickSpeed = 150; // Milliseconds per frame (lower is faster animation)
const nekoSpriteSize = 32; // Size of each sprite in the spritesheet
const nekoIdleTimeout = 10; // Ticks before Neko might consider doing an idle animation
const nekoIdleAnimationChance = 200; // 1 in X chance per tick to start an idle animation
const nekoAlertDistance = 48; // Distance at which Neko becomes alert

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
  nekoEl = document.createElement("div");
  nekoEl.id = "oneko";
  nekoEl.style.width = `${nekoSpriteSize}px`;
  nekoEl.style.height = `${nekoSpriteSize}px`;
  nekoEl.style.position = "fixed";
  // Ensure you use the ?raw=true for direct image linking from GitHub
  nekoEl.style.backgroundImage = "url('https://github.com/ekansh28/files/blob/main/oneko.gif?raw=true')";
  nekoEl.style.imageRendering = "pixelated";
  nekoEl.style.left = `${nekoPosX - nekoSpriteSize / 2}px`;
  nekoEl.style.top = `${nekoPosY - nekoSpriteSize / 2}px`;
  nekoEl.style.zIndex = "9999"; // Ensure Neko is on top
  nekoEl.style.pointerEvents = "none"; // Ensure Neko doesn't interfere with mouse events

  document.body.appendChild(nekoEl);

  document.addEventListener("mousemove", (event) => {
    mousePosX = event.clientX;
    mousePosY = event.clientY;
  });
}

function setSprite(name, frame) {
  if (!nekoEl || !spriteSets[name]) return;
  const sprite = spriteSets[name][frame % spriteSets[name].length];
  nekoEl.style.backgroundPosition = `${sprite[0] * nekoSpriteSize}px ${
    sprite[1] * nekoSpriteSize
  }px`;
}

function resetIdleAnimation() {
  idleAnimation = null;
  idleAnimationFrame = 0;
}

function idle() {
  idleTime += 1;

  if (
    idleTime > nekoIdleTimeout &&
    Math.floor(Math.random() * nekoIdleAnimationChance) === 0 &&
    idleAnimation === null
  ) {
    idleAnimation = ["sleeping", "scratch"][
      Math.floor(Math.random() * 2)
    ];
  }

  switch (idleAnimation) {
    case "sleeping":
      if (idleAnimationFrame < 8) {
        setSprite("tired", 0);
      } else {
        setSprite("sleeping", Math.floor((idleAnimationFrame - 8) / 4));
      }
      if (idleAnimationFrame > 192 + 8) { // Adjusted for tired phase
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

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function frame() {
  if (!nekoEl) return;
  frameCount += 1;
  const diffX = nekoPosX - mousePosX;
  const diffY = nekoPosY - mousePosY;
  const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

  if (distance < nekoSpeed || distance < nekoAlertDistance) {
    idle();
    return;
  }

  idleAnimation = null;
  idleAnimationFrame = 0;

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
  
  if (direction === "") { // If no clear primary direction, default to idle or alert
    if (distance < nekoAlertDistance * 2) { // slightly larger radius for just being near
        setSprite("alert",0);
    } else {
        setSprite("idle", 0);
    }
  } else {
    setSprite(direction, frameCount);
  }


  nekoPosX -= (diffX / distance) * nekoSpeed;
  nekoPosY -= (diffY / distance) * nekoSpeed;

  // Clamp Neko's position to be within the viewport
  nekoPosX = clamp(nekoPosX, nekoSpriteSize / 2, window.innerWidth - nekoSpriteSize / 2);
  nekoPosY = clamp(nekoPosY, nekoSpriteSize / 2, window.innerHeight - nekoSpriteSize / 2);


  nekoEl.style.left = `${nekoPosX - nekoSpriteSize / 2}px`;
  nekoEl.style.top = `${nekoPosY - nekoSpriteSize / 2}px`;
}

// Expose functions to global scope for external control
window.startOneko = () => {
  if (document.getElementById("oneko")) return; // Don't start if already running
  createNekoElement();
  if (window.onekoInterval) clearInterval(window.onekoInterval); // Clear previous interval if any
  window.onekoInterval = setInterval(frame, nekoTickSpeed);
};

window.stopOneko = () => {
  if (window.onekoInterval) clearInterval(window.onekoInterval);
  window.onekoInterval = null;
  if (nekoEl) {
    nekoEl.remove();
    nekoEl = null;
  }
};

// Removed IIFE to prevent auto-start. Will be started by layout.tsx if needed.
// (function oneko() { ... })();
