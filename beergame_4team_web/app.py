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
    stock: int
    backlog: int
    total_cost: float
    order_queue: list[int]
    delivery_queue: list[int]
    last_round: dict[str, Any] | None = None


@dataclass
class Game:
    game_id: str
    room_code: str
    admin_token: str | None = None
    max_rounds: int = 40
    holding_cost: float = 0.5
    backlog_cost: float = 1.0
    demand_schedule: dict[int, int] = field(default_factory=lambda: {0: 5, 4: 10})
    initial_stock: int = 15
    initial_backlog: int = 0
    initial_incoming_order: int = 5
    initial_incoming_delivery: int = 5
    round_index: int = 0
    started: bool = False
    completed: bool = False
    players: dict[str, dict[str, str]] = field(default_factory=dict)
    teams: dict[str, TeamState] = field(default_factory=dict)
    submissions: dict[str, int] = field(default_factory=dict)
    history: list[dict[str, Any]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.teams = {}
        for name in TEAM_ORDER:
            self.teams[name] = TeamState(
                name=name,
                stock=self.initial_stock,
                backlog=self.initial_backlog,
                total_cost=0.0,
                order_queue=[self.initial_incoming_order, self.initial_incoming_order],
                delivery_queue=[self.initial_incoming_delivery, self.initial_incoming_delivery],
            )

    def demand_for_round(self, idx: int) -> int:
        selected_round = max((r for r in self.demand_schedule if r <= idx), default=0)
        return self.demand_schedule[selected_round]

    def all_teams_joined(self) -> bool:
        assigned = {
            entry["team"]
            for entry in self.players.values()
            if entry.get("role") == "player" and entry.get("team") in TEAM_ORDER
        }
        return all(team in assigned for team in TEAM_ORDER)

    def team_assignments(self) -> dict[str, str | None]:
        assigned: dict[str, str | None] = {team: None for team in TEAM_ORDER}
        for entry in self.players.values():
            if entry.get("role") == "player" and entry.get("team") in TEAM_ORDER:
                assigned[entry["team"]] = entry.get("name")
        return assigned

    def to_public_state(self, viewer_role: str, viewer_team: str | None = None) -> dict[str, Any]:
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
        if viewer_role != "admin" and viewer_team != "Retailer":
            current_demand = None

        return {
            "gameId": self.game_id,
            "roomCode": self.room_code,
            "role": viewer_role,
            "started": self.started,
            "completed": self.completed,
            "allTeamsJoined": self.all_teams_joined(),
            "submissionsCount": len(self.submissions),
            "round": self.round_index + 1,
            "maxRounds": self.max_rounds,
            "currentDemand": current_demand,
            "teams": teams,
            "players": list(self.players.values()),
            "teamAssignments": self.team_assignments(),
            "settings": {
                "maxRounds": self.max_rounds,
                "holdingCost": self.holding_cost,
                "backlogCost": self.backlog_cost,
                "initialStock": self.initial_stock,
                "initialIncomingOrder": self.initial_incoming_order,
                "initialIncomingDelivery": self.initial_incoming_delivery,
                "demandSchedule": self.demand_schedule,
            },
            "history": self.history[-10:],
            "historyAll": self.history if viewer_role == "admin" else [],
            "yourTeam": viewer_team,
            "canStart": viewer_role == "admin" and (not self.started) and self.all_teams_joined(),
        }


games: dict[str, Game] = {}
lock = threading.Lock()


def make_room_code() -> str:
    return secrets.token_hex(3).upper()


def parse_int(value: Any, default: int, minimum: int = 0) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(parsed, minimum)


def parse_float(value: Any, default: float, minimum: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return max(parsed, minimum)


def parse_demand_schedule(raw: Any) -> dict[int, int]:
    default_schedule = {0: 5, 4: 10}
    if raw is None:
        return default_schedule

    parsed: dict[int, int] = {}
    if isinstance(raw, str):
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        for part in parts:
            if ":" not in part:
                continue
            left, right = part.split(":", 1)
            round_idx = parse_int(left.strip(), -1, minimum=0)
            demand_val = parse_int(right.strip(), -1, minimum=0)
            if round_idx >= 0 and demand_val >= 0:
                parsed[round_idx] = demand_val
    elif isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            round_idx = parse_int(item.get("round"), -1, minimum=0)
            demand_val = parse_int(item.get("demand"), -1, minimum=0)
            if round_idx >= 0 and demand_val >= 0:
                parsed[round_idx] = demand_val

    if 0 not in parsed:
        parsed[0] = default_schedule[0]
    return parsed if parsed else default_schedule


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


@app.post("/api/admin/create")
def create_game_as_admin():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "Admin").strip()[:40]

    max_rounds = parse_int(body.get("maxRounds"), 40, minimum=1)
    holding_cost = parse_float(body.get("holdingCost"), 0.5, minimum=0.0)
    backlog_cost = parse_float(body.get("backlogCost"), 1.0, minimum=0.0)
    initial_stock = parse_int(body.get("initialStock"), 15, minimum=0)
    initial_incoming_order = parse_int(body.get("initialIncomingOrder"), 5, minimum=0)
    initial_incoming_delivery = parse_int(body.get("initialIncomingDelivery"), 5, minimum=0)
    demand_schedule = parse_demand_schedule(body.get("demandSchedule"))

    with lock:
        game_id = str(uuid.uuid4())
        room_code = make_room_code()
        game = Game(
            game_id=game_id,
            room_code=room_code,
            max_rounds=max_rounds,
            holding_cost=holding_cost,
            backlog_cost=backlog_cost,
            initial_stock=initial_stock,
            initial_incoming_order=initial_incoming_order,
            initial_incoming_delivery=initial_incoming_delivery,
            demand_schedule=demand_schedule,
        )
        token = secrets.token_urlsafe(24)
        game.admin_token = token
        game.players[token] = {"name": name or "Admin", "team": "", "role": "admin"}
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
        if game.started:
            return jsonify({"error": "Game already started"}), 409

        taken_teams = {
            entry["team"]
            for entry in game.players.values()
            if entry.get("role") == "player" and entry.get("team") in TEAM_ORDER
        }
        if team in taken_teams:
            return jsonify({"error": "Team already taken"}), 409

        token = secrets.token_urlsafe(24)
        game.players[token] = {"name": name or "Player", "team": team, "role": "player"}

        return jsonify({"gameId": game.game_id, "token": token, "roomCode": game.room_code})


@app.get("/api/state")
def state():
    user = current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    game = games[user["game_id"]]
    return jsonify(game.to_public_state(viewer_role=user["role"], viewer_team=user["team"]))


@app.post("/api/admin/start")
def admin_start():
    user = current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    if user.get("role") != "admin":
        return jsonify({"error": "Admin only"}), 403

    with lock:
        game = games[user["game_id"]]
        if game.started:
            return jsonify({"error": "Game already started"}), 409
        if not game.all_teams_joined():
            return jsonify({"error": "4 teams are required before start"}), 409
        game.started = True
    return jsonify({"ok": True})


@app.post("/api/admin/settings")
def admin_update_settings():
    user = current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    if user.get("role") != "admin":
        return jsonify({"error": "Admin only"}), 403

    body = request.get_json(silent=True) or {}
    with lock:
        game = games[user["game_id"]]
        if game.started:
            return jsonify({"error": "Cannot change settings after game start"}), 409

        game.max_rounds = parse_int(body.get("maxRounds"), game.max_rounds, minimum=1)
        game.holding_cost = parse_float(body.get("holdingCost"), game.holding_cost, minimum=0.0)
        game.backlog_cost = parse_float(body.get("backlogCost"), game.backlog_cost, minimum=0.0)
        game.initial_stock = parse_int(body.get("initialStock"), game.initial_stock, minimum=0)
        game.initial_incoming_order = parse_int(
            body.get("initialIncomingOrder"), game.initial_incoming_order, minimum=0
        )
        game.initial_incoming_delivery = parse_int(
            body.get("initialIncomingDelivery"), game.initial_incoming_delivery, minimum=0
        )
        game.demand_schedule = parse_demand_schedule(body.get("demandSchedule"))
        game.round_index = 0
        game.completed = False
        game.submissions = {}
        game.history = []
        game.teams = {}
        for name in TEAM_ORDER:
            game.teams[name] = TeamState(
                name=name,
                stock=game.initial_stock,
                backlog=game.initial_backlog,
                total_cost=0.0,
                order_queue=[game.initial_incoming_order, game.initial_incoming_order],
                delivery_queue=[game.initial_incoming_delivery, game.initial_incoming_delivery],
            )
    return jsonify({"ok": True})


@app.post("/api/submit-order")
def submit_order():
    user = current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    if user.get("role") != "player":
        return jsonify({"error": "Players only"}), 403

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
    if user.get("role") != "admin":
        return jsonify({"error": "Admin only"}), 403

    with lock:
        game = games[user["game_id"]]
        new_game = Game(
            game_id=game.game_id,
            room_code=game.room_code,
            max_rounds=game.max_rounds,
            holding_cost=game.holding_cost,
            backlog_cost=game.backlog_cost,
            demand_schedule=copy.deepcopy(game.demand_schedule),
            initial_stock=game.initial_stock,
            initial_incoming_order=game.initial_incoming_order,
            initial_incoming_delivery=game.initial_incoming_delivery,
        )
        new_game.players = copy.deepcopy(game.players)
        new_game.admin_token = game.admin_token
        new_game.started = False
        games[user["game_id"]] = new_game

    return jsonify({"ok": True})


def run_round(game: Game) -> None:
    round_no = game.round_index + 1
    demand = game.demand_for_round(game.round_index)

    incoming_orders: dict[str, int] = {}
    incoming_deliveries: dict[str, int] = {}
    outgoing_deliveries: dict[str, int] = {}
    round_costs: dict[str, float] = {}

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
        round_cost = stock_after * game.holding_cost + backlog_after * game.backlog_cost
        team.total_cost += round_cost

        incoming_orders[team_name] = incoming_order
        incoming_deliveries[team_name] = incoming_delivery
        outgoing_deliveries[team_name] = outgoing_delivery
        round_costs[team_name] = round(round_cost, 2)

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
            "roundCost": round_costs,
            "teamCost": {team: round(game.teams[team].total_cost, 2) for team in TEAM_ORDER},
            "teamState": {
                team: {
                    "stock": game.teams[team].stock,
                    "backlog": game.teams[team].backlog,
                    "totalCost": round(game.teams[team].total_cost, 2),
                }
                for team in TEAM_ORDER
            },
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
