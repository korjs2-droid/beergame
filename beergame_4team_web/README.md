# Beer Game 4-Team Local Multiplayer

This is a local web version of the beer game inspired by your legacy `bg_player` and `bg_server-multi` package.

## What is implemented

- 1 admin + 4 fixed player teams: `Retailer`, `Wholesaler`, `Distributor`, `Factory`
- Admin can configure game settings before start and monitor all teams
- Admin starts the game after all 4 players join
- After game end, admin sees detailed report charts and team metrics
- Simultaneous turn submission: the round resolves only when all 4 teams submit orders
- Core inventory logic with backlog and holding/backorder costs
- Default settings aligned to legacy defaults:
  - initial stock 15
  - initial backlog 0
  - initial incoming delivery pipeline `[5, 5]`
  - initial incoming order pipeline `[5, 5]` for non-retailer
  - holding cost `0.5`, backlog cost `1.0`
  - demand schedule `{0:5, 4:10}`
  - max rounds `40`

## Run

```bash
cd /Users/js/Documents/beer/beergame_4team_web
./start.sh
```

Then open:

- `http://127.0.0.1:5050`

For team play on local network, open:

- `http://<host-ip>:5050`

## How to play

1. One person selects `Admin`, sets game options, and creates a room.
2. Four players join with the room code and pick different teams.
3. Admin checks assignments and clicks `Start Game`.
4. Each round every team submits an order once.
5. Round resolves automatically when all 4 orders are submitted.

## Notes

- State is in-memory for quick local sessions (server restart resets active games).
- This is a modern local replacement for the old Flash/Tomcat runtime, not a binary-compatible clone.

## Publish to GitHub + play online (4 players)

1. Push this project to GitHub.
2. On Render, create `Web Service` from that GitHub repository.
3. Render settings:
   - Build Command: `pip install -r beergame_4team_web/requirements.txt`
   - Start Command: `gunicorn --chdir beergame_4team_web --bind 0.0.0.0:$PORT app:app`
4. Deploy and share the generated HTTPS URL with all players.

Important:
- Game state is currently in-memory. If server restarts, active game data is reset.
