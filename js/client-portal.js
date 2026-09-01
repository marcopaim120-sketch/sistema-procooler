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
  const { project, proposal, purchases, payments, documents } = data;

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
    document.getElementById('material-total').textContent = brl(material);
    document.getElementById('labor-total').textContent = brl(labor);
    document.getElementById('proposal-total').textContent = brl(material + labor - (Number(proposal.discount) || 0));

    if (proposal.competitors && proposal.competitors.length) {
      document.getElementById('competitors-box').classList.remove('hidden');
      document.getElementById('competitors-list').innerHTML = proposal.competitors.map(c => `<tr><td>${c.name}</td><td>${brl(c.price)}</td></tr>`).join('');
    }
  }

  // Compras / economia
  const budgeted = (purchases || []).reduce((s, p) => s + (Number(p.budgeted_cost) || 0), 0);
  const actual = (purchases || []).reduce((s, p) => s + (Number(p.actual_cost) || 0), 0);
  const savings = budgeted - actual;
  document.getElementById('savings-amount').textContent = brl(savings > 0 ? savings : 0);
  document.getElementById('savings-explain').textContent = budgeted
    ? `Orçado: ${brl(budgeted)} · Realizado: ${brl(actual)}`
    : 'Ainda não há compras registradas neste projeto.';

  const total = (purchases || []).length;
  const done = (purchases || []).filter(p => p.status === 'realizado').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('purchase-progress').style.width = pct + '%';
  document.getElementById('purchase-progress-label').textContent = total ? `${done} de ${total} itens comprados (${pct}%)` : 'Nenhuma compra registrada ainda.';
  document.getElementById('purchases-list').innerHTML = (purchases || []).map(p => `
    <tr><td>${p.description}</td><td>${brl(p.budgeted_cost)}</td><td>${brl(p.actual_cost)}</td><td><span class="badge">${statusLabel[p.status] || p.status}</span></td></tr>
  `).join('') || '<tr><td class="muted">Nenhuma compra registrada ainda.</td></tr>';

  // Pagamentos
  document.getElementById('payments-list').innerHTML = (payments || []).map(p => `
    <tr><td>${brl(p.amount)}</td><td>${p.due_date || '-'}</td><td>${p.paid_date || '-'}</td><td><span class="badge ${p.status === 'pago' ? 'green' : p.status === 'atrasado' ? 'red' : 'blue'}">${statusLabel[p.status] || p.status}</span></td></tr>
  `).join('') || '<tr><td class="muted">Nenhum pagamento programado ainda.</td></tr>';

  // Documentos
  document.getElementById('documents-list').innerHTML = (documents || []).map(d => {
    const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
    return `<tr><td><a href="${pub.publicUrl}" target="_blank">${d.file_name}</a></td><td class="muted">${d.category}</td></tr>`;
  }).join('') || '<tr><td class="muted">Nenhum documento disponível ainda.</td></tr>';
}
