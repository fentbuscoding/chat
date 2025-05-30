// public/oneko.js
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
  
  const nekoSpeed = 20; 
  const nekoTickSpeed = 150; 
  let onekoIntervalId = null;

  let isOnekoGloballyStopped = true; 
  let isOnekoHiddenByHover = false;

  const spriteSets = {
    idle: [[-3, -3]], alert: [[-7, -3]],
    scratch: [[-5, 0], [-6, 0], [-7, 0]],
    tired: [[-3, -2]],
    sleeping: [[-2, 0], [-2, -1]],
    N: [[-1, -2], [-1, -3]], NE: [[0, -2], [0, -3]],
    E: [[-3, 0], [-3, -1]], SE: [[-5, -1], [-5, -2]],
    S: [[-6, -3], [-7, -2]], SW: [[-5, -3], [-6, -1]],
    W: [[-4, -2], [-4, -3]], NW: [[-1, 0], [-1, -1]],
  };

  function createNekoElementIfNotExists() {
    if (!nekoEl || !document.body.contains(nekoEl)) {
      if (nekoEl && document.body.contains(nekoEl)) {
        nekoEl.remove(); 
      }
      nekoEl = document.createElement("div");
      nekoEl.id = "oneko";
      nekoEl.style.width = "32px";
      nekoEl.style.height = "32px";
      nekoEl.style.position = "fixed";
      nekoEl.style.backgroundImage = "url('https://github.com/ekansh28/files/blob/main/oneko.gif?raw=true')";
      nekoEl.style.imageRendering = "pixelated";
      nekoEl.style.left = `${nekoPosX - 16}px`; 
      nekoEl.style.top = `${nekoPosY - 16}px`;  
      nekoEl.style.zIndex = "9999"; 
      nekoEl.style.pointerEvents = "none"; 
      nekoEl.style.willChange = "transform"; 
      document.body.appendChild(nekoEl);
    }
    nekoEl.style.display = 'none'; 
  }

  function setSprite(name, frame) {
    if (!nekoEl || !spriteSets[name]) return;
    const sprite = spriteSets[name][frame % spriteSets[name].length];
    nekoEl.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`;
  }

  function resetIdleAnimation() {
    idleAnimation = null;
    idleAnimationFrame = 0;
  }

  function idle() {
    idleTime += 1;
    if (idleTime > 10 && Math.floor(Math.random() * 200) === 0 && idleAnimation == null) {
      idleAnimation = ["sleeping", "scratch"][Math.floor(Math.random() * 2)];
    }
    switch (idleAnimation) {
      case "sleeping":
        if (idleAnimationFrame < 8) setSprite("tired", 0);
        else setSprite("sleeping", Math.floor(idleAnimationFrame / 4));
        if (idleAnimationFrame > 192) resetIdleAnimation();
        break;
      case "scratch":
        setSprite("scratch", idleAnimationFrame);
        if (idleAnimationFrame > 9) resetIdleAnimation();
        break;
      default:
        setSprite("idle", 0);
        return;
    }
    idleAnimationFrame += 1;
  }

  function onMouseMoveNeko(event) {
    mousePosX = event.clientX;
    mousePosY = event.clientY;
  }

  function frame() {
    if (isOnekoGloballyStopped || isOnekoHiddenByHover || !nekoEl || nekoEl.style.display === 'none') return;
    frameCount += 1;
    const diffX = nekoPosX - mousePosX;
    const diffY = nekoPosY - mousePosY;
    const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

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
    if (direction && spriteSets[direction]) setSprite(direction, frameCount);
    else setSprite("idle",0);

    nekoPosX -= (diffX / distance) * nekoSpeed;
    nekoPosY -= (diffY / distance) * nekoSpeed;
    
    nekoPosX = Math.max(16, Math.min(nekoPosX, window.innerWidth - 16));
    nekoPosY = Math.max(16, Math.min(nekoPosY, window.innerHeight - 16));

    nekoEl.style.transform = `translate(${nekoPosX - 16}px, ${nekoPosY - 16}px)`;
    // Use transform instead of left/top for better performance
    // nekoEl.style.left = `${nekoPosX - 16}px`;
    // nekoEl.style.top = `${nekoPosY - 16}px`;
  }
  
  window.startOriginalOneko = function() {
    if (typeof window === 'undefined') return;
    createNekoElementIfNotExists(); 
    isOnekoGloballyStopped = false;
    isOnekoHiddenByHover = false;
    if (nekoEl) nekoEl.style.display = 'block';
    
    document.removeEventListener('mousemove', onMouseMoveNeko); 
    document.addEventListener('mousemove', onMouseMoveNeko);
    if (onekoIntervalId) clearInterval(onekoIntervalId);
    onekoIntervalId = setInterval(frame, nekoTickSpeed);
  };

  window.stopOriginalOneko = function() {
    if (typeof window === 'undefined') return;
    isOnekoGloballyStopped = true;
    isOnekoHiddenByHover = false;
    if (onekoIntervalId) {
      clearInterval(onekoIntervalId);
      onekoIntervalId = null;
    }
    document.removeEventListener('mousemove', onMouseMoveNeko);
    if (nekoEl) {
      nekoEl.style.display = 'none';
    }
  };

  window.hideOriginalOneko = function() {
    if (typeof window === 'undefined') return;
    if (!isOnekoGloballyStopped && nekoEl && nekoEl.style.display !== 'none') {
      isOnekoHiddenByHover = true;
      nekoEl.style.display = 'none';
    }
  };

  window.showOriginalOneko = function() {
    if (typeof window === 'undefined') return;
    if (!isOnekoGloballyStopped && isOnekoHiddenByHover && nekoEl) {
      isOnekoHiddenByHover = false;
      nekoEl.style.display = 'block';
    }
  };
})();
