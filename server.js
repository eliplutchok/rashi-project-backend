require('dotenv').config();
const cors = require('cors');
const express = require('express');
const logger = require('./config/logger');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
app.use(express.json());

const corsOptions = {
    origin: process.env.REACT_APP_URL,
    optionsSuccessStatus: 200, // For legacy browser support
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true, // Allow credentials (cookies, authorization headers, TLS client certificates)
};
app.use(cors(corsOptions));

app.use('/', authRoutes);
app.use('/', userRoutes);
app.use('/', adminRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    logger.info(`Server is running on port ${PORT}`);
});