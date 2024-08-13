const pool = require('../config/database'); 
const bcrypt = require('bcrypt');
const readlineSync = require('readline-sync');
require('dotenv').config();

const addUser = async () => {
  const username = readlineSync.question('Enter username: ');
  const email = readlineSync.question('Enter email: ');
  const password = readlineSync.question('Enter password: ', { hideEchoBack: true });
  const name = readlineSync.question('Enter name: ');

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Hashed password:', hashedPassword);

    const client = await pool.connect();
    console.log('connected to client:', client);
    try {
      await client.query('BEGIN');

      const insertQuery = `
        INSERT INTO users (username, email, hashed_password, name, privilege_level)
        VALUES ($1, $2, $3, $4, 'standard')
      `;
      await client.query(insertQuery, [username, email, hashedPassword, name]);
      console.log('inserted into users table');

      await client.query('COMMIT');
      console.log('standard user added successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error adding standard user:', error);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error hashing password:', error);
  }
};

addUser().catch((error) => console.error('Error in addUser:', error));