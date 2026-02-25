const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;

app.use('/', require('./routes/authRoute'));

// app.get('/', (req, res) => {
//     return res.json({health: "Auth service OK"});
// });

app.post('/login', (req, res) => {
    return res.json({message: "lol"});
});

app.listen(PORT, () => {
    console.log(`Auth Service is running on port ${PORT}`);
});