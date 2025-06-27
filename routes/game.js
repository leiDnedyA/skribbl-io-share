import express from 'express';
import { getCurrWords, setCurrWords, getGameUrl } from '../src/gameState.js';
import { getGamePage } from '../src/browserState.js';
import { playGame, startGame } from '../src/botFunctions.js';

const router = express.Router();

router.post('/add-word', async (req, res) => {
    const gamePage = getGamePage();
    if (!gamePage) {
        console.log('Failed to add word. Game not started.');
        return res.status(500).json({ message: 'Bot has not started game yet.' });
    }
    const word = req.body.word;
    const wordsToAdd = word.split(',')
        .map(w => w.trim())
        .filter(w => w.length > 0)
        .map(w => w.toLowerCase());
    if (wordsToAdd.length === 0) {
        return res.status(400).json({ message: 'No words to add.' });
    }

    let currWords = getCurrWords();
    const newWords = wordsToAdd.filter(word => !currWords.includes(word));

    if (newWords.length === 0) {
        return res.status(400).json({ message: 'Word(s) already exists.' });
    }

    setCurrWords([...currWords, ...newWords]);
    currWords = getCurrWords();

    await gamePage.type('#item-settings-customwords', `, ${currWords.join(', ')}`);

    console.log(`Added ${newWords.length} words. Total words: ${currWords.length}`);
    res.json({ message: `Added ${newWords.length} words. Total words: ${currWords.length}` });
});

router.get('/url', async (req, res) => {
    const gameUrl = getGameUrl();
    if (!gameUrl) {
        return res.status(500).json({ message: 'Game not started. Try again in 10 seconds.' });
    }
    res.json({ gameUrl });
});

router.post('/start-game', async (req, res) => {
    console.log('Starting game.')
    const gamePage = getGamePage();
    if (!gamePage) {
        return res.status(500).json({ message: 'No game loaded, unable to start.' });
    }

    let currWords = getCurrWords();
    if (currWords.length < 10) {
        return res.status(400).json({ message: `Not enough words to start game. ${10 - currWords.length} more words are needed.` });
    }

    await startGame(gamePage);
    playGame(gamePage); // start this in the background

    console.log('Game started.')
    res.status(200).json({ message: "Game started." });
});

export default router;