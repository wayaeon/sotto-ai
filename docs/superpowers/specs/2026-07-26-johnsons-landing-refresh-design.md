# Johnson's Landing Retreat Centre refresh

## Goal

Replace the existing dated homepage treatment with a calm, editorial landing page that makes the retreat, its upcoming gatherings, and a stay inquiry feel immediate and easy to understand.

## Scope

One responsive landing page in its own `site/` directory. It will not alter the existing desktop application's source, tooling, or release flow.

## Experience

- A photographic, full-height hero introduces the retreat with one primary “Plan your retreat” action.
- A concise mission section grounds the page in rest, connection, and the Kootenays.
- Three retreat pillars summarise the offer: gatherings, private stays, and the land.
- Upcoming retreats are presented as a small, readable card row with dates and actions.
- A stay section, newsletter form, and compact contact footer give visitors a clear next step.
- The navigation scrolls to the page sections; the mobile version collapses to a native disclosure menu.

## Visual system

- Colour: deep evergreen, moss, warm cream, and restrained brass accents.
- Type: elegant serif display face paired with a readable sans-serif body face.
- Layout: generous whitespace, asymmetric image blocks, and softly rounded cards.
- Motion: restrained hover and reveal transitions; respect reduced-motion preferences.
- Imagery: original or appropriately licensed nature imagery, not copied source-site media.

## Content and behaviour

- Brand and broad retreat themes remain recognisable; body copy is refreshed rather than copied.
- Event and accommodation calls to action link to placeholder anchors for this first release; no booking provider or data backend is added.
- The newsletter form performs client-side validation and shows a local success state. It does not transmit personal data until a mailing-list provider is selected.

## Quality checks

- The page must work without JavaScript for navigation and content.
- All primary controls have visible labels, keyboard access, and 40px-or-larger targets.
- Responsive layout is checked at mobile and desktop widths.
- A focused automated test verifies the event card data and newsletter validation; the production build must pass.

## Deliberate exclusions

- No CMS migration, booking engine, live event feed, Instagram embed, or newsletter integration in this first build.
- Add those only once the destination service and ownership are confirmed.
