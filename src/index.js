import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const PROCESSOS_MPS = ["GP", "GRE", "GQA", "GCO", "GPR", "MED", "AMP"];
const TABS = ["Sprint", "Kanban", "Burndown", "Evidências MPS.br", "Impedimentos", "Histórico"];

const EVIDENCIAS = {
  GP: ["Plano do sprint documentado", "Backlog priorizado", "Daily realizada"],
  GRE: ["Riscos identificados", "Plano de mitigação"],
  GQA: ["Checklist de qualidade aplicado", "Revisão de código"],
  GCO: ["Itens de configuração identificados", "Baseline definida"],
  GPR: ["Tarefas definidas e estimadas", "Progresso monitorado"],
  MED: ["Métricas coletadas"],
  AMP: ["Melhorias identificadas"],
};

const DEFAULT_CHECKS = Object.fromEntries(
  Object.entries(EVIDENCIAS).flatMap(([p, items]) => items.map((_, i) => [`${p}_${i}`, false]))
);

const STATUS_MAP = {
  "to do": "todo", "a fazer": "todo", "open": "todo", "aberto": "todo",
  "in progress": "in_progress", "em progresso": "in_progress", "in_progress": "in_progress",
  "done": "done", "concluído": "done", "concluido": "done", "closed": "done", "fechado": "done",
};

const STATUS_LABEL = { todo: "A Fazer", in_progress: "Em Progresso", done: "Concluído" };
const STATUS_COLOR = {
  todo: { bg: "#E6F1FB", text: "#0C447C", border: "#B5D4F4" },
  in_progress: { bg: "#FAEEDA", text: "#633806", border: "#FAC775" },
  done: { bg: "#EAF3DE", text: "#27500A", border: "#C0DD97" },
};

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
  return lines.slice(1).map((line, idx) => {
    const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || line.split(",");
    const row = Object.fromEntries(headers.map((h, i) => [h, (cols[i] || "").replace(/"/g, "").trim()]));
    const rawStatus = (row["status"] || "").toLowerCase();
    const status = STATUS_MAP[rawStatus] || "todo";
    const pontos = parseInt(row["story points"] || row["pontos"] || row["points"] || row["story_points"] || "3") || 3;
    const processo = (row["processo"] || row["label"] || row["labels"] || row["epic"] || "GP").toUpperCase().substring(0, 3);
    const proc = PROCESSOS_MPS.includes(processo) ? processo : "GP";
    return {
      id: idx + 1,
      titulo: row["summary"] || row["titulo"] || row["title"] || row["nome"] || `Tarefa ${idx + 1}`,
      status,
      pontos,
      processo: proc,
    };
  }).filter(t => t.titulo);
}

function gerarBurndown(tarefas, capacidade) {
  const total = tarefas.reduce((s, t) => s + t.pontos, 0) || capacidade;
  const dias = 8;
  return Array.from({ length: dias }, (_, i) => ({
    dia: `D${i + 1}`,
    ideal: Math.max(0, Math.round(total - (total / (dias - 1)) * i)),
    real: i < 7 ? Math.max(0, Math.round(total - (total * 0.55 / (dias - 1)) * i)) : null,
  }));
}

export default function App() {
  const [tab, setTab] = useState("Sprint");
  const [tarefas, setTarefas] = useState([]);
  const [impedimentos, setImpedimentos] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [checks, setChecks] = useState(DEFAULT_CHECKS);
  const [sprint, setSprint] = useState({ nome: "Sprint 1", inicio: "", fim: "", time: "SGHx 1", capacidade: 40 });
  const [novaT, setNovaT] = useState({ titulo: "", pontos: 3, processo: "GP", status: "todo" });
  const [novaI, setNovaI] = useState({ descricao: "", responsavel: "", prazo: "", status: "aberto" });
  const [showFormT, setShowFormT] = useState(false);
  const [showFormI, setShowFormI] = useState(false);
  const [csvMsg, setCsvMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const fileRef = useRef();

  // Load from storage
  useEffect(() => {
    async function load() {
      try {
        const keys = ["sprint_tarefas", "sprint_impedimentos", "sprint_historico", "sprint_checks", "sprint_info"];
        const results = await Promise.allSettled(keys.map(k => window.storage.get(k)));
        const [t, imp, hist, ch, sp] = results.map(r => r.status === "fulfilled" && r.value ? JSON.parse(r.value.value) : null);
        if (t) setTarefas(t);
        if (imp) setImpedimentos(imp);
        if (hist) setHistorico(hist);
        if (ch) setChecks(ch);
        if (sp) setSprint(sp);
      } catch (_) {}
      setLoading(false);
    }
    load();
  }, []);

  const save = async (key, val) => {
    try { await window.storage.set(key, JSON.stringify(val)); } catch (_) {}
  };

  const updateTarefas = v => { setTarefas(v); save("sprint_tarefas", v); };
  const updateImpedimentos = v => { setImpedimentos(v); save("sprint_impedimentos", v); };
  const updateChecks = v => { setChecks(v); save("sprint_checks", v); };
  const updateSprint = v => { setSprint(v); save("sprint_info", v); };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    if (!parsed.length) { setCsvMsg("Nenhuma tarefa encontrada. Verifique o formato do CSV."); return; }
    updateTarefas(parsed);
    setCsvMsg(`${parsed.length} tarefas importadas com sucesso!`);
    setTimeout(() => setCsvMsg(""), 4000);
    setTab("Kanban");
  };

  const finalizarSprint = () => {
    const done = tarefas.filter(t => t.status === "done");
    const entry = { sprint: sprint.nome, concluidas: done.length, pontos: done.reduce((s, t) => s + t.pontos, 0), velocidade: done.reduce((s, t) => s + t.pontos, 0) };
    const novo = [...historico, entry];
    setHistorico(novo);
    save("sprint_historico", novo);
  };

  const moveTask = (id, dir) => {
    const order = ["todo", "in_progress", "done"];
    const updated = tarefas.map(t => {
      if (t.id !== id) return t;
      const idx = order.indexOf(t.status);
      const next = order[idx + dir];
      return next ? { ...t, status: next } : t;
    });
    updateTarefas(updated);
  };

  const addTarefa = () => {
    if (!novaT.titulo.trim()) return;
    const updated = [...tarefas, { ...novaT, id: Date.now() }];
    updateTarefas(updated);
    setNovaT({ titulo: "", pontos: 3, processo: "GP", status: "todo" });
    setShowFormT(false);
  };

  const addImpedimento = () => {
    if (!novaI.descricao.trim()) return;
    const updated = [...impedimentos, { ...novaI, id: Date.now() }];
    updateImpedimentos(updated);
    setNovaI({ descricao: "", responsavel: "", prazo: "", status: "aberto" });
    setShowFormI(false);
  };

  const toggleImpedimento = id => {
    const updated = impedimentos.map(i => i.id === id ? { ...i, status: i.status === "aberto" ? "resolvido" : "aberto" } : i);
    updateImpedimentos(updated);
  };

  const done = tarefas.filter(t => t.status === "done");
  const inProg = tarefas.filter(t => t.status === "in_progress");
  const todo = tarefas.filter(t => t.status === "todo");
  const totalPontos = tarefas.reduce((s, t) => s + t.pontos, 0);
  const pontosDone = done.reduce((s, t) => s + t.pontos, 0);
  const pct = totalPontos ? Math.round((pontosDone / totalPontos) * 100) : 0;
  const totalChecks = Object.keys(checks).length;
  const checkedCount = Object.values(checks).filter(Boolean).length;
  const pctMPS = totalChecks ? Math.round((checkedCount / totalChecks) * 100) : 0;
  const abertos = impedimentos.filter(i => i.status === "aberto").length;
  const burndown = gerarBurndown(tarefas, sprint.capacidade);

  if (loading) return <div style={{ padding: "2rem", color: "var(--color-text-secondary)", fontSize: 14 }}>Carregando dados...</div>;

  return (
    <div style={{ fontFamily: "var(--font-sans)", padding: "1rem 0", maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--color-text-primary)" }}>{sprint.nome} — {sprint.time}</p>
          {sprint.inicio && <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>{sprint.inicio} → {sprint.fim}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { label: "Progresso", val: `${pct}%`, color: "#639922" },
            { label: "Evidências MPS", val: `${pctMPS}%`, color: "#185FA5" },
            { label: "Impedimentos", val: abertos, color: abertos > 0 ? "#BA7517" : "#639922" },
          ].map(m => (
            <div key={m.label} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "8px 14px", minWidth: 90, textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{m.label}</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 500, color: m.color }}>{m.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CSV Import bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)", flex: 1 }}>Importe seu CSV do Jira para popular o board automaticamente</span>
        <button onClick={() => fileRef.current.click()} style={{ fontSize: 12, padding: "6px 14px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
          Importar CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSV} />
        {csvMsg && <span style={{ fontSize: 12, color: csvMsg.includes("sucesso") ? "#1D9E75" : "#D85A30" }}>{csvMsg}</span>}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ border: "none", background: "none", cursor: "pointer", padding: "8px 14px", fontSize: 13, fontWeight: tab === t ? 500 : 400, color: tab === t ? "var(--color-text-primary)" : "var(--color-text-secondary)", borderBottom: tab === t ? "2px solid var(--color-text-primary)" : "2px solid transparent", marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      {/* Sprint */}
      {tab === "Sprint" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            <div style={{ gridColumn: "1/-1", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem" }}>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500 }}>Configuração do sprint</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, flexWrap: "wrap" }}>
                {[
                  { label: "Nome", key: "nome", type: "text" },
                  { label: "Time", key: "time", type: "text" },
                  { label: "Início", key: "inicio", type: "date" },
                  { label: "Fim", key: "fim", type: "date" },
                  { label: "Capacidade (pts)", key: "capacidade", type: "number" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>{f.label}</label>
                    <input type={f.type} value={sprint[f.key]} onChange={e => updateSprint({ ...sprint, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })} style={{ width: "100%", fontSize: 12, boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[{ l: "Total", v: tarefas.length }, { l: "Concluídas", v: done.length }, { l: "Em progresso", v: inProg.length }, { l: "A fazer", v: todo.length }, { l: "Pontos entregues", v: `${pontosDone}/${totalPontos}` }].map(m => (
              <div key={m.l} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "12px 16px" }}>
                <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{m.l}</p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>{m.v}</p>
              </div>
            ))}
          </div>
          {tarefas.length > 0 && (
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 12 }}>
              <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 500 }}>Distribuição por processo</p>
              {PROCESSOS_MPS.map(proc => {
                const pts = tarefas.filter(t => t.processo === proc).reduce((s, t) => s + t.pontos, 0);
                const ptsD = tarefas.filter(t => t.processo === proc && t.status === "done").reduce((s, t) => s + t.pontos, 0);
                if (!pts) return null;
                return (
                  <div key={proc} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, width: 36, color: "var(--color-text-secondary)" }}>{proc}</span>
                    <div style={{ flex: 1, height: 8, background: "var(--color-background-secondary)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((ptsD / pts) * 100)}%`, height: "100%", background: "#1D9E75", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)", width: 60, textAlign: "right" }}>{ptsD}/{pts} pts</span>
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={finalizarSprint} style={{ fontSize: 13, padding: "8px 18px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "none", color: "var(--color-text-secondary)" }}>
            Finalizar sprint e salvar no histórico
          </button>
        </div>
      )}

      {/* Kanban */}
      {tab === "Kanban" && (
        <div>
          {tarefas.length === 0 && (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)", fontSize: 13, border: "0.5px dashed var(--color-border-secondary)", borderRadius: 12, marginBottom: 16 }}>
              Nenhuma tarefa ainda. Importe um CSV do Jira ou adicione manualmente.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {["todo", "in_progress", "done"].map(st => (
              <div key={st} style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{STATUS_LABEL[st]}</span>
                  <span style={{ fontSize: 11, background: STATUS_COLOR[st].bg, color: STATUS_COLOR[st].text, border: `0.5px solid ${STATUS_COLOR[st].border}`, borderRadius: 12, padding: "2px 8px" }}>{tarefas.filter(t => t.status === st).length}</span>
                </div>
                {tarefas.filter(t => t.status === st).map(t => (
                  <div key={t.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 13, lineHeight: 1.4 }}>{t.titulo}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, background: "#E6F1FB", color: "#185FA5", borderRadius: 4, padding: "1px 6px" }}>{t.processo}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{t.pontos} pts</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {st !== "todo" && <button onClick={() => moveTask(t.id, -1)} style={{ fontSize: 11, padding: "2px 8px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "none", color: "var(--color-text-secondary)" }}>← Voltar</button>}
                      {st !== "done" && <button onClick={() => moveTask(t.id, 1)} style={{ fontSize: 11, padding: "2px 8px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", borderRadius: 4, background: "none", color: "var(--color-text-secondary)" }}>Avançar →</button>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            {!showFormT ? (
              <button onClick={() => setShowFormT(true)} style={{ fontSize: 13, padding: "8px 16px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "none", color: "var(--color-text-secondary)" }}>+ Adicionar tarefa</button>
            ) : (
              <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <input value={novaT.titulo} onChange={e => setNovaT(p => ({ ...p, titulo: e.target.value }))} placeholder="Título da tarefa" style={{ flex: 2, minWidth: 180, fontSize: 13 }} />
                <select value={novaT.processo} onChange={e => setNovaT(p => ({ ...p, processo: e.target.value }))} style={{ fontSize: 13 }}>
                  {PROCESSOS_MPS.map(p => <option key={p}>{p}</option>)}
                </select>
                <input type="number" value={novaT.pontos} onChange={e => setNovaT(p => ({ ...p, pontos: Number(e.target.value) }))} style={{ width: 60, fontSize: 13 }} min={1} max={21} />
                <button onClick={addTarefa} style={{ fontSize: 13, padding: "8px 14px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "none" }}>Salvar</button>
                <button onClick={() => setShowFormT(false)} style={{ fontSize: 13, padding: "8px 14px", cursor: "pointer", border: "none", background: "none", color: "var(--color-text-secondary)" }}>Cancelar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Burndown */}
      {tab === "Burndown" && (
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem 1.25rem" }}>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500 }}>Burndown do sprint</p>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--color-text-secondary)" }}>Pontos restantes por dia</p>
          <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12, color: "var(--color-text-secondary)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 20, height: 2, background: "#378ADD", display: "inline-block" }}></span> Ideal</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 20, height: 2, borderTop: "2px dashed #D85A30", display: "inline-block" }}></span> Real</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={burndown} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="ideal" stroke="#378ADD" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="real" stroke="#D85A30" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Evidências */}
      {tab === "Evidências MPS.br" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>{checkedCount} de {totalChecks} evidências confirmadas</p>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#185FA5" }}>{pctMPS}%</span>
          </div>
          {Object.entries(EVIDENCIAS).map(([proc, items]) => (
            <div key={proc} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{proc}</span>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{items.filter((_, i) => checks[`${proc}_${i}`]).length}/{items.length}</span>
              </div>
              {items.map((item, i) => (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "5px 0", borderBottom: i < items.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                  <input type="checkbox" checked={!!checks[`${proc}_${i}`]} onChange={() => { const v = { ...checks, [`${proc}_${i}`]: !checks[`${proc}_${i}`] }; updateChecks(v); }} />
                  <span style={{ fontSize: 13, color: checks[`${proc}_${i}`] ? "var(--color-text-secondary)" : "var(--color-text-primary)", textDecoration: checks[`${proc}_${i}`] ? "line-through" : "none" }}>{item}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Impedimentos */}
      {tab === "Impedimentos" && (
        <div>
          {impedimentos.length === 0 && (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)", fontSize: 13, border: "0.5px dashed var(--color-border-secondary)", borderRadius: 12, marginBottom: 16 }}>
              Nenhum impedimento registrado.
            </div>
          )}
          {impedimentos.map(imp => (
            <div key={imp.id} style={{ background: "var(--color-background-primary)", border: `0.5px solid ${imp.status === "aberto" ? "#FAC775" : "var(--color-border-tertiary)"}`, borderLeft: `3px solid ${imp.status === "aberto" ? "#BA7517" : "#1D9E75"}`, borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <p style={{ margin: "0 0 6px", fontSize: 14, flex: 1 }}>{imp.descricao}</p>
                <span style={{ fontSize: 11, background: imp.status === "aberto" ? "#FAEEDA" : "#EAF3DE", color: imp.status === "aberto" ? "#633806" : "#27500A", borderRadius: 12, padding: "2px 10px", whiteSpace: "nowrap" }}>{imp.status === "aberto" ? "Aberto" : "Resolvido"}</span>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--color-text-secondary)" }}>
                <span>Responsável: {imp.responsavel}</span>
                {imp.prazo && <span>Prazo: {imp.prazo}</span>}
              </div>
              <button onClick={() => toggleImpedimento(imp.id)} style={{ marginTop: 8, fontSize: 12, padding: "4px 12px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, background: "none", color: "var(--color-text-secondary)" }}>
                {imp.status === "aberto" ? "Marcar como resolvido" : "Reabrir"}
              </button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            {!showFormI ? (
              <button onClick={() => setShowFormI(true)} style={{ fontSize: 13, padding: "8px 16px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "none", color: "var(--color-text-secondary)" }}>+ Registrar impedimento</button>
            ) : (
              <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <input value={novaI.descricao} onChange={e => setNovaI(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição do impedimento" style={{ flex: 2, minWidth: 200, fontSize: 13 }} />
                <input value={novaI.responsavel} onChange={e => setNovaI(p => ({ ...p, responsavel: e.target.value }))} placeholder="Responsável" style={{ flex: 1, minWidth: 120, fontSize: 13 }} />
                <input type="date" value={novaI.prazo} onChange={e => setNovaI(p => ({ ...p, prazo: e.target.value }))} style={{ fontSize: 13 }} />
                <button onClick={addImpedimento} style={{ fontSize: 13, padding: "8px 14px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "none" }}>Salvar</button>
                <button onClick={() => setShowFormI(false)} style={{ fontSize: 13, padding: "8px 14px", cursor: "pointer", border: "none", background: "none", color: "var(--color-text-secondary)" }}>Cancelar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Histórico */}
      {tab === "Histórico" && (
        <div>
          {historico.length === 0 && (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)", fontSize: 13, border: "0.5px dashed var(--color-border-secondary)", borderRadius: 12 }}>
              Nenhum sprint finalizado ainda. Use o botão "Finalizar sprint" na aba Sprint.
            </div>
          )}
          {historico.length > 0 && (
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    {["Sprint", "Tarefas concluídas", "Pontos entregues", "Velocidade"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, fontSize: 12, color: "var(--color-text-secondary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h, i) => (
                    <tr key={i} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                      <td style={{ padding: "10px 16px" }}>{h.sprint}</td>
                      <td style={{ padding: "10px 16px" }}>{h.concluidas}</td>
                      <td style={{ padding: "10px 16px" }}>{h.pontos} pts</td>
                      <td style={{ padding: "10px 16px" }}>{h.velocidade} pts/sprint</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}