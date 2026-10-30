/**
 * SOOFI MANDI — CATCH THE FEAST
 * Centralized Feature Toggles & Balanced Gameplay Configuration
 *
 * Scoring Rules:
 * - Normal Food: +1 pt (Without combo) | +2 pts (With combo x2)
 * - Golden Mandi: +3 pts (Without combo) | +6 pts (With combo x2)
 * - Bomb: -10 pts (Never multiplied, score floor at 0)
 *
 * Combo Rules:
 * - Consecutive successful catches 1–4: x1
 * - 5 or more consecutive successful catches: x2 (Max x2, no x3 or x4)
 * - Reset on missed food (normal or Golden Mandi) or caught bomb
 * - Missing bomb does NOT reset combo
 *
 * Spawning Rules:
 * - Golden Mandi: exactly 1.5% probability (max 1 active)
 * - Bomb Hazard: exactly 2.5% probability (max 1 active)
 *
 * Safe Rollback: Setting all GAME_FEATURES to false fully restores original game behavior.
 */

// Centralized Feature Toggles (Independently controllable)
const GAME_FEATURES = {
  goldenMandi: true,
  comboCatch: true,
  floatingScores: true,
  bomb: true
};

// Balanced Gameplay Constants & Tuning Parameters
const GAME_CONFIG = {
  // Base catch points
  normalFoodPoints: 1,
  goldenMandiPoints: 3,
  bombPoints: -10,

  // Feature 1: Golden Mandi
  goldenMandiSpawnChance: 0.015, // Exactly 1.5% probability

  // Feature 2: Combo Catch (x2 Only)
  comboActivationCount: 5,      // 5th consecutive catch activates x2
  comboMultiplier: 2,           // x2 multiplier only (x3 and x4 removed)

  // Feature 3: Bomb Hazard
  bombSpawnChance: 0.025,       // Exactly 2.5% probability

  // Core Game Rules (strictly preserved)
  missLimit: 5,                 // Exactly 5 misses ends game
  offerEligibilityScore: 100    // Verified score needed to unlock offer
};

/**
 * Universal Scoring Calculation Formula:
 * - Normal food: +1 (without combo) | +2 (with combo x2)
 * - Golden Mandi: +3 (without combo) | +6 (with combo x2)
 * - Bomb: -10 (deduction is never multiplied, score floor at 0)
 *
 * @param {string} itemType - 'normal' | 'golden-mandi' | 'bomb'
 * @param {number} consecutiveCatches - Current consecutive catch count
 * @param {object} features - Feature toggles
 * @param {object} config - Game config values
 * @returns {object} - { awardedPoints, basePoints, comboMultiplier, isBomb }
 */
function calculateCatchPoints(itemType, consecutiveCatches = 0, features = GAME_FEATURES, config = GAME_CONFIG) {
  // If all 4 features are disabled, use original fallback (1 point per food catch)
  const allDisabled = !features.goldenMandi && !features.comboCatch && !features.floatingScores && !features.bomb;
  if (allDisabled) {
    if (itemType === "bomb") {
      return { awardedPoints: 0, basePoints: 0, comboMultiplier: 1, isBomb: true };
    }
    return {
      awardedPoints: 1,
      basePoints: 1,
      comboMultiplier: 1,
      isBomb: false
    };
  }

  // 1. Bomb Hazard Catch: -10 points (never multiplied by combo!)
  if (itemType === "bomb") {
    const penalty = features.bomb ? (config.bombPoints || -10) : 0;
    return {
      awardedPoints: penalty,
      basePoints: penalty,
      comboMultiplier: 1,
      isBomb: true
    };
  }

  // 2. Active Combo Multiplier: x2 after 5 consecutive successful food catches
  let comboMultiplier = 1;
  if (features.comboCatch && consecutiveCatches >= (config.comboActivationCount || 5)) {
    comboMultiplier = config.comboMultiplier || 2;
  }

  // 3. Golden Mandi Catch: +3 base (+6 with combo x2)
  if (itemType === "golden-mandi") {
    const base = features.goldenMandi ? (config.goldenMandiPoints || 3) : (config.normalFoodPoints || 1);
    const awarded = base * comboMultiplier;
    return {
      awardedPoints: awarded,
      basePoints: base,
      comboMultiplier,
      isBomb: false
    };
  }

  // 4. Normal Food Catch: +1 base (+2 with combo x2)
  const base = config.normalFoodPoints || 1;
  const awarded = base * comboMultiplier;
  return {
    awardedPoints: awarded,
    basePoints: base,
    comboMultiplier,
    isBomb: false
  };
}

// Browser environment
if (typeof window !== "undefined") {
  window.GAME_FEATURES = GAME_FEATURES;
  window.GAME_CONFIG = GAME_CONFIG;
  window.calculateCatchPoints = calculateCatchPoints;
}

// Node.js CommonJS environment
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GAME_FEATURES,
    GAME_CONFIG,
    calculateCatchPoints
  };
}
