import express from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { getCurrWords } from '../src/gameState.js';

dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
const router = express.Router();

router.get('/', async (req, res) => {
    const count = 3;
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Generate " + count + " words for a game of pictionary. Make them interesting but simple enough for a kid to draw and guess. Include animals performing actions (e.g monkey riding a bike), popular food brands like McDonalds or Starbucks, and other things that are easy to draw. Do not include any words in this current list. Respond only with a comma separated list of words. The current list of words is: " + getCurrWords().join(', ') }],
        temperature: 2,
    });
    const words = response.choices[0].message.content.split(',').map(w => w.trim());
    console.log(`Chatgpt generated ${words.length} words.`);
    res.json({ words: words.join(', ') });
})


export default router;