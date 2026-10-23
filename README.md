# Terraform Wars

A 3D colony builder for phones, set on a lush alien planet. Settle a world, haul ore along your roads, grow the Command Hub, and (later) raid other colonies and terraform your planet with up to 50 other players.

This branch holds **phase 0**: a single-player prototype that runs in the browser.

## What's in phase 0

- Free-orbit 3D camera over a 30 x 30 tile colony (drag to rotate, pinch or scroll to zoom, two fingers to pan).
- Command Hub plus four buildings, each with three levels: Solar Array, Ore Extractor, Habitat, Storage Depot.
- Roads that matter: buildings only work when a road links them to the Command Hub, and colonists walk the road network carrying ore from extractors to storage.
- Power, population and storage caps; build and upgrade timers with a crystal speed-up; two builder drones.
- A goals checklist that walks a new player through founding the colony.
- Saves to the browser on this device.

## Running it

```bash
npm install
npm run dev      # local dev server, also reachable from a phone on the same Wi-Fi
npm test         # game-rule tests
npm run build    # production build in dist/
```

## Layout

- `src/sim/` game rules with no graphics: map, buildings, roads, pathfinding, timers, hauling. Timers use absolute timestamps so a server can own them later.
- `src/render/` Babylon.js scene, stand-in models made from primitives (to be replaced by Blender `.glb` models), colonists.
- `src/ui/` the touch HUD: resources, goals, build menu, road tool, building panel.
- `tests/` Vitest tests for the rules.
- Balance numbers live in `src/sim/config.ts`.
