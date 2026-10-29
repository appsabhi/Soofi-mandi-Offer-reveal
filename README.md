# Soofi Mandi — Catch the Feast & Offer Reveal Demo

A high-end, responsive interactive restaurant mini-game and offer reveal designed for the Soofi Mandi client presentation.

## Overview & Game Mechanics
- **Title**: **Catch the Feast**
- **Objective**: Players control a handcrafted Mandi bucket horizontally using mouse or touch dragging to catch delicious Mandi platters falling from above.
- **Three Authentic Mandi Delicacies**:
  1. **Chicken Mandi** (`assets/chicken-mandi.png`)
  2. **Beef Mandi** (`assets/beef-mandi.png`)
  3. **Mutton Mandi** (`assets/mutton-mandi.png`)
- **Player's Catching Bucket**: Handcrafted Mandi Bucket (`assets/mandi-bucket.png`) with responsive, zero-jump touch drag and accurate rim collision detection.
- **Unlimited Scoring**: Players catch as many delicacies as possible during a 12-second round. Every catch awards +1 point immediately. No target limit or minimum score is required.
- **Timer**: Exactly 12-second round with live countdown on the status HUD. The round ends strictly when the 12s timer expires.
- **Results & Offer Reveal**: When time expires, the player's actual final score is displayed ("TIME'S UP!", "YOUR SCORE: X", "You caught X food items!"), followed by a smooth transition to the prominent gold-accented restaurant offer reveal card.
- **Full-Screen Confetti Celebration**: A gold, cream, and white confetti celebration cascades across the entire viewport, visibly showering in front of the white card.
- **Controls**:
  - **Start Game**: Prominent gold-accented button starting the 12-second gameplay round.
  - **Play Again**: Restarts a clean new 12-second round immediately with fresh state.
  - **Reset Demo**: Horizontally centered below the main card using flexbox, returns cleanly to the initial introduction screen and clears all active game states, timers, and confetti.

## Visual Design & Brand Identity
- **Color Palette**: Solid white background (`#FFFFFF`), primary brand gold (`#FFB900`), and dark Yemeni brown typography (`#2A1706`).
- **Typography**: Consistent **Poppins** across all headings, HUD labels, buttons, score, timer, and offer content.
- **Assets**: Authentic transparent PNG photography preserving exact proportions and transparency.

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
