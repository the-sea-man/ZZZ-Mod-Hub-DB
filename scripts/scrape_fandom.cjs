const fs = require('fs');
const path = require('path');

const CHARACTERS_JSON_PATH = path.join(__dirname, '../characters.json');

// Map of our fields to Fandom wikitext fields
const FIELD_MAPPINGS = {
  real_name: 'realname',
  gender: 'gender',
  height: 'height',
  birthday: 'birthday',
  species: 'species',
  model_type: 'modelType',
  w_engine: 'w-engine',
  release_date: 'releaseDate'
};

async function fetchCharacterWikitext(pageName) {
  const url = `https://zenless-zone-zero.fandom.com/api.php?action=parse&page=${encodeURIComponent(pageName)}&format=json&prop=wikitext`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.warn(`[!] Fandom API error for ${pageName}: ${data.error.info}`);
      return null;
    }
    return data.parse.wikitext['*'];
  } catch (err) {
    console.error(`[!] Failed to fetch ${pageName}: ${err.message}`);
    return null;
  }
}

function parseInfobox(wikitext) {
  const extracted = {};
  for (const [ourField, wikiField] of Object.entries(FIELD_MAPPINGS)) {
    // Looks for lines like "|height           = 173 cm (5'8")"
    const regex = new RegExp(`\\|\\s*${wikiField}\\s*=\\s*(.+)`, 'i');
    const match = wikitext.match(regex);
    if (match && match[1]) {
      // Clean up MediaWiki formatting (like links [[Deep Sea Visitor]] -> Deep Sea Visitor)
      let value = match[1].trim();
      value = value.replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, '$2'); // Handle links
      value = value.replace(/<!--[\s\S]*?-->/g, ''); // Remove comments
      value = value.replace(/<ref[^>]*>.*?<\/ref>/g, ''); // Remove refs
      
      if (value) {
        extracted[ourField] = value;
      }
    }
  }
  return extracted;
}

async function run() {
  console.log("Loading characters.json...");
  const rawData = fs.readFileSync(CHARACTERS_JSON_PATH, 'utf-8');
  const db = JSON.parse(rawData);

  let updatedCount = 0;

  for (const char of db.characters) {
    // We try to guess the Fandom page name. Usually it's their full name.
    // If they have an alias that looks like a full name (two words), we try that first.
    let pageName = char.name;
    
    // For characters like Lycaon -> Von Lycaon, or Rina -> Alexandrina Sebastiane
    // we can use their aliases if the name is too short.
    const fullNameAlias = (char.aliases || []).find(a => a.includes(' '));
    if (fullNameAlias) {
      pageName = fullNameAlias;
    }

    // Special cases based on how Fandom formats their URLs
    if (char.id === "soldier11") pageName = "Soldier 11";
    if (char.id === "zhu_yuan") pageName = "Zhu Yuan";
    if (char.id === "jane_doe") pageName = "Jane Doe";

    pageName = pageName.replace(/ /g, '_');

    console.log(`\nFetching data for ${char.name} (Wiki page: ${pageName})...`);
    
    const wikitext = await fetchCharacterWikitext(pageName);
    
    if (wikitext) {
      const parsedData = parseInfobox(wikitext);
      
      let modified = false;
      for (const [key, value] of Object.entries(parsedData)) {
        if (!char[key]) {
          char[key] = value;
          modified = true;
          console.log(`  + Added ${key}: ${value}`);
        }
      }
      
      if (modified) {
        updatedCount++;
      } else {
        console.log(`  No new fields added.`);
      }
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(CHARACTERS_JSON_PATH, JSON.stringify(db, null, 2), 'utf-8');
    console.log(`\nSuccess! Updated ${updatedCount} characters and saved to characters.json.`);
  } else {
    console.log("\nNo characters were updated.");
  }
}

run();
