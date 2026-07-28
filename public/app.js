const API = "/api";
let token = localStorage.getItem("wa_token");
let watching = false;
let currentSessionId = null;
let durationSeconds = 12;

const $ = (id) => document.getElementById(id);

// ---------- شاشات ----------
function showApp(username) {
  $("login-screen").style.display = "none";
  $("app-screen").style.display = "block";
  if (username) $("user-name").textContent = username;
  loadWallet();
  loadHistory();
  loadOfferwall();
}

async function loadOfferwall() {
  try {
    const data = await api("/offerwall/url");
    if (data.configured) {
      $("offerwall-frame").src = data.url;
      $("offerwall-section").style.display = "block";
      $("demo-notice").style.display = "none";
    } else {
      $("offerwall-section").style.display = "none";
      $("demo-notice").style.display = "block";
    }
  } catch (err) {
    $("offerwall-section").style.display = "none";
    $("demo-notice").style.display = "block";
  }
}
function showLogin() {
  $("app-screen").style.display = "none";
  $("login-screen").style.display = "flex";
}

$("show-register").onclick = (e) => {
  e.preventDefault();
  document.querySelector(".login-card").style.display = "none";
  $("register-card").style.display = "block";
};
$("show-login").onclick = (e) => {
  e.preventDefault();
  document.querySelector(".login-card").style.display = "block";
  $("register-card").style.display = "none";
};
$("show-forgot").onclick = (e) => {
  e.preventDefault();
  document.querySelector(".login-card").style.display = "none";
  $("forgot-card").style.display = "block";
};
$("show-login-from-forgot").onclick = (e) => {
  e.preventDefault();
  $("forgot-card").style.display = "none";
  document.querySelector(".login-card").style.display = "block";
};

// ---------- مساعد لطلبات API ----------
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حدث خطأ غير متوقع");
  return data;
}

// ---------- تسجيل الدخول / إنشاء حساب ----------
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("auth-error").style.display = "none";
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("login-username").value.trim(),
        password: $("login-password").value,
      }),
    });
    token = data.token;
    localStorage.setItem("wa_token", token);
    onAuthSuccess(data.username);
  } catch (err) {
    $("auth-error").textContent = err.message;
    $("auth-error").style.display = "block";
  }
});

$("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("register-error").style.display = "none";
  try {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: $("reg-username").value.trim(),
        password: $("reg-password").value,
        email: $("reg-email").value.trim() || undefined,
      }),
    });
    token = data.token;
    localStorage.setItem("wa_token", token);
    onAuthSuccess(data.username);
  } catch (err) {
    $("register-error").textContent = err.message;
    $("register-error").style.display = "block";
  }
});

$("forgot-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("forgot-error").style.display = "none";
  $("forgot-success").style.display = "none";
  try {
    const data = await api("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: $("forgot-email").value.trim() }),
    });
    $("forgot-success").textContent = data.message;
    $("forgot-success").style.display = "block";
    $("forgot-form").reset();
  } catch (err) {
    $("forgot-error").textContent = err.message;
    $("forgot-error").style.display = "block";
  }
});

function onAuthSuccess(username) {
  $("user-name").textContent = username;
  showApp();
}

$("logout-btn").onclick = () => {
  token = null;
  localStorage.removeItem("wa_token");
  showLogin();
};

// إذا كان هناك تسجيل دخول سابق محفوظ، ادخل تلقائيًا
if (token) {
  api("/wallet")
    .then((data) => showApp(data.username))
    .catch(() => {
      token = null;
      localStorage.removeItem("wa_token");
      showLogin();
    });
}

// ---------- المحفظة ----------
async function loadWallet() {
  const data = await api("/wallet");
  updateBalance(data.balance);
  $("withdraw-info").textContent = `الحد الأدنى للسحب: $${data.minWithdraw}`;
  updateWithdrawBar(data.balance, data.minWithdraw);
}

function updateBalance(balance) {
  $("balance-number").textContent = "$" + balance.toFixed(4);
}

function updateWithdrawBar(balance, min) {
  const pct = Math.min(100, (balance / min) * 100);
  $("withdraw-fill").style.width = pct + "%";
  $("withdraw-label").textContent = `$${balance.toFixed(2)} / $${min}`;
}

async function loadHistory() {
  const data = await api("/tasks/history");
  const list = $("history-list");
  if (!data.history.length) {
    list.innerHTML = '<div class="muted">لم تشاهد أي إعلان بعد</div>';
    return;
  }
  list.innerHTML = data.history
    .map(
      (h) =>
        `<div class="history-row"><span class="muted">${new Date(h.completed_at + "Z").toLocaleString("ar-EG")}</span><span class="amt">+$${h.amount.toFixed(3)}</span></div>`
    )
    .join("");
}

// ---------- مشاهدة الإعلان ----------
const dial = $("dial-progress");
const dialText = $("dial-text");
const CIRC = 2 * Math.PI * 52;
$("watch-btn").addEventListener("click", async () => {
  if (watching) return;
  $("task-msg").textContent = "";
  try {
    const data = await api("/tasks/start", { method: "POST" });
    currentSessionId = data.sessionId;
    durationSeconds = data.durationSeconds;
    watching = true;
    $("watch-btn").disabled = true;
    $("watch-btn").textContent = "جارٍ العرض...";

    const startedAt = Date.now();
    const timer = setInterval(async () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const pct = Math.min(100, (elapsed / durationSeconds) * 100);
      dial.setAttribute("stroke-dashoffset", CIRC * (1 - pct / 100));
      dialText.textContent = pct < 100 ? Math.ceil(durationSeconds - elapsed) + "s" : "✓";

      if (pct >= 100) {
        clearInterval(timer);
        try {
          const result = await api("/tasks/complete", {
            method: "POST",
            body: JSON.stringify({ sessionId: currentSessionId }),
          });
          updateBalance(result.balance);
          $("task-msg").textContent = `+$${result.amount.toFixed(3)} أُضيفت لرصيدك`;
          loadHistory();
          const wallet = await api("/wallet");
          updateWithdrawBar(wallet.balance, wallet.minWithdraw);
        } catch (err) {
          $("task-msg").textContent = err.message;
        }
        watching = false;
        $("watch-btn").disabled = false;
        $("watch-btn").textContent = "ابدأ المشاهدة";
        setTimeout(() => {
          dial.setAttribute("stroke-dashoffset", CIRC);
          dialText.textContent = "▶";
        }, 1200);
      }
    }, 100);
  } catch (err) {
    $("task-msg").textContent = err.message;
    watching = false;
    $("watch-btn").disabled = false;
    $("watch-btn").textContent = "ابدأ المشاهدة";
  }
});

// ---------- البريد الإلكتروني (لاستعادة كلمة المرور) ----------
$("email-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("email-msg").textContent = "";
  try {
    const data = await api("/auth/update-email", {
      method: "POST",
      body: JSON.stringify({ email: $("settings-email").value.trim() }),
    });
    $("email-msg").textContent = data.message;
  } catch (err) {
    $("email-msg").textContent = err.message;
  }
});

// ---------- السحب ----------
$("withdraw-btn").addEventListener("click", async () => {
  $("withdraw-msg").textContent = "";
  try {
    const data = await api("/wallet/withdraw", { method: "POST" });
    $("withdraw-msg").textContent = data.message;
    updateBalance(0);
    const wallet = await api("/wallet");
    updateWithdrawBar(0, wallet.minWithdraw);
  } catch (err) {
    $("withdraw-msg").textContent = err.message;
  }
});

// ---------- وضع المشاهدة المستمر (يشبه تيك توك: ينتقل تلقائيًا للإعلان التالي) ----------
const REELS_THEMES = [
  { emoji: "🎮", title: "عرض ألعاب" },
  { emoji: "🛍️", title: "عرض تسوّق" },
  { emoji: "🎵", title: "تطبيق موسيقى" },
  { emoji: "📱", title: "تطبيق جديد" },
  { emoji: "🍔", title: "عرض طعام" },
  { emoji: "🎬", title: "فيديو ترويجي" },
];

let reelsRunning = false;
let reelsThemeIndex = 0;
let reelsAnimFrame = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderReelsCard() {
  const theme = REELS_THEMES[reelsThemeIndex % REELS_THEMES.length];
  reelsThemeIndex++;
  const card = $("reels-card");
  card.style.animation = "none";
  void card.offsetWidth;
  card.style.animation = "";
  $("reels-emoji").textContent = theme.emoji;
  $("reels-title").textContent = theme.title;
  $("reels-earn").textContent = "";
}

function animateReelsProgress(durationSeconds) {
  return new Promise((resolve) => {
    const fill = $("reels-progress-fill");
    fill.style.width = "0%";
    const startedAt = Date.now();

    function tick() {
      if (!reelsRunning) return resolve(false);
      const elapsed = (Date.now() - startedAt) / 1000;
      const pct = Math.min(100, (elapsed / durationSeconds) * 100);
      fill.style.width = pct + "%";
      if (pct >= 100) {
        resolve(true);
      } else {
        reelsAnimFrame = requestAnimationFrame(tick);
      }
    }
    tick();
  });
}

async function reelsLoop() {
  while (reelsRunning) {
    try {
      $("reels-msg").textContent = "";
      const data = await api("/tasks/start", { method: "POST" });
      renderReelsCard();

      const finished = await animateReelsProgress(data.durationSeconds);
      if (!reelsRunning || !finished) break;

      const result = await api("/tasks/complete", {
        method: "POST",
        body: JSON.stringify({ sessionId: data.sessionId }),
      });

      updateBalance(result.balance);
      $("reels-balance").textContent = "$" + result.balance.toFixed(4);
      $("reels-earn").textContent = `+$${result.amount.toFixed(3)}`;
      loadHistory();
      const wallet = await api("/wallet");
      updateWithdrawBar(wallet.balance, wallet.minWithdraw);

      await sleep(500);
    } catch (err) {
      $("reels-msg").textContent = err.message;
      reelsRunning = false;
      break;
    }
  }
}

function openReels() {
  reelsRunning = true;
  $("reels-screen").style.display = "flex";
  $("reels-balance").textContent = $("balance-number").textContent;
  reelsLoop();
}

function closeReels() {
  reelsRunning = false;
  if (reelsAnimFrame) cancelAnimationFrame(reelsAnimFrame);
  $("reels-screen").style.display = "none";
}

$("reels-open-btn").addEventListener("click", openReels);
$("reels-close").addEventListener("click", closeReels);


















            
