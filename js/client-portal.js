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

function statusColor(status) {
  const green = ['realizado', 'pago', 'concluida', 'concluido', 'escolhida', 'emitida'];
  const red = ['cancelado', 'recusada', 'atrasado'];
  const blue = ['andamento', 'em_producao', 'em_instalacao', 'aprovado', 'recebida', 'iniciada', 'cotado', 'em_analise'];
  if (green.includes(status)) return 'green';
  if (red.includes(status)) return 'red';
  if (blue.includes(status)) return 'blue';
  return 'amber';
}

let portalToken = null;

// 2026-08-21 -> 21/08/2026 (usa só os números, sem fuso horário)
const fmtD = (v) => {
  if (!v) return '-';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
};

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

  // Seções: só aparece o que o gestor ligou para este projeto (o banco já não envia o resto)
  const sections = data.sections || {};
  document.querySelectorAll('[data-section]').forEach(el => el.classList.toggle('sec-off', !sections[el.dataset.section]));
  document.querySelectorAll('[data-section-any]').forEach(el => el.classList.toggle('sec-off', !el.dataset.sectionAny.split(',').some(k => sections[k])));

  // Planta do projeto (imagem + legenda) e proposta em PDF, no topo
  const planUrl = (d) => sb.storage.from('documents').getPublicUrl(d.storage_path).data.publicUrl;
  const planImgs = data.plan || [];
  document.getElementById('plan-images').innerHTML = planImgs.map(d => `<a href="${planUrl(d)}" target="_blank" rel="noopener" style="display:block;margin-bottom:10px"><img class="plan-img" src="${planUrl(d)}" alt="${d.file_name}" loading="eager"></a>`).join('');
  const propDocs = data.proposal_docs || [];
  document.getElementById('proposal-docs-box').classList.toggle('hidden', !propDocs.length);
  document.getElementById('proposal-docs').innerHTML = propDocs.map((d, i) => `
    <p style="margin:6px 0"><a class="pdf-link" href="${planUrl(d)}" target="_blank" rel="noopener" style="display:inline-block;background:var(--primary,#1e4d8b);color:#fff;text-decoration:none;font-weight:600;padding:8px 14px;border-radius:6px">📄 Abrir / baixar a proposta (PDF)</a> <span class="muted">${d.file_name}</span></p>
    ${i === 0 ? `<iframe class="pdf-frame" src="${planUrl(d)}#view=FitH" title="Proposta"></iframe>` : ''}`).join('');

  document.getElementById('project-title').textContent = project.name;
  document.getElementById('project-subtitle').textContent = `Cliente: ${project.client_name}`;
  document.getElementById('status-badge').innerHTML = `<span class="badge ${statusColor(project.status)}">${statusLabel[project.status] || project.status}</span>`;
  document.getElementById('nf-badge').innerHTML = `<span class="badge ${project.nf_status === 'emitida' ? 'green' : 'amber'}">${statusLabel[project.nf_status] || project.nf_status}${project.nf_number ? ' — ' + project.nf_number : ''}</span>`;

  // Proposta (só os totais aqui — o detalhamento item a item vai como anexo em Documentos)
  if (proposal) {
    const material = Number(proposal.material_total) || 0;
    const labor = Number(proposal.labor_cost) || 0;
    const proposalTotal = Number(proposal.proposal_total) || 0;
    document.getElementById('materials-list').innerHTML = (proposal.items || []).map(i => {
      const q = Number(i.quantity) || 0, u = Number(i.estimated_unit_cost) || 0;
      return `<tr><td>${i.description}</td><td>${i.unit || ''}</td><td>${q}</td><td>${brl(u)}</td><td>${brl(q * u)}</td></tr>`;
    }).join('');
    document.getElementById('material-total').textContent = brl(material);
    document.getElementById('labor-total').textContent = brl(labor);
    document.getElementById('proposal-total').textContent = brl(proposalTotal);

    const oldPrice = Number(proposal.old_model_price) || 0;
    if (oldPrice > 0 && proposalTotal > 0) {
      const diff = oldPrice - proposalTotal;
      const pct = Math.round((diff / oldPrice) * 100);

      if (diff > 0) {
        document.getElementById('savings-hero').classList.remove('hidden');
        document.getElementById('savings-hero-pct').textContent = `${pct}% mais barato`;
      }

      document.getElementById('compare-bars').classList.remove('hidden');
      const oldFill = document.getElementById('bar-old-fill');
      const newFill = document.getElementById('bar-new-fill');
      oldFill.style.width = '100%';
      newFill.style.width = Math.max(Math.round((proposalTotal / oldPrice) * 100), 18) + '%';
      document.getElementById('bar-old-value').textContent = brl(oldPrice);
      document.getElementById('bar-new-value').textContent = brl(proposalTotal);
    }

    if (proposal.competitors && proposal.competitors.length) {
      document.getElementById('competitors-box').classList.remove('hidden');
      document.getElementById('competitors-list').innerHTML = proposal.competitors.map(c => `<tr><td>${c.name}</td><td>${brl(c.price)}</td></tr>`).join('');
    }
  }

  // Serviços terceirizados
  document.getElementById('services-list').innerHTML = (outsourced_services || []).map(s => `
    <tr><td>${s.name}</td><td>${s.billable_to_client ? brl(s.budgeted_cost) : '-'}</td><td>${s.billable_to_client ? brl(s.actual_cost) : '-'}</td>
      <td>${fmtD(s.data_prevista_conclusao)}</td><td>${fmtD(s.completion_date)}</td>
      <td><span class="badge ${statusColor(s.status)}">${statusLabel[s.status] || s.status}</span></td><td>${renderDocLinks(s.documents)}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhum serviço terceirizado registrado ainda.</td></tr>';

  document.getElementById('service-quotes-list').innerHTML = (service_quotes || []).map(q => `
    <tr><td>${q.service_name}</td><td>${q.supplier_name || '-'}</td><td>${brl(q.price)}</td><td>${brl(q.down_payment)}</td>
      <td>${q.installments || '-'}</td><td>${fmtD(q.completion_date)}</td><td><span class="badge ${statusColor(q.status)}">${statusLabel[q.status] || q.status}</span></td>
      <td>${renderDocLinks(q.documents)}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhuma cotação de serviço registrada ainda.</td></tr>';

  // Etapas de produção (agrupadas; só as marcadas como visíveis ao cliente já vêm filtradas pelo banco)
  document.getElementById('stages-list').innerHTML = (stages || []).map(s => `
    <tr><td>${s.group_name}</td><td>${s.group_seq}.${s.seq}</td><td>${s.name}</td>
      <td>${fmtD(s.start_date)}</td><td>${fmtD(s.due_date)}</td>
      <td>${fmtD(s.end_date)}${s.received_ok ? ' ✓' : ''}</td>
      <td><span class="badge ${statusColor(s.status)}">${statusLabel[s.status] || s.status}</span></td></tr>
  `).join('') || '<tr><td class="muted" colspan="7">Nenhuma etapa registrada ainda.</td></tr>';

  // Cotações de fornecedores comparadas
  document.getElementById('quotes-list').innerHTML = (purchase_quotes || []).map(q => `
    <tr><td>${q.purchase_description}</td><td>${q.supplier_name || '-'}</td><td>${brl(q.price)}</td><td>${brl(q.down_payment)}</td>
      <td>${q.installments || '-'}</td><td>${fmtD(q.delivery_date)}</td><td><span class="badge ${statusColor(q.status)}">${statusLabel[q.status] || q.status}</span></td>
      <td>${renderDocLinks(q.documents)}</td></tr>
  `).join('') || '<tr><td class="muted">Nenhuma cotação registrada ainda.</td></tr>';

  // Compras / economia
  // Economia comprovada: estimado da proposta x gasto, por material (só os já comprados)
  const ecoItems = (data.economy && data.economy.items) || [];
  const doneItems = ecoItems.filter(i => i.done);
  const estDone = doneItems.reduce((s, i) => s + (Number(i.estimated) || 0), 0);
  const spentDone = doneItems.reduce((s, i) => s + (Number(i.spent) || 0), 0);
  const savings = estDone - spentDone;
  document.getElementById('savings-amount').textContent = brl(savings > 0 ? savings : 0);
  document.getElementById('savings-explain').textContent = doneItems.length
    ? `Estimamos ${brl(estDone)} para os materiais com compra concluída e, até o momento, gastamos ${brl(spentDone)}.`
    : (ecoItems.length
      ? 'Os materiais comprados ainda estão em andamento; a economia é apurada quando a compra de cada material é concluída.'
      : 'Ainda não há compras registradas neste projeto.');
  const money = (v, color) => `<span style="font-weight:600;color:${color}">${brl(v)}</span>`;
  const progressItems = ecoItems.filter(i => !i.done);
  const estProg = progressItems.reduce((s, i) => s + (Number(i.estimated) || 0), 0);
  const spentProg = progressItems.reduce((s, i) => s + (Number(i.spent) || 0), 0);
  const wrapTable = (head, rows) => `<div style="overflow-x:auto"><table><thead><tr>${head.map(h => '<th>' + h + '</th>').join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  let detail = '';
  if (doneItems.length) {
    const rows = doneItems.map(i => {
      const diff = (Number(i.estimated) || 0) - (Number(i.spent) || 0);
      return `<tr><td>${i.description}</td><td>${brl(i.estimated)}</td><td>${brl(i.spent)}</td><td>${money(diff, diff >= 0 ? '#1b7a3a' : '#c92a2a')}</td></tr>`;
    }).join('') + `<tr><td><strong>Subtotal</strong></td><td><strong>${brl(estDone)}</strong></td><td><strong>${brl(spentDone)}</strong></td><td>${money(savings, savings >= 0 ? '#1b7a3a' : '#c92a2a')}</td></tr>`;
    detail += '<h4 style="margin:8px 0 4px">Materiais com compra concluída</h4>' + wrapTable(['Material', 'Estimado', 'Gasto', 'Economia'], rows);
  }
  if (progressItems.length) {
    const rows = progressItems.map(i => `<tr><td>${i.description}</td><td>${brl(i.estimated)}</td><td>${brl(i.spent)}</td></tr>`).join('');
    detail += '<h4 style="margin:12px 0 4px">Materiais em andamento</h4><p class="muted" style="margin:0 0 4px">A economia só é apurada quando a compra do material é concluída.</p>' + wrapTable(['Material', 'Estimado', 'Gasto até agora'], rows);
  }
  if (ecoItems.length) {
    detail += `<p style="margin:12px 0 0"><strong>Total já gasto no projeto: ${brl(spentDone + spentProg)}</strong> <span class="muted">(concluídos ${brl(spentDone)} + em andamento ${brl(spentProg)}) — total registrado até o momento</span></p>`;
  }
  const detailEl = document.getElementById('savings-detail');
  detailEl.innerHTML = detail;
  detailEl.classList.toggle('hidden', !ecoItems.length);

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
  const seenItem = new Set();
  let estTotal = 0;
  const estCell = (p) => {
    if (p.proposal_item_id && p.item_estimated != null) {
      if (seenItem.has(p.proposal_item_id)) return `<span class="muted">já contado em ${p.item_description || 'material'}</span>`;
      seenItem.add(p.proposal_item_id);
      estTotal += Number(p.item_estimated) || 0;
      return brl(p.item_estimated);
    }
    estTotal += Number(p.budgeted_cost) || 0;   // compra sem material da proposta: usa o valor cotado
    return brl(p.budgeted_cost);
  };
  document.getElementById('purchases-list').innerHTML = (purchases || []).map(p => `
    <tr><td>${p.description}</td><td>${estCell(p)}</td><td>${brl(p.actual_cost)}</td>
      <td>${fmtD(p.data_prevista_cotacao)}</td><td>${fmtD(p.closing_date)}</td>
      <td>${fmtD(p.data_prevista_compra)}</td><td>${p.forma_pagamento || '-'}</td>
      <td><span class="badge ${statusColor(p.status)}">${statusLabel[p.status] || p.status}</span></td><td>${renderDocLinks(p.documents)}</td></tr>
  `).join('') + ((purchases || []).length
    ? `<tr><td><strong>Total</strong></td><td><strong>${brl(estTotal)}</strong></td><td><strong>${brl((purchases || []).reduce((s, p) => s + (Number(p.actual_cost) || 0), 0))}</strong></td><td colspan="6"></td></tr>`
    : '<tr><td class="muted">Nenhuma compra registrada ainda.</td></tr>');

  // Pagamentos (cliente -> fornecedor)
  document.getElementById('payments-list').innerHTML = (payments || []).map(p => `
    <tr><td>${p.supplier_name || '-'}</td><td>${brl(p.amount)}</td><td>${p.method || '-'}</td><td>${fmtD(p.due_date)}</td><td>${fmtD(p.paid_date)}</td><td><span class="badge ${statusColor(p.status)}">${statusLabel[p.status] || p.status}</span></td>
      <td>${renderDocLinks(p.documents)}</td></tr>
  `).join('') + ((payments || []).length ? (() => {
    const total = payments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const pago = payments.filter(x => x.paid_date || x.status === 'pago').reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return `<tr><td><strong>Total</strong></td><td><strong>${brl(total)}</strong></td><td colspan="5">pago <strong>${brl(pago)}</strong> · a pagar <strong>${brl(total - pago)}</strong></td></tr>`;
  })() : '<tr><td class="muted">Nenhum pagamento programado ainda.</td></tr>');
  renderMonthlySummary('payments-monthly-list', payments || []);

  // Recebimentos (cliente -> Pro Cooler)
  // em ordem de pagamento (vencimento; sem data vão para o fim)
  const recvSorted = (receivables || []).slice().sort((a, b) => String(a.due_date || a.paid_date || '9999').localeCompare(String(b.due_date || b.paid_date || '9999')));
  document.getElementById('receivables-list').innerHTML = recvSorted.map(r => `
    <tr><td>${brl(r.amount)}</td><td>${fmtD(r.due_date)}</td><td>${fmtD(r.paid_date)}</td><td><span class="badge ${statusColor(r.status)}">${statusLabel[r.status] || r.status}</span></td>
      <td>${renderDocLinks(r.documents)}</td></tr>
  `).join('') + ((receivables || []).length ? (() => {
    const programado = receivables.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const recebido = receivables.filter(r => r.paid_date || r.status === 'pago').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const labor = Number(data.labor_total) || 0;   // mão de obra contratada (proposta)
    const contratado = labor > 0 ? labor : programado;
    const saldo = Math.max(contratado - recebido, 0);
    const line = (valor, rotulo, style) => `<tr style="${style || ''}"><td><strong>${brl(valor)}</strong></td><td colspan="4">${rotulo}</td></tr>`;
    return line(recebido, '<strong>Total recebido</strong>', 'border-top:2px solid #cbd5e1;background:#f8fafc')
      + line(contratado, labor > 0 ? '<strong>Total contratado</strong> (serviços de assessoria/mão de obra)' : '<strong>Total programado</strong>')
      + line(saldo, '<strong>Saldo ainda a receber</strong>', 'background:#f8fafc');
  })() : '<tr><td class="muted">Nenhum recebimento programado ainda.</td></tr>');

  // Total de gastos do projeto (com saldo) + soma opcional de outros projetos do mesmo cliente
  const sp = data.spending;
  if (sp) {
    const calc = (o) => {
      const matTotal = Number(o.material_estimated) || 0, labTotal = Number(o.labor_contracted) || 0;
      const matGasto = Number(o.purchases_total) || 0, labGasto = Number(o.labor_received) || 0;
      return { matTotal, labTotal, matGasto, labGasto, matSaldo: matTotal - matGasto, labSaldo: labTotal - labGasto,
        prev: matTotal + labTotal, gasto: matGasto + labGasto, saldo: (matTotal - matGasto) + (labTotal - labGasto) };
    };
    const saldoHtml = (v) => `<span style="color:${v < 0 ? '#c92a2a' : 'inherit'}">${brl(v)}</span>`;
    const own = calc(sp);
    document.getElementById('sp-mat-total').textContent = brl(own.matTotal);
    document.getElementById('sp-purchases').textContent = brl(own.matGasto);
    document.getElementById('sp-mat-saldo').innerHTML = saldoHtml(own.matSaldo);
    document.getElementById('sp-lab-total').textContent = brl(own.labTotal);
    document.getElementById('sp-labor').textContent = brl(own.labGasto);
    document.getElementById('sp-lab-saldo').innerHTML = saldoHtml(own.labSaldo);
    document.getElementById('sp-project-name').textContent = 'Total — ' + project.name;
    document.getElementById('sp-prev-total').textContent = brl(own.prev);
    document.getElementById('sp-total').textContent = brl(own.gasto);
    document.getElementById('sp-saldo-total').innerHTML = saldoHtml(own.saldo);
    const others = (sp.others || []).map(o => Object.assign({ name: o.name }, calc(o)));
    document.getElementById('sp-others-box').classList.toggle('hidden', !others.length);
    document.getElementById('sp-others').innerHTML = others.map((o, i) => `<tr><td><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" class="sp-other" data-i="${i}" style="width:auto"> ${o.name}</label></td><td style="text-align:right">gasto <strong>${brl(o.gasto)}</strong></td><td style="text-align:right" class="muted">saldo ${brl(o.saldo)}</td></tr>`).join('');
    const recalc = () => {
      const t = { prev: own.prev, gasto: own.gasto, saldo: own.saldo };
      const names = [project.name];
      document.querySelectorAll('.sp-other').forEach(cb => {
        if (!cb.checked) return;
        const o = others[Number(cb.dataset.i)];
        t.prev += o.prev; t.gasto += o.gasto; t.saldo += o.saldo;
        names.push(o.name);
      });
      document.getElementById('sp-grand').textContent = brl(t.gasto);
      document.getElementById('sp-grand-note').textContent = 'Inclui: ' + names.join(' + ');
      document.getElementById('sp-grand-detail').innerHTML = `Total previsto <strong>${brl(t.prev)}</strong> · gasto <strong>${brl(t.gasto)}</strong> · saldo restante <strong>${saldoHtml(t.saldo)}</strong>`;
      const boxes = [...document.querySelectorAll('.sp-other')];
      document.getElementById('sp-toggle-all').textContent = boxes.length && boxes.every(c => c.checked) ? 'Desmarcar todos' : 'Marcar todos';
    };
    document.querySelectorAll('.sp-other').forEach(cb => cb.addEventListener('change', recalc));
    document.getElementById('sp-toggle-all').onclick = () => {
      const boxes = [...document.querySelectorAll('.sp-other')];
      const all = boxes.every(c => c.checked);
      boxes.forEach(c => { c.checked = !all; });
      recalc();
    };
    recalc();
  }

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
