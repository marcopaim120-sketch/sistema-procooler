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
    emitida: 'green', nao_aplicavel: 'blue'
  };
  return `<span class="badge ${map[status] || ''}">${status.replace('_', ' ')}</span>`;
}

// Cache em memória para preencher selects sem refazer query toda hora
let cache = { clients: [], suppliers: [], projects: [], proposalItems: [] };

// ---------- Autenticação ----------
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
  await loadPayments();
  await loadDocuments();
  await loadDashboard();
  fillProjectSelects();
}

function fillProjectSelects() {
  const opts = cache.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  ['purchase-project', 'payment-project', 'document-project'].forEach(id => {
    $(id).innerHTML = `<option value="">-</option>` + opts;
  });
  $('project-client').innerHTML = cache.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  $('purchase-supplier').innerHTML = `<option value="">-</option>` + cache.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
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
  $('suppliers-table').innerHTML = data.map(s => `
    <tr>
      <td>${s.name}</td><td>${s.contact || ''}</td>
      <td class="list-actions">
        <button class="secondary" onclick="editSupplier('${s.id}')">Editar</button>
        <button class="danger" onclick="deleteRow('suppliers', '${s.id}', loadSuppliers)">Excluir</button>
      </td>
    </tr>`).join('');
}

$('new-supplier-btn').addEventListener('click', () => {
  $('supplier-id').value = ''; $('supplier-name').value = ''; $('supplier-contact').value = ''; $('supplier-notes').value = '';
  $('supplier-form').classList.remove('hidden');
});
$('cancel-supplier-btn').addEventListener('click', () => $('supplier-form').classList.add('hidden'));

window.editSupplier = (id) => {
  const s = cache.suppliers.find(x => x.id === id);
  $('supplier-id').value = s.id; $('supplier-name').value = s.name;
  $('supplier-contact').value = s.contact || ''; $('supplier-notes').value = s.notes || '';
  $('supplier-form').classList.remove('hidden');
};

$('save-supplier-btn').addEventListener('click', async () => {
  const id = $('supplier-id').value;
  const payload = {
    name: $('supplier-name').value.trim(),
    contact: $('supplier-contact').value.trim(),
    notes: $('supplier-notes').value.trim()
  };
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
        <button class="danger" onclick="deleteRow('projects', '${p.id}', loadProjects)">Excluir</button>
      </td>
    </tr>`).join('');
}

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
  $('total-material').textContent = brl(material);
  $('total-labor').textContent = brl(labor);
  $('total-proposal').textContent = brl(material + labor - (Number($('proposal-discount').value) || 0));
}
$('proposal-labor').addEventListener('input', updateProposalTotals);
$('proposal-discount').addEventListener('input', updateProposalTotals);

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
// COMPRAS
// ============================================================
async function loadPurchases() {
  const { data, error } = await sb.from('purchases').select('*, projects(name), suppliers(name)').order('created_at', { ascending: false });
  if (error) { toast(error.message); return; }
  cache.purchases = data;
  $('purchases-table').innerHTML = data.map(p => {
    const savings = (Number(p.budgeted_cost) || 0) - (Number(p.actual_cost) || 0);
    return `<tr>
      <td>${p.projects?.name || ''}</td><td>${p.description}</td><td>${p.suppliers?.name || ''}</td>
      <td class="num">${brl(p.budgeted_cost)}</td><td class="num">${brl(p.actual_cost)}</td>
      <td class="num" style="color:${savings >= 0 ? 'var(--success)' : 'var(--danger)'}">${brl(savings)}</td>
      <td>${p.data_prevista_compra || '-'}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="list-actions">
        <button class="secondary" onclick="editPurchase('${p.id}')">Editar</button>
        <button class="danger" onclick="deleteRow('purchases', '${p.id}', loadPurchases)">Excluir</button>
      </td>
    </tr>`;
  }).join('');
  await loadDashboard();
}

$('new-purchase-btn').addEventListener('click', () => {
  $('purchase-id').value = ''; $('purchase-description').value = '';
  $('purchase-budgeted').value = ''; $('purchase-actual').value = '';
  $('purchase-date').value = ''; $('purchase-status').value = 'a_cotar';
  $('purchase-cotacao-date').value = ''; $('purchase-planned-date').value = '';
  $('purchase-payment-terms').value = ''; $('purchase-notes').value = '';
  $('purchase-proposal-item').innerHTML = '<option value="">-</option>';
  $('purchase-form').classList.remove('hidden');
});
$('cancel-purchase-btn').addEventListener('click', () => $('purchase-form').classList.add('hidden'));

$('purchase-project').addEventListener('change', async (e) => {
  const projectId = e.target.value;
  if (!projectId) { $('purchase-proposal-item').innerHTML = '<option value="">-</option>'; return; }
  const { data: props } = await sb.from('proposals').select('id').eq('project_id', projectId).order('version', { ascending: false }).limit(1);
  if (!props.length) { $('purchase-proposal-item').innerHTML = '<option value="">-</option>'; return; }
  const { data: items } = await sb.from('proposal_items').select('*').eq('proposal_id', props[0].id);
  $('purchase-proposal-item').innerHTML = '<option value="">-</option>' + items.map(i => `<option value="${i.id}" data-cost="${i.quantity * i.estimated_unit_cost}">${i.description}</option>`).join('');
});

$('purchase-proposal-item').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (opt && opt.dataset.cost) $('purchase-budgeted').value = Number(opt.dataset.cost).toFixed(2);
});

window.editPurchase = (id) => {
  const p = cache.purchases.find(x => x.id === id);
  $('purchase-id').value = p.id;
  $('purchase-project').value = p.project_id;
  $('purchase-project').dispatchEvent(new Event('change'));
  $('purchase-supplier').value = p.supplier_id || '';
  $('purchase-description').value = p.description;
  $('purchase-budgeted').value = p.budgeted_cost;
  $('purchase-actual').value = p.actual_cost;
  $('purchase-date').value = p.purchase_date || '';
  $('purchase-cotacao-date').value = p.data_prevista_cotacao || '';
  $('purchase-planned-date').value = p.data_prevista_compra || '';
  $('purchase-payment-terms').value = p.forma_pagamento || '';
  $('purchase-notes').value = p.notes || '';
  $('purchase-status').value = p.status;
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
    budgeted_cost: Number($('purchase-budgeted').value) || 0,
    actual_cost: Number($('purchase-actual').value) || 0,
    data_prevista_cotacao: $('purchase-cotacao-date').value || null,
    data_prevista_compra: $('purchase-planned-date').value || null,
    purchase_date: $('purchase-date').value || null,
    forma_pagamento: $('purchase-payment-terms').value.trim() || null,
    notes: $('purchase-notes').value.trim() || null,
    status: $('purchase-status').value
  };
  if (!payload.project_id || !payload.description) { toast('Informe projeto e descrição'); return; }
  const q = id ? sb.from('purchases').update(payload).eq('id', id) : sb.from('purchases').insert(payload);
  const { error } = await q;
  if (error) { toast(error.message); return; }
  $('purchase-form').classList.add('hidden');
  await loadPurchases();
  toast('Compra salva');
});

// ============================================================
// PAGAMENTOS
// ============================================================
async function loadPayments() {
  const { data, error } = await sb.from('payments').select('*, projects(name)').order('due_date');
  if (error) { toast(error.message); return; }
  cache.payments = data;
  $('payments-table').innerHTML = data.map(p => `
    <tr>
      <td>${p.projects?.name || ''}</td><td class="num">${brl(p.amount)}</td>
      <td>${p.due_date || ''}</td><td>${p.paid_date || ''}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="list-actions">
        <button class="secondary" onclick="editPayment('${p.id}')">Editar</button>
        <button class="danger" onclick="deleteRow('payments', '${p.id}', loadPayments)">Excluir</button>
      </td>
    </tr>`).join('');
  await loadDashboard();
}

$('new-payment-btn').addEventListener('click', () => {
  $('payment-id').value = ''; $('payment-amount').value = '';
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
