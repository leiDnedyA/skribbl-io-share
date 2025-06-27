import express from 'express';
import path from 'path';
import chatgptWordsRouter from './routes/chatgpt-words.js';
import { getCurrWords, setCurrWords, getGameUrl, setGameUrl } from './src/gameState.js';
import { createGame, initBrowser } from './src/botFunctions.js';
import { getBrowser, getGamePage, setBrowser, setGamePage } from './src/browserState.js';

const app = express();
const PORT = process.env.PORT || 3000;

const apiRouter = express.Router();

apiRouter.use('/chatgpt-words', chatgptWordsRouter);

async function cleanUp() {
  const browser = getBrowser();
  if (browser) {
    await browser.close();
  }
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(import.meta.dirname, 'static')));

app.post('/api/add-word', async (req, res) => {
  const gamePage = getGamePage();
  console.log('Game page:', gamePage);
  if (!gamePage) {
    console.log('Failed to add word. Game not started.');
    return res.status(500).json({ message: 'Bot has not started game yet.' });
  }
  const word = req.body.word;
  const wordsToAdd = word.split(',').map(w => w.trim()).filter(w => w.length > 0);
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

app.get('/api/game-url', async (req, res) => {
  const gameUrl = getGameUrl();
  if (!gameUrl) {
    return res.status(500).json({ message: 'Game not started. Try again in 10 seconds.' });
  }
  res.json({ gameUrl });
});

app.post('/api/start-game', async (req, res) => {
  console.log('Starting game.')
  const gamePage = getGamePage();
  if (!gamePage) {
    return res.status(500).json({ message: 'No game loaded, unable to start.' });
  }

  let currWords = getCurrWords();
  if (currWords.length < 10) {
    return res.status(400).json({ message: `Not enough words to start game. ${10 - currWords.length} more words are needed.` });
  }

  // Always add "robot" as a word
  if (!currWords.includes('robot')) {
    setCurrWords([...currWords, 'robot']);
    await gamePage.type('#item-settings-customwords', `, robot`);
    console.log('Added "robot" as a word.');
  }

  await gamePage.click('#button-start-game');
  await new Promise((res) => { setTimeout(() => { res() }, 200) });

  await gamePage.close();
  console.log('Game started.')
  res.status(200).json({ message: "Game started." });
  await cleanUp();
  process.exit(0);
});

app.use('/api', apiRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, async () => {
  const browser = await initBrowser();
  setBrowser(browser);
  const gameData = await createGame(browser);
  setGamePage(gameData?.gamePage);
  setGameUrl(gameData?.gameUrl);
  console.log('Bot URL: ' + `http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  console.info('SIGTERM signal received.');
  cleanUp();
});

process.on('SIGINT', () => {
  console.info('SIGINT signal received.');
  cleanUp();
});
