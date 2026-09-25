// ---------- Utilidades ----------
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function statusBadge(status) {
  const map = {
    orcamento: 'blue', aprovado: 'amber', em_producao: 'amber', em_instalacao: 'amber',
    concluido: 'green', cancelado: 'red',
    rascunho: 'blue', enviada: 'amber', aprovada: 'green', recusada: 'red',
    a_cotar: '', cotado: 'green', preparacao: 'amber', andamento: 'blue', realizado: 'green',
    previsto: 'blue', pago: 'green', atrasado: 'red',
    emitida: 'green', nao_aplicavel: 'blue', pendente: 'amber', iniciada: 'blue', concluida: 'green',
    aguardando_proposta: '', recebida: 'blue', em_analise: 'amber', escolhida: 'green'
  };
  return `<span class="badge ${map[status] || ''}">${status.replace('_', ' ')}</span>`;
}

// Cache em memória para preencher selects sem refazer query toda hora
let cache = { clients: [], suppliers: [], projects: [], proposalItems: [], receivables: [], stages: [], quotes: [], services: [], serviceQuotes: [] };

// ---------- Autenticação ----------
// Link de recuperação de senha enviado por e-mail (o supabase-js limpa o hash da URL logo em seguida).
let passwordPending = /type=recovery/.test(location.hash);
let passwordFromRecovery = passwordPending;
let appBooted = false;

function showPasswordScreen(fromRecovery) {
  passwordFromRecovery = fromRecovery;
  passwordPending = true;
  $('password-title').textContent = fromRecovery ? 'Definir nova senha' : 'Alterar senha';
  $('password-cancel-btn').classList.toggle('hidden', fromRecovery);
  $('password-error').textContent = '';
  $('new-password').value = '';
  $('new-password2').value = '';
  $('login-screen').classList.add('hidden');
  $('app-shell').classList.add('hidden');
  $('password-screen').classList.remove('hidden');
  $('new-password').focus();
}

function hidePasswordScreen() {
  passwordPending = false;
  $('password-screen').classList.add('hidden');
  if (appBooted) $('app-shell').classList.remove('hidden');
}

sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') showPasswordScreen(true);
});

$('forgot-link').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = $('login-email').value.trim();
  const msg = $('login-error');
  if (!email) { msg.style.color = '#c92a2a'; msg.textContent = 'Digite seu e-mail acima e clique em "Esqueci minha senha" de novo.'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
  if (error) { msg.style.color = '#c92a2a'; msg.textContent = error.message; return; }
  msg.style.color = '#2b8a3e';
  msg.textContent = 'Se este e-mail estiver cadastrado, enviamos um link para definir a nova senha. Confira também o spam.';
});

$('change-password-btn').addEventListener('click', () => showPasswordScreen(false));
$('password-cancel-btn').addEventListener('click', hidePasswordScreen);

$('password-save-btn').addEventListener('click', async () => {
  const p1 = $('new-password').value;
  const p2 = $('new-password2').value;
  const err = $('password-error');
  if (p1.length < 8) { err.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
  if (p1 !== p2) { err.textContent = 'As duas senhas não são iguais.'; return; }
  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) { err.textContent = error.message; return; }
  const wasRecovery = passwordFromRecovery;
  hidePasswordScreen();
  toast('Senha atualizada.');
  if (wasRecovery) await boot();
});

$('login-btn').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { $('login-error').textContent = error.message; return; }
  await boot();
});

$('logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  if (passwordPending) { showPasswordScreen(passwordFromRecovery); return; }
  appBooted = true;
  $('login-screen').classList.add('hidden');
  $('app-shell').classList.remove('hidden');
  $('user-email').textContent = session.user.email;
  await refreshAll();
  showView('dashboard');
}

// ---------- Navegação ----------
document.querySelectorAll('.sidebar nav a').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    showView(a.dataset.view);
  });
});

function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
  $(`view-${view}`).classList.add('active');
  const link = document.querySelector(`.sidebar nav a[data-view="${view}"]`);
  if (link) link.classList.add('active');
}

async function refreshAll() {
  await Promise.all([loadClients(), loadSuppliers()]);
  await loadProjects();
  await loadPurchases();
  await loadServices();
  await loadStages();
  await loadPayments();
  await loadReceivables();
  await loadDocuments();
  await loadDashboard();
  fillProjectSelects();
}

function fillProjectSelects() {
  const opts = cache.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  ['purchase-project', 'service-project', 'stage-project', 'payment-project', 'receivable-project', 'document-project', 'client-preview-project'].forEach(id => {
    $(id).innerHTML = `<option value="">-</option>` + opts;
  });
  $('project-client').innerHTML = cache.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const supplierOpts = `<option value="">-</option>` + cache.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  $('purchase-supplier').innerHTML = supplierOpts;
  $('payment-supplier').innerHTML = supplierOpts;
  $('service-supplier').innerHTML = supplierOpts;
}

const monthNames = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function renderMonthlySummary(containerId, rows) {
  const withDate = (rows || []).filter(r => r.due_date);
  const byMonth = {};
  withDate.forEach(r => {
    const key = r.due_date.slice(0, 7);
    byMonth[key] = (byMonth[key] || 0) + (Number(r.amount) || 0);
  });
  const months = Object.keys(byMonth).sort();
  let acumulado = 0;
  const html = months.map(key => {
    const [year, month] = key.split('-');
    const label = `${monthNames[Number(month) - 1]}/${year}`;
    acumulado += byMonth[key];
    return `<tr><td>${label}</td><td class="num">${brl(byMonth[key])}</td><td class="num">${brl(acumulado)}</td></tr>`;
  }).join('');
  $(containerId).innerHTML = html || '<tr><td class="muted">Sem valores com data definida ainda.</td></tr>';
}

// ============================================================
// CLIENTES
// ============================================================
async function loadClients() {
  const { data, error } = await sb.from('clients').select('*').order('name');
  if (error) { toast(error.message); return; }
  cache.clients = data;
  $('clients-table').innerHTML = data.map(c => `
    <tr>
      <td>${c.name}</td><td>${c.email || ''}</td><td>${c.phone || ''}</td>
      <td class="list-actions">
        <button class="secondary" onclick="editClient('${c.id}')">Editar</button>
        <button class="danger" onclick="deleteRow('clients', '${c.id}', loadClients)">Excluir</button>
      </td>
    </tr>`).join('');
}

$('new-client-btn').addEventListener('click', () => {
  $('client-id').value = ''; $('client-name').value = ''; $('client-email').value = '';
  $('client-phone').value = ''; $('client-notes').value = '';
  $('client-form').classList.remove('hidden');
});
$('cancel-client-btn').addEventListener('click', () => $('client-form').classList.add('hidden'));

window.editClient = (id) => {
  const c = cache.clients.find(x => x.id === id);
  $('client-id').value = c.id; $('client-name').value = c.name;
  $('client-email').value = c.email || ''; $('client-phone').value = c.phone || '';
  $('client-notes').value = c.notes || '';
  $('client-form').classList.remove('hidden');
};

$('save-client-btn').addEventListener('click', async () => {
  const id = $('client-id').value;
  const payload = {
    name: $('client-name').value.trim(),
    email: $('client-email').value.trim(),
    phone: $('client-phone').value.trim(),
    notes: $('client-notes').value.trim()
  };
  if (!payload.name) { toast('Informe o nome do cliente'); return; }
  const q = id ? sb.from('clients').update(payload).eq('id', id) : sb.from('clients').insert(payload);
  const { error } = await q;
  if (error) { toast(error.message); return; }
  $('client-form').classList.add('hidden');
  await loadClients(); fillProjectSelects();
  toast('Cliente salvo');
});

// ============================================================
// FORNECEDORES
// ============================================================
async function loadSuppliers() {
  const { data, error } = await sb.from('suppliers').select('*').order('name');
  if (error) { toast(error.message); return; }
  cache.suppliers = data;
  suppliersV2 = !(await sb.from('suppliers').select('cnpj').limit(1)).error;
  $('suppliers-table').innerHTML = data.map(s => `
    <tr>
      <td>${s.name}</td>
      <td>${[s.legal_name, s.cnpj].filter(Boolean).join(' · ')}</td>
      <td>${[s.contact, s.email, s.phone].filter(Boolean).join(' · ')}</td>
      <td class="list-actions">
        <button class="secondary" onclick="editSupplier('${s.id}')">Editar</button>
        <button class="danger" onclick="deleteRow('suppliers', '${s.id}', loadSuppliers)">Excluir</button>
      </td>
    </tr>`).join('');
}

$('new-supplier-btn').addEventListener('click', () => {
  $('supplier-id').value = ''; $('supplier-name').value = ''; $('supplier-contact').value = ''; $('supplier-notes').value = '';
  ['supplier-legal-name', 'supplier-cnpj', 'supplier-ie', 'supplier-email', 'supplier-phone'].forEach(i => { $(i).value = ''; });
  $('supplier-form').classList.remove('hidden');
});
$('cancel-supplier-btn').addEventListener('click', () => $('supplier-form').classList.add('hidden'));

window.editSupplier = (id) => {
  const s = cache.suppliers.find(x => x.id === id);
  $('supplier-id').value = s.id; $('supplier-name').value = s.name;
  $('supplier-contact').value = s.contact || ''; $('supplier-notes').value = s.notes || '';
  $('supplier-legal-name').value = s.legal_name || ''; $('supplier-cnpj').value = s.cnpj || ''; $('supplier-ie').value = s.state_registration || '';
  $('supplier-email').value = s.email || ''; $('supplier-phone').value = s.phone || '';
  $('supplier-form').classList.remove('hidden');
};

$('save-supplier-btn').addEventListener('click', async () => {
  const id = $('supplier-id').value;
  const payload = {
    name: $('supplier-name').value.trim(),
    contact: $('supplier-contact').value.trim(),
    notes: $('supplier-notes').value.trim()
  };
  if (suppliersV2) {
    payload.legal_name = $('supplier-legal-name').value.trim() || null;
    payload.cnpj = $('supplier-cnpj').value.trim() || null;
    payload.state_registration = $('supplier-ie').value.trim() || null;
    payload.email = $('supplier-email').value.trim() || null;
    payload.phone = $('supplier-phone').value.trim() || null;
  }
  if (!payload.name) { toast('Informe o nome do fornecedor'); return; }
  const q = id ? sb.from('suppliers').update(payload).eq('id', id) : sb.from('suppliers').insert(payload);
  const { error } = await q;
  if (error) { toast(error.message); return; }
  $('supplier-form').classList.add('hidden');
  await loadSuppliers(); fillProjectSelects();
  toast('Fornecedor salvo');
});

// ============================================================
// PROJETOS
// ============================================================
async function loadProjects() {
  const { data, error } = await sb.from('projects').select('*, clients(name)').order('created_at', { ascending: false });
  if (error) { toast(error.message); return; }
  cache.projects = data;
  $('projects-table').innerHTML = data.map(p => `
    <tr>
      <td>${p.name}</td><td>${p.clients?.name || ''}</td>
      <td>${statusBadge(p.status)}</td><td>${statusBadge(p.nf_status)}</td>
      <td class="list-actions">
        <button class="secondary" onclick="openProject('${p.id}')">Abrir</button>
        <button class="secondary" onclick="editProject('${p.id}')">Editar</button>
        <button class="secondary" onclick="previewClientView('${p.id}')">👁 Visão do cliente</button>
        <button class="danger" onclick="deleteRow('projects', '${p.id}', loadProjects)">Excluir</button>
      </td>
    </tr>`).join('');
}

window.editProject = (id) => {
  const p = cache.projects.find(x => x.id === id);
  $('project-id').value = p.id;
  $('project-client').value = p.client_id;
  $('project-name').value = p.name;
  $('project-status').value = p.status;
  $('project-nf-status').value = p.nf_status;
  $('project-nf-number').value = p.nf_number || '';
  $('project-nf-date').value = p.nf_date || '';
  $('project-form').classList.remove('hidden');
  $('project-detail').classList.add('hidden');
};

window.previewClientView = (projectId) => {
  const previewUrl = `${location.origin}${location.pathname.replace('index.html', '')}client-portal.html?preview=${projectId}`;
  window.open(previewUrl, '_blank');
};

$('client-preview-open-btn').addEventListener('click', () => {
  const projectId = $('client-preview-project').value;
  if (!projectId) { toast('Selecione um projeto'); return; }
  previewClientView(projectId);
});

$('new-project-btn').addEventListener('click', () => {
  $('project-id').value = ''; $('project-name').value = '';
  $('project-status').value = 'orcamento'; $('project-nf-status').value = 'pendente';
  $('project-nf-number').value = ''; $('project-nf-date').value = '';
  $('project-form').classList.remove('hidden');
  $('project-detail').classList.add('hidden');
});
$('cancel-project-btn').addEventListener('click', () => $('project-form').classList.add('hidden'));

$('save-project-btn').addEventListener('click', async () => {
  const id = $('project-id').value;
  const payload = {
    client_id: $('project-client').value,
    name: $('project-name').value.trim(),
    status: $('project-status').value,
    nf_status: $('project-nf-status').value,
    nf_number: $('project-nf-number').value.trim() || null,
    nf_date: $('project-nf-date').value || null
  };
  if (!payload.client_id || !payload.name) { toast('Informe cliente e nome do projeto'); return; }
  const q = id ? sb.from('projects').update(payload).eq('id', id) : sb.from('projects').insert(payload);
  const { error } = await q;
  if (error) { toast(error.message); return; }
  $('project-form').classList.add('hidden');
  await loadProjects(); fillProjectSelects();
  toast('Projeto salvo');
});

let currentProject = null;
let currentProposal = null;

window.openProject = async (id) => {
  currentProject = cache.projects.find(p => p.id === id);
  $('project-detail-title').textContent = currentProject.name;
  const shareUrl = `${location.origin}${location.pathname.replace('index.html', '')}client-portal.html?token=${currentProject.share_token}`;
  $('project-share-link').value = shareUrl;
  $('project-access-password').value = '';
  $('project-detail').classList.remove('hidden');
  $('project-form').classList.add('hidden');
  await loadProposal(id);
};

$('close-project-detail').addEventListener('click', () => {
  $('project-detail').classList.add('hidden');
  currentProject = null; currentProposal = null;
});

$('copy-share-link').addEventListener('click', () => {
  navigator.clipboard.writeText($('project-share-link').value);
  toast('Link copiado');
});

$('preview-client-view-btn').addEventListener('click', () => {
  previewClientView(currentProject.id);
});

$('save-access-password-btn').addEventListener('click', async () => {
  const password = $('project-access-password').value.trim();
  if (!password || password.length < 4) { toast('Informe uma senha com pelo menos 4 caracteres'); return; }
  const { error } = await sb.rpc('set_project_access_password', { p_project_id: currentProject.id, p_password: password });
  if (error) { toast(error.message); return; }
  $('project-access-password').value = '';
  toast('Senha do portal salva');
});

// ---------- Proposta ----------
async function loadProposal(projectId) {
  const { data, error } = await sb.from('proposals').select('*').eq('project_id', projectId).order('version', { ascending: false }).limit(1);
  if (error) { toast(error.message); return; }
  if (data.length) {
    currentProposal = data[0];
  } else {
    const { data: created, error: e2 } = await sb.from('proposals').insert({ project_id: projectId }).select().single();
    if (e2) { toast(e2.message); return; }
    currentProposal = created;
  }
  $('proposal-id').value = currentProposal.id;
  $('proposal-status').value = currentProposal.status;
  $('proposal-labor').value = currentProposal.labor_cost;
  $('proposal-discount').value = currentProposal.discount;
  $('proposal-old-model').value = currentProposal.old_model_price || '';
  $('proposal-commission').value = currentProposal.commission_pct ?? 20;
  $('proposal-notes').value = currentProposal.notes || '';
  await loadProposalItems();
  await loadCompetitors();
}

async function loadProposalItems() {
  const { data, error } = await sb.from('proposal_items').select('*').eq('proposal_id', currentProposal.id);
  if (error) { toast(error.message); return; }
  cache.proposalItems = data;
  renderProposalItems();
}

function renderProposalItems() {
  $('proposal-items-table').innerHTML = cache.proposalItems.map((it, i) => `
    <tr data-id="${it.id}">
      <td><input value="${it.description}" data-field="description" data-i="${i}"></td>
      <td><input value="${it.unit}" data-field="unit" data-i="${i}" style="width:60px"></td>
      <td><input type="number" step="0.001" value="${it.quantity}" data-field="quantity" data-i="${i}" style="width:80px"></td>
      <td><input type="number" step="0.01" value="${it.estimated_unit_cost}" data-field="estimated_unit_cost" data-i="${i}" style="width:100px"></td>
      <td class="num">${brl(it.quantity * it.estimated_unit_cost)}</td>
      <td><button class="danger" onclick="removeProposalItem('${it.id}')">x</button></td>
    </tr>`).join('');
  document.querySelectorAll('#proposal-items-table input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = e.target.dataset.i, field = e.target.dataset.field;
      cache.proposalItems[i][field] = e.target.value;
      updateProposalTotals();
    });
  });
  updateProposalTotals();
}

$('add-proposal-item').addEventListener('click', () => {
  cache.proposalItems.push({ id: `new-${Date.now()}`, description: '', unit: 'un', quantity: 1, estimated_unit_cost: 0, _new: true });
  renderProposalItems();
});

window.removeProposalItem = async (id) => {
  if (!String(id).startsWith('new-')) {
    await sb.from('proposal_items').delete().eq('id', id);
  }
  cache.proposalItems = cache.proposalItems.filter(i => i.id !== id);
  renderProposalItems();
};

function updateProposalTotals() {
  const material = cache.proposalItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.estimated_unit_cost) || 0), 0);
  const labor = Number($('proposal-labor').value) || 0;
  const proposalTotal = material + labor - (Number($('proposal-discount').value) || 0);
  $('total-material').textContent = brl(material);
  $('total-labor').textContent = brl(labor);
  $('total-proposal').textContent = brl(proposalTotal);

  const oldModel = Number($('proposal-old-model').value) || 0;
  $('total-old-model').textContent = brl(oldModel);
  $('total-vs-old-model').textContent = brl(oldModel ? oldModel - proposalTotal : 0);

  const commissionPct = Number($('proposal-commission').value) || 0;
  const projectPurchases = currentProject ? (cache.purchases || []).filter(p => p.project_id === currentProject.id) : [];
  const purchaseSavings = projectPurchases.reduce((s, p) => s + ((Number(p.budgeted_cost) || 0) - (Number(p.actual_cost) || 0)), 0);
  $('total-commission-preview').textContent = brl(purchaseSavings > 0 ? purchaseSavings * commissionPct / 100 : 0);
}
$('proposal-labor').addEventListener('input', updateProposalTotals);
$('proposal-discount').addEventListener('input', updateProposalTotals);
$('proposal-old-model').addEventListener('input', updateProposalTotals);
$('proposal-commission').addEventListener('input', updateProposalTotals);

// ---------- Concorrentes ----------
async function loadCompetitors() {
  const { data, error } = await sb.from('competitor_quotes').select('*').eq('proposal_id', currentProposal.id);
  if (error) { toast(error.message); return; }
  cache.competitors = data;
  renderCompetitors();
}

function renderCompetitors() {
  $('competitor-table').innerHTML = cache.competitors.map((c, i) => `
    <tr>
      <td><input value="${c.competitor_name}" data-field="competitor_name" data-i="${i}"></td>
      <td><input type="number" step="0.01" value="${c.price || ''}" data-field="price" data-i="${i}" style="width:100px"></td>
      <td><input value="${c.notes || ''}" data-field="notes" data-i="${i}"></td>
      <td><button class="danger" onclick="removeCompetitor('${c.id}')">x</button></td>
    </tr>`).join('');
  document.querySelectorAll('#competitor-table input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      cache.competitors[e.target.dataset.i][e.target.dataset.field] = e.target.value;
    });
  });
}

$('add-competitor').addEventListener('click', () => {
  cache.competitors.push({ id: `new-${Date.now()}`, competitor_name: '', price: 0, notes: '', _new: true });
  renderCompetitors();
});

window.removeCompetitor = async (id) => {
  if (!String(id).startsWith('new-')) {
    await sb.from('competitor_quotes').delete().eq('id', id);
  }
  cache.competitors = cache.competitors.filter(c => c.id !== id);
  renderCompetitors();
};

$('save-proposal-btn').addEventListener('click', async () => {
  const payload = {
    status: $('proposal-status').value,
    labor_cost: Number($('proposal-labor').value) || 0,
    discount: Number($('proposal-discount').value) || 0,
    old_model_price: Number($('proposal-old-model').value) || null,
    commission_pct: Number($('proposal-commission').value) || 0,
    notes: $('proposal-notes').value.trim()
  };
  const { error } = await sb.from('proposals').update(payload).eq('id', currentProposal.id);
  if (error) { toast(error.message); return; }

  for (const item of cache.proposalItems) {
    const row = { proposal_id: currentProposal.id, description: item.description, unit: item.unit, quantity: item.quantity, estimated_unit_cost: item.estimated_unit_cost };
    if (item._new) await sb.from('proposal_items').insert(row);
    else await sb.from('proposal_items').update(row).eq('id', item.id);
  }
  for (const c of cache.competitors) {
    const row = { proposal_id: currentProposal.id, competitor_name: c.competitor_name, price: c.price || null, notes: c.notes };
    if (c._new) await sb.from('competitor_quotes').insert(row);
    else await sb.from('competitor_quotes').update(row).eq('id', c.id);
  }
  await loadProposal(currentProject.id);
  await loadPurchases();
  toast('Proposta salva');
});

// ============================================================
// COTAÇÕES (antes "Compras") — V2 etapa 1
// ============================================================
const itemEstimate = (pi) => pi ? (Number(pi.quantity) || 0) * (Number(pi.estimated_unit_cost) || 0) : 0;
const fmtDate = (d) => d ? d.split('-').reverse().join('/') : '-';

// Rateio da cotação em edição (quando atende mais de um projeto)
// Limite de projetos por cotação (só na tela; o banco não limita).
const MAX_ALLOC_PROJECTS = 5;
let allocRows = [];
// Itens da proposta mais recente de cada projeto (cache de sessão)
let proposalItemsCache = {};
// false enquanto o banco ainda não recebeu o script v2_etapa1_cotacoes.sql
let allocationsAvailable = true;

async function getProposalItems(projectId) {
  if (!projectId) return [];
  if (proposalItemsCache[projectId]) return proposalItemsCache[projectId];
  const { data: props } = await sb.from('proposals').select('id').eq('project_id', projectId).order('version', { ascending: false }).limit(1);
  if (!props || !props.length) return (proposalItemsCache[projectId] = []);
  const { data: items } = await sb.from('proposal_items').select('*').eq('proposal_id', props[0].id);
  return (proposalItemsCache[projectId] = items || []);
}

const PURCHASE_SELECT_V2 = '*, projects(name), suppliers(name), proposal_items(description, quantity, estimated_unit_cost), purchase_allocations(id, project_id, proposal_item_id, amount, pct, projects(name), proposal_items(description, quantity, estimated_unit_cost))';
const PURCHASE_SELECT_V3 = PURCHASE_SELECT_V2 + ', purchase_installments(id, seq, days_after_purchase, amount, payment_id)';
// false enquanto o banco ainda não recebeu o script v2_etapa2_compras.sql
let installmentsAvailable = false;
// false enquanto o banco ainda não recebeu as colunas novas de fornecedor
let suppliersV2 = false;
const PURCHASE_SELECT_V1 = '*, projects(name), suppliers(name), proposal_items(description, quantity, estimated_unit_cost)';

async function loadPurchases() {
  let res = await sb.from('purchases').select(PURCHASE_SELECT_V3).order('priority');
  if (!res.error) {
    allocationsAvailable = true;
    installmentsAvailable = true;
  } else {
    installmentsAvailable = false;
    res = await sb.from('purchases').select(PURCHASE_SELECT_V2).order('priority');
    if (!res.error) {
      allocationsAvailable = true;
    } else {
      // Banco ainda sem o script v2_etapa1_cotacoes.sql: continua funcionando no modo antigo.
      allocationsAvailable = false;
      res = await sb.from('purchases').select(PURCHASE_SELECT_V1).order('priority');
    }
  }
  if (res.error) { toast(res.error.message); return; }
  const data = res.data;
  cache.purchases = data;
  $('purchase-v2-notice').classList.toggle('hidden', allocationsAvailable);
  $('purchases-table').innerHTML = data.map(p => {
    const allocs = p.purchase_allocations || [];
    const multi = allocs.length > 1;
    const estimado = multi ? allocs.reduce((s, a) => s + itemEstimate(a.proposal_items), 0) : itemEstimate(p.proposal_items);
    const fechado = multi ? allocs.reduce((s, a) => s + (Number(a.amount) || 0), 0) : (Number(p.actual_cost) || 0);
    const base = estimado || (Number(p.budgeted_cost) || 0);
    const economia = base - fechado;
    const projetos = multi ? allocs.map(a => a.projects?.name).filter(Boolean).join(' + ') : (p.projects?.name || '');
    return `<tr>
      <td class="num">${p.priority ?? 0}</td>
      <td>${projetos}</td><td>${p.description}</td><td>${p.suppliers?.name || ''}</td>
      <td class="num">${estimado ? brl(estimado) : '-'}</td>
      <td class="num">${brl(p.budgeted_cost)}</td>
      <td class="num">${fechado ? brl(fechado) : '-'}</td>
      <td class="num" style="color:${economia >= 0 ? 'var(--success)' : 'var(--danger)'}">${fechado ? brl(economia) : '-'}</td>
      <td>${fmtDate(p.data_prevista_compra)}<br><b>${fmtDate(p.purchase_date)}</b></td>
      <td>${fmtDate(p.expected_delivery_date)}<br><b>${fmtDate(p.delivery_date)}</b></td>
      <td>${statusBadge(p.status)}</td>
      <td class="list-actions">
        <button class="secondary" onclick="openQuotes('${p.id}')">Cotações</button>
        <button class="secondary" onclick="openPurchaseAttachments('${p.id}')">Anexos</button>
        <button class="secondary" onclick="editPurchase('${p.id}')">Editar</button>
        <button class="danger" onclick="deleteRow('purchases', '${p.id}', loadPurchases)">Excluir</button>
      </td>
    </tr>`;
  }).join('');
  renderCompras();
  await loadDashboard();
}

// ---------- Rateio entre projetos ----------
const docTotalValue = () => Number($('purchase-doc-total').value) || Number($('purchase-actual').value) || 0;

function updateAllocSum() {
  const total = docTotalValue();
  const sum = allocRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const diff = Number((total - sum).toFixed(2));
  const el = $('purchase-alloc-sum');
  el.textContent = `Soma dos projetos: ${brl(sum)} de ${brl(total)}` + (diff ? ` — diferença ${brl(diff)}` : ' ✓');
  el.style.color = diff ? 'var(--danger)' : 'var(--success)';
}

async function renderAllocBlock() {
  const block = $('purchase-alloc-block');
  const splitBtn = $('split-purchase-btn');
  if (allocRows.length < 2) { block.classList.add('hidden'); splitBtn.classList.toggle('hidden', !allocationsAvailable); return; }
  block.classList.remove('hidden');
  splitBtn.classList.add('hidden');
  const projOpts = (sel) => '<option value="">Escolha...</option>' + (cache.projects || []).map(pr => `<option value="${pr.id}" ${pr.id === sel ? 'selected' : ''}>${pr.name}</option>`).join('');
  const rows = [];
  for (let i = 0; i < allocRows.length; i++) {
    const r = allocRows[i];
    const items = await getProposalItems(r.project_id);
    const itemOpts = '<option value="">-</option>' + items.map(it => `<option value="${it.id}" ${it.id === r.proposal_item_id ? 'selected' : ''}>${it.description}</option>`).join('');
    rows.push(`<tr>
      <td><select onchange="allocChange(${i}, 'project_id', this.value)">${projOpts(r.project_id)}</select></td>
      <td><select onchange="allocChange(${i}, 'proposal_item_id', this.value)">${itemOpts}</select></td>
      <td><input type="number" step="0.01" value="${r.amount ?? ''}" onchange="allocChange(${i}, 'amount', this.value)" style="width:110px"></td>
      <td><input type="number" step="0.01" value="${r.pct ?? ''}" onchange="allocChange(${i}, 'pct', this.value)" style="width:70px"></td>
      <td>${i > 0 ? `<button class="danger" onclick="removeAlloc(${i})">x</button>` : ''}</td>
    </tr>`);
  }
  $('purchase-alloc-rows').innerHTML = rows.join('');
  updateAllocSum();
}

window.allocChange = (i, field, val) => {
  const r = allocRows[i];
  const total = docTotalValue();
  if (field === 'amount') {
    r.amount = val === '' ? null : Number(val);
    if (total && r.amount != null) r.pct = Number((r.amount / total * 100).toFixed(3));
  } else if (field === 'pct') {
    r.pct = val === '' ? null : Number(val);
    if (total && r.pct != null) r.amount = Number((total * r.pct / 100).toFixed(2));
  } else {
    r[field] = val || null;
    if (field === 'project_id') r.proposal_item_id = null;
  }
  renderAllocBlock();
};

window.removeAlloc = (i) => {
  allocRows.splice(i, 1);
  renderAllocBlock();
};

$('split-purchase-btn').addEventListener('click', async () => {
  const total = docTotalValue();
  allocRows = [
    { project_id: $('purchase-project').value || null, proposal_item_id: $('purchase-proposal-item').value || null, amount: total || null, pct: total ? 100 : null },
    { project_id: null, proposal_item_id: null, amount: null, pct: null }
  ];
  await renderAllocBlock();
});
$('add-alloc-btn').addEventListener('click', async () => {
  if (allocRows.length >= MAX_ALLOC_PROJECTS) { toast(`Use no máximo ${MAX_ALLOC_PROJECTS} projetos por cotação`); return; }
  allocRows.push({ project_id: null, proposal_item_id: null, amount: null, pct: null });
  await renderAllocBlock();
});
$('purchase-doc-total').addEventListener('input', () => { if (allocRows.length > 1) updateAllocSum(); });

$('new-purchase-btn').addEventListener('click', () => {
  $('purchase-id').value = ''; $('purchase-description').value = ''; $('purchase-priority').value = '0';
  $('purchase-budgeted').value = ''; $('purchase-actual').value = ''; $('purchase-doc-total').value = '';
  $('purchase-date').value = ''; $('purchase-status').value = 'a_cotar';
  $('purchase-cotacao-date').value = ''; $('purchase-closing-date').value = ''; $('purchase-planned-date').value = '';
  $('purchase-expected-delivery').value = ''; $('purchase-delivery-date').value = '';
  $('purchase-payment-terms').value = ''; $('purchase-notes').value = '';
  $('purchase-proposal-item').innerHTML = '<option value="">-</option>';
  proposalItemsCache = {};
  allocRows = [];
  renderAllocBlock();
  $('purchase-form').classList.remove('hidden');
  $('quotes-panel').classList.add('hidden');
});
$('cancel-purchase-btn').addEventListener('click', () => $('purchase-form').classList.add('hidden'));

$('purchase-project').addEventListener('change', async (e) => {
  const projectId = e.target.value;
  if (!projectId) { $('purchase-proposal-item').innerHTML = '<option value="">-</option>'; return; }
  const items = await getProposalItems(projectId);
  $('purchase-proposal-item').innerHTML = '<option value="">-</option>' + items.map(i => `<option value="${i.id}" data-cost="${i.quantity * i.estimated_unit_cost}">${i.description}</option>`).join('');
});

// Escolher o item da proposta só mostra o Estimado; NÃO mexe no Orçado (preço cotado).
$('purchase-proposal-item').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  $('purchase-estimate-hint').textContent = opt && opt.dataset.cost ? 'Estimado na proposta: ' + brl(Number(opt.dataset.cost)) : '';
});

window.editPurchase = async (id) => {
  const p = cache.purchases.find(x => x.id === id);
  proposalItemsCache = {};
  $('purchase-id').value = p.id;
  $('purchase-project').value = p.project_id;
  $('purchase-project').dispatchEvent(new Event('change'));
  $('purchase-supplier').value = p.supplier_id || '';
  $('purchase-description').value = p.description;
  $('purchase-priority').value = p.priority ?? 0;
  $('purchase-budgeted').value = p.budgeted_cost;
  $('purchase-actual').value = p.actual_cost;
  $('purchase-doc-total').value = p.document_total ?? '';
  $('purchase-date').value = p.purchase_date || '';
  $('purchase-cotacao-date').value = p.data_prevista_cotacao || '';
  $('purchase-closing-date').value = p.closing_date || '';
  $('purchase-planned-date').value = p.data_prevista_compra || '';
  $('purchase-expected-delivery').value = p.expected_delivery_date || '';
  $('purchase-delivery-date').value = p.delivery_date || '';
  $('purchase-payment-terms').value = p.forma_pagamento || '';
  $('purchase-notes').value = p.notes || '';
  $('purchase-status').value = p.status;
  const allocs = (p.purchase_allocations || []).slice().sort((a, b) => (b.project_id === p.project_id) - (a.project_id === p.project_id));
  allocRows = allocs.length > 1 ? allocs.map(a => ({ project_id: a.project_id, proposal_item_id: a.proposal_item_id, amount: a.amount, pct: a.pct })) : [];
  await renderAllocBlock();
  $('purchase-form').classList.remove('hidden');
  setTimeout(() => { $('purchase-proposal-item').value = p.proposal_item_id || ''; }, 300);
};

$('save-purchase-btn').addEventListener('click', async () => {
  const id = $('purchase-id').value;
  const payload = {
    project_id: $('purchase-project').value,
    proposal_item_id: $('purchase-proposal-item').value || null,
    supplier_id: $('purchase-supplier').value || null,
    description: $('purchase-description').value.trim(),
    priority: Number($('purchase-priority').value) || 0,
    budgeted_cost: Number($('purchase-budgeted').value) || 0,
    actual_cost: Number($('purchase-actual').value) || 0,
    data_prevista_cotacao: $('purchase-cotacao-date').value || null,
    closing_date: $('purchase-closing-date').value || null,
    data_prevista_compra: $('purchase-planned-date').value || null,
    purchase_date: $('purchase-date').value || null,
    forma_pagamento: $('purchase-payment-terms').value.trim() || null,
    notes: $('purchase-notes').value.trim() || null,
    status: $('purchase-status').value
  };
  if (allocationsAvailable) {
    payload.document_total = Number($('purchase-doc-total').value) || null;
    payload.expected_delivery_date = $('purchase-expected-delivery').value || null;
    payload.delivery_date = $('purchase-delivery-date').value || null;
  }
  const rows = allocationsAvailable && allocRows.length > 1 ? allocRows : null;
  if (rows) {
    if (rows.some(r => !r.project_id)) { toast('Escolha o projeto em todas as linhas do rateio'); return; }
    if (new Set(rows.map(r => r.project_id)).size !== rows.length) { toast('Cada projeto só pode aparecer uma vez no rateio'); return; }
    // O primeiro projeto do rateio é o principal da cotação; o "fechado" dele é a parte dele.
    payload.project_id = rows[0].project_id;
    payload.proposal_item_id = rows[0].proposal_item_id || null;
    payload.actual_cost = Number(rows[0].amount) || 0;
  }
  if (!payload.project_id || !payload.description) { toast('Informe projeto e descrição'); return; }
  const q = id ? sb.from('purchases').update(payload).eq('id', id).select('id').single()
               : sb.from('purchases').insert(payload).select('id').single();
  const { data: saved, error } = await q;
  if (error) { toast(error.message); return; }
  let warn = '';
  if (allocationsAvailable) {
    const list = rows || [{ project_id: payload.project_id, proposal_item_id: payload.proposal_item_id, amount: payload.actual_cost, pct: 100 }];
    await sb.from('purchase_allocations').delete().eq('purchase_id', saved.id);
    const { error: e2 } = await sb.from('purchase_allocations').insert(list.map(r => ({
      purchase_id: saved.id, project_id: r.project_id, proposal_item_id: r.proposal_item_id || null,
      amount: Number(r.amount) || 0, pct: r.pct ?? null
    })));
    if (e2) warn = ' (o rateio não foi salvo: ' + e2.message + ')';
    else if (rows) {
      const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      if (Math.abs(sum - docTotalValue()) > 0.009) warn = ' — atenção: a soma do rateio não fecha com o total do documento';
    }
  }
  $('purchase-form').classList.add('hidden');
  await loadPurchases();
  toast('Cotação salva' + warn);
});

// ---------- Cotações de fornecedores por compra ----------
let currentQuotesPurchaseId = null;
const quoteStatusLabel = { aguardando_proposta: 'Aguardando proposta', recebida: 'Recebida', em_analise: 'Em análise', escolhida: 'Escolhida', recusada: 'Recusada' };

window.openQuotes = async (purchaseId) => {
  currentQuotesPurchaseId = purchaseId;
  const purchase = cache.purchases.find(p => p.id === purchaseId);
  $('quotes-panel-title').textContent = `Cotações — ${purchase.description}`;
  $('purchase-form').classList.add('hidden');
  $('quotes-panel').classList.remove('hidden');
  $('quote-supplier').innerHTML = `<option value="">-</option>` + cache.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  $('quote-price').value = ''; $('quote-down-payment').value = ''; $('quote-installments').value = '';
  $('quote-delivery-date').value = ''; $('quote-status').value = 'aguardando_proposta'; $('quote-notes').value = '';
  await loadQuotes();
};

$('close-quotes-panel').addEventListener('click', () => {
  $('quotes-panel').classList.add('hidden');
  currentQuotesPurchaseId = null;
});

async function loadQuotes() {
  const { data, error } = await sb.from('purchase_quotes').select('*, suppliers(name)').eq('purchase_id', currentQuotesPurchaseId).order('price');
  if (error) { toast(error.message); return; }
  cache.quotes = data;
  $('quotes-table').innerHTML = data.map(q => `
    <tr>
      <td>${q.suppliers?.name || '-'}</td><td class="num">${brl(q.price)}</td><td class="num">${brl(q.down_payment)}</td>
      <td>${q.installments || '-'}</td><td>${q.delivery_date || '-'}</td>
      <td>${statusBadge(q.status)}</td>
      <td class="list-actions">
        ${q.status !== 'escolhida' ? `<button class="secondary" onclick="chooseQuote('${q.id}')">Escolher</button>` : ''}
        <button class="secondary" onclick="openQuoteAttachments('${q.id}')">Anexos</button>
        <button class="danger" onclick="deleteQuote('${q.id}')">x</button>
      </td>
    </tr>`).join('') || '<tr><td class="muted">Nenhuma cotação registrada ainda.</td></tr>';
}

$('add-quote-btn').addEventListener('click', async () => {
  const payload = {
    purchase_id: currentQuotesPurchaseId,
    supplier_id: $('quote-supplier').value || null,
    price: Number($('quote-price').value) || null,
    down_payment: Number($('quote-down-payment').value) || null,
    installments: $('quote-installments').value.trim() || null,
    delivery_date: $('quote-delivery-date').value || null,
    status: $('quote-status').value,
    notes: $('quote-notes').value.trim() || null
  };
  const { error } = await sb.from('purchase_quotes').insert(payload);
  if (error) { toast(error.message); return; }
  $('quote-price').value = ''; $('quote-down-payment').value = ''; $('quote-installments').value = '';
  $('quote-delivery-date').value = ''; $('quote-notes').value = ''; $('quote-status').value = 'aguardando_proposta';
  await loadQuotes();
  toast('Cotação adicionada');
});

window.deleteQuote = async (id) => {
  if (!confirm('Excluir esta cotação?')) return;
  await sb.from('purchase_quotes').delete().eq('id', id);
  await loadQuotes();
};

window.chooseQuote = async (id) => {
  const quote = cache.quotes.find(q => q.id === id);
  if (!confirm('Marcar esta cotação como escolhida? Isso atualiza fornecedor, custo real, forma de pagamento e status da compra.')) return;
  await sb.from('purchase_quotes').update({ status: 'escolhida' }).eq('id', id);
  await sb.from('purchases').update({
    supplier_id: quote.supplier_id,
    actual_cost: quote.price,
    forma_pagamento: quote.installments ? `Entrada ${brl(quote.down_payment)} + ${quote.installments}` : null,
    data_prevista_compra: quote.delivery_date,
    closing_date: new Date().toISOString().slice(0, 10),
    status: 'cotado'
  }).eq('id', currentQuotesPurchaseId);
  if (allocationsAvailable) {
    const pur = cache.purchases.find(p => p.id === currentQuotesPurchaseId);
    if (pur && (pur.purchase_allocations || []).length <= 1) {
      await sb.from('purchase_allocations').update({ amount: quote.price || 0 }).eq('purchase_id', currentQuotesPurchaseId);
    }
  }
  await loadQuotes();
  await loadPurchases();
  toast('Cotação escolhida — dados da compra atualizados');
};

// ---------- Anexos/comprovantes de uma compra ----------
let currentAttachPurchaseId = null;

window.openPurchaseAttachments = async (purchaseId) => {
  currentAttachPurchaseId = purchaseId;
  const purchase = cache.purchases.find(p => p.id === purchaseId);
  $('purchase-attach-panel-title').textContent = `Anexos — ${purchase.description}`;
  $('purchase-form').classList.add('hidden');
  $('quotes-panel').classList.add('hidden');
  $('purchase-attach-panel').classList.remove('hidden');
  $('purchase-attach-file').value = '';
  await loadPurchaseAttachments();
};

$('close-purchase-attach-panel').addEventListener('click', () => {
  $('purchase-attach-panel').classList.add('hidden');
  currentAttachPurchaseId = null;
});

async function loadPurchaseAttachments() {
  const { data, error } = await sb.from('documents').select('*').eq('purchase_id', currentAttachPurchaseId).order('uploaded_at', { ascending: false });
  if (error) { toast(error.message); return; }
  $('purchase-attach-table').innerHTML = data.map(d => {
    const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
    return `<tr><td><a href="${pub.publicUrl}" target="_blank">${d.file_name}</a></td><td class="muted">${d.visible_to_client ? 'Visível ao cliente' : 'Interno'}</td>
      <td class="list-actions"><button class="danger" onclick="deletePurchaseAttachment('${d.id}', '${d.storage_path}')">Excluir</button></td></tr>`;
  }).join('') || '<tr><td class="muted">Nenhum anexo ainda.</td></tr>';
}

$('purchase-attach-upload-btn').addEventListener('click', async () => {
  const file = $('purchase-attach-file').files[0];
  if (!file) { toast('Selecione um arquivo'); return; }
  const purchase = cache.purchases.find(p => p.id === currentAttachPurchaseId);
  const path = `${purchase.project_id}/${Date.now()}-${file.name}`;
  const { error: upErr } = await sb.storage.from('documents').upload(path, file);
  if (upErr) { toast(upErr.message); return; }
  const { error } = await sb.from('documents').insert({
    project_id: purchase.project_id,
    purchase_id: currentAttachPurchaseId,
    category: 'comprovante',
    file_name: file.name,
    storage_path: path,
    visible_to_client: $('purchase-attach-visible').value === 'true'
  });
  if (error) { toast(error.message); return; }
  $('purchase-attach-file').value = '';
  await loadPurchaseAttachments();
  toast('Anexo enviado');
});

window.deletePurchaseAttachment = async (id, path) => {
  if (!confirm('Excluir este anexo?')) return;
  await sb.storage.from('documents').remove([path]);
  await sb.from('documents').delete().eq('id', id);
  await loadPurchaseAttachments();
};

// ---------- Anexos de uma cotação de fornecedor ----------
let currentAttachQuoteId = null;

window.openQuoteAttachments = async (quoteId) => {
  currentAttachQuoteId = quoteId;
  const quote = cache.quotes.find(q => q.id === quoteId);
  $('quote-attach-panel-title').textContent = `Anexos da cotação — ${quote.suppliers?.name || 'fornecedor'}`;
  $('quote-attach-panel').classList.remove('hidden');
  $('quote-attach-file').value = '';
  await loadQuoteAttachments();
};

$('close-quote-attach-panel').addEventListener('click', () => {
  $('quote-attach-panel').classList.add('hidden');
  currentAttachQuoteId = null;
});

async function loadQuoteAttachments() {
  const { data, error } = await sb.from('documents').select('*').eq('purchase_quote_id', currentAttachQuoteId).order('uploaded_at', { ascending: false });
  if (error) { toast(error.message); return; }
  $('quote-attach-table').innerHTML = data.map(d => {
    const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
    return `<tr><td><a href="${pub.publicUrl}" target="_blank">${d.file_name}</a></td><td class="muted">${d.visible_to_client ? 'Visível ao cliente' : 'Interno'}</td>
      <td class="list-actions"><button class="danger" onclick="deleteQuoteAttachment('${d.id}', '${d.storage_path}')">Excluir</button></td></tr>`;
  }).join('') || '<tr><td class="muted">Nenhum anexo ainda.</td></tr>';
}

$('quote-attach-upload-btn').addEventListener('click', async () => {
  const file = $('quote-attach-file').files[0];
  if (!file) { toast('Selecione um arquivo'); return; }
  const purchase = cache.purchases.find(p => p.id === currentQuotesPurchaseId);
  const path = `${purchase.project_id}/${Date.now()}-${file.name}`;
  const { error: upErr } = await sb.storage.from('documents').upload(path, file);
  if (upErr) { toast(upErr.message); return; }
  const { error } = await sb.from('documents').insert({
    project_id: purchase.project_id,
    purchase_quote_id: currentAttachQuoteId,
    category: 'comprovante',
    file_name: file.name,
    storage_path: path,
    visible_to_client: $('quote-attach-visible').value === 'true'
  });
  if (error) { toast(error.message); return; }
  $('quote-attach-file').value = '';
  await loadQuoteAttachments();
  toast('Anexo enviado');
});

window.deleteQuoteAttachment = async (id, path) => {
  if (!confirm('Excluir este anexo?')) return;
  await sb.storage.from('documents').remove([path]);
  await sb.from('documents').delete().eq('id', id);
  await loadQuoteAttachments();
};

// ============================================================
// COMPRAS — V2 etapa 2 (cotações "realizado" + parcelas + fornecedor)
// ============================================================
const addDays = (isoDate, days) => {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
};

const purchaseTotal = (p) => {
  if (p.document_total != null && Number(p.document_total) > 0) return Number(p.document_total);
  const allocs = p.purchase_allocations || [];
  if (allocs.length > 1) return allocs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  return Number(p.actual_cost) || 0;
};

function paymentSummary(p) {
  const inst = (p.purchase_installments || []).slice().sort((a, b) => a.seq - b.seq);
  if (!inst.length) return '<span class="muted">-</span>';
  const entry = inst.find(i => i.seq === 0);
  const rest = inst.filter(i => i.seq > 0);
  const txt = (entry ? `Entrada ${brl(entry.amount)}` : '') + (entry && rest.length ? ' + ' : '') +
    (rest.length ? `${rest.length}x (${rest.map(i => i.days_after_purchase).join('/')} dias)` : '');
  const allGen = inst.every(i => i.payment_id);
  return `${txt}<br>${allGen ? '<span style="color:var(--success)">✓ pagamentos gerados</span>' : '<span class="muted">pagamentos não gerados</span>'}`;
}

function renderCompras() {
  $('compras-v2-notice').classList.toggle('hidden', installmentsAvailable);
  const list = (cache.purchases || []).filter(p => p.status === 'realizado');
  $('compras-table').innerHTML = list.map(p => {
    const allocs = p.purchase_allocations || [];
    const multi = allocs.length > 1;
    const estimado = multi ? allocs.reduce((s, a) => s + itemEstimate(a.proposal_items), 0) : itemEstimate(p.proposal_items);
    const fechado = multi ? allocs.reduce((s, a) => s + (Number(a.amount) || 0), 0) : (Number(p.actual_cost) || 0);
    const base = estimado || (Number(p.budgeted_cost) || 0);
    const economia = base - fechado;
    const projetos = multi ? allocs.map(a => a.projects?.name).filter(Boolean).join(' + ') : (p.projects?.name || '');
    return `<tr>
      <td class="num">${p.priority ?? 0}</td>
      <td>${projetos}</td><td>${p.description}</td><td>${p.suppliers?.name || '<span class="muted">-</span>'}</td>
      <td class="num">${estimado ? brl(estimado) : '-'}</td>
      <td class="num">${fechado ? brl(fechado) : '-'}</td>
      <td class="num" style="color:${economia >= 0 ? 'var(--success)' : 'var(--danger)'}">${fechado ? brl(economia) : '-'}</td>
      <td>${fmtDate(p.purchase_date)}</td>
      <td>${fmtDate(p.expected_delivery_date)}<br><b>${fmtDate(p.delivery_date)}</b></td>
      <td>${paymentSummary(p)}</td>
      <td class="list-actions">
        <button class="secondary" onclick="openCompraPanel('${p.id}')">Pagamento</button>
        <button class="secondary" onclick="compraAttachments('${p.id}')">Anexos</button>
        <button class="secondary" onclick="compraEdit('${p.id}')">Editar</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td class="muted" colspan="11">Nenhuma compra ainda. Quando uma cotação ficar com status "realizado", ela aparece aqui.</td></tr>';
}

window.compraAttachments = async (id) => { showView('purchases'); await openPurchaseAttachments(id); };
window.compraEdit = async (id) => { showView('purchases'); await editPurchase(id); };

// ---------- Painel de pagamento da compra ----------
let currentCompraId = null;
let installRows = [];   // [{ seq, days, amount, payment_id }] — seq 0 = entrada

const compraPurchase = () => cache.purchases.find(p => p.id === currentCompraId);

function fillCompraSupplierSelect(selected) {
  $('compra-supplier').innerHTML = '<option value="">-</option>' +
    cache.suppliers.map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.name}</option>`).join('');
}

window.openCompraPanel = (id) => {
  if (!installmentsAvailable) { toast('Rode antes o script v2_etapa2_compras.sql no Supabase'); return; }
  currentCompraId = id;
  const p = compraPurchase();
  $('compra-panel-title').textContent = `Pagamento — ${p.description}`;
  $('compra-total').textContent = brl(purchaseTotal(p));
  $('compra-date').textContent = fmtDate(p.purchase_date);
  $('compra-multi-note').classList.toggle('hidden', (p.purchase_allocations || []).length < 2);
  fillCompraSupplierSelect(p.supplier_id);
  $('compra-supplier-form').classList.add('hidden');
  const inst = (p.purchase_installments || []).slice().sort((a, b) => a.seq - b.seq);
  installRows = inst.map(i => ({ seq: i.seq, days: i.days_after_purchase, amount: Number(i.amount) || 0, payment_id: i.payment_id }));
  const entry = installRows.find(r => r.seq === 0);
  $('compra-entry').value = entry ? entry.amount : '';
  $('compra-nparcelas').value = installRows.filter(r => r.seq > 0).length;
  renderInstallments();
  $('compra-panel').classList.remove('hidden');
  $('compra-panel').scrollIntoView({ behavior: 'smooth' });
};

$('close-compra-panel').addEventListener('click', () => { $('compra-panel').classList.add('hidden'); currentCompraId = null; });

function syncInstallRowsToInputs() {
  const n = Math.max(0, Math.min(12, Number($('compra-nparcelas').value) || 0));
  const entryVal = Number($('compra-entry').value) || 0;
  const rest = installRows.filter(r => r.seq > 0).sort((a, b) => a.seq - b.seq);
  while (rest.length < n) rest.push({ seq: rest.length + 1, days: (rest.length + 1) * 30, amount: 0, payment_id: null });
  rest.length = n;
  const entry = installRows.find(r => r.seq === 0);
  const rows = [];
  if (entryVal > 0 || (entry && entry.payment_id)) rows.push({ seq: 0, days: 0, amount: entryVal, payment_id: entry ? entry.payment_id : null });
  installRows = rows.concat(rest);
}

function renderInstallments() {
  const p = compraPurchase();
  $('compra-installments').innerHTML = installRows.map((r, i) => `<tr>
    <td>${r.seq === 0 ? 'Entrada' : 'Parcela ' + r.seq}</td>
    <td>${r.seq === 0 ? '0' : `<input type="number" min="0" step="1" value="${r.days}" style="width:80px" onchange="installChange(${i}, 'days', this.value)">`}</td>
    <td>${r.seq === 0 ? brl(r.amount) : `<input type="number" step="0.01" value="${r.amount}" style="width:120px" onchange="installChange(${i}, 'amount', this.value)">`}</td>
    <td>${p.purchase_date ? fmtDate(addDays(p.purchase_date, r.days)) : '-'}</td>
    <td>${r.payment_id ? '<span style="color:var(--success)">✓ gerado</span>' : '<span class="muted">não gerado</span>'}</td>
  </tr>`).join('') || '<tr><td class="muted" colspan="5">Informe a entrada e/ou o número de parcelas.</td></tr>';
  const total = purchaseTotal(p);
  const sum = installRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const diff = Number((total - sum).toFixed(2));
  $('compra-plan-sum').textContent = installRows.length ? `Soma das parcelas: ${brl(sum)} de ${brl(total)}` + (diff ? ` — diferença ${brl(diff)}` : ' ✓') : '';
  $('compra-plan-sum').style.color = installRows.length && diff ? 'var(--danger)' : 'var(--success)';
}

window.installChange = (i, field, val) => {
  const r = installRows[i];
  if (field === 'days') r.days = Math.max(0, Math.round(Number(val) || 0));
  else r.amount = Number(val) || 0;
  renderInstallments();
};

$('compra-entry').addEventListener('input', () => { syncInstallRowsToInputs(); renderInstallments(); });
$('compra-nparcelas').addEventListener('input', () => { syncInstallRowsToInputs(); renderInstallments(); });

$('compra-distribute-btn').addEventListener('click', () => {
  syncInstallRowsToInputs();
  const p = compraPurchase();
  const entry = installRows.find(r => r.seq === 0);
  const rest = installRows.filter(r => r.seq > 0);
  if (!rest.length) { toast('Informe o número de parcelas'); return; }
  const remaining = purchaseTotal(p) - (entry ? entry.amount : 0);
  const each = Math.floor(remaining / rest.length * 100) / 100;
  rest.forEach((r, i) => { r.amount = i === rest.length - 1 ? Number((remaining - each * (rest.length - 1)).toFixed(2)) : each; });
  renderInstallments();
});

// ---------- Fornecedor (cadastro rápido dentro da compra) ----------
$('compra-new-supplier-btn').addEventListener('click', () => {
  ['cs-name', 'cs-legal-name', 'cs-cnpj', 'cs-ie', 'cs-email', 'cs-phone'].forEach(id => { $(id).value = ''; });
  $('compra-supplier-form').classList.remove('hidden');
});
$('compra-cancel-supplier-btn').addEventListener('click', () => $('compra-supplier-form').classList.add('hidden'));
$('compra-save-supplier-btn').addEventListener('click', async () => {
  const payload = { name: $('cs-name').value.trim() || $('cs-legal-name').value.trim() };
  if (!payload.name) { toast('Informe o nome ou a razão social'); return; }
  if (suppliersV2) {
    payload.legal_name = $('cs-legal-name').value.trim() || null;
    payload.cnpj = $('cs-cnpj').value.trim() || null;
    payload.state_registration = $('cs-ie').value.trim() || null;
    payload.email = $('cs-email').value.trim() || null;
    payload.phone = $('cs-phone').value.trim() || null;
  }
  const { data, error } = await sb.from('suppliers').insert(payload).select('id').single();
  if (error) { toast(error.message); return; }
  await loadSuppliers(); fillProjectSelects();
  fillCompraSupplierSelect(data.id);
  $('compra-supplier-form').classList.add('hidden');
  toast('Fornecedor cadastrado');
});

// ---------- Salvar condições e gerar pagamentos ----------
async function saveCompraPlan() {
  syncInstallRowsToInputs();
  const id = currentCompraId;
  const rows = installRows.filter(r => (Number(r.amount) || 0) > 0 || r.payment_id);
  const keepSeqs = rows.map(r => r.seq);
  // remove parcelas que não existem mais (e ainda não geraram pagamento)
  const { data: existing } = await sb.from('purchase_installments').select('id, seq, payment_id').eq('purchase_id', id);
  const toDelete = (existing || []).filter(e => !keepSeqs.includes(e.seq) && !e.payment_id).map(e => e.id);
  if (toDelete.length) await sb.from('purchase_installments').delete().in('id', toDelete);
  if (rows.length) {
    const { error } = await sb.from('purchase_installments').upsert(rows.map(r => ({
      purchase_id: id, seq: r.seq, days_after_purchase: r.days, amount: r.amount
    })), { onConflict: 'purchase_id,seq' });
    if (error) { toast(error.message); return false; }
  }
  const entry = rows.find(r => r.seq === 0);
  const n = rows.filter(r => r.seq > 0).length;
  const { error: e2 } = await sb.from('purchases').update({
    supplier_id: $('compra-supplier').value || null,
    forma_pagamento: rows.length ? `${entry ? 1 : 0}+${n}` : null
  }).eq('id', id);
  if (e2) { toast(e2.message); return false; }
  return true;
}

$('compra-save-plan-btn').addEventListener('click', async () => {
  if (!(await saveCompraPlan())) return;
  const id = currentCompraId;
  await loadPurchases();
  if (id) openCompraPanel(id);
  toast('Condições de pagamento salvas');
});

$('compra-generate-btn').addEventListener('click', async () => {
  const p0 = compraPurchase();
  if (!p0.purchase_date) { toast('Informe a data da compra (em Editar) antes de gerar pagamentos'); return; }
  if (!(await saveCompraPlan())) return;
  const id = currentCompraId;
  await loadPurchases();
  const p = cache.purchases.find(x => x.id === id);
  const supplierId = $('compra-supplier').value || p.supplier_id || null;
  const pending = (p.purchase_installments || []).filter(i => !i.payment_id && Number(i.amount) > 0).sort((a, b) => a.seq - b.seq);
  if (!pending.length) { toast('Nada a gerar: defina as parcelas ou os pagamentos já foram gerados'); openCompraPanel(id); return; }
  let made = 0;
  for (const i of pending) {
    const { data: pay, error } = await sb.from('payments').insert({
      purchase_id: id, project_id: p.project_id, supplier_id: supplierId,
      amount: i.amount, due_date: addDays(p.purchase_date, i.days_after_purchase), status: 'previsto',
      notes: `${p.description} — ${i.seq === 0 ? 'entrada' : 'parcela ' + i.seq}`
    }).select('id').single();
    if (error) { toast('Erro ao gerar pagamento: ' + error.message); break; }
    await sb.from('purchase_installments').update({ payment_id: pay.id }).eq('id', i.id);
    made++;
  }
  await loadPurchases();
  await loadPayments();
  openCompraPanel(id);
  toast(`${made} pagamento(s) gerado(s)`);
});

// ============================================================
// SERVIÇOS TERCEIRIZADOS (não usado no menu desde a V2)
// ============================================================
async function loadServices() {
  const { data, error } = await sb.from('outsourced_services').select('*, projects(name), suppliers(name)').order('priority');
  if (error) { toast(error.message); return; }
  cache.services = data;
  $('services-table').innerHTML = data.map(s => `
    <tr>
      <td class="num">${s.priority ?? 0}</td>
      <td>${s.projects?.name || ''}</td><td>${s.name}</td><td>${s.suppliers?.name || ''}</td>
      <td>${s.billable_to_client ? 'Sim' : 'Não'}</td>
      <td class="num">${s.billable_to_client ? brl(s.budgeted_cost) : '-'}</td>
      <td class="num">${s.billable_to_client ? brl(s.actual_cost) : '-'}</td>
      <td>${s.data_prevista_conclusao || '-'}</td>
      <td>${statusBadge(s.status)}</td>
      <td class="list-actions">
        <button class="secondary" onclick="openServiceQuotes('${s.id}')">Cotações</button>
        <button class="secondary" onclick="openServiceAttachments('${s.id}')">Anexos</button>
        <button class="secondary" onclick="editService('${s.id}')">Editar</button>
        <button class="danger" onclick="deleteRow('outsourced_services', '${s.id}', loadServices)">Excluir</button>
      </td>
    </tr>`).join('');
}

$('new-service-btn').addEventListener('click', () => {
  $('service-id').value = ''; $('service-name').value = ''; $('service-priority').value = '0';
  $('service-supplier').value = ''; $('service-billable').checked = false;
  $('service-budgeted').value = ''; $('service-actual').value = '';
  $('service-cotacao-date').value = ''; $('service-closing-date').value = '';
  $('service-planned-date').value = ''; $('service-completion-date').value = '';
  $('service-payment-terms').value = ''; $('service-notes').value = ''; $('service-status').value = 'a_cotar';
  $('service-form').classList.remove('hidden');
  $('service-quotes-panel').classList.add('hidden');
});
$('cancel-service-btn').addEventListener('click', () => $('service-form').classList.add('hidden'));

window.editService = (id) => {
  const s = cache.services.find(x => x.id === id);
  $('service-id').value = s.id;
  $('service-project').value = s.project_id;
  $('service-name').value = s.name;
  $('service-supplier').value = s.supplier_id || '';
  $('service-priority').value = s.priority ?? 0;
  $('service-billable').checked = s.billable_to_client;
  $('service-budgeted').value = s.budgeted_cost;
  $('service-actual').value = s.actual_cost;
  $('service-cotacao-date').value = s.data_prevista_cotacao || '';
  $('service-closing-date').value = s.closing_date || '';
  $('service-planned-date').value = s.data_prevista_conclusao || '';
  $('service-completion-date').value = s.completion_date || '';
  $('service-payment-terms').value = s.forma_pagamento || '';
  $('service-notes').value = s.notes || '';
  $('service-status').value = s.status;
  $('service-form').classList.remove('hidden');
};

$('save-service-btn').addEventListener('click', async () => {
  const id = $('service-id').value;
  const payload = {
    project_id: $('service-project').value,
    supplier_id: $('service-supplier').value || null,
    name: $('service-name').value.trim(),
    priority: Number($('service-priority').value) || 0,
    billable_to_client: $('service-billable').checked,
    budgeted_cost: Number($('service-budgeted').value) || 0,
    actual_cost: Number($('service-actual').value) || 0,
    data_prevista_cotacao: $('service-cotacao-date').value || null,
    closing_date: $('service-closing-date').value || null,
    data_prevista_conclusao: $('service-planned-date').value || null,
    completion_date: $('service-completion-date').value || null,
    forma_pagamento: $('service-payment-terms').value.trim() || null,
    notes: $('service-notes').value.trim() || null,
    status: $('service-status').value
  };
  if (!payload.project_id || !payload.name) { toast('Informe projeto e nome do serviço'); return; }
  const q = id ? sb.from('outsourced_services').update(payload).eq('id', id) : sb.from('outsourced_services').insert(payload);
  const { error } = await q;
  if (error) { toast(error.message); return; }
  $('service-form').classList.add('hidden');
  await loadServices();
  toast('Serviço salvo');
});

// ---------- Cotações de prestadores por serviço terceirizado ----------
let currentServiceQuotesId = null;

window.openServiceQuotes = async (serviceId) => {
  currentServiceQuotesId = serviceId;
  const service = cache.services.find(s => s.id === serviceId);
  $('service-quotes-panel-title').textContent = `Cotações — ${service.name}`;
  $('service-form').classList.add('hidden');
  $('service-quotes-panel').classList.remove('hidden');
  $('service-quote-supplier').innerHTML = `<option value="">-</option>` + cache.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  $('service-quote-price').value = ''; $('service-quote-down-payment').value = ''; $('service-quote-installments').value = '';
  $('service-quote-completion-date').value = ''; $('service-quote-status').value = 'aguardando_proposta'; $('service-quote-notes').value = '';
  await loadServiceQuotes();
};

$('close-service-quotes-panel').addEventListener('click', () => {
  $('service-quotes-panel').classList.add('hidden');
  currentServiceQuotesId = null;
});

async function loadServiceQuotes() {
  const { data, error } = await sb.from('service_quotes').select('*, suppliers(name)').eq('service_id', currentServiceQuotesId).order('price');
  if (error) { toast(error.message); return; }
  cache.serviceQuotes = data;
  $('service-quotes-table').innerHTML = data.map(q => `
    <tr>
      <td>${q.suppliers?.name || '-'}</td><td class="num">${brl(q.price)}</td><td class="num">${brl(q.down_payment)}</td>
      <td>${q.installments || '-'}</td><td>${q.completion_date || '-'}</td>
      <td>${statusBadge(q.status)}</td>
      <td class="list-actions">
        ${q.status !== 'escolhida' ? `<button class="secondary" onclick="chooseServiceQuote('${q.id}')">Escolher</button>` : ''}
        <button class="secondary" onclick="openServiceQuoteAttachments('${q.id}')">Anexos</button>
        <button class="danger" onclick="deleteServiceQuote('${q.id}')">x</button>
      </td>
    </tr>`).join('') || '<tr><td class="muted">Nenhuma cotação registrada ainda.</td></tr>';
}

$('add-service-quote-btn').addEventListener('click', async () => {
  const payload = {
    service_id: currentServiceQuotesId,
    supplier_id: $('service-quote-supplier').value || null,
    price: Number($('service-quote-price').value) || null,
    down_payment: Number($('service-quote-down-payment').value) || null,
    installments: $('service-quote-installments').value.trim() || null,
    completion_date: $('service-quote-completion-date').value || null,
    status: $('service-quote-status').value,
    notes: $('service-quote-notes').value.trim() || null
  };
  const { error } = await sb.from('service_quotes').insert(payload);
  if (error) { toast(error.message); return; }
  $('service-quote-price').value = ''; $('service-quote-down-payment').value = ''; $('service-quote-installments').value = '';
  $('service-quote-completion-date').value = ''; $('service-quote-notes').value = ''; $('service-quote-status').value = 'aguardando_proposta';
  await loadServiceQuotes();
  toast('Cotação adicionada');
});

window.deleteServiceQuote = async (id) => {
  if (!confirm('Excluir esta cotação?')) return;
  await sb.from('service_quotes').delete().eq('id', id);
  await loadServiceQuotes();
};

window.chooseServiceQuote = async (id) => {
  const quote = cache.serviceQuotes.find(q => q.id === id);
  if (!confirm('Marcar esta cotação como escolhida? Isso atualiza prestador, custo real, forma de pagamento e status do serviço.')) return;
  await sb.from('service_quotes').update({ status: 'escolhida' }).eq('id', id);
  await sb.from('outsourced_services').update({
    supplier_id: quote.supplier_id,
    actual_cost: quote.price,
    forma_pagamento: quote.installments ? `Entrada ${brl(quote.down_payment)} + ${quote.installments}` : null,
    data_prevista_conclusao: quote.completion_date,
    closing_date: new Date().toISOString().slice(0, 10),
    status: 'cotado'
  }).eq('id', currentServiceQuotesId);
  await loadServiceQuotes();
  await loadServices();
  toast('Cotação escolhida — dados do serviço atualizados');
};

// ---------- Anexos/comprovantes de um serviço terceirizado ----------
let currentAttachServiceId = null;

window.openServiceAttachments = async (serviceId) => {
  currentAttachServiceId = serviceId;
  const service = cache.services.find(s => s.id === serviceId);
  $('service-attach-panel-title').textContent = `Anexos — ${service.name}`;
  $('service-form').classList.add('hidden');
  $('service-quotes-panel').classList.add('hidden');
  $('service-attach-panel').classList.remove('hidden');
  $('service-attach-file').value = '';
  await loadServiceAttachments();
};

$('close-service-attach-panel').addEventListener('click', () => {
  $('service-attach-panel').classList.add('hidden');
  currentAttachServiceId = null;
});

async function loadServiceAttachments() {
  const { data, error } = await sb.from('documents').select('*').eq('service_id', currentAttachServiceId).order('uploaded_at', { ascending: false });
  if (error) { toast(error.message); return; }
  $('service-attach-table').innerHTML = data.map(d => {
    const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
    return `<tr><td><a href="${pub.publicUrl}" target="_blank">${d.file_name}</a></td><td class="muted">${d.visible_to_client ? 'Visível ao cliente' : 'Interno'}</td>
      <td class="list-actions"><button class="danger" onclick="deleteServiceAttachment('${d.id}', '${d.storage_path}')">Excluir</button></td></tr>`;
  }).join('') || '<tr><td class="muted">Nenhum anexo ainda.</td></tr>';
}

$('service-attach-upload-btn').addEventListener('click', async () => {
  const file = $('service-attach-file').files[0];
  if (!file) { toast('Selecione um arquivo'); return; }
  const service = cache.services.find(s => s.id === currentAttachServiceId);
  const path = `${service.project_id}/${Date.now()}-${file.name}`;
  const { error: upErr } = await sb.storage.from('documents').upload(path, file);
  if (upErr) { toast(upErr.message); return; }
  const { error } = await sb.from('documents').insert({
    project_id: service.project_id,
    service_id: currentAttachServiceId,
    category: 'comprovante',
    file_name: file.name,
    storage_path: path,
    visible_to_client: $('service-attach-visible').value === 'true'
  });
  if (error) { toast(error.message); return; }
  $('service-attach-file').value = '';
  await loadServiceAttachments();
  toast('Anexo enviado');
});

window.deleteServiceAttachment = async (id, path) => {
  if (!confirm('Excluir este anexo?')) return;
  await sb.storage.from('documents').remove([path]);
  await sb.from('documents').delete().eq('id', id);
  await loadServiceAttachments();
};

// ---------- Anexos de uma cotação de prestador ----------
let currentAttachServiceQuoteId = null;

window.openServiceQuoteAttachments = async (quoteId) => {
  currentAttachServiceQuoteId = quoteId;
  const quote = cache.serviceQuotes.find(q => q.id === quoteId);
  $('service-quote-attach-panel-title').textContent = `Anexos da cotação — ${quote.suppliers?.name || 'prestador'}`;
  $('service-quote-attach-panel').classList.remove('hidden');
  $('service-quote-attach-file').value = '';
  await loadServiceQuoteAttachments();
};

$('close-service-quote-attach-panel').addEventListener('click', () => {
  $('service-quote-attach-panel').classList.add('hidden');
  currentAttachServiceQuoteId = null;
});

async function loadServiceQuoteAttachments() {
  const { data, error } = await sb.from('documents').select('*').eq('service_quote_id', currentAttachServiceQuoteId).order('uploaded_at', { ascending: false });
  if (error) { toast(error.message); return; }
  $('service-quote-attach-table').innerHTML = data.map(d => {
    const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
    return `<tr><td><a href="${pub.publicUrl}" target="_blank">${d.file_name}</a></td><td class="muted">${d.visible_to_client ? 'Visível ao cliente' : 'Interno'}</td>
      <td class="list-actions"><button class="danger" onclick="deleteServiceQuoteAttachment('${d.id}', '${d.storage_path}')">Excluir</button></td></tr>`;
  }).join('') || '<tr><td class="muted">Nenhum anexo ainda.</td></tr>';
}

$('service-quote-attach-upload-btn').addEventListener('click', async () => {
  const file = $('service-quote-attach-file').files[0];
  if (!file) { toast('Selecione um arquivo'); return; }
  const service = cache.services.find(s => s.id === currentServiceQuotesId);
  const path = `${service.project_id}/${Date.now()}-${file.name}`;
  const { error: upErr } = await sb.storage.from('documents').upload(path, file);
  if (upErr) { toast(upErr.message); return; }
  const { error } = await sb.from('documents').insert({
    project_id: service.project_id,
    service_quote_id: currentAttachServiceQuoteId,
    category: 'comprovante',
    file_name: file.name,
    storage_path: path,
    visible_to_client: $('service-quote-attach-visible').value === 'true'
  });
  if (error) { toast(error.message); return; }
  $('service-quote-attach-file').value = '';
  await loadServiceQuoteAttachments();
  toast('Anexo enviado');
});

window.deleteServiceQuoteAttachment = async (id, path) => {
  if (!confirm('Excluir este anexo?')) return;
  await sb.storage.from('documents').remove([path]);
  await sb.from('documents').delete().eq('id', id);
  await loadServiceQuoteAttachments();
};

// ============================================================
// PAGAMENTOS
// ============================================================
async function loadPayments() {
  const { data, error } = await sb.from('payments').select('*, projects(name), suppliers(name)').order('due_date');
  if (error) { toast(error.message); return; }
  cache.payments = data;
  $('payments-table').innerHTML = data.map(p => `
    <tr>
      <td>${p.projects?.name || ''}</td><td>${p.suppliers?.name || ''}</td><td class="num">${brl(p.amount)}</td>
      <td>${p.due_date || ''}</td><td>${p.paid_date || ''}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="list-actions">
        <button class="secondary" onclick="editPayment('${p.id}')">Editar</button>
        <button class="secondary" onclick="openPaymentAttachments('${p.id}')">Anexos</button>
        <button class="danger" onclick="deleteRow('payments', '${p.id}', loadPayments)">Excluir</button>
      </td>
    </tr>`).join('');
  renderMonthlySummary('payments-monthly-table', data);
  await loadDashboard();
}

$('new-payment-btn').addEventListener('click', () => {
  $('payment-id').value = ''; $('payment-amount').value = ''; $('payment-supplier').value = '';
  $('payment-due').value = ''; $('payment-paid').value = ''; $('payment-status').value = 'previsto';
  $('payment-method').value = ''; $('payment-purchase').innerHTML = '<option value="">-</option>';
  $('payment-form').classList.remove('hidden');
});
$('cancel-payment-btn').addEventListener('click', () => $('payment-form').classList.add('hidden'));

$('payment-project').addEventListener('change', async (e) => {
  const projectId = e.target.value;
  if (!projectId) { $('payment-purchase').innerHTML = '<option value="">-</option>'; return; }
  const { data } = await sb.from('purchases').select('id, description').eq('project_id', projectId);
  $('payment-purchase').innerHTML = '<option value="">-</option>' + data.map(p => `<option value="${p.id}">${p.description}</option>`).join('');
});

window.editPayment = (p_id) => {
  const p = cache.payments.find(x => x.id === p_id);
  $('payment-id').value = p.id;
  $('payment-project').value = p.project_id;
  $('payment-project').dispatchEvent(new Event('change'));
  $('payment-supplier').value = p.supplier_id || '';
  $('payment-amount').value = p.amount;
  $('payment-due').value = p.due_date || '';
  $('payment-paid').value = p.paid_date || '';
  $('payment-status').value = p.status;
  $('payment-method').value = p.method || '';
  $('payment-form').classList.remove('hidden');
  setTimeout(() => { $('payment-purchase').value = p.purchase_id || ''; }, 300);
};

$('save-payment-btn').addEventListener('click', async () => {
  const id = $('payment-id').value;
  const payload = {
    project_id: $('payment-project').value,
    purchase_id: $('payment-purchase').value || null,
    supplier_id: $('payment-supplier').value || null,
    amount: Number($('payment-amount').value) || 0,
    due_date: $('payment-due').value || null,
    paid_date: $('payment-paid').value || null,
    status: $('payment-status').value,
    method: $('payment-method').value.trim()
  };
  if (!payload.project_id || !payload.amount) { toast('Informe projeto e valor'); return; }
  const q = id ? sb.from('payments').update(payload).eq('id', id) : sb.from('payments').insert(payload);
  const { error } = await q;
  if (error) { toast(error.message); return; }
  $('payment-form').classList.add('hidden');
  await loadPayments();
  toast('Pagamento salvo');
});

// ---------- Anexos de um pagamento (boleto, comprovante etc.) ----------
let currentAttachPaymentId = null;

window.openPaymentAttachments = async (paymentId) => {
  currentAttachPaymentId = paymentId;
  const payment = cache.payments.find(p => p.id === paymentId);
  $('payment-attach-panel-title').textContent = `Anexos — pagamento de ${brl(payment.amount)}`;
  $('payment-form').classList.add('hidden');
  $('payment-attach-panel').classList.remove('hidden');
  $('payment-attach-file').value = '';
  await loadPaymentAttachments();
};

$('close-payment-attach-panel').addEventListener('click', () => {
  $('payment-attach-panel').classList.add('hidden');
  currentAttachPaymentId = null;
});

async function loadPaymentAttachments() {
  const { data, error } = await sb.from('documents').select('*').eq('payment_id', currentAttachPaymentId).order('uploaded_at', { ascending: false });
  if (error) { toast(error.message); return; }
  $('payment-attach-table').innerHTML = data.map(d => {
    const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
    return `<tr><td><a href="${pub.publicUrl}" target="_blank">${d.file_name}</a></td><td class="muted">${d.visible_to_client ? 'Visível ao cliente' : 'Interno'}</td>
      <td class="list-actions"><button class="danger" onclick="deletePaymentAttachment('${d.id}', '${d.storage_path}')">Excluir</button></td></tr>`;
  }).join('') || '<tr><td class="muted">Nenhum anexo ainda.</td></tr>';
}

$('payment-attach-upload-btn').addEventListener('click', async () => {
  const file = $('payment-attach-file').files[0];
  if (!file) { toast('Selecione um arquivo'); return; }
  const payment = cache.payments.find(p => p.id === currentAttachPaymentId);
  const path = `${payment.project_id}/${Date.now()}-${file.name}`;
  const { error: upErr } = await sb.storage.from('documents').upload(path, file);
  if (upErr) { toast(upErr.message); return; }
  const { error } = await sb.from('documents').insert({
    project_id: payment.project_id,
    payment_id: currentAttachPaymentId,
    category: 'comprovante',
    file_name: file.name,
    storage_path: path,
    visible_to_client: $('payment-attach-visible').value === 'true'
  });
  if (error) { toast(error.message); return; }
  $('payment-attach-file').value = '';
  await loadPaymentAttachments();
  toast('Anexo enviado');
});

window.deletePaymentAttachment = async (id, path) => {
  if (!confirm('Excluir este anexo?')) return;
  await sb.storage.from('documents').remove([path]);
  await sb.from('documents').delete().eq('id', id);
  await loadPaymentAttachments();
};

// ============================================================
// RECEBIMENTOS (cliente -> Pro Cooler)
// ============================================================
async function loadReceivables() {
  const { data, error } = await sb.from('receivables').select('*, projects(name)').order('due_date');
  if (error) { toast(error.message); return; }
  cache.receivables = data;
  $('receivables-table').innerHTML = data.map(r => `
    <tr>
      <td>${r.projects?.name || ''}</td><td class="num">${brl(r.amount)}</td>
      <td>${r.due_date || ''}</td><td>${r.paid_date || ''}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="list-actions">
        <button class="secondary" onclick="editReceivable('${r.id}')">Editar</button>
        <button class="secondary" onclick="openReceivableAttachments('${r.id}')">Anexos</button>
        <button class="danger" onclick="deleteRow('receivables', '${r.id}', loadReceivables)">Excluir</button>
      </td>
    </tr>`).join('');
  await loadDashboard();
}

$('new-receivable-btn').addEventListener('click', () => {
  $('receivable-id').value = ''; $('receivable-amount').value = '';
  $('receivable-due').value = ''; $('receivable-paid').value = ''; $('receivable-status').value = 'previsto';
  $('receivable-method').value = '';
  $('receivable-form').classList.remove('hidden');
});
$('cancel-receivable-btn').addEventListener('click', () => $('receivable-form').classList.add('hidden'));

window.editReceivable = (id) => {
  const r = cache.receivables.find(x => x.id === id);
  $('receivable-id').value = r.id;
  $('receivable-project').value = r.project_id;
  $('receivable-amount').value = r.amount;
  $('receivable-due').value = r.due_date || '';
  $('receivable-paid').value = r.paid_date || '';
  $('receivable-status').value = r.status;
  $('receivable-method').value = r.method || '';
  $('receivable-form').classList.remove('hidden');
};

$('save-receivable-btn').addEventListener('click', async () => {
  const id = $('receivable-id').value;
  const payload = {
    project_id: $('receivable-project').value,
    amount: Number($('receivable-amount').value) || 0,
    due_date: $('receivable-due').value || null,
    paid_date: $('receivable-paid').value || null,
    status: $('receivable-status').value,
    method: $('receivable-method').value.trim()
  };
  if (!payload.project_id || !payload.amount) { toast('Informe projeto e valor'); return; }
  const q = id ? sb.from('receivables').update(payload).eq('id', id) : sb.from('receivables').insert(payload);
  const { error } = await q;
  if (error) { toast(error.message); return; }
  $('receivable-form').classList.add('hidden');
  await loadReceivables();
  toast('Recebimento salvo');
});

// ---------- Anexos de um recebimento (comprovante do cliente etc.) ----------
let currentAttachReceivableId = null;

window.openReceivableAttachments = async (receivableId) => {
  currentAttachReceivableId = receivableId;
  const receivable = cache.receivables.find(r => r.id === receivableId);
  $('receivable-attach-panel-title').textContent = `Anexos — recebimento de ${brl(receivable.amount)}`;
  $('receivable-form').classList.add('hidden');
  $('receivable-attach-panel').classList.remove('hidden');
  $('receivable-attach-file').value = '';
  await loadReceivableAttachments();
};

$('close-receivable-attach-panel').addEventListener('click', () => {
  $('receivable-attach-panel').classList.add('hidden');
  currentAttachReceivableId = null;
});

async function loadReceivableAttachments() {
  const { data, error } = await sb.from('documents').select('*').eq('receivable_id', currentAttachReceivableId).order('uploaded_at', { ascending: false });
  if (error) { toast(error.message); return; }
  $('receivable-attach-table').innerHTML = data.map(d => {
    const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
    return `<tr><td><a href="${pub.publicUrl}" target="_blank">${d.file_name}</a></td><td class="muted">${d.visible_to_client ? 'Visível ao cliente' : 'Interno'}</td>
      <td class="list-actions"><button class="danger" onclick="deleteReceivableAttachment('${d.id}', '${d.storage_path}')">Excluir</button></td></tr>`;
  }).join('') || '<tr><td class="muted">Nenhum anexo ainda.</td></tr>';
}

$('receivable-attach-upload-btn').addEventListener('click', async () => {
  const file = $('receivable-attach-file').files[0];
  if (!file) { toast('Selecione um arquivo'); return; }
  const receivable = cache.receivables.find(r => r.id === currentAttachReceivableId);
  const path = `${receivable.project_id}/${Date.now()}-${file.name}`;
  const { error: upErr } = await sb.storage.from('documents').upload(path, file);
  if (upErr) { toast(upErr.message); return; }
  const { error } = await sb.from('documents').insert({
    project_id: receivable.project_id,
    receivable_id: currentAttachReceivableId,
    category: 'comprovante',
    file_name: file.name,
    storage_path: path,
    visible_to_client: $('receivable-attach-visible').value === 'true'
  });
  if (error) { toast(error.message); return; }
  $('receivable-attach-file').value = '';
  await loadReceivableAttachments();
  toast('Anexo enviado');
});

window.deleteReceivableAttachment = async (id, path) => {
  if (!confirm('Excluir este anexo?')) return;
  await sb.storage.from('documents').remove([path]);
  await sb.from('documents').delete().eq('id', id);
  await loadReceivableAttachments();
};

// ============================================================
// ETAPAS DE PRODUÇÃO
// ============================================================
async function loadStages() {
  const { data, error } = await sb.from('project_stages').select('*, projects(name)').order('sequence');
  if (error) { toast(error.message); return; }
  cache.stages = data;
  $('stages-table').innerHTML = data.map(s => `
    <tr>
      <td class="num">${s.sequence}</td>
      <td>${s.projects?.name || ''}</td><td>${s.name}</td>
      <td>${s.start_date || '-'}</td><td>${s.due_date || '-'}</td><td>${s.end_date || '-'}</td>
      <td>${statusBadge(s.status)}</td>
      <td>${s.billable_to_client ? 'Sim' : 'Não'}</td>
      <td class="num">${s.billable_to_client ? brl(s.cost) : '-'}</td>
      <td class="list-actions">
        <button class="secondary" onclick="editStage('${s.id}')">Editar</button>
        <button class="danger" onclick="deleteRow('project_stages', '${s.id}', loadStages)">Excluir</button>
      </td>
    </tr>`).join('');
}

$('new-stage-btn').addEventListener('click', () => {
  $('stage-id').value = ''; $('stage-name').value = ''; $('stage-sequence').value = '0';
  $('stage-status').value = 'iniciada'; $('stage-billable').checked = false;
  $('stage-start-date').value = ''; $('stage-due-date').value = ''; $('stage-end-date').value = '';
  $('stage-cost').value = ''; $('stage-payment-terms').value = ''; $('stage-notes').value = '';
  $('stage-form').classList.remove('hidden');
});
$('cancel-stage-btn').addEventListener('click', () => $('stage-form').classList.add('hidden'));

window.editStage = (id) => {
  const s = cache.stages.find(x => x.id === id);
  $('stage-id').value = s.id;
  $('stage-project').value = s.project_id;
  $('stage-name').value = s.name;
  $('stage-sequence').value = s.sequence;
  $('stage-status').value = s.status;
  $('stage-billable').checked = s.billable_to_client;
  $('stage-start-date').value = s.start_date || '';
  $('stage-due-date').value = s.due_date || '';
  $('stage-end-date').value = s.end_date || '';
  $('stage-cost').value = s.cost || '';
  $('stage-payment-terms').value = s.payment_terms || '';
  $('stage-notes').value = s.notes || '';
  $('stage-form').classList.remove('hidden');
};

$('save-stage-btn').addEventListener('click', async () => {
  const id = $('stage-id').value;
  const billable = $('stage-billable').checked;
  const payload = {
    project_id: $('stage-project').value,
    name: $('stage-name').value.trim(),
    sequence: Number($('stage-sequence').value) || 0,
    status: $('stage-status').value,
    start_date: $('stage-start-date').value || null,
    due_date: $('stage-due-date').value || null,
    end_date: $('stage-end-date').value || null,
    billable_to_client: billable,
    cost: billable ? (Number($('stage-cost').value) || 0) : null,
    payment_terms: billable ? ($('stage-payment-terms').value.trim() || null) : null,
    notes: $('stage-notes').value.trim() || null
  };
  if (!payload.project_id || !payload.name) { toast('Informe projeto e nome da etapa'); return; }
  const q = id ? sb.from('project_stages').update(payload).eq('id', id) : sb.from('project_stages').insert(payload);
  const { error } = await q;
  if (error) { toast(error.message); return; }
  $('stage-form').classList.add('hidden');
  await loadStages();
  toast('Etapa salva');
});

// ============================================================
// DOCUMENTOS
// ============================================================
async function loadDocuments() {
  const { data, error } = await sb.from('documents').select('*, projects(name)').order('uploaded_at', { ascending: false });
  if (error) { toast(error.message); return; }
  cache.documents = data;
  $('documents-table').innerHTML = data.map(d => {
    const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
    return `<tr>
      <td><a href="${pub.publicUrl}" target="_blank">${d.file_name}</a></td>
      <td>${d.projects?.name || ''}</td><td>${d.category}</td><td>${d.visible_to_client ? 'Sim' : 'Não'}</td>
      <td class="list-actions"><button class="danger" onclick="deleteDocument('${d.id}', '${d.storage_path}')">Excluir</button></td>
    </tr>`;
  }).join('');
}

$('upload-document-btn').addEventListener('click', async () => {
  const projectId = $('document-project').value;
  const file = $('document-file').files[0];
  if (!projectId || !file) { toast('Selecione projeto e arquivo'); return; }
  const path = `${projectId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await sb.storage.from('documents').upload(path, file);
  if (upErr) { toast(upErr.message); return; }
  const { error } = await sb.from('documents').insert({
    project_id: projectId,
    category: $('document-category').value,
    file_name: file.name,
    storage_path: path,
    visible_to_client: $('document-visible').value === 'true'
  });
  if (error) { toast(error.message); return; }
  $('document-file').value = '';
  await loadDocuments();
  toast('Documento enviado');
});

window.deleteDocument = async (id, path) => {
  if (!confirm('Excluir este documento?')) return;
  await sb.storage.from('documents').remove([path]);
  await sb.from('documents').delete().eq('id', id);
  await loadDocuments();
};

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const active = cache.projects.filter(p => !['concluido', 'cancelado'].includes(p.status));
  $('kpi-active-projects').textContent = active.length;

  const savings = (cache.purchases || []).reduce((s, p) => s + ((Number(p.budgeted_cost) || 0) - (Number(p.actual_cost) || 0)), 0);
  $('kpi-savings').textContent = brl(savings);

  const openPayments = (cache.payments || []).filter(p => p.status === 'previsto' || p.status === 'atrasado')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  $('kpi-open-payments').textContent = brl(openPayments);

  const openReceivables = (cache.receivables || []).filter(r => r.status === 'previsto' || r.status === 'atrasado')
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  $('kpi-open-receivables').textContent = brl(openReceivables);

  $('dashboard-projects').innerHTML = cache.projects.slice(0, 8).map(p => `
    <tr><td>${p.name}</td><td>${p.clients?.name || ''}</td><td>${statusBadge(p.status)}</td><td>${statusBadge(p.nf_status)}</td></tr>
  `).join('');
}

// ---------- Excluir genérico ----------
window.deleteRow = async (table, id, reload) => {
  if (!confirm('Tem certeza que deseja excluir?')) return;
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) { toast(error.message); return; }
  await reload();
};

// ---------- Inicialização ----------
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await boot();
})();
