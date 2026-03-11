import { useEffect, useState } from 'react';

const EMPTY_FORM = {
  fullName: '',
  contactInfo: '',
  reason: '',
  availability: '',
  notes: '',
};

export default function VolunteerEnrollmentModal({
  open,
  post,
  submitting = false,
  initialValues = EMPTY_FORM,
  onClose,
  onSubmit,
}) {
  const [formValues, setFormValues] = useState({
    fullName: initialValues.fullName || '',
    contactInfo: initialValues.contactInfo || '',
    reason: initialValues.reason || '',
    availability: initialValues.availability || '',
    notes: initialValues.notes || '',
  });

  useEffect(() => {
    if (!open) return undefined;

    function handleEscape(event) {
      if (event.key !== 'Escape' || submitting) return;
      onClose?.();
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const canSubmit = formValues.fullName.trim() && formValues.contactInfo.trim() && formValues.reason.trim();

  return (
    <div
      className="profile-edit-backdrop volunteer-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Volunteer enrollment"
      onClick={() => {
        if (submitting) return;
        onClose?.();
      }}
    >
      <section className="panel profile-edit-modal volunteer-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">Volunteer</p>
            <h3>Enroll for {post?.title || 'this event'}</h3>
          </div>
          <button type="button" className="btn btn-soft" onClick={() => onClose?.()} disabled={submitting}>
            Close
          </button>
        </div>

        <form
          className="stacked-form volunteer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit || submitting) return;
            onSubmit?.({
              fullName: formValues.fullName.trim(),
              contactInfo: formValues.contactInfo.trim(),
              reason: formValues.reason.trim(),
              availability: formValues.availability.trim(),
              notes: formValues.notes.trim(),
            });
          }}
        >
          <label>
            <span>Name <strong className="required-marker">*</strong></span>
            <input
              type="text"
              value={formValues.fullName}
              onChange={(event) => setFormValues((prev) => ({ ...prev, fullName: event.target.value }))}
              disabled={submitting}
            />
          </label>

          <label>
            <span>Contact Info <strong className="required-marker">*</strong></span>
            <input
              type="text"
              placeholder="Email, phone, or preferred contact"
              value={formValues.contactInfo}
              onChange={(event) => setFormValues((prev) => ({ ...prev, contactInfo: event.target.value }))}
              disabled={submitting}
            />
          </label>

          <label>
            <span>Reason for Volunteering <strong className="required-marker">*</strong></span>
            <textarea
              rows={4}
              value={formValues.reason}
              onChange={(event) => setFormValues((prev) => ({ ...prev, reason: event.target.value }))}
              disabled={submitting}
            />
          </label>

          <label>
            <span>Availability</span>
            <textarea
              rows={2}
              placeholder="Preferred times, shifts, or schedule notes"
              value={formValues.availability}
              onChange={(event) => setFormValues((prev) => ({ ...prev, availability: event.target.value }))}
              disabled={submitting}
            />
          </label>

          <label>
            <span>Additional Notes</span>
            <textarea
              rows={3}
              value={formValues.notes}
              onChange={(event) => setFormValues((prev) => ({ ...prev, notes: event.target.value }))}
              disabled={submitting}
            />
          </label>

          <div className="feed-card-actions volunteer-form-actions">
            <button className="btn btn-soft" type="button" onClick={() => onClose?.()} disabled={submitting}>
              Cancel
            </button>
            <button className="btn btn-primary-solid" type="submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Submitting...' : 'Confirm Enrollment'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
