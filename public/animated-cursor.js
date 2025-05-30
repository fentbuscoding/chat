
// animated-cursor.js - Generic animated GIF cursor follower

(function() {
  if (window.hasRunAnimatedGifCursor) {
    // console.log("Animated GIF Cursor: Already initialized, skipping.");
    return;
  }
  window.hasRunAnimatedGifCursor = true;

  let followerEl = null;
  let isFollowing = false;
  let currentGifUrl = null;

  function createFollowerElement() {
    if (document.getElementById("animated-gif-cursor-follower")) {
      followerEl = document.getElementById("animated-gif-cursor-follower");
      return;
    }
    followerEl = document.createElement("div");
    followerEl.id = "animated-gif-cursor-follower";
    followerEl.style.position = "fixed";
    followerEl.style.width = "32px"; // Default size, can be overridden by GIF
    followerEl.style.height = "32px";
    followerEl.style.backgroundRepeat = "no-repeat";
    followerEl.style.backgroundPosition = "center";
    followerEl.style.backgroundSize = "contain"; // Or "auto" or "cover" depending on desired effect
    followerEl.style.pointerEvents = "none"; // Crucial
    followerEl.style.zIndex = "9998"; // Below Neko if both active, adjust as needed
    followerEl.style.display = "none"; // Initially hidden
    document.body.appendChild(followerEl);
  }

  function updatePosition(event) {
    if (!isFollowing || !followerEl) return;
    // Adjust to center the GIF on the cursor or offset as desired
    followerEl.style.left = `${event.clientX}px`;
    followerEl.style.top = `${event.clientY}px`;
  }

  window.startAnimatedGifCursor = function(gifUrl) {
    if (!followerEl) {
      createFollowerElement();
    }
    
    if (isFollowing && currentGifUrl === gifUrl) return; // Already running with this GIF

    currentGifUrl = gifUrl;
    followerEl.style.backgroundImage = `url('${gifUrl}')`;
    followerEl.style.display = "block";
    
    if (!isFollowing) {
      document.addEventListener("mousemove", updatePosition);
      document.addEventListener("mouseenter", () => { if(followerEl) followerEl.style.display = "block"; });
      document.addEventListener("mouseleave", () => { if(followerEl) followerEl.style.display = "none"; });
    }
    isFollowing = true;
    document.body.style.cursor = 'none'; // Hide system cursor
    // console.log("Animated GIF Cursor: Started with", gifUrl);
  };

  window.stopAnimatedGifCursor = function() {
    if (!isFollowing || !followerEl) return;
    isFollowing = false;
    currentGifUrl = null;
    followerEl.style.display = "none";
    followerEl.style.backgroundImage = "none";
    document.removeEventListener("mousemove", updatePosition);
    // document.body.style.cursor = 'auto'; // Restore system cursor only if Neko isn't also active
    // console.log("Animated GIF Cursor: Stopped");
  };
  
  // Ensure element is created on script load so it's available
  if (!followerEl) {
    createFollowerElement();
  }
})();
