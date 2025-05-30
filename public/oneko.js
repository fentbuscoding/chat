
(function oneko() {
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
    function create() {
        nekoEl.id = "oneko";
        nekoEl.style.width = "32px";
        nekoEl.style.height = "32px";
        nekoEl.style.position = "fixed";
        nekoEl.style.backgroundImage = "url('https://github.com/ekansh28/files/blob/main/oneko.gif?raw=true')"; // Updated URL
        nekoEl.style.imageRendering = "pixelated";
        nekoEl.style.left = "16px";
        nekoEl.style.top = "16px";
        nekoEl.style.zIndex = "9999"; // Ensure it's on top

        document.body.appendChild(nekoEl);

        document.onmousemove = (event) => {
            mousePosX = event.clientX;
            mousePosY = event.clientY;
        };

        // Clear previous interval if it exists, to prevent multiple instances on HMR
        if (window.onekoInterval) {
            clearInterval(window.onekoInterval);
        }
        window.onekoInterval = setInterval(frame, 100);
    }

    function setSprite(name, frame) {
        const sprite = spriteSets[name][frame % spriteSets[name].length];
        nekoEl.style.backgroundPosition = `${sprite[0] * 32}px ${
            sprite[1] * 32
        }px`;
    }

    function resetIdleAnimation() {
        idleAnimation = null;
        idleAnimationFrame = 0;
    }

    function idle() {
        idleTime += 1;

        // every ~ 20 seconds
        if (
            idleTime > 10 &&
            Math.floor(Math.random() * 200) == 0 &&
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
            return;
        }

        idleAnimation = null;
        idleAnimationFrame = 0;

        if (idleTime > 1) {
            setSprite("alert", 0);
            // count down after being alerted before moving
            idleTime = Math.min(idleTime, 7);
            idleTime -= 1;
            return;
        }

        let direction = diffY / distance > 0.5 ? "N" : "";
        direction += diffY / distance < -0.5 ? "S" : "";
        direction += diffX / distance > 0.5 ? "W" : "";
        direction += diffX / distance < -0.5 ? "E" : "";
        setSprite(direction, frameCount);

        nekoPosX -= (diffX / distance) * nekoSpeed;
        nekoPosY -= (diffY / distance) * nekoSpeed;

        // Clamp position to be within viewport
        const nekoHalfWidth = 16; // Half of nekoEl.style.width
        const nekoHalfHeight = 16; // Half of nekoEl.style.height
        
        nekoPosX = Math.max(nekoHalfWidth, Math.min(window.innerWidth - nekoHalfWidth, nekoPosX));
        nekoPosY = Math.max(nekoHalfHeight, Math.min(window.innerHeight - nekoHalfHeight, nekoPosY));


        nekoEl.style.left = `${nekoPosX - nekoHalfWidth}px`;
        nekoEl.style.top = `${nekoPosY - nekoHalfHeight}px`;
    }

    // Ensure create() is called only once
    if (document.getElementById("oneko") == null) {
        create();
    }
})();
