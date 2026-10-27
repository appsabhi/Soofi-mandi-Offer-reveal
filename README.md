# Soofi Mandi — Premium Animated Ribbon-Cutting Demo

A high-end, responsive interactive ribbon-cutting experience designed for client presentation and offer reveals.

## Aesthetic & Architecture
- **Color Palette**: Near-black background (`#0B0B0B`), primary brand gold (`#FFB900`), and a prominent pure white interaction container (`#FFFFFF`).
- **Typography**: Editorial serif (*Playfair Display*) for headlines paired with clean sans-serif (*Plus Jakarta Sans*) for supporting text.
- **Realistic Gold Satin Ribbon Assets**:
  - `assets/ribbon-complete.png`: Complete horizontal draped gold satin ribbon before cutting.
  - `assets/ribbon-left-cut.png`: Left half with scissor shear cut angle.
  - `assets/ribbon-right-cut.png`: Right half with matching cut angle.
- **Refined Scissor Pointer**: Custom SVG ceremonial shears positioned over the ribbon center, with idle floating hover motion, interactive pointer tracking, and blade snipping animation.
- **Interaction**: Supports mouse drag, touch drag, and tap on desktop and mobile. Registered strictly once per demo attempt.
- **Subtle Confetti Burst**: Restrained gold and white confetti popper effect lasting ~1.5 seconds from container edges (respects `prefers-reduced-motion`).
- **Discreet "Reset demo"**: Re-engages the ribbon and scissors, resets state, and selects a new random placeholder offer for repeated client testing.

## How to Edit Placeholder Offers

Open `offers.js` to modify, add, or replace promotional offers:

```javascript
window.SOOFI_MANDI_DEMO_OFFERS = [
  {
    id: "offer-1",
    title: "15% off your next feast",
    description: "Enjoy 15% savings on any authentic Yemeni mandi platter.",
    code: "SOOFI15",
    terms: "Valid for dine-in & takeaway · Show to server"
  },
  // Add additional offers here...
];
```

## Running Locally

Open `index.html` directly in any modern browser, or run a local static server:

```powershell
npx serve .
```
or
```powershell
python -m http.server 8000
```
Then navigate to `http://localhost:8000`.
