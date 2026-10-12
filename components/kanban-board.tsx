'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { claimLead, confirmSaleFromLead, deleteLead, moveLead, requestClose, saveLead, startTrial } from '@/app/crm/actions';
import { brl, dateBR, SEGMENTS, segmentLabel, UFS } from '@/lib/format';
import { LEAD_STAGES, TRIAL_STATUSES, trialLabel, type LeadCard, type LeadStage } from '@/lib/leads';
import { LeadImportModal } from '@/components/lead-import-modal';
import type { SaveState } from '@/lib/types';

function waLink(number: string) {
  const d = number.replace(/\D/g, '');
  return `https://wa.me/${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}`;
}

/** Calcula tempo restante do teste de 24h a partir de trial_ends_at */
function useTrialCountdown(endsAt: string | null) {
  const [remaining, setRemaining] = useState<string>('');
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Encerrado'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setRemaining(`${h}h ${m}min`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [endsAt]);
  return remaining;
}

function TrialBadge({ lead }: { lead: LeadCard }) {
  const remaining = useTrialCountdown(lead.trial_ends_at);
  if (lead.trial_status === 'not_started') return null;

  const isActive = lead.trial_status === 'active';
  const isEnded = lead.trial_status === 'ended' || (isActive && remaining === 'Encerrado');

  const tone = isEnded ? 'badge-bad' : isActive ? 'badge-warn' : 'badge-good';

  return (
    <span className={`badge ${tone}`} style={{ fontSize: 11 }}>
      {isActive && !isEnded ? `⏱ ${remaining}` : trialLabel(lead.trial_status)}
    </span>
  );
}

function TrialButton({
  lead,
  onDone,
}: {
  lead: LeadCard;
  onDone: (updated: LeadCard) => void;
}) {
  const [pending, startT] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (lead.trial_status !== 'not_started') return null;

  function handle() {
    if (
      !window.confirm(
        `Confirma que o prospect "${lead.name}" concluiu o cadastro no Gestão Pro e que o teste de 24 horas começou agora?`,
      )
    ) return;
    setError(null);
    startT(async () => {
      const r = await startTrial(lead.id);
      if (r?.error) { setError(r.error); return; }
      // Atualiza o card localmente com horários calculados
      const now = new Date().toISOString();
      const ends = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      onDone({ ...lead, trial_status: 'active', trial_started_at: now, trial_ends_at: ends });
    });
  }

  return (
    <>
      {error && <p className="k-next" style={{ color: 'var(--bad)' }}>{error}</p>}
      <button
        type="button"
        className="btn btn-sm"
        style={{ marginTop: 4, width: '100%', fontSize: 12 }}
        disabled={pending}
        onClick={handle}
      >
        {pending ? 'Iniciando…' : '▶ Cadastro concluído — iniciar teste 24h'}
      </button>
    </>
  );
}

function ClaimButton({ lead, onDone }: { lead: LeadCard; onDone: (id: string) => void }) {
  const [pending, startT] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handle() {
    setError(null);
    startT(async () => {
      const r = await claimLead(lead.id);
      if (r?.error) { setError(r.error); return; }
      onDone(lead.id);
    });
  }

  return (
    <>
      {error && <p className="k-next" style={{ color: 'var(--bad)' }}>{error}</p>}
      <button
        type="button"
        className="btn btn-good btn-sm k-sale"
        disabled={pending}
        onClick={handle}
      >
        {pending ? 'Assumindo…' : 'Assumir lead'}
      </button>
    </>
  );
}

function RequestCloseButton({ lead, onDone }: { lead: LeadCard; onDone: (l: LeadCard) => void }) {
  const [pending, startT] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (lead.close_requested_at) {
    return <p className="k-next" style={{ fontSize: 11 }}>✓ Fechamento solicitado ao admin</p>;
  }

  function handle() {
    if (!window.confirm('Solicitar ao administrador a confirmação de fechamento desta oportunidade?')) return;
    startT(async () => {
      const r = await requestClose(lead.id);
      if (r?.error) { setError(r.error); return; }
      onDone({ ...lead, close_requested_at: new Date().toISOString() });
    });
  }

  return (
    <>
      {error && <p className="k-next" style={{ color: 'var(--bad)' }}>{error}</p>}
      <button
        type="button"
        className="btn btn-ghost btn-sm k-sale"
        disabled={pending}
        onClick={handle}
      >
        {pending ? 'Enviando…' : 'Solicitar confirmação de fechamento'}
      </button>
    </>
  );
}

export type KanbanService = {
  id: string;
  name: string;
  price: number;
  commission_type: 'percent' | 'fixed';
  commission_percent: number;
  commission_fixed: number;
};

export type KanbanPartnerDetail = {
  id: string;
  name: string;
  pix_key: string | null;
  pix_key_type: string | null;
};

export function KanbanBoard({
  leads: initial,
  today,
  mode,
  partnerOptions,
  currentPartnerId,
  services,
  partnerDetails,
}: {
  leads: LeadCard[];
  today: string;
  mode: 'partner' | 'admin';
  partnerOptions?: { value: string; label: string }[];
  currentPartnerId?: string;
  services?: KanbanService[];
  partnerDetails?: Record<string, KanbanPartnerDetail>;
}) {
  const [leads, setLeads] = useState(initial);
  useEffect(() => setLeads(initial), [initial]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeadCard | 'new' | null>(null);
  const [closingLead, setClosingLead] = useState<LeadCard | null>(null);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();


  // Leads disponíveis (não são do parceiro atual, estão no pool)
  const availableLeads = useMemo(
    () => leads.filter((l) => l.is_available && l.partner_id !== currentPartnerId),
    [leads, currentPartnerId],
  );
  const myLeads = useMemo(
    () => leads.filter((l) => !l.is_available || l.partner_id === currentPartnerId),
    [leads, currentPartnerId],
  );
  const displayLeads = mode === 'admin' ? leads : myLeads;

  const byStage = useMemo(() => {
    const map = new Map<string, LeadCard[]>();
    LEAD_STAGES.forEach((s) => map.set(s.value, []));
    displayLeads.forEach((l) => map.get(l.stage)?.push(l));
    return map;
  }, [displayLeads]);

  function move(id: string, stage: LeadStage) {
    const before = leads;
    const lead = before.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    setMessage(null);
    setLeads(before.map((l) => (l.id === id ? { ...l, stage } : l)));
    startTransition(async () => {
      const result = await moveLead(id, stage);
      if (result?.error) {
        setLeads(before);
        setMessage(result.error);
      }
    });
  }

  function updateLead(updated: LeadCard) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  function removeLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <>
      <div className="kanban-toolbar">
        <p className="muted" style={{ margin: 0 }}>Arraste os cards entre as colunas ou use o seletor "Mover para".</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mode === 'admin' && (
            <>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => setShowImportModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FileSpreadsheet size={16} /> Importar Planilha
              </button>
              <button className="btn" type="button" onClick={() => setEditing('new')}>
                <Plus size={17} /> Adicionar lead
              </button>
            </>
          )}
          {mode === 'partner' && (
            <button className="btn" type="button" onClick={() => setEditing('new')}>
              <Plus size={17} /> Novo lead
            </button>
          )}
        </div>
      </div>

      {/* Leads disponíveis para o parceiro assumir */}
      {mode === 'partner' && availableLeads.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p className="muted" style={{ fontWeight: 600, marginBottom: 8 }}>
            🔵 Leads disponíveis para assumir ({availableLeads.length})
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {availableLeads.map((l) => (
              <article key={l.id} className="k-card" style={{ maxWidth: 260, flexShrink: 0 }}>
                <div className="k-card-main" style={{ pointerEvents: 'none' }}>
                  <strong>{l.name}</strong>
                  <span>{[l.contact_name, [l.city, l.state].filter(Boolean).join(' - ')].filter(Boolean).join(' · ') || segmentLabel(l.segment)}</span>
                </div>
                <ClaimButton lead={l} onDone={(id) => {
                  setLeads((prev) => prev.map((x) => x.id === id
                    ? { ...x, is_available: false, partner_id: currentPartnerId }
                    : x));
                }} />
              </article>
            ))}
          </div>
        </div>
      )}

      {message && <div className="flash flash-bad" role="alert">{message}</div>}

      <div className="kanban">
        {LEAD_STAGES.map((stage) => {
          const items = byStage.get(stage.value) ?? [];
          const total = items.reduce((s, l) => s + Number(l.opportunity_value ?? 0), 0);
          return (
            <section
              key={stage.value}
              data-stage={stage.value}
              className={`k-col${overStage === stage.value ? ' over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.value);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage.value ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain') || dragId;
                if (id) move(id, stage.value);
                setDragId(null);
                setOverStage(null);
              }}
            >
              <header className="k-col-head">
                <span className="k-dot" />
                <h3>{stage.label}</h3>
                <b>{items.length}</b>
              </header>
              {total > 0 && <p className="k-total">{brl(total)}</p>}

              {items.map((l) => {
                const open = l.stage !== 'won' && l.stage !== 'lost';
                const late = open && l.next_follow_up !== null && l.next_follow_up < today;
                const isToday = open && l.next_follow_up === today;
                const isProposal = l.stage === 'proposal';
                return (
                  <article
                    key={l.id}
                    className={`k-card${dragId === l.id ? ' dragging' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', l.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(l.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                  >
                    <button type="button" className="k-card-main" onClick={() => setEditing(l)}>
                      <strong>{l.name}</strong>
                      <span>{[l.contact_name, [l.city, l.state].filter(Boolean).join(' - ')].filter(Boolean).join(' · ') || segmentLabel(l.segment)}</span>
                    </button>

                    <div className="k-tags">
                      {l.opportunity_value ? <span className="badge badge-good">{brl(l.opportunity_value)}</span> : null}
                      {l.next_follow_up && open && (
                        <span className={`badge ${late ? 'badge-bad' : isToday ? 'badge-warn' : ''}`}>
                          {late ? 'Atrasado · ' : isToday ? 'Hoje · ' : ''}
                          {dateBR(l.next_follow_up)}
                        </span>
                      )}
                      {mode === 'admin' && l.partner_name && <span className="badge">{l.partner_name}</span>}
                      <TrialBadge lead={l} />
                      {l.close_requested_at && l.stage !== 'won' && !l.sale_id && (
                        <span className="badge badge-warn" style={{ fontWeight: 600 }}>
                          🔔 Fechamento solicitado
                        </span>
                      )}
                    </div>
                    {l.next_action && open && <p className="k-next">{l.next_action}</p>}

                    <div className="k-foot">
                      <select aria-label={`Mover ${l.name} para`} value={l.stage} onChange={(e) => move(l.id, e.target.value as LeadStage)}>
                        {LEAD_STAGES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      {l.whatsapp && (
                        <a className="k-link" href={waLink(l.whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                      )}
                    </div>

                    {/* Botão de teste 24h — aparece na etapa Proposta */}
                    {isProposal && mode === 'partner' && (
                      <TrialButton lead={l} onDone={updateLead} />
                    )}
                    {isProposal && mode === 'admin' && (
                      <TrialButton lead={l} onDone={updateLead} />
                    )}

                    {/* Admin: Confirmar fechamento solicitado pelo afiliado ou a qualquer momento */}
                    {mode === 'admin' && l.stage !== 'won' && !l.sale_id && (
                      <button
                        type="button"
                        className={`btn btn-sm ${l.close_requested_at ? 'btn-good' : ''}`}
                        style={{ width: '100%', marginTop: 6, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        onClick={() => setClosingLead(l)}
                      >
                        {l.close_requested_at ? '🔔 Confirmar Fechamento' : 'Fechar Venda (Admin)'}
                      </button>
                    )}

                    {/* Parceiro: solicitar fechamento nas etapas finais */}
                    {mode === 'partner' && (l.stage === 'negotiation' || l.stage === 'proposal') && !l.sale_id && (
                      <RequestCloseButton lead={l} onDone={updateLead} />
                    )}

                    {mode === 'partner' && l.stage === 'won' && !l.sale_id && (
                      <Link className="btn btn-good btn-sm k-sale" href={`/parceiro/vendas/nova?lead=${l.id}`}>Registrar venda</Link>
                    )}
                    {l.sale_id && <p className="k-next">Venda registrada ✓</p>}
                  </article>
                );
              })}

              {items.length === 0 && <p className="k-empty">Sem leads</p>}
            </section>
          );
        })}
      </div>

      {editing && <LeadModal lead={editing === 'new' ? null : editing} onClose={() => setEditing(null)} mode={mode} partnerOptions={partnerOptions} />}
      {showImportModal && (
        <LeadImportModal
          onClose={() => setShowImportModal(false)}
          partnerOptions={partnerOptions}
        />
      )}
      {closingLead && services && services.length > 0 && (
        <ConfirmSaleModal
          lead={closingLead}
          services={services}
          partnerDetail={closingLead.partner_id ? partnerDetails?.[closingLead.partner_id] : null}
          today={today}
          onClose={() => setClosingLead(null)}
        />
      )}
    </>
  );
}

function LeadModal({
  lead,
  onClose,
  mode,
  partnerOptions,
}: {
  lead: LeadCard | null;
  onClose: () => void;
  mode: 'partner' | 'admin';
  partnerOptions?: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveLead, null);
  const [stage, setStage] = useState<string>(lead?.stage ?? 'new');
  const [removing, startRemove] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function remove() {
    if (!lead || !window.confirm('Excluir este lead? Esta ação não pode ser desfeita.')) return;
    startRemove(async () => {
      const r = await deleteLead(lead.id);
      if (r?.error) setDeleteError(r.error);
      else onClose();
    });
  }

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={lead ? 'Editar lead' : 'Novo lead'}>
        <h2>{lead ? 'Editar lead' : mode === 'admin' ? 'Adicionar lead' : 'Novo lead'}</h2>
        <form action={action} noValidate>
          {lead && <input type="hidden" name="id" value={lead.id} />}
          <div className="form-grid">
            <label className="field full"><span>Empresa / estabelecimento</span><input name="name" defaultValue={lead?.name} required maxLength={120} autoFocus /></label>
            <label className="field"><span>Nome do contato</span><input name="contact_name" defaultValue={lead?.contact_name ?? ''} maxLength={120} /></label>
            <label className="field"><span>WhatsApp</span><input name="whatsapp" type="tel" inputMode="tel" defaultValue={lead?.whatsapp ?? ''} placeholder="(14) 99999-0000" /></label>
            <label className="field"><span>E-mail</span><input name="email" type="email" defaultValue={lead?.email ?? ''} /></label>
            <label className="field"><span>Origem do lead</span><input name="source" defaultValue={lead?.source ?? ''} maxLength={80} placeholder="Instagram, indicação, Google Maps…" /></label>
            <label className="field"><span>Cidade</span><input name="city" defaultValue={lead?.city ?? ''} maxLength={100} /></label>
            <label className="field"><span>Estado</span>
              <select name="state" defaultValue={lead?.state ?? ''}><option value="">—</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </label>
            <label className="field"><span>Nicho</span>
              <select name="segment" defaultValue={lead?.segment ?? 'mecanica'}>{SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </label>
            <label className="field"><span>Etapa do funil</span>
              <select name="stage" value={stage} onChange={(e) => setStage(e.target.value)}>{LEAD_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </label>
            <label className="field"><span>Valor da oportunidade (R$)</span><input name="opportunity_value" inputMode="decimal" defaultValue={lead?.opportunity_value != null ? String(lead.opportunity_value).replace('.', ',') : ''} placeholder="80,00" /></label>
            <label className="field"><span>Próximo follow-up</span><input name="next_follow_up" type="date" defaultValue={lead?.next_follow_up ?? ''} /></label>
            <label className="field full"><span>Próxima ação</span><input name="next_action" defaultValue={lead?.next_action ?? ''} maxLength={160} placeholder="Ex.: enviar proposta por WhatsApp" /></label>
            {stage === 'lost' && (
              <label className="field full"><span>Motivo da perda</span><input name="lost_reason" defaultValue={lead?.lost_reason ?? ''} maxLength={200} /></label>
            )}
            <label className="field full"><span>Observações</span><textarea name="notes" defaultValue={lead?.notes ?? ''} maxLength={2000} /></label>

            {/* Admin: define a quem atribuir o lead */}
            {!lead && mode === 'admin' && partnerOptions && partnerOptions.length > 0 && (
              <label className="field full"><span>Atribuir ao parceiro</span>
                <select name="assign_to" defaultValue="available">
                  <option value="available">Deixar disponível (pool)</option>
                  {partnerOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
            )}
          </div>

          {(state?.error || deleteError) && <p className="flash flash-bad" role="alert" style={{ marginTop: 16, marginBottom: 0 }}>{state?.error ?? deleteError}</p>}

          <div className="form-actions">
            <button className="btn" type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
            {lead && <button className="btn btn-danger" type="button" onClick={remove} disabled={removing} style={{ marginLeft: 'auto' }}>Excluir</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmSaleModal({
  lead,
  services,
  partnerDetail,
  today,
  onClose,
}: {
  lead: LeadCard;
  services: KanbanService[];
  partnerDetail?: KanbanPartnerDetail | null;
  today: string;
  onClose: () => void;
}) {
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedService = services.find((s) => s.id === selectedServiceId) ?? services[0];
  const commAmount = selectedService
    ? selectedService.commission_type === 'percent'
      ? Math.round((selectedService.price * selectedService.commission_percent)) / 100
      : Math.min(selectedService.commission_fixed, selectedService.price)
    : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await confirmSaleFromLead(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Confirmar Fechamento de Venda">
        <h2>Confirmar Fechamento de Venda</h2>
        <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
          Validação exclusiva do administrador. Ao confirmar, o lead é marcado como Fechado, a venda é registrada e a comissão do afiliado é gerada.
        </p>

        <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <p style={{ margin: '0 0 6px 0', fontSize: 13 }}>
            <strong>Lead / Estabelecimento:</strong> {lead.name}
          </p>
          <p style={{ margin: '0 0 6px 0', fontSize: 13 }}>
            <strong>Afiliado responsável:</strong> {lead.partner_name || partnerDetail?.name || 'Não identificado'}
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>
            <strong>Chave Pix do afiliado:</strong>{' '}
            {partnerDetail?.pix_key ? (
              <span style={{ color: 'var(--good, #10b981)', fontWeight: 600 }}>
                {partnerDetail.pix_key_type ? `[${partnerDetail.pix_key_type.toUpperCase()}] ` : ''}
                {partnerDetail.pix_key}
              </span>
            ) : (
              <span style={{ color: 'var(--bad, #ef4444)', fontWeight: 600 }}>
                ⚠️ Não cadastrada pelo afiliado ainda
              </span>
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <input type="hidden" name="lead_id" value={lead.id} />
          <div className="form-grid">
            <label className="field full">
              <span>Produto / Plano</span>
              <select
                name="service_id"
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                required
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {brl(s.price)}
                  </option>
                ))}
              </select>
            </label>

            {selectedService && (
              <div
                className="field full"
                style={{
                  fontSize: 13,
                  background: 'rgba(16, 185, 129, 0.08)',
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                }}
              >
                <span>
                  💰 Valor da venda: <strong>{brl(selectedService.price)}</strong>
                </span>
                <span style={{ marginLeft: 16 }}>
                  🎁 Comissão do afiliado:{' '}
                  <strong>
                    {brl(commAmount)} ({selectedService.commission_type === 'percent' ? `${selectedService.commission_percent}%` : 'Fixa'})
                  </strong>
                </span>
              </div>
            )}

            <label className="field">
              <span>Forma de pagamento</span>
              <select name="payment_method" defaultValue="pix">
                <option value="pix">Pix</option>
                <option value="credit_card">Cartão de Crédito</option>
                <option value="boleto">Boleto Bancário</option>
                <option value="bank_transfer">Transferência Bancária</option>
                <option value="cash">Dinheiro</option>
                <option value="other">Outro</option>
              </select>
            </label>

            <label className="field">
              <span>Data da venda</span>
              <input name="sold_at" type="date" defaultValue={today} required />
            </label>

            <label className="field full">
              <span>Observações (opcional)</span>
              <textarea
                name="notes"
                placeholder="Ex.: Pagamento confirmado via Pix. Liberar acesso ao Gestão Pro."
                maxLength={500}
                rows={2}
              />
            </label>
          </div>

          {error && (
            <p className="flash flash-bad" role="alert" style={{ marginTop: 16, marginBottom: 0 }}>
              {error}
            </p>
          )}

          <div className="form-actions" style={{ marginTop: 20 }}>
            <button className="btn btn-good" type="submit" disabled={pending}>
              {pending ? 'Confirmando…' : '✓ Confirmar Venda e Liberar Comissão'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={pending}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

