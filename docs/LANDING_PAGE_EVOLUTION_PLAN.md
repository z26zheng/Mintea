# Mintea Landing Page Evolution Plan

## Goal

Make Mintea feel as polished and memorable as a modern fintech launch while
keeping the product immediately understandable. The visual system should own the
name **Mintea** through calm, clarity, and a subtle tea ritual—not by turning the
site into a literal beverage brand.

## Product and brand principles

1. **Finance first.** Every visual flourish should reinforce accounts, cash flow,
   net worth, transactions, or confidence.
2. **Tea as a metaphor.** Use steeping, settling, warmth, leaves, and steam as
   restrained cues for clarity.
3. **Proof over promises.** Realistic product previews and concrete capabilities
   should occupy more space than abstract claims.
4. **Motion with purpose.** Animation should explain change, hierarchy, or
   connection and include a complete reduced-motion experience.
5. **Calm conversion.** Calls to action should stay direct even when campaign
   language is expressive.

## Prioritized roadmap

### Phase 1 — Distinctive brand layer

- Introduce the campaign line: **“Your financial life, steeped in clarity.”**
- Add a translucent leaf, gentle steam curves, and a restrained amber rim light
  to the existing financial universe.
- Add a “calmer money ritual” section that explains the product in three steps:
  connect, organize, understand.
- Use **“Take a sip. See the whole picture.”** as supporting campaign language,
  while keeping buttons action-oriented.
- Align page title, description, and social metadata.
- Validate desktop, tablet, mobile, reduced motion, keyboard navigation, links,
  and horizontal overflow.

### Phase 2 — Stronger product proof

- Replace static product previews with short, optimized recordings of real
  Mintea workflows.
- Add a guided interactive demo that works without authentication.
- Add trustworthy proof: real customer quotes, institution coverage, and
  privacy details with verifiable language.
- Give each primary capability a deep link to a focused product story.

### Phase 3 — Conversion and performance

- Instrument hero, mid-page, and final calls to action.
- Measure scroll depth, demo completion, signup starts, and signup completion.
- Run copy and CTA-position experiments without changing the brand system.
- Enforce performance budgets for JavaScript, WebGL startup, image weight, and
  Core Web Vitals.
- Lazy-mount below-the-fold motion and product demos.

### Phase 4 — Brand system expansion

- Extend the mint-and-warm-amber palette into reusable launch graphics,
  illustrations, and social assets.
- Define motion tokens for entrances, transitions, hover responses, and data
  visualization.
- Build reusable landing-page sections for future reports, household features,
  and premium product launches.

## Phase 1 acceptance criteria

- A first-time visitor can explain what Mintea does after viewing the hero.
- The tea identity is recognizable but never obscures the financial product.
- All CTAs resolve to the intended sign-in or sign-up state.
- The experience has no horizontal overflow at 390 px, 768 px, or desktop width.
- Motion pauses when offscreen and honors `prefers-reduced-motion`.
- Typecheck, automated tests, production build, and responsive browser checks
  pass before merge.
