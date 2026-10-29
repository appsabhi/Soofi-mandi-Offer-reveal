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
  const startGameBtn = document.getElementById("start-game-btn") || document.getElementById("play-now-btn");
  const playAgainBtn = document.getElementById("play-again-btn");
  const resetBtn = document.getElementById("reset-btn");
  const introResetBtn = document.getElementById("intro-reset-btn");
  const rewardResetBtn = document.getElementById("reward-reset-btn");
  const gameMissesEl = document.getElementById("game-misses");
  const hudMissesEl = document.getElementById("hud-misses");
  const hudMissWarningEl = document.getElementById("hud-miss-warning");
  const gameScoreEl = document.getElementById("game-score");
  const gamePlayArea = document.getElementById("game-play-area");
  const fallingItemsLayer = document.getElementById("falling-items-layer");

  // 3D Layered Bucket Elements
  const bucketRear = document.getElementById("bucket-rear");
  const bucketFront = document.getElementById("bucket-front");
  const bucketDragIndicator = document.getElementById("bucket-drag-indicator");

  // Results, Loss & Offer Display Elements
  const interstitialScoreVal = document.getElementById("interstitial-score-val");
  const interstitialScoreDesc = document.getElementById("interstitial-score-desc");
  const rewardScoreNumber = document.getElementById("reward-score-number");
  const rewardScoreSummary = document.getElementById("reward-score-summary");
  const rewardLossHeadline = document.getElementById("reward-loss-headline");
  const rewardKicker = document.getElementById("reward-kicker");
  const rewardOfferCard = document.getElementById("reward-offer-card");
  const offerTitle = document.getElementById("offer-title");
  const offerDescription = document.getElementById("offer-description");

  // Full-Screen Confetti Celebration Overlay
  const fullscreenConfettiOverlay = document.getElementById("fullscreen-confetti-overlay");

  // Leaderboard & Player Identity Elements
  const leaderboardModal = document.getElementById("leaderboard-modal");
  const openLeaderboardBtn = document.getElementById("open-leaderboard-btn");
  const resultLeaderboardBtn = document.getElementById("result-leaderboard-btn");
  const closeLeaderboardBtn = document.getElementById("close-leaderboard-btn");
  const doneLeaderboardBtn = document.getElementById("done-leaderboard-btn");
  const playerNameInput = document.getElementById("player-name-input");
  const saveNameBtn = document.getElementById("save-name-btn");
  const playerChipName = document.getElementById("player-chip-display-name");
  const playerChipEditBtn = document.getElementById("player-chip-edit-btn");
  const introFallingFood = document.getElementById("intro-falling-food");

  // =========================================================================
  // ANONYMOUS FIRST-PARTY PLAYER IDENTIFICATION (Zero invasive fingerprinting)
  // =========================================================================
  function getOrCreateUUID(storage, key) {
    try {
      let val = storage.getItem(key);
      if (!val) {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
          val = crypto.randomUUID();
        } else {
          val = "uuid-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 10);
        }
        storage.setItem(key, val);
      }
      return val;
    } catch (_) {
      return "anon-" + Date.now().toString(36);
    }
  }

  const playerId = getOrCreateUUID(localStorage, "soofi_mandi_player_id");
  let isNewSession = false;
  let sessionId = "";
  try {
    sessionId = sessionStorage.getItem("soofi_mandi_session_id");
    if (!sessionId) {
      sessionId = getOrCreateUUID(sessionStorage, "soofi_mandi_session_id");
      isNewSession = true;
    }
  } catch (_) {
    sessionId = "sess-" + Date.now().toString(36);
  }

  function getStoredDisplayName() {
    try {
      let name = localStorage.getItem("soofi_mandi_display_name");
      if (!name) {
        const suffix = Math.floor(1000 + Math.random() * 9000);
        name = `MandiGuest_${suffix}`;
        localStorage.setItem("soofi_mandi_display_name", name);
      }
      return name;
    } catch (_) {
      return "MandiGuest";
    }
  }

  let playerDisplayName = getStoredDisplayName();
  let playerPersonalBest = 0;
  try {
    playerPersonalBest = parseInt(localStorage.getItem("soofi_mandi_pb") || "0", 10) || 0;
  } catch (_) {}

  // =========================================================================
  // PRIVACY-CONSCIOUS WEBSITE ACTIVITY TRACKING
  // =========================================================================
  function trackEvent(eventName, metadata = {}) {
    try {
      const payload = {
        playerId,
        sessionId,
        eventName,
        metadata: metadata || {}
      };

      if (eventName === "game_abandon" && typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        navigator.sendBeacon("/api/analytics/events", blob);
        return;
      }

      fetch("/api/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(() => {
        // Resilient: gracefully ignore offline/network errors
      });
    } catch (_) {}
  }

  // =========================================================================
  // GLOBAL LEADERBOARD INTEGRATION (Top 10 + Deterministic Tie-breaking)
  // =========================================================================
  function formatTimeAgo(isoString) {
    try {
      const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (isNaN(diffSec) || diffSec < 0) return "just now";
      if (diffSec < 60) return "just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch (_) {
      return "recently";
    }
  }

  async function fetchLeaderboard() {
    const tbody = document.getElementById("leaderboard-tbody");
    const pbEl = document.getElementById("modal-pb-score");
    if (pbEl) pbEl.textContent = String(playerPersonalBest);

    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" class="leaderboard-loading">Loading top scores...</td></tr>';
    }

    try {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Leaderboard fetch failed");
      const data = await res.json();
      if (!data.success || !Array.isArray(data.leaderboard)) {
        throw new Error("Invalid leaderboard data");
      }

      if (!tbody) return;

      if (data.leaderboard.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="leaderboard-empty">No feast records yet. Be the first!</td></tr>';
        return;
      }

      let rowsHtml = "";
      data.leaderboard.forEach((entry, idx) => {
        const rank = idx + 1;
        let rankDisplay = `#${rank}`;
        if (rank === 1) rankDisplay = '<span class="rank-badge-top1">🥇 1</span>';
        else if (rank === 2) rankDisplay = '<span class="rank-badge-top2">🥈 2</span>';
        else if (rank === 3) rankDisplay = '<span class="rank-badge-top3">🥉 3</span>';

        const isMe = entry.player_id === playerId;
        const rowClass = isMe ? ' class="is-current-player"' : "";
        const safeName = (entry.display_name || "Guest").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const timeAgo = formatTimeAgo(entry.submitted_at);

        rowsHtml += `
          <tr${rowClass}>
            <td class="td-rank">${rankDisplay}</td>
            <td class="td-player">${safeName}${isMe ? " (You)" : ""}</td>
            <td class="td-score">${entry.score} pts</td>
            <td class="td-date">${timeAgo}</td>
          </tr>
        `;
      });

      tbody.innerHTML = rowsHtml;
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" class="leaderboard-empty">Leaderboard unavailable offline.</td></tr>';
      }
    }
  }

  async function submitScore(numScore, numCaught, numMissed, numDuration) {
    if (numScore > playerPersonalBest) {
      playerPersonalBest = numScore;
      try {
        localStorage.setItem("soofi_mandi_pb", String(playerPersonalBest));
      } catch (_) {}
      const pbEl = document.getElementById("modal-pb-score");
      if (pbEl) pbEl.textContent = String(playerPersonalBest);
    }

    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          displayName: playerDisplayName,
          score: numScore,
          foodCaught: numCaught,
          missedCount: numMissed,
          durationSeconds: numDuration
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.rank) {
          const rewardSummary = document.getElementById("reward-score-summary");
          if (rewardSummary) {
            rewardSummary.textContent = `You caught ${numScore} items! Ranked #${data.rank} on Leaderboard.`;
          }
        }
      }
    } catch (_) {
      // Offline resilience
    }
  }

  function updateDisplayNameUI(name) {
    if (playerChipName) playerChipName.textContent = name;
    if (playerNameInput) playerNameInput.value = name;
  }

  function openLeaderboard() {
    if (!leaderboardModal) return;
    leaderboardModal.classList.add("is-open");
    leaderboardModal.setAttribute("aria-hidden", "false");
    updateDisplayNameUI(playerDisplayName);
    fetchLeaderboard();
    trackEvent("leaderboard_view");
  }

  function closeLeaderboard() {
    if (!leaderboardModal) return;
    leaderboardModal.classList.remove("is-open");
    leaderboardModal.setAttribute("aria-hidden", "true");
  }

  function savePlayerName() {
    if (!playerNameInput) return;
    const raw = playerNameInput.value.trim();
    if (raw) {
      const sanitized = raw.replace(/<[^>]*>?/gm, "").substring(0, 20);
      playerDisplayName = sanitized;
      try {
        localStorage.setItem("soofi_mandi_display_name", sanitized);
      } catch (_) {}
      updateDisplayNameUI(sanitized);
      fetchLeaderboard();
    }
  }

  // Demo Offers Configuration
  const demoOffers = window.SOOFI_MANDI_DEMO_OFFERS || window.SOOfiMandiOffers || [];
  let currentOffer = null;

  // =========================================================================
  // GAME CONFIGURATION (Configurable parameters — 5-Miss Game Rule, NO Timer)
  // =========================================================================
  const GAME_CONFIG = {
    maxMisses: 5, // Exactly 5 misses ends game
    minSpawnInterval: 0.45, // Seconds between food spawns
    maxSpawnInterval: 0.70,
    minFallSpeedDesktop: 175, // Pixels per second on spacious desktop
    maxFallSpeedDesktop: 235,
    minFallSpeedMobile: 150,
    maxFallSpeedMobile: 200,
    maxConcurrentFoodDesktop: 7, // Kept active and lively across wide playfield
    maxConcurrentFoodMobile: 5
  };

  /**
   * Exactly 3 types of authentic falling mandi delicacies:
   * 1. Chicken Mandi — chicken-mandi.png
   * 2. Beef Mandi — beef-mandi.png
   * 3. Mutton Mandi — mutton-mandi.png
   */
  const FOOD_TYPES = [
    {
      id: "chicken-mandi",
      name: "Chicken Mandi",
      image: "assets/chicken-mandi.png"
    },
    {
      id: "beef-mandi",
      name: "Beef Mandi",
      image: "assets/beef-mandi.png"
    },
    {
      id: "mutton-mandi",
      name: "Mutton Mandi",
      image: "assets/mutton-mandi.png"
    }
  ];

  // Game Runtime State
  let gameState = "intro"; // "intro" | "playing" | "results" | "revealed"
  let roundStartTime = 0;
  const MAX_MISSES = 5;
  let score = 0;
  let missedCount = 0;
  let gameAnimId = null;
  let lastFrameTime = 0;
  let spawnCooldown = 0;
  let lastSpawnX = -999;
  let fallingItems = [];
  let confettiCleanupTimer = null;
  let offerTransitionTimer = null;

  // Bucket Physics & Interaction State
  let bucketX = 0; // Horizontal center of bucket relative to play area
  let isDraggingBucket = false;
  let dragOffsetX = 0;
  let hasMovedBucket = false;

  // Device-specific element dimensions scaled to the enlarged playfield
  function getPlayfieldMetrics() {
    const width = window.innerWidth;
    const isMobile = width < 600;
    const isTablet = width >= 600 && width < 900;

    let bucketWidth = 130;
    let bucketHeight = 130;
    let imageWidth = 82;
    let imageHeight = 64;
    let labelHeight = 22;

    if (isMobile) {
      bucketWidth = 90;
      bucketHeight = 90;
      imageWidth = 60;
      imageHeight = 48;
      labelHeight = 18;
    } else if (isTablet) {
      bucketWidth = 110;
      bucketHeight = 110;
      imageWidth = 72;
      imageHeight = 56;
      labelHeight = 20;
    }

    const containerWidth = Math.max(imageWidth, 90);
    const containerHeight = imageHeight + labelHeight + 4;

    return {
      isMobile,
      isTablet,
      bucketWidth,
      bucketHeight,
      imageWidth,
      imageHeight,
      containerWidth,
      containerHeight
    };
  }

  // Populate placeholder demo offer
  function applyOfferContent() {
    currentOffer = demoOffers[0] || {
      badge: "✦ YOUR SPECIAL OFFER ✦",
      title: "Demo offer · To be confirmed",
      description: "Special promotion details will be updated soon."
    };

    const offerBadgeEl = document.getElementById("offer-badge");
    if (offerBadgeEl && currentOffer.badge) {
      offerBadgeEl.textContent = currentOffer.badge;
    }
    if (offerTitle && currentOffer.title) {
      offerTitle.textContent = currentOffer.title;
    }
    if (offerDescription && currentOffer.description) {
      offerDescription.textContent = currentOffer.description;
    }
  }
  applyOfferContent();

  // Switch between clean game views and update container layout class
  function switchView(targetView, stateName) {
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

    document.body.classList.remove("state-intro", "state-playing", "state-results", "state-revealed");
    document.body.classList.add(`state-${stateName}`);

    const pageWrap = document.querySelector(".page-wrap");
    if (pageWrap) {
      pageWrap.classList.remove("is-intro", "is-playing", "is-results", "is-revealed");
      pageWrap.classList.add(`is-${stateName}`);
    }

    if (container && stateName) {
      container.classList.remove("is-intro", "is-playing", "is-results", "is-revealed");
      container.classList.add(`is-${stateName}`);
    }

    const brandHeader = document.querySelector(".brand-header");
    if (brandHeader) {
      brandHeader.style.display = (stateName === "playing") ? "flex" : "none";
    }

    const resetWrap = document.querySelector(".reset-wrap");
    if (resetWrap) {
      resetWrap.style.display = "none";
    }
  }

  // Position Player Bucket Horizontally (Both rear & front layers synchronized)
  function setBucketPosition(clientX, offset = 0) {
    if (!gamePlayArea || !bucketFront) return;
    const rect = gamePlayArea.getBoundingClientRect();
    const metrics = getPlayfieldMetrics();
    const halfWidth = metrics.bucketWidth / 2;

    const rawX = clientX - rect.left - offset;
    const minX = halfWidth + 6;
    const maxX = rect.width - halfWidth - 6;
    const newX = Math.max(minX, Math.min(maxX, rawX));

    // Slight dynamic tilt in movement direction for feedback
    const dx = newX - bucketX;
    const isLeft = dx < -2;
    const isRight = dx > 2;

    [bucketRear, bucketFront].forEach((b) => {
      if (!b) return;
      if (isRight) {
        b.classList.remove("is-moving-left");
        b.classList.add("is-moving-right");
      } else if (isLeft) {
        b.classList.remove("is-moving-right");
        b.classList.add("is-moving-left");
      } else {
        b.classList.remove("is-moving-left", "is-moving-right");
      }
      b.style.left = `${newX}px`;
    });

    bucketX = newX;

    if (!hasMovedBucket && bucketDragIndicator) {
      hasMovedBucket = true;
      bucketDragIndicator.classList.add("is-hidden");
    }
  }

  function centerBucket() {
    if (!gamePlayArea) return;
    const rect = gamePlayArea.getBoundingClientRect();
    bucketX = rect.width / 2;
    [bucketRear, bucketFront].forEach((b) => {
      if (!b) return;
      b.style.left = `${bucketX}px`;
      b.classList.remove("is-moving-left", "is-moving-right");
    });
  }

  /**
   * Create falling food DOM element using the real PNG image + food name label beneath it.
   * Both move together as a single unified falling object.
   * Labels stay horizontal and readable without unwanted rotation.
   */
  function createFoodElement(config, metrics) {
    const el = document.createElement("div");
    el.className = "falling-food-item";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", config.name);

    // Food platter PNG image
    const img = document.createElement("img");
    img.src = config.image;
    img.alt = config.name;
    img.className = "food-img";

    // Food name tag placed directly beneath image
    const label = document.createElement("span");
    label.className = "food-name-tag";
    label.textContent = config.name;

    el.appendChild(img);
    el.appendChild(label);

    return el;
  }

  // Spawn a Falling Food Item from the top
  function spawnFoodItem() {
    if (!gamePlayArea || !fallingItemsLayer) return;
    const metrics = getPlayfieldMetrics();
    const maxAllowed = metrics.isMobile
      ? GAME_CONFIG.maxConcurrentFoodMobile
      : GAME_CONFIG.maxConcurrentFoodDesktop;

    if (fallingItems.length >= maxAllowed) return;

    const rect = gamePlayArea.getBoundingClientRect();
    // Random selection among the 3 authentic Mandi delicacies
    const foodConfig = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];

    // Vary horizontal starting position across the spacious playfield
    const minX = 18;
    const maxX = Math.max(minX + 30, rect.width - metrics.containerWidth - 18);

    let startX = minX + Math.random() * (maxX - minX);
    if (Math.abs(startX - lastSpawnX) < metrics.containerWidth * 1.4) {
      // Re-distribute to prevent consecutive items dropping on the exact same vertical track
      startX = startX > rect.width / 2
        ? minX + Math.random() * (rect.width / 2 - minX - metrics.containerWidth)
        : rect.width / 2 + Math.random() * (maxX - rect.width / 2);
      startX = Math.max(minX, Math.min(maxX, startX));
    }
    lastSpawnX = startX;

    // Natural fall speed scaled to playfield height
    const minSpeed = metrics.isMobile ? GAME_CONFIG.minFallSpeedMobile : GAME_CONFIG.minFallSpeedDesktop;
    const maxSpeed = metrics.isMobile ? GAME_CONFIG.maxFallSpeedMobile : GAME_CONFIG.maxFallSpeedDesktop;
    const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);

    const el = createFoodElement(foodConfig, metrics);
    const startY = -metrics.containerHeight;
    el.style.transform = `translate3d(${startX}px, ${startY}px, 0)`;
    fallingItemsLayer.appendChild(el);

    fallingItems.push({
      el,
      x: startX,
      y: startY,
      imageHeight: metrics.imageHeight,
      containerWidth: metrics.containerWidth,
      containerHeight: metrics.containerHeight,
      vy: speed,
      caught: false,
      missed: false
    });
  }

  // Handle successful item catch — Food visibly drops into the open bucket interior
  function handleCatch(item, index) {
    if (item.caught || gameState !== "playing") return;

    item.caught = true;
    score++;

    // Update Live Score on HUD immediately with pop animation
    if (gameScoreEl) {
      gameScoreEl.textContent = String(score);
      gameScoreEl.classList.remove("pop");
      void gameScoreEl.offsetWidth; // Reflow to re-trigger CSS keyframe
      gameScoreEl.classList.add("pop");
    }

    // Trigger visual pop animation on the caught food item:
    // Food shrinks and moves down into the bucket cavity behind the front rim layer
    const currentTransform = `translate3d(${item.x}px, ${item.y}px, 0)`;
    item.el.style.setProperty("--current-transform", currentTransform);
    item.el.classList.add("is-caught");

    // Gold ring pulse feedback on bucket
    [bucketRear, bucketFront].forEach((b) => {
      if (!b) return;
      b.classList.remove("is-caught-pulse");
      void b.offsetWidth;
      b.classList.add("is-caught-pulse");
    });

    // Spawn floating +1 popup above the bucket rim
    const popup = document.createElement("div");
    popup.className = "catch-popup";
    popup.textContent = "+1";
    popup.style.left = `${item.x + item.containerWidth / 2}px`;
    popup.style.top = `${item.y}px`;
    gamePlayArea.appendChild(popup);

    setTimeout(() => popup.remove(), 550);

    // Clean up caught element from DOM
    setTimeout(() => {
      if (item.el && item.el.parentNode) {
        item.el.remove();
      }
    }, 360);

    // Remove from active physics array immediately so it can never award points twice
    fallingItems.splice(index, 1);
  }

  // Clear all falling items from DOM and memory
  function clearFallingItems() {
    if (fallingItemsLayer) {
      fallingItemsLayer.innerHTML = "";
    }
    fallingItems = [];
    lastSpawnX = -999;
  }

  // Main Game Loop (requestAnimationFrame) — Ends solely on 5 misses
  function gameLoop(now) {
    if (gameState !== "playing") return;

    if (!lastFrameTime) lastFrameTime = now;
    const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    // Spawning cadence
    spawnCooldown -= dt;
    if (spawnCooldown <= 0) {
      spawnFoodItem();
      spawnCooldown = GAME_CONFIG.minSpawnInterval + Math.random() * (GAME_CONFIG.maxSpawnInterval - GAME_CONFIG.minSpawnInterval);
    }

    // Update falling items & accurate collision detection
    const metrics = getPlayfieldMetrics();
    const areaRect = gamePlayArea.getBoundingClientRect();
    const areaHeight = areaRect.height || 500;

    // 3D Bucket Rim Geometry:
    // In mandi-bucket.png (1254x1254), back rim begins ~15.5% down from top.
    // Front rim begins ~36.7% down from top.
    const bucketTop = areaHeight - metrics.bucketHeight - 8;
    const bucketRimTop = bucketTop + metrics.bucketHeight * 0.155;
    const bucketFrontLip = bucketTop + metrics.bucketHeight * 0.367;

    // Catch zone: Food platter enters into the bucket cavity
    const catchTop = bucketRimTop - 4;
    const catchBottom = bucketFrontLip + metrics.bucketHeight * 0.12;

    // Bucket opening horizontal bounds (~80% of bucket width accounting for side padding)
    const openingHalfWidth = metrics.bucketWidth * 0.40;
    const bucketLeft = bucketX - openingHalfWidth;
    const bucketRight = bucketX + openingHalfWidth;

    for (let i = fallingItems.length - 1; i >= 0; i--) {
      const item = fallingItems[i];
      if (item.caught) continue;

      item.y += item.vy * dt;
      // Stable horizontal falling without label rotation
      item.el.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;

      // Collision calculated based strictly on food reaching the rim
      const foodImageBottom = item.y + item.imageHeight * 0.90;
      const foodCenter = item.x + item.containerWidth / 2;

      // 1. Successful Catch Check
      if (
        foodImageBottom >= catchTop &&
        foodImageBottom <= catchBottom &&
        foodCenter >= bucketLeft &&
        foodCenter <= bucketRight
      ) {
        handleCatch(item, i);
        continue;
      }

      // 2. 5-Miss Game Rule: Increment miss counter when food leaves bottom of playfield
      if (item.y > areaHeight + 25) {
        if (!item.caught && !item.missed) {
          item.missed = true;
          missedCount++;
          updateMissesDisplay();

          if (missedCount >= MAX_MISSES) {
            item.el.remove();
            fallingItems.splice(i, 1);
            endGameLoss();
            return;
          }
        }
        item.el.remove();
        fallingItems.splice(i, 1);
      }
    }

    gameAnimId = requestAnimationFrame(gameLoop);
  }

  // Update Misses HUD Display (e.g. "0/5", "4/5" with warning pulse, "5/5")
  function updateMissesDisplay() {
    if (gameMissesEl) {
      gameMissesEl.textContent = `${missedCount}/${MAX_MISSES}`;
    }
    if (hudMissesEl) {
      if (missedCount >= 4) {
        hudMissesEl.classList.add("is-warning");
      } else {
        hudMissesEl.classList.remove("is-warning");
      }
    }
    if (hudMissWarningEl) {
      if (missedCount === 4) {
        hudMissWarningEl.classList.add("is-visible");
      } else {
        hudMissWarningEl.classList.remove("is-visible");
      }
    }
  }

  // Start / Restart Catch the Feast game
  function startGame() {
    // Clear any previous animation loops, timers, or confetti
    if (gameAnimId) {
      cancelAnimationFrame(gameAnimId);
      gameAnimId = null;
    }
    if (offerTransitionTimer) {
      clearTimeout(offerTransitionTimer);
      offerTransitionTimer = null;
    }
    clearFallingItems();
    stopConfetti();

    const isReplay = (gameState === "revealed");
    trackEvent("game_start", { isReplay });

    // Reset game round state
    gameState = "playing";
    score = 0;
    missedCount = 0;
    spawnCooldown = 0.22; // First food item spawns promptly
    lastFrameTime = 0;
    hasMovedBucket = false;
    roundStartTime = performance.now();

    // Reset Container & Reward Card State
    if (rewardCard) {
      rewardCard.classList.remove("is-loss");
      rewardCard.setAttribute("aria-hidden", "true");
    }
    if (rewardOfferCard) {
      rewardOfferCard.style.display = "none";
    }
    if (rewardLossHeadline) {
      rewardLossHeadline.style.display = "none";
    }

    // Reset HUD
    if (gameScoreEl) gameScoreEl.textContent = "0";
    if (bucketDragIndicator) bucketDragIndicator.classList.remove("is-hidden");
    updateMissesDisplay();

    // Show Playing View with enlarged playfield & center bucket
    switchView(viewPlaying, "playing");
    centerBucket();

    // Start single active requestAnimationFrame loop
    gameAnimId = requestAnimationFrame(gameLoop);
  }

  // End of Round: Triggered immediately when player reaches 5 missed food items
  function endGameLoss() {
    if (gameState !== "playing") return;
    gameState = "revealed";

    if (gameAnimId) {
      cancelAnimationFrame(gameAnimId);
      gameAnimId = null;
    }

    if (offerTransitionTimer) {
      clearTimeout(offerTransitionTimer);
      offerTransitionTimer = null;
    }

    clearFallingItems();
    stopConfetti();

    // Preserve the actual final score (including 0)
    const finalScore = score;
    const scoreSummaryText = finalScore === 1 ? "You caught 1 food item!" : `You caught ${finalScore} food items!`;

    // 1. Update Results Interstitial Screen (if queried)
    if (interstitialScoreVal) interstitialScoreVal.textContent = String(finalScore);
    if (interstitialScoreDesc) interstitialScoreDesc.textContent = scoreSummaryText;

    // 2. Update Reward Card Score Section with exact final score
    if (rewardScoreNumber) rewardScoreNumber.textContent = String(finalScore);
    if (rewardScoreSummary) rewardScoreSummary.textContent = scoreSummaryText;

    // 3. Configure Card: Prominent YOU LOST! and NEVER display offer card or coupon
    if (rewardCard) {
      rewardCard.classList.add("is-loss");
      rewardCard.setAttribute("aria-hidden", "false");
    }
    if (rewardLossHeadline) {
      rewardLossHeadline.style.display = "block";
    }
    if (rewardKicker) {
      rewardKicker.textContent = "GAME OVER";
    }
    if (rewardOfferCard) {
      rewardOfferCard.style.display = "none";
    }

    // 4. Reveal the Loss / Result Screen
    switchView(null, "revealed");

    // 5. Track event and submit score to global leaderboard
    const elapsedSeconds = Math.max(1, Math.round((performance.now() - roundStartTime) / 1000));
    trackEvent("game_loss", {
      score: finalScore,
      foodCaught: finalScore,
      missedCount: MAX_MISSES,
      durationSeconds: elapsedSeconds
    });
    trackEvent("game_complete", {
      score: finalScore,
      foodCaught: finalScore,
      missedCount: MAX_MISSES,
      durationSeconds: elapsedSeconds
    });
    submitScore(finalScore, finalScore, MAX_MISSES, elapsedSeconds);
  }

  const endGameRound = endGameLoss;

  /**
   * =========================================================================
   * FULL-SCREEN CONFETTI CELEBRATION OVERLAY
   * Renders particles across the full viewport, passing visibly IN FRONT of card!
   * =========================================================================
   */
  function triggerFullScreenConfetti() {
    if (!fullscreenConfettiOverlay) return;

    // Respect reduced-motion preferences
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    stopConfetti();

    // Palette with vibrant gold, cream, forest green, and sand for celebratory theme
    const confettiPalette = [
      "#F5B800",
      "#FFD24D",
      "#D99E00",
      "#FFF8E7",
      "#F0E3C4",
      "#7BD88F",
      "#1B5E45"
    ];

    const isMobile = window.innerWidth < 600;
    const cascadeCount = isMobile ? 36 : 64;
    const cannonCount = isMobile ? 14 : 26;
    const burstCount = isMobile ? 12 : 20;

    // 1. Top Cascading Shower
    for (let i = 0; i < cascadeCount; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-particle";

      const color = confettiPalette[Math.floor(Math.random() * confettiPalette.length)];
      piece.style.backgroundColor = color;
      piece.style.boxShadow = `0 1px 4px ${color}66`;

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

      const xStart = 3 + Math.random() * 94; // 3vw to 97vw
      const lateralDrift = (Math.random() - 0.5) * (isMobile ? 70 : 160);
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

    // 2. Left & Right Cannon Blasts
    for (let i = 0; i < cannonCount; i++) {
      spawnCannonPiece(true);
      spawnCannonPiece(false);
    }

    function spawnCannonPiece(isLeft) {
      const piece = document.createElement("div");
      piece.className = "confetti-particle";

      const color = confettiPalette[Math.floor(Math.random() * confettiPalette.length)];
      piece.style.backgroundColor = color;
      piece.style.boxShadow = `0 1px 4px ${color}66`;

      const w = 6 + Math.random() * 3.5;
      const h = 10 + Math.random() * 7;
      piece.style.width = `${w}px`;
      piece.style.height = `${h}px`;
      piece.style.borderRadius = "1.5px";

      piece.style.left = isLeft ? "0px" : "100vw";
      piece.style.top = isMobile ? "75vh" : "70vh";

      const minDx = isMobile ? 80 : 180;
      const maxDx = isMobile ? 240 : 600;
      const dxVal = minDx + Math.random() * (maxDx - minDx);
      const dx = isLeft ? dxVal : -dxVal;

      const apexY = -(isMobile ? 180 + Math.random() * 140 : 280 + Math.random() * 280);
      const fallY = isMobile ? 80 + Math.random() * 120 : 100 + Math.random() * 200;
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

    // 3. Center Burst
    for (let i = 0; i < burstCount; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-particle";

      const color = confettiPalette[Math.floor(Math.random() * confettiPalette.length)];
      piece.style.backgroundColor = color;
      piece.style.boxShadow = `0 1px 4px ${color}66`;

      const s = 6 + Math.random() * 3.5;
      piece.style.width = `${s}px`;
      piece.style.height = `${s}px`;
      piece.style.borderRadius = Math.random() > 0.4 ? "2px" : "50%";

      const cx = 50; // 50vw
      const cy = isMobile ? 48 : 46; // vh
      const angle = Math.random() * Math.PI * 2;
      const distance = (isMobile ? 70 : 180) + Math.random() * (isMobile ? 80 : 220);
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 40; // Bias upward
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
    if (offerTransitionTimer) {
      clearTimeout(offerTransitionTimer);
      offerTransitionTimer = null;
    }
    clearFallingItems();
    stopConfetti();

    gameState = "intro";
    score = 0;
    missedCount = 0;

    if (rewardCard) {
      rewardCard.classList.remove("is-loss");
      rewardCard.setAttribute("aria-hidden", "true");
    }
    if (rewardOfferCard) {
      rewardOfferCard.style.display = "none";
    }
    if (rewardLossHeadline) {
      rewardLossHeadline.style.display = "none";
    }

    if (gameScoreEl) gameScoreEl.textContent = "0";
    updateMissesDisplay();

    switchView(viewIntro, "intro");
  }

  // Bucket Drag Event Listeners (Pointer Events for Touch & Mouse)
  if (gamePlayArea) {
    gamePlayArea.addEventListener("pointerdown", (event) => {
      if (gameState !== "playing") return;
      event.preventDefault();
      isDraggingBucket = true;

      const rect = gamePlayArea.getBoundingClientRect();
      const currentTouchX = event.clientX - rect.left;
      const metrics = getPlayfieldMetrics();

      // If touched on or near bucket, smoothly track offset so the bucket NEVER jumps!
      if (Math.abs(currentTouchX - bucketX) < metrics.bucketWidth * 0.8) {
        dragOffsetX = currentTouchX - bucketX;
      } else {
        dragOffsetX = 0;
        setBucketPosition(event.clientX, dragOffsetX);
      }

      try {
        gamePlayArea.setPointerCapture(event.pointerId);
      } catch (_) {}
    });

    gamePlayArea.addEventListener("pointermove", (event) => {
      if (gameState !== "playing") return;
      if (isDraggingBucket || event.pointerType === "mouse") {
        setBucketPosition(event.clientX, isDraggingBucket ? dragOffsetX : 0);
      }
    });

    const stopDraggingBucket = (event) => {
      isDraggingBucket = false;
      dragOffsetX = 0;
      [bucketRear, bucketFront].forEach((b) => {
        if (b) b.classList.remove("is-moving-left", "is-moving-right");
      });
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
      if (gameState !== "playing") return;
      const rect = gamePlayArea.getBoundingClientRect();
      const metrics = getPlayfieldMetrics();
      const halfWidth = metrics.bucketWidth / 2;
      const step = 32;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const newX = Math.max(halfWidth + 6, bucketX - step);
        [bucketRear, bucketFront].forEach((b) => {
          if (!b) return;
          b.style.left = `${newX}px`;
          b.classList.remove("is-moving-right");
          b.classList.add("is-moving-left");
        });
        bucketX = newX;
        if (bucketDragIndicator) bucketDragIndicator.classList.add("is-hidden");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        const newX = Math.min(rect.width - halfWidth - 6, bucketX + step);
        [bucketRear, bucketFront].forEach((b) => {
          if (!b) return;
          b.style.left = `${newX}px`;
          b.classList.remove("is-moving-left");
          b.classList.add("is-moving-right");
        });
        bucketX = newX;
        if (bucketDragIndicator) bucketDragIndicator.classList.add("is-hidden");
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        [bucketRear, bucketFront].forEach((b) => {
          if (b) b.classList.remove("is-moving-left", "is-moving-right");
        });
      }
    });
  }

  // Recalculate and clamp bucket on window resize
  window.addEventListener("resize", () => {
    if (gamePlayArea && bucketFront) {
      const rect = gamePlayArea.getBoundingClientRect();
      const metrics = getPlayfieldMetrics();
      const halfWidth = metrics.bucketWidth / 2;
      bucketX = Math.max(halfWidth + 6, Math.min(rect.width - halfWidth - 6, bucketX));
      [bucketRear, bucketFront].forEach((b) => {
        if (b) b.style.left = `${bucketX}px`;
      });
    }
  });

  // Action Button Listeners
  if (startGameBtn) {
    startGameBtn.addEventListener("click", () => {
      trackEvent("cta_click", { target: "start_game" });
      startGame();
    });
  }

  if (playAgainBtn) {
    playAgainBtn.addEventListener("click", () => {
      trackEvent("game_replay");
      trackEvent("cta_click", { target: "play_again" });
      startGame();
    });
  }

  if (openLeaderboardBtn) {
    openLeaderboardBtn.addEventListener("click", () => {
      trackEvent("cta_click", { target: "open_leaderboard_intro" });
      openLeaderboard();
    });
  }

  if (resultLeaderboardBtn) {
    resultLeaderboardBtn.addEventListener("click", () => {
      trackEvent("cta_click", { target: "open_leaderboard_result" });
      openLeaderboard();
    });
  }

  if (closeLeaderboardBtn) {
    closeLeaderboardBtn.addEventListener("click", closeLeaderboard);
  }

  if (doneLeaderboardBtn) {
    doneLeaderboardBtn.addEventListener("click", closeLeaderboard);
  }

  if (leaderboardModal) {
    leaderboardModal.addEventListener("click", (event) => {
      if (event.target === leaderboardModal) {
        closeLeaderboard();
      }
    });
  }

  if (playerChipEditBtn) {
    playerChipEditBtn.addEventListener("click", () => {
      openLeaderboard();
      if (playerNameInput) {
        playerNameInput.focus();
        playerNameInput.select();
      }
    });
  }

  if (saveNameBtn) {
    saveNameBtn.addEventListener("click", savePlayerName);
  }

  if (playerNameInput) {
    playerNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        savePlayerName();
      }
    });
  }

  // Keyboard navigation for modal (ESC key to dismiss)
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && leaderboardModal && leaderboardModal.classList.contains("is-open")) {
      closeLeaderboard();
    }
  });

  // Window lifecycle tracking (game abandon & session)
  window.addEventListener("beforeunload", () => {
    if (gameState === "playing") {
      trackEvent("game_abandon", { score, missedCount });
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && gameState === "playing") {
      trackEvent("game_abandon", { score, missedCount });
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", resetDemo);
  }

  if (introResetBtn) {
    introResetBtn.addEventListener("click", resetDemo);
  }

  if (rewardResetBtn) {
    rewardResetBtn.addEventListener("click", resetDemo);
  }

  // Initial Anonymous Identity & Session Tracking
  updateDisplayNameUI(playerDisplayName);
  trackEvent("page_visit", { path: window.location.pathname });
  if (isNewSession) {
    trackEvent("session_start");
  }

  // Initialize strictly on the Intro Screen
  switchView(viewIntro, "intro");
})();
