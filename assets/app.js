// assets/app.js
import { h, render } from 'https://esm.sh/preact@10.24.3';
import { useState, useEffect, useMemo } from 'https://esm.sh/preact@10.24.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
const html = htm.bind(h);

const q = new URLSearchParams(location.search);
const VIEW_ONLY = q.get('view') === '1';

// Multi-board keys
const ROOT_KEY = 'ca-ne-root-v1';        // stores list of boards + selected id
const BOARD_PREFIX = 'ca-ne-board-';     // BOARD_PREFIX + id -> board JSON

const defaultTop = [0,1,2,3,4,5,6,7,8,9];
const defaultSide = [0,1,2,3,4,5,6,7,8,9];

const emptySquares = () => Array.from({ length: 100 }, () => ({ owner: "", email: "", paid: false, note: "" }));

const ones = (n) => Math.abs(parseInt(n || 0, 10)) % 10;
const rcToIdx = (r,c) => r*10+c;
const idxToRC = (idx) => ({ row: Math.floor(idx/10), col: idx%10 });
function shuffle10() { const a=[0,1,2,3,4,5,6,7,8,9]; for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
const venmoLink = (handle, amount, note) => {
  if(!handle) return '#';
  const params = new URLSearchParams({ txn: 'pay', amount: String(amount||''), note: note||''});
  const clean = handle.startsWith('@') ? handle.slice(1) : handle;
  return `https://venmo.com/${clean}?${params}`;
};

// Simple hash (not secure; just avoids plain-text) for admin password
const hash = async (txt) => {
  const enc = new TextEncoder().encode(txt);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
};

// ---------- Root state: boards list ----------
function useRoot() {
  const [boards, setBoards] = useState([]); // [{id, name}]
  const [activeId, setActiveId] = useState(null);

  useEffect(()=>{
    try{
      const raw = localStorage.getItem(ROOT_KEY);
      if(raw){
        const j = JSON.parse(raw);
        setBoards(j.boards||[]);
        setActiveId(j.activeId || (j.boards?.[0]?.id ?? null));
      } else {
        // seed one default board
        const id = String(Date.now());
        const seed = defaultBoard('Default Board');
        localStorage.setItem(BOARD_PREFIX+id, JSON.stringify(seed));
        const j = { boards: [{id, name:'Default Board'}], activeId:id };
        localStorage.setItem(ROOT_KEY, JSON.stringify(j));
        setBoards(j.boards); setActiveId(id);
      }
    }catch(e){ console.warn(e); }
  },[]);

  useEffect(()=>{
    localStorage.setItem(ROOT_KEY, JSON.stringify({ boards, activeId }));
  }, [boards, activeId]);

  const createBoard = (name) => {
    const id = String(Date.now());
    localStorage.setItem(BOARD_PREFIX+id, JSON.stringify(defaultBoard(name)));
    setBoards(b=>[...b,{id,name}]);
    setActiveId(id);
  };
  const deleteBoard = (id) => {
    if (!confirm('Delete this board?')) return;
    localStorage.removeItem(BOARD_PREFIX+id);
    setBoards(b=>b.filter(x=>x.id!==id));
    if(activeId===id) setActiveId(boards.find(b=>b.id!==id)?.id ?? null);
  };

  return { boards, activeId, setActiveId, createBoard, deleteBoard };
}

function defaultBoard(name='Board'){
  return {
    teamTop:'Home Team',
    teamSide:'Away Team',
    topNums: defaultTop,
    sideNums: defaultSide,
    numbersLocked:false,
    squares: emptySquares(),
    costPerSquare: 10,
    payoutMode: 'percent',
    payouts: { q1:25,q2:25,q3:25,q4:25 },
    venmoHandle: '@NoreastersFlagFB', // default
    boardTitle: name,
    sellerMode: true,
    themeColor: '#1e3a8a',
    adminHash: '', // set after enabling lock
    scores: { q1:{top:'',side:''}, q2:{top:'',side:''}, q3:{top:'',side:''}, q4:{top:'',side:''} }
  };
}

// ---------- Load/save a specific board ----------
function useBoard(activeId) {
  const [data, setData] = useState(null);
  useEffect(()=>{
    if(!activeId) return;
    const raw = localStorage.getItem(BOARD_PREFIX+activeId);
    if(raw){ setData(JSON.parse(raw)); }
  },[activeId]);

  useEffect(()=>{
    if(!activeId || !data) return;
    localStorage.setItem(BOARD_PREFIX+activeId, JSON.stringify(data));
    // update theme color
    if (data.themeColor) document.documentElement.style.setProperty('--brand', data.themeColor);
  }, [activeId, data]);

  return [data, setData];
}

function Setup({ root, board, setBoard, viewOnly }){
  if(!board) return html`<div>Loading…</div>`;
  const sold = useMemo(()=> board.squares.filter(s=>s.owner).length, [board.squares]);
  const pot = sold * board.costPerSquare;

  const computed = useMemo(()=>{
    if(board.payoutMode==='percent'){
      const n = pot/100, p = board.payouts;
      return { q1:Math.round((p.q1||0)*n), q2:Math.round((p.q2||0)*n), q3:Math.round((p.q3||0)*n), q4:Math.round((p.q4||0)*n) };
    }
    const p=board.payouts; return { q1:Math.round(p.q1||0), q2:Math.round(p.q2||0), q3:Math.round(p.q3||0), q4:Math.round(p.q4||0) };
  },[board.payoutMode, board.payouts, pot]);

  const randomize = ()=> { if(!board.numbersLocked && !viewOnly) setBoard({...board, topNums: shuffle10(), sideNums: shuffle10()}); };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(board, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href:url, download: `${(board.boardTitle||'board').replace(/\s+/g,'_')}.json` });
    document.body.appendChild(a); a.click(); a.remove();
  };
  const importJSON = (file)=>{
    const reader = new FileReader();
    reader.onload = e => {
      try{
        const j = JSON.parse(e.target.result);
        setBoard({ ...board, ...j });
      }catch(err){ alert('Import failed: '+err); }
    };
    reader.readAsText(file);
  };

  const exportCSV = () => {
    const rows = [['Row','Col','Owner','Email','Paid','Note']]; // fixed typo
    board.squares.forEach((sq, idx)=>{
      const {row, col} = idxToRC(idx);
      rows.push([row+1, col+1, sq.owner||'', sq.email||'', sq.paid?'Yes':'No', (sq.note||'').replace(/\n/g,' ') ]);
    });
    const csv = rows.map(r=> r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${(board.boardTitle||'roster').replace(/\s+/g,'_')}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
  };

  const set = (k,v)=> setBoard({...board, [k]: v});

  const [pw, setPw] = useState('');
  const lockEnabled = !!board.adminHash;
  const [authed, setAuthed] = useState(!lockEnabled); // if no lock, authed
  useEffect(()=>{
    if (lockEnabled) {
      const key = 'auth-'+root.activeId;
      if (sessionStorage.getItem(key)==='1') setAuthed(true);
    }
  }, [root.activeId, lockEnabled]);

  const tryLogin = async ()=>{
    const h = await hash(pw);
    if (h === board.adminHash) { sessionStorage.setItem('auth-'+root.activeId, '1'); setAuthed(true); setPw(''); }
    else alert('Incorrect password');
  };
  const setPassword = async ()=>{
    if (!pw) { alert('Enter a password first.'); return; }
    const h = await hash(pw);
    setBoard({...board, adminHash: h});
    sessionStorage.setItem('auth-'+root.activeId, '1'); setAuthed(true); setPw('');
    alert('Admin lock enabled for this board.');
  };
  const clearPassword = ()=> { if(confirm('Remove admin lock?')) { setBoard({...board, adminHash: ''}); sessionStorage.removeItem('auth-'+root.activeId); setAuthed(true);} };

  return html`
    <div>
      <div class="toolbar">
        <img src="./assets/logo-wordmark.png" alt="Wordmark" style="height:28px"
             onError=${e => (e.target.style.display = 'none')} />
        <span class="pill">${sold} / 100 sold</span>
        <span class="pill">Pot: $${pot}</span>
        <span class="pill">Board: ${board.boardTitle}</span>
        ${VIEW_ONLY ? html`<span class="pill">Viewer</span>` : ''}
      </div>

      <div class="section-title">Boards</div>
      <div class="row">
        <div>
          <label class="label">Active Board</label>
          <select value=${root.activeId||''} onChange=${e=> root.setActiveId(e.target.value)} ${VIEW_ONLY ? 'disabled' : ''}>
            ${root.boards.map(b=> html`<option value=${b.id}>${b.name}</option>`)}
          </select>
        </div>
        <div>
          <label class="label">New Board Name</label>
          <div style="display:flex;gap:8px">
            <input id="newBoardName" placeholder="e.g., Week 3 vs. Hornets" ${VIEW_ONLY ? 'disabled' : ''}/>
            <button class="primary" onClick=${()=>{ const el=document.getElementById('newBoardName'); if(el.value) root.createBoard(el.value); }} ${VIEW_ONLY ? 'disabled' : ''}>Create</button>
          </div>
        </div>
        <div>
          <label class="label">Delete Active</label>
          <button onClick=${()=> root.deleteBoard(root.activeId)} ${VIEW_ONLY ? 'disabled' : ''}>Delete</button>
        </div>
        <div>
          <label class="label">Read-only Link</label>
          <input readonly
  value=${location.origin + location.pathname + '?view=1'}
  onFocus=${e => e.target.select()}
  onClick=${e => e.target.select()}/>

        </div>
      </div>

      <hr class="sep"/>

      <div class="section-title">Setup</div>
      <div class="row">
        <div>
          <label class="label">Board Title</label>
          <input value=${board.boardTitle} onInput=${e=>set('boardTitle', e.target.value)} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}/>
        </div>
        <div>
          <label class="label">Venmo Handle</label>
          <input placeholder="@YourTeam" value=${board.venmoHandle} onInput=${e=>set('venmoHandle', e.target.value)} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}/>
        </div>
        <div>
          <label class="label">Top Team</label>
          <input value=${board.teamTop} onInput=${e=>set('teamTop', e.target.value)} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}/>
        </div>
        <div>
          <label class="label">Side Team</label>
          <input value=${board.teamSide} onInput=${e=>set('teamSide', e.target.value)} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}/>
        </div>
        <div>
          <label class="label">Cost per Square ($)</label>
          <input type="number" min="0" value=${board.costPerSquare} onInput=${e=>set('costPerSquare', parseFloat(e.target.value||'0'))} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}/>
        </div>
        <div>
          <label class="label">Theme Color</label>
          <input type="color" value=${board.themeColor} onInput=${e=>{ document.documentElement.style.setProperty('--brand', e.target.value); set('themeColor', e.target.value); }} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}/>
        </div>
      </div>

      <div class="section-title">Header Numbers</div>
      <div class="row">
        <div>
          <div class="small">Top (${board.teamTop})</div>
          <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin-top:6px">
            ${board.topNums.map(n => html`<div class="pill" style="text-align:center">${n}</div>`)}
          </div>
        </div>
        <div>
          <div class="small">Side (${board.teamSide})</div>
          <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin-top:6px">
            ${board.sideNums.map(n => html`<div class="pill" style="text-align:center">${n}</div>`)}
          </div>
        </div>
      </div>
      <div class="controls" style="margin-top:8px">
        <button class="primary" onClick=${randomize} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}>Randomize</button>
        <button onClick=${()=>set('numbersLocked', !board.numbersLocked)} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}>${board.numbersLocked ? 'Unlock' : 'Lock'}</button>
        <button onClick=${exportJSON}>Export</button>
        <label class="pill" style="cursor:pointer">
          <input type="file" accept=".json,application/json" style="display:none" onChange=${e=> e.target.files && importJSON(e.target.files[0])} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}/>
          Import JSON
        </label>
        <button onClick=${exportCSV}>Export CSV</button>
      </div>

      <div class="section-title">Payouts</div>
      <div class="row">
        <div>
          <label class="label">Mode</label>
          <select value=${board.payoutMode} onChange=${e=>set('payoutMode', e.target.value)} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}>
            <option value="percent">Percent of Pot</option>
            <option value="fixed">Fixed $</option>
          </select>
        </div>
        ${['q1','q2','q3','q4'].map(q => html`
          <div>
            <label class="label">${q.toUpperCase()}</label>
            <input type="number" value=${board.payouts[q]} onInput=${e=>set('payouts', {...board.payouts, [q]: parseFloat(e.target.value||'0')})} ${VIEW_ONLY||(!authed&&lockEnabled)?'disabled':''}/>
          </div>
        `)}
      </div>
      <div class="note">Computed → Q1 $${computed.q1}, Q2 $${computed.q2}, Q3 $${computed.q3}, Q4 $${computed.q4}</div>

      ${lockEnabled ? html`
        <div class="alert" style="margin-top:10px">
          <b>Admin Lock Enabled.</b> ${authed ? 'You are authenticated.' : 'Enter password to edit.'}
          ${!authed ? html`
            <div style="display:flex;gap:8px;margin-top:6px">
              <input type="password" placeholder="Password" value=${pw} onInput=${e=>setPw(e.target.value)}/>
              <button class="primary" onClick=${tryLogin}>Unlock</button>
            </div>` : html`<div style="margin-top:6px"><button onClick=${clearPassword}>Remove Lock</button></div>`}
        </div>` : html`
        <div class="alert" style="margin-top:10px">
          <b>Optional Admin Lock:</b> Set a password to prevent accidental edits on shared devices.
          <div style="display:flex;gap:8px;margin-top:6px">
            <input type="password" placeholder="New password" value=${pw} onInput=${e=>setPw(e.target.value)} ${VIEW_ONLY?'disabled':''}/>
            <button class="primary" onClick=${setPassword} ${VIEW_ONLY?'disabled':''}>Enable Lock</button>
          </div>
        </div>`}
    </div>
  `;
}

function Board({ board, setBoard, viewOnly }) {
  if(!board) return html`<div>Loading…</div>`;
  const sold = board.squares.filter(s=>s.owner).length;
  const pot = sold * board.costPerSquare;

  const winners = useMemo(()=> ({
    q1: winner('q1'),
    q2: winner('q2'),
    q3: winner('q3'),
    q4: winner('q4'),
  }), [board.scores, board.topNums, board.sideNums, board.squares]);

  function winner(q){
    const qd = board.scores[q];
    const col = board.topNums.indexOf(ones(qd.top));
    const row = board.sideNums.indexOf(ones(qd.side));
    if (row < 0 || col < 0) return { idx:null, row, col, owner:'' };
    const idx = rcToIdx(row, col);
    return { idx, row, col, owner: board.squares[idx]?.owner || '(Empty)' };
  }

  const computed = useMemo(()=>{
    if(board.payoutMode==='percent'){ const n=pot/100, p=board.payouts;
      return { q1:Math.round((p.q1||0)*n), q2:Math.round((p.q2||0)*n), q3:Math.round((p.q3||0)*n), q4:Math.round((p.q4||0)*n) };
    }
    const p=board.payouts; return { q1:Math.round(p.q1||0), q2:Math.round(p.q2||0), q3:Math.round(p.q3||0), q4:Math.round(p.q4||0) };
  }, [board.payoutMode, board.payouts, pot]);

  const openEditor = (idx) => {
    if (viewOnly) return;
    showModal(html`<${SquareEditor} idx=${idx} board=${board} setBoard=${setBoard} onClose=${hideModal} />`);
  };

  return html`
    <div>
      <div class="section-title">Board</div>
      <div class="small">Sold: ${sold} / 100 • Remaining: ${100 - sold} • Pot: $${pot}</div>
      <div class="board-wrap">
        <div class="board">
          <div></div>
          ${board.topNums.map((n,i)=> html`<div class="cell header sticky-top" style="text-align:center;font-weight:600">${board.teamTop} ${n}</div>`)}
          ${board.sideNums.map((sn, r) => html`
            <div class="cell header sticky-left">${board.teamSide} ${sn}</div>
            ${Array.from({length:10}).map((_, c) => {
              const idx = rcToIdx(r,c);
              const s = board.squares[idx];
              const isWin = Object.values(winners).some(w => w.idx === idx && w.idx !== null);
              return html`<div class=${"cell " + (isWin ? "win" : "")} onClick=${()=>openEditor(idx)}>
                <div style="display:flex;justify-content:space-between;gap:6px">
                  <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.owner || "(Available)"}</span>
                  ${s.owner ? html`<span class=${"badge " + (s.paid ? "paid" : "")}>${s.paid ? "Paid" : "Unpaid"}</span>` : ""}
                </div>
                ${s.note ? html`<div class="small">${s.note}</div>` : ""}
              </div>`;
            })}
          `)}
        </div>
      </div>

      <div class="section-title">Scores & Winners</div>
      <div class="row">
        ${['q1','q2','q3','q4'].map((q,i)=> html`
          <div class="card">
            <div style="font-weight:700">Q${i+1} — Enter Final Scores</div>
            <div class="row" style="margin-top:6px">
              <div>
                <label class="label">${board.teamTop}</label>
                <input type="number" value=${board.scores[q].top} onInput=${e=> setBoard({...board, scores: {...board.scores, [q]: {...board.scores[q], top: e.target.value }}})} ${viewOnly?'disabled':''}/>
              </div>
              <div>
                <label class="label">${board.teamSide}</label>
                <input type="number" value=${board.scores[q].side} onInput=${e=> setBoard({...board, scores: {...board.scores, [q]: {...board.scores[q], side: e.target.value }}})} ${viewOnly?'disabled':''}/>
              </div>
            </div>
            <div class="kv"><div>Ones → <b>${ones(board.scores[q].top)} & ${ones(board.scores[q].side)}</b></div><div>Payout: <b>$${computed[q]}</b></div></div>
            <div>Winner: <b>${winners[q].owner || "TBD"}</b> ${winners[q].idx !== null ? html`<span class="small">(Row ${winners[q].row+1}, Col ${winners[q].col+1})</span>` : ""}</div>
          </div>
        `)}
      </div>

      <div class="section-title">Roster</div>
      <div class="table">
        <div class="thead"><div>Row</div><div>Col</div><div>Owner</div><div>Email</div><div>Paid</div><div>Note</div></div>
        <div style="max-height:220px;overflow:auto">
          ${board.squares.map((sq, idx)=>{
            const {row, col} = idxToRC(idx);
            return html`<div class="row">
              <div>${row+1}</div><div>${col+1}</div>
              <div>${sq.owner || ""}</div><div>${sq.email || ""}</div>
              <div>${sq.paid ? "Yes" : "No"}</div><div>${sq.note || ""}</div>
            </div>`;
          })}
        </div>
      </div>
    </div>
  `;
}

function SquareEditor({ idx, board, setBoard, onClose }){
  const { row, col } = idxToRC(idx);
  const sq = board.squares[idx];
  const note = `${board.boardTitle} – ${board.teamTop} ${board.topNums[col]} × ${board.teamSide} ${board.sideNums[row]} (Row ${row+1}, Col ${col+1})`;
  const link = venmoLink(board.venmoHandle, board.costPerSquare, note);
  const [owner, setOwner] = useState(sq.owner || '');
  const [email, setEmail] = useState(sq.email || '');
  const [paid, setPaid] = useState(!!sq.paid);
  const [customNote, setCustomNote] = useState(sq.note || '');

  const save = () => {
    const next = [...board.squares];
    next[idx] = { owner, email, paid, note: customNote };
    setBoard({ ...board, squares: next });
    onClose && onClose();
  };
  const clear = () => {
    const next = [...board.squares];
    next[idx] = { owner:'', email:'', paid:false, note:'' };
    setBoard({ ...board, squares: next });
    onClose && onClose();
  };

  return html`
    <div class="modal-backdrop" onClick=${onClose}>
      <div class="modal" onClick=${e=>e.stopPropagation()}>
        <div style="font-weight:700;margin-bottom:6px">Square Details</div>
        <div class="small">${board.teamTop} ${board.topNums[col]} × ${board.teamSide} ${board.sideNums[row]} — Row ${row+1}, Col ${col+1}</div>
        <div class="row" style="margin-top:8px">
          <div>
            <label class="label">Buyer Name</label>
            <input value=${owner} onInput=${e=>setOwner(e.target.value)}/>
          </div>
          <div>
            <label class="label">Email (optional)</label>
            <input value=${email} onInput=${e=>setEmail(e.target.value)}/>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
          <input id="paid" type="checkbox" checked=${paid} onInput=${e=>setPaid(e.target.checked)}/>
          <label for="paid">Paid</label>
        </div>
        <div style="margin-top:8px">
          <label class="label">Note (private)</label>
          <textarea rows="2" value=${customNote} onInput=${e=>setCustomNote(e.target.value)}></textarea>
        </div>
        <div class="controls" style="margin-top:12px">
          <button class="primary" onClick=${save}>Save</button>
          <button onClick=${()=>navigator.clipboard.writeText(note)}>Copy Square</button>
          ${board.venmoHandle ? html`<a class="pill" href=${link} target="_blank" rel="noreferrer">Pay via Venmo</a>` : ""}
          <button onClick=${clear}>Clear</button>
          <button class="ghost" onClick=${onClose}>Close</button>
        </div>
      </div>
    </div>
  `;
}

// Modal helpers
const modalRoot = document.getElementById('modal-root');
function showModal(v) { render(v, modalRoot); }
function hideModal() { render(null, modalRoot); }

function Root(){
  const root = useRoot();
  const [board, setBoard] = useBoard(root.activeId);
  if(!root.activeId || !board) return html`<div>Loading…</div>`;
  return html`<div class="grid">
    <div class="card"><${Setup} root=${root} board=${board} setBoard=${setBoard} viewOnly=${VIEW_ONLY}/></div>
    <div class="card"><${Board} board=${board} setBoard=${setBoard} viewOnly=${VIEW_ONLY}/></div>
  </div>`;
}

// apply saved theme ASAP
try {
  const rootRaw = localStorage.getItem('ca-ne-root-v1');
  if (rootRaw) {
    const j = JSON.parse(rootRaw);
    const activeId = j.activeId || (j.boards?.[0]?.id);
    const bRaw = activeId ? localStorage.getItem('ca-ne-board-'+activeId) : null;
    if (bRaw) {
      const b = JSON.parse(bRaw);
      if (b.themeColor) document.documentElement.style.setProperty('--brand', b.themeColor);
    }
  }
} catch(e){}

render(html`<${Root}/>`, document.querySelector('.container'));
