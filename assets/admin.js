// ==========================
//  Nor’easters Admin Script
// ==========================

// --- Proxied fetch for Supabase (client-scoped, most reliable) ---
const SB_PROJECT_URL = "https://jpzxvnqjsixvnwzjfxuh.supabase.co";                 // your Supabase project
const PROXY_URL      = "https://noreasters-cors.reilley-kevin.workers.dev";        // your Cloudflare Worker

const sbFetch = (input, init) => {
  try {
    const u = new URL(typeof input === "string" ? input : input.url);
    if (u.origin === SB_PROJECT_URL) {
      const proxied = u.href.replace(SB_PROJECT_URL, PROXY_URL + "/sb");
      const next = typeof input === "string" ? proxied : new Request(proxied, input);
      return fetch(next, init);
    }
  } catch (_) {}
  return fetch(input, init);
};

// --- Supabase Client ---
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
const SUPABASE_URL = SB_PROJECT_URL;
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwenh2bnFqc2l4dm53empmeHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODE5NTEsImV4cCI6MjA3Nzg1Nzk1MX0.hyDskGwIwNv9MNBHkuX_DrIpnUHBouK5hgPZKXGOEEk";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: sbFetch }, // <- critical so all supabase calls use proxy
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
window.sb = sb; // handy for console testing

/* ---------- Element references ---------- */
const els = {
  // Auth UI
  authCard: document.getElementById("authCard"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  signInBtn: document.getElementById("signInBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  authMsg: document.getElementById("authMsg"),
  adminArea: document.getElementById("adminArea"),

  // Boards dropdown & meta
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

  // Admins manager (optional)
  addAdminEmail: document.getElementById("newAdminEmail"),
  addAdminBtn: document.getElementById("addAdminBtn"),
};

let currentBoard = null;

/* ---------- Helpers ---------- */
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "");
const toLocalDT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
};

/* ---------- Auth UI ---------- */
async function showAdmin() {
  els.authCard.style.display = "none";
  els.adminArea.style.display = "block";
}
function showLogin(msg) {
  els.adminArea.style.display = "none";
  els.authCard.style.display = "block";
  els.authMsg.textContent = msg || "";
}

async function refreshSessionUI() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error("[Admin] getSession error:", error);
    showLogin(error.message || "Auth error.");
    return;
  }
  const session = data?.session;
  console.log("[Admin] refreshSessionUI session:", !!session, session?.user?.email);
  if (session?.user) {
    await showAdmin();
    await loadBoardsList();
  } else {
    showLogin();
  }
}

els.signInBtn?.addEventListener("click", async () => {
  try {
    console.log("[Admin] Sign In clicked");
    els.authMsg.textContent = "Signing in...";
    const email = els.authEmail.value.trim();
    const password = els.authPassword.value;
    if (!email || !password) {
      els.authMsg.textContent = "Enter email and password.";
      return;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      console.error(error);
      els.authMsg.textContent = error.message || "Sign in failed.";
      return;
    }
    els.authMsg.textContent = "Signed in.";
    await refreshSessionUI();
  } catch (e) {
    console.error(e);
    els.authMsg.textContent = "Sign in failed.";
  }
});

els.signOutBtn?.addEventListener("click", async () => {
  await sb.auth.signOut();
  showLogin("Signed out.");
});

sb.auth.onAuthStateChange(async (event, session) => {
  console.log("[Admin] auth state changed:", event, session?.user?.email);
  if (session?.user) {
    await showAdmin();
    await loadBoardsList();
  } else {
    showLogin();
  }
});

/* ---------- Boards: list & load ---------- */
async function loadBoardsList() {
  const sel = els.boardSelect;
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading…</option>';

  try {
    const { data, error } = await sb
      .from("boards")
      .select("slug,title,game_date")
      .order("game_date", { ascending: false, nullsFirst: true })
      .order("title", { ascending: true });

    console.log("[Admin] loadBoardsList result:", { data, error });

    if (error) {
      sel.innerHTML = `<option value="">Error: ${error.message || "failed"}</option>`;
      return;
    }
    if (!data || data.length === 0) {
      sel.innerHTML = '<option value="">— No boards yet —</option>';
      return;
    }

    sel.innerHTML = data
      .map(b => `<option value="${b.slug}">${b.title || b.slug}</option>`)
      .join("");
  } catch (e) {
    console.error("[Admin] loadBoardsList threw:", e);
    sel.innerHTML = `<option value="">Error: ${String(e?.message || e)}</option>`;
  }
}

async function loadBoard(slug) {
  const { data, error } = await sb.from("boards").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) throw new Error("Board not found");
  currentBoard = data;

  // Meta header (include public link)
  const basePath = location.pathname.replace(/admin\.html$/, "");
  const publicURL = `${location.origin}${basePath}public.html?board=${encodeURIComponent(currentBoard.slug)}`;
  els.meta.innerHTML =
    `${currentBoard.title} • ${currentBoard.team_top} vs ${currentBoard.team_side} • ` +
    `$${currentBoard.cost_per_square}/sq • ${currentBoard.is_open ? "OPEN" : "CLOSED"}` +
    (currentBoard.randomized_at ? " • randomized " + fmtDate(currentBoard.randomized_at) : "") +
    ` • <a href="${publicURL}" target="_blank" rel="noreferrer">Public page ↗</a>`;

  // Fill payouts + lock + mode
  els.payouts.q1.value    = currentBoard.payouts?.q1 ?? (currentBoard.payout_mode === "fixed" ? 0 : 5);
  els.payouts.ht.value    = currentBoard.payouts?.ht ?? (currentBoard.payout_mode === "fixed" ? 0 : 15);
  els.payouts.q4.value    = currentBoard.payouts?.q4 ?? (currentBoard.payout_mode === "fixed" ? 0 : 5);
  els.payouts.final.value = currentBoard.payouts?.final ?? (currentBoard.payout_mode === "fixed" ? 0 : 25);
  els.payouts.lockAt.value = toLocalDT(currentBoard.lock_at);
  els.payouts.mode.value   = currentBoard.payout_mode || "percent";

  // Fill Official Scores (if present)
  const s = currentBoard.scores || {};
  els.scores.q1_top.value     = s.q1?.top    ?? "";
  els.scores.q1_side.value    = s.q1?.side   ?? "";
  els.scores.ht_top.value     = s.ht?.top    ?? "";
  els.scores.ht_side.value    = s.ht?.side   ?? "";
  els.scores.q4_top.value     = s.q4?.top    ?? "";
  els.scores.q4_side.value    = s.q4?.side   ?? "";
  els.scores.final_top.value  = s.final?.top ?? "";
  els.scores.final_side.value = s.final?.side?? "";

  await refreshStats();
  await refreshReservations();
}

els.loadBtn?.addEventListener("click", async () => {
  const slug = els.boardSelect?.value?.trim();
  if (!slug) return alert("Pick a board from the dropdown.");
  try {
    await loadBoard(slug);
  } catch (e) {
    console.error(e);
    alert("Failed to load board.");
  }
});

/* ---------- Stats & reservations ---------- */
async function refreshStats() {
  if (!currentBoard) return;
  // board_stats is a view; if missing, compute fallback
  try {
    const { data, error } = await sb.from("board_stats").select("*").eq("slug", currentBoard.slug).maybeSingle();
    if (error || !data) {
      // Fallback: count reservations
      const { count: sold } = await sb.from("reservations").select("*", { count: "exact", head: true }).eq("board_id", currentBoard.id);
      const { count: paid } = await sb.from("reservations").select("*", { count: "exact", head: true }).eq("board_id", currentBoard.id).eq("status", "paid");
      const pending = (sold || 0) - (paid || 0);
      const pot = (sold || 0) * (currentBoard.cost_per_square || 0);
      els.stats.innerHTML = `
        <span class="pill">Sold: ${sold || 0}/100</span>
        <span class="pill">Paid: ${paid || 0}</span>
        <span class="pill">Pending: ${pending || 0}</span>
        <span class="pill">Pot: $${pot}</span>
        <span class="pill">${currentBoard.is_open ? "OPEN" : "CLOSED"}</span>
      `;
      return;
    }
    const sold = data.sold_count || 0;
    const paid = data.paid_count || 0;
    const pending = data.pending_count || 0;
    const pot = sold * (currentBoard.cost_per_square || 0);
    els.stats.innerHTML = `
      <span class="pill">Sold: ${sold}/100</span>
      <span class="pill">Paid: ${paid}</span>
      <span class="pill">Pending: ${pending}</span>
      <span class="pill">Pot: $${pot}</span>
      <span class="pill">${currentBoard.is_open ? "OPEN" : "CLOSED"}</span>
    `;
  } catch (e) {
    console.error(e);
    els.stats.textContent = "Stats unavailable";
  }
}

async function refreshReservations() {
  if (!currentBoard) return;
  const { data, error } = await sb
    .from("reservations")
    .select("id,square_idx,buyer_name,email,status,created_at,paid_at")
    .eq("board_id", currentBoard.id)
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
      <td>${(r.square_idx ?? -1) + 1}</td>
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
      if (!currentBoard) return;
      // Prefer RPC if present:
      let ok = false;
      try {
        const { data: resp, error } = await sb.rpc("admin_mark_paid", {
          p_board_slug: currentBoard.slug,
          p_reservation_id: id,
        });
        ok = !!(resp?.ok) && !error;
      } catch (_) { ok = false; }

      if (!ok) {
        // fallback: direct update
        const { error } = await sb.from("reservations").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
        if (error) { alert("Failed to mark paid."); return; }
      }
      await refreshStats();
      await refreshReservations();
    });
  });
}

/* ---------- Core admin actions ---------- */
// Open / Close
els.openBtn?.addEventListener("click", async () => {
  if (!currentBoard) return alert("Load a board first.");
  let ok = false;
  try {
    const { data, error } = await sb.rpc("admin_set_open", {
      p_board_slug: currentBoard.slug,
      p_is_open: true,
    });
    ok = !!(data?.ok) && !error;
  } catch (_) {}
  if (!ok) {
    const { error } = await sb.from("boards").update({ is_open: true }).eq("id", currentBoard.id);
    if (error) return alert("Failed to open sales.");
  }
  await loadBoard(currentBoard.slug);
});

els.closeBtn?.addEventListener("click", async () => {
  if (!currentBoard) return alert("Load a board first.");
  let ok = false;
  try {
    const { data, error } = await sb.rpc("admin_set_open", {
      p_board_slug: currentBoard.slug,
      p_is_open: false,
    });
    ok = !!(data?.ok) && !error;
  } catch (_) {}
  if (!ok) {
    const { error } = await sb.from("boards").update({ is_open: false }).eq("id", currentBoard.id);
    if (error) return alert("Failed to close sales.");
  }
  await loadBoard(currentBoard.slug);
});

// Randomize (once) — with confirmation
els.randomizeBtn?.addEventListener("click", async () => {
  if (!currentBoard) return alert("Load a board first.");
  if (!confirm("Randomize header numbers now? This can only be done once and cannot be undone.")) return;

  let ok = false;
  try {
    const { data, error } = await sb.rpc("admin_randomize_once", {
      p_board_slug: currentBoard.slug,
    });
    ok = !!(data?.ok) && !error;
    if (!ok && data?.reason) return alert("Randomize blocked: " + data.reason);
  } catch (_) {}
  if (!ok) {
    // fallback: set randomized_at if you already randomized server-side
    const { error } = await sb.from("boards").update({ randomized_at: new Date().toISOString() }).eq("id", currentBoard.id);
    if (error) return alert("Randomize failed (fallback).");
  }
  await loadBoard(currentBoard.slug);
});

// Export CSV
els.exportBtn?.addEventListener("click", async () => {
  if (!currentBoard) return alert("Load a board first.");
  const { data, error } = await sb
    .from("reservations")
    .select("square_idx,buyer_name,email,status,paid_at,created_at")
    .eq("board_id", currentBoard.id)
    .order("square_idx");
  if (error) return alert("Export failed.");

  const rows = [["Square", "Name", "Email", "Status", "Paid At", "Reserved At"]];
  (data || []).forEach((r) => {
    rows.push([(r.square_idx ?? -1) + 1, r.buyer_name || "", r.email || "", r.status, r.paid_at || "", r.created_at || ""]);
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `${currentBoard.slug}-reservations.csv`,
  });
  document.body.appendChild(a); a.click(); a.remove();
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

  // Prefer RPC if present
  let ok = false;
  try {
    const { data, error } = await sb.rpc("admin_create_board", {
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
      p_admin_token: "", // page-level auth now; leave empty
    });
    ok = !!(data?.ok) && !error;
  } catch (_) {}

  if (!ok) {
    // fallback upsert
    const up = {
      slug: p.slug,
      title: p.title,
      team_top: p.team_top,
      team_side: p.team_side,
      cost_per_square: p.cost,
      game_date: p.date,
      venmo_handle: p.venmo,
      payout_mode: "percent",
      payouts: { q1: 5, ht: 15, q4: 5, final: 25 },
      is_open: true,
    };
    const { error } = await sb.from("boards").upsert(up, { onConflict: "slug" });
    if (error) { console.error(error); alert("Create/Update failed."); return; }
  }

  alert("Board created/updated.");
  await loadBoardsList();
  els.boardSelect.value = p.slug;
  await loadBoard(p.slug);
});

/* ---------- Save payouts/mode/lock ---------- */
els.payouts.saveBtn?.addEventListener("click", async () => {
  if (!currentBoard) return alert("Load a board first.");

  const payouts = {
    q1: Number(els.payouts.q1.value || 0),
    ht: Number(els.payouts.ht.value || 0),
    q4: Number(els.payouts.q4.value || 0),
    final: Number(els.payouts.final.value || 0),

  await refreshSessionUI();
})();
