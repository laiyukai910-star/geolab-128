# Bundled CC0 model assets

## Collection

- **Name:** Kenney Nature Kit 2.1
- **Source:** <https://kenney.nl/assets/nature-kit>
- **Licence:** [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain dedication)
- **Author:** Kenney (<https://www.kenney.nl>)

The licence file that shipped with the collection is kept here unmodified as `KENNEY-LICENSE.txt`.

## Why this can live in an MIT repository

CC0 places the work in the public domain. Bundling it, modifying it and redistributing it are all
permitted, and **no attribution is legally required**. This project records the credit anyway: the
shipped licence file asks for it, and a scene that cannot name its sources is hard to audit.

## What is bundled

32 of the collection's 329 models, chosen to cover a natural landscape and the human structures that
sit in it — trees and conifers, boulders and cliff blocks, shrubs, grass and flowers, a fungus, stumps
and logs, and a tent, campfire, fence, sign and bridge. About 300 KB in total. The rest of the
collection is **not** bundled; `manifest.json` lists exactly what is, with each model's category,
description and byte size.

## Scope

These are **stylised models, not surveyed specimens**. A bundled tree represents a tree; it is not a
measurement of one. Everything the application derives from its own arrays — lithology, land cover,
process, habitat — remains the scientific layer, and `cc0Assets.js` never writes to it.
