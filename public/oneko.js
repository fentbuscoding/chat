
(function onekoIIFE() {
    let nekoEl = null; // Will hold the Neko div
    let nekoPosX = 32;
    let nekoPosY = 32;
    let mousePosX = 0;
    let mousePosY = 0;
    let frameCount = 0;
    let idleTime = 0;
    let idleAnimation = null;
    let idleAnimationFrame = 0;
    const nekoSpeed = 20; // As per your last request
    const nekoTickSpeed = 150; // Animation frame rate
    let onekoIntervalId = null; // Stores the interval ID

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
        let el = document.getElementById("oneko");
        if (el) {
            return el;
        }
        el = document.createElement("div");
        el.id = "oneko";
        el.style.width = "32px";
        el.style.height = "32px";
        el.style.position = "fixed";
        el.style.backgroundImage = "url('https://github.com/ekansh28/files/blob/main/oneko.gif?raw=true')";
        el.style.imageRendering = "pixelated";
        el.style.left = "16px"; // Initial position
        el.style.top = "16px";  // Initial position
        el.style.zIndex = "9999"; // Try to keep on top
        el.style.pointerEvents = "none"; // So it doesn't interfere with mouse events on other elements
        return el;
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
        if (!nekoEl) return;
        frameCount += 1;
        const diffX = nekoPosX - mousePosX;
        const diffY = nekoPosY - mousePosY;
        const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

        if (distance < nekoSpeed || distance < 48) {
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

        let newDirection = ""; // Use newDirection to avoid conflict with built-in 'direction'
        if (diffY / distance > 0.5) newDirection += "N";
        if (diffY / distance < -0.5) newDirection += "S";
        if (diffX / distance > 0.5) newDirection += "W";
        if (diffX / distance < -0.5) newDirection += "E";
        
        if (newDirection) { // Ensure direction is not empty
          setSprite(newDirection, frameCount);
        } else {
          // Fallback if direction is ambiguous, e.g., directly on top
          setSprite("idle", 0); 
        }


        nekoPosX -= (diffX / distance) * nekoSpeed;
        nekoPosY -= (diffY / distance) * nekoSpeed;

        // Basic viewport clamping
        nekoPosX = Math.max(16, Math.min(nekoPosX, window.innerWidth - 16));
        nekoPosY = Math.max(16, Math.min(nekoPosY, window.innerHeight - 16));

        nekoEl.style.left = `${nekoPosX - 16}px`;
        nekoEl.style.top = `${nekoPosY - 16}px`;
    }

    window.startOneko = function() {
        if (onekoIntervalId !== null) { // Already running
            return;
        }

        nekoEl = createNekoElement();
        if (!nekoEl.parentNode) {
            document.body.appendChild(nekoEl);
        }
        
        // Initialize mouse position if not already set by a move event
        if (mousePosX === 0 && mousePosY === 0) {
            // Attempt to center initially or use last known if available
            // This is a simple fallback, might need refinement if mouse never moves
            mousePosX = window.innerWidth / 2;
            mousePosY = window.innerHeight / 2;
        }


        nekoPosX = mousePosX; // Start Neko at current or last known mouse position
        nekoPosY = mousePosY;
        nekoEl.style.left = `${nekoPosX - 16}px`;
        nekoEl.style.top = `${nekoPosY - 16}px`;
        
        frameCount = 0;
        idleTime = 0;
        resetIdleAnimation();

        document.addEventListener('mousemove', updateMousePosition);
        onekoIntervalId = setInterval(frame, nekoTickSpeed);
    };

    window.stopOneko = function() {
        if (onekoIntervalId !== null) {
            clearInterval(onekoIntervalId);
            onekoIntervalId = null;
        }
        if (nekoEl && nekoEl.parentNode) {
            nekoEl.parentNode.removeChild(nekoEl);
            // nekoEl = null; // No need to nullify, createNekoElement handles finding/creating
        }
        document.removeEventListener('mousemove', updateMousePosition);
    };

    function updateMousePosition(event) {
        mousePosX = event.clientX;
        mousePosY = event.clientY;
    }

    // The script no longer auto-starts. It relies on window.startOneko() being called.
})();
