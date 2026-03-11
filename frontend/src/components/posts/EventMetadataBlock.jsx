import { getEventMetadata } from '../../utils/eventPost';

function formatDateTime(value) {
  if (!value) return 'TBA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function EventMetadataBlock({ post, variant = 'card' }) {
  const metadata = getEventMetadata(post);
  const title = metadata.isRecap ? 'Event Recap Details' : 'Event Details';

  if (!metadata.hasMeaningfulData) {
    return (
      <section className={`event-meta-block is-${variant}`} aria-label={title}>
        <div className="event-meta-head">
          <span className="event-kicker">{metadata.isRecap ? 'Recap' : 'Event'}</span>
          <strong>{title}</strong>
        </div>
        <p className="event-meta-empty">Specific scheduling details have not been published yet.</p>
      </section>
    );
  }

  return (
    <section className={`event-meta-block is-${variant}`} aria-label={title}>
      <div className="event-meta-head">
        <span className="event-kicker">{metadata.isRecap ? 'Recap' : 'Event'}</span>
        <strong>{title}</strong>
      </div>

      <div className="event-meta-grid">
        {metadata.startsAt && (
          <div className="event-meta-item">
            <span>Starts</span>
            <strong>{formatDateTime(metadata.startsAt)}</strong>
          </div>
        )}
        {metadata.endsAt && (
          <div className="event-meta-item">
            <span>{metadata.isRecap ? 'Finished' : 'Ends'}</span>
            <strong>{formatDateTime(metadata.endsAt)}</strong>
          </div>
        )}
        {metadata.location && (
          <div className="event-meta-item">
            <span>Location</span>
            <strong>{metadata.location}</strong>
          </div>
        )}
        {metadata.contactInfo && (
          <div className="event-meta-item">
            <span>Contact</span>
            <strong>{metadata.contactInfo}</strong>
          </div>
        )}
      </div>

      {metadata.rules.length > 0 && (
        <div className="event-meta-section">
          <span className="event-meta-label">Rules</span>
          <ul className="event-rule-list">
            {metadata.rules.map((rule, index) => (
              <li key={`${rule}-${index}`}>{rule}</li>
            ))}
          </ul>
        </div>
      )}

      {metadata.organizerNotes && (
        <div className="event-meta-section">
          <span className="event-meta-label">Notes</span>
          <p>{metadata.organizerNotes}</p>
        </div>
      )}

      {metadata.rsvpUrl && (
        <div className="event-meta-section">
          <span className="event-meta-label">RSVP</span>
          <a href={metadata.rsvpUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
            Open RSVP Link
          </a>
        </div>
      )}
    </section>
  );
}
