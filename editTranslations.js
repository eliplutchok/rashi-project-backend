require('dotenv').config();
const pool = require('./db');

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
      await client.query('UPDATE translations SET text = $1 WHERE translation_id = $2', [text, translation_id]);
      console.log(`Updated translation_id ${translation_id}`);
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

const csvFilePath = './rashi_megillah.csv';

// Call the function to update translations
updateTranslationsFromCSV(csvFilePath);