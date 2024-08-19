const { JSDOM } = require('jsdom');
const pool = require('../config/database');
const fs = require('fs');

const stripHTML = (html) => {
  const dom = new JSDOM(html);
  return dom.window.document.body.textContent || "";
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

  console.log('Book and Page Info:', result.rows[0]); // Debugging log

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
  const minPageValue = currentPageValue - 1; // 6 pages before the current page

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

  console.log("query:", query);
  console.log("talmudBookName:", talmudBookName);
    console.log("minPageValue:", minPageValue);
    console.log("versionName:", versionName);
    console.log("currentPageValue:", currentPageValue);
  console.log('Talmud Context Results:', result.rows); // Debugging log
  
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
  console.log('minPageValue:', minPageValue);

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

//   console.log('Rashi Context Results:', result.rows); // Debugging log

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

//   console.log('Rashi Passage:', result.rows[0]); // Debugging log

  return stripHTML(result.rows[0].hebrew_text);
};

const prepareData = async (passageId, versionName) => {
  const client = await pool.connect();
  
  try {
    // Step 1: Get the book name and page number using the passage ID
    const { book_name, page_number } = await getBookAndPageInfo(passageId, client);
    
    // Correct book names for Talmud and Rashi
    const talmudBookName = book_name.replace('Rashi_on_', ''); // Strip the 'Rashi_on_' prefix for Talmud book name
    const rashiBookName = `Rashi_on_${talmudBookName}`;
    console.log('Talmud Book Name:', talmudBookName);
    console.log('Rashi Book Name:', rashiBookName);
    
    // Step 2: Fetch Talmud context (current page and 6 preceding pages)
    const talmudContext = await getTalmudContext(talmudBookName, page_number, versionName, client);
    
    // Step 3: Fetch Rashi context (same pages as Talmud)
    const rashiContext = await getRashiContext(rashiBookName, page_number, client);
    
    // Step 4: Fetch the specific Rashi passage
    const rashiPassage = await getRashiPassage(passageId, client);
    
    // Step 5: Create the JSON data
    const data = {
      talmud_context: talmudContext,
      rashi_context: rashiContext,
      rashi_passage_to_translate: rashiPassage,
    };
    
    // Step 6: Write to a JSON file
    fs.writeFileSync(`passage_${passageId}_data.json`, JSON.stringify(data, null, 4), 'utf8');

    // console.log('Prepared Data:', data);  // Final Debugging log

    return data;
  } catch (error) {
    console.error('Error preparing data:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Example usage
prepareData(7314, 'Sefaria-William-Davidson')
  .then((data) => console.log('Data prepared successfully'))
  .catch((err) => console.error('Error preparing data:', err))
  .finally(() => pool.end());