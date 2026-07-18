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
  release_date: 'releaseDate',
  faction: 'faction' // We can get this from wikitext or categories
};

const ELEMENTS = ['Physical', 'Fire', 'Ice', 'Electric', 'Ether', 'Wind', 'Frost', 'Honed Edge', 'Auric Ink'];
const ROLES = ['Attack', 'Stun', 'Anomaly', 'Support', 'Defense', 'Rupture'];

async function fetchAllAgents() {
  // Fetch Playable Agents
  const url1 = "https://zenless-zone-zero.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:Playable_Agents&cmlimit=500&format=json";
  const res1 = await fetch(url1);
  const data1 = await res1.json();
  const agents = data1.query.categorymembers.filter(c => c.ns === 0).map(c => c.title);

  // Fetch Proxies
  const url2 = "https://zenless-zone-zero.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:Proxies&cmlimit=50&format=json";
  const res2 = await fetch(url2);
  const data2 = await res2.json();
  const proxies = data2.query.categorymembers.filter(c => c.ns === 0).map(c => c.title);

  return [...new Set([...agents, ...proxies])];
}

async function fetchCharacterWikitextAndCategories(pageName) {
  const url = "https://zenless-zone-zero.fandom.com/api.php?action=parse&page=" + encodeURIComponent(pageName) + "&format=json&prop=wikitext|categories";
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
  const url = "https://zenless-zone-zero.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:" + encodeURIComponent(agentName + "_Outfits") + "&cmlimit=50&format=json";
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error || !data.query || !data.query.categorymembers) return [];
    
    const skinPages = data.query.categorymembers.filter(c => c.ns === 0).map(c => c.title);
    const skins = [];
    
    for (const skinTitle of skinPages) {
      const pageData = await fetchCharacterWikitextAndCategories(skinTitle);
      if (pageData) {
        const extracted = parseInfobox(pageData.wikitext, skinTitle, true);
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
  const url = "https://zenless-zone-zero.fandom.com/api.php?action=query&titles=File:" + encodeURIComponent(filename) + "&prop=imageinfo&iiprop=url&format=json";
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
  const relativeImagePath = "images/" + safeFilename;

  // Download image if it doesn't exist locally
  if (!fs.existsSync(localImagePath)) {
    console.log("  Downloading image to " + relativeImagePath + "...");
    try {
      const imgRes = await fetch(imgUrl);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(localImagePath, buffer);
    } catch (err) {
      console.error("  Failed to download image: " + filename);
    }
  }
  return relativeImagePath;
}

function parseInfobox(wikitext, name, isSkin = false) {
  const extracted = {};
  for (const [ourField, wikiField] of Object.entries(FIELD_MAPPINGS)) {
    const regex = new RegExp("\\\\|[ \\t]*" + wikiField + "[ \\t]*=[ \\t]*([^\\r\\n]+)", 'i');
    const match = wikitext.match(regex);
    if (match && match[1]) {
      let value = match[1].trim();
      value = value.replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, '$2'); 
      value = value.replace(/<!--[\s\S]*?-->/g, ''); 
      value = value.replace(/<ref[^>]*>.*?<\/ref>/g, ''); 
      if (value) extracted[ourField] = value;
    }
  }

  // Find Portrait image
  // Instead of relying purely on the wikitext (which is brittle and fails on typos like 'Portait' or missing fields),
  // we will try to construct the filenames predictably.
  if (isSkin) {
    extracted._imageFilename = "Outfit " + name + " Portrait.png";
    // If not found, fallback to just Agent name Portrait or something, but we'll try to find it.
    // Actually wait, skins usually have "Agent " + BaseAgentName + " " + skinName + " Portrait.png". But we don't have baseAgentName easily here.
    // Let's just grab the wikitext gallery for skins, it's safer.
    const skinPortraitMatch = wikitext.match(/([^=|\n<]+\.png)\|Portr?aits?/i) || wikitext.match(/([^=|\n<]+\.png)\|Portait/i);
    if (skinPortraitMatch && skinPortraitMatch[1]) {
        extracted._imageFilename = skinPortraitMatch[1].trim();
    }
    extracted._iconFilename = "Outfit " + name + " Icon.png";
  } else {
    // Base Agent
    extracted._imageFilename = "Agent " + name + " Portrait.png";
    extracted._iconFilename = "Agent " + name + " Icon.png";
    extracted._mindscapeFilename = "Mindscape " + name + " Full.png";
  }

  return extracted;
}

async function run() {
  console.log("Loading characters.json...");
  const rawData = fs.readFileSync(CHARACTERS_JSON_PATH, 'utf-8');
  const db = JSON.parse(rawData);

  console.log("Fetching list of all playable agents and proxies...");
  const allAgents = await fetchAllAgents();
  console.log("Found " + allAgents.length + " agents on the Wiki.");

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
      console.log("\n[NEW] Discovered missing character: " + agentName);
      char = {
        id: agentName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name: agentName,
        aliases: [],
        element: "",
        faction: "",
        image_url: "",
        icon_url: "",
        mindscape_url: "",
        body_hashes: []
      };
      db.characters.push(char);
      isNew = true;
      addedCount++;
    }

    console.log("Fetching data for " + agentName + "...");
    const pageData = await fetchCharacterWikitextAndCategories(agentName);
    
    if (pageData) {
      const parsedData = parseInfobox(pageData.wikitext, agentName, false);
      
      // Map categories to element and role
      const elementCat = pageData.categories.find(c => c.replace(/_/g, ' ').includes('Attribute Agents'));
      if (elementCat) char.element = elementCat.replace(/_/g, ' ').replace(' Attribute Agents', '');
      
      const roleCat = pageData.categories.find(c => c.replace(/_/g, ' ').includes('Specialty Agents'));
      if (roleCat) char.role = roleCat.replace(/_/g, ' ').replace(' Specialty Agents', '');
      
      // Update fields
      for (const [ourField, wikiField] of Object.entries(FIELD_MAPPINGS)) {
        if (parsedData[ourField]) {
          char[ourField] = parsedData[ourField];
        }
      }

      // If Faction is not in infobox, try to get from category
      if (!char.faction) {
        const factionCat = pageData.categories.find(c => !c.includes('Agents') && !c.includes('Characters') && !c.includes('Playable'));
        if (factionCat) char.faction = factionCat; // basic guess
      }

      // Process Images
      // Attempt to download the predictably named Portrait
      let localPortrait = await downloadAndResolveImage(parsedData._imageFilename);
      if (!localPortrait) {
        // Fallback to wikitext parse if predictable name fails
        const fallbackMatch = pageData.wikitext.match(/([^=|\n<]+\.png)\|Portr?aits?/i) || pageData.wikitext.match(/([^=|\n<]+\.png)\|Portait/i);
        if (fallbackMatch) {
            localPortrait = await downloadAndResolveImage(fallbackMatch[1].trim());
        }
        // Last resort fallback
        if (!localPortrait) {
            const fallbackMatch2 = pageData.wikitext.match(/image\s*=\s*([^|\n<]+\.png)/i);
            if (fallbackMatch2) {
                localPortrait = await downloadAndResolveImage(fallbackMatch2[1].trim());
            }
        }
      }
      if (localPortrait) char.image_url = localPortrait;

      let localIcon = await downloadAndResolveImage(parsedData._iconFilename);
      if (!localIcon) {
          const iconMatch = pageData.wikitext.match(/([^=|\n<]+\.png)\|Icon/i);
          if (iconMatch) localIcon = await downloadAndResolveImage(iconMatch[1].trim());
      }
      if (localIcon) char.icon_url = localIcon;

      let localMindscape = await downloadAndResolveImage(parsedData._mindscapeFilename);
      if (localMindscape) char.mindscape_url = localMindscape;

      // Fetch skins
      const skins = await fetchSkinsForAgent(agentName);
      if (skins && skins.length > 0) {
        char.skins = skins.map(s => {
          // preserve existing skin properties if they exist
          const existingSkin = (char.skins || []).find(es => es.id === s.id);
          return {
            id: s.id,
            name: s.name,
            aliases: existingSkin ? existingSkin.aliases : [],
            _imageFilename: s._imageFilename,
            _iconFilename: s._iconFilename
          };
        });
        
        // Download skin images
        for (const skin of char.skins) {
          let skinLocalPortrait = await downloadAndResolveImage(skin._imageFilename);
          if (skinLocalPortrait) skin.image_url = skinLocalPortrait;

          let skinLocalIcon = await downloadAndResolveImage(skin._iconFilename);
          if (!skinLocalIcon && skin.name) {
              skinLocalIcon = await downloadAndResolveImage("Outfit " + skin.name + " Icon.png");
          }
          if (skinLocalIcon) skin.icon_url = skinLocalIcon;
          
          delete skin._imageFilename;
          delete skin._iconFilename;
        }
      }

      if (!isNew) updatedCount++;
    }
  }

  // Save back to JSON
  fs.writeFileSync(CHARACTERS_JSON_PATH, JSON.stringify(db, null, 2));
  console.log("\nSuccess! Added " + addedCount + " new characters and updated " + updatedCount + " existing characters.");
}

run();
