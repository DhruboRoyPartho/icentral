import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { createJobApplication, getJobDetailsFromPost } from '../utils/jobPortalStorage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read CV file.'));
    reader.readAsDataURL(file);
  });
}

const initialFormState = {
  name: '',
  studentId: '',
  currentYear: '',
  description: '',
  contactInformation: '',
};

export default function JobApplicationPage() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const [jobPost, setJobPost] = useState(null);
  const [loadingPost, setLoadingPost] = useState(true);
  const [postError, setPostError] = useState('');
  const [banner, setBanner] = useState({ type: 'idle', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formState, setFormState] = useState(() => ({
    ...initialFormState,
    name: String(user?.full_name || user?.name || '').trim(),
  }));
  const [cvFile, setCvFile] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPost() {
      if (!postId) {
        setLoadingPost(false);
        setPostError('Missing job post id.');
        return;
      }

      setLoadingPost(true);
      setPostError('');
      try {
        const result = await apiRequest(`/posts/posts/${postId}`);
        if (!isMounted) return;

        const post = result?.data || null;
        if (!post || String(post?.type || '').toUpperCase() !== 'JOB') {
          setPostError('This post is not a job post.');
          setJobPost(null);
          return;
        }

        setJobPost(post);
      } catch (error) {
        if (!isMounted) return;
        setPostError(error.message);
      } finally {
        if (isMounted) setLoadingPost(false);
      }
    }

    loadPost();
    return () => {
      isMounted = false;
    };
  }, [postId]);

  function updateFormField(field, value) {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }

  function handleCvChange(event) {
    const [file] = Array.from(event.target.files || []);
    if (!file) {
      setCvFile(null);
      return;
    }

    const maxBytes = 4 * 1024 * 1024;
    if (file.size > maxBytes) {
      setBanner({ type: 'error', message: 'CV file is too large. Maximum size is 4 MB.' });
      event.target.value = '';
      setCvFile(null);
      return;
    }

    setCvFile(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isAuthenticated) {
      setBanner({ type: 'error', message: 'Sign in to submit a job application.' });
      return;
    }

    if (!jobPost) {
      setBanner({ type: 'error', message: 'Job post not loaded. Try refreshing this page.' });
      return;
    }

    if (String(jobPost.authorId || '') === String(user?.id || '')) {
      setBanner({ type: 'error', message: 'You cannot apply to your own job post.' });
      return;
    }

    const name = formState.name.trim();
    const studentId = formState.studentId.trim();
    const currentYear = formState.currentYear.trim();
    const description = formState.description.trim();
    const contactInformation = formState.contactInformation.trim();

    if (!name || !studentId || !currentYear || !description || !contactInformation || !cvFile) {
      setBanner({ type: 'error', message: 'All fields including CV upload are required.' });
      return;
    }

    setSubmitting(true);
    try {
      const cvDataUrl = await readFileAsDataUrl(cvFile);
      if (!cvDataUrl) {
        setBanner({ type: 'error', message: 'Could not read CV file. Please choose the file again.' });
        return;
      }

      const details = getJobDetailsFromPost(jobPost);
      await createJobApplication({
        postId: jobPost.id,
        postAuthorId: jobPost.authorId,
        applicantUserId: user?.id || null,
        applicantName: name,
        studentId,
        currentYear,
        description,
        contactInformation,
        cvFileName: cvFile.name,
        cvFileType: cvFile.type,
        cvFileSize: cvFile.size,
        cvDataUrl,
        jobTitle: details.jobTitle,
        companyName: details.companyName,
      });

      setBanner({ type: 'success', message: 'Application submitted. The job poster has been notified.' });
      setFormState({
        ...initialFormState,
        name: String(user?.full_name || user?.name || '').trim(),
      });
      setCvFile(null);

      setTimeout(() => {
        navigate('/job-portal');
      }, 700);
    } catch (error) {
      setBanner({ type: 'error', message: error.message || 'Could not submit application.' });
    } finally {
      setSubmitting(false);
    }
  }

  const jobDetails = jobPost ? getJobDetailsFromPost(jobPost) : null;

  return (
    <div className="moderation-page job-application-page">
      {banner.message && (
        <section className={`banner banner-${banner.type === 'error' ? 'error' : 'success'}`} aria-live="polite">
          <p>{banner.message}</p>
          <button type="button" onClick={() => setBanner({ type: 'idle', message: '' })}>Dismiss</button>
        </section>
      )}

      <section className="panel job-portal-overview-panel">
        <div className="job-portal-overview-head">
          <div>
            <p className="eyebrow">Job Application</p>
            <h2>Submit Your Application</h2>
            <p>Provide accurate profile details and a strong CV to maximize your selection chances.</p>
          </div>
          <div className="job-overview-stats">
            <div className="job-overview-stat-card">
              <span>Required sections</span>
              <strong>3</strong>
            </div>
            <div className="job-overview-stat-card">
              <span>CV max size</span>
              <strong>4 MB</strong>
            </div>
          </div>
        </div>
      </section>

      {!isAuthenticated && (
        <section className="panel">
          <div className="inline-alert warn-alert">
            <p>
              You need to sign in before applying.
              <Link to="/login"> Sign in</Link>
            </p>
          </div>
        </section>
      )}

      <section className="job-application-layout">
        <section className="panel job-application-main-panel">
          {loadingPost ? (
            <p>Loading job post...</p>
          ) : postError ? (
            <div className="inline-alert" role="alert">
              <p>{postError}</p>
              <Link className="btn btn-soft" to="/job-portal">Back to Job Portal</Link>
            </div>
          ) : (
            <form className="stacked-form job-application-form" onSubmit={handleSubmit}>
              <div className="job-form-block">
                <div className="job-form-block-head">
                  <p className="eyebrow">Applicant Details</p>
                  <h3>Personal Information</h3>
                </div>
                <div className="field-row two-col">
                  <label>
                    <span>Name</span>
                    <input
                      type="text"
                      placeholder="Your full name"
                      value={formState.name}
                      onChange={(e) => updateFormField('name', e.target.value)}
                      disabled={!isAuthenticated || submitting}
                    />
                  </label>
                  <label>
                    <span>Student ID</span>
                    <input
                      type="text"
                      placeholder="Your university student ID"
                      value={formState.studentId}
                      onChange={(e) => updateFormField('studentId', e.target.value)}
                      disabled={!isAuthenticated || submitting}
                    />
                  </label>
                </div>

                <label>
                  <span>Current Year</span>
                  <input
                    type="text"
                    placeholder="e.g. 4th Year"
                    value={formState.currentYear}
                    onChange={(e) => updateFormField('currentYear', e.target.value)}
                    disabled={!isAuthenticated || submitting}
                  />
                </label>
              </div>

              <div className="job-form-block">
                <div className="job-form-block-head">
                  <p className="eyebrow">Application Content</p>
                  <h3>Tell the employer about yourself</h3>
                </div>
                <label>
                  <span>Description</span>
                  <textarea
                    rows={5}
                    placeholder="Write a concise statement about your background, skills, and motivation."
                    value={formState.description}
                    onChange={(e) => updateFormField('description', e.target.value)}
                    disabled={!isAuthenticated || submitting}
                  />
                </label>

                <label>
                  <span>Contact Information</span>
                  <textarea
                    rows={3}
                    placeholder="Provide your email, phone number, or preferred contact method."
                    value={formState.contactInformation}
                    onChange={(e) => updateFormField('contactInformation', e.target.value)}
                    disabled={!isAuthenticated || submitting}
                  />
                </label>
              </div>

              <div className="job-form-block">
                <div className="job-form-block-head">
                  <p className="eyebrow">Attachment</p>
                  <h3>Upload your CV</h3>
                </div>
                <label className="job-cv-field">
                  <span>CV File</span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleCvChange}
                    disabled={!isAuthenticated || submitting}
                  />
                  <small className="composer-tag-hint">Accepted: PDF, DOC, DOCX (max 4 MB)</small>
                  {cvFile && (
                    <div className="job-cv-selected">
                      <strong>Selected</strong>
                      <span>{cvFile.name}</span>
                    </div>
                  )}
                </label>
              </div>

              <div className="feed-card-actions job-apply-actions">
                <button className="btn btn-primary-solid" type="submit" disabled={!isAuthenticated || submitting}>
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </button>
                <Link className="btn btn-soft" to="/job-portal">Cancel</Link>
              </div>
            </form>
          )}
        </section>

        {!loadingPost && !postError && (
          <aside className="panel job-application-side-panel">
            <div className="job-apply-post-summary">
              <p className="eyebrow">Position</p>
              <h3>{jobDetails?.jobTitle}</h3>
              <p><strong>Company:</strong> {jobDetails?.companyName}</p>
              <p><strong>Salary Range:</strong> {jobDetails?.salaryRange}</p>
            </div>

            <div className="job-apply-note-block">
              <h4>Before you submit</h4>
              <p>Ensure your contact details are correct and your CV reflects your latest academic and project work.</p>
            </div>
          </aside>
        )}
      </section>
    </div>
  );
}
