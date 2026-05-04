# docs/assets/

This directory contains screenshots, GIFs, and other visual assets referenced from the project README.

## Current status

No assets have been captured yet. This directory is a placeholder.

## Planned assets

| Filename | Description | Dimensions |
|---|---|---|
| `pipeline-demo.gif` | Animated GIF: `npm run demo` running end-to-end → output slides appearing in `drafts/item-001/slides/` | 800×500px or similar |
| `review-ui.png` | Screenshot of the review UI at `localhost:3000` showing a carousel in the approve/reject/edit interface | 1200×800px or similar |
| `slide-example-01.png` | A representative composed slide PNG from the demo item (the hook slide) | 1080×1350 |
| `slide-example-02.png` | A second slide from the same carousel, showing the citation card treatment | 1080×1350 |

## How to capture

1. Run `npm run demo` to generate slides from the mock item — no API keys needed.
2. Open `npm run review` and screenshot the UI at `localhost:3000`.
3. Copy representative slides from `drafts/item-001/slides/` into this directory.
4. Record the terminal + browser workflow using a screen recorder (e.g. Kap on macOS, ShareX on Windows) and export as GIF.

## Naming convention

- Lowercase, hyphen-separated filenames.
- Include context in the filename: `review-ui.png` not `screenshot.png`.
- GIFs should be optimized — target under 3MB to avoid slowing down the README load time. Use [gifski](https://gif.ski/) or [ezgif.com](https://ezgif.com/optimize) to compress.
