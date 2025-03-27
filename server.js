import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import csv from 'csv-parser';
import fs from 'fs';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_CREDENTIALS_JSON,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
});
const drive = google.drive({ version: 'v3', auth });

async function extractTextFromGoogleDoc(docId) {
    try {
        const response = await drive.files.export({
            fileId: docId,
            mimeType: 'text/plain',
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching Google Doc:', error);
        return null;
    }
}

app.post('/api/', upload.single('file'), async (req, res) => {
    let question = req.body.question;
    let answer = "";
    
    if (!question) {
        return res.status(400).json({ error: "Question is required" });
    }
    
    const googleDocRegex = /https:\/\/docs\.google\.com\/document\/d\/([^\/]+)/;
    const match = question.match(googleDocRegex);
    
    if (match) {
        const docId = match[1];
        const extractedText = await extractTextFromGoogleDoc(docId);
        if (!extractedText) {
            return res.status(500).json({ error: "Failed to extract text from Google Doc" });
        }
        question = extractedText;
    }
    
    if (req.file) {
        const filePath = req.file.path;
        const results = [];
        
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                fs.unlinkSync(filePath);
                
                if (question.includes('answer column')) {
                    answer = results[0]['answer'] || "Not found";
                } else {
                    answer = "File processed, but no matching query found.";
                }
                res.json({ answer });
            });
    } else {
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: question }]
        });
        answer = response.choices[0].message.content;
        res.json({ answer });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
