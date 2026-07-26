import Pulse from "@/designs/pulse/Design";

// Pulse is the locked-in frontend (gate G3). It stays in src/designs/ so the
// review gallery keeps rendering it alongside the other 21 explorations —
// there is one copy, and /designs/pulse and / show the same component.
//
// The copy it renders is still the placeholder set in src/designs/_content.ts;
// real FR-M2 marketing content is Phase 1.
export default function MarketingHome() {
  return <Pulse />;
}
