import { useEffect, useMemo, useRef, useState } from 'react';
import { rastreadorAPI } from '../../services/api';
import { APNS, MODELS, EXTRAS } from './comandosData';
import VEHICLES from './vehicles.data';

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function smsHref(number, body) {
  const num = String(number || '').replace(/[^\d+]/g, '');
  const ua = navigator.userAgent || '';
  const isIOS = /iP(hone|ad|od)/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
  const sep = isIOS ? '&' : '?';
  return `sms:${num}${sep}body=${encodeURIComponent(body)}`;
}

const BADGE_LABEL = { wait: 'aguardando', sending: 'enviando…', sent: '✓ enviado', fail: '✕ falhou' };

export default function ComandosRastreadorPage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [searchInfo, setSearchInfo] = useState(null);

  const [model, setModel] = useState('');
  const [carrier, setCarrier] = useState('algar');
  const [phone, setPhone] = useState('');
  const [fields, setFields] = useState({});
  const [intervalSec, setIntervalSec] = useState(20);

  const [commands, setCommands] = useState([]);
  const [title, setTitle] = useState('');
  const [warn, setWarn] = useState([]);
  const [statuses, setStatuses] = useState([]);

  const [gateway, setGateway] = useState({ configured: false, loaded: false });
  const [auto, setAuto] = useState({ running: false, sent: 0, statusMsg: '', log: [], show: false });
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    rastreadorAPI.status()
      .then((r) => setGateway({ configured: !!r.data?.configured, loaded: true }))
      .catch(() => setGateway({ configured: false, loaded: true }));
  }, []);

  useEffect(() => {
    const m = MODELS[model];
    if (!m) { setFields({}); return; }
    const init = {};
    (m.fields || []).forEach((f) => { init[f.key] = f.def || ''; });
    setFields(init);
  }, [model]);

  function doSearch(q) {
    setSearch(q);
    const s = q.trim().toLowerCase();
    if (s.length < 2) { setResults([]); setShowResults(false); return; }
    const dig = onlyDigits(s);
    const hits = VEHICLES.filter((v) => {
      const pl = v.placa.toLowerCase();
      const cl = (v.cli || '').toLowerCase();
      const cd = onlyDigits(v.chip);
      return pl.includes(s) || cl.includes(s) || (dig.length >= 3 && cd.includes(dig));
    }).slice(0, 10);
    setResults(hits);
    setShowResults(true);
  }

  function selectVehicle(v) {
    setShowResults(false);
    setSearch(v.placa + (v.cli ? ' — ' + v.cli : ''));
    setPhone(v.chip || '');
    setModel(v.mk || '');
    if (v.ak) setCarrier(v.ak);
    const probs = [];
    if (!v.mk) probs.push(`modelo '${v.mod}' nao cadastrado (selecione manualmente)`);
    if (!v.ak) probs.push('operadora nao identificada (selecione manualmente)');
    setSearchInfo(probs.length
      ? { text: '⚠ ' + probs.join(' · '), ok: false }
      : { text: `Selecionado: ${MODELS[v.mk].name} · ${APNS[v.ak].name} · ${v.chip}`, ok: true });
  }

  function renderCmds(titleStr, cmds, notes) {
    setCommands(cmds);
    setTitle(titleStr);
    setWarn(notes && notes.length ? notes : []);
    setStatuses(cmds.map(() => ''));
    setAuto((a) => ({ ...a, show: false }));
  }

  function generateConfig() {
    const m = MODELS[model];
    if (!m) { window.alert('Selecione um modelo primeiro.'); return; }
    const a = APNS[carrier] || APNS.algar;
    const notes = [];
    if (m.note) notes.push(m.note);
    if (a.note) notes.push(a.note);
    renderCmds(`${m.name} · ${a.name}`, m.build(fields, a), notes);
  }

  const extras = useMemo(() => (model && EXTRAS[model] ? EXTRAS[model] : null), [model]);
  const extrasList = useMemo(() => (extras ? extras.build(fields) : []), [extras, fields]);

  function runQuick(meta, idx) {
    const ex = EXTRAS[model];
    const cmd = ex.build(fields)[idx].cmd;
    if (meta.danger) {
      const titulo = meta.cat === 'block' ? '⚠ BLOQUEAR O MOTOR'
        : meta.cat === 'factory' ? '⚠ RESET DE FABRICA' : '⚠ ACAO CRITICA';
      const aviso = meta.cat === 'block' ? '\n\nNUNCA bloqueie um veiculo em movimento.' : '';
      if (!window.confirm(`${titulo}\n\nComando: ${cmd}${aviso}\n\nConfirma gerar este comando?`)) return;
    }
    const acao = meta.label.replace(/^\S+\s/, '');
    renderCmds(`${MODELS[model].name} · ${acao}`, [cmd], ex.note ? [ex.note] : []);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
  }

  function setStatusAt(i, st) {
    setStatuses((prev) => { const n = [...prev]; n[i] = st; return n; });
  }

  async function startAuto() {
    if (!commands.length) { window.alert('Gere os comandos primeiro.'); return; }
    const number = phone.trim();
    const useGateway = gateway.configured;
    if (useGateway && !number) { window.alert('Informe o numero do chip.'); return; }
    cancelRef.current = false; pausedRef.current = false; setPaused(false);
    setStatuses(commands.map(() => 'wait'));
    setAuto({ running: true, sent: 0, statusMsg: 'Iniciando…', show: true,
      log: [`Iniciando envio ${useGateway ? 'REAL' : '(DEMONSTRACAO)'} — intervalo ${intervalSec}s.`] });
    let sent = 0;
    for (let i = 0; i < commands.length; i++) {
      if (cancelRef.current) break;
      setStatusAt(i, 'sending');
      setAuto((a) => ({ ...a, statusMsg: `Enviando comando ${i + 1} de ${commands.length}…` }));
      try {
        if (useGateway) await rastreadorAPI.enviar({ to: number, text: commands[i] });
        else await wait(700);
        sent += 1;
        setStatusAt(i, 'sent');
        setAuto((a) => ({ ...a, sent, statusMsg: `Comando ${i + 1} enviado.`,
          log: [...a.log, `✓ Comando ${i + 1} enviado${useGateway ? '' : ' (simulado)'}.`] }));
      } catch (err) {
        setStatusAt(i, 'fail');
        const msg = err?.response?.data?.error || err.message || 'falha';
        setAuto((a) => ({ ...a, running: false, statusMsg: `Falha no comando ${i + 1}. Interrompido.`,
          log: [...a.log, `✕ Comando ${i + 1}: ${msg}`] }));
        return;
      }
      if (i < commands.length - 1 && !cancelRef.current) {
        for (let t = intervalSec; t > 0; t--) {
          if (cancelRef.current) break;
          while (pausedRef.current) { setAuto((a) => ({ ...a, statusMsg: '⏸ Pausado.' })); await wait(300); if (cancelRef.current) break; }
          if (cancelRef.current) break;
          setAuto((a) => ({ ...a, statusMsg: `Proximo comando em ${t}s…` }));
          await wait(1000);
        }
      }
    }
    setAuto((a) => ({ ...a, running: false,
      statusMsg: cancelRef.current ? `Envio cancelado (${sent}/${commands.length}).` : `✔ Todos os ${commands.length} comandos enviados!`,
      log: [...a.log, cancelRef.current ? '■ Cancelado.' : '✔ Sequencia concluida.'] }));
  }

  function togglePause() { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); }
  function cancelAuto() { cancelRef.current = true; pausedRef.current = false; setPaused(false); }

  const mDef = MODELS[model];
  const aDef = APNS[carrier];
  const progress = commands.length ? Math.round((auto.sent / commands.length) * 100) : 0;

  return (
    <div className="jrc">
      <style>{CSS}</style>

      <div className="jrc-head">
        <h1>📡 Comandos Rastreador</h1>
        <span className={`jrc-mode ${gateway.configured ? 'real' : 'demo'}`}>
          {gateway.loaded ? (gateway.configured ? 'Envio real (gateway pareado)' : 'Modo demonstração (sem SMS real)') : 'verificando gateway…'}
        </span>
      </div>

      <div className="jrc-grid">
        {/* CONFIG */}
        <div className="jrc-card">
          <div className="jrc-field">
            <label>Buscar veículo (placa, cliente ou nº do chip)</label>
            <input value={search} onChange={(e) => doSearch(e.target.value)} placeholder="Ex: EYQ-1952 ou 16990754002" autoComplete="off" />
            {showResults && (
              <div className="jrc-results">
                {results.length === 0 && <div className="jrc-res muted">Nenhum veículo encontrado.</div>}
                {results.map((v, i) => (
                  <div className="jrc-res" key={i} onClick={() => selectVehicle(v)}>
                    <div className="jrc-pl">
                      {v.placa}
                      <span className={`jrc-tag ${v.mk ? '' : 'miss'}`}>{v.mk ? MODELS[v.mk].name.split(' ')[0] : v.mod}</span>
                      <span className={`jrc-tag ${v.ak ? '' : 'miss'}`}>{v.ak ? APNS[v.ak].name : 'operadora?'}</span>
                    </div>
                    <div className="jrc-meta">{v.cli || '—'} · {v.chip || 'sem chip'}</div>
                  </div>
                ))}
              </div>
            )}
            {searchInfo && <div className="jrc-hint" style={{ color: searchInfo.ok ? '#1c6b39' : '#b3261e' }}>{searchInfo.text}</div>}
          </div>

          <div className="jrc-field">
            <label>Modelo do rastreador</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="" disabled>Selecione o modelo…</option>
              {Object.keys(MODELS).map((k) => <option key={k} value={k}>{MODELS[k].name}</option>)}
            </select>
          </div>

          <div className="jrc-row">
            <div className="jrc-field" style={{ flex: 1 }}>
              <label>Operadora (APN)</label>
              <select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                {Object.keys(APNS).map((k) => <option key={k} value={k}>{APNS[k].name}</option>)}
              </select>
            </div>
            <div className="jrc-field" style={{ width: 110 }}>
              <label>Intervalo (s)</label>
              <input type="number" min="1" value={intervalSec} onChange={(e) => setIntervalSec(parseInt(e.target.value, 10) || 20)} />
            </div>
          </div>
          {aDef && <div className="jrc-hint">APN: <b>{aDef.apn}</b> · usuário: <b>{aDef.login}</b> · senha: <b>{aDef.senha}</b></div>}

          <div className="jrc-field">
            <label>Número do chip do rastreador (destino)</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ex: +55 65 99999-9999" autoComplete="off" />
          </div>

          {mDef && (mDef.fields || []).map((f) => (
            <div className="jrc-field" key={f.key}>
              <label>{f.label}</label>
              <input value={fields[f.key] ?? ''} placeholder={f.placeholder || ''}
                onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}

          <button className="jrc-btn primary" onClick={generateConfig}>Gerar comandos de configuração</button>

          {extras && (
            <div className="jrc-quick">
              <div className="jrc-quick-title">
                Comandos rápidos
                <span className={`jrc-conf ${extras.conf}`}>
                  {extras.conf === 'alta' ? 'confiabilidade alta' : extras.conf === 'media' ? 'confira em bancada' : 'baixa — confirme em bancada'}
                </span>
              </div>
              <div className="jrc-quick-grid">
                {extrasList.map((c, i) => (
                  <button key={i} className={`jrc-qbtn ${c.danger ? 'danger' : ''}`} onClick={() => runQuick(c, i)}>{c.label}</button>
                ))}
              </div>
              {extras.note && <div className="jrc-note">⚠ {extras.note}</div>}
            </div>
          )}
        </div>

        {/* MENSAGENS / COMANDOS */}
        <div className="jrc-card jrc-msgs">
          {commands.length === 0 ? (
            <div className="jrc-empty">Busque o veículo ou escolha o modelo, depois gere a configuração ou use um comando rápido. Os comandos aparecem aqui prontos para enviar.</div>
          ) : (
            <>
              <div className="jrc-day">{title}</div>
              {warn.map((n, i) => <div className="jrc-warn" key={i}>⚠ {n}</div>)}
              {commands.map((cmd, i) => (
                <div className="jrc-step" key={i}>
                  <div className="jrc-stepno">
                    Comando {i + 1} de {commands.length}
                    {statuses[i] && <span className={`jrc-badge ${statuses[i]}`}>{BADGE_LABEL[statuses[i]]}</span>}
                  </div>
                  <div className={`jrc-bubble ${statuses[i] === 'sent' ? 'sent' : statuses[i] === 'sending' ? 'sending' : ''}`}>
                    <div className="jrc-cmd">{cmd}</div>
                    <div className="jrc-bactions">
                      <button className="jrc-act" onClick={() => copy(cmd)}>Copiar</button>
                      <a className="jrc-act send" href={smsHref(phone, cmd)}>Abrir SMS</a>
                    </div>
                  </div>
                </div>
              ))}

              {auto.show && (
                <div className="jrc-auto">
                  <div className="jrc-prog"><div className="jrc-bar" style={{ width: progress + '%' }} /></div>
                  <div className="jrc-astatus">{auto.statusMsg}</div>
                  {auto.log.length > 0 && <div className="jrc-log">{auto.log.map((l, i) => <div key={i}>{l}</div>)}</div>}
                  <div className="jrc-arow">
                    {auto.running ? (
                      <>
                        <button className="jrc-btn ghost" onClick={togglePause}>{paused ? 'Continuar' : 'Pausar'}</button>
                        <button className="jrc-btn gray" onClick={cancelAuto}>Cancelar</button>
                      </>
                    ) : (
                      <button className="jrc-btn ghost" onClick={() => setAuto((a) => ({ ...a, show: false }))}>Fechar</button>
                    )}
                  </div>
                </div>
              )}

              <div className="jrc-footer">
                <button className="jrc-btn go" onClick={startAuto} disabled={auto.running}>
                  ▶ Enviar automático (cada {intervalSec}s){!gateway.configured ? ' — demo' : ''}
                </button>
                <button className="jrc-btn ghost" onClick={() => copy(commands.join('\n'))}>Copiar todos</button>
              </div>
              {!gateway.configured && (
                <div className="jrc-note">O envio automático está em modo demonstração. Configure o gateway de SMS (celular pareado) para disparar de verdade.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.jrc{max-width:980px;margin:0 auto}
.jrc-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.jrc-head h1{font-size:20px;margin:0}
.jrc-mode{font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px}
.jrc-mode.demo{background:#eef3fb;color:#2b4a73;border:1px solid #c5d8f2}
.jrc-mode.real{background:#eafaef;color:#1c6b39;border:1px solid #b6e6c6}
.jrc-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
@media(max-width:820px){.jrc-grid{grid-template-columns:1fr}}
.jrc-card{background:#fff;border:1px solid #e2e6ec;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.jrc-field{margin-bottom:11px;position:relative}
.jrc-row{display:flex;gap:10px}
.jrc label{display:block;font-size:12.5px;font-weight:600;color:#41474f;margin-bottom:5px}
.jrc input,.jrc select{width:100%;padding:10px 12px;font-size:15px;border:1px solid #cdd3dc;border-radius:9px;background:#fff;outline:none}
.jrc input:focus,.jrc select:focus{border-color:#d32027;box-shadow:0 0 0 3px rgba(211,32,39,.12)}
.jrc-hint{font-size:11.5px;color:#6b7280;margin-top:5px;line-height:1.4}
.jrc-results{position:absolute;left:0;right:0;top:100%;z-index:20;background:#fff;border:1px solid #cdd3dc;border-radius:0 0 10px 10px;max-height:280px;overflow:auto;box-shadow:0 8px 20px rgba(0,0,0,.12)}
.jrc-res{padding:9px 12px;border-bottom:1px solid #f0f2f5;cursor:pointer}
.jrc-res:hover{background:#f6f8fb}
.jrc-res.muted{color:#6b7280;cursor:default}
.jrc-pl{font-weight:700;font-size:14px}
.jrc-meta{font-size:11.5px;color:#6b7280;margin-top:2px}
.jrc-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:6px;background:#eef3ec;color:#2f6b3a;margin-left:6px}
.jrc-tag.miss{background:#fdecec;color:#b3261e}
.jrc-btn{width:100%;padding:11px;font-size:14px;font-weight:700;border:none;border-radius:9px;cursor:pointer;color:#fff;background:#d32027}
.jrc-btn.primary{margin-top:4px}
.jrc-btn.go{background:#1f9d55}
.jrc-btn.ghost{background:#eef1f5;color:#374151}
.jrc-btn.gray{background:#8a929c}
.jrc-btn:disabled{opacity:.6;cursor:default}
.jrc-quick{margin-top:14px;border-top:1px dashed #d8dde4;padding-top:12px}
.jrc-quick-title{font-size:12.5px;font-weight:700;color:#41474f;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.jrc-conf{font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:8px}
.jrc-conf.alta{background:#eafaef;color:#1c6b39}.jrc-conf.media{background:#fff6e6;color:#946a00}.jrc-conf.baixa{background:#fdecec;color:#b3261e}
.jrc-quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.jrc-qbtn{padding:10px;font-size:13px;font-weight:600;border:1px solid #cdd3dc;border-radius:9px;background:#fff;color:#27313d;cursor:pointer;text-align:left}
.jrc-qbtn:hover{background:#f6f8fb}
.jrc-qbtn.danger{border-color:#f0b8b4;background:#fef5f4;color:#b3261e}
.jrc-note{font-size:11px;color:#7a5a17;background:#fff6e6;border:1px solid #f3d79a;border-radius:8px;padding:7px 9px;margin-top:9px;line-height:1.4}
.jrc-msgs{background:#eef1f5;min-height:200px}
.jrc-empty{color:#6b7280;font-size:13.5px;text-align:center;padding:30px 16px;line-height:1.5}
.jrc-day{text-align:center;font-size:11px;color:#5b6471;background:#d7dce4;padding:4px 12px;border-radius:20px;width:max-content;max-width:100%;margin:0 auto 12px}
.jrc-warn{background:#fff6e6;border:1px solid #f3d79a;color:#7a5a17;font-size:12px;padding:8px 10px;border-radius:8px;margin-bottom:10px;line-height:1.4}
.jrc-step{display:flex;flex-direction:column;align-items:flex-end;margin-bottom:12px}
.jrc-stepno{font-size:11px;color:#7a828d;margin:0 2px 4px 0;display:flex;align-items:center;gap:6px}
.jrc-badge{font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:10px}
.jrc-badge.wait{background:#e7e9ee;color:#5b6471}.jrc-badge.sending{background:#fff1cf;color:#946a00}
.jrc-badge.sent{background:#1f9d55;color:#fff}.jrc-badge.fail{background:#e23b32;color:#fff}
.jrc-bubble{max-width:94%;background:#dcf8c6;border:1px solid #c5ecae;border-radius:14px 14px 4px 14px;padding:10px 12px 8px}
.jrc-bubble.sent{outline:2px solid rgba(31,157,85,.35)}.jrc-bubble.sending{outline:2px solid rgba(211,150,0,.45)}
.jrc-cmd{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.45;color:#13351b;white-space:pre-wrap;word-break:break-all}
.jrc-bactions{display:flex;gap:8px;margin-top:8px;justify-content:flex-end}
.jrc-act{font-size:12.5px;font-weight:600;padding:6px 11px;border-radius:8px;border:1px solid #cfe2cf;background:#eef3ec;color:#2f6b3a;cursor:pointer;text-decoration:none}
.jrc-act.send{background:#1f9d55;color:#fff;border-color:#1f9d55}
.jrc-auto{background:#fff;border:1px solid #e2e6ec;border-radius:10px;padding:12px;margin:6px 0 10px}
.jrc-prog{height:9px;background:#e7eaef;border-radius:6px;overflow:hidden}
.jrc-bar{height:100%;background:linear-gradient(90deg,#1f9d55,#27c06a);transition:width .4s}
.jrc-astatus{font-size:13px;font-weight:600;margin:8px 0 4px;color:#27313d}
.jrc-log{font-size:11.5px;color:#5b6471;max-height:90px;overflow:auto;background:#f7f9fb;border:1px solid #eef1f5;border-radius:8px;padding:7px 9px;line-height:1.5}
.jrc-arow{display:flex;gap:10px;margin-top:10px}
.jrc-footer{display:flex;gap:10px;margin-top:6px}
`;
