import { INCOMING } from "../data/mock.js";
import { slotLabel } from "../lib/time.js";

export function InvitePanel({ invite, inviteCount, onSimulate, onAccept, onDecline, onFindAnother }) {
  return (
    <section className="mg-card">
      <h2>Incoming invites</h2>
      {!invite && (
        <button className="mg-btn ghost" disabled={inviteCount >= INCOMING.length} onClick={onSimulate}>
          {inviteCount >= INCOMING.length ? "No more demo invites" : "Simulate an incoming invite"}
        </button>
      )}
      {invite && (
        <div className="mg-invite">
          <p><b>{invite.event.from}</b> invited you to <b>{invite.event.title}</b></p>
          <p className="mg-small">{slotLabel(invite.event)}</p>
          <div className="mg-tagrow">
            {invite.issues.length === 0 && <span className="mg-tag ok">No issues found</span>}
            {invite.issues.map((x) => (<span key={x} className="mg-tag warn">{x}</span>))}
          </div>
          <p className="mg-advice">{invite.loading ? "Thinking it over…" : invite.advice}</p>
          <div className="mg-row">
            <button className="mg-btn small" onClick={onAccept}>Accept</button>
            <button className="mg-btn small ghost" onClick={onFindAnother}>Find another time</button>
            <button className="mg-btn small ghost" onClick={onDecline}>Decline</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function HeadsUpPanel({ items }) {
  return (
    <section className="mg-card">
      <h2>Heads-up</h2>
      {items.length === 0 && <p className="mg-empty">No conflicts, back-to-backs, or soft-hold warnings.</p>}
      <ul className="mg-heads">
        {items.map((h, i) => (<li key={i} className={h.kind}>{h.text}</li>))}
      </ul>
    </section>
  );
}

export function ActivityPanel({ log }) {
  if (!log.length) return null;
  return (
    <section className="mg-card">
      <h2>Activity</h2>
      <ul className="mg-sent">
        {log.map((s) => (
          <li key={s.id}>{s.lines.map((l, i) => (<p key={i}>{l}</p>))}</li>
        ))}
      </ul>
    </section>
  );
}
