// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- CONFIGURATION ---
// 1. Check for API Key
if (!process.env.GEMINI_API_KEY) {
    console.error("❌ ERROR: GEMINI_API_KEY is missing in .env file!");
    process.exit(1);
}

// 2. Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Switching to the stable version seen in your list
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// --- GLOBAL DATA ---
let medicalGuideText = "";

// --- HELPER: Load Data ---
function loadMedicalData() {
    const filePath = path.join(__dirname, 'medical_data.txt');
    try {
        medicalGuideText = fs.readFileSync(filePath, 'utf8');
        console.log("✅ Medical Data Loaded! Chars:", medicalGuideText.length);
    } catch (err) {
        console.error("❌ Error reading medical_data.txt. Did you create it?", err.message);
    }
}

// --- ROUTES ---

app.get('/', (req, res) => {
    res.send("Medical AI Server is Online! 🧠");
});

app.post('/chat', async (req, res) => {
    const userQuestion = req.body.question;   // Text
    const userAudio = req.body.audio;   // Base64 Audio
    const userHistory = req.body.history || "No previous context.";
    console.log(`❓ Received Request. Has Audio? ${!!userAudio}. Text: ${userQuestion}`);
    console.log("❓ Question:", userQuestion);

    if (!medicalGuideText) {
        return res.status(500).json({ answer: "Error: Medical data not loaded." });
    }

    try {
        // --- CONSTRUCT THE PROMPT ---
        // This is the "Engine" of your game. We give the AI the rules and data.
        // Gemini allows an array of inputs: [Text, Image, Audio]
        let promptParts = [];

        const systemInstruction = `
        You are a helpful Medical Learning Assistant.
        
        CONTEXT DATA: ${medicalGuideText}
        PREVIOUS CONVERSATION (Memory): ${userHistory}
        
        STRICT RULES:
        1. Answer ONLY using the context data provided.
        2. **TOPIC DETECTION (Crucial)**: 
           - Analyze the "CURRENT USER QUESTION". 
           - Does it explicitly name a **Medical Subject** (e.g., a specific disease, symptom, body part, or condition found in the Context Data)?
           - **IF YES (New Topic):** Ignore the previous conversation. Focus purely on this new subject.
           - **IF NO (Follow-up):** If the question only contains conversational words (like "in short", "tell me more", "why?", "symptoms", "treatment"), assume the user is talking about the topic in "PREVIOUS CONVERSATION".

        3. **STYLE CHECK**: Listen to the user's intent for length:
           - If they ask for "short", "brief", "summary", or "in short": keep the answer under 30 words.
           - If they ask for "detailed", "explain", or "more info": provide a longer explanation.
           - Otherwise: Standard length (approx 50 words).

        4. If I provide AUDIO, transcribe it internally and answer the medical question found in it.
        5. If the audio is unclear, say "I couldn't hear that clearly."
        6. Answer based on Context Data.
        7. Do NOT give real medical advice. Always add a disclaimer.
        8. If the answer is not in the text, say "I'm sorry, that information is not in my medical guide.
        
        OUTPUT FORMAT (JSON ONLY):
        { "answer": "Your answer here...", "topic": "The Topic Discussed" }
        `;

        promptParts.push(systemInstruction);

        // --- ADD USER INPUT (TEXT OR AUDIO) ---
        if (userAudio) {
            // Add the Audio Part
            promptParts.push({
                inlineData: {
                    mimeType: "audio/wav",
                    data: userAudio
                }
            });
            promptParts.push("Answer this medical question from the audio.");
        } else {
            // Add the Text Part
            promptParts.push(`CURRENT USER QUESTION: ${userQuestion}`);
        }

        // --- CALL GEMINI ---
        const result = await model.generateContent(promptParts);
        const response = await result.response;
        const text = response.text();

        // --- CLEAN UP RESPONSE ---
        // Sometimes AI adds backticks like \`\`\`json ... \`\`\`. We remove them to parse JSON.
        const cleanJson = text.replace(/```json|```/g, '').trim();
        const data = JSON.parse(cleanJson);

        console.log("🤖 Answer:", data.answer);

        // Send to Unity
        res.json(data);

    } catch (error) {
        console.error("❌ AI Error:", error);
        res.status(500).json({
            answer: "I had trouble understanding that."
        });
    }
});

// --- START ---
loadMedicalData();
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});