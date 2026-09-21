const state = {
  emails: [],
  selectedId: null,
  results: new Map(),
  reviewQueue: [],
  activeView: "inbox",
};

const el = {
  emailList: document.querySelector("#emailList"),
  emailListMeta: document.querySelector("#emailListMeta"),
  searchInput: document.querySelector("#searchInput"),
  inboxCount: document.querySelector("#inboxCount"),
  reviewCount: document.querySelector("#reviewCount"),
  emptyState: document.querySelector("#emptyState"),
  emailDetail: document.querySelector("#emailDetail"),
  detailId: document.querySelector("#detailId"),
  detailSubject: document.querySelector("#detailSubject"),
  detailFrom: document.querySelector("#detailFrom"),
  detailBody: document.querySelector("#detailBody"),
  attachmentList: document.querySelector("#attachmentList"),
  verifyBtn: document.querySelector("#verifyBtn"),
  resultSection: document.querySelector("#resultSection"),
  resultSummary: document.querySelector("#resultSummary"),
  categoryBadge: document.querySelector("#categoryBadge"),
  resultMetrics: document.querySelector("#resultMetrics"),
  escalationBox: document.querySelector("#escalationBox"),
  mismatchWrap: document.querySelector("#mismatchWrap"),
  mismatchTable: document.querySelector("#mismatchTable"),
  reviewList: document.querySelector("#reviewList"),
  refreshBtn: document.querySelector("#refreshBtn"),
  refreshReviewBtn: document.querySelector("#refreshReviewBtn"),
  pageTitle: document.querySelector("#pageTitle"),
  inboxView: document.querySelector("#inboxView"),
  reviewView: document.querySelector("#reviewView"),
  apiDot: document.querySelector("#apiDot"),
  apiStatus: document.querySelector("#apiStatus"),
  dbDot: document.querySelector("#dbDot"),
  dbStatus: document.querySelector("#dbStatus"),
  datasetStatus: document.querySelector("#datasetStatus"),
  toast: document.querySelector("#toast"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch (_) {}
    throw new Error(message);
  }
  return response.json();
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.remove("show"), 2800);
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setHealth(health) {
  el.apiDot.className = "status-dot ok";
  el.apiStatus.textContent = "Online";

  const configured = Boolean(health.supabase_configured);
  el.dbDot.className = `status-dot ${configured ? "ok" : "bad"}`;
  el.dbStatus.textContent = configured ? "Connected" : "Not configured";

  const count = health.email_count;
  if (typeof count === "number") {
    el.datasetStatus.textContent = count === 520 ? "520 · Full" : `${count} emails`;
  } else {
    el.datasetStatus.textContent = "Unavailable";
  }
}

function setHealthError() {
  el.apiDot.className = "status-dot bad";
  el.apiStatus.textContent = "Offline";
  el.dbDot.className = "status-dot bad";
  el.dbStatus.textContent = "Unknown";
  el.datasetStatus.textContent = "Unavailable";
}

function renderEmailList() {
  const query = el.searchInput.value.trim().toLowerCase();
  const filtered = state.emails.filter((email) => {
    const haystack = [
      email.email_id,
      email.from,
      email.subject,
      email.body,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });

  el.emailList.replaceChildren();

  if (!filtered.length) {
    el.emailList.append(make("div", "blank-list", "No emails match your search."));
  } else {
    for (const email of filtered) {
      const row = make("button", "email-row");
      row.type = "button";
      if (email.email_id === state.selectedId) row.classList.add("active");
      row.addEventListener("click", () => selectEmail(email.email_id));

      const top = make("div", "email-row-top");
      top.append(
        make("span", "email-id", email.email_id),
        make("span", "attachment-count", `${(email.attachments || []).length} attachment${(email.attachments || []).length === 1 ? "" : "s"}`)
      );

      row.append(
        top,
        make("div", "email-subject", email.subject || "(No subject)"),
        make("div", "email-from", email.from || "Unknown sender")
      );
      el.emailList.append(row);
    }
  }

  el.emailListMeta.textContent = query
    ? `${filtered.length} of ${state.emails.length} emails`
    : `${state.emails.length} emails loaded`;
  el.inboxCount.textContent = String(state.emails.length);
}

function selectEmail(emailId) {
  const email = state.emails.find((item) => item.email_id === emailId);
  if (!email) return;

  state.selectedId = emailId;
  el.emptyState.classList.add("hidden");
  el.emailDetail.classList.remove("hidden");

  el.detailId.textContent = email.email_id;
  el.detailSubject.textContent = email.subject || "(No subject)";
  el.detailFrom.textContent = `From: ${email.from || "Unknown sender"}`;
  el.detailBody.textContent = email.body || "(No message body)";

  el.attachmentList.replaceChildren();
  const attachments = email.attachments || [];
  if (!attachments.length) {
    el.attachmentList.append(make("span", "attachment-chip", "No attachments"));
  } else {
    for (const attachment of attachments) {
      el.attachmentList.append(make("span", "attachment-chip", attachment.split("/").pop()));
    }
  }

  const cached = state.results.get(emailId);
  if (cached) renderResult(cached);
  else resetResult();

  renderEmailList();
}

function resetResult() {
  el.resultSection.classList.add("hidden");
  el.resultSummary.textContent = "";
  el.resultMetrics.replaceChildren();
  el.escalationBox.classList.add("hidden");
  el.escalationBox.textContent = "";
  el.mismatchWrap.classList.add("hidden");
  el.mismatchTable.replaceChildren();
  el.verifyBtn.textContent = "Run verification";
}

function addMetric(label, value) {
  const card = make("div", "metric");
  card.append(make("div", "metric-label", label), make("div", "metric-value", value));
  el.resultMetrics.append(card);
}

function renderResult(result) {
  el.resultSection.classList.remove("hidden");
  el.resultSummary.textContent = result.summary || "";

  const category = result.category || "UNKNOWN";
  el.categoryBadge.textContent = category;
  el.categoryBadge.className = `badge ${category.toLowerCase()}`;

  el.resultMetrics.replaceChildren();
  addMetric("Category", category);
  addMetric(
    "Mismatch",
    result.mismatch_found === null || result.mismatch_found === undefined
      ? "Not applicable"
      : result.mismatch_found ? "Detected" : "None"
  );
  addMetric("Review required", result.needs_review ? "Yes" : "No");

  if (result.escalation) {
    el.escalationBox.classList.remove("hidden");
    el.escalationBox.textContent =
      `${result.escalation.reason}: ${result.escalation.detail || "Manual review required."}`;
  } else {
    el.escalationBox.classList.add("hidden");
  }

  el.mismatchTable.replaceChildren();
  const mismatches = result.mismatches || [];
  if (mismatches.length) {
    el.mismatchWrap.classList.remove("hidden");
    for (const mismatch of mismatches) {
      const tr = document.createElement("tr");
      tr.append(
        make("td", "", mismatch.field),
        make("td", "", mismatch.si_value),
        make("td", "", mismatch.bl_value)
      );
      el.mismatchTable.append(tr);
    }
  } else {
    el.mismatchWrap.classList.add("hidden");
  }

  el.verifyBtn.textContent = "Run again";
}

async function verifySelected() {
  if (!state.selectedId) return;

  el.verifyBtn.disabled = true;
  const original = el.verifyBtn.textContent;
  el.verifyBtn.textContent = "Verifying…";

  try {
    const result = await api(`/results/${encodeURIComponent(state.selectedId)}`);
    state.results.set(state.selectedId, result);
    renderResult(result);
    await loadReviewQueue(false);
    showToast(`${state.selectedId} verification complete`);
  } catch (error) {
    el.verifyBtn.textContent = original;
    showToast(`Verification failed: ${error.message}`);
  } finally {
    el.verifyBtn.disabled = false;
  }
}

async function loadReviewQueue(showMessage = false) {
  try {
    state.reviewQueue = await api("/review-queue");
    renderReviewQueue();
    if (showMessage) showToast("Review queue refreshed");
  } catch (error) {
    state.reviewQueue = [];
    renderReviewQueue(error.message);
    if (showMessage) showToast(`Could not load review queue: ${error.message}`);
  }
}

function renderReviewQueue(errorMessage = "") {
  el.reviewList.replaceChildren();
  el.reviewCount.textContent = String(state.reviewQueue.length);

  if (errorMessage) {
    el.reviewList.append(make("div", "blank-list", `Could not load queue: ${errorMessage}`));
    return;
  }

  if (!state.reviewQueue.length) {
    el.reviewList.append(make("div", "blank-list", "No unresolved review cases."));
    return;
  }

  for (const item of state.reviewQueue) {
    const card = make("div", "review-card");
    const copy = make("div");
    copy.append(
      make("h3", "", `${item.email_id} · ${item.reason}`),
      make("p", "", item.detail || "Manual review required.")
    );

    const resolve = make("button", "button secondary", "Mark resolved");
    resolve.type = "button";
    resolve.addEventListener("click", async () => {
      resolve.disabled = true;
      resolve.textContent = "Resolving…";
      try {
        await api(`/review-queue/${encodeURIComponent(item.email_id)}/resolve`, { method: "POST" });
        await loadReviewQueue(false);
        showToast(`${item.email_id} marked resolved`);
      } catch (error) {
        resolve.disabled = false;
        resolve.textContent = "Mark resolved";
        showToast(`Resolve failed: ${error.message}`);
      }
    });

    card.append(copy, resolve);
    el.reviewList.append(card);
  }
}

function switchView(view) {
  state.activeView = view;
  const inbox = view === "inbox";
  el.inboxView.classList.toggle("active", inbox);
  el.reviewView.classList.toggle("active", !inbox);
  el.pageTitle.textContent = inbox ? "Inbox verification" : "Human review";
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (!inbox) loadReviewQueue(false);
}

async function refreshAll() {
  el.refreshBtn.disabled = true;
  el.refreshBtn.textContent = "Refreshing…";
  try {
    const [health, emails] = await Promise.all([api("/health"), api("/emails")]);
    setHealth(health);
    state.emails = emails;
    renderEmailList();
    await loadReviewQueue(false);

    if (state.selectedId && !state.emails.some((e) => e.email_id === state.selectedId)) {
      state.selectedId = null;
      el.emailDetail.classList.add("hidden");
      el.emptyState.classList.remove("hidden");
    }
    showToast("Dashboard refreshed");
  } catch (error) {
    setHealthError();
    showToast(`Refresh failed: ${error.message}`);
  } finally {
    el.refreshBtn.disabled = false;
    el.refreshBtn.textContent = "Refresh";
  }
}

document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});
el.searchInput.addEventListener("input", renderEmailList);
el.verifyBtn.addEventListener("click", verifySelected);
el.refreshBtn.addEventListener("click", refreshAll);
el.refreshReviewBtn.addEventListener("click", () => loadReviewQueue(true));

refreshAll();
