const fs = require('fs');
const pool = require('../config/database');
const { error } = require('console');

const addPassageIdsToJSON = async (jsonFilePath) => {
    const client = await pool.connect();
    let errors = 0
    try {
        await client.query('BEGIN');
        let jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

        const hebrewTextLogStream = fs.createWriteStream('parsed_hebrew_texts.txt', { flags: 'a' });

        for (const item of jsonData) {
            for (const message of item.messages) {
                if (message.role === 'user' && message.content.includes('Rashi:')) {
                    let hebrewText = message.content.split('Rashi: ')[1].trim();
                    
                    // Replace backticks with single quotes (if necessary)
                    hebrewText = hebrewText.replace(/`/g, "'");

                    hebrewText = hebrewText.replace(/^['"]+|['"]+$/g, ''); // Remove leading/trailing single quotes
                    hebrewText = hebrewText.replace(/''/g, '"'); // Convert double single quotes to a single double quote
                    

                    // Use parameterized query to prevent SQL injection
                    const query = `
                        SELECT * FROM passages 
                        WHERE hebrew_text LIKE $1
                        LIMIT 1;
                    `;
                    
                    // Execute the SQL query with parameters
                    const res = await client.query(query, [hebrewText]);

                    if (res.rows.length > 0) {
                        const passageId = res.rows[0].passage_id;
                        item.passage_id = passageId;
                    } else {
                        hebrewTextLogStream.write(`${hebrewText}\n`);
                        console.error(`No passage found for Hebrew text: ${hebrewText}`);
                        errors++;
                    }
                }
            }
        }

        if (errors > 0) {
            console.error(`Errors found: ${errors}`);
        }

        hebrewTextLogStream.end();

        fs.writeFileSync('updated_' + jsonFilePath, JSON.stringify(jsonData, null, 2));
        console.log('Updated JSON file with passage IDs.');

        await client.query('COMMIT');
    } catch (err) {
        console.error('Error updating JSON file:', err);
        await client.query('ROLLBACK');
        throw err; // Re-throw the error for higher-level error handling
    } finally {
        client.release();
    }
};

addPassageIdsToJSON('rashis_and_context.json')
    .catch(err => console.error('Top-level error:', err));