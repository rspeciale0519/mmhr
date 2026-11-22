export function PageHead({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="co-pagehead">
      <div>
        {kicker ? <span className="co-lbl">{kicker}</span> : null}
        <h1 className="co-pt" style={kicker ? { marginTop: 10 } : undefined}>{title}</h1>
        {description ? <p className="co-ps">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
