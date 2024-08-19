const { JSDOM } = require('jsdom');
const pool = require('../config/database');
const fs = require('fs');
const { normalize } = require('path');

const stripHTML = (html) => {
  const dom = new JSDOM(html);
  return dom.window.document.body.textContent || "";
};

const removeNekudot = (text) => {
    // This regex pattern matches all Hebrew diacritical marks (nekudot and cantillation marks)
    return text.replace(/[\u0591-\u05C7]/g, '');

  };

const getRashiPassagePageNumber = async (passageId, client) => {
  const query = `
    SELECT pg.page_number
    FROM passages p
    JOIN pages pg ON p.page_id = pg.page_id
    WHERE p.passage_id = $1;
  `;
  const result = await client.query(query, [passageId]);
  return result.rows[0].page_number;
};

const getRashiPassageNumber = async (passageId, client) => {
    const query = `
        SELECT passage_number
        FROM passages
        WHERE passage_id = $1;
    `;
    const result = await client.query(query, [passageId]);
    return result.rows[0].passage_number;
};

const getTalmudPassageNumber = async (passageId, client) => {
    const query = `
        SELECT passage_number
        FROM passages
        WHERE passage_id = $1;
    `;
    const result = await client.query(query, [passageId]);
    return result.rows[0].passage_number;
};

const getRashiHeader = (hebrewText) => {
    let rashiHeader = hebrewText.split('–')[0].trim();
    console.log(rashiHeader.length);
    console.log('rashiHeader:', rashiHeader);
    // Remove any trailing punctuation or spaces
    rashiHeader = rashiHeader.replace(/[:;.,]$/, '');
    console.log(rashiHeader.length);
    return rashiHeader;
  };
  
let x = 0
const getRashiPassagePositionRelativeToMishna = (rashiHeader, talmudText) => {
    const normalizedRashiHeader = removeNekudot(rashiHeader);
    const normalizedTalmudText = removeNekudot(talmudText);
  
    console.log('Full normalizedTalmudText:', normalizedTalmudText);  // Log full text for inspection
  
    // Try searching for a broader or simplified term
    const mishnaIndex = normalizedTalmudText.indexOf("מתני׳");  // Search for a part of "מַתְנִי׳" without punctuation
    
    const rashiIndex = normalizedTalmudText.indexOf(rashiHeader);
  
    console.log('rashiIndex:', rashiIndex);
    console.log('mishnaIndex:', mishnaIndex);
  
    if (rashiIndex === -1 || mishnaIndex === -1) {
      // Either Rashi header or Mishna not found
      return 'unknown';
    }
    
    return rashiIndex < mishnaIndex ? 'before' : 'after';
  };
  
  const getTalmudContext = async (bookName, pageNumber, versionName, rashiHeader, client) => {
    let talmudContext = [];
    let stopPageNumber = pageNumber; // Initialize with the given page number
    let talmudTextOnPage = "";
    let positionRelativeToMishna = 'before'; // Default value
  
    const query = `
      SELECT p.hebrew_text, t.text as translation, pg.page_number, p.passage_number
      FROM passages p
      JOIN translations t ON p.passage_id = t.passage_id
      JOIN pages pg ON p.page_id = pg.page_id
      WHERE p.book_id = (SELECT book_id FROM books WHERE name = $1)
      AND (
        CAST(regexp_replace(pg.page_number, '[^0-9]', '', 'g') AS INTEGER) < CAST(regexp_replace($2, '[^0-9]', '', 'g') AS INTEGER)
        OR (
          CAST(regexp_replace(pg.page_number, '[^0-9]', '', 'g') AS INTEGER) = CAST(regexp_replace($2, '[^0-9]', '', 'g') AS INTEGER)
          AND pg.page_number <= $2
        )
      )
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
    
    const result = await client.query(query, [bookName, pageNumber, versionName]);
    
    for (const row of result.rows) {
      const combinedText = stripHTML(row.hebrew_text) + "\n" + stripHTML(row.translation);
      talmudContext.push(combinedText);
      talmudTextOnPage += stripHTML(row.hebrew_text) + "\n";
    
  
      if (row.hebrew_text.includes("<big><strong>מַתְנִי׳</strong></big>")) {
        positionRelativeToMishna = getRashiPassagePositionRelativeToMishna(rashiHeader, talmudTextOnPage);
        console.log('positionRelativeToMishna:', positionRelativeToMishna);
  
        if (positionRelativeToMishna === 'before') {
          stopPageNumber = row.page_number;
          break;
        }
      }
    }
    // console.log('talmudContext:', talmudContext);
    console.log('stopPageNumber:', stopPageNumber);
  
    // Reverse the context as we collected it in descending order
    talmudContext.reverse();
  
    return { talmudContext: talmudContext.join("\n"), stopPageNumber, positionRelativeToMishna };
  };
  
  const getRashiContext = async (rashiBookName, passageId, currentPageNumber, stopPageNumber, currentRashiPassageNumber, positionRelativeToMishna, client) => {
    let rashiContext = "";
    
    const query = `
      SELECT p.hebrew_text, pg.page_number, p.passage_number
      FROM passages p
      JOIN pages pg ON p.page_id = pg.page_id
      WHERE p.book_id = (SELECT book_id FROM books WHERE name = $1)
      AND CAST(regexp_replace(pg.page_number, '[^0-9]', '', 'g') AS INTEGER) <= CAST(regexp_replace($2, '[^0-9]', '', 'g') AS INTEGER)
      AND pg.page_number >= $3
      AND p.passage_number <= $4
      ORDER BY
        CAST(regexp_replace(pg.page_number, '[^0-9]', '', 'g') AS INTEGER) DESC,
        CASE
          WHEN pg.page_number ~ 'a$' THEN 0
          WHEN pg.page_number ~ 'b$' THEN 1
          ELSE 2
        END DESC,
        p.passage_number DESC;
    `;
    
    const result = await client.query(query, [rashiBookName, currentPageNumber, stopPageNumber, currentRashiPassageNumber]);
  
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
  
  const prepareData = async (passageId, versionName, bookName, pageNumber) => {
    const client = await pool.connect();
    const rashiBookName = `Rashi_on_${bookName}`;
    
    try {
      // Step 1: Get the page number and passage number of the Rashi passage
      const currentPageNumber = await getRashiPassagePageNumber(passageId, client);
      const currentRashiPassageNumber = await getRashiPassageNumber(passageId, client);
      const rashiPassageText = await getRashiPassage(passageId, client);
      const rashiHeader = getRashiHeader(rashiPassageText);
  
      console.log('currentPageNumber:', currentPageNumber);
      
      // Step 2: Fetch Talmud context and stop page number, including position relative to Mishna
      const { talmudContext, stopPageNumber, positionRelativeToMishna } = await getTalmudContext(bookName, currentPageNumber, versionName, rashiHeader, client);
      
      // Step 3: Fetch Rashi context based on the stop page number and position relative to Mishna
      const rashiContext = await getRashiContext(rashiBookName, passageId, currentPageNumber, stopPageNumber, currentRashiPassageNumber, positionRelativeToMishna, client);
      
      // Step 4: Fetch the specific Rashi passage
      const rashiPassage = rashiPassageText;
      
      // Step 5: Create the JSON data
      const data = {
        talmud_context: talmudContext,
        rashi_context: rashiContext,
        rashi_passage: rashiPassage,
      };
      
      // Step 6: Write to a JSON file
      fs.writeFileSync(`passage_${passageId}_data.json`, JSON.stringify(data, null, 4), 'utf8');
  
      return data;
    } catch (error) {
      console.error('Error preparing data:', error);
      throw error;
    } finally {
      client.release();
    }
  };
  
  // Example usage
  prepareData(3102, 'Sefaria-William-Davidson', 'Berakhot', '2a')
    .then((data) => console.log('Data prepared successfully'))
    .catch((err) => console.error('Error preparing data:', err))
    .finally(() => pool.end());