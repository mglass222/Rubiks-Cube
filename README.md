# Rubik's Cube

A browser-based, fully playable 3×3×3 Rubik's Cube with classic colors, rounded stickers, and authentic twist sounds.

**Live demo:** [mglass222.github.io/Rubiks-Cube](https://mglass222.github.io/Rubiks-Cube/)

## Features

- **3D cube** — Three.js rendering with Western color scheme (white/yellow, red/orange, green/blue)
- **Full playability** — Keyboard (`U` `D` `L` `R` `F` `B`, Shift for prime, `2` for double), mouse drag on faces, orbit controls
- **Scramble, solve, reset, undo** — Move counter and timer included
- **Sound** — Web Audio snap, whoosh, and solved chime
- **Guaranteed solvable** — Only legal moves are applied; solve reverses move history

## Quick start

No build step required. Serve the folder with any static file server:

```bash
python3 -m http.server 8765
```

Open [http://localhost:8765](http://localhost:8765) in your browser.

## Controls

| Input | Action |
|-------|--------|
| `U` `D` `L` `R` `F` `B` | Turn a face clockwise |
| Shift + key | Turn counter-clockwise |
| Key then `2` | Double turn |
| Space | Scramble |
| Drag a face | Turn layer |
| Drag background | Rotate view |

## Project structure

```
├── index.html      # Main page
├── css/style.css   # UI styles
├── js/
│   ├── cube.js     # Cube logic (facelet engine)
│   ├── renderer.js # Three.js 3D rendering
│   ├── audio.js    # Sound effects
│   ├── solver.js   # Solve via reversed history
│   └── app.js      # UI wiring
└── test/
    └── cube.test.mjs
```

## Tests

```bash
node test/cube.test.mjs
```

## License

MIT
