// ==========================
//  Nor’easters Admin Script
// ==========================

// --- Supabase Config ---
const SUPABASE_URL = "https://jpzxvnqjsixvnwzjfxuh.supabase.co";
const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_KEY_HERE";
// -----------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

/* ---------- Element references ---------- */
const els = {
  // Load/auth
  slug: document.getElementById("slug"),
  token: document.getElementById("adminToken"),
  loadBtn: document.getElementById("loadBtn"),
  setPwdBtn: document.getElementById("setPwdBtn"),
  meta: document.getElementById("meta"),

  // Controls
  stats: document.getElementById("stats"),
  openBtn: document.getElementById("openBtn"),
  closeBtn: document.getElementById("closeBtn"),
  randomizeBtn: document.getElementById("randomizeBtn"),
  exportBtn: document.getElementById("exportBtn"),

  // Reservations table
  resTableBody: document.getElementById("resTableBody"),

  // Create Board form
  cb: {
    slug:  document.getElementById("cb_slug"),
    title: document.getElementById("cb_title"),
    top:   document.getElementById("cb_top"),
    side:  document.getElementById("cb_side"),
    cost:  document.getElementById("cb_cost"),
    date:  document.getElementById("cb_date"),
    venmo: document.getElementById("cb_venmo"),
    pwd:   document.getElementById("cb_pwd"),
    createBtn: document.getElementById("cb_create"),
  },

  // Payouts, mode & lock
  payouts: {
    q1:    document.getElementById("p_q1"),
    ht:    document.getElementById("p_ht"),
    q4:    document.getElementById("p_q4"),
    final: document.getElementById("p_final"),
    lockAt:document.getElementById("lock_at"),
    mode:  document.getElementById("p_mode"),
    saveBtn: document.getElementById("saveSettingsBtn"),
  },

  // Official scores
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

/* ---------- Load & refresh ---------- */
async function loadBoard(slug) {
  const { data, error } = await sb.from("boards").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) throw new Error("Board not found");

  board = data;

  // Meta header
  els.meta.textContent =
    `${board.title} • ${board.team_top} vs ${board.team_side} • ` +
    `$${board.cost_per_square}/sq • ${board.is_open ? "OPEN" : "CLOSED"}` +
    (board.randomized_at ? " • randomized " + fmtDate(board.randomized_at) : "");

  // Fill payouts + lock
  els.payouts.q1.value    = board.payouts?.q1 ?? (board.payout_mode === "fixed" ? 0 : 5);
  els.payouts.ht.value    = board.payouts?.ht ?? (board.payout_mode === "fixed" ? 0 : 15);
  els.payouts.q4.value    = board.payouts?.q4 ?? (board.payout_mode === "fixed" ? 0 : 5);
  els.payouts.final.value = board.payouts?.final ?? (board.payout_mode === "fixed" ? 0 : 25);
  els.payouts.lockAt.value = toLocalDT(board.lock_at);
  els.payouts.mode.value   = board.payout_mode || "percent";

  // Fill Official Scores if present
  if (board.scores) {
    els.scores.q1_top.value     = board.scores.q1?.top    ?? "";
    els.scores.q1_side.value    = board.scores.q1?.side   ?? "";
    els.scores.ht_top.value     = board.scores.ht?.top    ?? "";
    els.scores.ht_side.value    = board.scores.ht?.side   ?? "";
    els.scores.q4_top.value     = board.scores.q4?.top    ?? "";
    els.scores.q4_side.value    = board.scores.q4?.side   ?? "";
    els.scores.final_top.value  = board.scores.final?.top ?? "";
    els.scores.final_side.value = board.scores.final?.side?? "";
  } else {
    // clear
    ["q1_top","q1_side","ht_top","ht_side","q4_top","q4_side","final_top","final_side"].forEach(k => els.scores[k].value = "");
  }

  await refreshStats();
  await refreshReservations();
}

async function refreshStats() {
  if (!board) return;
  const { data, error } = await sb.from("board_stats").select("*").eq("slug", board.slug).maybeSingle();
  if (error || !data) {
    els.stats.textContent = "Stats unavailable";
    return;
  }
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
  if (error) {
    alert("Failed to load reservations");
    return;
  }

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

  // Hook "Mark Paid"
  document.querySelectorAll(".markPaid").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const token = els.token.value.trim();
      if (!token) {
        alert("Enter admin password first.");
        return;
      }
      const { data: resp, error } = await sb.rpc("admin_mark_paid", {
        p_board_slug: board.slug,
        p_token: token,
        p_reservation_id: id,
      });
      if (error || !resp?.ok) {
        alert("Not authorized or failed.");
        return;
      }
      await refreshStats();
      await refreshReservations();
    });
  });
}

/* ---------- Core admin actions ---------- */
// Load
els.loadBtn.addEventListener("click", async () => {
  try {
    await loadBoard(els.slug.value.trim());
  } catch (e) {
    alert(e.message);
  }
});

// Set/Change password
els.setPwdBtn.addEventListener("click", async () => {
  const slug = els.slug.value.trim();
  const token = els.token.value.trim();
  if (!slug || !token) {
    alert("Enter slug and a new admin password.");
    return;
  }
  const { data, error } = await sb.rpc("admin_set_password", {
    p_board_slug: slug,
    p_new_token: token,
  });
  if (error || !data?.ok) {
    alert("Failed to set password.");
    return;
  }
  alert("Admin password set.");
});

// Open / Close
els.openBtn.addEventListener("click", async () => {
  if (!board) return alert("Load a board first.");
  const token = els.token.value.trim();
  if (!token) return alert("Enter admin password.");
  const { data, error } = await sb.rpc("admin_set_open", {
    p_board_slug: board.slug,
    p_token: token,
    p_is_open: true,
  });
  if (error || !data?.ok) return alert("Not authorized.");
  await loadBoard(board.slug);
});

els.closeBtn.addEventListener("click", async () => {
  if (!board) return alert("Load a board first.");
  const token = els.token.value.trim();
  if (!token) return alert("Enter admin password.");
  const { data, error } = await sb.rpc("admin_set_open", {
    p_board_slug: board.slug,
    p_token: token,
    p_is_open: false,
  });
  if (error || !data?.ok) return alert("Not authorized.");
  await loadBoard(board.slug);
});

// Randomize (once) — with confirmation
els.randomizeBtn.addEventListener("click", async () => {
  if (!board) return alert("Load a board first.");
  const token = els.token.value.trim();
  if (!token) return alert("Enter admin password.");
  if (!confirm("Randomize header numbers now? This can only be done once and cannot be undone.")) return;

  const { data, error } = await sb.rpc("admin_randomize_once", {
    p_board_slug: board.slug,
    p_token: token,
  });
  if (error || !data?.ok) {
    const reason = data?.reason || "failed";
    return alert("Randomize blocked: " + reason + " (needs 100/100 and not previously randomized)");
  }
  await loadBoard(board.slug);
});

// Export CSV
els.exportBtn.addEventListener("click", async () => {
  if (!board) return alert("Load a board first.");
  const { data, error } = await sb
    .from("reservations")
    .select("square_idx,buyer_name,email,status,paid_at,created_at")
    .eq("board_id", board.id)
    .order("square_idx");
  if (error) return alert("Export failed.");

  const rows = [["Square", "Name", "Email", "Status", "Paid At", "Reserved At"]];
  (data || []).forEach((r) => {
    rows.push([
      r.square_idx + 1,
      r.buyer_name || "",
      r.email || "",
      r.status,
      r.paid_at || "",
      r.created_at || "",
    ]);
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
els.cb.createBtn.addEventListener("click", async () => {
  const p = {
    slug: els.cb.slug.value.trim(),
    title: els.cb.title.value.trim(),
    team_top: els.cb.top.value.trim() || "Nor’easters",
    team_side: els.cb.side.value.trim() || "Opponents",
    cost: parseFloat(els.cb.cost.value || "20"),
    date: els.cb.date.value ? els.cb.date.value : null,
    venmo: els.cb.venmo.value.trim() || "@NoreastersFlagFB",
    pwd: els.cb.pwd.value.trim(),
  };
  if (!p.slug || !p.title || !p.pwd) {
    alert("Slug, Title and Admin password are required.");
    return;
  }

  const payload = {
    p_slug: p.slug,
    p_title: p.title,
    p_team_top: p.team_top,
    p_team_side: p.team_side,
    p_cost_per_square: p.cost,
    p_game_date: p.date,
    p_venmo_handle: p.venmo,
    p_payout_mode: "percent",                  // default; can change in settings below
    p_payouts: { q1: 5, ht: 15, q4: 5, final: 25 },
    p_is_open: true,
    p_admin_token: p.pwd,
  };

  const { data, error } = await sb.rpc("admin_create_board", payload);
  if (error || !data?.ok) {
    console.error(error);
    alert("Create failed.");
    return;
  }

  alert("Board created/updated.");
  els.slug.value = p.slug;
  els.token.value = p.pwd;
  await loadBoard(p.slug);
});

/* ---------- Save payouts/mode/lock ---------- */
els.payouts.saveBtn.addEventListener("click", async () => {
  if (!board) return alert("Load a board first.");
  const token = els.token.value.trim();
  if (!token) return alert("Enter admin password.");

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
    p_token: token,
    p_payouts: payouts,
    p_lock_at: lockISO,
    p_payout_mode: mode,
  });
  if (error || !data?.ok) {
    alert("Save failed.");
    return;
  }
  alert("Settings saved.");
  await loadBoard(board.slug);
});

/* ---------- Save Official Scores ---------- */
els.scores.save.addEventListener("click", async () => {
  if (!board) return alert("Load a board first.");
  const token = els.token.value.trim();
  if (!token) return alert("Enter admin password.");

  const scores = {
    q1:    { top: els.scores.q1_top.value,    side: els.scores.q1_side.value },
    ht:    { top: els.scores.ht_top.value,    side: els.scores.ht_side.value },
    q4:    { top: els.scores.q4_top.value,    side: els.scores.q4_side.value },
    final: { top: els.scores.final_top.value, side: els.scores.final_side.value },
  };

  const { data, error } = await sb.rpc("admin_set_scores", {
    p_board_slug: board.slug,
    p_token: token,
    p_scores: scores,
  });
  if (error || !data?.ok) {
    alert("Save failed (check password).");
    return;
  }
  alert("Scores saved.");
  await loadBoard(board.slug);
});

