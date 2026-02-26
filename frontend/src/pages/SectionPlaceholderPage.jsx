export default function SectionPlaceholderPage({ title, subtitle, notes = [] }) {
  return (
    <section className="panel placeholder-panel">
      <div className="placeholder-hero">
        <p className="eyebrow">Planned Section</p>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      <div className="placeholder-grid">
        {notes.map((note) => (
          <article className="placeholder-tile" key={note.title}>
            <h3>{note.title}</h3>
            <p>{note.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

