from __future__ import annotations

import copy
import os
import secrets
import threading
import uuid
from dataclasses import dataclass, field
from typing import Any

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

TEAM_ORDER = ["Retailer", "Wholesaler", "Distributor", "Factory"]
UPSTREAM_OF = {
    "Retailer": "Wholesaler",
    "Wholesaler": "Distributor",
    "Distributor": "Factory",
    "Factory": None,
}
DOWNSTREAM_OF = {
    "Retailer": None,
    "Wholesaler": "Retailer",
    "Distributor": "Wholesaler",
    "Factory": "Distributor",
}


@dataclass
class TeamState:
    name: str
    stock: int = 15
    backlog: int = 0
    total_cost: float = 0.0
    order_queue: list[int] = field(default_factory=lambda: [5, 5])
    delivery_queue: list[int] = field(default_factory=lambda: [5, 5])
    last_round: dict[str, Any] | None = None


@dataclass
class Game:
    game_id: str
    room_code: str
    max_rounds: int = 40
    holding_cost: float = 0.5
    backlog_cost: float = 1.0
    demand_schedule: dict[int, int] = field(default_factory=lambda: {0: 5, 4: 10})
    round_index: int = 0
    started: bool = False
    completed: bool = False
    players: dict[str, dict[str, str]] = field(default_factory=dict)
    teams: dict[str, TeamState] = field(default_factory=dict)
    submissions: dict[str, int] = field(default_factory=dict)
    history: list[dict[str, Any]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.teams = {name: TeamState(name=name) for name in TEAM_ORDER}

    def demand_for_round(self, idx: int) -> int:
        selected_round = max((r for r in self.demand_schedule if r <= idx), default=0)
        return self.demand_schedule[selected_round]

    def all_teams_joined(self) -> bool:
        assigned = {entry["team"] for entry in self.players.values()}
        return all(team in assigned for team in TEAM_ORDER)

    def to_public_state(self, viewer_team: str | None = None) -> dict[str, Any]:
        teams = {}
        for name in TEAM_ORDER:
            team = self.teams[name]
            teams[name] = {
                "stock": team.stock,
                "backlog": team.backlog,
                "totalCost": round(team.total_cost, 2),
                "lastRound": team.last_round,
                "orderSubmitted": name in self.submissions,
            }

        current_demand = self.demand_for_round(self.round_index)
        if viewer_team not in {"Retailer", None}:
            current_demand = None

        return {
            "gameId": self.game_id,
            "roomCode": self.room_code,
            "started": self.started,
            "completed": self.completed,
            "round": self.round_index + 1,
            "maxRounds": self.max_rounds,
            "currentDemand": current_demand,
            "teams": teams,
            "players": list(self.players.values()),
            "history": self.history[-10:],
            "yourTeam": viewer_team,
        }


games: dict[str, Game] = {}
lock = threading.Lock()


def make_room_code() -> str:
    return secrets.token_hex(3).upper()


def current_user() -> dict[str, str]:
    game_id = request.headers.get("X-Game-Id", "")
    token = request.headers.get("X-Player-Token", "")
    if not game_id or not token:
        return {}
    game = games.get(game_id)
    if not game:
        return {}
    player = game.players.get(token)
    if not player:
        return {}
    return {"game_id": game_id, "token": token, **player}


@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.post("/api/create")
def create_game():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "Host").strip()[:40]
    team = body.get("team")
    if team not in TEAM_ORDER:
        return jsonify({"error": "Invalid team"}), 400

    with lock:
        game_id = str(uuid.uuid4())
        room_code = make_room_code()
        game = Game(game_id=game_id, room_code=room_code)
        token = secrets.token_urlsafe(24)
        game.players[token] = {"name": name or "Host", "team": team}
        games[game_id] = game

    return jsonify({"gameId": game_id, "token": token, "roomCode": room_code})


@app.post("/api/join")
def join_game():
    body = request.get_json(silent=True) or {}
    room_code = (body.get("roomCode") or "").strip().upper()
    name = (body.get("name") or "Player").strip()[:40]
    team = body.get("team")

    if team not in TEAM_ORDER:
        return jsonify({"error": "Invalid team"}), 400

    with lock:
        game = next((g for g in games.values() if g.room_code == room_code), None)
        if not game:
            return jsonify({"error": "Room not found"}), 404

        taken_teams = {entry["team"] for entry in game.players.values()}
        if team in taken_teams:
            return jsonify({"error": "Team already taken"}), 409

        token = secrets.token_urlsafe(24)
        game.players[token] = {"name": name or "Player", "team": team}

        if game.all_teams_joined() and not game.started:
            game.started = True

        return jsonify({"gameId": game.game_id, "token": token, "roomCode": game.room_code})


@app.get("/api/state")
def state():
    user = current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    game = games[user["game_id"]]
    return jsonify(game.to_public_state(viewer_team=user["team"]))


@app.post("/api/submit-order")
def submit_order():
    user = current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    body = request.get_json(silent=True) or {}
    raw_order = body.get("order")

    try:
        order = int(raw_order)
    except (TypeError, ValueError):
        return jsonify({"error": "Order must be an integer"}), 400

    if order < 0:
        return jsonify({"error": "Order must be >= 0"}), 400

    with lock:
        game = games[user["game_id"]]
        if not game.started:
            return jsonify({"error": "Game not started yet"}), 409
        if game.completed:
            return jsonify({"error": "Game already finished"}), 409

        team = user["team"]
        if team in game.submissions:
            return jsonify({"error": "You already submitted this round"}), 409

        game.submissions[team] = order
        if len(game.submissions) == len(TEAM_ORDER):
            run_round(game)

    return jsonify({"ok": True})


@app.post("/api/reset")
def reset_game():
    user = current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    with lock:
        game = games[user["game_id"]]
        new_game = Game(game_id=game.game_id, room_code=game.room_code)
        new_game.players = copy.deepcopy(game.players)
        new_game.started = game.all_teams_joined()
        games[user["game_id"]] = new_game

    return jsonify({"ok": True})


def run_round(game: Game) -> None:
    round_no = game.round_index + 1
    demand = game.demand_for_round(game.round_index)

    incoming_orders: dict[str, int] = {}
    incoming_deliveries: dict[str, int] = {}
    outgoing_deliveries: dict[str, int] = {}

    for team_name in TEAM_ORDER:
        team = game.teams[team_name]

        incoming_delivery = team.delivery_queue.pop(0)
        incoming_order = demand if team_name == "Retailer" else team.order_queue.pop(0)

        available = team.stock + incoming_delivery
        total_demand = team.backlog + incoming_order
        outgoing_delivery = min(available, total_demand)
        stock_after = available - outgoing_delivery
        backlog_after = total_demand - outgoing_delivery

        team.stock = stock_after
        team.backlog = backlog_after
        team.total_cost += stock_after * game.holding_cost + backlog_after * game.backlog_cost

        incoming_orders[team_name] = incoming_order
        incoming_deliveries[team_name] = incoming_delivery
        outgoing_deliveries[team_name] = outgoing_delivery

    for team_name in TEAM_ORDER:
        team = game.teams[team_name]
        placed_order = game.submissions[team_name]

        upstream = UPSTREAM_OF[team_name]
        if upstream:
            game.teams[upstream].order_queue.append(placed_order)
        else:
            team.delivery_queue.append(placed_order)

        downstream = DOWNSTREAM_OF[team_name]
        if downstream:
            game.teams[downstream].delivery_queue.append(outgoing_deliveries[team_name])

        team.last_round = {
            "round": round_no,
            "incomingOrder": incoming_orders[team_name],
            "incomingDelivery": incoming_deliveries[team_name],
            "outgoingDelivery": outgoing_deliveries[team_name],
            "placedOrder": placed_order,
            "stockAfter": team.stock,
            "backlogAfter": team.backlog,
            "totalCost": round(team.total_cost, 2),
        }

    game.history.append(
        {
            "round": round_no,
            "customerDemand": demand,
            "orders": {team: game.submissions[team] for team in TEAM_ORDER},
            "deliveries": {team: outgoing_deliveries[team] for team in TEAM_ORDER},
            "teamCost": {team: round(game.teams[team].total_cost, 2) for team in TEAM_ORDER},
        }
    )

    game.round_index += 1
    game.submissions = {}

    if game.round_index >= game.max_rounds:
        game.completed = True


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5050"))
    app.run(host=host, port=port, debug=False, use_reloader=False)
