// Soofi Mandi — Demo Placeholder Offer Configuration
// Clean, easy to replace when the client confirms the actual offer.
const SOOFI_MANDI_DEMO_OFFERS = [
  {
    id: "offer-main",
    badge: "YOUR FEAST REWARD",
    title: "Complimentary Yemeni Delicacy",
    description: "Enjoy a special feast reward with your dine-in experience.",
    brand: "SOOFI MANDI · YEMENI CUISINE",
    instructions: "Show this screen to our staff to claim your reward."
  }
];

if (typeof window !== "undefined") {
  window.SOOFI_MANDI_DEMO_OFFERS = SOOFI_MANDI_DEMO_OFFERS;
  window.SOOfiMandiOffers = SOOFI_MANDI_DEMO_OFFERS;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SOOFI_MANDI_DEMO_OFFERS,
    DEFAULT_OFFER: SOOFI_MANDI_DEMO_OFFERS[0]
  };
}
