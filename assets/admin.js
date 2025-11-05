// ==========================
//  Nor’easters Admin Script
// ==========================

// --- Supabase Config (yours) ---
const SUPABASE_URL = "https://jpzxvnqjsixvnwzjfxuh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwenh2bnFqc2l4dm53empmeHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODE5NTEsImV4cCI6MjA3Nzg1Nzk1MX0.hyDskGwIwNv9MNBHkuX_DrIpnUHBouK5hgPZKXGOEEk";
// --------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
window.sb = sb; // for console debugging

/* ---------- Element references (match admin.html) ---------- */
const els = {
  // Auth
  authCard: document.getElementById("authCard"),
  adminArea: document.getElementById("adminArea"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  signInBtn: document.getElementById("signInBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  authMsg: document.getElementById("authMsg"),

  // Board selector & meta
  boardSelect: document.getElementById("boardSelect"),
  loadBtn: document.getElementById("loadBtn"),
  deleteBoardBtn: document.getElementById("deleteBoardBtn"),
  meta: document.getElementById("meta"),

  // Controls
  stats: document.getElementById("stats"),
  openBtn: document.getElementById("openBtn"),
  closeBtn: document.getElementById("closeBtn"),
  randomizeBtn: document.getElementById("randomizeBtn"),
  exportBtn: document.getElementById("exportBtn"),

  // Create/Update board
  cb: {
    slug:  document.getElementById("cb_slug"),
    title: document.getElementById("cb_title"),
    top:   document.getElementById("cb_top"),
    side:  document.getElementById("cb_side"),
    cost:  document.getElementById("cb_cost"),
    date:  document.getElementById("cb_date"),
    venmo: document.getElementById("cb_venmo"),
    createBtn: document.getElementById("cb_create"),
  },

  // Payouts / lock / mode
  payouts: {
    q1:    document.getElementById("p_q1"),
    ht:    document.getElementById("p_ht"),
    q4:    document.getElementById("p_q4"),
    final: document.getElementById("p_final"),
    lockAt:document.getElementById("lock_at"),
    mode:  document.getElementById("p_mode"),
    saveBtn: document.getElementById("saveSettingsBtn"),
  },

  // Scores
  scores: {
    q1_top:    document.getElementById("a_q1_top"),
    q1_side:   document.getElementById("a_q1_side"),
    ht_top:    document.getElementById("a_ht_top"),
    ht_side:   document.getElementById("a_ht_side"),
    q4_top:    document.getElementById("a_q4_top"),
    q4_side:   document.getElementById("a_q4_side"),
    final_top: document.getElementById("a_final_top"),
    final_side:document.getElementById("a_final_side"),
    save:      document.getElementById("saveScoresAdmin"),
  },

  // Reservations
  resTableBody: document.getElementById("resTableBody"),

  // Admins manager
  addAdminEmail: document.getElementById("newAdminEmail"),
  addAdminBtn: document.getElementById("addAdminBtn"),
};

let board = null;

/* ---------- Helpers ---------- */
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "");
const toLocalDT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
};

function renderPublicLink() {
  if (!board?.slug) return;
  const publicUrl = `${location.origin}/public.html?board=${encodeURIComponent(board.slug)}`;

  const existing = document.getElementById("publicLink");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.id = "publicLink";
  wrap.style.margin = "6px 0 10px";
  wrap.style.padding = "8px";
  wrap.style.border = "1px solid #e2e8f0";
  wrap.style.borderRadius = "10px";
  wrap.style.background = "#f1f5f9";
  wrap.innerHTML = `<strong>Public View:</strong> <a href="${publicUrl}" target="_blank" rel="noopener">${publicUrl}</a>`;
  els.stats?.parentElement?.insertBefore(wrap, els.stats);
}

/* ---------- Auth UI ---------- */
async function showAdmin() {
  els.authCard.style.display = "none";
  els.adminArea.style.display = "block";
}
function showLogin(msg) {
  els.adminArea.style.display = "none";
  els.authCard.style.display = "block";
  if (msg) els.authMsg.textContent = msg;
}

async function refreshSessionUI() {
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) {
      console.error("[Admin] getSession error:", error);
      showLogin(error.message || "Auth error.");
      return;
    }
    const session = data?.session;
    console.log("[Admin] refreshSessionUI session:", !!session, session?.user?.email);

    if (session?.user) {
      await showAdmin(); // flip UI first (even if boards fail to load)
      try { await loadBoardsList(); }
      catch (e) {
        console.error("[Admin] loadBoardsList failed:", e);
        els.meta.textContent = "Boards failed to load. Check console.";
      }
    } else {
      showLogin();
    }
  } catch (e) {
    console.error("[Admin] refreshSessionUI threw:", e);
    showLogin(String(e?.message || e));
  }
}

/* ---------- Sign in/out + listener ---------- */
els.signInBtn?.addEventListener("click", async () => {
  console.log("[Admin] Sign In clicked");
  els.authMsg.textContent = "Signing in…";

  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!email || !password) { els.authMsg.textContent = "Enter email and password."; return; }

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    console.log("[Admin] signIn result:", { hasSession: !!data?.session, user: data?.user?.email, error });
    if (error) {
      els.authMsg.textContent = error.message || "Sign-in failed.";
      return;
    }
    els.authMsg.textContent = "Signed in.";
  } catch (e) {
    console.error("[Admin] signIn threw:", e);
    els.authMsg.textContent = String(e?.message || e);
  }

  await refreshSessionUI(); // force UI refresh immediately
});

els.signOutBtn?.addEventListener("click", async () => {
  console.log("[Admin] Sign Out clicked");
  await sb.auth.signOut();
  els.authMsg.textContent = "Signed out.";
});

sb.auth.onAuthStateChange(async (evt, session) => {
  console.log("[Admin] auth state changed:", evt, session?.user?.email);
  await refreshSessionUI();
});

// Initial paint
refreshSessionUI();

/* ---------- Boards list & load ---------- */
async function loadBoardsList() {
  const { data, error } = await sb
    .from("boards")
    .select("slug,title,team_top,team_side,game_date")
    .order("game_date", { ascending: false })
    .order("title");
  if (error) {
    console.error("[Admin] loadBoardsList error:", error);
    alert("Failed to load boards list");
    return;
  }
  els.boardSelect.innerHTML = "";
  for (const b of data || []) {
    const opt = document.createElement("option");
    opt.value = b.slug;
    opt.textContent = `${b.title} (${b.slug})`;
    els.boardSelect.appendChild(opt);
  }
  if (data?.length) {
    await loadBoard(data[0].slug);
    els.boardSelect.value = data[0].slug;
  } else {
    board = null;
    els.meta.textContent = "No boards yet.";
    els.stats.innerHTML = "";
    els.resTableBody.innerHTML = "";
  }
}

els.loadBtn?.addEventListener("click", async () => {
  const slug = els.boardSelect.value;
  if (!slug) return;
  await loadBoard(slug);
});

els.deleteBoardBtn?.addEventListener("click", async () => {
  const slug = els.boardSelect.value;
  if (!slug) return;
  if (!confirm(`Delete board "${slug}" and ALL its reservations? This cannot be undone.`)) return;
  const { data, error } = await sb.rpc("admin_delete_board", { p_board_slug: slug });
  if (error || !data?.ok) { console.error("[Admin] delete error:", error, data); alert("Delete failed."); return; }
  alert("Board deleted.");
  await loadBoardsList();
});

/* ---------- Load a single board ---------- */
async function loadBoard(slug) {
  const { data, error } = await sb.from("boards").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) { console.error("[Admin] loadBoard error:", error); alert("Board not found"); return; }
  board = data;

  els.meta.textContent =
    `${board.title} • ${board.team_top} vs ${board.team_side} • ` +
    `$${board.cost_per_square}/sq • ${board.is_open ? "OPEN" : "CLOSED"}` +
    (board.randomized_at ? " • randomized " + fmtDate(board.randomized_at) : "");

  // Fill payouts/mode/lock
  els.payouts.q1.value    = board.payouts?.q1 ?? (board.payout_mode === "fixed" ? 0 : 5);
  els.payouts.ht.value    = board.payouts?.ht ?? (board.payout_mode === "fixed" ? 0 : 15);
  els.payouts.q4.value    = board.payouts?.q4 ?? (board.payout_mode === "fixed" ? 0 : 5);
  els.payouts.final.value = board.payouts?.final ?? (board.payout_mode === "fixed" ? 0 : 25);
  els.payouts.lockAt.value = toLocalDT(board.lock_at);
  els.payouts.mode.value   = board.payout_mode || "percent";

  // Fill scores
  const s = board.scores || {};
  els.scores.q1_top.value     = s.q1?.top    ?? "";
  els.scores.q1_side.value    = s.q1?.side   ?? "";
  els.scores.ht_top.value     = s.ht?.top    ?? "";
  els.scores.ht_side.value    = s.ht?.side   ?? "";
  els.scores.q4_top.value     = s.q4?.top    ?? "";
  els.scores.q4_side.value    = s.q4?.side   ?? "";
  els.scores.final_top.value  = s.final?.top ?? "";
  els.scores.final_side.value = s.final?.side?? "";

  renderPublicLink();
  await refreshStats();
  await refreshReservations();
}

/* ---------- Stats & reservations ---------- */
async function refreshStats() {
  if (!board) return;
  const { data, error } = await sb.from("board_stats").select("*").eq("slug", board.slug).maybeSingle();
  if (error || !data) { console.error("[Admin] stats error:", error); els.stats.textContent = "Stats unavailable"; return; }
  const sold = data.sold_count || 0;
  const paid = data.paid_count || 0;
  const pending = data.pending_count || 0;
  const pot = sold * (board.cost_per_square || 0);
  els.stats.innerHTML = `
    <span class="pill">Sold: ${sold}/100</span>
    <span class="pill">Paid: ${paid}</span>
    <span class="pill">Pending: ${pending}</span>
    <span class="pill">Pot: $${pot}</span>
    <span class="pill">${board.is_open ? "OPEN" : "CLOSED"}</span>
  `;
}

async function refreshReservations() {
  if (!board) return;
  const { data, error } = await sb
    .from("reservations")
    .select("id,square_idx,buyer_name,email,status,created_at,paid_at")
    .eq("board_id", board.id)
    .order("created_at", { ascending: false });
  if (error) { console.error("[Admin] reservations error:", error); alert("Failed to load reservations"); return; }

  els.resTableBody.innerHTML = "";
  for (const r of data || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(r.created_at)}</td>
      <td>${r.square_idx + 1}</td>
      <td>${r.buyer_name || ""}</td>
      <td>${r.email || ""}</td>
      <td>${r.status}</td>
      <td>${r.paid_at ? fmtDate(r.paid_at) : ""}</td>
      <td>${r.status !== "paid" ? `<button data-id="${r.id}" class="markPaid">Mark Paid</button>` : ""}</td>
    `;
    els.resTableBody.appendChild(tr);
  }

  document.querySelectorAll(".markPaid").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const { data: resp, error } = await sb.rpc("admin_mark_paid", {
        p_board_slug: board.slug,
        p_reservation_id: id,
      });
      if (error || !resp?.ok) { console.error("[Admin] markPaid error:", error, resp); alert("Not authorized or failed."); return; }
      await refreshStats();
      await refreshReservations();
    });
  });
}

/* ---------- Core actions ---------- */
els.openBtn?.addEventListener("click", async () => {
  if (!board) return;
  const { data, error } = await sb.rpc("admin_set_open", { p_board_slug: board.slug, p_is_open: true });
  if (error || !data?.ok) return alert("Not authorized.");
  await loadBoard(board.slug);
});

els.closeBtn?.addEventListener("click", async () => {
  if (!board) return;
  const { data, error } = await sb.rpc("admin_set_open", { p_board_slug: board.slug, p_is_open: false });
  if (error || !data?.ok) return alert("Not authorized.");
  await loadBoard(board.slug);
});

els.randomizeBtn?.addEventListener("click", async () => {
  if (!board) return;
  if (!confirm("Randomize header numbers now? This can only be done once and cannot be undone.")) return;
  const { data, error } = await sb.rpc("admin_randomize_once", { p_board_slug: board.slug });
  if (error || !data?.ok) {
    const reason = data?.reason || "failed";
    return alert("Randomize blocked: " + reason + " (needs 100/100 and not previously randomized)");
  }
  await loadBoard(board.slug);
});

els.exportBtn?.addEventListener("click", async () => {
  if (!board) return;
  const { data, error } = await sb
    .from("reservations")
    .select("square_idx,buyer_name,email,status,paid_at,created_at")
    .eq("board_id", board.id)
    .order("square_idx");
  if (error) return alert("Export failed.");

  const rows = [["Square", "Name", "Email", "Status", "Paid At", "Reserved At"]];
  (data || []).forEach((r) => {
    rows.push([r.square_idx + 1, r.buyer_name || "", r.email || "", r.status, r.paid_at || "", r.created_at || ""]);
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `${board.slug}-reservations.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
});

/* ---------- Create / Update Board ---------- */
els.cb.createBtn?.addEventListener("click", async () => {
  const p = {
    slug: els.cb.slug.value.trim(),
    title: els.cb.title.value.trim(),
    team_top: els.cb.top.value.trim() || "Nor’easters",
    team_side: els.cb.side.value.trim() || "Opponents",
    cost: parseFloat(els.cb.cost.value || "20"),
    date: els.cb.date.value ? els.cb.date.value : null,
    venmo: els.cb.venmo.value.trim() || "@NoreastersFlagFB",
  };
  if (!p.slug || !p.title) { alert("Slug and Title are required."); return; }

  const payload = {
    p_slug: p.slug,
    p_title: p.title,
    p_team_top: p.team_top,
    p_team_side: p.team_side,
    p_cost_per_square: p.cost,
    p_game_date: p.date,
    p_venmo_handle: p.venmo,
    p_payout_mode: "percent",
    p_payouts: { q1: 5, ht: 15, q4: 5, final: 25 },
    p_is_open: true,
  };

  const { data, error } = await sb.rpc("admin_create_board", payload);
  if (error || !data?.ok) { console.error("[Admin] create error:", error, data); alert("Create failed."); return; }
  alert("Board created/updated.");
  await loadBoardsList();
  els.boardSelect.value = p.slug;
  await loadBoard(p.slug);
});

/* ---------- Save payouts/mode/lock ---------- */
els.payouts.saveBtn?.addEventListener("click", async () => {
  if (!board) return;

  const payouts = {
    q1: Number(els.payouts.q1.value || 0),
    ht: Number(els.payouts.ht.value || 0),
    q4: Number(els.payouts.q4.value || 0),
    final: Number(els.payouts.final.value || 0),
  };
  const lockISO = els.payouts.lockAt.value ? new Date(els.payouts.lockAt.value).toISOString() : null;
  const mode = els.payouts.mode.value; // 'percent' or 'fixed'

  const { data, error } = await sb.rpc("admin_update_board", {
    p_board_slug: board.slug,
    p_payouts: payouts,
    p_lock_at: lockISO,
    p_payout_mode: mode,
  });
  if (error || !data?.ok) { console.error("[Admin] save settings error:", error, data); alert("Save failed."); return; }
  alert("Settings saved.");
  await loadBoard(board.slug);
});

/* ---------- Save Official Scores ---------- */
els.scores.save?.addEventListener("click", async () => {
  if (!board) return;

  const scores = {
    q1:    { top: els.scores.q1_top.value,    side: els.scores.q1_side.value },
    ht:    { top: els.scores.ht_top.value,    side: els.scores.ht_side.value },
    q4:    { top: els.scores.q4_top.value,    side: els.scores.q4_side.value },
    final: { top: els.scores.final_top.value, side: els.scores.final_side.value },
  };

  const { data, error } = await sb.rpc("admin_set_scores", {
    p_board_slug: board.slug,
    p_scores: scores,
  });
  if (error || !data?.ok) { console.error("[Admin] save scores error:", error, data); alert("Save failed."); return; }
  alert("Scores saved.");
  await loadBoard(board.slug);
});

/* ---------- Admins manager ---------- */
els.addAdminBtn?.addEventListener("click", async () => {
  const email = els.addAdminEmail.value.trim();
  if (!email) return alert("Enter an email.");
  const { data, error } = await sb.rpc("add_admin_by_email", { p_email: email });
  if (error || !data?.ok) { console.error("[Admin] add admin error:", error, data); alert("Add admin failed. Make sure the user exists in Auth."); return; }
  alert("Admin added.");
});
