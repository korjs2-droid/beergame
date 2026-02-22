# Beer Game 4-Team Local Multiplayer

This is a local web version of the beer game inspired by your legacy `bg_player` and `bg_server-multi` package.

## What is implemented

- 4 fixed supply-chain teams: `Retailer`, `Wholesaler`, `Distributor`, `Factory`
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

1. One person creates a room and chooses one team.
2. Other 3 players join with the same room code and choose remaining teams.
3. When 4 teams are present, game starts automatically.
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
