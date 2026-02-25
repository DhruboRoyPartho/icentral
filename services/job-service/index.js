const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get('/', (req, res) => {
    return res.json({health: "Job service OK"});
});

app.listen(PORT, () => {
    console.log(`Job Service is running on port ${PORT}`);
});