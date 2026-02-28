require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json({ limit: '5mb' }));

const PORT = Number(process.env.PORT) || 3001;

const CONFIG = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    schema: process.env.USER_SERVICE_SCHEMA || 'public',
    jwtSecret: process.env.JWT_SECRET || 'HelloWorldKey',
    tables: {
        users: process.env.USERS_TABLE || 'users',
        alumniVerificationApplications: process.env.ALUMNI_VERIFICATION_TABLE || 'alumni_verification_applications',
        userNotificationStates: process.env.USER_NOTIFICATION_STATE_TABLE || 'user_notification_states',
        userNotificationReads: process.env.USER_NOTIFICATION_READS_TABLE || 'user_notification_reads',
    },
};

const supabase = (CONFIG.supabaseUrl && CONFIG.supabaseKey)
    ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
        auth: { persistSession: false },
        db: { schema: CONFIG.schema },
    })
    : null;

function isSupabaseConfigured() {
    return Boolean(supabase);
}

function isMissingTableError(error) {
    return error?.code === '42P01';
}

function parseIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function normalizeTimestamp(value) {
    if (value === undefined || value === null || value === '') {
        return { value: null };
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return { error: 'Invalid timestamp' };
    }

    return { value: parsed.toISOString() };
}

function formatSupabaseError(error) {
    if (!error) return 'Unknown database error';
    return error.message || error.details || 'Unknown database error';
}

function verificationSchemaError(res) {
    return res.status(500).json({
        error: `Missing table "${CONFIG.tables.alumniVerificationApplications}". Run services/user-service/schema.sql first.`,
    });
}

function dbUnavailable(res) {
    return res.status(503).json({
        error: 'User service database is not configured',
        requiredEnv: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    });
}

function ensureDb(req, res, next) {
    if (!isSupabaseConfigured()) {
        return dbUnavailable(res);
    }
    return next();
}

function isModeratorRole(role) {
    const normalized = String(role || '').toLowerCase();
    return normalized === 'admin' || normalized === 'faculty';
}

function getRequestUser(req) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return null;

    const token = header.slice(7).trim();
    if (!token) return null;

    try {
        return jwt.verify(token, CONFIG.jwtSecret);
    } catch {
        return null;
    }
}

function ensureAuthenticated(req, res, next) {
    const requestUser = getRequestUser(req);
    if (!requestUser?.id) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    req.requestUser = requestUser;
    return next();
}

function ensureModerator(req, res, next) {
    if (!isModeratorRole(req.requestUser?.role)) {
        return res.status(403).json({ error: 'Only faculty/admin can access this route.' });
    }
    return next();
}

async function getUserById(userId) {
    const { data, error } = await supabase
        .from(CONFIG.tables.users)
        .select('id, full_name, email, role, university_id, session')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        throw error;
    }
    return data || null;
}

function mapApplicant(userRow) {
    if (!userRow) return null;
    return {
        id: userRow.id,
        fullName: userRow.full_name || null,
        email: userRow.email || null,
        role: userRow.role || null,
        universityId: userRow.university_id || null,
        session: userRow.session || null,
    };
}

function mapVerificationApplication(row, applicant = null) {
    if (!row) return null;
    return {
        id: row.id,
        applicantId: row.applicant_id,
        studentId: row.student_id,
        idCardImageDataUrl: row.id_card_image_data_url,
        currentJobInfo: row.current_job_info,
        status: row.status,
        reviewNote: row.review_note || null,
        reviewedBy: row.reviewed_by || null,
        reviewedAt: row.reviewed_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        applicant,
    };
}

function resolveStateFromApplications(rows) {
    const applications = Array.isArray(rows) ? rows : [];
    const approved = applications.find((item) => item.status === 'approved');
    if (approved) {
        return { status: 'approved', isVerified: true, application: approved };
    }

    const pending = applications.find((item) => item.status === 'pending');
    if (pending) {
        return { status: 'pending', isVerified: false, application: pending };
    }

    const rejected = applications.find((item) => item.status === 'rejected');
    if (rejected) {
        return { status: 'rejected', isVerified: false, application: rejected };
    }

    return { status: 'not_submitted', isVerified: false, application: null };
}

async function getApplicantVerificationState(applicantId) {
    const { data, error } = await supabase
        .from(CONFIG.tables.alumniVerificationApplications)
        .select('*')
        .eq('applicant_id', applicantId)
        .order('created_at', { ascending: false });

    if (error) {
        throw error;
    }

    return resolveStateFromApplications(data || []);
}

function parseApplicationInput(body = {}) {
    const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : '';
    const currentJobInfo = typeof body.currentJobInfo === 'string' ? body.currentJobInfo.trim() : '';
    const idCardImageDataUrl = typeof body.idCardImageDataUrl === 'string' ? body.idCardImageDataUrl.trim() : '';
    const errors = [];

    if (!studentId) {
        errors.push('studentId is required');
    }
    if (!currentJobInfo) {
        errors.push('currentJobInfo is required');
    }
    if (!idCardImageDataUrl) {
        errors.push('idCardImageDataUrl is required');
    } else if (!idCardImageDataUrl.startsWith('data:image/')) {
        errors.push('idCardImageDataUrl must be a valid image data URL');
    }

    if (studentId.length > 120) {
        errors.push('studentId is too long');
    }
    if (currentJobInfo.length > 5000) {
        errors.push('currentJobInfo is too long');
    }
    if (idCardImageDataUrl.length > 2_000_000) {
        errors.push('idCardImageDataUrl is too large');
    }

    return { studentId, currentJobInfo, idCardImageDataUrl, errors };
}

function laterIso(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

app.get('/', (req, res) => {
    return res.json({
        health: 'User service OK',
        supabaseConfigured: isSupabaseConfigured(),
        endpoints: [
            'GET /alumni-verification/me',
            'POST /alumni-verification/apply',
            'GET /notifications/alumni-verifications',
            'GET /notifications/state',
            'POST /notifications/state/mark-read',
            'PATCH /notifications/alumni-verifications/:id',
        ],
    });
});

app.get('/health', (req, res) => {
    return res.json({
        service: 'user-service',
        status: 'ok',
        supabaseConfigured: isSupabaseConfigured(),
    });
});

app.get('/alumni-verification/me', ensureDb, ensureAuthenticated, async (req, res) => {
    try {
        const user = await getUserById(req.requestUser.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (String(user.role || '').toLowerCase() !== 'alumni') {
            return res.status(403).json({ error: 'Only alumni accounts can request alumni verification.' });
        }

        const state = await getApplicantVerificationState(user.id);
        return res.json({
            data: {
                status: state.status,
                isVerified: state.isVerified,
                application: mapVerificationApplication(state.application, mapApplicant(user)),
            },
        });
    } catch (error) {
        if (isMissingTableError(error)) {
            return verificationSchemaError(res);
        }
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.post('/alumni-verification/apply', ensureDb, ensureAuthenticated, async (req, res) => {
    try {
        const user = await getUserById(req.requestUser.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (String(user.role || '').toLowerCase() !== 'alumni') {
            return res.status(403).json({ error: 'Only alumni accounts can submit verification applications.' });
        }

        const state = await getApplicantVerificationState(user.id);
        if (state.status === 'approved') {
            return res.status(409).json({ error: 'Your alumni account is already verified.' });
        }
        if (state.status === 'pending') {
            return res.status(409).json({ error: 'You already have a pending application.' });
        }

        const input = parseApplicationInput(req.body);
        if (input.errors.length) {
            return res.status(400).json({ error: 'Validation failed', details: input.errors });
        }

        const { data, error } = await supabase
            .from(CONFIG.tables.alumniVerificationApplications)
            .insert({
                applicant_id: user.id,
                student_id: input.studentId,
                id_card_image_data_url: input.idCardImageDataUrl,
                current_job_info: input.currentJobInfo,
                status: 'pending',
                updated_at: new Date().toISOString(),
            })
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        return res.status(201).json({
            message: 'Verification application submitted.',
            data: {
                status: 'pending',
                isVerified: false,
                application: mapVerificationApplication(data, mapApplicant(user)),
            },
        });
    } catch (error) {
        if (isMissingTableError(error)) {
            return verificationSchemaError(res);
        }
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.get('/notifications/alumni-verifications', ensureDb, ensureAuthenticated, async (req, res) => {
    try {
        const requestRole = String(req.requestUser?.role || '').toLowerCase();
        const moderatorView = isModeratorRole(requestRole);
        const status = typeof req.query.status === 'string'
            ? req.query.status.trim().toLowerCase()
            : (moderatorView ? 'pending' : 'all');
        const allowedStatuses = new Set(['pending', 'approved', 'rejected', 'all']);
        if (!allowedStatuses.has(status)) {
            return res.status(400).json({ error: 'status must be one of: pending, approved, rejected, all' });
        }

        const limit = parseIntInRange(req.query.limit, 20, 1, 100);
        const offset = parseIntInRange(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

        let query = supabase
            .from(CONFIG.tables.alumniVerificationApplications)
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status !== 'all') {
            query = query.eq('status', status);
        }

        if (!moderatorView) {
            if (requestRole === 'alumni') {
                query = query.eq('applicant_id', req.requestUser.id);
            } else {
                return res.json({
                    data: [],
                    pagination: {
                        limit,
                        offset,
                        total: 0,
                    },
                    meta: {
                        recipientRole: requestRole || 'unknown',
                        canReview: false,
                    },
                });
            }
        }

        const { data: rows, error, count } = await query;
        if (error) {
            throw error;
        }

        let applicantById = new Map();
        const applicantIds = [...new Set((rows || []).map((row) => row.applicant_id).filter(Boolean))];

        if (applicantIds.length) {
            if (moderatorView) {
                const { data: applicants, error: applicantError } = await supabase
                    .from(CONFIG.tables.users)
                    .select('id, full_name, email, role, university_id, session')
                    .in('id', applicantIds);

                if (applicantError) {
                    throw applicantError;
                }

                applicantById = new Map((applicants || []).map((applicant) => [applicant.id, mapApplicant(applicant)]));
            } else {
                const currentUser = await getUserById(req.requestUser.id);
                const mapped = mapApplicant(currentUser);
                if (mapped) {
                    applicantById = new Map([[req.requestUser.id, mapped]]);
                }
            }
        }

        return res.json({
            data: (rows || []).map((row) => mapVerificationApplication(row, applicantById.get(row.applicant_id) || null)),
            pagination: {
                limit,
                offset,
                total: count ?? 0,
            },
            meta: {
                recipientRole: requestRole || 'unknown',
                canReview: moderatorView,
            },
        });
    } catch (error) {
        if (isMissingTableError(error)) {
            return verificationSchemaError(res);
        }
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.get('/notifications/state', ensureDb, ensureAuthenticated, async (req, res) => {
    try {
        const { data: stateData, error: stateError } = await supabase
            .from(CONFIG.tables.userNotificationStates)
            .select('user_id, last_seen_at, updated_at')
            .eq('user_id', req.requestUser.id)
            .maybeSingle();

        if (stateError) {
            throw stateError;
        }

        const { data: readRows, error: readError } = await supabase
            .from(CONFIG.tables.userNotificationReads)
            .select('notification_key, read_at')
            .eq('user_id', req.requestUser.id)
            .order('read_at', { ascending: false })
            .limit(500);

        if (readError) {
            throw readError;
        }

        return res.json({
            data: {
                userId: req.requestUser.id,
                lastSeenAt: stateData?.last_seen_at || null,
                updatedAt: stateData?.updated_at || null,
                readKeys: Array.isArray(readRows) ? readRows.map((row) => String(row.notification_key || '')).filter(Boolean) : [],
            },
        });
    } catch (error) {
        if (isMissingTableError(error) && String(error.message || '').includes(CONFIG.tables.userNotificationStates)) {
            return res.status(500).json({
                error: `Missing table "${CONFIG.tables.userNotificationStates}". Run services/user-service/schema.sql first.`,
            });
        }
        if (isMissingTableError(error) && String(error.message || '').includes(CONFIG.tables.userNotificationReads)) {
            return res.status(500).json({
                error: `Missing table "${CONFIG.tables.userNotificationReads}". Run services/user-service/schema.sql first.`,
            });
        }
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.post('/notifications/state/mark-read', ensureDb, ensureAuthenticated, async (req, res) => {
    try {
        const nowIso = new Date().toISOString();
        const parsedTimestamp = normalizeTimestamp(req.body?.lastSeenAt);
        const notificationKey = typeof req.body?.notificationKey === 'string'
            ? req.body.notificationKey.trim()
            : '';

        if (parsedTimestamp.error) {
            return res.status(400).json({ error: parsedTimestamp.error });
        }
        if (!notificationKey && !parsedTimestamp.value) {
            return res.status(400).json({ error: 'Provide lastSeenAt or notificationKey' });
        }

        let finalLastSeenAt = null;
        if (parsedTimestamp.value) {
            const requestedLastSeen = parsedTimestamp.value || nowIso;

            const { data: existingState, error: existingError } = await supabase
                .from(CONFIG.tables.userNotificationStates)
                .select('last_seen_at')
                .eq('user_id', req.requestUser.id)
                .maybeSingle();

            if (existingError) {
                throw existingError;
            }

            finalLastSeenAt = laterIso(existingState?.last_seen_at || null, requestedLastSeen);
            const { error: stateUpsertError } = await supabase
                .from(CONFIG.tables.userNotificationStates)
                .upsert({
                    user_id: req.requestUser.id,
                    last_seen_at: finalLastSeenAt,
                    updated_at: nowIso,
                }, { onConflict: 'user_id' });

            if (stateUpsertError) {
                throw stateUpsertError;
            }
        }

        if (notificationKey) {
            const { error: readUpsertError } = await supabase
                .from(CONFIG.tables.userNotificationReads)
                .upsert({
                    user_id: req.requestUser.id,
                    notification_key: notificationKey,
                    read_at: nowIso,
                }, { onConflict: 'user_id,notification_key' });

            if (readUpsertError) {
                throw readUpsertError;
            }
        }

        const { data: stateData, error: stateFetchError } = await supabase
            .from(CONFIG.tables.userNotificationStates)
            .select('user_id, last_seen_at, updated_at')
            .eq('user_id', req.requestUser.id)
            .maybeSingle();

        if (stateFetchError) {
            throw stateFetchError;
        }

        const { data: readRows, error: readRowsError } = await supabase
            .from(CONFIG.tables.userNotificationReads)
            .select('notification_key')
            .eq('user_id', req.requestUser.id)
            .order('read_at', { ascending: false })
            .limit(500);

        if (readRowsError) {
            throw readRowsError;
        }

        return res.json({
            message: 'Notifications marked as read.',
            data: {
                userId: req.requestUser.id,
                lastSeenAt: stateData?.last_seen_at || null,
                updatedAt: stateData?.updated_at || null,
                readKeys: Array.isArray(readRows) ? readRows.map((row) => String(row.notification_key || '')).filter(Boolean) : [],
            },
        });
    } catch (error) {
        if (isMissingTableError(error) && String(error.message || '').includes(CONFIG.tables.userNotificationStates)) {
            return res.status(500).json({
                error: `Missing table "${CONFIG.tables.userNotificationStates}". Run services/user-service/schema.sql first.`,
            });
        }
        if (isMissingTableError(error) && String(error.message || '').includes(CONFIG.tables.userNotificationReads)) {
            return res.status(500).json({
                error: `Missing table "${CONFIG.tables.userNotificationReads}". Run services/user-service/schema.sql first.`,
            });
        }
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.patch('/notifications/alumni-verifications/:id', ensureDb, ensureAuthenticated, ensureModerator, async (req, res) => {
    try {
        const requestId = req.params.id;
        const action = typeof req.body.action === 'string' ? req.body.action.trim().toLowerCase() : '';
        const reviewNote = typeof req.body.reviewNote === 'string'
            ? req.body.reviewNote.trim().slice(0, 2000)
            : null;

        if (action !== 'approve' && action !== 'reject') {
            return res.status(400).json({ error: 'action must be "approve" or "reject"' });
        }

        const { data: existing, error: existingError } = await supabase
            .from(CONFIG.tables.alumniVerificationApplications)
            .select('*')
            .eq('id', requestId)
            .maybeSingle();

        if (existingError) {
            throw existingError;
        }
        if (!existing) {
            return res.status(404).json({ error: 'Verification application not found' });
        }

        const nowIso = new Date().toISOString();
        const nextStatus = action === 'approve' ? 'approved' : 'rejected';

        const { data: updated, error: updateError } = await supabase
            .from(CONFIG.tables.alumniVerificationApplications)
            .update({
                status: nextStatus,
                review_note: reviewNote,
                reviewed_by: req.requestUser.id,
                reviewed_at: nowIso,
                updated_at: nowIso,
            })
            .eq('id', requestId)
            .select('*')
            .single();

        if (updateError) {
            throw updateError;
        }

        if (nextStatus === 'approved') {
            const { error: rejectOthersError } = await supabase
                .from(CONFIG.tables.alumniVerificationApplications)
                .update({
                    status: 'rejected',
                    review_note: 'Superseded by an approved verification.',
                    reviewed_by: req.requestUser.id,
                    reviewed_at: nowIso,
                    updated_at: nowIso,
                })
                .eq('applicant_id', updated.applicant_id)
                .eq('status', 'pending')
                .neq('id', updated.id);

            if (rejectOthersError) {
                throw rejectOthersError;
            }
        }

        const user = await getUserById(updated.applicant_id);
        return res.json({
            message: `Application ${nextStatus}.`,
            data: mapVerificationApplication(updated, mapApplicant(user)),
        });
    } catch (error) {
        if (isMissingTableError(error)) {
            return verificationSchemaError(res);
        }
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.use((req, res) => {
    return res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
    console.log(`User Service is running on port ${PORT}`);
    if (!isSupabaseConfigured()) {
        console.log('User service started without Supabase config. DB routes will return 503.');
    }
});
