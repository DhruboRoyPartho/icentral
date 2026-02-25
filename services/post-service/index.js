// // /services/post-service/index.js
// const express = require('express');
// const { createClient } = require('@supabase/supabase-js');

// const app = express();
// app.use(express.json());

// // Initialize Supabase client
// const supabase = createClient(
//     process.env.SUPABASE_URL,
//     process.env.SUPABASE_SERVICE_ROLE_KEY 
// );

// // Simple test route
// app.get('/posts', (req, res) => {
//     res.json({ message: "Hello from the Post Service!", posts: [] });
// });

// // A skeleton route for creating a post later
// app.post('/posts/create', async (req, res) => {
//     const { content, authorId } = req.body;
//     // Later: Add your Supabase insert logic here
//     res.status(201).json({ message: "Post creation endpoint ready" });
// });

// const PORT = process.env.PORT || 3002;
// app.listen(PORT, () => {
//     console.log(`Post Service is running on port ${PORT}`);
// });


const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;

app.get('/', (req, res) => {
    return res.json({health: "Post service OK"});
});

app.listen(PORT, () => {
    console.log(`Post Service is running on port ${PORT}`);
});