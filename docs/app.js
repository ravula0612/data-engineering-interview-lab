"use strict";

const get = id => document.getElementById(id);
const byId = new Map(QUESTIONS.map(question => [question.id, question]));
const storageKey = "de-interview-lab-practice-v1";
const pageSize = 8;

function readProgress() {
  try {
    const ids = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter(id => byId.has(id)) : []);
  } catch {
    return new Set();
  }
}

const practiced = readProgress();
const filters = ["search", "topic", "difficulty", "progress-filter"].map(get);
const questionDialog = get("question-dialog");
const mockDialog = get("mock-dialog");
let visibleLimit = pageSize;
let selectedQuestion;
let returnHash = "#practice";
let questionOpener;
let toastTimeout;
let mockSession;
let timer;

function element(tag, value = "", className = "") {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function button(label, className, action) {
  const node = element("button", label, `button ${className}`);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function solutionContent(question) {
  const body = element("div");
  body.append(element("p", question.answer));
  if (question.code) {
    const pre = element("pre");
    pre.append(element("code", question.code));
    body.append(pre);
  }
  const list = element("ul");
  list.append(...question.rubric.map(item => element("li", item)));
  body.append(element("strong", "A strong answer covers"), list);
  if (question.source) {
    const link = element("a", "Read the official documentation");
    link.href = question.source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    body.append(link);
  }
  return body;
}

function renderProgress() {
  get("question-total").textContent = QUESTIONS.length;
  get("completed-total").textContent = `${practiced.size} / ${QUESTIONS.length}`;
  get("completed-bar").style.width = `${100 * practiced.size / QUESTIONS.length}%`;
}

function questionRow(question) {
  const info = element("div");
  const link = element("a", question.title);
  link.href = `#q=${question.id}`;
  link.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    returnHash = location.hash || "#practice";
    questionOpener = link;
  });
  info.append(link, element("small", question.topic));
  const done = practiced.has(question.id);
  const row = element("article", "", "question");
  row.append(
    info,
    element("span", question.level, `tag ${question.level.toLowerCase()}`),
    element("span", done ? "Practiced" : "To practice", done ? "state done" : "state")
  );
  return row;
}

function renderQuestions({ keepRows = false } = {}) {
  const [query, topic, level, progress] = filters.map(field => field.value);
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = QUESTIONS.filter(question => {
    const text = `${question.title} ${question.topic} ${question.prompt} ${question.answer}`.toLowerCase();
    return (!topic || question.topic === topic)
      && (!level || question.level === level)
      && (!progress || practiced.has(question.id) === (progress === "done"))
      && terms.every(term => text.includes(term));
  });
  const shown = matches.slice(0, visibleLimit);
  get("results").textContent = matches.length
    ? `Showing ${shown.length} of ${matches.length} ${matches.length === 1 ? "question" : "questions"}`
    : "No questions match. Try another search or clear a filter.";
  const list = get("questions");
  const previousCount = keepRows ? list.children.length : 0;
  const rows = shown.slice(previousCount).map(questionRow);
  if (keepRows) list.append(...rows);
  else list.replaceChildren(...rows);
  get("more").hidden = shown.length === matches.length;
  return rows[0]?.querySelector("a");
}

function notify(message) {
  const toast = get("toast");
  const container = questionDialog.open ? questionDialog.querySelector(".dialog-inner") : document.body;
  container.append(toast);
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 4200);
}

async function share(url, title) {
  try {
    await navigator.clipboard.writeText(url);
    notify("Link copied.");
  } catch {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    window.prompt("Copy this link", url);
  }
}

function renderQuestionButton() {
  const done = practiced.has(selectedQuestion.id);
  const control = get("complete");
  control.setAttribute("aria-pressed", String(done));
  control.textContent = done ? "Practiced" : "Mark as practiced";
}

function route() {
  const match = /^#q=([a-z-]+)$/.exec(location.hash);
  const question = match && byId.get(match[1]);
  if (!question) {
    if (questionDialog.open) questionDialog.close();
    return;
  }

  if (mockDialog.open) mockDialog.close();
  selectedQuestion = question;
  get("question-meta").textContent = `${question.topic} · ${question.level}`;
  get("question-title").textContent = question.title;
  get("question-prompt").textContent = question.prompt;
  get("solution").open = false;
  get("solution-body").replaceChildren(solutionContent(question));
  renderQuestionButton();
  if (!questionDialog.open) questionDialog.showModal();
  questionDialog.scrollTop = 0;
}

function keepProgress() {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...practiced]));
  } catch {
    notify("Progress is saved for this page session.");
  }
}

function renderMockList() {
  get("mock-list").replaceChildren(...MOCKS.map(mock => {
    const card = element("article", "", "mock-card");
    const current = mockSession?.mock === mock;
    const action = current ? (mockSession.finished ? "Review mock" : "Resume mock") : "Start mock";
    const start = button(action, "secondary", () => openMock(mock));
    start.setAttribute("aria-label", `${action} — ${mock.title}`);
    card.append(element("p", `${mock.minutes} minutes · 3 prompts`, "label"),
      element("h3", mock.title), element("p", mock.description), start);
    return card;
  }));
}

function tick() {
  const seconds = Math.max(0, Math.ceil((mockSession.deadline - Date.now()) / 1000));
  const display = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const countdown = get("countdown");
  if (countdown) countdown.textContent = display;
  if (!seconds) finishMock(true);
}

function openMock(mock, restart = false) {
  if (mockSession?.mock !== mock || restart) {
    if (mockSession && !mockSession.finished
      && !window.confirm("Start this round and clear the current mock answers?")) return;
    clearInterval(timer);
    mockSession = {
      mock, index: 0, answers: Array(mock.ids.length).fill(""),
      deadline: Date.now() + mock.minutes * 60_000,
      finished: false, expired: false
    };
    timer = setInterval(tick, 250);
  }
  get("mock-title").textContent = mock.title;
  if (mockSession.finished) {
    mockDialog.showModal();
    renderMockReview();
  } else {
    renderMockQuestion();
    if (!mockDialog.open) mockDialog.showModal();
    tick();
  }
}

function renderMockQuestion() {
  const { mock, index, answers } = mockSession;
  const question = byId.get(mock.ids[index]);
  const clock = element("span");
  clock.id = "countdown";
  clock.setAttribute("role", "timer");
  get("mock-status").replaceChildren(`Prompt ${index + 1} of ${mock.ids.length} · `, clock);
  const field = element("textarea");
  field.rows = 5;
  field.placeholder = "Write your approach or rehearse it aloud.";
  field.value = answers[index];
  field.addEventListener("input", () => { answers[index] = field.value; });
  const label = element("label", "Your answer");
  label.append(field);
  const title = element("h3", question.title);
  title.tabIndex = -1;
  get("mock-content").replaceChildren(title, element("p", question.prompt, "prompt"), label);
  const last = index === mock.ids.length - 1;
  const controls = get("mock-actions");
  controls.replaceChildren();
  if (index > 0) {
    controls.append(button("Previous prompt", "secondary", () => changeMockPrompt(-1)));
  }
  controls.append(button(last ? "Finish and review" : "Next prompt", "primary",
    () => last ? finishMock(false) : changeMockPrompt(1)));
  if (!last) controls.append(button("Finish early", "quiet", () => finishMock(false)));
  return title;
}

function changeMockPrompt(step) {
  mockSession.index += step;
  const title = renderMockQuestion();
  tick();
  if (!mockSession.finished) title.focus();
}

function finishMock(expired) {
  clearInterval(timer);
  if (mockSession.finished) return;
  mockSession.finished = true;
  mockSession.expired = expired;
  if (mockDialog.open) renderMockReview();
  else renderMockList();
}

function renderMockReview() {
  const { mock, answers, expired } = mockSession;
  const attempted = answers.filter(answer => answer.trim()).length;
  get("mock-status").textContent = expired ? "Time’s up · Review" : "Round complete · Review";
  const review = mock.ids.map((id, index) => {
    const question = byId.get(id);
    const details = element("details", "", "solution mock-review");
    const summary = element("summary", question.title);
    details.append(summary, element("p", "Your notes"),
      element("p", answers[index].trim() || "No notes entered.", "prompt"),
      solutionContent(question));
    return details;
  });
  get("mock-content").replaceChildren(element("p", `${attempted} of ${mock.ids.length} prompts have written notes. Check your reasoning against each rubric.`, "prompt"), ...review);
  get("mock-actions").replaceChildren(
    button("Back to mock interviews", "primary", () => mockDialog.close()),
    button("Retake round", "secondary", () => {
      openMock(mock, true);
      get("mock-content").querySelector("h3").focus();
    })
  );
  review[0].querySelector("summary").focus();
}

for (const topic of new Set(QUESTIONS.map(question => question.topic))) {
  get("topic").append(new Option(topic));
}

for (const field of filters) {
  field.addEventListener(field.type === "search" ? "input" : "change", () => {
    visibleLimit = pageSize;
    renderQuestions();
  });
}
get("filters").addEventListener("submit", event => event.preventDefault());
get("more").addEventListener("click", () => {
  visibleLimit += pageSize;
  renderQuestions({ keepRows: true })?.focus();
});
document.querySelectorAll(".topic-jump").forEach(control => {
  control.addEventListener("click", () => {
    get("filters").reset();
    get("topic").value = control.dataset.topic;
    visibleLimit = pageSize;
    renderQuestions();
    location.hash = "practice";
    get("search").focus();
  });
});

get("complete").addEventListener("click", () => {
  const id = selectedQuestion.id;
  if (practiced.has(id)) practiced.delete(id);
  else practiced.add(id);
  renderQuestionButton();
  renderProgress();
  renderQuestions();
  keepProgress();
});

get("close-question").addEventListener("click", () => questionDialog.close());
questionDialog.addEventListener("close", () => {
  get("toast").hidden = true;
  if (location.hash.startsWith("#q=")) history.replaceState(null, "", returnHash);
  if (questionOpener) {
    const replacement = [...get("questions").querySelectorAll("a")]
      .find(link => link.hash === questionOpener.hash);
    (replacement ?? get("search")).focus({ preventScroll: true });
    questionOpener = undefined;
  }
});
get("close-mock").addEventListener("click", () => mockDialog.close());
mockDialog.addEventListener("close", () => {
  renderMockList();
  const index = MOCKS.indexOf(mockSession?.mock);
  get("mock-list").children[index]?.querySelector("button").focus();
});
get("share").addEventListener("click", () => share(location.href.split("#")[0], document.title));
get("share-question").addEventListener("click", () => share(location.href, selectedQuestion.title));
window.addEventListener("hashchange", route);

renderQuestions();
renderProgress();
renderMockList();
route();
