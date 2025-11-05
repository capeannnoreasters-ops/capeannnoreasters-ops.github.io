// --- CONFIG: set these two values only ---
const SUPABASE_URL = "https://jpzxvnqjsixvnwzjfxuh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwenh2bnFqc2l4dm53empmeHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODE5NTEsImV4cCI6MjA3Nzg1Nzk1MX0.hyDskGwIwNv9MNBHkuX_DrIpnUHBouK5hgPZKXGOEEk";
// -----------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession:false } });

const qs = new URLSearchParams(location.search);
const slug = qs.get("board");

const els = {
  select: document.getElementById("boardSelect"),
  title: document.getElementById("board-title"),
  meta: document.getElementById("board-meta"),
  stats: document.getElementById("board-stats"),
  rules: document.getElementById("rules-text"),
  payoutLine: document.getElementById("payout-line"),
  lockLine: document.getElementById("lock-line"),
  grid: document.getElementById("board-grid"),
  winnersWrap: document.getElementById("winners"),
  winnersList: document.getElementById("winners-list"),
  // admin drawer
  drawer: document.getElementById("drawer"),
  adminToggle: document.getElementById("adminToggle"),
  adminFab: document.getElementById("adminFab"),
  admSlug: document.getElementById("admSlug"),
  admToken: document.getElementById("admToken"),
  s: {
    q1_top: document.getElementById("s_q1_top"),
    q1_side: document.getElementById("s_q1_side"),
    ht_top: document.getElementById("s_ht_top"),
    ht_side: document.getElementById("s_ht_side"),
    q4_top: document.getElementById("s_q4_top"),
    q4_side: document.getElementById("s_q4_side"),
    final_top: document.getElementById("s_final_top"),
    final_side: document.getElementById("s_final_side"),
    save: document.getElementById("saveScores"),
  }
};

function showError(msg) {
  const box = document.createElement("div");
  box.style.background = "#fee2e2";
  box.style.border = "1px solid #fecaca";
  box.style.color = "#7f1d1d";
  box.style.padding = "10px";
  box.style.borderRadius = "8px";
  box.style.marginTop = "10px";
  box.textContent = msg;
  els.grid.replaceWith(box);
}

function cell(text, classes=""){ const d=document.createElement("div"); d.className=`cell ${classes}`.trim(); d.textContent=text??""; return d; }
function rcToIdx(r,c){ return r*10+c; }
function idxToRC(i){ return {row:Math.floor(i/10), col:i%10}; }
function ones(n){ return Math.abs(parseInt(n||0,10)) % 10; }

async function loadBoardsList() {
  const { data, error } = await sb
    .from("boards")
    .select("slug,title,game_date,is_open")
    .eq("is_open", true)
    .order("game_date", { ascending:false })
    .limit(50);

  els.select.innerHTML = "";
  if (error || !data || data.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "No open boards";
    els.select.appendChild(opt);
    els.select.disabled = true;
    return;
  }

  data.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.slug;
    opt.textContent = b.title + (b.game_date ? ` — ${b.game_date}` : "");
    els.select.appendChild(opt);
  });

  const current = slug || data[0].slug;
  els.select.value = current;
  if (!slug) {
    location.search = `?board=${encodeURIComponent(current)}`;
  }
  els.select.addEventListener("change", () => {
    location.search = `?board=${encodeURIComponent(els.select.value)}`;
  });
}

async function loadBoardBySlug(slugValue) {
  if (!slugValue) { showError("Missing ?board=<slug> in the URL."); throw new Error("Missing slug"); }

  const { data, error } = await sb
    .from("boards")
    .select("id, slug, title, team_top, team_side, cost_per_square, game_date, venmo_handle, payout_mode, payouts, team_keep_percent, top_nums, side_nums, randomized_at, is_open, lock_at, scores")
    .eq("slug", slugValue)
    .maybeSingle();

  if (error) { console.error("Supabase error loading board:", error); showError("Could not load board from Supabase."); throw error; }
  if (!data) { showError(`No board found for slug “${slugValue}”.`); throw new Error("Board not found"); }
  return data;
}

async function loadReservations(boardId) {
  const { data, error } = await sb
    .from("reservations")
    .select("square_idx,status,buyer_name")
    .eq("board_id", boardId);
  if (error) { console.error("Supabase error loading reservations:", error); return []; }
  return data || [];
}

function renderInfo(board, reservations) {
  els.title.textContent = board.title || "Football Squares";
  const metaParts = [];
  metaParts.push(`${board.team_top} vs ${board.team_side}`);
  if (board.game_date) metaParts.push(String(board.game_date));
  metaParts.push(`$${board.cost_per_square}/square`);
  if (board.venmo_handle) metaParts.push(`Venmo: ${board.venmo_handle}`);
  els.meta.textContent = metaParts.join(" • ");

  const paid = reservations.filter(r=>r.status==='paid').length;
  const pending = reservations.filter(r=>r.status==='pending').length;
  const sold = paid + pending;
  const pot = sold * (board.cost_per_square||0);
  els.stats.innerHTML = `
    <span class="stat">Sold: ${sold}/100</span>
    <span class="stat">Paid: ${paid}</span>
    <span class="stat">Pending: ${pending}</span>
    <span class="stat">Pot: $${pot}</span>
    <span class="stat">${board.is_open ? "OPEN" : "CLOSED"}</span>
  `;

  // Rules — payouts line + lock time
  if (board.payout_mode === "percent" && board.payouts) {
    const q1 = board.payouts.q1 ?? 0, ht = board.payouts.ht ?? 0, q4 = board.payouts.q4 ?? 0, fin = board.payouts.final ?? 0;
    const keep = board.team_keep_percent ?? Math.max(0, 100 - (q1+ht+q4+fin));
    els.payoutLine.innerHTML = `Payouts: 1Q – ${q1}%, HT – ${ht}%, Q4 – ${q4}%, Final – ${fin}% (Team keeps ${keep}%).`;
  }
  if (board.lock_at) {
    const when = new Date(board.lock_at).toLocaleString();
    els.lockLine.style.display = "";
    els.lockLine.textContent = `Numbers will be locked & randomized at ${when}.`;
  } else {
    els.lockLine.style.display = "none";
  }
}

function computeWinners(board) {
  if (!board.scores || !board.randomized_at) return null;
  const top = Array.isArray(board.top_nums) ? board.top_nums : null;
  const side = Array.isArray(board.side_nums) ? board.side_nums : null;
  if (!top || !side || top.length !== 10 || side.length !== 10) return null;

  const where = (scoreObj)=> {
    const c = top.indexOf(ones(scoreObj.top));
    const r = side.indexOf(ones(scoreObj.side));
    if (r < 0 || c < 0) return null;
    return rcToIdx(r, c);
  };

  const winners = {};
  if (board.scores.q1)    winners.q1    = where(board.scores.q1);
  if (board.scores.ht)    winners.ht    = where(board.scores.ht);
  if (board.scores.q4)    winners.q4    = where(board.scores.q4);
  if (board.scores.final) winners.final = where(board.scores.final);
  return winners;
}

function renderGrid(board, reservations) {
  els.grid.innerHTML = "";
  const numbersVisible = !!board.randomized_at;

  const top = Array.isArray(board.top_nums)&&board.top_nums.length===10 ? board.top_nums : [0,1,2,3,4,5,6,7,8,9];
  const side = Array.isArray(board.side_nums)&&board.side_nums.length===10 ? board.side_nums : [0,1,2,3,4,5,6,7,8,9];

  const taken = new Map(); // idx -> { status, name }
  for (const r of reservations) taken.set(r.square_idx, { status: r.status, name: r.buyer_name });

  const winners = computeWinners(board) || {};

  // top-left
  els.grid.appendChild(cell("", "head sticky-top"));
  // top header
  top.forEach(n => {
    const label = numbersVisible ? `${board.team_top} ${n}` : `${board.team_top}`;
    els.grid.appendChild(cell(label, "head sticky-top"));
  });
  // rows
  side.forEach((sn, r) => {
    const leftLabel = numbersVisible ? `${board.team_side} ${sn}` : `${board.team_side}`;
    els.grid.appendChild(cell(leftLabel, "head sticky-left"));

    for (let c=0;c<10;c++){
      const idx = rcToIdx(r,c);
      const info = taken.get(idx);
      const status = info?.status;
      let classes = status === "paid" ? "paid" : status === "pending" ? "pending" : "";

      // highlight any winning square (Q1/HT/Q4/Final)
      if (Object.values(winners).includes(idx)) {
        classes = (classes ? classes+" " : "") + "win";
      }

      const label = info ? (info.name?.trim() || (status === "paid" ? "Paid" : "Pending")) : `#${idx + 1}`;
      const d = cell(label, classes);

      if (!info && board.is_open) {
        d.style.cursor="pointer";
        d.title="Click to reserve";
        d.addEventListener("click", ()=> reserveSquare(board, idx));
      } else {
        d.style.opacity=".8";
        if (info) d.title = `${info.name || "Reserved"} • ${status}`;
      }
      els.grid.appendChild(d);
    }
  });

  // Winners list (names if available)
  if (board.scores && board.randomized_at) {
    const mapName = (idx)=>{
      if (idx == null) return "—";
      const res = reservations.find(r => r.square_idx === idx);
      return res?.buyer_name || `Square #${idx+1}`;
    };
    const list = [];
    if (winners.q1    !== undefined) list.push(`Q1: ${mapName(winners.q1)}`);
    if (winners.ht    !== undefined) list.push(`HT: ${mapName(winners.ht)}`);
    if (winners.q4    !== undefined) list.push(`Q4: ${mapName(winners.q4)}`);
    if (winners.final !== undefined) list.push(`Final: ${mapName(winners.final)}`);
    if (list.length) {
      els.winnersWrap.style.display = "";
      els.winnersList.innerHTML = list.map(x => `• ${x}`).join("<br/>");
    } else {
      els.winnersWrap.style.display = "none";
    }
  } else {
    els.winnersWrap.style.display = "none";
  }
}

function buildVenmoUrl(handle, amount, note) {
  const clean = handle?.startsWith("@") ? handle.slice(1) : handle;
  const p = new URLSearchParams({ txn: "pay", amount: String(amount||""), note: note||"" });
  return `https://venmo.com/${clean}?${p}`;
}

async function reserveSquare(board, idx) {
  const name = prompt("Your name for this square?"); if (!name) return;
  const email = prompt("Email (optional)") || null;

  const { data, error } = await sb
    .from("reservations")
    .insert([{ board_id: board.id, square_idx: idx, buyer_name: name, email, status: "pending" }])
    .select()
    .single();

  if (error) {
    console.error("Reserve error:", error);
    alert(error.code === "23505" ? "Sorry—someone just grabbed that square. Pick another!" : "Reservation failed. Try again.");
    return;
  }

  const res = data;
  const { row, col } = idxToRC(idx);
  const note = `${board.title} RES#${res.id} — ${board.team_top}×${board.team_side} (R${row+1}C${col+1})`;
  const venmoUrl = buildVenmoUrl(board.venmo_handle, board.cost_per_square, note);

  alert("Square reserved as PENDING. A Venmo window will open next. Please keep the note EXACTLY as shown so we can auto-confirm your square.");
  window.open(venmoUrl, "_blank", "noopener");

  const reservations = await loadReservations(board.id);
  renderInfo(board, reservations);
  renderGrid(board, reservations);
}

// -------- Admin drawer: toggle & save scores --------
[els.adminToggle, els.adminFab].forEach(btn=>{
  if (!btn) return;
  btn.addEventListener("click", ()=>{
    els.drawer.classList.toggle("open");
  });
});

els.s.save.addEventListener("click", async ()=>{
  const token = els.admToken.value.trim();
  const sSlug = els.admSlug.value.trim() || new URLSearchParams(location.search).get("board");
  if (!sSlug || !token) { alert("Enter slug and admin password."); return; }

  const scores = {
    q1:    { top: els.s.q1_top.value,    side: els.s.q1_side.value },
    ht:    { top: els.s.ht_top.value,    side: els.s.ht_side.value },
    q4:    { top: els.s.q4_top.value,    side: els.s.q4_side.value },
    final: { top: els.s.final_top.value, side: els.s.final_side.value },
  };

  const { data, error } = await sb.rpc("admin_set_scores", {
    p_board_slug: sSlug,
    p_token: token,
    p_scores: scores
  });
  if (error || !data?.ok) { alert("Save failed (check password/slug)."); return; }

  alert("Scores saved.");
  // reload board/winners
  const b = await loadBoardBySlug(sSlug);
  const res = await loadReservations(b.id);
  renderInfo(b, res);
  renderGrid(b, res);
});

async function start(){
  els.grid.innerHTML = "<div style='padding:10px'>Loading…</div>";
  await loadBoardsList();

  try{
    const board = await loadBoardBySlug(new URLSearchParams(location.search).get("board"));
    els.admSlug.value = board.slug; // prefill drawer
    const reservations = await loadReservations(board.id);
    renderInfo(board, reservations);
    renderGrid(board, reservations);

    // Poll updates
    setInterval(async ()=>{
      const b = await loadBoardBySlug(new URLSearchParams(location.search).get("board"));
      const data = await loadReservations(b.id);
      renderInfo(b, data);
      renderGrid(b, data);
    }, 8000);
  }catch(e){ console.error(e); }
}
start();
