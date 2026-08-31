# Benjamin Walker's Battleship Royale

Browser Battleship, styled after cognition.com, against an AI opponent. No build step, no backend — open `index.html` (or serve the folder statically).

## Play

- Place each ship by selecting it and clicking your board; press `R` or the Rotate button to switch orientation, or use "Random fleet".
- Click "Start battle", then fire at enemy waters. You and the AI alternate shots until one fleet is gone.

Fleet: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2) on a 10x10 grid.

## AI

Hunt/target search: in hunt mode it samples untried cells on a parity lattice (no 2-cell ship can hide between them); after a hit it queues the neighbouring cells, and once two hits line up it extends along that line only. It clears a full fleet in ~60 shots on average versus ~95 for uniform random fire.
