'use client';

import { useState, useTransition, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle, X } from 'lucide-react';
import { importLeads, type LeadImportItem, type ImportLeadsResult } from '@/app/crm/actions';
import { SEGMENTS } from '@/lib/format';

interface ImportModalProps {
  onClose: () => void;
  partnerOptions?: { value: string; label: string }[];
  onSuccess?: () => void;
}

export function LeadImportModal({ onClose, partnerOptions = [], onSuccess }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<LeadImportItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<string>('available');
  const [isPending, startTransition] = useTransition();
  const [importResult, setImportResult] = useState<ImportLeadsResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mapeamento tolerante de colunas
  const normalizeKey = (key: string) =>
    key
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;

    setParseError(null);
    setErrorMessage(null);
    setImportResult(null);
    setFile(uploaded);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setParseError('A planilha está vazia.');
          setParsedLeads([]);
          return;
        }

        const items: LeadImportItem[] = rawJson.map((row) => {
          const normalizedRow: Record<string, any> = {};
          Object.keys(row).forEach((k) => {
            normalizedRow[normalizeKey(k)] = row[k];
          });

          // Encontrar campos equivalentes
          const name =
            normalizedRow['empresa'] ||
            normalizedRow['nome'] ||
            normalizedRow['nomedaempresa'] ||
            normalizedRow['razaosocial'] ||
            normalizedRow['lead'] ||
            '';

          const contact =
            normalizedRow['contato'] ||
            normalizedRow['responsavel'] ||
            normalizedRow['nomedocontato'] ||
            '';

          const whatsapp =
            normalizedRow['whatsapp'] ||
            normalizedRow['telefone'] ||
            normalizedRow['celular'] ||
            normalizedRow['fone'] ||
            '';

          const email =
            normalizedRow['email'] ||
            normalizedRow['correioeletronico'] ||
            '';

          const city =
            normalizedRow['cidade'] ||
            normalizedRow['municipio'] ||
            '';

          const state =
            normalizedRow['estado'] ||
            normalizedRow['uf'] ||
            '';

          const segment =
            normalizedRow['segmento'] ||
            normalizedRow['ramo'] ||
            normalizedRow['categoria'] ||
            'outro';

          const source =
            normalizedRow['origem'] ||
            normalizedRow['fonte'] ||
            'Planilha';

          const notes =
            normalizedRow['observacoes'] ||
            normalizedRow['obs'] ||
            normalizedRow['notas'] ||
            '';

          const rawValue =
            normalizedRow['valor'] ||
            normalizedRow['valordeoportunidade'] ||
            normalizedRow['preco'] ||
            null;

          let numValue: number | null = null;
          if (rawValue !== null && rawValue !== '') {
            const parsed = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue).replace(/[^\d.,]/g, '').replace(',', '.'));
            if (!isNaN(parsed)) numValue = parsed;
          }

          return {
            name: String(name).trim(),
            contact_name: contact ? String(contact).trim() : null,
            whatsapp: whatsapp ? String(whatsapp).trim() : null,
            email: email ? String(email).trim() : null,
            city: city ? String(city).trim() : null,
            state: state ? String(state).trim().toUpperCase() : null,
            segment: segment ? String(segment).trim() : 'outro',
            source: source ? String(source).trim() : 'Planilha',
            opportunity_value: numValue,
            notes: notes ? String(notes).trim() : null,
          };
        });

        const validItems = items.filter((i) => i.name.length > 0);
        if (validItems.length === 0) {
          setParseError('Não foi possível identificar nomes de empresas na planilha. Verifique os títulos das colunas.');
        }

        setParsedLeads(validItems);
      } catch (err: any) {
        setParseError(`Erro ao ler planilha: ${err?.message || 'Arquivo inválido'}`);
      }
    };

    reader.readAsBinaryString(uploaded);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Nome da Empresa': 'Oficina Mecânica Modelo',
        'Contato': 'Carlos Silva',
        'WhatsApp': '11999998888',
        'E-mail': 'carlos@oficina.com.br',
        'Cidade': 'São Paulo',
        'Estado': 'SP',
        'Segmento': 'Mecânica',
        'Origem': 'Prospecção Externa',
        'Valor Estimado': 490,
        'Observações': 'Cliente demonstrou interesse em agendamento online',
      },
      {
        'Nome da Empresa': 'Lava Car Estrela',
        'Contato': 'Mariana Souza',
        'WhatsApp': '41988887777',
        'E-mail': 'mariana@lavacarestrela.com',
        'Cidade': 'Curitiba',
        'Estado': 'PR',
        'Segmento': 'Lavacar',
        'Origem': 'Instagram',
        'Valor Estimado': 350,
        'Observações': 'Empresa com 4 funcionários',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo Leads');
    XLSX.writeFile(wb, 'modelo_importacao_leads.xlsx');
  };

  const handleConfirmImport = () => {
    if (parsedLeads.length === 0) return;
    setErrorMessage(null);

    startTransition(async () => {
      const res = await importLeads(parsedLeads, assignTo);
      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.result) {
        setImportResult(res.result);
        if (onSuccess) onSuccess();
      }
    });
  };

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileSpreadsheet size={24} style={{ color: 'var(--brand)' }} />
            Importar Leads por Planilha
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 0,
              cursor: 'pointer',
              color: 'var(--muted)',
              display: 'flex',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {importResult ? (
          <div style={{ display: 'grid', gap: 16, padding: '12px 0' }}>
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: 10,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <CheckCircle size={24} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ color: '#15803d', fontSize: 16 }}>Importação concluída com sucesso!</strong>
                <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink)' }}>
                  <strong>{importResult.successCount}</strong> lead(s) foram inseridos com sucesso.
                </p>
                {importResult.skippedDuplicates > 0 && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
                    ℹ️ <strong>{importResult.skippedDuplicates}</strong> lead(s) ignorados por número de WhatsApp já existente.
                  </p>
                )}
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div
                style={{
                  background: '#fff3cd',
                  border: '1px solid #ffeeba',
                  borderRadius: 8,
                  padding: '12px 16px',
                  maxHeight: 140,
                  overflowY: 'auto',
                  fontSize: 12.5,
                }}
              >
                <strong style={{ color: '#856404', display: 'block', marginBottom: 4 }}>Avisos nas linhas:</strong>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#856404' }}>
                  {importResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" type="button" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid var(--line)',
                fontSize: 13,
              }}
            >
              <span>Deseja seguir a formatação recomendada?</span>
              <button
                type="button"
                className="btn-ghost"
                onClick={handleDownloadTemplate}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '4px 8px' }}
              >
                <Download size={14} /> Baixar Modelo (.xlsx)
              </button>
            </div>

            {/* Drop / Seleção de arquivo */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: 12,
                padding: '28px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: file ? '#f0fdf4' : '#fafbfd',
                borderColor: file ? '#86efac' : '#cbd5e1',
                transition: 'all .2s ease',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <Upload size={32} style={{ color: file ? '#16a34a' : 'var(--muted)', margin: '0 auto 8px' }} />
              {file ? (
                <div>
                  <strong style={{ color: '#16a34a', display: 'block', fontSize: 14.5 }}>
                    {file.name}
                  </strong>
                  <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    Clique para trocar de planilha
                  </span>
                </div>
              ) : (
                <div>
                  <strong style={{ display: 'block', fontSize: 14 }}>
                    Clique para selecionar a planilha (.xlsx, .xls ou .csv)
                  </strong>
                  <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    Formatos suportados: Excel e CSV
                  </span>
                </div>
              )}
            </div>

            {parseError && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  color: '#991b1b',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle size={18} />
                <span>{parseError}</span>
              </div>
            )}

            {errorMessage && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  color: '#991b1b',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Configurações de Atribuição */}
            <div className="field">
              <label style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--ink-2)' }}>
                Destino dos leads importados:
              </label>
              <select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                style={{ height: 40, borderRadius: 8, border: '1px solid var(--line)', padding: '0 10px' }}
              >
                <option value="available">🌐 Pool Geral (Disponível para parceiros / Distribuição Automática)</option>
                {partnerOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    👤 Atribuir diretamente para: {p.label}
                  </option>
                ))}
              </select>
              <small style={{ color: 'var(--muted)' }}>
                Se escolher Pool Geral e a distribuição automática estiver ativa, o sistema distribuirá os leads automaticamente.
              </small>
            </div>

            {/* Resumo da pré-visualização */}
            {parsedLeads.length > 0 && (
              <div
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  background: '#fafbfd',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong>Pré-visualização da Importação</strong>
                  <span className="badge badge-good">{parsedLeads.length} lead(s) identificados</span>
                </div>
                <div style={{ maxHeight: 110, overflowY: 'auto', fontSize: 12, color: 'var(--ink-2)' }}>
                  {parsedLeads.slice(0, 5).map((lead, idx) => (
                    <div key={idx} style={{ padding: '3px 0', borderBottom: '1px solid #eee' }}>
                      <strong>{lead.name}</strong>
                      {lead.whatsapp && ` · Tel: ${lead.whatsapp}`}
                      {lead.city && ` · ${lead.city}/${lead.state || ''}`}
                      {lead.contact_name && ` · Contato: ${lead.contact_name}`}
                    </div>
                  ))}
                  {parsedLeads.length > 5 && (
                    <div style={{ color: 'var(--muted)', paddingTop: 4 }}>
                      ... e mais {parsedLeads.length - 5} empresa(s).
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Ações */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button className="btn-ghost" type="button" onClick={onClose} disabled={isPending}>
                Cancelar
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleConfirmImport}
                disabled={isPending || parsedLeads.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {isPending ? 'Importando...' : `Confirmar Importação (${parsedLeads.length})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
