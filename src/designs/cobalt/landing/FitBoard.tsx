import { sampleRanking } from "./sample-ranking";

export function FitBoard() {
  return (
    <div className="co-gl co-board">
      <div className="co-bhead">
        <h3>Fit ranking for your needs list</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="co-chip co-chip-n">Sample data</span>
          <span className="co-chip">12 matches</span>
        </div>
      </div>
      {sampleRanking.map((row) => (
        <div className={row.picked ? "co-brow co-sel" : "co-brow"} key={row.id}>
          <div className="co-n">
            Provider {row.id}
            <small>Name masked</small>
          </div>
          <div className="co-track" style={{ ["--v" as string]: `${row.score}%` }}>
            <i />
            <b>{row.note}</b>
          </div>
          <div className="co-sc">{row.score}</div>
        </div>
      ))}
      <div className="co-bfoot">
        <span className="co-lbl">2 of 5 contenders picked</span>
        <span className="co-lbl">Names unlock after advisor review</span>
      </div>
    </div>
  );
}
