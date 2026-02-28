import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const initialForm = {
  studentId: '',
  currentJobInfo: '',
};

async function apiRequest(path, options = {}) {
  const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof data === 'string'
      ? data
      : data?.error || data?.message || 'Request failed';
    throw new Error(message);
  }

  return data;
}

function toDisplayStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'rejected') return 'Rejected';
  return 'Not Submitted';
}

export default function AlumniVerificationPage() {
  const imageInputRef = useRef(null);
  const { token, user, isAuthenticated, setAuthSession } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [idCardImage, setIdCardImage] = useState(null);
  const [loadingState, setLoadingState] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('not_submitted');
  const [application, setApplication] = useState(null);
  const [banner, setBanner] = useState({ type: 'idle', message: '' });

  const role = String(user?.role || '').toLowerCase();
  const isAlumni = role === 'alumni';
  const canSubmitApplication = isAuthenticated && isAlumni && verificationStatus !== 'pending' && verificationStatus !== 'approved';

  function syncAuthVerificationState(status) {
    if (!token || !user) return;
    setAuthSession({
      token,
      user: {
        ...user,
        alumniVerificationStatus: status,
        isVerifiedAlumni: status === 'approved',
      },
    });
  }

  async function loadMyVerification() {
    if (!isAuthenticated || !isAlumni) return;
    setLoadingState(true);
    try {
      const result = await apiRequest('/users/alumni-verification/me');
      const state = result?.data || {};
      const status = state.status || 'not_submitted';
      setVerificationStatus(status);
      setApplication(state.application || null);
      syncAuthVerificationState(status);
    } catch (error) {
      setBanner({ type: 'error', message: `Could not load verification status: ${error.message}` });
    } finally {
      setLoadingState(false);
    }
  }

  useEffect(() => {
    loadMyVerification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAlumni]);

  function openImagePicker() {
    imageInputRef.current?.click();
  }

  function clearSelectedImage() {
    setIdCardImage(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function handleImageSelected(event) {
    const [file] = Array.from(event.target.files || []);
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setBanner({ type: 'error', message: 'Only image files are supported.' });
      return;
    }

    const maxBytes = 900 * 1024;
    if (file.size > maxBytes) {
      setBanner({ type: 'error', message: 'Image is too large. Please choose one under 900 KB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        setBanner({ type: 'error', message: 'Could not read selected image.' });
        return;
      }

      setIdCardImage({
        dataUrl,
        fileName: file.name,
      });
    };
    reader.onerror = () => {
      setBanner({ type: 'error', message: 'Failed to load selected image.' });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmitApplication) return;

    if (!form.studentId.trim() || !form.currentJobInfo.trim() || !idCardImage?.dataUrl) {
      setBanner({
        type: 'error',
        message: 'Student ID, ID card picture, and current job information are all required.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiRequest('/users/alumni-verification/apply', {
        method: 'POST',
        body: JSON.stringify({
          studentId: form.studentId.trim(),
          idCardImageDataUrl: idCardImage.dataUrl,
          currentJobInfo: form.currentJobInfo.trim(),
        }),
      });

      const state = result?.data || {};
      const status = state.status || 'pending';
      setVerificationStatus(status);
      setApplication(state.application || null);
      setForm(initialForm);
      clearSelectedImage();
      syncAuthVerificationState(status);
      setBanner({ type: 'success', message: 'Verification application submitted successfully.' });
    } catch (error) {
      setBanner({ type: 'error', message: `Could not submit application: ${error.message}` });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="moderation-page">
      {banner.message && (
        <section className={`banner banner-${banner.type === 'error' ? 'error' : 'success'}`} aria-live="polite">
          <p>{banner.message}</p>
          <button type="button" onClick={() => setBanner({ type: 'idle', message: '' })}>Dismiss</button>
        </section>
      )}

      <section className="panel placeholder-panel">
        <div className="placeholder-hero">
          <p className="eyebrow">Alumni Verification</p>
          <h2>Apply for Verified Alumni Status</h2>
          <p>
            Verified alumni can publish job posts in the Job Portal.
            Submit your details below and faculty/admin reviewers will process your request.
          </p>
        </div>
      </section>

      {!isAuthenticated && (
        <section className="panel">
          <div className="inline-alert warn-alert">
            <p>
              Please <Link to="/login">sign in</Link> first to submit alumni verification.
            </p>
          </div>
        </section>
      )}

      {isAuthenticated && !isAlumni && (
        <section className="panel">
          <div className="inline-alert warn-alert">
            <p>Only alumni accounts can apply for alumni verification.</p>
          </div>
        </section>
      )}

      {isAuthenticated && isAlumni && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Status</p>
              <h3>{loadingState ? 'Checking verification...' : toDisplayStatus(verificationStatus)}</h3>
            </div>
            <span className="pill">{verificationStatus === 'approved' ? 'Verified Alumni' : 'Verification Required'}</span>
          </div>

          {application && (
            <div className="api-note">
              <p><strong>Student ID:</strong> {application.studentId || 'N/A'}</p>
              <p><strong>Current Job Info:</strong> {application.currentJobInfo || 'N/A'}</p>
              {application.reviewNote && <p><strong>Review Note:</strong> {application.reviewNote}</p>}
            </div>
          )}

          {verificationStatus === 'approved' && (
            <div className="inline-alert">
              <p>Your alumni account is verified. You can post job opportunities in the Job Portal.</p>
            </div>
          )}

          {verificationStatus === 'pending' && (
            <div className="inline-alert warn-alert">
              <p>Your application is pending faculty/admin review. You will be able to post jobs after approval.</p>
            </div>
          )}

          <form className="stacked-form" onSubmit={handleSubmit}>
            <label>
              <span>Student ID</span>
              <input
                type="text"
                placeholder="Enter your student ID"
                value={form.studentId}
                onChange={(event) => setForm((prev) => ({ ...prev, studentId: event.target.value }))}
                disabled={!canSubmitApplication}
              />
            </label>

            <label>
              <span>Current Job Information</span>
              <textarea
                placeholder="Share your current role, company, and relevant profile details."
                value={form.currentJobInfo}
                onChange={(event) => setForm((prev) => ({ ...prev, currentJobInfo: event.target.value }))}
                disabled={!canSubmitApplication}
              />
            </label>

            <div className="field-row">
              <span className="eyebrow">ID Card Picture</span>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="composer-image-input"
                onChange={handleImageSelected}
                disabled={!canSubmitApplication}
              />
              <div className="dashboard-action-row">
                <button type="button" className="btn btn-soft" onClick={openImagePicker} disabled={!canSubmitApplication}>
                  Upload ID Card
                </button>
                {idCardImage && (
                  <button type="button" className="btn btn-soft" onClick={clearSelectedImage}>
                    Remove
                  </button>
                )}
              </div>

              {idCardImage && (
                <div className="composer-image-preview">
                  <img src={idCardImage.dataUrl} alt={idCardImage.fileName || 'Selected ID card'} />
                  <div className="composer-image-meta">
                    <p>{idCardImage.fileName}</p>
                  </div>
                </div>
              )}
            </div>

            <button type="submit" className="btn btn-accent" disabled={submitting || !canSubmitApplication}>
              {submitting ? 'Submitting...' : 'Submit Verification Application'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
