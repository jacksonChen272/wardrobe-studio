# Asset provenance

## Active mannequin

`public/models/mannequin.json` derives from the MakeHuman base mesh and tights/skirt helper surfaces:
https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj

Source asset header: CC0, September 2020, Data Collection AB, Joel Palmius, Jonas Hauquier. The software license and bundled CC0 mesh licenses are distinguished here:
https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md

OBJ SHA-256: `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`.
Conversion script `scripts/prepare-avatar.mjs`: triangulation, normalization to 1.8 m, rounded coordinates. Runtime clips helper surfaces and adds thickness/layering. No personal photo is embedded.

## Retained legacy assets

`avatar-female.glb`, `avatar-male.glb`, and `mannequin.png` remain unused by the new renderer. The previous blanket MIT claim has been removed; a code library license does not automatically license all example assets. Independently verify model provenance before reusing them.

`sample-jacket.png` is the existing project sample, used only to demonstrate the image import pipeline.
