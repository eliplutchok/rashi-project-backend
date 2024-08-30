const pool = require('../config/database');
const axios = require('axios');

const insertTranslations = async (bookName, startPage=null, endPage=null) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const suffixes = ['a', 'b']; // Assuming pages have suffixes 'a' and 'b'

    if (!startPage) {
      startPage = 2;
    }

    if (!endPage) {
      let length_response = await client.query(`
        SELECT length FROM books WHERE name = $1;
      `, [bookName]);

      endPage = Math.ceil(length_response.rows[0].length / 2) + 1;
    }

    console.log(`Inserting translations for ${bookName} from page ${startPage} to ${endPage}`);

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

// let books =  [
//   'Eiruvin', 'Pesachim', 'Rosh Hashanah', 'Yoma', 'Beitzah', 
//   'Taanit', 'Moed Katan', 'Chagigah', 'Yevamot', 'Ketubot', 'Nedarim', 
//   'Nazir', 'Sotah', 'Gittin', 'Shevuot', 'Avodah Zarah', 'Horayot', 
//   'Zevachim', 'Menachot', 'Chullin', 'Bekhorot', 'Arakhin', 'Temurah', 
//   'Keritot', 'Meilah', 'Tamid', 'Niddah'
// ];

let books_2 = [
  'Avodah_Zarah', 'Hagigah', 'Rosh_Hashanah', 'Avodah_Zarah'
]

const processBooks = async () => {
  for (let book of books_2) {
    try {
      await insertTranslations(book); // Wait for this to complete before moving to the next book
    } catch (e) {
      console.error(`Error processing book ${book}:`, e.stack);
    }
  }
};

processBooks();

// insertTranslations('Sukkah').catch(e => console.error(e.stack));