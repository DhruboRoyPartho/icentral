const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3002;

const CONFIG = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    schema: process.env.POST_SERVICE_SCHEMA || 'public',
    tables: {
        posts: process.env.POSTS_TABLE || 'posts',
        tags: process.env.TAGS_TABLE || 'tags',
        postTags: process.env.POST_TAGS_TABLE || 'post_tags',
        postRefs: process.env.POST_REFS_TABLE || 'post_refs',
    },
    feedDefaultLimit: Number(process.env.POST_FEED_DEFAULT_LIMIT) || 20,
    feedMaxLimit: Number(process.env.POST_FEED_MAX_LIMIT) || 100,
    archiveIntervalMs: Number(process.env.POST_ARCHIVE_INTERVAL_MS) || 0,
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

function parseBool(value, fallback = false) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    return fallback;
}

function parseIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function slugify(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function sanitizeSearchTerm(term) {
    return String(term)
        .trim()
        .replace(/[(),]/g, ' ')
        .replace(/\s+/g, ' ');
}

function pickDefined(fields) {
    return Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined)
    );
}

function normalizeDate(value, fieldName) {
    if (value === undefined) return { value: undefined };
    if (value === null || value === '') return { value: null };

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return { error: `${fieldName} must be a valid date/time string` };
    }

    return { value: date.toISOString() };
}

function mapTag(row) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        createdAt: row.created_at,
    };
}

function mapPost(row) {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        summary: row.summary,
        authorId: row.author_id,
        status: row.status,
        pinned: row.pinned,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function formatSupabaseError(error) {
    if (!error) return 'Unknown database error';
    return error.message || error.details || 'Unknown database error';
}

function dbUnavailable(res) {
    return res.status(503).json({
        error: 'Post service database is not configured',
        requiredEnv: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    });
}

function ensureDb(req, res, next) {
    if (!isSupabaseConfigured()) {
        return dbUnavailable(res);
    }
    return next();
}

function buildPostPayload(body, { partial = false } = {}) {
    const errors = [];

    const expiresAtResult = normalizeDate(
        body.expiresAt !== undefined ? body.expiresAt : body.expires_at,
        'expiresAt'
    );

    if (expiresAtResult.error) {
        errors.push(expiresAtResult.error);
    }

    const statusInput = body.status;
    const archiveInput = body.archive;
    let status = statusInput;

    if (archiveInput === true || archiveInput === 'true' || archiveInput === 1 || archiveInput === '1') {
        status = 'archived';
    }

    const postFields = pickDefined({
        type: body.type,
        title: body.title,
        summary: body.summary,
        author_id: body.authorId ?? body.author_id,
        status: status,
        pinned: body.pinned !== undefined ? parseBool(body.pinned) : undefined,
        expires_at: expiresAtResult.value,
    });

    if (!partial) {
        if (!postFields.type || typeof postFields.type !== 'string') {
            errors.push('type is required');
        }
        if (postFields.author_id !== undefined && String(postFields.author_id).trim() === '') {
            errors.push('authorId cannot be empty');
        }
        if (!postFields.status) {
            postFields.status = 'draft';
        }
        if (postFields.pinned === undefined) {
            postFields.pinned = false;
        }
    }

    if (postFields.type !== undefined && typeof postFields.type !== 'string') {
        errors.push('type must be a string');
    }
    if (postFields.title !== undefined && postFields.title !== null && typeof postFields.title !== 'string') {
        errors.push('title must be a string or null');
    }
    if (postFields.summary !== undefined && postFields.summary !== null && typeof postFields.summary !== 'string') {
        errors.push('summary must be a string or null');
    }
    if (postFields.status !== undefined && typeof postFields.status !== 'string') {
        errors.push('status must be a string');
    }

    let tagIds = [];
    let tagNames = [];
    let tagsProvided = false;

    if (Array.isArray(body.tagIds)) {
        tagsProvided = true;
        tagIds = body.tagIds.map((id) => String(id).trim()).filter(Boolean);
    }

    if (Array.isArray(body.tags)) {
        tagsProvided = true;
        if (body.tags.every((tag) => typeof tag === 'string')) {
            tagNames = body.tags.map((tag) => tag.trim()).filter(Boolean);
        } else if (body.tags.every((tag) => tag && typeof tag === 'object')) {
            tagIds = [
                ...tagIds,
                ...body.tags
                    .map((tag) => (tag.id !== undefined ? String(tag.id).trim() : ''))
                    .filter(Boolean),
            ];
            tagNames = [
                ...tagNames,
                ...body.tags
                    .map((tag) => (typeof tag.name === 'string' ? tag.name.trim() : ''))
                    .filter(Boolean),
            ];
        } else {
            errors.push('tags must be an array of strings or objects');
        }
    }

    const refInput = body.ref ?? body.postRef ?? body.post_ref;
    let ref;

    if (refInput !== undefined) {
        if (refInput === null) {
            ref = null;
        } else if (
            typeof refInput === 'object' &&
            typeof refInput.service === 'string' &&
            refInput.service.trim() &&
            refInput.entityId !== undefined
        ) {
            ref = {
                service: refInput.service.trim(),
                entity_id: String(refInput.entityId).trim(),
                metadata: (refInput.metadata && typeof refInput.metadata === 'object')
                    ? refInput.metadata
                    : {},
            };
        } else if (
            typeof refInput === 'object' &&
            typeof refInput.service === 'string' &&
            refInput.service.trim() &&
            refInput.entity_id !== undefined
        ) {
            ref = {
                service: refInput.service.trim(),
                entity_id: String(refInput.entity_id).trim(),
                metadata: (refInput.metadata && typeof refInput.metadata === 'object')
                    ? refInput.metadata
                    : {},
            };
        } else {
            errors.push('ref must include service and entityId');
        }
    }

    return {
        errors,
        postFields,
        tagsProvided,
        tagIds: [...new Set(tagIds)],
        tagNames: [...new Set(tagNames)],
        refProvided: refInput !== undefined,
        ref,
    };
}

async function archiveExpiredPosts() {
    if (!isSupabaseConfigured()) {
        return { archivedCount: 0, skipped: true };
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from(CONFIG.tables.posts)
        .update({ status: 'archived' })
        .lt('expires_at', nowIso)
        .neq('status', 'archived')
        .select('id');

    if (error) {
        throw error;
    }

    return { archivedCount: data?.length || 0 };
}

async function getPostRefs(postIds) {
    if (!postIds.length) return new Map();

    const { data, error } = await supabase
        .from(CONFIG.tables.postRefs)
        .select('post_id, service, entity_id, metadata, created_at')
        .in('post_id', postIds);

    if (error) {
        if (error.code === '42P01') return new Map();
        throw error;
    }

    const refsByPostId = new Map();
    for (const row of data || []) {
        const existing = refsByPostId.get(row.post_id) || [];
        existing.push({
            service: row.service,
            entityId: row.entity_id,
            metadata: row.metadata || {},
            createdAt: row.created_at,
        });
        refsByPostId.set(row.post_id, existing);
    }

    return refsByPostId;
}

async function attachTags(posts) {
    if (!posts.length) return posts;

    const postIds = posts.map((post) => post.id);
    const { data: postTagRows, error: postTagsError } = await supabase
        .from(CONFIG.tables.postTags)
        .select('post_id, tag_id')
        .in('post_id', postIds);

    if (postTagsError) {
        if (postTagsError.code === '42P01') {
            return posts.map((post) => ({ ...post, tags: [] }));
        }
        throw postTagsError;
    }

    const tagIds = [...new Set((postTagRows || []).map((row) => row.tag_id))];
    if (!tagIds.length) {
        return posts.map((post) => ({ ...post, tags: [] }));
    }

    const { data: tagRows, error: tagsError } = await supabase
        .from(CONFIG.tables.tags)
        .select('id, name, slug, created_at')
        .in('id', tagIds);

    if (tagsError) {
        if (tagsError.code === '42P01') {
            return posts.map((post) => ({ ...post, tags: [] }));
        }
        throw tagsError;
    }

    const tagMap = new Map((tagRows || []).map((tag) => [tag.id, mapTag(tag)]));
    const tagsByPostId = new Map();

    for (const row of postTagRows || []) {
        const tag = tagMap.get(row.tag_id);
        if (!tag) continue;
        const existing = tagsByPostId.get(row.post_id) || [];
        existing.push(tag);
        tagsByPostId.set(row.post_id, existing);
    }

    return posts.map((post) => ({
        ...post,
        tags: tagsByPostId.get(post.id) || [],
    }));
}

async function enrichPosts(postRows) {
    const mapped = postRows.map(mapPost);
    const withTags = await attachTags(mapped);
    const refsByPostId = await getPostRefs(withTags.map((post) => post.id));

    return withTags.map((post) => ({
        ...post,
        refs: refsByPostId.get(post.id) || [],
    }));
}

async function ensureTagsExist(tagNames) {
    if (!tagNames.length) return [];

    const names = [...new Set(tagNames.map((tag) => tag.trim()).filter(Boolean))];
    if (!names.length) return [];

    const upsertPayload = names.map((name) => ({
        name,
        slug: slugify(name),
    }));

    const { data, error } = await supabase
        .from(CONFIG.tables.tags)
        .upsert(upsertPayload, { onConflict: 'slug' })
        .select('id, name, slug, created_at');

    if (error) {
        throw error;
    }

    return data || [];
}

async function replacePostTags(postId, tagIds = [], tagNames = []) {
    const ensuredTags = await ensureTagsExist(tagNames);
    const mergedTagIds = [
        ...new Set([
            ...tagIds.map((id) => String(id)),
            ...ensuredTags.map((tag) => String(tag.id)),
        ]),
    ];

    const { error: deleteError } = await supabase
        .from(CONFIG.tables.postTags)
        .delete()
        .eq('post_id', postId);

    if (deleteError && deleteError.code !== '42P01') {
        throw deleteError;
    }

    if (!mergedTagIds.length) {
        return;
    }

    const rows = mergedTagIds.map((tagId) => ({
        post_id: postId,
        tag_id: tagId,
    }));

    const { error: insertError } = await supabase
        .from(CONFIG.tables.postTags)
        .insert(rows);

    if (insertError) {
        throw insertError;
    }
}

async function replacePostRef(postId, ref) {
    const { error: deleteError } = await supabase
        .from(CONFIG.tables.postRefs)
        .delete()
        .eq('post_id', postId);

    if (deleteError && deleteError.code !== '42P01') {
        throw deleteError;
    }

    if (!ref) return;

    const { error: insertError } = await supabase
        .from(CONFIG.tables.postRefs)
        .insert({
            post_id: postId,
            service: ref.service,
            entity_id: ref.entity_id,
            metadata: ref.metadata || {},
        });

    if (insertError) {
        throw insertError;
    }
}

async function getPostById(postId) {
    const { data, error } = await supabase
        .from(CONFIG.tables.posts)
        .select('*')
        .eq('id', postId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data) return null;

    const [enriched] = await enrichPosts([data]);
    return enriched || null;
}

async function resolveTagFilterPostIds(tagFilter) {
    if (!tagFilter) return null;

    const isUuidLike = /^[0-9a-fA-F-]{32,36}$/.test(String(tagFilter));
    let tagRowsQuery = supabase
        .from(CONFIG.tables.tags)
        .select('id, slug');

    if (isUuidLike) {
        tagRowsQuery = tagRowsQuery.eq('id', tagFilter);
    } else {
        tagRowsQuery = tagRowsQuery.or(`slug.eq.${slugify(tagFilter)},name.ilike.%${sanitizeSearchTerm(tagFilter)}%`);
    }

    const { data: tags, error: tagsError } = await tagRowsQuery;
    if (tagsError) {
        throw tagsError;
    }

    const tagIds = (tags || []).map((tag) => tag.id);
    if (!tagIds.length) return [];

    const { data: links, error: linksError } = await supabase
        .from(CONFIG.tables.postTags)
        .select('post_id, tag_id')
        .in('tag_id', tagIds);

    if (linksError) {
        throw linksError;
    }

    return [...new Set((links || []).map((link) => link.post_id))];
}

app.get('/', (req, res) => {
    return res.json({
        health: 'Post service OK',
        supabaseConfigured: isSupabaseConfigured(),
        schema: CONFIG.schema,
        endpoints: [
            'GET /feed',
            'GET /posts/:id',
            'POST /posts',
            'PATCH /posts/:id',
            'GET /tags',
            'POST /tags',
        ],
    });
});

app.get('/health', (req, res) => {
    return res.json({
        service: 'post-service',
        status: 'ok',
        supabaseConfigured: isSupabaseConfigured(),
    });
});

app.post('/internal/archive-expired', ensureDb, async (req, res) => {
    try {
        const result = await archiveExpiredPosts();
        return res.json({ message: 'Archive sweep completed', ...result });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.get('/feed', ensureDb, async (req, res) => {
    try {
        const archiveResult = await archiveExpiredPosts().catch(() => ({ archivedCount: 0 }));
        const limit = parseIntInRange(req.query.limit, CONFIG.feedDefaultLimit, 1, CONFIG.feedMaxLimit);
        const offset = parseIntInRange(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
        const includeArchived = parseBool(req.query.includeArchived, false);
        const pinnedOnly = parseBool(req.query.pinnedOnly, false);
        const status = typeof req.query.status === 'string'
            ? req.query.status.trim().toLowerCase()
            : '';
        const type = req.query.type;
        const authorId = req.query.authorId || req.query.author_id;
        const tag = req.query.tag;
        const search = sanitizeSearchTerm(req.query.search || '');

        const tagFilteredPostIds = await resolveTagFilterPostIds(tag);
        if (Array.isArray(tagFilteredPostIds) && !tagFilteredPostIds.length) {
            return res.json({
                data: [],
                pagination: { limit, offset, total: 0 },
                meta: { archivedDuringRequest: archiveResult.archivedCount || 0 },
            });
        }

        let query = supabase
            .from(CONFIG.tables.posts)
            .select('*', { count: 'exact' })
            .order('pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status && status !== 'all') {
            query = query.eq('status', status);
        } else if (!status && !includeArchived) {
            query = query.eq('status', 'published');
        } else if (status === 'all' && !includeArchived) {
            query = query.neq('status', 'archived');
        }

        if (pinnedOnly) {
            query = query.eq('pinned', true);
        }

        if (type) {
            query = query.eq('type', type);
        }

        if (authorId) {
            query = query.eq('author_id', authorId);
        }

        if (tagFilteredPostIds) {
            query = query.in('id', tagFilteredPostIds);
        }

        if (search) {
            query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
        }

        const { data: rows, error, count } = await query;
        if (error) {
            throw error;
        }

        const data = await enrichPosts(rows || []);

        return res.json({
            data,
            pagination: {
                limit,
                offset,
                total: count ?? data.length,
            },
            meta: {
                archivedDuringRequest: archiveResult.archivedCount || 0,
            },
        });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.get('/posts/:id', ensureDb, async (req, res) => {
    try {
        const post = await getPostById(req.params.id);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        return res.json({ data: post });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.post('/posts', ensureDb, async (req, res) => {
    try {
        const payload = buildPostPayload(req.body);
        if (payload.errors.length) {
            return res.status(400).json({ error: 'Validation failed', details: payload.errors });
        }

        const { data: createdPost, error: createError } = await supabase
            .from(CONFIG.tables.posts)
            .insert(payload.postFields)
            .select('*')
            .single();

        if (createError) {
            throw createError;
        }

        if (payload.tagsProvided) {
            await replacePostTags(createdPost.id, payload.tagIds, payload.tagNames);
        }

        if (payload.refProvided) {
            await replacePostRef(createdPost.id, payload.ref);
        }

        const fullPost = await getPostById(createdPost.id);

        return res.status(201).json({
            message: 'Post created',
            data: fullPost || mapPost(createdPost),
        });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.patch('/posts/:id', ensureDb, async (req, res) => {
    try {
        const payload = buildPostPayload(req.body, { partial: true });
        if (payload.errors.length) {
            return res.status(400).json({ error: 'Validation failed', details: payload.errors });
        }

        const hasPostFields = Object.keys(payload.postFields).length > 0;
        const hasTagChanges = payload.tagsProvided;
        const hasRefChanges = payload.refProvided;

        if (!hasPostFields && !hasTagChanges && !hasRefChanges) {
            return res.status(400).json({
                error: 'No supported fields provided for update',
            });
        }

        if (hasPostFields) {
            const { data: updatedRows, error: updateError } = await supabase
                .from(CONFIG.tables.posts)
                .update(payload.postFields)
                .eq('id', req.params.id)
                .select('id');

            if (updateError) {
                throw updateError;
            }

            if (!updatedRows || updatedRows.length === 0) {
                return res.status(404).json({ error: 'Post not found' });
            }
        } else {
            const post = await getPostById(req.params.id);
            if (!post) {
                return res.status(404).json({ error: 'Post not found' });
            }
        }

        if (hasTagChanges) {
            await replacePostTags(req.params.id, payload.tagIds, payload.tagNames);
        }

        if (hasRefChanges) {
            await replacePostRef(req.params.id, payload.ref);
        }

        const fullPost = await getPostById(req.params.id);
        return res.json({
            message: 'Post updated',
            data: fullPost,
        });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.get('/tags', ensureDb, async (req, res) => {
    try {
        const limit = parseIntInRange(req.query.limit, 100, 1, 500);
        const q = sanitizeSearchTerm(req.query.q || '');

        let query = supabase
            .from(CONFIG.tables.tags)
            .select('id, name, slug, created_at')
            .order('name', { ascending: true })
            .limit(limit);

        if (q) {
            query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
        }

        const { data, error } = await query;
        if (error) {
            throw error;
        }

        return res.json({
            data: (data || []).map(mapTag),
        });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.post('/tags', ensureDb, async (req, res) => {
    try {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const slugInput = typeof req.body.slug === 'string' ? req.body.slug.trim() : '';

        if (!name) {
            return res.status(400).json({ error: 'name is required' });
        }

        const slug = slugInput || slugify(name);
        if (!slug) {
            return res.status(400).json({ error: 'Could not generate a valid slug' });
        }

        const { data, error } = await supabase
            .from(CONFIG.tables.tags)
            .upsert({ name, slug }, { onConflict: 'slug' })
            .select('id, name, slug, created_at')
            .single();

        if (error) {
            throw error;
        }

        return res.status(201).json({
            message: 'Tag created',
            data: mapTag(data),
        });
    } catch (error) {
        return res.status(500).json({ error: formatSupabaseError(error) });
    }
});

app.use((req, res) => {
    return res.status(404).json({ error: 'Route not found' });
});

const server = app.listen(PORT, () => {
    console.log(`Post Service is running on port ${PORT}`);
    if (!isSupabaseConfigured()) {
        console.log('Post Service started without Supabase config. DB routes will return 503.');
    }
});

let archiveTimer = null;
if (CONFIG.archiveIntervalMs > 0 && isSupabaseConfigured()) {
    archiveTimer = setInterval(async () => {
        try {
            const result = await archiveExpiredPosts();
            if (result.archivedCount > 0) {
                console.log(`Archived ${result.archivedCount} expired posts`);
            }
        } catch (error) {
            console.error('Post archive sweep failed:', formatSupabaseError(error));
        }
    }, CONFIG.archiveIntervalMs);

    if (typeof archiveTimer.unref === 'function') {
        archiveTimer.unref();
    }
}

module.exports = { app, server, supabase, CONFIG };
