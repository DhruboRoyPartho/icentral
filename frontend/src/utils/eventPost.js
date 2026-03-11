const EVENT_TYPES = new Set(['EVENT', 'EVENT_RECAP']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeRules(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  if (typeof value !== 'string') return [];

  return value
    .split(/\r?\n|;/)
    .map((item) => normalizeText(item.replace(/^[-*]\s*/, '')))
    .filter(Boolean);
}

export function isEventPostType(value) {
  return EVENT_TYPES.has(String(value || '').trim().toUpperCase());
}

export function isVolunteerEligibleEvent(post) {
  return String(post?.type || '').trim().toUpperCase() === 'EVENT';
}

export function getEventDetailsRef(post) {
  if (!Array.isArray(post?.refs)) return null;
  return post.refs.find((ref) => String(ref?.service || '').trim().toLowerCase() === 'event-details') || null;
}

export function getEventMetadata(post) {
  const ref = getEventDetailsRef(post);
  const metadata = ref?.metadata && typeof ref.metadata === 'object' ? ref.metadata : {};
  const location = normalizeText(
    metadata.location
    ?? metadata.venue
    ?? metadata.place
    ?? metadata.address
  );
  const contactInfo = normalizeText(
    metadata.contactInfo
    ?? metadata.contact
    ?? metadata.contactEmail
    ?? metadata.contact_email
  );
  const rsvpUrl = normalizeText(
    metadata.rsvpUrl
    ?? metadata.registrationUrl
    ?? metadata.rsvp
  );
  const organizerNotes = normalizeText(
    metadata.organizerNotes
    ?? metadata.notes
    ?? metadata.description
  );
  const rules = normalizeRules(metadata.rules ?? metadata.guidelines ?? metadata.instructions);
  const startsAt = normalizeIsoDate(
    metadata.startsAt
    ?? metadata.startAt
    ?? metadata.start_date
    ?? metadata.date
  );
  const endsAt = normalizeIsoDate(
    metadata.endsAt
    ?? metadata.endAt
    ?? metadata.end_date
  );
  const isRecap = String(post?.type || '').trim().toUpperCase() === 'EVENT_RECAP';

  return {
    startsAt,
    endsAt,
    location,
    contactInfo,
    rsvpUrl,
    organizerNotes,
    rules,
    isRecap,
    hasMeaningfulData: Boolean(startsAt || endsAt || location || contactInfo || rsvpUrl || organizerNotes || rules.length > 0),
  };
}

export function isEventOver(post) {
  const metadata = getEventMetadata(post);
  const endCandidate = metadata.endsAt || metadata.startsAt;
  if (!endCandidate) return false;
  return new Date(endCandidate).getTime() < Date.now();
}

export function buildVolunteerEnrollmentInitialValues(user) {
  const preferredName = normalizeText(
    user?.full_name
    ?? user?.fullName
    ?? user?.name
  );
  const email = normalizeText(user?.email);

  return {
    fullName: preferredName,
    contactInfo: email,
    reason: '',
    availability: '',
    notes: '',
  };
}
