import { useEffect, useRef } from "react";
import { slotLabel } from "../lib/time.js";
import { ASK_EXAMPLES, TEACH_EXAMPLES } from "../data/mock.js";

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

function Message({ m, activeOptionsId, onHover, onBook }) {
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
    </div>
  );
}

export default function ChatPanel({ messages, busy, input, setInput, onSend, activeOptionsId, onHover, onBook, hasFacts, onLoadDemo, loadingDemo }) {
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
      <div className="mg-chat-log" role="log" aria-live="polite">
        {messages.map((m) => (
          <Message key={m.id} m={m} activeOptionsId={activeOptionsId} onHover={onHover} onBook={onBook} />
        ))}
        {busy && <div className="mg-msg-bot mg-typing">{busy}…</div>}
        <div ref={end} />
      </div>
      <div className="mg-input-row">
        <textarea
          rows={2}
          value={input}
          placeholder="Schedule a meeting with Jake, Alyssa, and Brad"
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
      <details className="mg-json" open={!hasFacts}>
        <summary>Teach it about your team</summary>
        <div className="mg-chips">
          <button className="mg-btn small ghost" disabled={!!busy || loadingDemo} onClick={onLoadDemo}>{loadingDemo ? "Teaching" : "Teach it all six"}</button>
          {TEACH_EXAMPLES.map((x) => (
            <button key={x} className="mg-chip" disabled={!!busy} onClick={() => submit(x)}>{x}</button>
          ))}
        </div>
      </details>
    </section>
  );
}
