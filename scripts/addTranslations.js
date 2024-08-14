require('dotenv').config({ path: '../.env' });
const pool = require('../config/database'); 
const fs = require('fs');
const csv = require('csv-parser');

// Function to read CSV file and return data
function readCSV(csvFilePath) {
  return new Promise((resolve, reject) => {
    const updates = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        const { translation_id, text } = row;
        updates.push({ translation_id, text });
      })
      .on('end', () => {
        resolve(updates);
      })
      .on('error', reject);
  });
}

// Function to update translations
async function updateTranslationsFromCSV(csvFilePath) {
  const client = await pool.connect();
  try {
    const updates = await readCSV(csvFilePath);
    console.log('CSV file successfully processed');
    
    // Begin transaction
    await client.query('BEGIN');
    
    for (const update of updates) {
      const { translation_id, text } = update;

      // Fetch the existing translation to get the passage_id
      const res = await client.query('SELECT passage_id FROM translations WHERE translation_id = $1', [translation_id]);
      if (res.rows.length === 0) {
        console.error(`No translation found with translation_id ${translation_id}`);
        continue;
      }

      const passage_id = res.rows[0].passage_id;

      // Insert a new translation with the new text, version, status, and same passage_id
      await client.query(
        'INSERT INTO translations (text, version_name, status, user_id, passage_id) VALUES ($1, $2, $3, $4, $5)',
        [text, 'claude-opus-naive', 'proposed', 1, passage_id]
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

const csvFilePath = './claude_opus_naive_translations_rashi_megillah.csv';

// Call the function to update translations
updateTranslationsFromCSV(csvFilePath).catch((e) => console.error(e.stack));