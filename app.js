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

  // Enhanced HUD Elements (Combo multiplier x2)
  const hudEnhancementsStrip = document.getElementById("hud-enhancements-strip");
  const hudComboEl = document.getElementById("hud-combo");
  const hudComboValEl = document.getElementById("hud-combo-val");

  // 3D Layered Bucket Elements
  const bucketRear = document.getElementById("bucket-rear");
  const bucketFront = document.getElementById("bucket-front");
  const bucketDragIndicator = document.getElementById("bucket-drag-indicator");

  // Results, Loss & Offer Display Elements
  const interstitialScoreVal = document.getElementById("interstitial-score-val");
  const interstitialScoreDesc = document.getElementById("interstitial-score-desc");
  const rewardScoreNumber = document.getElementById("reward-score-number");
  const rewardScoreSummary = document.getElementById("reward-score-summary");
  const rewardResultHeader = document.getElementById("reward-result-header");
  const rewardLossHeadline = document.getElementById("reward-loss-headline");
  const rewardKicker = document.getElementById("reward-kicker");
  const rewardOfferCard = document.getElementById("reward-offer-card");
  const offerTitle = document.getElementById("offer-title");
  const offerDescription = document.getElementById("offer-description");

  // Offer Unlock & Claim Modal Elements
  const rewardLockedWrap = document.getElementById("reward-locked-wrap");
  const offerLockedBtn = document.getElementById("offer-locked-btn");
  const rewardUnlockBanner = document.getElementById("reward-unlock-banner");
  const unlockScoreVal = document.getElementById("unlock-score-val");
  const unlockCongratsText = document.getElementById("unlock-congrats-text");
  const unlockOfferBtn = document.getElementById("unlock-offer-btn");
  const offerCongratsHeadline = document.getElementById("offer-congrats-headline");
  const offerClaimCode = document.getElementById("offer-claim-code");
  const offerInstructionsText = document.getElementById("offer-instructions-text");
  const offerStatusText = document.getElementById("offer-status-text");

  const claimModal = document.getElementById("claim-modal");
  const closeClaimModalBtn = document.getElementById("close-claim-modal-btn");
  const cancelClaimBtn = document.getElementById("cancel-claim-btn");
  const claimForm = document.getElementById("claim-form");
  const claimNameInput = document.getElementById("claim-name");
  const claimNameError = document.getElementById("claim-name-error");
  const claimPhoneInput = document.getElementById("claim-phone");
  const claimPhoneError = document.getElementById("claim-phone-error");
  const claimEmailInput = document.getElementById("claim-email");
  const claimEmailError = document.getElementById("claim-email-error");
  const claimAlertError = document.getElementById("claim-alert-error");
  const claimSubmitBtn = document.getElementById("claim-submit-btn");
  const claimSpinner = document.getElementById("claim-spinner");
  const claimSubmitText = document.getElementById("claim-submit-text");

  let currentGameSessionId = null;
  let currentClaim = null;
  let pendingScoreSubmission = null;
  let currentRoundId = 0;

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
  const playerNameFeedback = document.getElementById("player-name-feedback");
  const playerChipName = document.getElementById("player-chip-display-name");
  const playerChipEditBtn = document.getElementById("player-chip-edit-btn");
  const introFallingFood = document.getElementById("intro-falling-food");

  let isSavingPlayerName = false;
  let playerNameFeedbackTimer = null;

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

  async function submitScore(numScore, numCaught, numMissed, numDuration, events = [], isDevTest = false, roundId) {
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
          durationSeconds: numDuration,
          events: events || [],
          isDevTest: Boolean(isDevTest)
        })
      });
      if (res.ok) {
        const data = await res.json();

        // Stale Response Check: If a new round has started since this submission began,
        // discard this response completely so it never pollutes the current round!
        if (roundId !== undefined && roundId !== currentRoundId) {
          return null;
        }

        if (data.gameSessionId) {
          currentGameSessionId = data.gameSessionId;
        }

        const finalScoreVal = (data.verifiedScore !== undefined) ? data.verifiedScore : numScore;
        score = finalScoreVal;

        if (rewardScoreNumber) rewardScoreNumber.textContent = `${finalScoreVal} / 100`;
        if (unlockScoreVal) unlockScoreVal.textContent = String(finalScoreVal);

        const rewardSummary = document.getElementById("reward-score-summary");
        if (rewardSummary) {
          rewardSummary.textContent = finalScoreVal >= 100
            ? "Congratulations! You've unlocked a reward."
            : "Reach 100 points to unlock your reward!";
        }

        // Keep offer eligibility UI consistent with server-verified score
        if (finalScoreVal >= 100) {
          if (rewardCard) {
            rewardCard.classList.remove("is-loss");
            rewardCard.classList.add("is-offer-unlocked");
          }
          if (rewardLockedWrap) rewardLockedWrap.style.display = "none";
          if (rewardUnlockBanner) rewardUnlockBanner.style.display = "flex";
          if (unlockOfferBtn) {
            unlockOfferBtn.disabled = false;
            unlockOfferBtn.removeAttribute("aria-disabled");
            unlockOfferBtn.style.display = "";
          }
        } else {
          if (rewardCard) {
            rewardCard.classList.add("is-loss");
            rewardCard.classList.remove("is-offer-unlocked");
          }
          if (rewardLockedWrap) rewardLockedWrap.style.display = "flex";
          if (offerLockedBtn) {
            offerLockedBtn.disabled = true;
            offerLockedBtn.setAttribute("aria-disabled", "true");
            offerLockedBtn.style.display = "";
          }
          if (rewardUnlockBanner) rewardUnlockBanner.style.display = "none";
        }

        return data;
      }
    } catch (_) {
      // Offline resilience
    }
    return null;
  }

  function updateDisplayNameUI(name) {
    if (playerChipName) playerChipName.textContent = name;
    if (playerNameInput) playerNameInput.value = name;
  }

  function openLeaderboard() {
    if (!leaderboardModal) return;
    leaderboardModal.classList.add("is-open");
    leaderboardModal.setAttribute("aria-hidden", "false");
    clearPlayerNameFeedback();
    updateDisplayNameUI(playerDisplayName);
    fetchLeaderboard();
    trackEvent("leaderboard_view");
  }

  function closeLeaderboard() {
    if (!leaderboardModal) return;
    leaderboardModal.classList.remove("is-open");
    leaderboardModal.setAttribute("aria-hidden", "true");
    clearPlayerNameFeedback();
  }

  function showPlayerNameFeedback(message, type = "success") {
    if (!playerNameFeedback) return;
    if (playerNameFeedbackTimer) {
      clearTimeout(playerNameFeedbackTimer);
      playerNameFeedbackTimer = null;
    }
    playerNameFeedback.textContent = message;
    playerNameFeedback.className = `player-name-feedback is-visible is-${type}`;
    if (type === "success") {
      playerNameFeedbackTimer = setTimeout(() => {
        if (playerNameFeedback) {
          playerNameFeedback.classList.remove("is-visible");
        }
      }, 4000);
    }
  }

  function clearPlayerNameFeedback() {
    if (playerNameFeedbackTimer) {
      clearTimeout(playerNameFeedbackTimer);
      playerNameFeedbackTimer = null;
    }
    if (playerNameFeedback) {
      playerNameFeedback.className = "player-name-feedback";
      playerNameFeedback.textContent = "";
    }
  }

  async function savePlayerName() {
    if (!playerNameInput || isSavingPlayerName) return;

    const raw = playerNameInput.value.trim();
    if (!raw) {
      showPlayerNameFeedback("Couldn't save your name. Please try again.", "error");
      if (playerNameInput) playerNameInput.focus();
      return;
    }

    const sanitized = raw.replace(/<[^>]*>?/gm, "").substring(0, 20).trim();
    if (!sanitized) {
      showPlayerNameFeedback("Couldn't save your name. Please try again.", "error");
      if (playerNameInput) playerNameInput.focus();
      return;
    }

    isSavingPlayerName = true;
    clearPlayerNameFeedback();

    if (saveNameBtn) {
      saveNameBtn.disabled = true;
      saveNameBtn.setAttribute("aria-disabled", "true");
      saveNameBtn.classList.add("is-saving");
      saveNameBtn.textContent = "SAVING...";
    }

    try {
      const response = await fetch("/api/player/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          displayName: sanitized
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const confirmedName = data.displayName || sanitized;
          playerDisplayName = confirmedName;
          try {
            localStorage.setItem("soofi_mandi_display_name", confirmedName);
          } catch (_) {}
          updateDisplayNameUI(confirmedName);

          // Confirmed success from backend database operation
          showPlayerNameFeedback("Name saved successfully!", "success");

          // Refresh leaderboard to immediately reflect the new name in ranks
          fetchLeaderboard();
        } else {
          showPlayerNameFeedback(data.message || "Couldn't save your name. Please try again.", "error");
        }
      } else {
        showPlayerNameFeedback("Couldn't save your name. Please try again.", "error");
      }
    } catch (_) {
      // Network failure, server down, or offline
      showPlayerNameFeedback("Couldn't save your name. Please try again.", "error");
    } finally {
      isSavingPlayerName = false;
      if (saveNameBtn) {
        saveNameBtn.disabled = false;
        saveNameBtn.removeAttribute("aria-disabled");
        saveNameBtn.classList.remove("is-saving");
        saveNameBtn.textContent = "SAVE";
      }
    }
  }

  // Demo Offers Configuration
  const demoOffers = window.SOOFI_MANDI_DEMO_OFFERS || window.SOOfiMandiOffers || [];
  let currentOffer = null;

  // =========================================================================
  // ZERO-DEPENDENCY WEB AUDIO API SYNTHESIZER
  // Gentle arcade sound effects (zero external files, offline-ready)
  // =========================================================================
  let audioCtx = null;
  function getAudioContext() {
    try {
      if (!audioCtx && (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext)) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
      }
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    } catch (_) {
      return null;
    }
  }

  if (typeof window !== "undefined") {
    ["pointerdown", "touchstart", "keydown"].forEach((evt) => {
      window.addEventListener(evt, () => getAudioContext(), { once: true, passive: true });
    });
  }

  const Sound = {
    normalCatch() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.11); // A5
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
      } catch (_) {}
    },
    goldenMandiCatch() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        [659.25, 880, 1174.66].forEach((freq, idx) => { // E5, A5, D6 shimmer arpeggio
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          const t = now + idx * 0.055;
          osc.frequency.setValueAtTime(freq, t);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.18);
          gain.gain.setValueAtTime(0.18, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.22);
        });
      } catch (_) {}
    },
    bombHit() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.26);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.28);
      } catch (_) {}
    },
    comboActivation() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => { // C5, E5, G5, C6 fanfare
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          const t = now + idx * 0.045;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.15, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.22);
        });
      } catch (_) {}
    },
    missWarning() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(370, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.24);
      } catch (_) {}
    },
    gameOver() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        [440, 392, 349.23, 293.66].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          const t = now + idx * 0.09;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.13, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.28);
        });
      } catch (_) {}
    }
  };

  // =========================================================================
  // FEATURE TOGGLES & GAME CONFIGURATION (Modular & Independently Controllable)
  // =========================================================================
  const DEFAULT_GAME_FEATURES = {
    goldenMandi: true,
    comboCatch: true,
    floatingScores: true,
    bomb: true
  };

  const DEFAULT_GAME_CONFIG = {
    normalFoodPoints: 1,
    goldenMandiPoints: 3,
    bombPoints: -10,
    goldenMandiSpawnChance: 0.015,
    bombSpawnChance: 0.025,
    comboActivationCount: 5,
    comboMultiplier: 2,
    missLimit: 5,
    offerEligibilityScore: 100,
    minSpawnInterval: 0.45,
    maxSpawnInterval: 0.70,
    minFallSpeedDesktop: 175,
    maxFallSpeedDesktop: 235,
    minFallSpeedMobile: 150,
    maxFallSpeedMobile: 200,
    maxConcurrentFoodDesktop: 7,
    maxConcurrentFoodMobile: 5
  };

  let GAME_FEATURES = Object.assign({}, DEFAULT_GAME_FEATURES, (typeof window !== "undefined" && window.GAME_FEATURES) || {});
  let GAME_CONFIG = Object.assign({}, DEFAULT_GAME_CONFIG, (typeof window !== "undefined" && window.GAME_CONFIG) || {});

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

  // Dynamic Enhanced Gameplay State
  let consecutiveCatches = 0;
  let foodCaughtCount = 0;
  let itemsSpawnedTotal = 0;
  let roundEvents = [];
  let isDevTestRound = false;

  // Scoring calculation helper
  function getCatchScoring(itemType) {
    if (typeof window !== "undefined" && typeof window.calculateCatchPoints === "function") {
      return window.calculateCatchPoints(itemType, consecutiveCatches, GAME_FEATURES, GAME_CONFIG);
    }
    const allDisabled = !GAME_FEATURES.goldenMandi && !GAME_FEATURES.comboCatch && !GAME_FEATURES.floatingScores && !GAME_FEATURES.bomb;
    if (allDisabled) {
      if (itemType === "bomb") {
        return { awardedPoints: 0, basePoints: 0, comboMultiplier: 1, isBomb: true };
      }
      return { awardedPoints: 1, basePoints: 1, comboMultiplier: 1, isBomb: false };
    }
    if (itemType === "bomb") {
      const penalty = GAME_FEATURES.bomb ? (GAME_CONFIG.bombPoints || -10) : 0;
      return { awardedPoints: penalty, basePoints: penalty, comboMultiplier: 1, isBomb: true };
    }
    let comboMultiplier = 1;
    if (GAME_FEATURES.comboCatch && consecutiveCatches >= (GAME_CONFIG.comboActivationCount || 5)) {
      comboMultiplier = GAME_CONFIG.comboMultiplier || 2;
    }
    const base = (itemType === "golden-mandi" && GAME_FEATURES.goldenMandi)
      ? (GAME_CONFIG.goldenMandiPoints || 3)
      : (GAME_CONFIG.normalFoodPoints || 1);
    return { awardedPoints: base * comboMultiplier, basePoints: base, comboMultiplier, isBomb: false };
  }

  // Update HUD Enhancement Indicators (Combo x2 Only)
  function updateEnhancementsHUD(justBumpedCombo = false) {
    const isComboActive = Boolean(GAME_FEATURES.comboCatch && consecutiveCatches >= (GAME_CONFIG.comboActivationCount || 5));

    if (hudEnhancementsStrip) {
      hudEnhancementsStrip.style.display = isComboActive ? "flex" : "none";
    }

    if (hudComboEl && hudComboValEl) {
      if (isComboActive) {
        hudComboEl.style.display = "inline-flex";
        hudComboValEl.textContent = `x${GAME_CONFIG.comboMultiplier || 2}`;

        if (justBumpedCombo) {
          hudComboEl.classList.remove("is-bumped");
          void hudComboEl.offsetWidth;
          hudComboEl.classList.add("is-bumped");
        }
      } else {
        hudComboEl.style.display = "none";
      }
    }
  }

  // Floating Popup Animation Helper (smooth upward movement, auto-removed from DOM)
  function spawnFloatingPopup(text, className = "is-floating-score", x = 0, y = 0, duration = 650) {
    if (!GAME_FEATURES.floatingScores || !gamePlayArea) return;
    const popup = document.createElement("div");
    popup.className = `catch-popup ${className}`;
    popup.textContent = text;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    gamePlayArea.appendChild(popup);
    setTimeout(() => {
      if (popup.parentNode) popup.remove();
    }, duration);
  }

  // Bucket Physics & Interaction State
  let bucketX = 0; // Horizontal center of bucket relative to play area
  let isDraggingBucket = false;
  let dragOffsetX = 0;
  let hasMovedBucket = false;
  let activePointerId = null;
  let cachedPlayAreaRect = null;

  function updatePlayAreaRect() {
    if (gamePlayArea) {
      cachedPlayAreaRect = gamePlayArea.getBoundingClientRect();
    }
  }

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

  // Populate active offer details
  function applyOfferContent() {
    currentOffer = (demoOffers && demoOffers[0]) || {
      badge: "YOUR FEAST REWARD",
      title: "Complimentary Yemeni Delicacy",
      description: "Enjoy a special feast reward with your dine-in experience.",
      instructions: "Show this screen to our staff to claim your reward."
    };

    const offerBadgeEl = document.getElementById("offer-badge");
    if (offerBadgeEl) {
      if (currentOffer.badge) offerBadgeEl.textContent = currentOffer.badge;
      offerBadgeEl.style.display = "none";
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
    if (!cachedPlayAreaRect) updatePlayAreaRect();
    const rect = cachedPlayAreaRect;
    if (!rect || rect.width <= 0) return;

    const metrics = getPlayfieldMetrics();
    const halfWidth = metrics.bucketWidth / 2;
    const minX = halfWidth + 6;
    const maxX = rect.width - halfWidth - 6;

    // Smooth edge compensation:
    // Blend offset towards 0 as finger approaches either wall so the bucket
    // can smoothly reach 100% of both left and right edges without sticking.
    let effectiveOffset = offset;
    const touchXInArea = clientX - rect.left;
    const edgeMargin = halfWidth * 1.5;
    if (touchXInArea < edgeMargin) {
      effectiveOffset = offset * Math.max(0, touchXInArea / edgeMargin);
    } else if (touchXInArea > rect.width - edgeMargin) {
      effectiveOffset = offset * Math.max(0, (rect.width - touchXInArea) / edgeMargin);
    }

    const rawX = touchXInArea - effectiveOffset;
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
    updatePlayAreaRect();
    const rect = cachedPlayAreaRect;
    bucketX = rect && rect.width > 0 ? rect.width / 2 : 200;
    [bucketRear, bucketFront].forEach((b) => {
      if (!b) return;
      b.style.left = `${bucketX}px`;
      b.classList.remove("is-moving-left", "is-moving-right");
    });
  }

  /**
   * Create falling bomb hazard item DOM element.
   * Arcade-style dark bomb body, metallic collar, curved fuse, animated fuse spark, and warning tag.
   */
  function createBombElement(metrics) {
    const el = document.createElement("div");
    el.className = "falling-bomb-item";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Bomb Hazard");

    const svgWrap = document.createElement("div");
    svgWrap.className = "bomb-svg-wrap";
    svgWrap.innerHTML = `
      <svg viewBox="0 0 64 64" width="56" height="56" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id="bombGrad" cx="38%" cy="38%" r="60%">
            <stop offset="0%" stop-color="#4B5563" />
            <stop offset="30%" stop-color="#1F2937" />
            <stop offset="85%" stop-color="#111827" />
            <stop offset="100%" stop-color="#030712" />
          </radialGradient>
          <radialGradient id="sparkGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#FFF" />
            <stop offset="40%" stop-color="#FFDD57" />
            <stop offset="80%" stop-color="#FF4D4F" />
            <stop offset="100%" stop-color="rgba(255, 77, 79, 0)" />
          </radialGradient>
        </defs>
        <!-- Fuse Rope -->
        <path d="M34 18 C36 12 44 14 46 8" stroke="#D97706" stroke-width="2.5" stroke-linecap="round" fill="none" />
        <!-- Spark at Fuse Tip -->
        <circle class="bomb-fuse-spark" cx="46" cy="8" r="4.5" fill="url(#sparkGrad)" />
        <!-- Bomb Neck/Collar -->
        <rect x="29" y="16" width="10" height="5" rx="1.5" fill="#374151" stroke="#4B5563" stroke-width="1" />
        <!-- Bomb Spherical Body -->
        <circle cx="34" cy="38" r="22" fill="url(#bombGrad)" stroke="#374151" stroke-width="1.5" />
        <!-- Specular Highlight Shine -->
        <ellipse cx="28" cy="28" rx="6" ry="3.5" transform="rotate(-30 28 28)" fill="#9CA3AF" opacity="0.45" />
        <!-- Danger Flame in Gold -->
        <path d="M34 32 C31 35 29 38 29 42 C29 45 31.2 47 34 47 C36.8 47 39 45 39 42 C39 38 37 35 34 32 Z" fill="#F59E0B" opacity="0.9" />
      </svg>
    `;

    const label = document.createElement("span");
    label.className = "bomb-name-tag";
    label.textContent = "BOMB -10";

    el.appendChild(svgWrap);
    el.appendChild(label);
    return el;
  }

  /**
   * Create falling food DOM element using the real PNG image + food name label beneath it.
   * Both move together as a single unified falling object.
   * Labels stay horizontal and readable without unwanted rotation.
   */
  function createFoodElement(config, metrics) {
    const el = document.createElement("div");
    const isGoldenMandi = (config.id === "golden-mandi");
    el.className = "falling-food-item" + (isGoldenMandi ? " is-golden-mandi" : "");
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

  // Spawn a Falling Item from the top (supports normal food, golden-mandi, or bomb hazard)
  function spawnFoodItem(forceType = null) {
    if (!gamePlayArea || !fallingItemsLayer) return;
    const metrics = getPlayfieldMetrics();
    const maxAllowed = metrics.isMobile
      ? GAME_CONFIG.maxConcurrentFoodMobile
      : GAME_CONFIG.maxConcurrentFoodDesktop;

    if (!forceType && fallingItems.length >= maxAllowed) return;

    itemsSpawnedTotal++;
    const rect = gamePlayArea.getBoundingClientRect();
    const minX = 18;
    const maxX = Math.max(minX + 30, rect.width - metrics.containerWidth - 18);

    let startX = minX + Math.random() * (maxX - minX);
    if (Math.abs(startX - lastSpawnX) < metrics.containerWidth * 1.4) {
      startX = startX > rect.width / 2
        ? minX + Math.random() * (rect.width / 2 - minX - metrics.containerWidth)
        : rect.width / 2 + Math.random() * (maxX - rect.width / 2);
      startX = Math.max(minX, Math.min(maxX, startX));
    }
    lastSpawnX = startX;

    const minSpeed = metrics.isMobile ? GAME_CONFIG.minFallSpeedMobile : GAME_CONFIG.minFallSpeedDesktop;
    const maxSpeed = metrics.isMobile ? GAME_CONFIG.maxFallSpeedMobile : GAME_CONFIG.maxFallSpeedDesktop;
    const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);

    // Check item type determination:
    let isBomb = false;
    let isGoldenMandi = false;

    if (forceType === "bomb") {
      isBomb = true;
    } else if (forceType === "golden-mandi") {
      isGoldenMandi = true;
    } else {
      // 1. Roll Bomb Hazard if enabled and no bomb currently falling (exactly 2.5% chance, max 1 active)
      const hasFallingBomb = fallingItems.some(i => i.isBomb);
      if (
        GAME_FEATURES.bomb &&
        !hasFallingBomb &&
        Math.random() < (GAME_CONFIG.bombSpawnChance || 0.025)
      ) {
        isBomb = true;
      }
      // 2. Roll Golden Mandi if enabled, not a bomb, and no golden mandi currently falling (exactly 1.5% chance, max 1 active)
      const hasFallingMandi = fallingItems.some(i => i.isGoldenMandi);
      if (
        !isBomb &&
        GAME_FEATURES.goldenMandi &&
        !hasFallingMandi &&
        Math.random() < (GAME_CONFIG.goldenMandiSpawnChance || 0.015)
      ) {
        isGoldenMandi = true;
      }
    }

    if (isBomb) {
      const el = createBombElement(metrics);
      const startY = -metrics.containerHeight;
      el.style.transform = `translate3d(${startX}px, ${startY}px, 0)`;
      fallingItemsLayer.appendChild(el);

      fallingItems.push({
        el,
        x: startX,
        y: startY,
        imageHeight: 56,
        containerWidth: metrics.containerWidth,
        containerHeight: metrics.containerHeight,
        vy: speed * 1.05,
        caught: false,
        missed: false,
        isBomb: true,
        isGoldenMandi: false,
        itemType: "bomb"
      });
      return;
    }

    // Food item (normal or golden mandi)
    const baseFood = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
    const foodConfig = isGoldenMandi ? {
      id: "golden-mandi",
      name: "Golden Mandi",
      image: baseFood.image
    } : baseFood;

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
      missed: false,
      isBomb: false,
      isGoldenMandi,
      itemType: isGoldenMandi ? "golden-mandi" : "normal"
    });
  }

  // Handle successful item catch — Food visibly drops into the open bucket interior
  function handleCatch(item, index) {
    if (item.caught || gameState !== "playing") return;
    item.caught = true;

    const eventTime = Math.max(0, Math.round(performance.now() - roundStartTime));
    const catchCenterX = item.x + item.containerWidth / 2;
    const catchCenterY = item.y;

    // Bucket pulse feedback
    [bucketRear, bucketFront].forEach((b) => {
      if (!b) return;
      b.classList.remove("is-caught-pulse");
      void b.offsetWidth;
      b.classList.add("is-caught-pulse");
    });

    // 1. Handling Bomb Hazard Catch (-10 points, resets combo, no miss, no food count)
    if (item.isBomb) {
      if (GAME_FEATURES.bomb) {
        score = Math.max(0, score + (GAME_CONFIG.bombPoints || -10));
        consecutiveCatches = 0; // Reset combo streak!
        updateEnhancementsHUD();

        Sound.bombHit();

        if (GAME_FEATURES.floatingScores) {
          spawnFloatingPopup("-10", "is-bomb-deduction", catchCenterX, catchCenterY, 750);
        }

        roundEvents.push({
          type: "catch",
          itemType: "bomb",
          timestamp: eventTime
        });
      }
    }
    // 2. Handling Food Catch (Normal Food or Golden Mandi)
    else {
      foodCaughtCount++;
      consecutiveCatches++;

      const hitComboActivation = (consecutiveCatches === (GAME_CONFIG.comboActivationCount || 5));
      const scoring = getCatchScoring(item.itemType);
      score += scoring.awardedPoints;

      // Play sound
      if (item.isGoldenMandi) {
        Sound.goldenMandiCatch();
      } else {
        Sound.normalCatch();
      }

      // Combo activation effect
      if (hitComboActivation && GAME_FEATURES.comboCatch) {
        Sound.comboActivation();
        updateEnhancementsHUD(true);
        if (GAME_FEATURES.floatingScores) {
          setTimeout(() => spawnFloatingPopup("COMBO x2!", "is-combo-popup", catchCenterX, catchCenterY - 24, 750), 120);
        }
      } else {
        updateEnhancementsHUD(false);
      }

      // Record telemetry for server-side verification
      roundEvents.push({
        type: "catch",
        itemType: item.itemType,
        timestamp: eventTime
      });

      // Floating Scores
      if (GAME_FEATURES.floatingScores) {
        if (item.isGoldenMandi && GAME_FEATURES.goldenMandi) {
          spawnFloatingPopup(`+${scoring.awardedPoints} BONUS!`, "is-golden-bonus", catchCenterX, catchCenterY, 750);
        } else {
          spawnFloatingPopup(`+${scoring.awardedPoints}`, "is-floating-score", catchCenterX, catchCenterY, 650);
        }
      } else {
        // Fallback popup if all features disabled: show simple +1
        const allDisabled = !GAME_FEATURES.goldenMandi && !GAME_FEATURES.comboCatch && !GAME_FEATURES.floatingScores && !GAME_FEATURES.bomb;
        if (allDisabled) {
          const popup = document.createElement("div");
          popup.className = "catch-popup";
          popup.textContent = "+1";
          popup.style.left = `${catchCenterX}px`;
          popup.style.top = `${catchCenterY}px`;
          gamePlayArea.appendChild(popup);
          setTimeout(() => popup.remove(), 550);
        }
      }
    }

    // Update Live Score on HUD immediately with pop animation
    if (gameScoreEl) {
      gameScoreEl.textContent = String(score);
      gameScoreEl.classList.remove("pop");
      void gameScoreEl.offsetWidth;
      gameScoreEl.classList.add("pop");
    }

    // Trigger visual pop animation on the caught item
    const currentTransform = `translate3d(${item.x}px, ${item.y}px, 0)`;
    item.el.style.setProperty("--current-transform", currentTransform);
    item.el.classList.add("is-caught");

    setTimeout(() => {
      if (item.el && item.el.parentNode) {
        item.el.remove();
      }
    }, 360);

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
      item.el.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;

      // Collision calculated based strictly on item reaching the rim
      const itemBottom = item.y + (item.isBomb ? 50 : item.imageHeight * 0.90);
      const itemCenter = item.x + item.containerWidth / 2;

      // 1. Successful Catch Check
      if (
        itemBottom >= catchTop &&
        itemBottom <= catchBottom &&
        itemCenter >= bucketLeft &&
        itemCenter <= bucketRight
      ) {
        handleCatch(item, i);
        continue;
      }

      // 2. Item leaves bottom of playfield
      if (item.y > areaHeight + 25) {
        if (!item.caught && !item.missed) {
          item.missed = true;

          // Safe avoidance for bomb: no penalty, no miss count increment, no combo reset!
          if (item.isBomb) {
            roundEvents.push({
              type: "miss",
              itemType: "bomb",
              timestamp: Math.max(0, Math.round(performance.now() - roundStartTime))
            });
          } else {
            // Food item miss (Normal or Golden Mandi)
            missedCount++;
            updateMissesDisplay();

            // Reset combo streak on food miss
            if (GAME_FEATURES.comboCatch) {
              consecutiveCatches = 0;
              updateEnhancementsHUD();
            }

            if (missedCount === 4) {
              Sound.missWarning();
            }

            roundEvents.push({
              type: "miss",
              itemType: item.itemType || "normal",
              timestamp: Math.max(0, Math.round(performance.now() - roundStartTime))
            });

            if (missedCount >= MAX_MISSES) {
              item.el.remove();
              fallingItems.splice(i, 1);
              Sound.gameOver();
              endGameLoss();
              return;
            }
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

  function stopDraggingBucket(event) {
    if (activePointerId !== null && event && event.pointerId !== undefined && event.pointerId !== activePointerId) {
      return;
    }
    isDraggingBucket = false;
    dragOffsetX = 0;
    activePointerId = null;
    [bucketRear, bucketFront].forEach((b) => {
      if (b) b.classList.remove("is-moving-left", "is-moving-right");
    });
    try {
      if (gamePlayArea && event && event.pointerId !== undefined && gamePlayArea.hasPointerCapture(event.pointerId)) {
        gamePlayArea.releasePointerCapture(event.pointerId);
      }
    } catch (_) {}
  }

  // Start / Restart Catch the Feast game
  function startGame() {
    stopDraggingBucket();
    updatePlayAreaRect();

    // Advance round identifier so any in-flight background submissions from previous rounds are discarded
    currentRoundId++;

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

    // Reset game round state completely - zero score carryover
    gameState = "playing";
    score = 0;
    missedCount = 0;
    consecutiveCatches = 0;
    foodCaughtCount = 0;
    itemsSpawnedTotal = 0;
    roundEvents = [];
    spawnCooldown = 0.22; // First food item spawns promptly
    lastFrameTime = 0;
    hasMovedBucket = false;
    roundStartTime = performance.now();
    pendingScoreSubmission = null;
    currentGameSessionId = null;

    updateEnhancementsHUD();

    // Reset Container & Reward Card State
    try {
      sessionStorage.removeItem("soofi_mandi_active_view");
      sessionStorage.removeItem("soofi_mandi_current_session_id");
    } catch (_) {}

    if (rewardScoreNumber) {
      rewardScoreNumber.textContent = "0 / 100";
    }
    if (rewardScoreSummary) {
      rewardScoreSummary.textContent = "Reach 100 points to unlock your reward!";
    }
    if (rewardResultHeader) {
      rewardResultHeader.style.display = "";
    }
    if (rewardCard) {
      rewardCard.classList.remove("is-loss", "is-offer-unlocked", "is-offer-revealed");
      rewardCard.setAttribute("aria-hidden", "true");
    }
    if (rewardLockedWrap) {
      rewardLockedWrap.style.display = "none";
    }
    if (rewardUnlockBanner) {
      rewardUnlockBanner.style.display = "none";
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
    stopDraggingBucket();
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

    if (hudEnhancementsStrip) hudEnhancementsStrip.style.display = "none";

    // Preserve the actual final score for THIS isolated round
    const thisRoundId = currentRoundId;
    const finalScore = score;
    const finalCaught = foodCaughtCount;
    const finalEvents = [...roundEvents];
    const wasDevRound = Boolean(isDevTestRound);
    const scoreSummaryText = finalCaught === 1 ? "You caught 1 food item!" : `You caught ${finalCaught} food items!`;

    // 1. Update Results Interstitial Screen (if queried)
    if (interstitialScoreVal) interstitialScoreVal.textContent = String(finalScore);
    if (interstitialScoreDesc) interstitialScoreDesc.textContent = scoreSummaryText;

    // 2. Update Reward Card Score Section with exact final score format: <score> / 100
    if (rewardResultHeader) {
      rewardResultHeader.style.display = "";
    }
    if (rewardScoreNumber) rewardScoreNumber.textContent = `${finalScore} / 100`;

    // Reset card class states
    if (rewardCard) {
      rewardCard.classList.remove("is-loss", "is-offer-unlocked", "is-offer-revealed");
      rewardCard.setAttribute("aria-hidden", "false");
    }

    if (rewardKicker) {
      rewardKicker.textContent = "GAME OVER";
    }

    // 3. Configure Card based on final score >= 100
    if (finalScore >= 100) {
      if (rewardCard) {
        rewardCard.classList.add("is-offer-unlocked");
      }
      if (rewardScoreSummary) {
        rewardScoreSummary.textContent = "Congratulations! You've unlocked a reward.";
      }
      if (unlockScoreVal) {
        unlockScoreVal.textContent = String(finalScore);
      }
      if (unlockOfferBtn) {
        unlockOfferBtn.disabled = false;
        unlockOfferBtn.removeAttribute("aria-disabled");
        unlockOfferBtn.style.display = "";
      }
      if (rewardLockedWrap) {
        rewardLockedWrap.style.display = "none";
      }
      if (rewardUnlockBanner) {
        rewardUnlockBanner.style.display = "flex";
      }
      if (rewardOfferCard) {
        rewardOfferCard.style.display = "none";
      }
      if (rewardLossHeadline) {
        rewardLossHeadline.style.display = "none";
      }
    } else {
      if (rewardCard) {
        rewardCard.classList.add("is-loss");
      }
      if (rewardLossHeadline) {
        rewardLossHeadline.style.display = "none";
      }
      if (rewardScoreSummary) {
        rewardScoreSummary.textContent = "Reach 100 points to unlock your reward!";
      }
      if (rewardLockedWrap) {
        rewardLockedWrap.style.display = "flex";
      }
      if (offerLockedBtn) {
        offerLockedBtn.disabled = true;
        offerLockedBtn.setAttribute("aria-disabled", "true");
        offerLockedBtn.style.display = "";
      }
      if (rewardUnlockBanner) {
        rewardUnlockBanner.style.display = "none";
      }
      if (rewardOfferCard) {
        rewardOfferCard.style.display = "none";
      }
    }

    // 4. Reveal the Result Screen
    switchView(null, "revealed");

    // 5. Track event and submit score to global leaderboard
    const elapsedSeconds = Math.max(1, Math.round((performance.now() - roundStartTime) / 1000));
    trackEvent("game_loss", {
      score: finalScore,
      foodCaught: finalCaught,
      missedCount: MAX_MISSES,
      durationSeconds: elapsedSeconds
    });
    trackEvent("game_complete", {
      score: finalScore,
      foodCaught: finalCaught,
      missedCount: MAX_MISSES,
      durationSeconds: elapsedSeconds
    });
    pendingScoreSubmission = submitScore(finalScore, finalCaught, MAX_MISSES, elapsedSeconds, finalEvents, wasDevRound, thisRoundId);
    isDevTestRound = false;
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
    stopDraggingBucket();
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
    currentGameSessionId = null;

    try {
      sessionStorage.removeItem("soofi_mandi_active_view");
    } catch (_) {}

    if (rewardCard) {
      rewardCard.classList.remove("is-loss", "is-offer-unlocked", "is-offer-revealed");
      rewardCard.setAttribute("aria-hidden", "true");
    }
    if (rewardUnlockBanner) {
      rewardUnlockBanner.style.display = "none";
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
      updatePlayAreaRect();
      isDraggingBucket = true;
      activePointerId = event.pointerId;

      const rect = cachedPlayAreaRect || gamePlayArea.getBoundingClientRect();
      const currentTouchX = event.clientX - rect.left;
      const metrics = getPlayfieldMetrics();

      // If touched on or near bucket, smoothly track offset so the bucket NEVER jumps!
      if (Math.abs(currentTouchX - bucketX) < metrics.bucketWidth * 0.8) {
        dragOffsetX = currentTouchX - bucketX;
      } else {
        dragOffsetX = 0;
        setBucketPosition(event.clientX, 0);
      }

      try {
        gamePlayArea.setPointerCapture(event.pointerId);
      } catch (_) {}
    }, { passive: false });

    gamePlayArea.addEventListener("pointermove", (event) => {
      if (gameState !== "playing") return;
      if (activePointerId !== null && event.pointerId !== activePointerId) return;
      if (isDraggingBucket || event.pointerType === "mouse") {
        setBucketPosition(event.clientX, isDraggingBucket ? dragOffsetX : 0);
      }
    }, { passive: true });

    gamePlayArea.addEventListener("pointerup", stopDraggingBucket);
    gamePlayArea.addEventListener("pointercancel", stopDraggingBucket);
    gamePlayArea.addEventListener("lostpointercapture", stopDraggingBucket);

    // Window-level safety listeners in case pointer leaves or capture is dropped by browser
    window.addEventListener("pointermove", (event) => {
      if (gameState !== "playing" || !isDraggingBucket) return;
      if (activePointerId !== null && event.pointerId !== activePointerId) return;
      setBucketPosition(event.clientX, dragOffsetX);
    }, { passive: true });

    window.addEventListener("pointerup", stopDraggingBucket);
    window.addEventListener("pointercancel", stopDraggingBucket);

    // Keyboard Controls for Bucket (Accessibility: Left/Right Arrow Keys)
    window.addEventListener("keydown", (event) => {
      if (gameState !== "playing") return;
      if (!cachedPlayAreaRect) updatePlayAreaRect();
      const rect = cachedPlayAreaRect || gamePlayArea.getBoundingClientRect();
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
    updatePlayAreaRect();
    if (gamePlayArea && bucketFront) {
      const rect = cachedPlayAreaRect || gamePlayArea.getBoundingClientRect();
      const metrics = getPlayfieldMetrics();
      const halfWidth = metrics.bucketWidth / 2;
      bucketX = Math.max(halfWidth + 6, Math.min(rect.width - halfWidth - 6, bucketX));
      [bucketRear, bucketFront].forEach((b) => {
        if (b) b.style.left = `${bucketX}px`;
      });
    }
  });

  window.addEventListener("scroll", () => {
    updatePlayAreaRect();
  }, { passive: true });

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
    playerNameInput.addEventListener("input", () => {
      clearPlayerNameFeedback();
    });
    playerNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        savePlayerName();
      }
    });
  }

  // Keyboard navigation for modal (ESC key to dismiss)
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (leaderboardModal && leaderboardModal.classList.contains("is-open")) {
        closeLeaderboard();
      }
      if (claimModal && claimModal.classList.contains("is-open")) {
        closeClaimModal();
      }
    }
  });

  // =========================================================================
  // CUSTOMER OFFER UNLOCK & CLAIM MODAL LOGIC
  // Flow: Score 100+ -> Unlock My Offer -> Customer Details Form ->
  //       Continue -> Reveal Special Offer -> Save Claim to Neon PostgreSQL
  // =========================================================================

  function openClaimModal() {
    if (!claimModal) return;
    claimModal.classList.add("is-open");
    claimModal.setAttribute("aria-hidden", "false");

    clearClaimErrors();

    // Auto-fill existing player name if set and not generic guest
    if (claimNameInput && !claimNameInput.value) {
      if (playerDisplayName && !playerDisplayName.startsWith("MandiGuest_")) {
        claimNameInput.value = playerDisplayName;
      }
    }

    // Auto-focus the first field
    if (claimNameInput) {
      setTimeout(() => claimNameInput.focus(), 80);
    }

    trackEvent("claim_modal_open", { score, gameSessionId: currentGameSessionId });
  }

  function closeClaimModal() {
    if (!claimModal) return;
    claimModal.classList.remove("is-open");
    claimModal.setAttribute("aria-hidden", "true");
    clearClaimErrors();
  }

  function clearClaimErrors() {
    if (claimNameError) claimNameError.textContent = "";
    if (claimPhoneError) claimPhoneError.textContent = "";
    if (claimEmailError) claimEmailError.textContent = "";
    if (claimAlertError) {
      claimAlertError.textContent = "";
      claimAlertError.style.display = "none";
    }
    if (claimNameInput) claimNameInput.classList.remove("is-invalid");
    if (claimPhoneInput) claimPhoneInput.classList.remove("is-invalid");
    if (claimEmailInput) claimEmailInput.classList.remove("is-invalid");
  }

  function validateClaimForm() {
    clearClaimErrors();

    const fullName = (claimNameInput ? claimNameInput.value : "").trim();
    const phone = (claimPhoneInput ? claimPhoneInput.value : "").trim();
    const email = (claimEmailInput ? claimEmailInput.value : "").trim();

    let isValid = true;

    // 1. Full Name: Required, min 2 characters
    if (!fullName || fullName.length < 2) {
      if (claimNameError) claimNameError.textContent = "Please enter your full name (minimum 2 characters).";
      if (claimNameInput) claimNameInput.classList.add("is-invalid");
      isValid = false;
    }

    // 2. Mobile Number: Required, 7 to 15 digits
    const phoneDigits = phone.replace(/\D/g, "");
    if (!phone || phoneDigits.length < 7 || phoneDigits.length > 15 || !/^[+]?[\d\s\-()]+$/.test(phone)) {
      if (claimPhoneError) claimPhoneError.textContent = "Please enter a valid mobile number (7 to 15 digits).";
      if (claimPhoneInput) claimPhoneInput.classList.add("is-invalid");
      isValid = false;
    }

    // 3. Email: Optional, valid format if provided
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
        if (claimEmailError) claimEmailError.textContent = "Please enter a valid email address or leave blank.";
        if (claimEmailInput) claimEmailInput.classList.add("is-invalid");
        isValid = false;
      }
    }

    if (!isValid) {
      if (claimNameInput && claimNameInput.classList.contains("is-invalid")) {
        claimNameInput.focus();
      } else if (claimPhoneInput && claimPhoneInput.classList.contains("is-invalid")) {
        claimPhoneInput.focus();
      } else if (claimEmailInput) {
        claimEmailInput.focus();
      }
    }

    return { isValid, fullName, phone, email };
  }

  async function handleClaimSubmit(event) {
    if (event) event.preventDefault();

    const { isValid, fullName, phone, email } = validateClaimForm();
    if (!isValid) return;

    // Ensure server-side score session ID is settled
    if (!currentGameSessionId && pendingScoreSubmission) {
      try {
        await pendingScoreSubmission;
      } catch (_) {}
    }

    if (!currentGameSessionId) {
      if (claimAlertError) {
        claimAlertError.textContent = "Score verification in progress. Please tap CONTINUE again.";
        claimAlertError.style.display = "block";
      }
      return;
    }

    // Set loading state to prevent duplicate submissions
    if (claimSubmitBtn) claimSubmitBtn.disabled = true;
    if (claimSpinner) claimSpinner.style.display = "inline-block";
    if (claimSubmitText) claimSubmitText.textContent = "CLAIMING...";

    try {
      const response = await fetch("/api/offers/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSessionId: currentGameSessionId,
          playerId,
          fullName,
          mobileNumber: phone,
          email: email || null
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMsg = data.message || "Unable to claim offer. Please try again.";
        if (claimAlertError) {
          claimAlertError.textContent = errorMsg;
          claimAlertError.style.display = "block";
        }
        if (claimSubmitBtn) claimSubmitBtn.disabled = false;
        if (claimSpinner) claimSpinner.style.display = "none";
        if (claimSubmitText) claimSubmitText.textContent = "CONTINUE";
        return;
      }

      // Claim Successful!
      const claim = data.claim;
      currentClaim = claim;

      try {
        localStorage.setItem("soofi_mandi_latest_claim", JSON.stringify(claim));
      } catch (_) {}

      // Update player display name if currently a guest
      if (fullName && (!playerDisplayName || playerDisplayName.startsWith("MandiGuest_"))) {
        playerDisplayName = fullName.substring(0, 20);
        try {
          localStorage.setItem("soofi_mandi_display_name", playerDisplayName);
        } catch (_) {}
        updateDisplayNameUI(playerDisplayName);
      }

      // Close modal
      closeClaimModal();

      // Trigger Celebration Confetti Passing visibly in front
      triggerFullScreenConfetti();

      // Reveal celebratory Special Offer view
      revealSpecialOffer(claim);

    } catch (err) {
      if (claimAlertError) {
        claimAlertError.textContent = "Network error. Please check your connection and try again.";
        claimAlertError.style.display = "block";
      }
    } finally {
      if (claimSubmitBtn) claimSubmitBtn.disabled = false;
      if (claimSpinner) claimSpinner.style.display = "none";
      if (claimSubmitText) claimSubmitText.textContent = "CONTINUE";
    }
  }

  function revealSpecialOffer(claim) {
    if (!claim) return;

    if (rewardCard) {
      rewardCard.classList.remove("is-loss", "is-offer-unlocked");
      rewardCard.classList.add("is-offer-revealed");
      rewardCard.setAttribute("aria-hidden", "false");
    }

    if (rewardKicker) {
      rewardKicker.textContent = "✦ OFFER REVEALED ✦";
    }

    // Completely remove score header and offer buttons from the final reveal screen
    if (rewardResultHeader) {
      rewardResultHeader.style.display = "none";
    }
    if (rewardLockedWrap) {
      rewardLockedWrap.style.display = "none";
    }
    if (rewardUnlockBanner) {
      rewardUnlockBanner.style.display = "none";
    }
    if (offerLockedBtn) {
      offerLockedBtn.style.display = "none";
    }
    if (unlockOfferBtn) {
      unlockOfferBtn.style.display = "none";
    }
    if (rewardLossHeadline) {
      rewardLossHeadline.style.display = "none";
    }

    const offer = claim.offer || (demoOffers && demoOffers[0]) || {
      badge: "YOUR FEAST REWARD",
      title: "Complimentary Yemeni Delicacy",
      description: "Enjoy a special feast reward with your dine-in experience.",
      instructions: "Show this screen to our staff to claim your reward."
    };

    const offerBadgeEl = document.getElementById("offer-badge");
    if (offerBadgeEl) {
      offerBadgeEl.textContent = offer.badge || "YOUR FEAST REWARD";
      offerBadgeEl.style.display = "none";
    }

    const congratsHeadingEl = document.getElementById("offer-congrats-heading");
    if (congratsHeadingEl) {
      congratsHeadingEl.textContent = "🎉 CONGRATULATIONS!";
    }

    const congratsSubEl = document.getElementById("offer-congrats-sub");
    if (congratsSubEl) {
      congratsSubEl.textContent = "You've unlocked a special reward!";
    }

    const offerTitleEl = document.getElementById("offer-title");
    if (offerTitleEl && offer.title) {
      offerTitleEl.textContent = offer.title;
    }

    const offerDescEl = document.getElementById("offer-description");
    if (offerDescEl && offer.description) {
      offerDescEl.textContent = offer.description;
    }

    const offerClaimCodeEl = document.getElementById("offer-claim-code");
    if (offerClaimCodeEl) {
      const codeStr = claim.claimId
        ? claim.claimId.replace(/^claim_/, "SOOFI-").toUpperCase().substring(0, 16)
        : "SOOFI-REWARD";
      offerClaimCodeEl.textContent = codeStr;
    }

    const instructionsEl = document.getElementById("offer-instructions-text");
    if (instructionsEl) {
      instructionsEl.textContent = offer.instructions || "Show this screen to our staff to claim your reward.";
    }

    if (rewardOfferCard) {
      rewardOfferCard.style.display = "flex";
    }

    try {
      sessionStorage.setItem("soofi_mandi_active_view", "revealed");
      sessionStorage.setItem("soofi_mandi_current_session_id", claim.gameSessionId || "");
    } catch (_) {}

    switchView(null, "revealed");
  }

  function restoreSavedClaimIfActive() {
    try {
      const activeView = sessionStorage.getItem("soofi_mandi_active_view");
      const savedClaimRaw = localStorage.getItem("soofi_mandi_latest_claim");
      if (activeView === "revealed" && savedClaimRaw) {
        const savedClaim = JSON.parse(savedClaimRaw);
        if (savedClaim && savedClaim.claimId) {
          currentClaim = savedClaim;
          currentGameSessionId = savedClaim.gameSessionId || null;
          revealSpecialOffer(savedClaim);
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // Offer Flow Event Listeners
  if (unlockOfferBtn) {
    unlockOfferBtn.addEventListener("click", () => {
      trackEvent("cta_click", { target: "unlock_my_offer" });
      openClaimModal();
    });
  }

  if (closeClaimModalBtn) {
    closeClaimModalBtn.addEventListener("click", closeClaimModal);
  }

  if (cancelClaimBtn) {
    cancelClaimBtn.addEventListener("click", closeClaimModal);
  }

  if (claimModal) {
    claimModal.addEventListener("click", (event) => {
      if (event.target === claimModal) {
        closeClaimModal();
      }
    });
  }

  if (claimForm) {
    claimForm.addEventListener("submit", handleClaimSubmit);
  }

  // Clear validation styling when user starts correcting inputs
  [
    { el: claimNameInput, err: claimNameError },
    { el: claimPhoneInput, err: claimPhoneError },
    { el: claimEmailInput, err: claimEmailError }
  ].forEach(({ el, err }) => {
    if (el) {
      el.addEventListener("input", () => {
        el.classList.remove("is-invalid");
        if (err) err.textContent = "";
        if (claimAlertError) claimAlertError.style.display = "none";
      });
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

  // Initialize: Restore revealed offer if previously active during session, otherwise Intro Screen
  const restored = restoreSavedClaimIfActive();
  if (!restored) {
    switchView(viewIntro, "intro");
  }
  // Development Testing Helper (Active only in local development / localhost or ?dev=true)
  const isLocalDev = Boolean(
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
     window.location.hostname === "127.0.0.1" ||
     window.location.hostname.startsWith("192.168.") ||
     window.location.hostname.endsWith(".local") ||
     window.location.search.includes("dev=true"))
  );

  function forceSpawnGoldenMandi() {
    if (gameState !== "playing") return;
    spawnFoodItem("golden-mandi");
  }

  function forceSpawnBomb() {
    if (gameState !== "playing") return;
    spawnFoodItem("bomb");
  }

  function setFeatures(newFeatures = {}) {
    Object.assign(GAME_FEATURES, newFeatures);
    if (typeof window !== "undefined") {
      window.GAME_FEATURES = Object.assign({}, GAME_FEATURES);
    }
    updateEnhancementsHUD();
    syncDevCheckboxes();
  }

  function getFeatures() {
    return Object.assign({}, GAME_FEATURES);
  }

  function syncDevCheckboxes() {
    const cbGm = document.getElementById("dev-toggle-gm");
    const cbCc = document.getElementById("dev-toggle-cc");
    const cbFs = document.getElementById("dev-toggle-fs");
    const cbBm = document.getElementById("dev-toggle-bm");
    if (cbGm) cbGm.checked = Boolean(GAME_FEATURES.goldenMandi);
    if (cbCc) cbCc.checked = Boolean(GAME_FEATURES.comboCatch);
    if (cbFs) cbFs.checked = Boolean(GAME_FEATURES.floatingScores);
    if (cbBm) cbBm.checked = Boolean(GAME_FEATURES.bomb);
  }

  function testOfferUnlock(targetScore = 121) {
    if (!isLocalDev) {
      console.warn("Dev score override is disabled outside development.");
      return;
    }
    startGame();
    isDevTestRound = true;
    const simulatedDurationSeconds = Math.max(20, Math.ceil(targetScore / 2.2));
    roundStartTime = performance.now() - (simulatedDurationSeconds * 1000);
    score = targetScore;
    foodCaughtCount = targetScore;
    roundEvents = [];
    endGameLoss();
  }

  // Wire up Dev Testing Panel if in local development
  const devTestPanel = document.getElementById("dev-test-panel");
  if (devTestPanel && isLocalDev) {
    devTestPanel.style.display = "flex";
    syncDevCheckboxes();

    // Checkboxes
    const cbGm = document.getElementById("dev-toggle-gm");
    if (cbGm) cbGm.addEventListener("change", (e) => setFeatures({ goldenMandi: e.target.checked }));
    const cbCc = document.getElementById("dev-toggle-cc");
    if (cbCc) cbCc.addEventListener("change", (e) => setFeatures({ comboCatch: e.target.checked }));
    const cbFs = document.getElementById("dev-toggle-fs");
    if (cbFs) cbFs.addEventListener("change", (e) => setFeatures({ floatingScores: e.target.checked }));
    const cbBm = document.getElementById("dev-toggle-bm");
    if (cbBm) cbBm.addEventListener("change", (e) => setFeatures({ bomb: e.target.checked }));

    // All ON / All OFF
    const btnAllOn = document.getElementById("dev-btn-all-on");
    if (btnAllOn) btnAllOn.addEventListener("click", () => setFeatures({ goldenMandi: true, comboCatch: true, floatingScores: true, bomb: true }));
    const btnAllOff = document.getElementById("dev-btn-all-off");
    if (btnAllOff) btnAllOff.addEventListener("click", () => setFeatures({ goldenMandi: false, comboCatch: false, floatingScores: false, bomb: false }));

    // Spawns
    const btnSpawnMandi = document.getElementById("dev-btn-spawn-mandi");
    if (btnSpawnMandi) btnSpawnMandi.addEventListener("click", () => {
      if (gameState !== "playing") startGame();
      forceSpawnGoldenMandi();
    });
    const btnSpawnBomb = document.getElementById("dev-btn-spawn-bomb");
    if (btnSpawnBomb) btnSpawnBomb.addEventListener("click", () => {
      if (gameState !== "playing") startGame();
      forceSpawnBomb();
    });

    // Score Simulation
    const devBtn121 = document.getElementById("dev-btn-score-121");
    if (devBtn121) devBtn121.addEventListener("click", () => testOfferUnlock(121));
    const devBtn100 = document.getElementById("dev-btn-score-100");
    if (devBtn100) devBtn100.addEventListener("click", () => testOfferUnlock(100));
    const devBtn80 = document.getElementById("dev-btn-score-80");
    if (devBtn80) devBtn80.addEventListener("click", () => testOfferUnlock(80));
    const devBtnClose = document.getElementById("dev-btn-close");
    if (devBtnClose) devBtnClose.addEventListener("click", () => { devTestPanel.style.display = "none"; });
  }

  // Expose test & diagnostic hooks
  if (typeof window !== "undefined") {
    window.__soofiGame = {
      startGame,
      endGameLoss,
      submitScore,
      resetDemo,
      openClaimModal,
      closeClaimModal,
      handleClaimSubmit,
      revealSpecialOffer,
      testOfferUnlock,
      savePlayerName,
      getPlayerDisplayName: () => playerDisplayName,
      getPlayerId: () => playerId,
      forceSpawnGoldenMandi,
      forceSpawnBomb,
      setFeatures,
      getFeatures,
      getState: () => ({
        gameState,
        score,
        foodCaughtCount,
        missedCount,
        consecutiveCatches,
        currentGameSessionId,
        currentClaim,
        features: Object.assign({}, GAME_FEATURES)
      }),
      setScore: (val) => { score = val; },
      setRoundStartTime: (val) => { roundStartTime = val; }
    };
  }
})();
