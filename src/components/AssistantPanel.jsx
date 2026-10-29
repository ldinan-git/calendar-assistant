import { ASK_EXAMPLES, EMAILS } from "../data/mock.js";
import { slotLabel } from "../lib/time.js";

export default function AssistantPanel({
  input, setInput, busy, error, options, onRun, onHover, chosen, onChoose, onBack, meta, draft, setDraft, onSend,
}) {
  return (
    <section className="mg-card">
      <h2>Ask for a meeting</h2>
      <div className="mg-input-row">
        <textarea
          rows={2}
          value={input}
          placeholder="Set up 45 minutes with Jake this week"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onRun(input);
            }
          }}
        />
        <button className="mg-btn" disabled={!!busy || !input.trim()} onClick={() => onRun(input)}>Find times</button>
      </div>
      <div className="mg-chips">
        {ASK_EXAMPLES.map((x) => (
          <button key={x} className="mg-chip" disabled={!!busy} onClick={() => { setInput(x); onRun(x); }}>{x}</button>
        ))}
      </div>
      {busy && <p className="mg-msg" aria-live="polite">{busy}…</p>}
      {error && <p className="mg-err">{error}</p>}

      {!chosen && options.length > 0 && (
        <div className="mg-opts">
          {options.map((o, i) => (
            <div key={o.id} className="mg-opt" onMouseEnter={() => onHover(o)} onMouseLeave={() => onHover(null)}>
              <div className="mg-opt-top"><b>{i === 0 ? "Best: " : ""}{slotLabel(o)}</b></div>
              <div className="mg-opt-head">{o.headline}</div>
              <p>{o.reasoning}</p>
              <div className="mg-tagrow">
                {o.b2b && <span className="mg-tag warn">Back-to-back</span>}
                {o.zone && <span className="mg-tag warn">Inside buffer around {o.zone.title}</span>}
                {o.bumps.map((b) => (
                  <span key={b.id} className="mg-tag move">Moves {b.title} to {slotLabel(b.newSlot)}</span>
                ))}
                {!o.b2b && !o.zone && o.bumps.length === 0 && <span className="mg-tag ok">Everyone free, buffers intact</span>}
              </div>
              <button className="mg-btn small" onClick={() => onChoose(o)}>Choose this time</button>
            </div>
          ))}
        </div>
      )}

      {chosen && (
        <div className="mg-draft">
          <h3>Review invite</h3>
          <p className="mg-small">{meta.title}, {slotLabel(chosen)}{meta.attendees.length ? ", with " + meta.attendees.join(", ") : ""}</p>
          {chosen.bumps.map((b) => (
            <p key={b.id} className="mg-moveline">Moves {b.title} to {slotLabel(b.newSlot)}</p>
          ))}
          <label className="mg-label" htmlFor="im">Message to attendees</label>
          <textarea id="im" rows={3} value={draft.invite} onChange={(e) => setDraft((d) => ({ ...d, invite: e.target.value }))} />
          {chosen.bumps.length > 0 && chosen.bumps[0].attendees.some((a) => a !== "You") && (
            <>
              <label className="mg-label" htmlFor="bm">
                Message to {chosen.bumps[0].attendees.filter((a) => a !== "You").join(" and ")} about the move
              </label>
              <textarea id="bm" rows={3} value={draft.bump} onChange={(e) => setDraft((d) => ({ ...d, bump: e.target.value }))} />
            </>
          )}
          <label className="mg-label" htmlFor="em">Send from</label>
          <select id="em" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}>
            {EMAILS.map((m) => (<option key={m}>{m}</option>))}
          </select>
          <div className="mg-row">
            <button className="mg-btn" onClick={onSend}>Send invite</button>
            <button className="mg-btn ghost" onClick={onBack}>Back to options</button>
          </div>
        </div>
      )}
    </section>
  );
}
