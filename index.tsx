import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- VISUAL & GAME DATA CONSTANTS ---

const VISUAL_STYLE_PROMPT = `spec: "ultra-sharp, photorealistic, physically-based; 16-bit, filmic tonemapping"
aspect_presets:
  A_16x9_landscape: "2560x1440 jpeg"
  B_square: "1024x1024 jpeg"
  C_9x16_portrait: "1440x2560 jpeg"
photorealism_preset:
  materials: "PBR shading, accurate metal/roughness, micro-scratches"
  skin: "subsurface scattering, micro-speculars, visible pores"
  fabric: "clear weave, stitch detail, natural folds"
cinema_profile:
  lenses: ["24mm", "35mm", "50mm"]
  depth_of_field: {dialogue: "shallow", default: "moderate", establishing: "deep"}
  grading: "neutral-to-cool ACES look with soft highlight roll-off; gentle S-curve"
  grain: "fine cinematic film grain; no oversharpening"
  bloom: "subtle; avoid haloing"
  motion: "freeze decisive instant; avoid smear unless specified by combat"
negative_prompt: >
  cartoon, anime, watercolor, lowres, blurry, soft focus, jpeg artifacts,
  overexposed highlights, HDR halos, crushed blacks, extra fingers, mangled hands,
  face distortion, plastic/wax skin, deformed anatomy, tilt-shift, posterized colors,
  oversaturated teal-orange, excessive bloom, AI watermark, busy background text, random logos
global_lighting:
  volumetrics: "subtle air particulate; motivated god-rays only when rig supports it"
  practicals: "motivated practical lights with believable bounce/fill"
  rims: "crisper rim-lights per rig direction; avoid blown highlights"
texture_fidelity:
  microdetail: "visible pores, fabric weave, edge wear, chipped paint, service scratches"
  surfaces: "metal anisotropy where appropriate; no plastic sheen"

shot_rules:
  default: "medium/wide; strong foreground occlusion; layered depth; show hands/stance; rule of thirds"
  dialogue_standoff: "tight 35–50mm feel; eyes tack-sharp; gentle falloff; background readable"
  combat: "wide or medium-wide; clear motion arcs; brutal, readable expressions"
  establishing: "wide; leading lines; identifiable silhouettes"
  The style must be gritty, dark, and high-contrast. The overall mood should be uncomforting.`;

const CHARACTER_VISUAL_BIBLE = {
  "Female Exile (default look)": "Face: sharp, quietly resolute; light tan; gray-green eyes; short dark-brown bob (ear-length). Build: athletic/lean; curvy, subtle scars at temple/collarbone.",
  "Male Exile (default look)": "Face: sharp, resolute; light tan; gray-green or hazel eyes; short, practical dark-brown cut (side-part, ear-length). Build: athletic/lean; subtle scars at temple/collarbone; slightly broader shoulders than female silhouette.",
  "Kreia": "Patrician features; gray cloth blindfold; silver-gray hair tied low. Robes: ash/charcoal ascetic layers; hood can cover eyes. Right hand missing after canonical event; persist thereafter.",
  "Atton Rand": "Mid-30s, wiry; tousled dark-brown hair; faint stubble; guarded eyes. Stance: slouched, sardonic, ready to bolt.",
  // ... other companions
};

const ARMOR_VARIANTS = {
  kolto_suit: { name: "Kolto Recovery Suit", description: "Light-blue kolto wetsuit under a plain gray utility vest.", class: ['light'] },
  heavy_variant_a: { name: "Durasteel Assault Carapace", description: "Laminate plates, hard edges, weighty pauldrons, reinforced gorget.", class: ['heavy'] },
  medium_variant_a: { name: "Ranger Composite", description: "Layered plating over flexible mesh; articulated elbows/knees.", class: ['medium'] },
  light_variant_a: { name: "Scout Skirmisher Set", description: "Trim plates on breathable fabric; thigh holster loops.", class: ['light'] },
  robes_variant_a: { name: "Austere Jedi Travel Robes", description: "Layered cloth with muted ochre sash; clean lines; fingerless gloves.", class: ['robes'] },
};

const WEAPON_STYLES = {
  vibroblade: "Steel-gray blade, 70cm, leather grip, muted sheen.",
  blaster_pistol: "Compact pistol, slab sides, low-profile emitter.",
  blaster_rifle: "Long-barrel emitter, folding stock, matte finish."
};

const COMPANION_DATA = {
  "Kreia": { loyalty: 50, armor: 'robes_variant_a', stage: 1, present: false },
  "Atton Rand": { loyalty: 50, armor: 'medium_variant_b', stage: 1, present: false },
  // ... other companions
};


const GAME_MASTER_INSTRUCTIONS = `You are a game master for a dark, gritty, psychological text-based RPG retelling of KOTOR II.
- **Pacing & Plot:** Keep the pacing swift. Do not linger in one location for more than 6-7 narrative blocks. Each choice must result in significant plot progression. Strictly follow the KOTOR II plot, including companion introductions.
- **Narrative:** Write 250-350 word narrative blocks.
- **Choices:** Conclude with three new choices representing different *approaches* (tactical, aggressive, diplomatic). Ensure dialogue choices appear roughly every third turn.
- **Companions & Loyalty:** Manage companion loyalty based on player choices. When a companion's loyalty changes, reflect it in the 'loyalty_shifts'. Introduce companions as they appear in the KOTOR II story.
- **JSON Response:** Your entire response MUST be a single JSON object. Do NOT include markdown formatting like \`\`\`json.
The JSON structure MUST be:
{
  "narrative": "The story text for this turn.",
  "choices": ["Choice 1 text.", "Choice 2 text.", "Choice 3 text."],
  "loyalty_shifts": [
    {"companion": "Kreia", "change": 1},
    {"companion": "Atton Rand", "change": -1}
  ],
  "loyalty_echo": "A single, short, italicized, in-world sentence (8-16 words) summarizing the mood shifts. E.g., 'Kreia warms to your pragmatism, while Atton keeps his distance.' Only include this if shifts occurred.",
  "scene_description_for_image": "A detailed description of the current scene for an image generator. Include the player character, all present companions, their appearances based on their current armor, the environment, and the current action. Use cinematic shot language from the visual bible.",
  "companions_update": [
      {"companion": "Kreia", "status": "present"},
      {"companion": "Atton Rand", "status": "present"}
  ]
}`;

type GameState = "characterCreation" | "playing";
type Gender = "Male" | "Female";
type CharacterClass = "Jedi Consular" | "Jedi Guardian" | "Jedi Sentinel";

interface Character {
  gender: Gender;
  class: CharacterClass;
  portrait: string;
  description: string;
  weapon: string | null;
  armor: string; // visual_key from ARMOR_VARIANTS
}

interface Companion {
    name: string;
    loyalty: number;
    armor: string;
    stage: number;
    present: boolean;
}

interface SaveData {
    character: Character;
    narrative: string;
    choices: string[];
    sceneImage: string;
    alignment: number;
    turnCount: number;
    companions: Companion[];
}

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>("characterCreation");
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [narrative, setNarrative] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [sceneImage, setSceneImage] = useState("");
  const [alignment, setAlignment] = useState(50);
  const [turnCount, setTurnCount] = useState(0);
  const [saveFileExists, setSaveFileExists] = useState(false);
  const [companions, setCompanions] = useState<Companion[]>(Object.entries(COMPANION_DATA).map(([name, data]) => ({ name, ...data })));
  const [loyaltyEcho, setLoyaltyEcho] = useState("");

  useEffect(() => {
    if (localStorage.getItem("kotor2_save")) {
      setSaveFileExists(true);
    }
  }, []);

  const saveGame = () => {
    if (!character) return;
    setLoading(true);
    setLoadingMessage("Saving your journey...");
    const saveData: SaveData = { character, narrative, choices, sceneImage, alignment, turnCount, companions };
    localStorage.setItem("kotor2_save", JSON.stringify(saveData));
    setTimeout(() => setLoading(false), 500);
  };

  const loadGame = () => {
    setLoading(true);
    setLoadingMessage("Loading your journey...");
    const savedDataString = localStorage.getItem("kotor2_save");
    if (savedDataString) {
      const savedData: SaveData = JSON.parse(savedDataString);
      setCharacter(savedData.character);
      setNarrative(savedData.narrative);
      setChoices(savedData.choices);
      setSceneImage(savedData.sceneImage);
      setAlignment(savedData.alignment);
      setTurnCount(savedData.turnCount);
      setCompanions(savedData.companions);
      setGameState("playing");
    }
    setLoading(false);
  };
  
  const parseAndSetAiResponse = (text: string) => {
    try {
        const responseObject = JSON.parse(text);
        setNarrative(responseObject.narrative || "The story continues...");
        setChoices(responseObject.choices || []);
        setLoyaltyEcho(responseObject.loyalty_echo || "");

        if (responseObject.loyalty_shifts) {
            let updatedCompanions = [...companions];
            responseObject.loyalty_shifts.forEach((shift: { companion: string, change: number }) => {
                const index = updatedCompanions.findIndex(c => c.name === shift.companion);
                if (index !== -1) {
                    updatedCompanions[index].loyalty = Math.max(0, Math.min(100, updatedCompanions[index].loyalty + shift.change * 10));
                }
            });
            setCompanions(updatedCompanions);
        }
        if (responseObject.companions_update) {
            let updatedCompanions = [...companions];
            responseObject.companions_update.forEach((update: { companion: string, status: string }) => {
                 const index = updatedCompanions.findIndex(c => c.name === update.companion);
                 if(index !== -1) {
                     updatedCompanions[index].present = update.status === 'present';
                 }
            });
            setCompanions(updatedCompanions);
        }

        return responseObject;
    } catch (e) {
        console.error("Failed to parse AI JSON response:", e, "\nRaw text:", text);
        setNarrative("A tremor in the Force has corrupted the path forward. The response from the AI was not structured correctly. Please try again.");
        setChoices([]);
        return null;
    }
  };


  const startGame = async (chosenCharacter: Character) => {
    setCharacter(chosenCharacter);
    setGameState("playing");
    setTurnCount(0);
    setLoading(true);
    setLoadingMessage("The galaxy awaits. Generating the opening scene...");
    
    const initialPrompt = `Start a new game. The player character is a ${chosenCharacter.gender} ${chosenCharacter.class} wearing a ${ARMOR_VARIANTS[chosenCharacter.armor].description}. Start the story with the player waking up abruptly inside a kolto tank in the medical bay of the Peragus mining facility. Describe the murky fluid, sudden awareness, the sterile and damaged environment, and the character's weakness. The first choice must be to pick a weapon: a heavy blaster pistol, a versatile blaster rifle, or a vibroblade. ${GAME_MASTER_INSTRUCTIONS}`;
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: initialPrompt,
        config: { responseMimeType: "application/json" }
      });
      const responseObject = parseAndSetAiResponse(response.text);

      if (responseObject?.scene_description_for_image) {
        const imageResponse = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `${responseObject.scene_description_for_image}. ${VISUAL_STYLE_PROMPT}`,
            config: { numberOfImages: 1, aspectRatio: '16:9' }
        });
        setSceneImage(`data:image/png;base64,${imageResponse.generatedImages[0].image.imageBytes}`);
      }
    } catch (error) {
        console.error("Error starting game:", error);
        setNarrative("A tremor in the Force prevents your story from beginning. Please try again.");
    } finally {
        setLoading(false);
    }
  };

  const handleChoice = async (choice: string, index: number) => {
      if (!character) return;
      setLoading(true);
      setLoadingMessage("Your choice echoes through the Force...");

      let tempCharacter = { ...character };
      if (turnCount === 0) {
        const weaponKey = choice.match(/blaster pistol/i) ? 'blaster_pistol' : choice.match(/blaster rifle/i) ? 'blaster_rifle' : 'vibroblade';
        tempCharacter.weapon = weaponKey;
        setCharacter(tempCharacter);
      }
      
      const newAlignment = Math.max(0, Math.min(100, alignment + (1-index) * 15));
      setAlignment(newAlignment);
      
      const activeCompanions = companions.filter(c => c.present);
      const promptContext = `
        Player State: A ${tempCharacter.gender} ${tempCharacter.class} with a ${newAlignment > 60 ? "Light Side" : newAlignment < 40 ? "Dark Side" : "Neutral"} alignment. 
        Weapon: ${WEAPON_STYLES[tempCharacter.weapon]}. 
        Armor: ${ARMOR_VARIANTS[tempCharacter.armor].description}.
        Active Companions: ${activeCompanions.length > 0 ? activeCompanions.map(c => c.name).join(', ') : 'None'}.
        Previous Narrative: "${narrative}".
        Player chose: "${choice}".
        Continue the story based on this choice.`;
      
      try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `${promptContext} ${GAME_MASTER_INSTRUCTIONS}`,
            config: { responseMimeType: "application/json" }
        });
        const responseObject = parseAndSetAiResponse(response.text);

        if (responseObject?.scene_description_for_image) {
            const imageResponse = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: `${responseObject.scene_description_for_image}. ${VISUAL_STYLE_PROMPT}`,
                config: { numberOfImages: 1, aspectRatio: '16:9' }
            });
            setSceneImage(`data:image/png;base64,${imageResponse.generatedImages[0].image.imageBytes}`);
        }
        setTurnCount(turnCount + 1);

      } catch (error) {
          console.error("Error handling choice:", error);
          setNarrative("The Force is clouded. Your path is uncertain. Please try again.");
      } finally {
          setLoading(false);
      }
  }

  return (
    <div className="container">
       {loading && <LoadingOverlay message={loadingMessage} />}
      {gameState === "characterCreation" ? (
        <CharacterCreation onStartGame={startGame} loading={loading} setLoading={setLoading} setLoadingMessage={setLoadingMessage} saveFileExists={saveFileExists} onLoadGame={loadGame} />
      ) : (
        character && <GameScreen narrative={narrative} choices={choices} image={sceneImage} alignment={alignment} onChoice={handleChoice} onSaveGame={saveGame} loyaltyEcho={loyaltyEcho} />
      )}
    </div>
  );
};

const LoadingOverlay: React.FC<{message: string}> = ({message}) => ( <div className="loading-overlay"><div className="loader"></div><p>{message}</p></div> );

const CharacterCreation: React.FC<{ onStartGame: (character: Character) => void; loading: boolean; setLoading: (loading: boolean) => void; setLoadingMessage: (message: string) => void; saveFileExists: boolean; onLoadGame: () => void; }> = ({ onStartGame, loading, setLoading, setLoadingMessage, saveFileExists, onLoadGame }) => {
  const [gender, setGender] = useState<Gender>("Female");
  const [charClass, setCharClass] = useState<CharacterClass>("Jedi Sentinel");
  const [portrait, setPortrait] = useState<string | null>(null);
  const [customDescription, setCustomDescription] = useState("");

  const generatePortrait = useCallback(async (description?: string) => {
    setLoading(true);
    setLoadingMessage(description ? "Crafting your vision..." : "Summoning a visage...");
    setPortrait(null);
    try {
        const defaultFemalePrompt = `A C_9x16_portrait of the Female Exile. ${CHARACTER_VISUAL_BIBLE['Female Exile (default look)']}. She is a ${charClass}. ${VISUAL_STYLE_PROMPT}`;
        const defaultMalePrompt = `A C_9x16_portrait of the Male Exile. ${CHARACTER_VISUAL_BIBLE['Male Exile (default look)']}. He is a ${charClass}. ${VISUAL_STYLE_PROMPT}`;
        
        const finalPrompt = description ? `A C_9x16_portrait of ${description}. ${VISUAL_STYLE_PROMPT}` : (gender === 'Female' ? defaultFemalePrompt : defaultMalePrompt);

        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: finalPrompt,
            config: { numberOfImages: 1, aspectRatio: '9:16' }
        });
        setPortrait(response.generatedImages[0].image.imageBytes);
    } catch (error) { console.error("Error generating portrait:", error); } 
    finally { setLoading(false); }
  }, [gender, charClass, setLoading, setLoadingMessage]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      setLoadingMessage("Processing your image...");
      const reader = new FileReader();
      reader.onloadend = () => {
        setPortrait((reader.result as string).split(',')[1]);
        setLoading(false);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleStart = () => {
      if (portrait) {
          onStartGame({ gender, class: charClass, portrait, description: `A ${gender} ${charClass}.`, weapon: null, armor: 'kolto_suit' });
      }
  }

  return (
    <div className="character-creation">
      <h1>The Exile</h1>
      <div className="creation-main">
        <div className="portrait-panel">
          <h2>Your Visage</h2>
          <div className="portrait-container">{portrait ? <img src={`data:image/png;base64,${portrait}`} alt="Character Portrait" /> : <div className="portrait-placeholder"><p>Your portrait will appear here.</p><p>Generate one or upload your own.</p></div>}</div>
        </div>
        <div className="options-panel">
          <div className="option-group">
            <h3>Gender</h3>
            <div className="radio-buttons">
                <input type="radio" id="female" name="gender" value="Female" checked={gender === 'Female'} onChange={() => setGender('Female')} disabled={loading} /><label htmlFor="female">Female</label>
                <input type="radio" id="male" name="gender" value="Male" checked={gender === 'Male'} onChange={() => setGender('Male')} disabled={loading} /><label htmlFor="male">Male</label>
            </div>
          </div>
          <div className="option-group">
            <h3>Class</h3>
            <div className="radio-buttons">
                <input type="radio" id="guardian" name="class" value="Jedi Guardian" checked={charClass === 'Jedi Guardian'} onChange={() => setCharClass('Jedi Guardian')} disabled={loading} /><label htmlFor="guardian">Guardian</label>
                <input type="radio" id="sentinel" name="class" value="Jedi Sentinel" checked={charClass === 'Jedi Sentinel'} onChange={() => setCharClass('Jedi Sentinel')} disabled={loading} /><label htmlFor="sentinel">Sentinel</label>
                <input type="radio" id="consular" name="class" value="Jedi Consular" checked={charClass === 'Jedi Consular'} onChange={() => setCharClass('Jedi Consular')} disabled={loading} /><label htmlFor="consular">Consular</label>
            </div>
          </div>
          <div className="portrait-controls">
              <h3>Create Your Visage</h3>
              <p>Generate a default portrait, or describe your own vision.</p>
              <button onClick={() => generatePortrait()} disabled={loading}>Generate Default Portrait</button>
              <textarea className="description-input" placeholder="e.g., 'A Twi'lek with blue skin...'" value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} rows={3} disabled={loading} />
              <button onClick={() => generatePortrait(customDescription)} disabled={!customDescription || loading}>Generate From Description</button>
              <div className="divider-text">OR</div>
              <label htmlFor="portrait-upload" className={`button-like-label ${loading ? 'disabled' : ''}`} tabIndex={loading ? -1 : 0} onKeyDown={(e) => { if (!loading && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); document.getElementById('portrait-upload')?.click(); } }}>Upload Portrait</label>
              <input id="portrait-upload" type="file" accept="image/*" onChange={handleFileChange} disabled={loading} />
          </div>
        </div>
      </div>
      <div className="creation-footer">
        <button onClick={handleStart} disabled={!portrait || loading}>Begin Journey</button>
        {saveFileExists && <button onClick={onLoadGame} disabled={loading} className="load-button">Load Journey</button>}
      </div>
    </div>
  );
};

const GameScreen: React.FC<{ narrative: string; choices: string[]; image: string; alignment: number; onChoice: (choice: string, index: number) => void; onSaveGame: () => void; loyaltyEcho: string; }> = ({ narrative, choices, image, alignment, onChoice, onSaveGame, loyaltyEcho }) => {
    return (
        <div className="game-screen">
            <div className="narrative-panel">
                <div className="narrative-text">{narrative}</div>
                <div className="choices">{choices.map((choice, index) => ( <button key={index} onClick={() => onChoice(choice, index)}>{choice}</button> ))}</div>
            </div>
            <div className="image-panel">
                <div className="game-image-container">
                    <div className="game-image">{image ? <img src={image} alt="Current scene" /> : <div className="loader"></div>}</div>
                    {loyaltyEcho && <p className="loyalty-echo">{loyaltyEcho}</p>}
                </div>
                <div className="game-controls">
                    <div className="alignment-meter">
                        <h3>Alignment</h3>
                        <div className="meter-track"><div className="meter-indicator" style={{ left: `${alignment}%` }}></div></div>
                    </div>
                    <button onClick={onSaveGame} className="save-button" disabled={!narrative}>Save Game</button>
                </div>
            </div>
        </div>
    );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);