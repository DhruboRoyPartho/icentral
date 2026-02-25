// /api-gateway/index.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(cors());

// Proxy requests starting with /posts to the Post Service
app.use('/users', createProxyMiddleware({ 
    target: process.env.USER_SERVICE_URL || 'http://user-service:3001', 
    changeOrigin: true 
}));

app.use('/posts', createProxyMiddleware({ 
    target: process.env.POST_SERVICE_URL || 'http://post-service:3002', 
    changeOrigin: true 
}));

app.use('/jobs', createProxyMiddleware({ 
    target: process.env.JOB_SERVICE_URL || 'http://job-service:3003', 
    changeOrigin: true 
}));

app.use('/auth', createProxyMiddleware({ 
    target: process.env.AUTH_SERVICE_URL || 'http://auth-service:3004', 
    changeOrigin: true 
}));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 API Gateway is running on port ${PORT}`);
});