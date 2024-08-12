// const { Pool } = require('pg');

// const pool = new Pool({
//   user: 'postgres',         
//   host: 'localhost',          
//   database: 'rashi',     
//   password: 'password123',    
//   port: 5432,
// });

// module.exports = pool;

const { Pool } = require('pg');

const pool = new Pool({
  user: `${process.env.DB_USER}`,
  host: `${process.env.DB_HOST}`,
  database: `${process.env.DB_DATABASE}`,
  password: `${process.env.DB_PASSWORD}`,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = pool;