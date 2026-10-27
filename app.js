(() => {
  "use strict";

  // =========================================================================
  // DOM CONTAINERS & VIEWS
  // =========================================================================
  const container = document.getElementById("white-container");
  const viewIntro = document.getElementById("view-intro");
  const viewPlaying = document.getElementById("view-playing");
  const viewResults = document.getElementById("view-results");
  const rewardCard = document.getElementById("reward-card");

  // Game UI & HUD Elements
  const playNowBtn = document.getElementById("play-now-btn");
  const playAgainBtn = document.getElementById("play-again-btn");
  const resetBtn = document.getElementById("reset-btn");
  const gameTimerEl = document.getElementById("game-timer");
  const gameScoreEl = document.getElementById("game-score");
  const gamePlayArea = document.getElementById("game-play-area");
  const fallingItemsLayer = document.getElementById("falling-items-layer");
  const playerBucket = document.getElementById("player-bucket");
  const bucketDragIndicator = document.getElementById("bucket-drag-indicator");

  // Results & Offer Display Elements
  const interstitialScoreVal = document.getElementById("interstitial-score-val");
  const interstitialScoreDesc = document.getElementById("interstitial-score-desc");
  const rewardScoreNumber = document.getElementById("reward-score-number");
  const rewardScoreSummary = document.getElementById("reward-score-summary");
  const offerTitle = document.getElementById("offer-title");
  const offerDescription = document.getElementById("offer-description");

  // Full-Screen Confetti Celebration Overlay
  const fullscreenConfettiOverlay = document.getElementById("fullscreen-confetti-overlay");

  // Demo Offers Configuration
  const demoOffers = window.SOOFI_MANDI_DEMO_OFFERS || window.SOOfiMandiOffers || [];
  let currentOffer = null;

  // Game Parameters
  const GAME_DURATION = 12.0; // 12 seconds round

  // Game Runtime State (Unlimited scoring, round ends strictly on timer expiry)
  let gameState = "intro"; // "intro" | "playing" | "results" | "revealed"
  let timeLeft = GAME_DURATION;
  let score = 0;
  let gameAnimId = null;
  let lastFrameTime = 0;
  let spawnCooldown = 0;
  let fallingItems = [];
  let confettiCleanupTimer = null;

  // Bucket Physics State
  let bucketX = 0; // Horizontal center of bucket relative to play area
  let lastBucketX = 0;
  let isDraggingBucket = false;
  let hasMovedBucket = false;

  /**
   * =========================================================================
   * FOOD ASSETS CONFIGURATION (Future Real Photography Support)
   * =========================================================================
   * To drop in real transparent PNG or WebP photographs:
   * 1. Place the transparent image files into the `assets/` folder.
   * 2. Set the `image` property below to the relative path (e.g. "assets/mandi-chicken.png").
   * 3. The game engine loads the image with `object-fit: contain`.
   * 4. If the image is not found or fails to load, the vector SVG fallback renders seamlessly!
   * =========================================================================
   */
  const FOOD_CONFIG = [
    {
      id: "roasted-chicken",
      name: "Roasted Chicken",
      image: "", // Configure real image path here (e.g. "assets/food-chicken.png")
      fallbackSvg: `<svg viewBox="0 0 36 36"><defs><linearGradient id="g-roast" x1="0%" y1="0%" x2="1" y2="1"><stop offset="0%" stop-color="#E07A00"/><stop offset="50%" stop-color="#B84D00"/><stop offset="100%" stop-color="#6E2B00"/></linearGradient></defs><g transform="translate(3,3)"><path d="M 10 9 C 4 13 2 20 6 25 C 10 30 18 30 22 24 C 26 18 24 11 18 8 Z" fill="url(#g-roast)"/><rect x="19" y="23" width="4" height="9" rx="1.5" fill="#FDE68A" stroke="#B84D00" stroke-width="0.6" transform="rotate(-30 21 27)"/><circle cx="26" cy="30" r="2.2" fill="#FDE68A"/><circle cx="29" cy="27" r="2.2" fill="#FDE68A"/></g></svg>`
    },
    {
      id: "saffron-rice",
      name: "Saffron Rice Bowl",
      image: "", // Configure real image path here (e.g. "assets/food-rice.png")
      fallbackSvg: `<svg viewBox="0 0 36 36"><g transform="translate(1,2)"><ellipse cx="17" cy="18" rx="14" ry="7" fill="#FFFBEB" stroke="#B45309" stroke-width="1.2"/><path d="M 3 18 Q 17 30 31 18 Z" fill="#D97706"/><ellipse cx="17" cy="16" rx="11" ry="5" fill="#FEF3C7"/><circle cx="13" cy="16" r="1.4" fill="#92400E"/><circle cx="18" cy="15" r="1.4" fill="#92400E"/><circle cx="21" cy="17" r="1.1" fill="#059669"/><ellipse cx="17" cy="13" rx="5" ry="2" fill="#FDE68A"/></g></svg>`
    },
    {
      id: "spiced-lamb",
      name: "Spiced Mandi Meat",
      image: "", // Configure real image path here (e.g. "assets/food-lamb.png")
      fallbackSvg: `<svg viewBox="0 0 36 36"><g transform="translate(2,2)"><path d="M 8 10 C 14 6 22 7 26 12 C 30 17 29 25 24 28 C 18 31 10 29 7 23 C 4 17 5 12 8 10 Z" fill="#78350F" stroke="#9A3412" stroke-width="1"/><path d="M 12 12 Q 18 10 22 14" stroke="#FBBF24" stroke-width="1.2" fill="none"/><circle cx="15" cy="17" r="1.5" fill="#D97706"/><circle cx="20" cy="22" r="1.5" fill="#D97706"/></g></svg>`
    },
    {
      id: "cardamom-spice",
      name: "Cardamom & Garnishes",
      image: "", // Configure real image path here (e.g. "assets/food-cardamom.png")
      fallbackSvg: `<svg viewBox="0 0 36 36"><g transform="translate(2,2)"><path d="M 16 4 C 23 12 23 24 16 32 C 9 24 9 12 16 4 Z" fill="#15803D" stroke="#166534" stroke-width="1.2"/><path d="M 16 6 L 16 30" stroke="#86EFAC" stroke-width="1"/><path d="M 12 16 Q 16 18 20 16" stroke="#86EFAC" stroke-width="0.8" fill="none"/></g></svg>`
    }
  ];

  // Reusable food element factory with graceful image fallback
  function createFoodElement(config) {
    const el = document.createElement("div");
    el.className = "falling-food-item";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", config.name);

    if (config.image && typeof config.image === "string" && config.image.trim() !== "") {
      const img = document.createElement("img");
      img.src = config.image;
      img.alt = config.name;
      img.className = "food-img";
      img.onerror = () => {
        // Fallback to vector SVG if image file is missing or fails
        el.innerHTML = config.fallbackSvg;
      };
      el.appendChild(img);
    } else {
      el.innerHTML = config.fallbackSvg;
    }
    return el;
  }

  // Populate placeholder demo offer
  function applyOfferContent() {
    currentOffer = demoOffers[0] || {
      title: "Demo offer · To be confirmed",
      description: "Special promotion details will be updated soon."
    };

    if (offerTitle) offerTitle.textContent = currentOffer.title;
    if (offerDescription) offerDescription.textContent = currentOffer.description;
  }
  applyOfferContent();

  // Switch between clean game views inside the white container
  function switchView(targetView) {
    const allViews = [viewIntro, viewPlaying, viewResults];
    allViews.forEach((v) => {
      if (v) {
        v.classList.remove("is-active");
        v.setAttribute("aria-hidden", "true");
      }
    });

    if (targetView) {
      targetView.classList.add("is-active");
      targetView.setAttribute("aria-hidden", "false");
    }
  }

  // Position Player Bucket Horizontally (Restricted within play area margins)
  function setBucketPosition(clientX) {
    if (!gamePlayArea || !playerBucket) return;
    const rect = gamePlayArea.getBoundingClientRect();
    const halfWidth = playerBucket.offsetWidth / 2 || 38;
    const rawX = clientX - rect.left;
    const newX = Math.max(halfWidth + 4, Math.min(rect.width - halfWidth - 4, rawX));

    // Tilt bucket slightly in direction of movement
    const dx = newX - bucketX;
    if (dx > 2) {
      playerBucket.classList.remove("is-moving-left");
      playerBucket.classList.add("is-moving-right");
    } else if (dx < -2) {
      playerBucket.classList.remove("is-moving-right");
      playerBucket.classList.add("is-moving-left");
    } else {
      playerBucket.classList.remove("is-moving-left", "is-moving-right");
    }

    bucketX = newX;
    playerBucket.style.left = `${bucketX}px`;

    if (!hasMovedBucket && bucketDragIndicator) {
      hasMovedBucket = true;
      bucketDragIndicator.classList.add("is-hidden");
    }
  }

  function centerBucket() {
    if (!gamePlayArea || !playerBucket) return;
    const rect = gamePlayArea.getBoundingClientRect();
    bucketX = rect.width / 2;
    lastBucketX = bucketX;
    playerBucket.style.left = `${bucketX}px`;
    playerBucket.classList.remove("is-moving-left", "is-moving-right");
  }

  // Spawn a Falling Food Item
  function spawnFoodItem() {
    if (!gamePlayArea || !fallingItemsLayer) return;
    const rect = gamePlayArea.getBoundingClientRect();
    const itemWidth = 36;
    const itemHeight = 36;

    // Pick random food config item
    const foodConfig = FOOD_CONFIG[Math.floor(Math.random() * FOOD_CONFIG.length)];

    // Random X constrained within playfield margins
    const minX = 14;
    const maxX = Math.max(minX + 20, rect.width - itemWidth - 14);
    const startX = minX + Math.random() * (maxX - minX);

    // Varied fall speed: 155px/s to 215px/s
    const speed = 155 + Math.random() * 60;
    const rotSpeed = (Math.random() - 0.5) * 60;

    const el = createFoodElement(foodConfig);
    el.style.transform = `translate3d(${startX}px, -36px, 0)`;
    fallingItemsLayer.appendChild(el);

    fallingItems.push({
      el,
      x: startX,
      y: -36,
      width: itemWidth,
      height: itemHeight,
      vy: speed,
      rot: (Math.random() - 0.5) * 30,
      vrot: rotSpeed,
      caught: false
    });
  }

  // Handle successful item catch
  function handleCatch(item, index) {
    item.caught = true;
    score++;

    // Update Live Score on HUD immediately with pop effect
    if (gameScoreEl) {
      gameScoreEl.textContent = score;
      gameScoreEl.classList.remove("pop");
      void gameScoreEl.offsetWidth; // Reflow for restart
      gameScoreEl.classList.add("pop");
    }

    // Trigger visual pop on the caught food item
    item.el.style.setProperty("--current-transform", `translate3d(${item.x}px, ${item.y}px, 0) rotate(${item.rot}deg)`);
    item.el.classList.add("is-caught");

    // Spawn floating +1 popup at catch point
    const popup = document.createElement("div");
    popup.className = "catch-popup";
    popup.textContent = "+1";
    popup.style.left = `${item.x + item.width / 2}px`;
    popup.style.top = `${item.y}px`;
    gamePlayArea.appendChild(popup);

    setTimeout(() => popup.remove(), 550);

    setTimeout(() => {
      if (item.el && item.el.parentNode) {
        item.el.remove();
      }
    }, 350);

    fallingItems.splice(index, 1);
  }

  // Clear all falling items from the DOM
  function clearFallingItems() {
    if (fallingItemsLayer) {
      fallingItemsLayer.innerHTML = "";
    }
    fallingItems = [];
  }

  // Main Game Loop (requestAnimationFrame)
  function gameLoop(now) {
    if (gameState !== "playing") return;

    if (!lastFrameTime) lastFrameTime = now;
    const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    // Timer countdown
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateTimerDisplay();
      endGameRound();
      return;
    }
    updateTimerDisplay();

    // Spawn food items continuously across the 12-second round (every ~0.48s - 0.65s)
    spawnCooldown -= dt;
    if (spawnCooldown <= 0) {
      spawnFoodItem();
      spawnCooldown = 0.48 + Math.random() * 0.18;
    }

    // Update falling items & collision detection
    const isMobile = window.innerWidth < 480;
    const bucketHalf = isMobile ? 33 : 38;
    const areaRect = gamePlayArea.getBoundingClientRect();
    const areaHeight = areaRect.height || 290;
    const bucketTop = areaHeight - (isMobile ? 48 : 54);
    const bucketCatchZoneBottom = bucketTop + 24;
    const bucketLeft = bucketX - bucketHalf;
    const bucketRight = bucketX + bucketHalf;

    for (let i = fallingItems.length - 1; i >= 0; i--) {
      const item = fallingItems[i];
      if (item.caught) continue;

      item.y += item.vy * dt;
      item.rot += item.vrot * dt;
      item.el.style.transform = `translate3d(${item.x}px, ${item.y}px, 0) rotate(${item.rot}deg)`;

      // Accurate Geometric Collision Check between item bottom and bucket opening
      const itemBottom = item.y + item.height;
      const itemCenter = item.x + item.width / 2;

      if (
        itemBottom >= bucketTop &&
        itemBottom <= bucketCatchZoneBottom &&
        itemCenter >= bucketLeft - 10 &&
        itemCenter <= bucketRight + 10
      ) {
        handleCatch(item, i);
        continue;
      }

      // Remove items that leave the bottom of play area without scoring
      if (item.y > areaHeight + 10) {
        item.el.remove();
        fallingItems.splice(i, 1);
      }
    }

    gameAnimId = requestAnimationFrame(gameLoop);
  }

  function updateTimerDisplay() {
    if (!gameTimerEl) return;
    const seconds = Math.ceil(timeLeft);
    const formatted = seconds < 10 ? `0${seconds}s` : `${seconds}s`;
    gameTimerEl.textContent = formatted;

    if (seconds <= 4) {
      gameTimerEl.parentElement.classList.add("is-warning");
    } else {
      gameTimerEl.parentElement.classList.remove("is-warning");
    }
  }

  // Start / Restart Catch the Feast game
  function startGame() {
    // Cancel previous animations or timers
    if (gameAnimId) {
      cancelAnimationFrame(gameAnimId);
      gameAnimId = null;
    }
    clearFallingItems();
    stopConfetti();

    // Reset game state
    gameState = "playing";
    timeLeft = GAME_DURATION;
    score = 0;
    spawnCooldown = 0.25; // First food item spawns quickly
    lastFrameTime = 0;
    hasMovedBucket = false;

    // Reset Container & Reward Card State
    container.classList.remove("is-revealed");
    rewardCard.setAttribute("aria-hidden", "true");

    // Reset HUD
    if (gameScoreEl) gameScoreEl.textContent = "0";
    if (bucketDragIndicator) bucketDragIndicator.classList.remove("is-hidden");
    updateTimerDisplay();

    // Show Playing View
    switchView(viewPlaying);
    centerBucket();

    // Start requestAnimationFrame loop
    gameAnimId = requestAnimationFrame(gameLoop);
  }

  // End of Round: Triggered strictly when 12-second countdown expires
  function endGameRound() {
    gameState = "results";
    if (gameAnimId) {
      cancelAnimationFrame(gameAnimId);
      gameAnimId = null;
    }

    clearFallingItems();

    // Preserve the actual final score
    const finalScore = score;
    const scoreSummaryText = finalScore === 1 ? "You caught 1 food item!" : `You caught ${finalScore} food items!`;

    // 1. Update Results Interstitial Screen
    if (interstitialScoreVal) interstitialScoreVal.textContent = String(finalScore);
    if (interstitialScoreDesc) interstitialScoreDesc.textContent = scoreSummaryText;

    // 2. Update Reward Card Score Section
    if (rewardScoreNumber) rewardScoreNumber.textContent = String(finalScore);
    if (rewardScoreSummary) rewardScoreSummary.textContent = scoreSummaryText;

    // 3. Show brief celebratory interstitial results screen
    switchView(viewResults);

    // 4. Trigger Full-Screen Confetti Celebration (In front of card & viewport)
    triggerFullScreenConfetti();

    // 5. Smoothly transition to the prominent Offer Reveal Screen
    setTimeout(() => {
      if (gameState !== "results") return;
      gameState = "revealed";

      container.classList.add("is-revealed");
      rewardCard.setAttribute("aria-hidden", "false");
    }, 1150);
  }

  /**
   * =========================================================================
   * FULL-SCREEN CONFETTI CELEBRATION OVERLAY
   * Renders particles across the full viewport, passing visibly IN FRONT of the card!
   * =========================================================================
   */
  function triggerFullScreenConfetti() {
    if (!fullscreenConfettiOverlay) return;

    stopConfetti();

    const goldWhitePalette = [
      "#FFB900",
      "#FFC83B",
      "#FFE58F",
      "#FFFFFF",
      "#FFF8E7",
      "#E5A700",
      "#FFF1B8"
    ];

    const isMobile = window.innerWidth < 480;
    const cascadeCount = isMobile ? 32 : 54;
    const cannonCount = isMobile ? 14 : 22;
    const burstCount = isMobile ? 10 : 16;

    // 1. Top Cascading Shower (Visibly falls directly in front of the white card)
    for (let i = 0; i < cascadeCount; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-particle";

      const color = goldWhitePalette[Math.floor(Math.random() * goldWhitePalette.length)];
      piece.style.backgroundColor = color;
      piece.style.boxShadow = `0 1px 4px ${color}66`;

      // Varied shapes: strips, squares, circles
      const shapeRand = Math.random();
      if (shapeRand < 0.55) {
        piece.style.width = `${6 + Math.random() * 4}px`;
        piece.style.height = `${11 + Math.random() * 8}px`;
        piece.style.borderRadius = "1.5px";
      } else if (shapeRand < 0.8) {
        const s = 6 + Math.random() * 4;
        piece.style.width = `${s}px`;
        piece.style.height = `${s}px`;
        piece.style.borderRadius = "2px";
      } else {
        const d = 6 + Math.random() * 3.5;
        piece.style.width = `${d}px`;
        piece.style.height = `${d}px`;
        piece.style.borderRadius = "50%";
      }

      const xStart = 4 + Math.random() * 92; // 4vw to 96vw
      const lateralDrift = (Math.random() - 0.5) * (isMobile ? 60 : 140);
      const rotX = (Math.random() - 0.5) * 1440;
      const rotY = (Math.random() - 0.5) * 1440;
      const rotZ = (Math.random() - 0.5) * 720;

      piece.style.setProperty("--x-start", `${xStart}vw`);
      piece.style.setProperty("--x-end", `calc(${xStart}vw + ${lateralDrift}px)`);
      piece.style.setProperty("--rot-x", `${rotX}deg`);
      piece.style.setProperty("--rot-y", `${rotY}deg`);
      piece.style.setProperty("--rot-z", `${rotZ}deg`);

      const duration = 2.4 + Math.random() * 1.1;
      const delay = Math.random() * 0.75;

      piece.style.animationName = "confetti-cascade";
      piece.style.animationDuration = `${duration}s`;
      piece.style.animationDelay = `${delay}s`;
      piece.style.animationTimingFunction = "cubic-bezier(0.22, 0.7, 0.35, 1)";

      fullscreenConfettiOverlay.appendChild(piece);
    }

    // 2. Left & Right Cannon Blasts (Shooting up & across the screen)
    for (let i = 0; i < cannonCount; i++) {
      spawnCannonPiece(true);
      spawnCannonPiece(false);
    }

    function spawnCannonPiece(isLeft) {
      const piece = document.createElement("div");
      piece.className = "confetti-particle";

      const color = goldWhitePalette[Math.floor(Math.random() * goldWhitePalette.length)];
      piece.style.backgroundColor = color;
      piece.style.boxShadow = `0 1px 4px ${color}66`;

      const w = 6 + Math.random() * 3.5;
      const h = 10 + Math.random() * 7;
      piece.style.width = `${w}px`;
      piece.style.height = `${h}px`;
      piece.style.borderRadius = "1.5px";

      piece.style.left = isLeft ? "0px" : "100vw";
      piece.style.top = isMobile ? "75vh" : "70vh";

      const minDx = isMobile ? 80 : 160;
      const maxDx = isMobile ? 240 : 540;
      const dxVal = minDx + Math.random() * (maxDx - minDx);
      const dx = isLeft ? dxVal : -dxVal;

      const apexY = -(isMobile ? 180 + Math.random() * 140 : 260 + Math.random() * 260);
      const fallY = isMobile ? 80 + Math.random() * 120 : 100 + Math.random() * 180;
      const rot = (isLeft ? 1 : -1) * (360 + Math.random() * 720);

      piece.style.setProperty("--dx", `${dx}px`);
      piece.style.setProperty("--apex-y", `${apexY}px`);
      piece.style.setProperty("--fall-y", `${fallY}px`);
      piece.style.setProperty("--rot", `${rot}deg`);

      const duration = 2.5 + Math.random() * 0.9;
      const delay = Math.random() * 0.22;

      piece.style.animationName = isLeft ? "confetti-cannon-left" : "confetti-cannon-right";
      piece.style.animationDuration = `${duration}s`;
      piece.style.animationDelay = `${delay}s`;
      piece.style.animationTimingFunction = "cubic-bezier(0.15, 0.85, 0.3, 1)";

      fullscreenConfettiOverlay.appendChild(piece);
    }

    // 3. Center Burst (Explodes from card area outwards)
    for (let i = 0; i < burstCount; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-particle";

      const color = goldWhitePalette[Math.floor(Math.random() * goldWhitePalette.length)];
      piece.style.backgroundColor = color;
      piece.style.boxShadow = `0 1px 4px ${color}66`;

      const s = 6 + Math.random() * 3.5;
      piece.style.width = `${s}px`;
      piece.style.height = `${s}px`;
      piece.style.borderRadius = Math.random() > 0.4 ? "2px" : "50%";

      const cx = 50; // 50vw
      const cy = isMobile ? 48 : 46; // vh
      const angle = Math.random() * Math.PI * 2;
      const distance = (isMobile ? 70 : 160) + Math.random() * (isMobile ? 80 : 180);
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 40; // bias upward
      const rot = (Math.random() - 0.5) * 720;

      piece.style.setProperty("--cx", `${cx}vw`);
      piece.style.setProperty("--cy", `${cy}vh`);
      piece.style.setProperty("--dx", `${dx}px`);
      piece.style.setProperty("--dy", `${dy}px`);
      piece.style.setProperty("--rot", `${rot}deg`);

      const duration = 2.2 + Math.random() * 0.8;
      const delay = Math.random() * 0.15;

      piece.style.animationName = "confetti-burst-radial";
      piece.style.animationDuration = `${duration}s`;
      piece.style.animationDelay = `${delay}s`;
      piece.style.animationTimingFunction = "cubic-bezier(0.15, 0.8, 0.3, 1)";

      fullscreenConfettiOverlay.appendChild(piece);
    }

    // Self-cleanup after animation completes
    confettiCleanupTimer = setTimeout(() => {
      stopConfetti();
    }, 4500);
  }

  function stopConfetti() {
    if (confettiCleanupTimer) {
      clearTimeout(confettiCleanupTimer);
      confettiCleanupTimer = null;
    }
    if (fullscreenConfettiOverlay) {
      fullscreenConfettiOverlay.innerHTML = "";
    }
  }

  // Full Demo Reset: returns cleanly to Intro Screen
  function resetDemo() {
    if (gameAnimId) {
      cancelAnimationFrame(gameAnimId);
      gameAnimId = null;
    }
    clearFallingItems();
    stopConfetti();

    gameState = "intro";
    container.classList.remove("is-revealed");
    rewardCard.setAttribute("aria-hidden", "true");

    score = 0;
    timeLeft = GAME_DURATION;

    if (gameScoreEl) gameScoreEl.textContent = "0";
    if (gameTimerEl) {
      gameTimerEl.textContent = "12s";
      gameTimerEl.parentElement.classList.remove("is-warning");
    }

    switchView(viewIntro);
  }

  // Bucket Drag Event Listeners (Pointer Events for Touch & Mouse)
  if (gamePlayArea) {
    gamePlayArea.addEventListener("pointerdown", (event) => {
      if (gameState !== "playing") return;
      event.preventDefault();
      isDraggingBucket = true;
      try {
        gamePlayArea.setPointerCapture(event.pointerId);
      } catch (_) {}
      setBucketPosition(event.clientX);
    });

    gamePlayArea.addEventListener("pointermove", (event) => {
      if (gameState !== "playing") return;
      if (isDraggingBucket || event.pointerType === "mouse") {
        setBucketPosition(event.clientX);
      }
    });

    const stopDraggingBucket = (event) => {
      isDraggingBucket = false;
      if (playerBucket) {
        playerBucket.classList.remove("is-moving-left", "is-moving-right");
      }
      try {
        if (gamePlayArea.hasPointerCapture(event.pointerId)) {
          gamePlayArea.releasePointerCapture(event.pointerId);
        }
      } catch (_) {}
    };

    gamePlayArea.addEventListener("pointerup", stopDraggingBucket);
    gamePlayArea.addEventListener("pointercancel", stopDraggingBucket);

    // Keyboard Controls for Bucket (Accessibility: Left/Right Arrow Keys)
    window.addEventListener("keydown", (event) => {
      if (gameState !== "playing" || !playerBucket) return;
      const rect = gamePlayArea.getBoundingClientRect();
      const halfWidth = playerBucket.offsetWidth / 2 || 38;
      const step = 26;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        bucketX = Math.max(halfWidth + 4, bucketX - step);
        playerBucket.style.left = `${bucketX}px`;
        playerBucket.classList.remove("is-moving-right");
        playerBucket.classList.add("is-moving-left");
        if (bucketDragIndicator) bucketDragIndicator.classList.add("is-hidden");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        bucketX = Math.min(rect.width - halfWidth - 4, bucketX + step);
        playerBucket.style.left = `${bucketX}px`;
        playerBucket.classList.remove("is-moving-left");
        playerBucket.classList.add("is-moving-right");
        if (bucketDragIndicator) bucketDragIndicator.classList.add("is-hidden");
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (playerBucket) {
          playerBucket.classList.remove("is-moving-left", "is-moving-right");
        }
      }
    });
  }

  // Button Listeners
  if (playNowBtn) {
    playNowBtn.addEventListener("click", startGame);
  }

  if (playAgainBtn) {
    playAgainBtn.addEventListener("click", startGame);
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", resetDemo);
  }

  // Initialize strictly on the Intro Screen
  switchView(viewIntro);
})();
