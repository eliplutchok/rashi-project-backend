const pool = require('../config/database');
const axios = require('axios');

const insertTranslations = async (bookName, startPage, endPage) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const suffixes = ['a', 'b']; // Assuming pages have suffixes 'a' and 'b'

    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
      for (let suffix of suffixes) {
        const tref = `${bookName}.${pageNumber}${suffix}`;
        const url = `https://www.sefaria.org/api/v3/texts/${tref}?version=english`;

        try {
          const response = await axios.get(url, {
            headers: {
              'accept': 'application/json'
            }
          });

          const data = response.data;

          if (data.versions && data.versions.length > 0) {
            const textArray = data.versions[0].text;

            // Get the passage IDs for this page
            const res = await client.query(`
              SELECT passage_id FROM passages
              WHERE book_id = (SELECT book_id FROM books WHERE name = $1)
                AND page_id = (SELECT page_id FROM pages WHERE page_number = $2 AND book_id = (SELECT book_id FROM books WHERE name = $1))
              ORDER BY passage_number;
            `, [bookName, `${pageNumber}${suffix}`]);

            const passageIds = res.rows.map(row => row.passage_id);

            if (textArray.length === passageIds.length) {
              // Insert each translation in the correct order
              for (let i = 0; i < textArray.length; i++) {
                await client.query(`
                  INSERT INTO translations (text, version_name, status, user_id, passage_id)
                  VALUES ($1, $2, 'proposed', 1, $3);
                `, [textArray[i], 'Sefaria-William-Davidson', passageIds[i]]);
              }
              console.log(`Inserted translations for page ${pageNumber}${suffix}`);
            } else {
              console.error(`Mismatch in passage count for page ${pageNumber}${suffix}. Skipping this page.`);
            }
          } else {
            console.warn(`No translations found for page ${pageNumber}${suffix}. Skipping this page.`);
          }
        } catch (err) {
          console.error(`Error fetching data for page ${pageNumber}${suffix}:`, err.message);
        }
      }
    }

    await client.query('COMMIT');
    console.log('All translations inserted successfully');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error inserting translations:', e.stack);
  } finally {
    client.release();
  }
};

insertTranslations('Megillah', 2, 35).catch(e => console.error(e.stack));