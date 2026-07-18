import json

code = r'''const fs = require('fs');
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
  release_date: 'releaseDate',
  faction: 'faction' // We can get this from wikitext or categories
};

const ELEMENTS = ['Physical', 'Fire', 'Ice', 'Electric', 'Ether', 'Wind', 'Frost', 'Honed Edge', 'Auric Ink'];
const ROLES = ['Attack', 'Stun', 'Anomaly', 'Support', 'Defense', 'Rupture'];

async function fetchAllAgents() {
  // Fetch Playable Agents
  const url1 = https://zenless-zone-zero.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:Playable_Agents&cmlimit=500&format=json;
  const res1 = await fetch(url1);
  const data1 = await res1.json();
  const agents = data1.query.categorymembers.filter(c => c.ns === 0).map(c => c.title);

  // Fetch Proxies
  const url2 = https://zenless-zone-zero.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:Proxies&cmlimit=50&format=json;
  const res2 = await fetch(url2);
  const data2 = await res2.json();
  const proxies = data2.query.categorymembers.filter(c => c.ns === 0).map(c => c.title);

  return [...new Set([...agents, ...proxies])];
}

async function fetchCharacterWikitextAndCategories(pageName) {
  const url = https://zenless-zone-zero.fandom.com/api.php?action=parse&page=&format=json&prop=wikitext|categories;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) return null;
    
    return {
      wikitext: data.parse.wikitext['*'],
      categories: data.parse.categories.map(c => c['*'])
    };
  } catch (err) {
    return null;
  }
}

async function fetchSkinsForAgent(agentName) {
  const url = https://zenless-zone-zero.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:_Outfits&cmlimit=50&format=json;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error || !data.query || !data.query.categorymembers) return [];
    
    const skinPages = data.query.categorymembers.filter(c => c.ns === 0).map(c => c.title);
    const skins = [];
    
    for (const skinTitle of skinPages) {
      const pageData = await fetchCharacterWikitextAndCategories(skinTitle);
      if (pageData) {
        const extracted = parseInfobox(pageData.wikitext);
        extracted.name = skinTitle;
        extracted.id = skinTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        skins.push(extracted);
      }
    }
    return skins;
  } catch (err) {
    return [];
  }
}

async function resolveImageUrl(filename) {
  // Strip "File:" prefix if it's there
  filename = filename.replace(/^File:/i, '').trim();
  const url = https://zenless-zone-zero.fandom.com/api.php?action=query&titles=File:&prop=imageinfo&iiprop=url&format=json;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    if (pageId === "-1") return null;
    return pages[pageId].imageinfo[0].url.split('/revision')[0]; // Remove revision to get direct raw image if possible, or just keep it
  } catch (err) {
    return null;
  }
}

async function downloadAndResolveImage(filename) {
  if (!filename) return null;
  const imgUrl = await resolveImageUrl(filename);
  if (!imgUrl) return null;
  
  const imagesDir = path.join(__dirname, '../images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9.\-_ ]/g, '');
  const localImagePath = path.join(imagesDir, safeFilename);
  const relativeImagePath = images/;

  // Download image if it doesn't exist locally
  if (!fs.existsSync(localImagePath)) {
    console.log(  Downloading image to ...);
    try {
      const imgRes = await fetch(imgUrl);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(localImagePath, buffer);
    } catch (err) {
      console.error(  Failed to download image: );
    }
  }
  return relativeImagePath;
}

function parseInfobox(wikitext) {
  const extracted = {};
  for (const [ourField, wikiField] of Object.entries(FIELD_MAPPINGS)) {
    const regex = new RegExp(\\|\\s*\\s*=\\s*(.+), 'i');
    const match = wikitext.match(regex);
    if (match && match[1]) {
      let value = match[1].trim();
      value = value.replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, ''); 
      value = value.replace(/<!--[\s\S]*?-->/g, ''); 
      value = value.replace(/<ref[^>]*>.*?<\/ref>/g, ''); 
      if (value) extracted[ourField] = value;
    }
  }

  // Find Portrait image
  const portraitMatch = wikitext.match(/([^=|\n<]+\.png)\|Portrait/i);
  if (portraitMatch && portraitMatch[1]) {
    extracted._imageFilename = portraitMatch[1].trim();
  } else {
    // Fallback image search
    const imgMatch2 = wikitext.match(/image\s*=\s*([^|\n<]+\.png)/i);
    if (imgMatch2 && imgMatch2[1]) extracted._imageFilename = imgMatch2[1].trim();
  }
  
  // Find Icon image
  const iconMatch = wikitext.match(/([^=|\n<]+\.png)\|Icon/i);
  if (iconMatch && iconMatch[1]) {
    extracted._iconFilename = iconMatch[1].trim();
  }

  return extracted;
}

async function run() {
  console.log("Loading characters.json...");
  const rawData = fs.readFileSync(CHARACTERS_JSON_PATH, 'utf-8');
  const db = JSON.parse(rawData);

  console.log("Fetching list of all playable agents and proxies...");
  const allAgents = await fetchAllAgents();
  console.log(Found  agents on the Wiki.);

  let updatedCount = 0;
  let addedCount = 0;

  for (const agentName of allAgents) {
    let char = db.characters.find(c => 
      c.name.toLowerCase() === agentName.toLowerCase() || 
      (c.aliases && c.aliases.some(a => a.toLowerCase() === agentName.toLowerCase())) ||
      (c.real_name && c.real_name.toLowerCase() === agentName.toLowerCase())
    );

    let isNew = false;
    if (!char) {
      console.log(\n[NEW] Discovered missing character: );
      char = {
        id: agentName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name: agentName,
        aliases: [],
        element: "",
        faction: "",
        image_url: "",
        icon_url: "",
        body_hashes: []
      };
      db.characters.push(char);
      isNew = true;
      addedCount++;
    }

    console.log(Fetching data for ...);
    const pageData = await fetchCharacterWikitextAndCategories(agentName);
    
    if (pageData) {
      const parsedData = parseInfobox(pageData.wikitext);
      
      // Map categories to element and role
      const elementCat = pageData.categories.find(c => c.includes('Attribute Agents'));
      if (elementCat) {
        const el = elementCat.split(' Attribute Agents')[0];
        if (ELEMENTS.includes(el) && !char.element) char.element = el;
      }

      const roleCat = pageData.categories.find(c => c.includes('Specialty Agents'));
      if (roleCat) {
        const role = roleCat.split(' Specialty Agents')[0];
        if (ROLES.includes(role) && !char.role) char.role = role;
      }

      // Update basic fields
      let modified = isNew;
      for (const [key, value] of Object.entries(parsedData)) {
        if (key.startsWith('_')) continue; // Skip internal fields
        if (!char[key]) {
          char[key] = value;
          modified = true;
        }
      }

      // Resolve images
      if (parsedData._imageFilename) {
        const relativePath = await downloadAndResolveImage(parsedData._imageFilename);
        if (relativePath && char.image_url !== relativePath) {
          char.image_url = relativePath;
          modified = true;
        }
      }
      
      if (parsedData._iconFilename) {
        const relativePath = await downloadAndResolveImage(parsedData._iconFilename);
        if (relativePath && char.icon_url !== relativePath) {
          char.icon_url = relativePath;
          modified = true;
        }
      }
      
      // Fetch Skins
      const wikiSkins = await fetchSkinsForAgent(agentName);
      if (wikiSkins.length > 0) {
        if (!char.skins) char.skins = [];
        
        for (const wSkin of wikiSkins) {
          let skin = char.skins.find(s => s.id === wSkin.id || s.name === wSkin.name);
          if (!skin) {
            skin = {
              id: wSkin.id,
              name: wSkin.name,
              aliases: [wSkin.id]
            };
            char.skins.push(skin);
            modified = true;
          }
          
          if (wSkin._imageFilename) {
            const relPath = await downloadAndResolveImage(wSkin._imageFilename);
            if (relPath && skin.image_url !== relPath) {
              skin.image_url = relPath;
              modified = true;
            }
          }
          
          if (wSkin._iconFilename) {
            const relPath = await downloadAndResolveImage(wSkin._iconFilename);
            if (relPath && skin.icon_url !== relPath) {
              skin.icon_url = relPath;
              modified = true;
            }
          }
        }
      }

      if (modified && !isNew) {
        updatedCount++;
      }
    }
  }

  if (addedCount > 0 || updatedCount > 0) {
    fs.writeFileSync(CHARACTERS_JSON_PATH, JSON.stringify(db, null, 2), 'utf-8');
    console.log(\nSuccess! Added  new characters and updated  existing characters.);
  } else {
    console.log("\nEverything is up to date!");
  }
}

run();
'''

with open('C:/Users/igork/Desktop/New folder (2)/scripts/sync_characters.cjs', 'w', encoding='utf-8') as f:
    f.write(code)
