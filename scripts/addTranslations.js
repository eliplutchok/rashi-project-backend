require('dotenv').config({ path: '../.env' });
const pool = require('../config/database');
const fs = require('fs');

// Function to read JSON file and return data
function readJSON(jsonFilePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(jsonFilePath, 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        try {
          const updates = JSON.parse(data);
          resolve(updates);
        } catch (parseError) {
          reject(parseError);
        }
      }
    });
  });
}

// Function to update translations
async function updateTranslationsFromJSON(jsonFilePath, version_name, status, user_id) {
  const client = await pool.connect();
  try {
    const updates = await readJSON(jsonFilePath);
    console.log('JSON file successfully processed');
    
    // Begin transaction
    await client.query('BEGIN');
    
    for (const update of updates) {
      const { passage_id, text } = update;

      // Insert a new translation with the given text, version, status, user_id, and passage_id
      await client.query(
        'INSERT INTO translations (text, version_name, status, user_id, passage_id) VALUES ($1, $2, $3, $4, $5)',
        [text, version_name, status, user_id, passage_id]
      );

      console.log(`Inserted new translation for passage_id ${passage_id}`);
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log('All translations updated');
  } catch (error) {
    // Rollback transaction in case of error
    await client.query('ROLLBACK');
    console.error('Error updating translations:', error);
  } finally {
    client.release();
  }
}

const jsonFilePath = './gpt-4o-naive_translations_rashi_berakhot.json';
const version_name = 'gpt-4o-naive';
const status = 'proposed';
const user_id = 1;

// Call the function to update translations
updateTranslationsFromJSON(jsonFilePath, version_name, status, user_id).catch((e) => console.error(e.stack));