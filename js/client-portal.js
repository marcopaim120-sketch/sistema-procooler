const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function renderDocLinks(docs) {
  if (!docs || !docs.length) return '-';
  return docs.map(d => {
    const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
    return `<a href="${pub.publicUrl}" target="_blank">${d.file_name}</a>`;
  }).join('<br>');
}

const statusLabel = {
  orcamento: 'Orçamento', aprovado: 'Aprovado', em_producao: 'Em produção',
  em_instalacao: 'Em instalação', concluido: 'Concluído', cancelado: 'Cancelado',
  pendente: 'Pendente', emitida: 'Emitida', nao_aplicavel: 'Não se aplica',
  a_cotar: 'A cotar', cotado: 'Cotado', preparacao: 'Em preparação', andamento: 'Em andamento', realizado: 'Realizado',
  previsto: 'Previsto', pago: 'Pago', atrasado: 'Atrasado',
  iniciada: 'Iniciada', concluida: 'Concluída',
  aguardando_proposta: 'Aguardando proposta', recebida: 'Recebida', em_analise: 'Em análise', escolhida: 'Escolhida', recusada: 'Recusada'
};

let portalToken = null;

(async () => {
  const params = new URLSearchParams(location.search);
  const previewProjectId = params.get('preview');

  if (previewProjectId) {
    const { data, error } = await sb.rpc('get_project_public_by_id', { p_project_id: previewProjectId });
    if (error || !data || data.error) return showNotFound();
    showPreviewBanner();
    return render(data);
  }

  portalToken = params.get('token');
  if (!portalToken) return showNotFound();
  document.getElementById('password-gate').classList.remove('hidden');
  document.getElementById('portal-password').focus();
})();

function showPreviewBanner() {
  const banner = document.createElement('div');
  banner.style.cssText = 'background:#fff3bf;color:#664d03;text-align:center;padding:10px;font-weight:600;display:flex;justify-content:center;align-items:center;gap:16px;flex-wrap:wrap';

  const text = document.createElement('span');
  text.textContent = '👁 Modo pré-visualização (equipe) — é exatamente isso que o cliente vê. Nada aqui é salvo.';

  const backBtn = document.createElement('button');
  backBtn.textContent = '← Sair da pré-visualização';
  backBtn.style.cssText = 'background:#664d03;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer';
  backBtn.addEventListener('click', () => {
    if (window.opener) { window.close(); }
    else { location.href = location.pathname.replace('client-portal.html', 'index.html'); }
  });

  banner.append(text, backBtn);
  document.body.prepend(banner);

  const footerBtn = backBtn.cloneNode(true);
  footerBtn.addEventListener('click', () => {
    if (window.opener) { window.close(); }
    else { location.href = location.pathname.replace('client-portal.html', 'index.html'); }
  });
  const footerWrap = document.createElement('div');
  footerWrap.style.cssText = 'text-align:center;padding:24px';
  footerWrap.appendChild(footerBtn);
  document.querySelector('.main').appendChild(footerWrap);
}

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
  const { project, proposal, purchases, payments, receivables, stages, purchase_quotes, outsourced_services, service_quotes, documents } = data;

  document.getElementById('project-title').textContent = project.name;
  document.getElementById('project-subtitle').textContent = `Cliente: ${project.client_name}`;
  document.getElementById('status-badge').innerHTML = `<span class="badge blue">${statusLabel[project.status] || project.status}</span>`;
  document.getElementById('nf-badge').innerHTML = `<span class="badge ${project.nf_status === 'emitida' ? 'green' : 'amber'}">${statusLabel[project.nf_status] || project.nf_status}${project.nf_number ? ' — ' + project.nf_number : ''}</span>`;

  // Proposta (só os totais aqui — o detalhamento item a item vai como anexo em Documentos)
  let material = 0;
  if (proposal) {
    (proposal.items || []).forEach(i => {
      material += (Number(i.quantity) || 0) * (Number(i.estimated_unit_cost) || 0);
    });
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

  // Serviços terceirizados
  document.getElementById('services-list').innerHTML = (outsourced_services || []).map(s => `
    <tr><td>${s.name}</td><td>${s.billable_to_client ? brl(s.budgeted_cost) : '-'}</td><td>${s.billable_to_client ? brl(s.actual_cost) : '-'}</td>
      <td>${s.data_prevista_conclusao || '-'}</td><td>${s.completion_date || '-'}</td>
      <td><span class="badge">${statusLabel[s.status] || s.status}</span></td><td>${renderDocLinks(s.documents)}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhum serviço terceirizado registrado ainda.</td></tr>';

  document.getElementById('service-quotes-list').innerHTML = (service_quotes || []).map(q => `
    <tr><td>${q.service_name}</td><td>${q.supplier_name || '-'}</td><td>${brl(q.price)}</td><td>${brl(q.down_payment)}</td>
      <td>${q.installments || '-'}</td><td>${q.completion_date || '-'}</td><td><span class="badge">${statusLabel[q.status] || q.status}</span></td>
      <td>${renderDocLinks(q.documents)}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhuma cotação de serviço registrada ainda.</td></tr>';

  // Etapas de produção
  document.getElementById('stages-list').innerHTML = (stages || []).map(s => `
    <tr><td>${s.name}</td><td>${s.start_date || '-'}</td><td>${s.due_date || '-'}</td><td>${s.end_date || '-'}</td>
      <td><span class="badge">${statusLabel[s.status] || s.status}</span></td><td>${s.billable_to_client ? brl(s.cost) : '-'}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhuma etapa registrada ainda.</td></tr>';

  // Cotações de fornecedores comparadas
  document.getElementById('quotes-list').innerHTML = (purchase_quotes || []).map(q => `
    <tr><td>${q.purchase_description}</td><td>${q.supplier_name || '-'}</td><td>${brl(q.price)}</td><td>${brl(q.down_payment)}</td>
      <td>${q.installments || '-'}</td><td>${q.delivery_date || '-'}</td><td><span class="badge">${statusLabel[q.status] || q.status}</span></td>
      <td>${renderDocLinks(q.documents)}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhuma cotação registrada ainda.</td></tr>';

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
      <td><span class="badge">${statusLabel[p.status] || p.status}</span></td><td>${renderDocLinks(p.documents)}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhuma compra registrada ainda.</td></tr>';

  // Pagamentos (cliente -> fornecedor)
  document.getElementById('payments-list').innerHTML = (payments || []).map(p => `
    <tr><td>${p.supplier_name || '-'}</td><td>${brl(p.amount)}</td><td>${p.method || '-'}</td><td>${p.due_date || '-'}</td><td>${p.paid_date || '-'}</td><td><span class="badge ${p.status === 'pago' ? 'green' : p.status === 'atrasado' ? 'red' : 'blue'}">${statusLabel[p.status] || p.status}</span></td>
      <td>${renderDocLinks(p.documents)}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhum pagamento programado ainda.</td></tr>';
  renderMonthlySummary('payments-monthly-list', payments || []);

  // Recebimentos (cliente -> Pro Cooler)
  document.getElementById('receivables-list').innerHTML = (receivables || []).map(r => `
    <tr><td>${brl(r.amount)}</td><td>${r.due_date || '-'}</td><td>${r.paid_date || '-'}</td><td><span class="badge ${r.status === 'pago' ? 'green' : r.status === 'atrasado' ? 'red' : 'blue'}">${statusLabel[r.status] || r.status}</span></td>
      <td>${renderDocLinks(r.documents)}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhum recebimento programado ainda.</td></tr>';

  // Documentos, agrupados por categoria (planta baixa/projeto técnico por último)
  const categoryLabel = {
    proposta: 'Propostas', contrato: 'Contratos', nf: 'Notas fiscais',
    comprovante: 'Comprovantes e anexos de fornecedores/terceiros',
    projeto_tecnico: 'Planta baixa / projeto técnico', outro: 'Outros'
  };
  const categoryOrder = ['proposta', 'contrato', 'comprovante', 'nf', 'outro', 'projeto_tecnico'];
  const container = document.getElementById('documents-by-category');
  const groups = {};
  (documents || []).forEach(d => { (groups[d.category] = groups[d.category] || []).push(d); });
  const usedCategories = categoryOrder.filter(c => groups[c] && groups[c].length);
  container.innerHTML = usedCategories.length ? usedCategories.map(cat => `
    <h4>${categoryLabel[cat] || cat}</h4>
    <table><tbody>
      ${groups[cat].map(d => {
        const { data: pub } = sb.storage.from('documents').getPublicUrl(d.storage_path);
        return `<tr><td><a href="${pub.publicUrl}" target="_blank">${d.file_name}</a></td></tr>`;
      }).join('')}
    </tbody></table>
  `).join('') : '<p class="muted">Nenhum documento disponível ainda.</p>';
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
