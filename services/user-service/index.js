const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;

app.get('/', (req, res) => {
    return res.json({health: "User service OK"});
});

app.listen(PORT, () => {
    console.log(`User Service is running on port ${PORT}`);
});