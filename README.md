# Terraform Wars

A 3D colony builder for phones, set on a lush alien planet. Settle a world, grow a working economy where every good is carried by hand, raise the Command Hub, and (later) raid other colonies and terraform your planet with up to 50 other players.

This branch holds **phase 0**: a single-player prototype that runs in the browser.

## What's in phase 0

- Free-orbit 3D camera over a 96 x 96 tile world with forests, rock outcrops and ice, ferrite and lumenite deposits (drag to rotate, pinch or scroll to zoom, two fingers to pan).
- Territory: you can only build on your own land. It grows with each Command Hub level, and Survey Beacons claim extra patches.
- A Settlers-style economy with 9 goods: timber, planks, stone, water, food, ferrite ore, steel, lumenite and circuits.
  - Woodcutters and quarry workers walk out to trees and rocks; a Grove Keeper replants the forest.
  - Production chains: timber to planks, ice to water to food, food feeds the miners, ore to steel, steel and lumenite to circuits.
- Colonists do all the work:
  - New buildings start as construction sites. Carriers bring the materials, then a builder puts it up. Nothing is spent until it arrives.
  - Building comes first, then deliveries to sites, then staffing workplaces, then everyday hauling.
  - Every workplace needs a colonist assigned to it, who walks there and works inside. If nobody is free, it waits.
  - The colony keeps some colonists back as carriers, so goods keep moving.
- 15 buildings with three levels each, unlocked across Command Hub levels 1 to 3, with more of each allowed as the Hub grows.
- Roads that matter: free to lay, auto-routed around obstacles, and colonists walk faster on them. A building only works once a road links it to the Command Hub.
- Power and housing limits, per-good storage, and a crystal speed-up that finishes a build once its materials are in storage.
- A goals checklist that walks a new player from the first Lumber Camp to the first circuit.
- Saves to the browser on this device.

## Running it

```bash
npm install
npm run dev      # local dev server, also reachable from a phone on the same Wi-Fi
npm test         # game-rule tests, plus a scripted play-through on several maps
npm run build    # production build in dist/
```

## Layout

- `src/sim/` game rules with no graphics. Deterministic, so a server can run the same code later.
  - `config.ts` buildings, goods and balance numbers.
  - `map.ts` world generation. `territory.ts` land claims.
  - `jobs.ts` colonist jobs: building, hauling, working.
  - `path.ts` walking routes. `roads.ts` road planning.
  - `rules.ts` placement and stats. `game.ts` player actions and the simulation step.
- `src/render/` Babylon.js scene, stand-in models made from primitives (to be replaced by Blender `.glb` models), colonists carrying crates.
- `src/ui/` the touch HUD: goods, goals, build menu, road tool, building and site panels.
- `tests/` Vitest tests for the rules, and `playthrough.test.ts`, a scripted player that plays the goals on real maps and logs how long each step takes.
