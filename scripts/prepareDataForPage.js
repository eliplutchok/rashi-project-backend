const { JSDOM } = require('jsdom');
const pool = require('../config/database');
const fs = require('fs');

const stripHTML = (html) => {
  const dom = new JSDOM(html);
  return dom.window.document.body.textContent || "";
};

const getPassagesOnPage = async (bookName, pageNumber, client) => {
  const query = `
    SELECT p.passage_id, p.passage_number
    FROM passages p
    JOIN pages pg ON p.page_id = pg.page_id
    JOIN books b ON p.book_id = b.book_id
    WHERE b.name = $1 AND pg.page_number = $2
    ORDER BY p.passage_number;
  `;
  const result = await client.query(query, [bookName, pageNumber]);

  return result.rows;
};

const getBookAndPageInfo = async (passageId, client) => {
  const query = `
    SELECT b.name as book_name, pg.page_number
    FROM passages p
    JOIN pages pg ON p.page_id = pg.page_id
    JOIN books b ON p.book_id = b.book_id
    WHERE p.passage_id = $1;
  `;
  const result = await client.query(query, [passageId]);

  return result.rows[0];
};

const getPageNumberValue = (pageNumber) => {
  const baseValue = parseInt(pageNumber.match(/\d+/)[0], 10);
  const letterValue = pageNumber.endsWith('b') ? 1 : 0;
  return baseValue * 2 + letterValue;
};

const getTalmudContext = async (talmudBookName, currentPageNumber, versionName, client) => {
  let talmudContext = [];
  const currentPageValue = getPageNumberValue(currentPageNumber);
  const minPageValue = currentPageValue - 1;

  const query = `
    SELECT p.hebrew_text, t.text as translation, pg.page_number
    FROM passages p
    JOIN translations t ON p.passage_id = t.passage_id
    JOIN pages pg ON p.page_id = pg.page_id
    WHERE p.book_id = (SELECT book_id FROM books WHERE name = $1)
    AND (
      CAST(regexp_replace(pg.page_number, '[^0-9]', '', 'g') AS INTEGER) * 2 + 
      CASE WHEN pg.page_number ~ 'b$' THEN 1 ELSE 0 END >= $2
    )
    AND CAST(regexp_replace(pg.page_number, '[^0-9]', '', 'g') AS INTEGER) * 2 + 
      CASE WHEN pg.page_number ~ 'b$' THEN 1 ELSE 0 END <= $4
    AND t.version_name = $3
    ORDER BY
      CAST(regexp_replace(pg.page_number, '[^0-9]', '', 'g') AS INTEGER) DESC,
      CASE
        WHEN pg.page_number ~ 'a$' THEN 0
        WHEN pg.page_number ~ 'b$' THEN 1
        ELSE 2
      END DESC,
      p.passage_number DESC;
  `;
  
  const result = await client.query(query, [talmudBookName, minPageValue, versionName, currentPageValue]);

  for (const row of result.rows) {
    const combinedText = stripHTML(row.hebrew_text) + "\n" + stripHTML(row.translation);
    talmudContext.push(combinedText);
  }

  talmudContext.reverse();  // Reverse the context as we collected it in descending order

  return talmudContext.join("\n");
};

const getRashiContext = async (rashiBookName, currentPageNumber, client) => {
  let rashiContext = "";
  const currentPageValue = getPageNumberValue(currentPageNumber);
  const minPageValue = currentPageValue - 1;

  const query = `
    SELECT p.hebrew_text, pg.page_number
    FROM passages p
    JOIN pages pg ON p.page_id = pg.page_id
    WHERE p.book_id = (SELECT book_id FROM books WHERE name = $1)
    AND (
      CAST(regexp_replace(pg.page_number, '[^0-9]', '', 'g') AS INTEGER) * 2 + 
      CASE WHEN pg.page_number ~ 'b$' THEN 1 ELSE 0 END >= $2
    )
    AND CAST(regexp_replace(pg.page_number, '[^0-9]', '', 'g') AS INTEGER) * 2 + 
      CASE WHEN pg.page_number ~ 'b$' THEN 1 ELSE 0 END <= $3
    ORDER BY
      CAST(regexp_replace(pg.page_number, '[^0-9]', '', 'g') AS INTEGER) DESC,
      CASE
        WHEN pg.page_number ~ 'a$' THEN 0
        WHEN pg.page_number ~ 'b$' THEN 1
        ELSE 2
      END DESC,
      p.passage_number DESC;
  `;
  
  const result = await client.query(query, [rashiBookName, minPageValue, currentPageValue]);

  for (const row of result.rows) {
    rashiContext = stripHTML(row.hebrew_text) + "\n" + rashiContext;
  }

  return rashiContext.trim(); // Remove any trailing newlines
};

const getRashiPassage = async (passageId, client) => {
  const query = `
    SELECT hebrew_text 
    FROM passages 
    WHERE passage_id = $1;
  `;
  
  const result = await client.query(query, [passageId]);

  return stripHTML(result.rows[0].hebrew_text);
};

const prepareDataForPage = async (bookName, pageNumber, versionName) => {
  const client = await pool.connect();
  
  try {
    // Step 1: Get all passages on the page
    const passages = await getPassagesOnPage(bookName, pageNumber, client);
    const data = [];

    for (const passage of passages) {
      const { passage_id, passage_number } = passage;

      // Step 2: Get the book name and page number using the passage ID (already known in this case)
      const { book_name, page_number } = await getBookAndPageInfo(passage_id, client);
      
      // Correct book names for Talmud and Rashi
      const talmudBookName = book_name.replace('Rashi_on_', ''); // Strip the 'Rashi_on_' prefix for Talmud book name
      const rashiBookName = `Rashi_on_${talmudBookName}`;
      
      // Step 3: Fetch Talmud context (current page and 6 preceding pages)
      const talmudContext = await getTalmudContext(talmudBookName, page_number, versionName, client);
      
      // Step 4: Fetch Rashi context (same pages as Talmud)
      const rashiContext = await getRashiContext(rashiBookName, page_number, client);
      
      // Step 5: Fetch the specific Rashi passage
      const rashiPassage = await getRashiPassage(passage_id, client);
      
      // Step 6: Add the data for this passage to the array
      data.push({
        passage_id,
        passage_number,
        context: {
          talmud_context: talmudContext,
          rashi_context: rashiContext,
          rashi_passage_to_translate: rashiPassage
        }
      });
    }

    // Step 7: Write the entire page data to a JSON file
    fs.writeFileSync(`${bookName}_${pageNumber}_data.json`, JSON.stringify(data, null, 4), 'utf8');

    return data;
  } catch (error) {
    console.error('Error preparing data for page:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Example usage
prepareDataForPage('Megillah', '2a', 'Sefaria-William-Davidson')
  .then((data) => console.log('Page data prepared successfully'))
  .catch((err) => console.error('Error preparing page data:', err))
  .finally(() => pool.end());