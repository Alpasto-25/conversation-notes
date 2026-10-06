export function UpdateChanges({ changes, title = '本次更新' }: { changes?: string[]; title?: string }) {
  if (!changes?.length) return null;
  return <section className="update-changes" aria-label={title}>
    <h4>{title}</h4>
    <ul>{changes.map((change, i) => <li key={i}>{change}</li>)}</ul>
  </section>;
}
