// 外贸客户管理系统 — 前端入口、路由、侧边导航与全局搜索
import { api, avatar, esc, debounce, openModal, toast, closeModal } from './util.js';
import dashboard from './views/dashboard.js';
import customers from './views/customers.js';
import customerDetail from './views/customerDetail.js';
import sea from './views/sea.js';
import opportunities from './views/opportunities.js';
import customs from './views/customs.js';
import activities from './views/activities.js';
import templates from './views/templates.js';
import handovers from './views/handovers.js';
import trade from './views/trade.js';

export const state = { users: [] };

const NAV = [
  { group: '工作台' },
  { key: 'dashboard', to: '#/dashboard', icon: '▦', label: '工作看板' },
  { group: '客户管理' },
  { key: 'customers', to: '#/customers', icon: '◉', label: '客户档案' },
  { key: 'sea', to: '#/sea', icon: '≈', label: '公海管理' },
  { key: 'follow', to: '#/customers?scope=follow', icon: '✎', label: '客户跟进' },
  { group: '海关数据' },
  { key: 'customs', to: '#/customs', icon: '◎', label: '海关数据分析' },
  { key: 'customers-customs', to: '#/customers?source=海关数据', icon: '⊹', label: '海关客户池' },
  { group: '业务管理' },
  { key: 'opportunities', to: '#/opportunities', icon: '◇', label: '商机管理' },
  { key: 'trade', to: '#/trade', icon: '❏', label: '报价与订单' },
  { key: 'handovers', to: '#/handovers', icon: '⇄', label: '客户移交' },
  { group: '营销触达' },
  { key: 'activities', to: '#/activities', icon: '✉', label: '邮件营销' },
  { key: 'templates', to: '#/templates', icon: '❏', label: '开发信模板库' },
];

const ROUTES = {
  dashboard: { view: dashboard, title: ['工作台', '工作看板'] },
  customers: { view: customers, title: ['客户管理', '客户档案'] },
  customer: { view: customerDetail, title: ['客户管理', '客户详情'] },
  sea: { view: sea, title: ['客户管理', '公海管理'] },
  opportunities: { view: opportunities, title: ['业务管理', '商机管理'] },
  trade: { view: trade, title: ['业务管理', '报价与订单'] },
  customs: { view: customs, title: ['海关数据', '海关数据分析'] },
  activities: { view: activities, title: ['营销触达', '邮件营销'] },
  templates: { view: templates, title: ['营销触达', '开发信模板库'] },
  handovers: { view: handovers, title: ['业务管理', '客户移交'] },
};

// 页面内通用交互：data-go 跳转、data-new-customer 新建客户
function bindGlobal(app) {
  app.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { location.hash = go.dataset.go; return; }
    if (e.target.closest('[data-new-customer]')) {
      const { openCustomerForm } = await import('./views/customers.js');
      openCustomerForm(null, () => render());
    }
  });
}

let globalBound = false;

function parseHash() {
  const raw = location.hash.slice(1) || '/dashboard';
  const [path, qs] = raw.split('?');
  let segs = path.split('/').filter(Boolean);
  if (segs[0] === 'customers' && segs.length > 1) segs = ['customer', ...segs.slice(1)];
  return { segs, query: Object.fromEntries(new URLSearchParams(qs ?? '')) };
}

function renderNav() {
  const { segs } = parseHash();
  const hash = location.hash || '#/dashboard';
  const key = segs[0] === 'customer' ? 'customers' : segs[0];
  document.getElementById('nav').innerHTML = NAV.map((n) => {
    if (n.group) return `<div class="nav-group"><div class="nav-title">${esc(n.group)}</div></div>`;
    const active = n.key === key && (n.key !== 'follow' || hash.includes('scope=follow'));
    return `<a href="${n.to}" class="${active ? 'active' : ''}" data-key="${n.key}"><span class="ico">${n.icon}</span><span class="t">${esc(n.label)}</span></a>`;
  }).join('').replace(/<div class="nav-group"><\/div>/g, '');
}

function renderFoot() {
  const me = state.users[0];
  document.getElementById('sidebar-foot').innerHTML = me
    ? `${avatar(me.name, me.id)}<div class="who"><b>${esc(me.name)}</b><span>${esc(me.role)} · ${esc(me.dept)}</span></div>`
    : '';
}

function renderCrumbs(title) {
  document.getElementById('crumbs').innerHTML = title.map((t, i) => (i ? `<span>/</span><b>${esc(t)}</b>` : `<span>${esc(t)}</span>`)).join('');
}

export async function navigate(to) {
  if (location.hash === to) return render();
  location.hash = to;
}

export function refresh() { return render(); }

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const { segs, query } = parseHash();
  const name = segs[0] || 'dashboard';
  const route = ROUTES[name] ?? ROUTES.dashboard;
  const title = [...route.title];
  if (name === 'customer') title.push(`#${segs[1]}`);
  if (name === 'customers' && query.scope === 'follow') { title[1] = '客户跟进'; }
  if (name === 'customers' && query.source === '海关数据') { title[1] = '海关客户池'; }
  renderNav();
  renderCrumbs(title);
  const app = document.getElementById('app');
  try {
    const view = await route.view({ params: segs.slice(1), query, state, navigate });
    if (seq !== renderSeq) return;
    if (typeof view === 'string') {
      app.innerHTML = view;
    } else {
      app.innerHTML = view.html;
      view.bind?.(app);
    }
    window.scrollTo({ top: 0 });
  } catch (e) {
    if (seq !== renderSeq) return;
    app.innerHTML = `<div class="card error-box"><div class="card-body"><h2>页面加载失败</h2><p class="muted">${esc(e.message)}</p><button class="btn primary mt12" id="retry">重试</button></div></div>`;
    document.getElementById('retry')?.addEventListener('click', () => render());
  }
}

// 全局搜索：回车跳转到客户档案并按关键字过滤
function setupSearch() {
  const input = document.getElementById('global-search');
  const go = () => {
    const kw = input.value.trim();
    location.hash = kw ? `#/customers?keyword=${encodeURIComponent(kw)}` : '#/customers';
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  input.addEventListener('input', debounce(() => {
    if (location.hash.startsWith('#/customers')) {
      const { query, segs } = parseHash();
      if (!segs[1]) {
        const q = { ...query, keyword: input.value.trim() };
        location.hash = `#/customers?${new URLSearchParams(q)}`;
      }
    }
  }, 400));
}

async function switchUser() {
  const users = state.users;
  const list = users.map((u) => `<button class="btn" data-uid="${u.id}" style="justify-content:flex-start;width:100%">${avatar(u.name, u.id, 'sm')} <b>${esc(u.name)}</b> <span class="muted">${esc(u.role)} · ${esc(u.dept)}</span></button>`).join('');
  const root = openModal({
    title: '切换当前用户（演示用，无登录校验）',
    body: `<div class="grid" style="gap:8px">${list}</div>`,
    footer: `<button class="btn" data-close>取消</button>`,
  });
  root.querySelectorAll('[data-uid]').forEach((b) => b.addEventListener('click', () => {
    const idx = users.findIndex((u) => u.id === Number(b.dataset.uid));
    if (idx >= 0) {
      const me = users.splice(idx, 1)[0];
      users.unshift(me);
      renderFoot();
      toast(`已切换为 ${me.name}`);
    }
    closeModal();
  }));
}

async function boot() {
  try {
    const { items } = await api('/users');
    state.users = items;
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="card error-box"><div class="card-body"><h2>无法连接后端</h2><p class="muted">${esc(e.message)}</p><p class="small muted">请确认已运行 <code>npm start</code>（默认 http://127.0.0.1:3000）。</p></div></div>`;
    return;
  }
  renderFoot();
  setupSearch();
  document.getElementById('switch-user').addEventListener('click', switchUser);
  bindGlobal(document.getElementById('app'));
  window.addEventListener('hashchange', render);
  render();
}

boot();
