const TEAM_ORDER = ["Retailer", "Wholesaler", "Distributor", "Factory"];
const ROLE_ASSETS = {
  Retailer: "/static/assets/retailer.svg",
  Wholesaler: "/static/assets/wholesaler.svg",
  Distributor: "/static/assets/distributor.svg",
  Factory: "/static/assets/factory.svg",
  Customer: "/static/assets/customer.svg",
};
const FLOW_ASSETS = {
  order: "/static/assets/order.png",
  delivery: "/static/assets/truck.png",
};
const ANIMATION_SPEED = 0.3;

function animMs(baseMs) {
  return Math.round(baseMs / ANIMATION_SPEED);
}

const roleSelect = document.getElementById("role");
const teamSelect = document.getElementById("team");
const teamLabel = document.getElementById("team-label");
const nameInput = document.getElementById("name");
const roomCodeInput = document.getElementById("room-code");
const roomCodeLabel = document.getElementById("room-code-label");
const authMsg = document.getElementById("auth-msg");

const adminSettings = document.getElementById("admin-settings");
const adminActions = document.getElementById("admin-actions");
const playerActions = document.getElementById("player-actions");

const maxRoundsInput = document.getElementById("max-rounds");
const holdingCostInput = document.getElementById("holding-cost");
const backlogCostInput = document.getElementById("backlog-cost");
const initialStockInput = document.getElementById("initial-stock");
const initialOrderInput = document.getElementById("initial-order");
const initialDeliveryInput = document.getElementById("initial-delivery");
const demandScheduleInput = document.getElementById("demand-schedule");

const authPanel = document.getElementById("auth-panel");
const gamePanel = document.getElementById("game-panel");

const roomTitle = document.getElementById("room-title");
const assignmentsEl = document.getElementById("assignments");
const adminRoundControl = document.getElementById("admin-round-control");
const adminMaxRoundsGameInput = document.getElementById("admin-max-rounds-game");
const adminRoundSaveBtn = document.getElementById("admin-round-save-btn");
const roundEl = document.getElementById("round");
const demandEl = document.getElementById("demand");
const statusEl = document.getElementById("status");
const submitMsg = document.getElementById("submit-msg");
const orderInput = document.getElementById("order");
const teamBoard = document.getElementById("team-board");
const historyEl = document.getElementById("history");
const flowScene = document.getElementById("flow-scene");
const flowOverlay = document.getElementById("flow-overlay");
const submitBox = document.querySelector(".submit-box");
const adminReport = document.getElementById("admin-report");
const reportTableWrap = document.getElementById("report-table-wrap");

const createBtn = document.getElementById("create-btn");
const joinBtn = document.getElementById("join-btn");
const submitOrderBtn = document.getElementById("submit-order-btn");
const startBtn = document.getElementById("start-btn");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const resetBtn = document.getElementById("reset-btn");

let session = {
  gameId: "",
  token: "",
  roomCode: "",
};
let initializedRoundTracking = false;
let lastAnimatedRound = 0;
let charts = {
  totalCost: null,
  roundCost: null,
  stock: null,
  backlog: null,
};

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

function teamColor(team) {
  if (team === "Retailer") return "#8f4f20";
  if (team === "Wholesaler") return "#3f6c3b";
  if (team === "Distributor") return "#2a6a8a";
  return "#5b3c7e";
}

function settingsPayload() {
  return {
    maxRounds: Number(maxRoundsInput.value),
    holdingCost: Number(holdingCostInput.value),
    backlogCost: Number(backlogCostInput.value),
    initialStock: Number(initialStockInput.value),
    initialIncomingOrder: Number(initialOrderInput.value),
    initialIncomingDelivery: Number(initialDeliveryInput.value),
    demandSchedule: demandScheduleInput.value.trim(),
  };
}

function applySettingsToInputs(settings) {
  if (!settings) return;
  maxRoundsInput.value = settings.maxRounds;
  holdingCostInput.value = settings.holdingCost;
  backlogCostInput.value = settings.backlogCost;
  initialStockInput.value = settings.initialStock;
  initialOrderInput.value = settings.initialIncomingOrder;
  initialDeliveryInput.value = settings.initialIncomingDelivery;
  const demandEntries = Object.entries(settings.demandSchedule || {})
    .map(([round, demand]) => `${round}:${demand}`)
    .join(",");
  demandScheduleInput.value = demandEntries || "0:5,4:10";
}

function updateAuthMode() {
  const isAdmin = roleSelect.value === "admin";
  teamLabel.classList.toggle("hidden", isAdmin);
  roomCodeLabel.classList.toggle("hidden", isAdmin);
  adminSettings.classList.toggle("hidden", !isAdmin);
  adminActions.classList.toggle("hidden", !isAdmin);
  playerActions.classList.toggle("hidden", isAdmin);
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

function pointForTruck(nodeId) {
  const node = document.getElementById(nodeId);
  const sceneBox = flowScene.getBoundingClientRect();
  const nodeBox = node.getBoundingClientRect();
  const x = nodeBox.left - sceneBox.left + nodeBox.width / 2;
  const y = 112;
  return { x, y };
}

function spawnToken(startNode, endNode, lane, qty, kind, delayMs) {
  const start = pointFor(startNode, lane);
  const end = pointFor(endNode, lane);
  const token = document.createElement("div");
  token.className = `flow-token ${kind}`;
  if (kind === "order" || kind === "delivery") {
    token.innerHTML = `<img class="flow-token-icon" src="${FLOW_ASSETS[kind]}" alt="${kind}" /><span class="flow-token-qty">${qty}</span>`;
  } else {
    token.textContent = String(qty);
  }
  token.style.left = `${start.x - 18}px`;
  token.style.top = `${start.y - 14}px`;
  token.style.opacity = "0.2";
  flowOverlay.appendChild(token);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  setTimeout(() => {
    token.style.opacity = "1";
    token.style.transform = `translate(${dx}px, ${dy}px)`;
  }, delayMs + animMs(30));

  setTimeout(() => {
    token.style.opacity = "0";
  }, delayMs + animMs(850));

  setTimeout(() => {
    token.remove();
  }, delayMs + animMs(1150));
}

function showRoundBadge(roundNo) {
  const badge = document.createElement("div");
  badge.className = "flow-round-badge";
  badge.textContent = `Round ${roundNo} resolved`;
  flowOverlay.appendChild(badge);
  setTimeout(() => badge.remove(), animMs(1500));
}

function spawnTruck(startNode, endNode, qty, delayMs) {
  if (!qty || qty <= 0) return;
  const start = pointForTruck(startNode);
  const end = pointForTruck(endNode);
  const truck = document.createElement("div");
  truck.className = "flow-truck";
  truck.innerHTML = `<img class="flow-truck-icon" src="${FLOW_ASSETS.delivery}" alt="delivery truck" /><span class="truck-load">${qty}</span>`;
  truck.style.left = `${start.x - 22}px`;
  truck.style.top = `${start.y}px`;
  truck.style.opacity = "0.1";
  flowOverlay.appendChild(truck);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  setTimeout(() => {
    truck.style.opacity = "1";
    truck.style.transform = `translate(${dx}px, ${dy}px)`;
  }, delayMs + animMs(30));

  setTimeout(() => {
    truck.style.opacity = "0";
  }, delayMs + animMs(1050));

  setTimeout(() => {
    truck.remove();
  }, delayMs + animMs(1450));
}

function animateRoundFlow(roundData, isAdminView) {
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

  splitQuantity(roundData.customerDemand || 0, 3).forEach((qty, i) => {
    spawnToken("node-customer", "node-retailer", "order", qty, "demand", animMs(i * 120));
  });

  orderLegs.forEach(([from, to, qty], legIdx) => {
    splitQuantity(qty, 4).forEach((chunk, chunkIdx) => {
      const delay = animMs(80 + legIdx * 90 + chunkIdx * 120);
      spawnToken(from, to, "order", chunk, "order", delay);
    });
  });

  deliveryLegs.forEach(([from, to, qty], legIdx) => {
    splitQuantity(qty, 4).forEach((chunk, chunkIdx) => {
      const delay = animMs(220 + legIdx * 90 + chunkIdx * 120);
      spawnToken(from, to, "delivery", chunk, "delivery", delay);
    });
  });

  if (isAdminView) {
    const truckLegs = [
      ["node-factory", "node-distributor", roundData.deliveries.Factory],
      ["node-distributor", "node-wholesaler", roundData.deliveries.Distributor],
      ["node-wholesaler", "node-retailer", roundData.deliveries.Wholesaler],
      ["node-retailer", "node-customer", roundData.deliveries.Retailer],
    ];
    truckLegs.forEach(([from, to, qty], idx) => {
      spawnTruck(from, to, qty, animMs(260 + idx * 190));
    });
  }
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
    animateRoundFlow(latest, state.role === "admin");
  }
}

function saveSession() {
  localStorage.setItem("beerGameSession", JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem("beerGameSession");
  session = { gameId: "", token: "", roomCode: "" };
}

function loadSession() {
  const raw = localStorage.getItem("beerGameSession");
  if (!raw) return;
  try {
    session = JSON.parse(raw);
  } catch {
    clearSession();
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

function renderAssignments(assignmentMap) {
  assignmentsEl.innerHTML = "";
  for (const team of TEAM_ORDER) {
    const item = document.createElement("div");
    item.className = "assignment-item";
    const owner = assignmentMap[team] || "waiting";
    item.innerHTML = `<img class="assignment-icon" src="${ROLE_ASSETS[team]}" alt="${team}" /><strong>${team}</strong><br />${owner}`;
    assignmentsEl.appendChild(item);
  }
}

function renderState(state) {
  authPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");

  const isAdmin = state.role === "admin";
  const teamLabel = isAdmin ? "Admin" : `Team ${state.yourTeam}`;
  roomTitle.textContent = `Room ${state.roomCode} | ${teamLabel}`;
  roundEl.textContent = `${state.round} / ${state.maxRounds}`;
  demandEl.textContent = state.currentDemand == null ? "Hidden" : state.currentDemand;

  if (state.completed) {
    statusEl.textContent = "Finished";
  } else if (!state.started) {
    statusEl.textContent = state.allTeamsJoined
      ? "Ready. Admin can start the game."
      : "Waiting for 4 player teams";
  } else {
    statusEl.textContent = `Collecting orders (${state.submissionsCount}/4)`;
  }

  renderAssignments(state.teamAssignments || {});

  submitBox.classList.toggle("hidden", isAdmin);
  adminRoundControl.classList.toggle("hidden", !isAdmin);
  startBtn.classList.toggle("hidden", !isAdmin);
  saveSettingsBtn.classList.toggle("hidden", !isAdmin);
  resetBtn.classList.toggle("hidden", !isAdmin);

  startBtn.disabled = !state.canStart;
  saveSettingsBtn.disabled = state.started;
  resetBtn.disabled = false;
  adminRoundSaveBtn.disabled = state.started;
  adminMaxRoundsGameInput.value = state.maxRounds;
  adminReport.classList.toggle("hidden", !(isAdmin && state.completed));

  if (!isAdmin) {
    const myTeam = state.yourTeam;
    const mySubmitted = state.teams[myTeam].orderSubmitted;
    submitOrderBtn.disabled = !state.started || state.completed || mySubmitted;
    if (mySubmitted && !state.completed) {
      setSubmitMessage("Submitted. Waiting for other teams...", true);
    }
  } else {
    submitOrderBtn.disabled = true;
  }

  applySettingsToInputs(state.settings);

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
      <h4><img class="role-inline" src="${ROLE_ASSETS[team]}" alt="${team}" />${team}</h4>
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

  if (isAdmin && state.completed) {
    renderAdminReport(state);
  }
}

function stddev(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function destroyCharts() {
  Object.keys(charts).forEach((key) => {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  });
}

function demandSeriesFromHistory(history) {
  return history.map((h) => h.customerDemand || 0);
}

function renderAdminReport(state) {
  if (!window.Chart) {
    reportTableWrap.innerHTML = "<p>Chart library failed to load.</p>";
    return;
  }
  const history = state.historyAll || [];
  if (!history.length) {
    reportTableWrap.innerHTML = "<p>No round data available.</p>";
    return;
  }

  const labels = history.map((h) => `R${h.round}`);
  const finalCost = history[history.length - 1].teamCost;
  const demandSeries = demandSeriesFromHistory(history);
  const demandStd = stddev(demandSeries);

  const totals = {};
  const roundCostMap = {};
  const stockMap = {};
  const backlogMap = {};
  const totalOrders = {};
  const totalDeliveries = {};
  const maxBacklog = {};
  const orderSeriesMap = {};

  TEAM_ORDER.forEach((team) => {
    totals[team] = finalCost[team] || 0;
    roundCostMap[team] = history.map((h) => (h.roundCost && h.roundCost[team]) || 0);
    stockMap[team] = history.map((h) => (h.teamState && h.teamState[team] ? h.teamState[team].stock : 0));
    backlogMap[team] = history.map((h) =>
      h.teamState && h.teamState[team] ? h.teamState[team].backlog : 0
    );
    orderSeriesMap[team] = history.map((h) => (h.orders && h.orders[team]) || 0);
    totalOrders[team] = orderSeriesMap[team].reduce((a, b) => a + b, 0);
    totalDeliveries[team] = history
      .map((h) => (h.deliveries && h.deliveries[team]) || 0)
      .reduce((a, b) => a + b, 0);
    maxBacklog[team] = Math.max(...backlogMap[team]);
  });

  destroyCharts();
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom" } },
  };

  charts.totalCost = new Chart(document.getElementById("chart-total-cost"), {
    type: "bar",
    data: {
      labels: TEAM_ORDER,
      datasets: [
        {
          label: "Total Cost",
          data: TEAM_ORDER.map((t) => totals[t]),
          backgroundColor: TEAM_ORDER.map((t) => teamColor(t)),
        },
      ],
    },
    options: commonOptions,
  });

  charts.roundCost = new Chart(document.getElementById("chart-round-cost"), {
    type: "line",
    data: {
      labels,
      datasets: TEAM_ORDER.map((team) => ({
        label: team,
        data: roundCostMap[team],
        borderColor: teamColor(team),
        backgroundColor: teamColor(team),
        tension: 0.25,
      })),
    },
    options: commonOptions,
  });

  charts.stock = new Chart(document.getElementById("chart-stock"), {
    type: "line",
    data: {
      labels,
      datasets: TEAM_ORDER.map((team) => ({
        label: team,
        data: stockMap[team],
        borderColor: teamColor(team),
        backgroundColor: teamColor(team),
        tension: 0.2,
      })),
    },
    options: commonOptions,
  });

  charts.backlog = new Chart(document.getElementById("chart-backlog"), {
    type: "line",
    data: {
      labels,
      datasets: TEAM_ORDER.map((team) => ({
        label: team,
        data: backlogMap[team],
        borderColor: teamColor(team),
        backgroundColor: teamColor(team),
        tension: 0.2,
      })),
    },
    options: commonOptions,
  });

  const demandByTeam = {
    Retailer: history.map((h) => h.customerDemand || 0),
    Wholesaler: history.map((h) => (h.orders && h.orders.Retailer) || 0),
    Distributor: history.map((h) => (h.orders && h.orders.Wholesaler) || 0),
    Factory: history.map((h) => (h.orders && h.orders.Distributor) || 0),
  };

  const rows = TEAM_ORDER.map((team) => {
    const avgOrder = totalOrders[team] / history.length;
    const orderStd = stddev(orderSeriesMap[team]);
    const demandTotal = demandByTeam[team].reduce((a, b) => a + b, 0);
    const serviceRate = demandTotal > 0 ? (100 * totalDeliveries[team]) / demandTotal : 0;
    const bullwhip = demandStd > 0 ? orderStd / demandStd : 0;
    return {
      team,
      totalCost: totals[team].toFixed(2),
      serviceRate: `${serviceRate.toFixed(1)}%`,
      avgOrder: avgOrder.toFixed(2),
      orderStd: orderStd.toFixed(2),
      maxBacklog: maxBacklog[team],
      bullwhip: bullwhip.toFixed(2),
    };
  });

  reportTableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Team</th>
          <th>Total Cost</th>
          <th>Service Rate</th>
          <th>Avg Order</th>
          <th>Order StdDev</th>
          <th>Max Backlog</th>
          <th>Bullwhip idx</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
          <td>${r.team}</td>
          <td>${r.totalCost}</td>
          <td>${r.serviceRate}</td>
          <td>${r.avgOrder}</td>
          <td>${r.orderStd}</td>
          <td>${r.maxBacklog}</td>
          <td>${r.bullwhip}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

async function refreshState() {
  if (!session.gameId || !session.token) return;
  try {
    const state = await api("/api/state", "GET", null, true);
    renderState(state);
  } catch (err) {
    if (String(err.message).includes("Unauthorized")) {
      clearSession();
      gamePanel.classList.add("hidden");
      authPanel.classList.remove("hidden");
      setAuthMessage("Session expired. Please join again.");
      return;
    }
    setSubmitMessage(err.message);
  }
}

createBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/admin/create", "POST", { name: nameInput.value.trim(), ...settingsPayload() }, false);
    session = data;
    initializedRoundTracking = false;
    lastAnimatedRound = 0;
    saveSession();
    roomCodeInput.value = data.roomCode;
    setAuthMessage(`Admin room created: ${data.roomCode}`, true);
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

startBtn.addEventListener("click", async () => {
  try {
    await api("/api/admin/start", "POST", {}, true);
    setSubmitMessage("Game started", true);
    await refreshState();
  } catch (err) {
    setSubmitMessage(err.message);
  }
});

saveSettingsBtn.addEventListener("click", async () => {
  try {
    await api("/api/admin/settings", "POST", settingsPayload(), true);
    setSubmitMessage("Settings saved", true);
    await refreshState();
  } catch (err) {
    setSubmitMessage(err.message);
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
    initializedRoundTracking = false;
    lastAnimatedRound = 0;
    setSubmitMessage("Game reset", true);
    await refreshState();
  } catch (err) {
    setSubmitMessage(err.message);
  }
});

adminRoundSaveBtn.addEventListener("click", async () => {
  try {
    const maxRounds = Number(adminMaxRoundsGameInput.value);
    await api("/api/admin/settings", "POST", { maxRounds }, true);
    setSubmitMessage(`Round count updated to ${maxRounds}`, true);
    await refreshState();
  } catch (err) {
    setSubmitMessage(err.message);
  }
});

roleSelect.addEventListener("change", updateAuthMode);

updateAuthMode();
loadSession();
if (session.gameId && session.token) {
  refreshState();
}
setInterval(refreshState, 1500);
