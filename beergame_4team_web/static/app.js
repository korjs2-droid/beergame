const DEFAULT_STAGE_NAMES = ["Retailer", "Wholesaler", "Distributor", "Factory"];
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
  plane: "/static/assets/plane.png",
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
const stageCountInput = document.getElementById("stage-count");
const stageNamesList = document.getElementById("stage-names-list");
const demandScheduleInput = document.getElementById("demand-schedule");
const demandRoundPointInput = document.getElementById("demand-round-point");
const demandValuePointInput = document.getElementById("demand-value-point");
const demandAddBtn = document.getElementById("demand-add-btn");
const demandClearBtn = document.getElementById("demand-clear-btn");
const demandScheduleChartCanvas = document.getElementById("demand-schedule-chart");
const demandPointsList = document.getElementById("demand-points-list");

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
const adminMsg = document.getElementById("admin-msg");
const orderInput = document.getElementById("order");
const teamBoard = document.getElementById("team-board");
const historyEl = document.getElementById("history");
const flowScene = document.getElementById("flow-scene");
const flowOverlay = document.getElementById("flow-overlay");
const flowStageNodes = document.getElementById("flow-stage-nodes");
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
let settingsDirty = false;
let demandPoints = { 0: 5, 4: 10 };
let demandScheduleChart = null;
let currentStageNames = [...DEFAULT_STAGE_NAMES];
let charts = {
  totalCost: null,
  roundCost: null,
  stock: null,
  backlog: null,
  serviceRate: null,
  bullwhip: null,
};

function uniqueNames(names) {
  const uniq = [];
  names.forEach((n) => {
    const name = String(n || "").trim();
    if (name && !uniq.includes(name)) uniq.push(name);
  });
  return uniq;
}

function renderStageNameInputs(stageNames) {
  stageNamesList.innerHTML = "";
  stageNames.forEach((name, idx) => {
    const label = document.createElement("label");
    label.innerHTML = `Stage ${idx + 1}<input class=\"stage-name-input\" type=\"text\" data-index=\"${idx}\" value=\"${name}\" maxlength=\"24\" />`;
    stageNamesList.appendChild(label);
  });
}

function collectStageNamesFromInputs() {
  const inputs = Array.from(stageNamesList.querySelectorAll(".stage-name-input"));
  const names = uniqueNames(inputs.map((input) => input.value));
  return names;
}

function setTeamOptions(stageNames, preferred = "") {
  teamSelect.innerHTML = "";
  stageNames.forEach((team) => {
    const option = document.createElement("option");
    option.value = team;
    option.textContent = team;
    teamSelect.appendChild(option);
  });
  if (preferred && stageNames.includes(preferred)) {
    teamSelect.value = preferred;
  }
}

function syncStageInputsFromNames(stageNames) {
  const clean = uniqueNames(stageNames);
  currentStageNames = [...clean];
  stageCountInput.value = String(clean.length);
  renderStageNameInputs(clean);
}

setTeamOptions(DEFAULT_STAGE_NAMES);

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
  if (adminMsg) {
    adminMsg.textContent = text;
    adminMsg.className = `status ${ok ? "ok" : ""}`;
  }
}

function teamColor(team) {
  if (team === "Retailer") return "#8f4f20";
  if (team === "Wholesaler") return "#3f6c3b";
  if (team === "Distributor") return "#2a6a8a";
  if (team === "Factory") return "#5b3c7e";
  const palette = ["#8c5a2b", "#2f6b55", "#3f658f", "#7b4f8d", "#9a5e3f", "#3b7f71", "#6f5a9a", "#4f5f2d"];
  let sum = 0;
  for (let i = 0; i < team.length; i += 1) sum += team.charCodeAt(i);
  return palette[sum % palette.length];
}

function sortedDemandEntries(points) {
  return Object.entries(points)
    .map(([round, demand]) => [Number(round), Number(demand)])
    .filter(([round, demand]) => Number.isFinite(round) && Number.isFinite(demand) && round >= 0 && demand >= 0)
    .sort((a, b) => a[0] - b[0]);
}

function demandScheduleStringFromPoints() {
  const entries = sortedDemandEntries(demandPoints);
  if (!entries.length || entries[0][0] !== 0) {
    entries.unshift([0, 5]);
  }
  return entries.map(([round, demand]) => `${round}:${demand}`).join(",");
}

function parseDemandScheduleToPoints(raw) {
  const points = {};
  if (typeof raw === "string") {
    raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((part) => {
        const [left, right] = part.split(":");
        const round = Number(left);
        const demand = Number(right);
        if (Number.isFinite(round) && Number.isFinite(demand) && round >= 0 && demand >= 0) {
          points[round] = demand;
        }
      });
  } else if (raw && typeof raw === "object") {
    Object.entries(raw).forEach(([round, demand]) => {
      const r = Number(round);
      const d = Number(demand);
      if (Number.isFinite(r) && Number.isFinite(d) && r >= 0 && d >= 0) {
        points[r] = d;
      }
    });
  }
  if (!Object.prototype.hasOwnProperty.call(points, 0)) points[0] = 5;
  return points;
}

function renderDemandPointsList() {
  demandPointsList.innerHTML = "";
  sortedDemandEntries(demandPoints).forEach(([round, demand]) => {
    const chip = document.createElement("span");
    chip.className = "demand-point-chip";
    chip.innerHTML = `R${round}: ${demand} <button type=\"button\" data-round=\"${round}\">x</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      if (round === 0) return;
      delete demandPoints[round];
      settingsDirty = true;
      demandScheduleInput.value = demandScheduleStringFromPoints();
      renderDemandEditorChart();
      renderDemandPointsList();
    });
    demandPointsList.appendChild(chip);
  });
}

function renderDemandEditorChart() {
  if (!window.Chart) return;
  const entries = sortedDemandEntries(demandPoints);
  const labels = entries.map(([round]) => `R${round}`);
  const values = entries.map(([, demand]) => demand);
  if (demandScheduleChart) {
    demandScheduleChart.destroy();
    demandScheduleChart = null;
  }
  demandScheduleChart = new Chart(demandScheduleChartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Demand",
          data: values,
          borderColor: "#8f4f20",
          backgroundColor: "#8f4f20",
          tension: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });
}

function settingsPayload() {
  demandScheduleInput.value = demandScheduleStringFromPoints();
  const parsedStageNames = collectStageNamesFromInputs();
  const requestedCount = Number(stageCountInput.value);
  let stageNames = parsedStageNames;
  if (stageNames.length === 0) stageNames = [...DEFAULT_STAGE_NAMES];
  if (Number.isFinite(requestedCount) && requestedCount >= 2) {
    stageNames = stageNames.slice(0, requestedCount);
    while (stageNames.length < requestedCount) {
      stageNames.push(`Stage${stageNames.length + 1}`);
    }
  }
  if (stageNames.length < 2) {
    stageNames = [...DEFAULT_STAGE_NAMES];
  }
  syncStageInputsFromNames(stageNames);
  return {
    maxRounds: Number(maxRoundsInput.value),
    holdingCost: Number(holdingCostInput.value),
    backlogCost: Number(backlogCostInput.value),
    initialStock: Number(initialStockInput.value),
    initialIncomingOrder: Number(initialOrderInput.value),
    initialIncomingDelivery: Number(initialDeliveryInput.value),
    demandSchedule: demandScheduleInput.value.trim(),
    stageNames,
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
  if (Array.isArray(settings.stageNames) && settings.stageNames.length >= 2) {
    syncStageInputsFromNames(settings.stageNames);
    setTeamOptions(settings.stageNames, teamSelect.value);
  }
  demandPoints = parseDemandScheduleToPoints(settings.demandSchedule || "0:5,4:10");
  demandScheduleInput.value = demandScheduleStringFromPoints();
  renderDemandEditorChart();
  renderDemandPointsList();
}

function updateAuthMode() {
  const isAdmin = roleSelect.value === "admin";
  teamLabel.classList.toggle("hidden", isAdmin);
  roomCodeLabel.classList.toggle("hidden", isAdmin);
  adminSettings.classList.toggle("hidden", !isAdmin);
  adminActions.classList.toggle("hidden", !isAdmin);
  playerActions.classList.toggle("hidden", isAdmin);
  if (!isAdmin) {
    setTeamOptions(currentStageNames, teamSelect.value);
  }
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

function nodeIdForStage(stageName) {
  return `node-stage-${stageName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function roleAssetForStage(stageName) {
  if (ROLE_ASSETS[stageName]) return ROLE_ASSETS[stageName];
  const lower = stageName.toLowerCase();
  if (lower.includes("retail")) return ROLE_ASSETS.Retailer;
  if (lower.includes("whole")) return ROLE_ASSETS.Wholesaler;
  if (lower.includes("dist")) return ROLE_ASSETS.Distributor;
  if (lower.includes("fact") || lower.includes("plant")) return ROLE_ASSETS.Factory;
  return ROLE_ASSETS.Distributor;
}

function renderFlowNodes(stageNames) {
  flowStageNodes.innerHTML = "";
  const count = stageNames.length;
  const start = 26;
  const end = 80;
  stageNames.forEach((stage, idx) => {
    const node = document.createElement("div");
    node.className = "flow-node";
    node.id = nodeIdForStage(stage);
    const left = count === 1 ? start : start + ((end - start) * idx) / (count - 1);
    node.style.left = `${left}%`;
    node.innerHTML = `<img src="${roleAssetForStage(stage)}" alt="${stage}" /><span>${stage}</span>`;
    flowStageNodes.appendChild(node);
  });
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

function spawnToken(startNode, endNode, lane, qty, kind, delayMs, yOffset = 0) {
  const start = pointFor(startNode, lane);
  const end = pointFor(endNode, lane);
  const token = document.createElement("div");
  token.className = `flow-token ${kind}`;
  if (kind === "order" || kind === "delivery") {
    token.innerHTML = `<img class="flow-token-icon" src="${FLOW_ASSETS[kind]}" alt="${kind}" /><span class="flow-token-qty">${qty}</span>`;
  } else if (kind === "delivery-plane") {
    token.innerHTML = `<img class="flow-token-icon flow-plane-icon" src="${FLOW_ASSETS.plane}" alt="plane delivery" /><span class="flow-token-qty">${qty}</span>`;
  } else {
    token.textContent = String(qty);
  }
  token.style.left = `${start.x - 18}px`;
  token.style.top = `${start.y - 14 + yOffset}px`;
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

function spawnPlane(startNode, endNode, qty, delayMs) {
  if (!qty || qty <= 0) return;
  const start = pointForTruck(startNode);
  const end = pointForTruck(endNode);
  const plane = document.createElement("div");
  plane.className = "flow-truck flow-plane";
  plane.innerHTML = `<img class="flow-truck-icon flow-plane-icon" src="${FLOW_ASSETS.plane}" alt="delivery plane" /><span class="truck-load">${qty}</span>`;
  plane.style.left = `${start.x - 22}px`;
  plane.style.top = `${start.y - 18}px`;
  plane.style.opacity = "0.1";
  flowOverlay.appendChild(plane);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  setTimeout(() => {
    plane.style.opacity = "1";
    plane.style.transform = `translate(${dx}px, ${dy}px)`;
  }, delayMs + animMs(30));

  setTimeout(() => {
    plane.style.opacity = "0";
  }, delayMs + animMs(1050));

  setTimeout(() => {
    plane.remove();
  }, delayMs + animMs(1450));
}

function animateRoundFlow(roundData, isAdminView, stageNames) {
  if (!roundData) return;
  showRoundBadge(roundData.round);

  const firstStage = stageNames[0];
  const orderLegs = [];
  for (let i = 0; i < stageNames.length - 1; i += 1) {
    const from = stageNames[i];
    const to = stageNames[i + 1];
    orderLegs.push([nodeIdForStage(from), nodeIdForStage(to), (roundData.orders && roundData.orders[from]) || 0]);
  }
  const deliveryLegs = [];
  for (let i = stageNames.length - 1; i > 0; i -= 1) {
    const from = stageNames[i];
    const to = stageNames[i - 1];
    deliveryLegs.push([
      nodeIdForStage(from),
      nodeIdForStage(to),
      (roundData.deliveries && roundData.deliveries[from]) || 0,
    ]);
  }
  deliveryLegs.push([
    nodeIdForStage(firstStage),
    "node-customer",
    (roundData.deliveries && roundData.deliveries[firstStage]) || 0,
  ]);

  splitQuantity(roundData.customerDemand || 0, 3).forEach((qty, i) => {
    spawnToken("node-customer", nodeIdForStage(firstStage), "order", qty, "demand", animMs(i * 120));
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
      spawnToken(from, to, "delivery", chunk, "delivery-plane", delay, -16);
    });
  });

  if (isAdminView) {
    const truckLegs = deliveryLegs;
    truckLegs.forEach(([from, to, qty], idx) => {
      const delay = animMs(260 + idx * 190);
      spawnTruck(from, to, qty, delay);
      spawnPlane(from, to, qty, delay);
    });
  }
}

function animateIfNeeded(state, stageNames) {
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
    animateRoundFlow(latest, state.role === "admin", stageNames);
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

async function loadRoomInfoAndTeams() {
  if (roleSelect.value !== "player") return;
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) return;
  try {
    const res = await fetch(`/api/room-info?roomCode=${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Room lookup failed");
    const options = data.availableTeams && data.availableTeams.length ? data.availableTeams : data.stageNames;
    setTeamOptions(options, teamSelect.value);
    if (data.started) {
      setAuthMessage("Game already started. Join is closed.");
    } else {
      setAuthMessage(`Room loaded. Available teams: ${options.length}`, true);
    }
  } catch (err) {
    setAuthMessage(err.message || "Could not load room info");
  }
}

function renderAssignments(assignmentMap, stageNames) {
  assignmentsEl.innerHTML = "";
  for (const team of stageNames) {
    const item = document.createElement("div");
    item.className = "assignment-item";
    const owner = assignmentMap[team] || "waiting";
    item.innerHTML = `<img class="assignment-icon" src="${roleAssetForStage(team)}" alt="${team}" /><strong>${team}</strong><br />${owner}`;
    assignmentsEl.appendChild(item);
  }
}

function renderState(state) {
  authPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  const stageNames = Array.isArray(state.stageNames) && state.stageNames.length >= 2 ? state.stageNames : DEFAULT_STAGE_NAMES;
  currentStageNames = [...stageNames];
  renderFlowNodes(stageNames);
  if (roleSelect.value === "player") {
    setTeamOptions(stageNames, teamSelect.value);
  }

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

  renderAssignments(state.teamAssignments || {}, stageNames);

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

  if (!settingsDirty) {
    applySettingsToInputs(state.settings);
  }

  teamBoard.innerHTML = "";
  for (const team of stageNames) {
    const data = state.teams[team];
    const card = document.createElement("article");
    card.className = "team-card";

    const last = data.lastRound;
    const lastLine = last
      ? `inOrder ${last.incomingOrder}, inDelivery ${last.incomingDelivery}, outDelivery ${last.outgoingDelivery}, placed ${last.placedOrder}`
      : "no round data yet";

    card.innerHTML = `
      <h4><img class="role-inline" src="${roleAssetForStage(team)}" alt="${team}" />${team}</h4>
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
    const orderLine = stageNames.map((team) => `${team}: ${(round.orders && round.orders[team]) || 0}`).join(", ");
    const deliveryLine = stageNames
      .map((team) => `${team}: ${(round.deliveries && round.deliveries[team]) || 0}`)
      .join(", ");
    item.innerHTML = `
      <strong>Round ${round.round}</strong> | Demand ${round.customerDemand}<br />
      Orders: ${orderLine}<br />
      Deliveries: ${deliveryLine}
    `;
    historyEl.appendChild(item);
  }

  animateIfNeeded(state, stageNames);

  if (isAdmin && state.completed) {
    renderAdminReport(state, stageNames);
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

function renderAdminReport(state, stageNames) {
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
  const serviceRateMap = {};
  const bullwhipMap = {};

  stageNames.forEach((team) => {
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
      labels: stageNames,
      datasets: [
        {
          label: "Total Cost",
          data: stageNames.map((t) => totals[t]),
          backgroundColor: stageNames.map((t) => teamColor(t)),
        },
      ],
    },
    options: commonOptions,
  });

  charts.roundCost = new Chart(document.getElementById("chart-round-cost"), {
    type: "line",
    data: {
      labels,
      datasets: stageNames.map((team) => ({
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
      datasets: stageNames.map((team) => ({
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
      datasets: stageNames.map((team) => ({
        label: team,
        data: backlogMap[team],
        borderColor: teamColor(team),
        backgroundColor: teamColor(team),
        tension: 0.2,
      })),
    },
    options: commonOptions,
  });

  const demandByTeam = {};
  stageNames.forEach((team, idx) => {
    if (idx === 0) {
      demandByTeam[team] = history.map((h) => h.customerDemand || 0);
    } else {
      const prev = stageNames[idx - 1];
      demandByTeam[team] = history.map((h) => (h.orders && h.orders[prev]) || 0);
    }
  });

  const rows = stageNames.map((team) => {
    const avgOrder = totalOrders[team] / history.length;
    const orderStd = stddev(orderSeriesMap[team]);
    const demandTotal = demandByTeam[team].reduce((a, b) => a + b, 0);
    const serviceRate = demandTotal > 0 ? (100 * totalDeliveries[team]) / demandTotal : 0;
    const bullwhip = demandStd > 0 ? orderStd / demandStd : 0;
    serviceRateMap[team] = serviceRate;
    bullwhipMap[team] = bullwhip;
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

  charts.serviceRate = new Chart(document.getElementById("chart-service-rate"), {
    type: "bar",
    data: {
      labels: stageNames,
      datasets: [
        {
          label: "Service Rate (%)",
          data: stageNames.map((t) => Number(serviceRateMap[t].toFixed(2))),
          backgroundColor: stageNames.map((t) => teamColor(t)),
        },
      ],
    },
    options: {
      ...commonOptions,
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
        },
      },
    },
  });

  charts.bullwhip = new Chart(document.getElementById("chart-bullwhip"), {
    type: "bar",
    data: {
      labels: stageNames,
      datasets: [
        {
          label: "Bullwhip Index",
          data: stageNames.map((t) => Number(bullwhipMap[t].toFixed(2))),
          backgroundColor: stageNames.map((t) => teamColor(t)),
        },
      ],
    },
    options: {
      ...commonOptions,
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
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
    settingsDirty = false;
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
    settingsDirty = false;
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
    setSubmitMessage("Game reset. Waiting for admin to start again.", true);
    settingsDirty = false;
    await refreshState();
  } catch (err) {
    setSubmitMessage(err.message);
  }
});

adminRoundSaveBtn.addEventListener("click", async () => {
  try {
    const maxRounds = Number(adminMaxRoundsGameInput.value);
    await api("/api/admin/settings", "POST", { maxRounds }, true);
    settingsDirty = false;
    setSubmitMessage(`Round count updated to ${maxRounds}`, true);
    await refreshState();
  } catch (err) {
    setSubmitMessage(err.message);
  }
});

[
  maxRoundsInput,
  holdingCostInput,
  backlogCostInput,
  initialStockInput,
  initialOrderInput,
  initialDeliveryInput,
  stageCountInput,
].forEach((input) => {
  input.addEventListener("input", () => {
    settingsDirty = true;
    if (input === stageCountInput) {
      const requested = Number(stageCountInput.value);
      if (Number.isFinite(requested) && requested >= 2) {
        const existing = collectStageNamesFromInputs();
        let next = existing.slice(0, requested);
        if (next.length === 0) next = [...DEFAULT_STAGE_NAMES].slice(0, requested);
        while (next.length < requested) {
          next.push(`Stage${next.length + 1}`);
        }
        syncStageInputsFromNames(next);
        if (roleSelect.value === "player") {
          setTeamOptions(next, teamSelect.value);
        }
      }
    }
  });
});

stageNamesList.addEventListener("input", () => {
  settingsDirty = true;
});

demandAddBtn.addEventListener("click", () => {
  const round = Number(demandRoundPointInput.value);
  const demand = Number(demandValuePointInput.value);
  if (!Number.isFinite(round) || !Number.isFinite(demand) || round < 0 || demand < 0) {
    setSubmitMessage("Round and demand must be >= 0");
    return;
  }
  demandPoints[Math.floor(round)] = Math.floor(demand);
  settingsDirty = true;
  demandScheduleInput.value = demandScheduleStringFromPoints();
  renderDemandEditorChart();
  renderDemandPointsList();
  setSubmitMessage("Demand point updated", true);
});

demandClearBtn.addEventListener("click", () => {
  demandPoints = { 0: 5, 4: 10 };
  settingsDirty = true;
  demandScheduleInput.value = demandScheduleStringFromPoints();
  renderDemandEditorChart();
  renderDemandPointsList();
  setSubmitMessage("Demand schedule reset", true);
});

roleSelect.addEventListener("change", updateAuthMode);
roomCodeInput.addEventListener("change", loadRoomInfoAndTeams);
roomCodeInput.addEventListener("blur", loadRoomInfoAndTeams);

updateAuthMode();
loadSession();
syncStageInputsFromNames(DEFAULT_STAGE_NAMES);
renderFlowNodes(DEFAULT_STAGE_NAMES);
demandScheduleInput.value = demandScheduleStringFromPoints();
renderDemandEditorChart();
renderDemandPointsList();
if (session.gameId && session.token) {
  refreshState();
}
setInterval(refreshState, 1500);
