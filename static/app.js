const TEAM_ORDER = ["Retailer", "Wholesaler", "Distributor", "Factory"];

const teamSelect = document.getElementById("team");
const nameInput = document.getElementById("name");
const roomCodeInput = document.getElementById("room-code");
const authMsg = document.getElementById("auth-msg");

const authPanel = document.getElementById("auth-panel");
const gamePanel = document.getElementById("game-panel");

const roomTitle = document.getElementById("room-title");
const roundEl = document.getElementById("round");
const demandEl = document.getElementById("demand");
const statusEl = document.getElementById("status");
const submitMsg = document.getElementById("submit-msg");
const orderInput = document.getElementById("order");
const teamBoard = document.getElementById("team-board");
const historyEl = document.getElementById("history");
const flowScene = document.getElementById("flow-scene");
const flowOverlay = document.getElementById("flow-overlay");

const createBtn = document.getElementById("create-btn");
const joinBtn = document.getElementById("join-btn");
const submitOrderBtn = document.getElementById("submit-order-btn");
const resetBtn = document.getElementById("reset-btn");

let session = {
  gameId: "",
  token: "",
  roomCode: "",
};
let initializedRoundTracking = false;
let lastAnimatedRound = 0;

for (const team of TEAM_ORDER) {
  const option = document.createElement("option");
  option.value = team;
  option.textContent = team;
  teamSelect.appendChild(option);
}

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Game-Id": session.gameId,
    "X-Player-Token": session.token,
  };
}

function setAuthMessage(text, ok = false) {
  authMsg.textContent = text;
  authMsg.className = `status ${ok ? "ok" : ""}`;
}

function setSubmitMessage(text, ok = false) {
  submitMsg.textContent = text;
  submitMsg.className = `status ${ok ? "ok" : ""}`;
}

function splitQuantity(total, maxTokens = 4) {
  if (!Number.isFinite(total) || total <= 0) return [];
  const tokenCount = Math.min(maxTokens, total);
  const base = Math.floor(total / tokenCount);
  let remainder = total % tokenCount;
  const parts = [];
  for (let i = 0; i < tokenCount; i += 1) {
    const add = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    parts.push(base + add);
  }
  return parts;
}

function pointFor(nodeId, lane) {
  const node = document.getElementById(nodeId);
  const sceneBox = flowScene.getBoundingClientRect();
  const nodeBox = node.getBoundingClientRect();
  const x = nodeBox.left - sceneBox.left + nodeBox.width / 2;
  const y = lane === "order" ? 156 : 56;
  return { x, y };
}

function spawnToken(startNode, endNode, lane, qty, kind, delayMs) {
  const start = pointFor(startNode, lane);
  const end = pointFor(endNode, lane);
  const token = document.createElement("div");
  token.className = `flow-token ${kind}`;
  token.textContent = String(qty);
  token.style.left = `${start.x - 14}px`;
  token.style.top = `${start.y - 12}px`;
  token.style.opacity = "0.2";
  flowOverlay.appendChild(token);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  setTimeout(() => {
    token.style.opacity = "1";
    token.style.transform = `translate(${dx}px, ${dy}px)`;
  }, delayMs + 30);

  setTimeout(() => {
    token.style.opacity = "0";
  }, delayMs + 850);

  setTimeout(() => {
    token.remove();
  }, delayMs + 1150);
}

function showRoundBadge(roundNo) {
  const badge = document.createElement("div");
  badge.className = "flow-round-badge";
  badge.textContent = `Round ${roundNo} resolved`;
  flowOverlay.appendChild(badge);
  setTimeout(() => badge.remove(), 1500);
}

function animateRoundFlow(roundData) {
  if (!roundData) return;
  showRoundBadge(roundData.round);

  const orderLegs = [
    ["node-retailer", "node-wholesaler", roundData.orders.Retailer],
    ["node-wholesaler", "node-distributor", roundData.orders.Wholesaler],
    ["node-distributor", "node-factory", roundData.orders.Distributor],
  ];
  const deliveryLegs = [
    ["node-factory", "node-distributor", roundData.deliveries.Factory],
    ["node-distributor", "node-wholesaler", roundData.deliveries.Distributor],
    ["node-wholesaler", "node-retailer", roundData.deliveries.Wholesaler],
    ["node-retailer", "node-customer", roundData.deliveries.Retailer],
  ];

  const demandParts = splitQuantity(roundData.customerDemand || 0, 3);
  demandParts.forEach((qty, i) => {
    spawnToken("node-customer", "node-retailer", "order", qty, "demand", i * 120);
  });

  orderLegs.forEach(([from, to, qty], legIdx) => {
    splitQuantity(qty, 4).forEach((chunk, chunkIdx) => {
      const delay = 80 + legIdx * 90 + chunkIdx * 120;
      spawnToken(from, to, "order", chunk, "order", delay);
    });
  });

  deliveryLegs.forEach(([from, to, qty], legIdx) => {
    splitQuantity(qty, 4).forEach((chunk, chunkIdx) => {
      const delay = 220 + legIdx * 90 + chunkIdx * 120;
      spawnToken(from, to, "delivery", chunk, "delivery", delay);
    });
  });
}

function animateIfNeeded(state) {
  if (!state.history || state.history.length === 0) return;
  const latest = state.history[state.history.length - 1];
  if (!latest) return;

  if (!initializedRoundTracking) {
    initializedRoundTracking = true;
    lastAnimatedRound = latest.round;
    return;
  }

  if (latest.round > lastAnimatedRound) {
    lastAnimatedRound = latest.round;
    animateRoundFlow(latest);
  }
}

function saveSession() {
  localStorage.setItem("beerGameSession", JSON.stringify(session));
}

function loadSession() {
  const raw = localStorage.getItem("beerGameSession");
  if (!raw) return;
  try {
    session = JSON.parse(raw);
  } catch {
    localStorage.removeItem("beerGameSession");
  }
}

async function api(path, method = "GET", body = null, includeAuth = true) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (includeAuth) {
    opts.headers = headers();
  }
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function renderState(state) {
  authPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");

  roomTitle.textContent = `Room ${state.roomCode} | Team ${state.yourTeam}`;
  roundEl.textContent = `${state.round} / ${state.maxRounds}`;
  demandEl.textContent = state.currentDemand == null ? "Hidden" : state.currentDemand;

  const submittedCount = TEAM_ORDER.filter((t) => state.teams[t].orderSubmitted).length;
  if (state.completed) {
    statusEl.textContent = "Finished";
  } else if (!state.started) {
    statusEl.textContent = "Waiting for all 4 teams";
  } else {
    statusEl.textContent = `Collecting orders (${submittedCount}/4)`;
  }

  const myTeam = state.yourTeam;
  const mySubmitted = state.teams[myTeam].orderSubmitted;
  submitOrderBtn.disabled = !state.started || state.completed || mySubmitted;
  if (mySubmitted && !state.completed) {
    setSubmitMessage("Submitted. Waiting for other teams...", true);
  }

  teamBoard.innerHTML = "";
  for (const team of TEAM_ORDER) {
    const data = state.teams[team];
    const card = document.createElement("article");
    card.className = "team-card";

    const last = data.lastRound;
    const lastLine = last
      ? `inOrder ${last.incomingOrder}, inDelivery ${last.incomingDelivery}, outDelivery ${last.outgoingDelivery}, placed ${last.placedOrder}`
      : "no round data yet";

    card.innerHTML = `
      <h4>${team}</h4>
      <div>Stock: <strong>${data.stock}</strong></div>
      <div>Backlog: <strong>${data.backlog}</strong></div>
      <div>Total Cost: <strong>${data.totalCost}</strong></div>
      <div class="meta">${data.orderSubmitted ? "order submitted" : "waiting"}</div>
      <div class="meta">${lastLine}</div>
    `;
    teamBoard.appendChild(card);
  }

  historyEl.innerHTML = "";
  const rounds = [...state.history].reverse();
  for (const round of rounds) {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <strong>Round ${round.round}</strong> | Demand ${round.customerDemand}<br />
      Orders: R ${round.orders.Retailer}, W ${round.orders.Wholesaler}, D ${round.orders.Distributor}, F ${round.orders.Factory}<br />
      Deliveries: R ${round.deliveries.Retailer}, W ${round.deliveries.Wholesaler}, D ${round.deliveries.Distributor}, F ${round.deliveries.Factory}
    `;
    historyEl.appendChild(item);
  }

  animateIfNeeded(state);
}

async function refreshState() {
  if (!session.gameId || !session.token) return;
  try {
    const state = await api("/api/state", "GET", null, true);
    renderState(state);
  } catch (err) {
    setSubmitMessage(err.message);
  }
}

createBtn.addEventListener("click", async () => {
  try {
    const data = await api(
      "/api/create",
      "POST",
      { name: nameInput.value.trim(), team: teamSelect.value },
      false
    );
    session = data;
    initializedRoundTracking = false;
    lastAnimatedRound = 0;
    saveSession();
    roomCodeInput.value = data.roomCode;
    setAuthMessage(`Room created: ${data.roomCode}`, true);
    await refreshState();
  } catch (err) {
    setAuthMessage(err.message);
  }
});

joinBtn.addEventListener("click", async () => {
  try {
    const data = await api(
      "/api/join",
      "POST",
      { roomCode: roomCodeInput.value.trim(), name: nameInput.value.trim(), team: teamSelect.value },
      false
    );
    session = data;
    initializedRoundTracking = false;
    lastAnimatedRound = 0;
    saveSession();
    setAuthMessage(`Joined room: ${data.roomCode}`, true);
    await refreshState();
  } catch (err) {
    setAuthMessage(err.message);
  }
});

submitOrderBtn.addEventListener("click", async () => {
  try {
    await api("/api/submit-order", "POST", { order: Number(orderInput.value) }, true);
    setSubmitMessage("Order submitted", true);
    await refreshState();
  } catch (err) {
    setSubmitMessage(err.message);
  }
});

resetBtn.addEventListener("click", async () => {
  try {
    await api("/api/reset", "POST", {}, true);
    setSubmitMessage("Game reset", true);
    await refreshState();
  } catch (err) {
    setSubmitMessage(err.message);
  }
});

loadSession();
if (session.gameId && session.token) {
  refreshState();
}
setInterval(refreshState, 1500);
