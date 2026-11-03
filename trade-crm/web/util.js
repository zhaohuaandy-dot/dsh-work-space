// 公共工具：API 请求、格式化、弹窗、提示、SVG 图表
const API_BASE = '/api';

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = API_BASE + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error(data?.error ?? `请求失败（${res.status}）`);
  return data;
}

// ---------- 格式化 ----------
const NF0 = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtInt = (n) => NF0.format(Number(n ?? 0));
export const fmtNum = (n) => NF1.format(Number(n ?? 0));
export function fmtMoney(n) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1e6) return `$${NF1.format(v / 1e6)}M`;
  if (Math.abs(v) >= 1e4) return `$${NF0.format(v / 1e3)}K`;
  return `$${NF0.format(v)}`;
}
export function fmtUsd(n) { return `$${NF0.format(Number(n ?? 0))}`; }
export const fmtDate = (s) => (s ? String(s).slice(0, 10) : '—');
export const fmtDateTime = (s) => (s ? String(s).slice(0, 16) : '—');
export function relTime(s) {
  if (!s) return '—';
  const days = Math.floor((Date.now() - new Date(s.replace(' ', 'T')).getTime()) / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(`${dateStr}T00:00:00Z`).getTime() - Date.now()) / 86400000);
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = (s) => esc(s);

export const HUES = [210, 150, 25, 280, 350, 190, 45, 320];
export function userColor(id) { return `hsl(${HUES[(Number(id) || 0) % HUES.length]} 62% 52%)`; }
export function initials(name) {
  const s = String(name ?? '');
  if (!s) return '?';
  return /[\u4e00-\u9fa5]/.test(s) ? s.slice(-2) : s.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
export const LEVEL_TAG = { A: 'red', B: 'orange', C: 'blue', D: 'gray' };
export const STATUS_TAG = { 跟进中: 'blue', 已成交: 'green', 公海: 'orange', 已流失: 'gray' };
export const STAGE_TAG = { 初步接触: 'gray', 需求确认: 'blue', 报价中: 'purple', 谈判中: 'orange', 赢单: 'green', 输单: 'red' };

export function levelTag(level) { return `<span class="tag ${LEVEL_TAG[level] ?? 'gray'}">${esc(level)} 级</span>`; }
export function statusTag(status) { return `<span class="tag ${STATUS_TAG[status] ?? 'gray'}">${esc(status)}</span>`; }
export function stageTag(stage) { return `<span class="tag ${STAGE_TAG[stage] ?? 'gray'}">${esc(stage)}</span>`; }
export function avatar(name, id, cls = '') {
  return `<span class="avatar ${cls}" style="background:${userColor(id)}" title="${attr(name)}">${esc(initials(name))}</span>`;
}

// ---------- 提示 ----------
export function toast(msg, type = 'ok') {
  const wrap = document.querySelector('.toasts') ?? (() => {
    const el = document.createElement('div');
    el.className = 'toasts';
    document.body.appendChild(el);
    return el;
  })();
  const el = document.createElement('div');
  el.className = `toast ${type === 'err' ? 'err' : ''}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------- 弹窗 ----------
let modalRoot;
export function openModal({ title, body, footer, wide = false, onMount }) {
  closeModal();
  modalRoot = document.createElement('div');
  modalRoot.className = 'modal-mask';
  modalRoot.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${esc(title)}</h2><div class="spacer"></div><button class="btn ghost sm" data-close aria-label="关闭">✕</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  modalRoot.addEventListener('click', (e) => {
    if (e.target === modalRoot || e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', escHandler);
  document.body.appendChild(modalRoot);
  onMount?.(modalRoot);
  return modalRoot;
}
function escHandler(e) { if (e.key === 'Escape') closeModal(); }
export function closeModal() {
  document.removeEventListener('keydown', escHandler);
  modalRoot?.remove();
  modalRoot = undefined;
}

export function readForm(root) {
  const data = {};
  for (const el of root.querySelectorAll('[name]')) {
    const v = el.type === 'checkbox' ? el.checked : el.value;
    data[el.name] = typeof v === 'string' ? v.trim() : v;
  }
  return data;
}

// ---------- SVG 图表 ----------
export function svgLine(series, { width = 640, height = 200 } = {}) {
  // series: [{ name, color, points: [{ x: label, y: number }] }]
  const labels = series[0]?.points.map((p) => p.x) ?? [];
  if (!labels.length) return `<div class="empty">暂无数据</div>`;
  const padL = 56, padR = 12, padT = 12, padB = 26;
  const W = width, H = height;
  const maxV = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y)));
  const stepX = (W - padL - padR) / Math.max(1, labels.length - 1);
  const y = (v) => padT + (H - padT - padB) * (1 - v / maxV);
  const x = (i) => padL + stepX * i;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxV * t));
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">`;
  for (const t of ticks) {
    out += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" stroke="#eef1f6" />`;
    out += `<text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end" font-size="10" fill="#8a93a6">${fmtMoney(t).replace('$', '')}</text>`;
  }
  labels.forEach((l, i) => {
    out += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#8a93a6">${esc(l)}</text>`;
  });
  for (const s of series) {
    const pts = s.points.map((p, i) => `${x(i)},${y(p.y)}`).join(' ');
    out += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
    if (s.points.length < 14) {
      s.points.forEach((p, i) => {
        out += `<circle cx="${x(i)}" cy="${y(p.y)}" r="3" fill="#fff" stroke="${s.color}" stroke-width="2"><title>${esc(p.x)}: ${fmtMoney(p.y)}</title></circle>`;
      });
    }
  }
  out += '</svg>';
  return out;
}

export function svgBars(items, { color = '#1c5fd8', valueFmt = fmtMoney, height } = {}) {
  // items: [{ name, value }]
  if (!items.length) return `<div class="empty">暂无数据</div>`;
  const max = Math.max(1, ...items.map((i) => i.value));
  const rows = items.map((i) => `
    <div class="bar-row">
      <span title="${attr(i.name)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(i.value / max) * 100}%;background:${color}"></div></div>
      <span class="right num">${valueFmt(i.value)}</span>
    </div>`).join('');
  return `<div class="bars" ${height ? `style="height:${height}px"` : ''}>${rows}</div>`;
}

export function svgDonut(items, { size = 132 } = {}) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const maxV = Math.max(...items.map((i) => i.value), 1);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let off = 0;
  const segs = items.map((i) => {
    const len = Math.max(0, (i.value / maxV) * c);
    const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${i.color}" stroke-width="14"
      stroke-dasharray="${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(i.name)}: ${i.value}</title></circle>`;
    off += len;
    return seg;
  }).join('');
  const legend = items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.name)} <b class="num">${i.value}</b></span>`).join('');
  return `<div class="donut-wrap"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${segs}
      <text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" font-size="20" font-weight="600" fill="#1d2330">${fmtInt(items.reduce((a, b) => a + b.value, 0))}</text>
      <text x="${size / 2}" y="${size / 2 + 16}" text-anchor="middle" font-size="10" fill="#8a93a6">合计</text></svg>
    <div class="legend" style="display:grid;gap:6px">${legend}</div></div>`;
}

export function empty(text = '暂无数据', icon = '📭') {
  return `<div class="empty"><div class="big">${icon}</div>${esc(text)}</div>`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function progressBar(pct, cls = '') {
  return `<div class="progress ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
}

export function downloadCsv(filename, rows) {
  const text = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
