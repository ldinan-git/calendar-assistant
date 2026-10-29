import { useState } from "react";
import { PEOPLE } from "../data/mock.js";

/** Adding a person to your team is separate from adding their calendar. */
export default function AddTeammate({ roster, onAdd }) {
  const [name, setName] = useState("");
  const options = PEOPLE.filter((p) => !roster.includes(p));
  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(PEOPLE.find((p) => p.toLowerCase() === n.toLowerCase()) || n);
    setName("");
  };
  return (
    <div className="mg-add">
      <input
        list="mg-people-options"
        value={name}
        placeholder="Add a teammate"
        aria-label="Add a teammate"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <datalist id="mg-people-options">{options.map((p) => (<option key={p} value={p} />))}</datalist>
      <button className="mg-btn small" disabled={!name.trim()} onClick={submit}>Add</button>
    </div>
  );
}
