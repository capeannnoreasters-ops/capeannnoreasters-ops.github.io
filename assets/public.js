// --- CONFIG: set these two values and do not add anything else on these lines ---
const SUPABASE_URL = "https://jpzxvnqjsixvnwzjfxuh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwenh2bnFqc2l4dm53empmeHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODE5NTEsImV4cCI6MjA3Nzg1Nzk1MX0.hyDskGwIwNv9MNBHkuX_DrIpnUHBouK5hgPZKXGOEEk";
// -------------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const qs = new URLSearchParams(location.search);
const slug = qs.get("board");

const els = {
  title: document.getElementById("board-title"),
  meta: document.getElementById("board-meta"),
  rules: document.getElementById("rules-text"),
  grid: document.getElementById("board-grid"),
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

function cell(text, classes="") {
  const d = document.createElement("div");
  d.className = `cell ${classes}`.trim();
  d.textContent = text ?? "";
  return d;
}
function rcToIdx(r,c){ return r*10+c; }
function idxToRC(i){ return {row:Math.floor(i/10), col:i%10}; }

async function loadBoardBySlug(slugValue) {
  if (!slugValue) {
    showError("Missing ?board=<slug> in the URL.");
    throw new Error("Missing slug");
  }

  const { data, error } = await sb
    .from("boards")
    .select("id, slug, title, team_top, team_side, cost_per_square, game_date, venmo_handle, payout_mode, payouts, team_keep_percent, top_nums, side_nums, randomized_at, is_open")
    .eq("slug", slugValue)
    .maybeSingle();

  if (error) {
    console.error("Supabase error loading board:", error);
    showError("Could not load board from Supabase. Check URL/key and RLS policies.");
    throw error;
  }
  if (!data) {
    showError(`No board found for slug “${slugValue}”.`);
    throw new Error("Board not found");
  }
  return data;
}

async function loadReservations(boardId) {
  const { data, error } = await sb
    .from("reservations")
    .select("square_idx,status")
    .eq("board_id", boardId);

  if (error) {
    console.error("Supabase error loading reservations:", error);
    return [];
  }
  return data || [];
}

function renderInfo(board) {
  els.title.textContent = board.title || "Football Squares";
  const metaParts = [];
  metaParts.push(`${board.team_top} vs ${board.team_side}`);
  if (board.game_date) metaParts.push(String(board.game_date));
  metaParts.push(`$${board.cost_per_square}/square`);
  if (board.venmo_handle) metaParts.push(`Venmo: ${board.venmo_handle}`);
  els.meta.textContent = metaParts.join(" • ");

  if (board.payout_mode === "percent" && board.payouts) {
    const q1 = board.payouts.q1 ?? 0, q2 = board.payouts.q2 ?? 0, q3 = board.payouts.q3 ?? 0, q4 = board.payouts.q4 ?? 0;
    const keep = board.team_keep_percent ?? Math.max(0, 100 - (q1+q2+q3+q4));
    const liList = els.rules.querySelectorAll("li");
    const payoutsLi = liList[3]; // 4th bullet in template
    if (payoutsLi) payoutsLi.innerHTML = `Payouts: 1Q – ${q1}%, 2Q – ${q2}%, 3Q – ${q3}%, 4Q – ${q4}% (Team retains ${keep}%).`;
  }
}

function renderGrid(board, reservations) {
  const grid = els.grid;
  grid.innerHTML = "";

  const top = Array.isArray(board.top_nums) && board.top_nums.length === 10 ? board.top_nums : [0,1,2,3,4,5,6,7,8,9];
  const side = Array.isArray(board.side_nums) && board.side_nums.length === 10 ? board.side_nums : [0,1,2,3,4,5,6,7,8,9];

  const taken = new Map(); // idx -> 'pending'|'paid'
  for (const r of reservations) taken.set(r.square_idx, r.status);

  grid.appendChild(cell("", "header"));
  top.forEach(n => grid.appendChild(cell(`${board.team_top} ${n}`, "header")));
  side.forEach((sn, r) => {
    grid.appendChild(cell(`${board.team_side} ${sn}`, "header"));
    for (let c = 0; c < 10; c++) {
      const idx = rcToIdx(r,c);
      const status = taken.get(idx);
      const classes = status === "paid" ? "paid" : status === "pending" ? "pending" : "";
      const d = cell(`#${idx+1}`, classes);
      if (!status && board.is_open) {
        d.style.cursor = "pointer";
        d.title = "Click to reserve";
        d.addEventListener("click", () => reserveSquare(board, idx));
      } else {
        d.style.opacity = ".7";
      }
      grid.appendChild(d);
    }
  });
}

function buildVenmoUrl(handle, amount, note) {
  const clean = handle?.startsWith("@") ? handle.slice(1) : handle;
  const p = new URLSearchParams({ txn: "pay", amount: String(amount||""), note: note||"" });
  return `https://venmo.com/${clean}?${p}`;
}

async function reserveSquare(board, idx) {
  const name = prompt("Your name for this square?");
  if (!name) return;
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
  renderGrid(board, reservations);
}

async function start() {
  try {
    els.grid.innerHTML = "<div style='padding:10px'>Loading…</div>";

    const board = await loadBoardBySlug(slug);
    renderInfo(board);

    const reservations = await loadReservations(board.id);
    renderGrid(board, reservations);

    setInterval(async () => {
      const data = await loadReservations(board.id);
      renderGrid(board, data);
    }, 8000);
  } catch (e) {
    console.error(e);
  }
}

start();
