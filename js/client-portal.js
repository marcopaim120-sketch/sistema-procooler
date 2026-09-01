const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const statusLabel = {
  orcamento: 'Orçamento', aprovado: 'Aprovado', em_producao: 'Em produção',
  em_instalacao: 'Em instalação', concluido: 'Concluído', cancelado: 'Cancelado',
  pendente: 'Pendente', emitida: 'Emitida', nao_aplicavel: 'Não se aplica',
  a_cotar: 'A cotar', cotado: 'Cotado', preparacao: 'Em preparação', andamento: 'Em andamento', realizado: 'Realizado',
  previsto: 'Previsto', pago: 'Pago', atrasado: 'Atrasado'
};

let portalToken = null;

(async () => {
  portalToken = new URLSearchParams(location.search).get('token');
  if (!portalToken) return showNotFound();
  document.getElementById('password-gate').classList.remove('hidden');
  document.getElementById('portal-password').focus();
})();

document.getElementById('portal-password-btn').addEventListener('click', submitPortalPassword);
document.getElementById('portal-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitPortalPassword();
});

async function submitPortalPassword() {
  const password = document.getElementById('portal-password').value;
  const errorEl = document.getElementById('portal-password-error');
  errorEl.textContent = '';
  if (!password) { errorEl.textContent = 'Digite a senha.'; return; }

  const { data, error } = await sb.rpc('get_project_public', { p_token: portalToken, p_password: password });
  if (error) { errorEl.textContent = 'Erro ao verificar a senha. Tente novamente.'; return; }
  if (!data || data.error === 'invalid_token') return showNotFound();
  if (data.error === 'invalid_password') { errorEl.textContent = 'Senha incorreta.'; return; }

  document.getElementById('password-gate').classList.add('hidden');
  render(data);
}

function showNotFound() {
  document.getElementById('password-gate').classList.add('hidden');
  document.getElementById('not-found').classList.remove('hidden');
}

function render(data) {
  document.getElementById('content').classList.remove('hidden');
  const { project, proposal, purchases, payments, receivables, stages, documents } = data;

  document.getElementById('project-title').textContent = project.name;
  document.getElementById('project-subtitle').textContent = `Cliente: ${project.client_name}`;
  document.getElementById('status-badge').innerHTML = `<span class="badge blue">${statusLabel[project.status] || project.status}</span>`;
  document.getElementById('nf-badge').innerHTML = `<span class="badge ${project.nf_status === 'emitida' ? 'green' : 'amber'}">${statusLabel[project.nf_status] || project.nf_status}${project.nf_number ? ' — ' + project.nf_number : ''}</span>`;

  // Proposta
  let material = 0;
  if (proposal) {
    document.getElementById('proposal-items').innerHTML = (proposal.items || []).map(i => {
      const total = (Number(i.quantity) || 0) * (Number(i.estimated_unit_cost) || 0);
      material += total;
      return `<tr><td>${i.description}</td><td>${i.unit}</td><td>${i.quantity}</td><td>${brl(i.estimated_unit_cost)}</td><td>${brl(total)}</td></tr>`;
    }).join('');
    const labor = Number(proposal.labor_cost) || 0;
    const proposalTotal = material + labor - (Number(proposal.discount) || 0);
    document.getElementById('material-total').textContent = brl(material);
    document.getElementById('labor-total').textContent = brl(labor);
    document.getElementById('proposal-total').textContent = brl(proposalTotal);
    document.getElementById('compare-new-model').textContent = brl(proposalTotal);

    if (proposal.old_model_price) {
      document.getElementById('compare-old-model-row').classList.remove('hidden');
      document.getElementById('compare-old-model').textContent = brl(proposal.old_model_price);
    }

    if (proposal.competitors && proposal.competitors.length) {
      document.getElementById('competitors-box').classList.remove('hidden');
      document.getElementById('competitors-list').innerHTML = proposal.competitors.map(c => `<tr><td>${c.name}</td><td>${brl(c.price)}</td></tr>`).join('');
    }
  }

  // Etapas de produção
  document.getElementById('stages-list').innerHTML = (stages || []).map(s => `
    <tr><td>${s.name}</td><td><span class="badge">${statusLabel[s.status] || s.status}</span></td><td>${s.billable_to_client ? brl(s.cost) : '-'}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhuma etapa registrada ainda.</td></tr>';

  // Compras / economia
  const budgeted = (purchases || []).reduce((s, p) => s + (Number(p.budgeted_cost) || 0), 0);
  const actual = (purchases || []).reduce((s, p) => s + (Number(p.actual_cost) || 0), 0);
  const savings = budgeted - actual;
  document.getElementById('savings-amount').textContent = brl(savings > 0 ? savings : 0);
  document.getElementById('savings-explain').textContent = budgeted
    ? `Orçado: ${brl(budgeted)} · Realizado: ${brl(actual)}`
    : 'Ainda não há compras registradas neste projeto.';

  const commissionPct = proposal ? (Number(proposal.commission_pct) || 0) : 0;
  if (savings > 0 && commissionPct) {
    document.getElementById('commission-explain').textContent =
      `Nossa taxa de assessoria sobre essa economia: ${commissionPct}% = ${brl(savings * commissionPct / 100)}`;
  }

  const total = (purchases || []).length;
  const done = (purchases || []).filter(p => p.status === 'realizado').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('purchase-progress').style.width = pct + '%';
  document.getElementById('purchase-progress-label').textContent = total ? `${done} de ${total} itens comprados (${pct}%)` : 'Nenhuma compra registrada ainda.';
  document.getElementById('purchases-list').innerHTML = (purchases || []).map(p => `
    <tr><td>${p.description}</td><td>${brl(p.budgeted_cost)}</td><td>${brl(p.actual_cost)}</td>
      <td>${p.data_prevista_cotacao || '-'}</td><td>${p.closing_date || '-'}</td>
      <td>${p.data_prevista_compra || '-'}</td><td>${p.forma_pagamento || '-'}</td>
      <td><span class="badge">${statusLabel[p.status] || p.status}</span></td></tr>
  `).join('') || '<tr><td class="muted">Nenhuma compra registrada ainda.</td></tr>';

  // Pagamentos (cliente -> fornecedor)
  document.getElementById('payments-list').innerHTML = (payments || []).map(p => `
    <tr><td>${p.supplier_name || '-'}</td><td>${brl(p.amount)}</td><td>${p.method || '-'}</td><td>${p.due_date || '-'}</td><td>${p.paid_date || '-'}</td><td><span class="badge ${p.status === 'pago' ? 'green' : p.status === 'atrasado' ? 'red' : 'blue'}">${statusLabel[p.status] || p.status}</span></td></tr>
  `).join('') || '<tr><td class="muted">Nenhum pagamento programado ainda.</td></tr>';
  renderMonthlySummary('payments-monthly-list', payments || []);

  // Recebimentos (cliente -> Pro Cooler)
  document.getElementById('receivables-list').innerHTML = (receivables || []).map(r => `
    <tr><td>${brl(r.amount)}</td><td>${r.due_date || '-'}</td><td>${r.paid_date || '-'}</td><td><span class="badge ${r.status === 'pago' ? 'green' : r.status === 'atrasado' ? 'red' : 'blue'}">${statusLabel[r.status] || r.status}</span></td></tr>
  `).join('') || '<tr><td class="muted">Nenhum recebimento programado ainda.</td></tr>';

  // Documentos
  document.getElementById('documents-list').innerHTML = (documents || []).map(d => {
    const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
    return `<tr><td><a href="${pub.publicUrl}" target="_blank">${d.file_name}</a></td><td class="muted">${d.category}</td></tr>`;
  }).join('') || '<tr><td class="muted">Nenhum documento disponível ainda.</td></tr>';
}

const monthNames = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function renderMonthlySummary(containerId, rows) {
  const withDate = (rows || []).filter(r => r.due_date);
  const byMonth = {};
  withDate.forEach(r => {
    const key = r.due_date.slice(0, 7); // YYYY-MM
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
  document.getElementById(containerId).innerHTML = html || '<tr><td class="muted">Sem valores com data definida ainda.</td></tr>';
}
