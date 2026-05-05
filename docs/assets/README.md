# docs/assets/

This directory contains screenshots and other visual assets referenced from the project README.

## Captured assets

| Filename | Description |
|---|---|
| `review-ui.png` | Screenshot of the review UI at `localhost:3000` showing a carousel in the approve/reject/edit interface |
| `review-ui-editing.png` | Screenshot of inline editing — clicking a field to edit copy directly in the browser |

## Planned assets

| Filename | Description | Status |
|---|---|---|
| `pipeline-demo.gif` | Animated GIF: `npm run demo` running end-to-end → output slides appearing in `drafts/item-001/slides/` | Not yet captured |

## How to capture additional assets

1. Run `npm run demo` to generate slides from the mock item — no API keys needed.
2. Open `npm run review` and screenshot the UI at `localhost:3000`.
3. Copy representative slides from `drafts/item-001/slides/` into this directory.
4. Record the terminal + browser workflow using a screen recorder (e.g. ShareX on Windows, Kap on macOS) and export as GIF.

## Naming convention

- Lowercase, hyphen-separated filenames.
- Include context in the filename: `review-ui.png` not `screenshot.png`.
- GIFs should be optimized — target under 3MB. Use [gifski](https://gif.ski/) or [ezgif.com](https://ezgif.com/optimize) to compress.
