# Soofi Mandi — Catch the Feast Mini-Game & Offer Reveal Demo

A high-end, responsive interactive mini-game designed for client presentation and offer reveals.

## Overview & Game Mechanics
- **Title**: **Catch the Feast**
- **Objective**: Players control a handcrafted Mandi bucket horizontally using mouse or touch dragging to catch falling delicacies (roasted chicken, saffron rice, spiced lamb, cardamom garnish).
- **Unlimited Scoring**: Players catch as many delicacies as possible during a 12-second round. Every catch awards +1 point immediately. No target limit or minimum score is required.
- **Timer**: 12-second round with live countdown and urgency cues.
- **Results & Offer Reveal**: When time expires, the player's actual final score is displayed ("TIME'S UP!", "YOUR SCORE: X", "You caught X food items!"), followed by a smooth transition to the prominent gold-accented restaurant offer reveal card.
- **Full-Screen Confetti Celebration**: A gold-and-white confetti celebration cascades across the entire viewport, visibly showering in front of the white card and over the black background.
- **Controls**:
  - **Play Again**: Restarts a clean new 12-second round immediately.
  - **Reset Demo**: Horizontally centered below the main card, returns to the initial introduction screen and clears all active game states, timers, and confetti.

## Visual Design & Brand Identity
- **Color Palette**: Near-black background (`#0B0B0B`), primary brand gold (`#FFB900`), and a prominent pure white interaction card (`#FFFFFF`).
- **Typography**: Consistent **Poppins** (`Arial, sans-serif` fallback) across all headings, HUD labels, offer panels, buttons, and footers.
- **Future Image Support**: `FOOD_CONFIG` in `app.js` is structured so transparent PNG/WebP food photography can be dropped into the `assets/` folder with seamless SVG fallbacks.

## Editing Offers
Open `offers.js` to modify the placeholder promotion details:
```javascript
window.SOOFI_MANDI_DEMO_OFFERS = [
  {
    id: "offer-main",
    badge: "YOUR SPECIAL OFFER",
    title: "Demo offer · To be confirmed",
    description: "Special promotion details will be updated soon.",
    brand: "SOOFI MANDI · YEMENI CUISINE"
  }
];
```

## Running Locally
Open `index.html` directly in any modern browser or run a static server:
```powershell
npx serve .
```
or
```powershell
python -m http.server 8000
```
Navigate to `http://localhost:3000` or `http://localhost:8000`.
