# Echo Ops

A browser take on Bullet Echo: a top-down, lights-out battle royale.

```
npm install
npm run dev        # http://localhost:5173
npm run build
```

- **Desktop:** WASD to move. Mouse turns (click to lock the pointer, or drag). Q/E also turn. Space for the ability, R to reload.
- **Touch:** the left stick moves and turns you to face that way, the right stick aims, and the button fires the ability.
- **Debug query params:** `?autostart`, `?autopilot` (AI plays you), `?god`, `?hero=blaze|bulwark|patch|ghost`, `?bots=N`.
- **Test tools** (need the dev server on port 5199): `node tools/shoot.mjs`, `tools/sim.mjs`, `tools/controls.mjs`, `tools/zone.mjs`.

Sprites and particles are from the Kenney.nl Top-down Shooter and Particle Pack (CC0). Sound is synthesized with WebAudio.
