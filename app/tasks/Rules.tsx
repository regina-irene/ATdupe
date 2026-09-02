"use client";
import { useCallback, useEffect, useState } from "react";

const FIELDS = [
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "who", label: "Who" },
  { id: "closed", label: "Done" },
];

type Rule = { id: number; when_field: string; when_value: string; then_field: string; then_value: string | null; active: boolean };

export default function Rules({ statuses, priorities, users, onChanged }: {
  statuses: string[]; priorities: string[]; users: string[]; onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Rule[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ when_field: "status", when_value: "", then_field: "who", then_value: "" });

  const load = useCallback(() => {
    fetch("/api/task-rules").then((r) => r.json()).then((j) => { if (!j.error) setRows(j.rows || []); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // The choices depend on which field the rule is looking at.
  const valuesFor = (f: string) =>
    f === "status" ? statuses : f === "priority" ? priorities : f === "who" ? users : ["true", "false"];
  const labelFor = (f: string, v: string | null) =>
    f === "closed" ? (String(v) === "true" ? "done" : "not done") : (v || "empty");

  async function add() {
    if (!form.when_value) { setMsg("Pick what the rule should watch for."); return; }
    const j = await (await fetch("/api/task-rules", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
    })).json();
    if (j.error) { setMsg(j.error); return; }
    setForm({ ...form, when_value: "", then_value: "" });
    setMsg("Rule added.");
    load(); onChanged?.();
  }
  async function toggle(r: Rule) {
    await fetch("/api/task-rules/" + r.id, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !r.active }),
    });
    load(); onChanged?.();
  }
  async function remove(r: Rule) {
    if (!confirm("Remove this rule?")) return;
    await fetch("/api/task-rules/" + r.id, { method: "DELETE" });
    load(); onChanged?.();
  }

  return (
    <div className="card noprint" data-tone="task">
      <h2>Automations</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        When you change one field, another follows. Rules run on every edit, from the board or anywhere else.
        Anything you set by hand in the same edit wins over the rule.
      </p>

      {rows.length ? (
        <div className="feed" style={{ marginBottom: 10 }}>
          {rows.map((r) => (
            <div className="feedrow" key={r.id} style={{ cursor: "default" }}>
              <span className={"tag " + (r.active ? "k-task" : "")}>{r.active ? "On" : "Off"}</span>
              <span className="feedmain">
                <b>
                  When <u>{FIELDS.find((f) => f.id === r.when_field)?.label}</u> is{" "}
                  <u>{labelFor(r.when_field, r.when_value)}</u>, set{" "}
                  <u>{FIELDS.find((f) => f.id === r.then_field)?.label}</u> to{" "}
                  <u>{labelFor(r.then_field, r.then_value)}</u>
                </b>
              </span>
              <button className="btn ghost sm" onClick={() => toggle(r)}>{r.active ? "Pause" : "Resume"}</button>
              <button className="btn ghost sm" onClick={() => remove(r)}>Remove</button>
            </div>
          ))}
        </div>
      ) : <p className="muted small">No rules yet.</p>}

      <div className="row filterrow" style={{ marginTop: 0 }}>
        <div><label className="f">When</label>
          <select value={form.when_field} style={{ width: 118 }}
            onChange={(e) => setForm({ ...form, when_field: e.target.value, when_value: "" })}>
            {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select></div>
        <div style={{ flex: 1 }}><label className="f">is</label>
          <select value={form.when_value} onChange={(e) => setForm({ ...form, when_value: e.target.value })}>
            <option value="">-</option>
            {valuesFor(form.when_field).map((v) => <option key={v} value={v}>{labelFor(form.when_field, v)}</option>)}
          </select></div>
        <div><label className="f">then set</label>
          <select value={form.then_field} style={{ width: 118 }}
            onChange={(e) => setForm({ ...form, then_field: e.target.value, then_value: "" })}>
            {FIELDS.filter((f) => f.id !== form.when_field).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select></div>
        <div style={{ flex: 1 }}><label className="f">to</label>
          <select value={form.then_value} onChange={(e) => setForm({ ...form, then_value: e.target.value })}>
            <option value="">empty</option>
            {valuesFor(form.then_field).map((v) => <option key={v} value={v}>{labelFor(form.then_field, v)}</option>)}
          </select></div>
        <button className="btn primary sm" onClick={add}>Add</button>
      </div>
      {msg ? <p className="muted small" style={{ marginBottom: 0 }}>{msg}</p> : null}
    </div>
  );
}
