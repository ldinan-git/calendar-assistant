import { useEffect, useRef } from "react";
import { slotLabel } from "../lib/time.js";
import { ASK_EXAMPLES } from "../data/mock.js";

const NL = String.fromCharCode(10);

function Callouts({ items }) {
  return (
    <div className="mg-tagrow">
      {items.map((c, i) => (
        <span key={i} className={"mg-tag " + c.kind}>{c.text}</span>
      ))}
    </div>
  );
}

function Options({ msg, active, onHover, onBook }) {
  return (
    <div className="mg-opts">
      {msg.options.map((o, i) => (
        <div key={o.id} className="mg-opt" onMouseEnter={() => active && onHover(o)} onMouseLeave={() => onHover(null)}>
          <div className="mg-opt-top"><b>{i === 0 ? "Best: " : ""}{slotLabel(o)}</b> <span className="mg-small">your time (CT)</span></div>
          <div className="mg-opt-head">{o.headline}</div>
          <p>{o.reasoning}</p>
          <Callouts items={o.callouts} />
          <button className="mg-btn small" disabled={!active} onClick={() => onBook(i + 1)}>Book this</button>
        </div>
      ))}
    </div>
  );
}

function Booked({ b }) {
  return (
    <div className="mg-booked">
      <div className="mg-booked-title">Booked: {b.title}</div>
      <div>{b.when}</div>
      <ul>
        <li><b>Calendar:</b> {b.calendar}, because {b.calendarReason}. Sent from {b.account}.</li>
        <li><b>Video:</b> <a href={b.joinUrl} target="_blank" rel="noreferrer">{b.providerLabel}</a>, because {b.providerReason}.</li>
        <li><b>Synced:</b> {b.mirroredTo.length ? `Busy block written to ${b.mirroredTo.join(" and ")}, so no calendar shows you free.` : "Nothing else to sync."}</li>
        <li><b>Invites:</b> {b.invitees.length ? b.invitees.join("; ") : "none, just you"}</li>
        {b.moves.map((m, i) => (<li key={i}><b>Moved:</b> {m}</li>))}
      </ul>
      <details className="mg-json"><summary>Messages sent</summary><p className="mg-small">{b.inviteMessage}</p>{b.bumpMessage && <p className="mg-small">{b.bumpMessage}</p>}</details>
    </div>
  );
}

function Fixes({ fixes, applied, onApply, busy }) {
  const open = fixes.filter((f) => f.canApply && !applied.has(f.id));
  return (
    <div className="mg-fixes">
      {fixes.map((f) => {
        const done = applied.has(f.id);
        return (
          <div key={f.id} className={"mg-fix" + (done ? " done" : "")}>
            <div className="mg-fix-top"><b>{f.keep.title}</b> <span className="mg-small">{f.keep.when}</span></div>
            <div className="mg-fix-move">
              {f.canApply ? (
                <>Move <b>{f.move.title}</b> ({f.move.calendar}) from {f.move.from} to <b>{f.to}</b></>
              ) : (
                <>Can't move <b>{f.move.title}</b> automatically</>
              )}
            </div>
            <p className="mg-small">{f.reason}.</p>
            {f.note && <p className="mg-small mg-note">Note to {f.move.with.join(", ")}: {f.note}</p>}
            {f.canApply && (done ? <span className="mg-tag ok">Done</span> : <button className="mg-btn small" disabled={busy} onClick={() => onApply([f])}>Apply</button>)}
          </div>
        );
      })}
      {open.length > 1 && <button className="mg-btn small" disabled={busy} onClick={() => onApply(fixes)}>Apply all {open.length}</button>}
    </div>
  );
}

function Message({ m, activeOptionsId, onHover, onBook, applied, onApplyFixes, onSuggest, busy }) {
  if (m.kind === "user") return <div className="mg-msg-user">{m.text}</div>;
  return (
    <div className="mg-msg-bot">
      {m.text && <p>{m.text}</p>}
      {m.notes && m.notes.length > 0 && (
        <ul className="mg-ctx">
          {m.notes.map((n) => (<li key={n.name}>{n.text.startsWith(n.name) ? n.text : <><b>{n.name}</b>: {n.text}</>}</li>))}
        </ul>
      )}
      {m.kind === "options" && <Options msg={m} active={m.id === activeOptionsId} onHover={onHover} onBook={onBook} />}
      {m.kind === "booked" && <Booked b={m.booked} />}
      {m.kind === "fixes" && <Fixes fixes={m.fixes} applied={applied} onApply={onApplyFixes} busy={busy} />}
      {m.actions && m.actions.length > 0 && (
        <div className="mg-actions">
          {m.actions.map((a) => (<button key={a.label} className="mg-btn small ghost" disabled={busy} onClick={() => onSuggest(a.text)}>{a.label}</button>))}
        </div>
      )}
    </div>
  );
}

const kbMeta = (f) =>
  [
    f.type === "person" ? `person: ${f.name}` : f.type.replace("_", " "),
    f.priority && `priority ${f.priority}`,
    f.never_reschedule ? "never reschedule" : f.flexibility && `flexibility ${f.flexibility}`,
    f.working_hours && `works ${f.working_hours.start} to ${f.working_hours.end} ${f.working_hours.timezone}`,
    f.trigger && f.trigger.event_type && `on every ${f.trigger.event_type}`,
    f.trigger && f.trigger.attendee && `around ${f.trigger.attendee}`,
    f.type === "buffer_rule" && `${f.buffer_before_min || 0} min before, ${f.buffer_after_min || 0} after`,
  ]
    .filter(Boolean)
    .join(", ");

/** The knowledge base lives inside the assistant: one list the model reads, with the structure code uses under each line. */
function KnowledgeDrawer({ kb, onDelete, onClear }) {
  return (
    <details className="mg-kb">
      <summary>Knowledge base <span className="mg-count">{kb.length}</span></summary>
      {kb.length === 0 ? (
        <p className="mg-empty">Nothing yet. Tell the assistant who is who and how you like your calendar run.</p>
      ) : (
        <>
          <ul className="mg-facts">
            {kb.map((e) => (
              <li key={e.id}>
                <div>
                  <div className="mg-fact-sum">{e.text}</div>
                  {(e.facts || []).map((f) => (<div key={f.id} className="mg-fact-meta">{kbMeta(f)}</div>))}
                </div>
                <button className="mg-x" aria-label={"Forget: " + e.text} onClick={() => onDelete(e.id)}>×</button>
              </li>
            ))}
          </ul>
          <button className="mg-btn small ghost" onClick={onClear}>Forget everything</button>
        </>
      )}
    </details>
  );
}

export default function ChatPanel({ messages, busy, input, setInput, onSend, activeOptionsId, onHover, onBook, quick = [], kb = [], onDeleteKb, onClearKb, applied = new Set(), onApplyFixes, onSuggest }) {
  const end = useRef(null);
  useEffect(() => {
    end.current && end.current.scrollIntoView({ block: "end" });
  }, [messages, busy]);
  const submit = (text) => {
    if (text.trim() && !busy) onSend(text);
  };
  return (
    <section className="mg-card mg-chat">
      <h2>Assistant</h2>
      <KnowledgeDrawer kb={kb} onDelete={onDeleteKb} onClear={onClearKb} />
      <div className="mg-chat-log" role="log" aria-live="polite">
        {messages.map((m) => (
          <Message key={m.id} m={m} activeOptionsId={activeOptionsId} onHover={onHover} onBook={onBook} applied={applied} onApplyFixes={onApplyFixes} onSuggest={onSuggest} busy={!!busy} />
        ))}
        {busy && <div className="mg-msg-bot mg-typing">{busy}…</div>}
        <div ref={end} />
      </div>
      <div className="mg-input-row">
        <textarea
          rows={2}
          value={input}
          placeholder="Paste or type anything. Shift+Enter for a new line."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
        />
        <button className="mg-btn" disabled={!!busy || !input.trim()} onClick={() => submit(input)}>Send</button>
      </div>
      <div className="mg-chips">
        {ASK_EXAMPLES.map((x) => (
          <button key={x} className="mg-chip" disabled={!!busy} onClick={() => submit(x)}>{x}</button>
        ))}
      </div>
      {quick.length > 0 && (
        <details className="mg-json">
          <summary>More prompts to click</summary>
          <div className="mg-chips">
            {quick.map((x) => (
              <button key={x} className="mg-chip" disabled={!!busy} onClick={() => submit(x)}>{x.split(NL)[0] + (x.includes(NL) ? " (+ more lines)" : "")}</button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
