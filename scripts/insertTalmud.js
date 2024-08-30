require('dotenv').config();
const pool = require('../config/database');

const SECTION_NAME = 'Talmud';
// const BASE_BOOKS = [
//      'Berakhot', 'Shabbat', 'Yoma', 'Sukkah', 'Beitzah', 'Rosh_Hashanah',
//     'Taanit', 'Moed_Kattan', 'Hagigah', 'Gittin', 'Ketubot', 'Kiddushin',
//     'Nazir', 'Nedarim', 'Sotah', 'Yevamot', 'Avodah_Zarah', 'Bava_Batra',
//     'Bava_Kamma', 'Bava_Metzia', 'Horayot', 'Makkot', 'Sanhedrin', 'Shevuot',
//     'Arakhin', 'Bekhorot', 'Chullin', 'Keritot', 'Meilah', 'Menachot',
//     'Temurah', 'Zevachim', 'Niddah', 'Eiruvin', 'Pesachim', 'Megillah'
// ];

BASE_BOOKS =['Eiruvin', 'Pesachim', 'Megillah']
const BOOKS = [
    // ...BASE_BOOKS,
    ...BASE_BOOKS.map(book => `Rashi_on_${book}`)
];
const USER_ID = 1;

const getBookInfoFromSefaria = async (book) => {
  const fetch = (await import('node-fetch')).default;
  try {
    const response_url = `https://www.sefaria.org/api/v2/raw/index/${book}`;
    console.log(`Fetching URL: ${response_url}`);
    const response = await fetch(response_url);
    const data = await response.json();

    const categories = data['categories'];
    const length = data['schema']['lengths'][0];
    const titles = JSON.stringify(data['schema']['titles']);
    const description = data['enDesc'];
    const shortDescription = data['enShortDesc'];
    const publicationDate = data['pubDate'][0];
    const numberOfChapters = data['alt_structs']['Chapters']['nodes'].length;
    const chapterInfo = data['alt_structs']['Chapters']['nodes'].map(node => ({
      wholeRef: node['wholeRef'],
      titles: JSON.stringify(node['titles'])
    }));

    let formattedPublicationDate = publicationDate;
    if (publicationDate.length === 4) {
      formattedPublicationDate = `${publicationDate}-01-01`;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(publicationDate)) {
      formattedPublicationDate = null;
    }

    return {
      categories,
      length,
      titles,
      description,
      shortDescription,
      publicationDate: formattedPublicationDate,
      numberOfChapters,
      chapterInfo
    };
  } catch (error) {
    console.error('Error fetching book info from Sefaria:', error);
    throw error;
  }
};

const getPageFromSefaria = async (book, page, retries = 3) => {
  const fetch = (await import('node-fetch')).default;
  const response_url = `https://www.sefaria.org/api/v3/texts/${book}.${page}`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching URL: ${response_url} (Attempt ${attempt})`);
      const response = await fetch(response_url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.versions && data.versions[0] && data.versions[0].text) {
        let text = data.versions[0].text;
        const flattenedText = text.flatMap(subArray => subArray);
        return flattenedText;
      } else {
        throw new Error('Unexpected response structure');
      }
    } catch (error) {
      console.error(`Error fetching page (Attempt ${attempt}):`, error.message);
      
      if (attempt === retries) {
        throw new Error(`Failed to fetch ${response_url} after ${retries} attempts`);
      }
    }
  }
};

const generatePageNumbers = (length) => {
  const pages = [];
  const letters = ['a', 'b'];
  for (let i = 1; i <= length; i++) {
    letters.forEach(letter => {
      pages.push(`${i}${letter}`);
    });
  }
  return pages;
};

const insertBookData = async (bookName) => {
  const client = await pool.connect();
  const DEFAULT_TRANSLATION = `sample translation for ${bookName}`;
  
  try {
    await client.query('BEGIN');
    console.log(`Inserting data for book: ${bookName}...`);

    const sectionResult = await client.query(`
      INSERT INTO sections (name) VALUES ($1) RETURNING section_id
    `, [SECTION_NAME]);
    const sectionId = sectionResult.rows[0].section_id;
    console.log(`Inserted section with ID: ${sectionId}`);

    const bookInfo = await getBookInfoFromSefaria(bookName);
    console.log('Book info:', bookInfo);
    
    const bookResult = await client.query(`
      INSERT INTO books (name, section_id, categories, length, titles, description, short_description, publication_date, number_of_chapters, chapter_titles)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING book_id
    `, [
      bookName,
      sectionId,
      bookInfo.categories,
      bookInfo.length,
      bookInfo.titles,
      bookInfo.description,
      bookInfo.shortDescription,
      bookInfo.publicationDate,
      bookInfo.numberOfChapters,
      JSON.stringify(bookInfo.chapterInfo)
    ]);
    const bookId = bookResult.rows[0].book_id;
    console.log(`Inserted book with ID: ${bookId}`);

    for (let i = 0; i < bookInfo.chapterInfo.length; i++) {
      const chapter = bookInfo.chapterInfo[i];
      const chapterResult = await client.query(`
        INSERT INTO chapters (chapter_number, book_id, titles, start_ref, end_ref)
        VALUES ($1, $2, $3, $4, $5) RETURNING chapter_id
      `, [i + 1, bookId, chapter.titles, chapter.wholeRef.split('-')[0], chapter.wholeRef.split('-')[1]]);
      const chapterId = chapterResult.rows[0].chapter_id;
      console.log(`Inserted chapter ${i + 1} with ID: ${chapterId}`);
    }

    const pages = generatePageNumbers(((bookInfo.length + 2) / 2) + 1);
    let passageNumber = 0;

    for (const page of pages) {
      const pageResult = await client.query(`
        INSERT INTO pages (page_number, book_id) VALUES ($1, $2) RETURNING page_id
      `, [page, bookId]);
      const pageId = pageResult.rows[0].page_id;
      console.log(`Inserted page ${page} with ID: ${pageId}`);

      try {
        const passages = await getPageFromSefaria(bookName, page);
        if (passages.length > 0) {
          for (const passage of passages) {
            const passageResult = await client.query(`
              INSERT INTO passages (hebrew_text, passage_number, page_id, book_id) VALUES ($1, $2, $3, $4) RETURNING passage_id
            `, [passage, passageNumber, pageId, bookId]);
            const passageId = passageResult.rows[0].passage_id;

            await client.query(`
              INSERT INTO translations (text, version_name, status, user_id, passage_id) 
              VALUES ($1, $2, $3, $4, $5)
            `, [`${DEFAULT_TRANSLATION} - ${passageId}`, 'default', 'published', USER_ID, passageId]);

            passageNumber++;
          }
          console.log(`Inserted ${passages.length} passages for page ${page}`);
        } else {
          console.log(`No passages found for page ${page}`);
        }
      } catch (error) {
        console.error(`Failed to insert passages for page ${page}:`, error.message);
      }
    }

    await client.query('COMMIT');
    console.log(`Data for book ${bookName} inserted successfully`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`Error inserting data for book ${bookName}:`, e);
  } finally {
    client.release();
    console.log(`Insertion process for book ${bookName} completed.`);
  }
};

const insertAllBooks = async () => {
  for (const book of BOOKS) {
    try {
      await insertBookData(book);
    } catch (error) {
      console.error(`Failed to insert data for ${book}: ${error.message}`);
    }
  }
  console.log('All books processed.');
  process.exit(0);
};

insertAllBooks().catch((e) => console.error(e.stack));