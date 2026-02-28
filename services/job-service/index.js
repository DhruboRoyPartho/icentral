require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json({ limit: '8mb' }));

const PORT = Number(process.env.PORT) || 3003;

const CONFIG = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    schema: process.env.JOB_SERVICE_SCHEMA || 'public',
    jwtSecret: process.env.JWT_SECRET || 'HelloWorldKey',
    tables: {
        posts: process.env.POSTS_TABLE || 'posts',
        users: process.env.USERS_TABLE || 'users',
        jobApplications: process.env.JOB_APPLICATIONS_TABLE || 'job_applications',
        jobApplicationNotifications: process.env.JOB_APPLICATION_NOTIFICATIONS_TABLE || 'job_application_notifications',
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

function formatSupabaseError(error) {
    if (!error) return 'Unknown database error';
    return error.message || error.details || 'Unknown database error';
}

function parseIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function dbUnavailable(res) {
    return res.status(503).json({
        error: 'Job service database is not configured',
        requiredEnv: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    });
}

function jobSchemaError(res) {
    return res.status(500).json({
        error: `Missing job-service tables. Run services/job-service/schema.sql first.`,
    });
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

function ensureDb(req, res, next) {
    if (!isSupabaseConfigured()) {
        return dbUnavailable(res);
    }
    return next();
}

function ensureAuthenticated(req, res, next) {
    const requestUser = getRequestUser(req);
    if (!requestUser?.id) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    req.requestUser = requestUser;
    return next();
}

function isAlumniRole(role) {
    return String(role || '').toLowerCase() === 'alumni';
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeCvFileSize(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
}

function mapJobApplication(row) {
    return {
        id: row.id,
        postId: row.post_id,
        postAuthorId: row.post_author_id,
        applicantUserId: row.applicant_user_id,
        applicantName: row.applicant_name,
        studentId: row.student_id,
        currentYear: row.current_year,
        description: row.description,
        contactInformation: row.contact_information,
        cvFileName: row.cv_file_name,
        cvFileType: row.cv_file_type,
        cvFileSize: row.cv_file_size,
        cvDataUrl: row.cv_file_data_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapJobNotification(row) {
    return {
        id: row.id,
        recipientUserId: row.recipient_user_id,
        applicationId: row.application_id,
        postId: row.post_id,
        applicantName: row.applicant_name,
        jobTitle: row.job_title,
        companyName: row.company_name,
        isRead: row.is_read,
        readAt: row.read_at,
        createdAt: row.created_at,
    };
}

async function getPostById(postId) {
    const { data, error } = await supabase
        .from(CONFIG.tables.posts)
        .select('id, type, title, author_id')
        .eq('id', postId)
        .maybeSingle();

    if (error) throw error;
    return data || null;
}

async function getUserById(userId) {
    const { data, error } = await supabase
        .from(CONFIG.tables.users)
        .select('id, full_name, email')
        .eq('id', userId)
        .maybeSingle();

    if (error) throw error;
    return data || null;
}

function parseApplicationInput(body = {}) {
    const postId = normalizeText(body.postId || body.post_id);
    const applicantName = normalizeText(body.applicantName || body.applicant_name);
    const studentId = normalizeText(body.studentId || body.student_id);
    const currentYear = normalizeText(body.currentYear || body.current_year);
    const description = normalizeText(body.description);
    const contactInformation = normalizeText(body.contactInformation || body.contact_information);
    const cvFileName = normalizeText(body.cvFileName || body.cv_file_name);
    const cvFileType = normalizeText(body.cvFileType || body.cv_file_type);
    const cvFileSize = normalizeCvFileSize(body.cvFileSize || body.cv_file_size);
    const cvDataUrl = normalizeText(body.cvDataUrl || body.cv_data_url);
    const jobTitle = normalizeText(body.jobTitle || body.job_title);
    const companyName = normalizeText(body.companyName || body.company_name);

    const errors = [];

    if (!postId) errors.push('postId is required');
    if (!applicantName) errors.push('applicantName is required');
    if (!studentId) errors.push('studentId is required');
    if (!currentYear) errors.push('currentYear is required');
    if (!description) errors.push('description is required');
    if (!contactInformation) errors.push('contactInformation is required');
    if (!cvFileName) errors.push('cvFileName is required');
    if (!cvDataUrl) {
        errors.push('cvDataUrl is required');
    } else if (!cvDataUrl.startsWith('data:')) {
        errors.push('cvDataUrl must be a valid data URL');
    }

    if (applicantName.length > 200) errors.push('applicantName is too long');
    if (studentId.length > 120) errors.push('studentId is too long');
    if (currentYear.length > 120) errors.push('currentYear is too long');
    if (description.length > 7000) errors.push('description is too long');
    if (contactInformation.length > 1000) errors.push('contactInformation is too long');
    if (cvFileName.length > 260) errors.push('cvFileName is too long');
    if (cvFileType.length > 200) errors.push('cvFileType is too long');
    if (cvDataUrl.length > 8_000_000) errors.push('cvDataUrl is too large');
    if (jobTitle.length > 260) errors.push('jobTitle is too long');
    if (companyName.length > 260) errors.push('companyName is too long');

    return {
        postId,
        applicantName,
        studentId,
        currentYear,
        description,
        contactInformation,
        cvFileName,
        cvFileType: cvFileType || null,
        cvFileSize,
        cvDataUrl,
        jobTitle: jobTitle || null,
        companyName: companyName || null,
        errors,
    };
}

app.get('/', (req, res) => {
    return res.json({
        health: 'Job service OK',
        supabaseConfigured: isSupabaseConfigured(),
        endpoints: [
            'POST /applications',
            'GET /posts/:postId/applications',
            'GET /notifications/unread',
            'POST /notifications/:id/read',
            'POST /notifications/read-all',
        ],
    });
});

app.get('/health', (req, res) => {
    return res.json({
        service: 'job-service',
        status: 'ok',
        supabaseConfigured: isSupabaseConfigured(),
    });
});

app.post('/applications', ensureDb, ensureAuthenticated, async (req, res) => {
    try {
        const payload = parseApplicationInput(req.body);
        if (payload.errors.length) {
            return res.status(400).json({ error: 'Validation failed', details: payload.errors });
        }

        const post = await getPostById(payload.postId);
        if (!post) {
            return res.status(404).json({ error: 'Job post not found' });
        }

        if (String(post.type || '').toUpperCase() !== 'JOB') {
            return res.status(400).json({ error: 'Applications can only be submitted to JOB posts.' });
        }

        if (!post.author_id) {
            return res.status(400).json({ error: 'Job post does not have an author.' });
        }

        if (String(post.author_id) === String(req.requestUser.id)) {
            return res.status(403).json({ error: 'You cannot apply to your own job post.' });
        }

        const applicantUser = await getUserById(req.requestUser.id);
        if (!applicantUser) {
            return res.status(404).json({ error: 'Applicant user not found' });
        }

        const { data: createdApplication, error: applicationError } = await supabase
            .from(CONFIG.tables.jobApplications)
            .insert({
                post_id: post.id,
                post_author_id: post.author_id,
                applicant_user_id: req.requestUser.id,
                applicant_name: payload.applicantName,
                student_id: payload.studentId,
                current_year: payload.currentYear,
                description: payload.description,
                contact_information: payload.contactInformation,
                cv_file_name: payload.cvFileName,
                cv_file_type: payload.cvFileType,
                cv_file_size: payload.cvFileSize,
                cv_file_data_url: payload.cvDataUrl,
            })
            .select('*')
            .single();

        if (applicationError) {
            if (isMissingTableError(applicationError)) return jobSchemaError(res);
            throw applicationError;
        }

        const effectiveJobTitle = payload.jobTitle || post.title || 'a job post';

        const { error: notificationError } = await supabase
            .from(CONFIG.tables.jobApplicationNotifications)
            .insert({
                application_id: createdApplication.id,
                recipient_user_id: post.author_id,
                post_id: post.id,
                applicant_name: payload.applicantName || applicantUser.full_name || applicantUser.email || 'A student',
                job_title: effectiveJobTitle,
                company_name: payload.companyName,
            });

        if (notificationError) {
            if (isMissingTableError(notificationError)) return jobSchemaError(res);
            throw notificationError;
        }

        return res.status(201).json({
            message: 'Application submitted',
            data: mapJobApplication(createdApplication),
        });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.get('/posts/:postId/applications', ensureDb, ensureAuthenticated, async (req, res) => {
    try {
        if (!isAlumniRole(req.requestUser.role)) {
            return res.status(403).json({ error: 'Only alumni job posters can view applications.' });
        }

        const post = await getPostById(req.params.postId);
        if (!post) {
            return res.status(404).json({ error: 'Job post not found' });
        }

        if (String(post.type || '').toUpperCase() !== 'JOB') {
            return res.status(400).json({ error: 'Post is not a job post.' });
        }

        if (String(post.author_id || '') !== String(req.requestUser.id)) {
            return res.status(403).json({ error: 'You can only view applications for your own job post.' });
        }

        const limit = parseIntInRange(req.query.limit, 200, 1, 500);
        const { data, error } = await supabase
            .from(CONFIG.tables.jobApplications)
            .select('*')
            .eq('post_id', req.params.postId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            if (isMissingTableError(error)) return jobSchemaError(res);
            throw error;
        }

        return res.json({
            data: (data || []).map(mapJobApplication),
        });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.get('/notifications/unread', ensureDb, ensureAuthenticated, async (req, res) => {
    try {
        const limit = parseIntInRange(req.query.limit, 50, 1, 200);

        const { data, error } = await supabase
            .from(CONFIG.tables.jobApplicationNotifications)
            .select('*')
            .eq('recipient_user_id', req.requestUser.id)
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            if (isMissingTableError(error)) return jobSchemaError(res);
            throw error;
        }

        return res.json({
            data: (data || []).map(mapJobNotification),
        });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.post('/notifications/:id/read', ensureDb, ensureAuthenticated, async (req, res) => {
    try {
        const notificationId = normalizeText(req.params.id);
        if (!notificationId) {
            return res.status(400).json({ error: 'notification id is required' });
        }

        const { data, error } = await supabase
            .from(CONFIG.tables.jobApplicationNotifications)
            .update({
                is_read: true,
                read_at: new Date().toISOString(),
            })
            .eq('id', notificationId)
            .eq('recipient_user_id', req.requestUser.id)
            .eq('is_read', false)
            .select('id')
            .maybeSingle();

        if (error) {
            if (isMissingTableError(error)) return jobSchemaError(res);
            throw error;
        }

        if (!data) {
            return res.status(404).json({ error: 'Unread notification not found' });
        }

        return res.json({
            message: 'Notification marked as read',
            data: { id: notificationId },
        });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.post('/notifications/read-all', ensureDb, ensureAuthenticated, async (req, res) => {
    try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
            .from(CONFIG.tables.jobApplicationNotifications)
            .update({
                is_read: true,
                read_at: nowIso,
            })
            .eq('recipient_user_id', req.requestUser.id)
            .eq('is_read', false)
            .select('id');

        if (error) {
            if (isMissingTableError(error)) return jobSchemaError(res);
            throw error;
        }

        return res.json({
            message: 'All job notifications marked as read',
            data: {
                updatedCount: (data || []).length,
            },
        });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.use((req, res) => {
    return res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
    console.log(`Job Service is running on port ${PORT}`);
});
