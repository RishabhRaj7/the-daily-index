import type { CreditCard } from "@/lib/types";

// Fact files for the cards offered in Settings → "Credit cards you follow".
// Figures are the issuers' published headline terms (fees exclude GST) and
// are meant as a quick reference, not a substitute for the card's T&C.
export const MY_CARDS: CreditCard[] = [
  {
    id: "hdfc-regalia-gold",
    name: "HDFC Regalia Gold",
    issuer: "HDFC Bank",
    network: "Visa Signature / Mastercard World",
    annualFee: "₹2,500 (waived on ₹4L annual spend)",
    rewardRate: "4 RP / ₹150; 5× at Nykaa, Myntra, M&S, Reliance Digital; up to 10× via SmartBuy",
    milestoneBenefit: "₹1,500 vouchers per ₹1.5L quarter; ₹5,000 flight voucher at ₹5L; another ₹5,000 at ₹7.5L",
    loungeAccess: "12 domestic visits/year + 6 international via Priority Pass",
  },
  {
    id: "hsbc-travelone",
    name: "HSBC TravelOne",
    issuer: "HSBC",
    network: "Mastercard World",
    annualFee: "₹4,999 (waived on ₹8L annual spend)",
    rewardRate: "2 RP / ₹100 base; 4 RP / ₹100 on flights, travel aggregators & foreign currency; ~20 airline/hotel transfer partners",
    milestoneBenefit: "10,000 bonus points at ₹12L annual spend",
    loungeAccess: "6 domestic + 4 international visits/year",
  },
  {
    id: "hsbc-live-plus",
    name: "HSBC Live+",
    issuer: "HSBC",
    network: "Visa",
    annualFee: "₹999 (waived on ₹2L annual spend)",
    rewardRate: "10% cashback on dining, groceries & food delivery (₹1,000/month cap); 1.5% unlimited on the rest",
    milestoneBenefit: "None — fee waiver only",
    loungeAccess: "4 domestic visits/year (1 per quarter)",
  },
  {
    id: "axis-atlas",
    name: "Axis Atlas",
    issuer: "Axis Bank",
    network: "Visa Signature",
    annualFee: "₹5,000 (no spend-based waiver)",
    rewardRate: "2 EDGE Miles / ₹100; 5 EDGE Miles / ₹100 on travel (₹2L/month cap); transfers to partners at 1:2",
    milestoneBenefit: "Tiered: 2,500 miles at ₹3L (Silver), 5,000 at ₹7.5L (Gold), 10,000 at ₹15L (Platinum)",
    loungeAccess: "Tiered: 8/12/18 domestic + 4/6/12 international visits/year",
  },
  {
    id: "yes-marquee",
    name: "YES Bank Marquee",
    issuer: "YES Bank",
    network: "Mastercard World Elite",
    annualFee: "₹9,999 joining, ₹4,999 renewal (waived on ₹10L annual spend)",
    rewardRate: "36 YES Rewardz / ₹200 online, 18 / ₹200 offline (≈4.5% / 2.25% back); 1% forex markup",
    milestoneBenefit: "40,000 welcome points; 20,000 points on renewal; BookMyShow buy-1-get-1 up to ₹2,400/month",
    loungeAccess: "24 domestic/year (6 per quarter, needs ₹1L prior-quarter spend) + unlimited international",
  },
];
