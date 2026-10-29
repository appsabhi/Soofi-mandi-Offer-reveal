# Soofi Mandi — Catch the Feast & Offer Reveal Demo

A high-end, responsive interactive restaurant mini-game and offer reveal designed for Soofi Mandi.

## Overview & Game Mechanics
- **Title**: **Catch the Feast**
- **Objective**: Players control an authentic Mandi bucket horizontally using mouse or touch dragging to catch delicious Mandi platters falling from above.
- **Three Authentic Mandi Delicacies**:
  1. **Chicken Mandi** (`assets/chicken-mandi.png`)
  2. **Beef Mandi** (`assets/beef-mandi.png`)
  3. **Mutton Mandi** (`assets/mutton-mandi.png`)
- **Player's Catching Bucket**: Handcrafted Mandi Bucket (`assets/mandi-bucket.png`) with smooth touch drag and 3D layered rim entry physics.
- **Scoring**: Every catch awards +1 point immediately with vibrant popups.
- **Survival Gameplay (5 Misses Rule)**: The game is miss-based with no countdown timer. Missing 5 falling delicacies ends the round. At 4 misses, an alert banner warns the player.
- **Game Over & Results**:
  - On the 5th miss, active gameplay halts immediately and displays **"YOU LOST!"** along with the player's final feast score and total items caught.
  - No special offer card or coupon is displayed on the loss screen.
  - **Play Again**: Restarts a clean new round immediately with fresh state.
- **Controls**:
  - **Start Game**: Prominent gold gradient button with dark-brown typography.
  - **Play Again**: Instant restart of the feast round.

## Visual Design & Brand Identity
- **Color Palette**:
  - Stage Center: `#1B5E45` (Forest Green)
  - Stage Edge: `#0A2A20` (Deep Yemeni Green)
  - Stage Floor: `#123F30`
  - Gold Accent: `#F5B800` / `#FFD24D` / `#D99E00`
  - Cream & Sand: `#FFF8E7` / `#F0E3C4`
  - Deep Brown: `#2A1408`
  - Alert / Accent: `#FF6B4A` / `#B5532F`
  - Success Feedback: `#7BD88F`
- **Brand Prominence**: Authentic Soofi Mandi calligraphy logo prominently showcased with aspect ratio preserved.
- **Typography**: Consistent **Poppins** across all headings, HUD chips, buttons, and scores.
- **Mobile-First Layout**: Fits naturally within `100dvh` with safe-area insets, eliminating unwanted bottom whitespace.

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

### 1. Launch the Server (Node.js 22+)
The project includes a built-in server featuring persistent SQLite storage (`node:sqlite`), public REST APIs for the Global Top 10 Leaderboard, anonymous player tracking, and the Private Owner Game Analytics Dashboard.

```bash
npm start
```
or
```bash
node server.js
```
The application will be live at:
- **Game UI**: [http://localhost:3000](http://localhost:3000)
- **Private Owner Analytics Dashboard**: [http://localhost:3000/admin/game-analytics](http://localhost:3000/admin/game-analytics)

### 2. Run Automated Tests
```bash
npm test
```
Runs the automated test suite (`tests/test_game_server.js`) validating:
1. Public Leaderboard endpoint (`GET /api/leaderboard`)
2. Verified Score Submission (`POST /api/leaderboard`) & anti-abuse sanity check
3. Deterministic tie-breaking rules (`score DESC, submitted_at ASC`)
4. Privacy-conscious Analytics tracking (`POST /api/analytics/events`) & rapid deduplication
5. Admin authentication & session management (`POST /api/admin/login`)
6. Overview metrics aggregation (`GET /api/admin/analytics/overview`)
7. Filterable event logs and player timeline inspector
8. Admin Dashboard HTML delivery

## Owner Analytics & Admin Access
- **URL**: `http://localhost:3000/admin/game-analytics`
- **Default Password**: `soofi_admin_2026` (configurable via `ADMIN_PASSWORD` environment variable)
- **Features**:
  - **Overview Metrics**: Unique Players, Total Games Played, Avg Score, Highest Score, Conversion / Completion rate.
  - **Global Top 10 Leaderboard**: Live ranking table with rank, anonymous display name, score, caught items, and submission timestamp.
  - **Searchable Activity Log**: Filter events by type (`page_visit`, `game_start`, `game_complete`, `game_replay`, `game_abandon`, `cta_click`, `leaderboard_view`) or search by player / session ID.
  - **Player Timeline Inspector**: Inspect individual player event sequences across sessions.

## Global Top 10 Leaderboard & Anti-Abuse
- **Tie-Breaking Rule**: Deterministic ranking where ties are broken by earliest submission timestamp (`score DESC, submitted_at ASC`).
- **Anti-Abuse Verification**:
  - Score must strictly match items caught.
  - Duration-based physical catch rate verification prevents script spoofing.
  - Submission rate-limiting per player.
  - Display name sanitization and length clamping.
- **Anonymous Player Identification**:
  - Cryptographic random UUID stored in `localStorage` (`soofi_mandi_player_id`).
  - Session ID stored in `sessionStorage` (`soofi_mandi_session_id`).
  - Default anonymous display name (e.g. `MandiGuest_4821`), customizable anytime by the player via the Leaderboard modal.
  - Zero invasive device fingerprinting.
