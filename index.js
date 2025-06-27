import express from 'express';
import puppeteer from 'puppeteer';
import path from 'path';
import chatgptWordsRouter from './routes/chatgpt-words.js';
import { getCurrWords, setCurrWords } from './src/gameState.js';

const app = express();
const PORT = process.env.PORT || 3000;

async function initBrowser() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return browser;
}

const apiRouter = express.Router();

apiRouter.use('/chatgpt-words', chatgptWordsRouter);

async function createGame(browser) {
  const page = await browser.newPage();

  // websocket scraping based on https://stackoverflow.com/questions/48375700/how-to-use-puppeteer-to-dump-websocket-data
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');
  const gameIdPromise = new Promise((res, rej) => {
    const TIMEOUT_SEC = 10;
    setTimeout(() => { rej(`Timed out after ${TIMEOUT_SEC} seconds trying to find game ID.`) }, TIMEOUT_SEC * 1000);
    client.on('Network.webSocketFrameReceived', ({ response }) => {
      const payloadString = response.payloadData;
      const dataStart = payloadString.indexOf('[');
      if (dataStart) {
        try {
          const payloadData = JSON.parse(payloadString.slice(dataStart, payloadString.length));
          const gameId = payloadData?.[1]?.data?.id;
          if (gameId) {
            res(gameId);
          }
        } catch (e) { }
      }
    });
  });

  await page.goto('https://skribbl.io/');
  await page.waitForSelector('.input-name');
  await page.type('.input-name', 'le bot');
  await page.click('.button-create');
  await page.waitForSelector('#item-settings-customwordsonly');
  const gameId = await gameIdPromise;
  const gameUrl = `https://skribbl.io/?${gameId}`;
  await new Promise(resolve => setTimeout(resolve, 1000));
  await page.evaluate(async () => {
    document.querySelector("#item-settings-customwordsonly").click();
  });
  await page.waitForSelector('#item-settings-customwords');
  console.log('Game created.');
  console.log(`Invite URL: ${gameUrl}`);
  return { gamePage: page, gameUrl };
}

async function cleanUp() {
  if (browser) {
    await browser.close();
  }
}

let browser = null;
let gamePage = null;
let gameUrl = null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(import.meta.dirname, 'static')));

app.post('/api/add-word', async (req, res) => {
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
  if (!gameUrl) {
    return res.status(500).json({ message: 'Game not started. Try again in 10 seconds.' });
  }
  res.json({ gameUrl });
});

app.post('/api/start-game', async (req, res) => {
  console.log('Starting game.')
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
  browser = await initBrowser();
  const gameData = await createGame(browser);
  gamePage = gameData?.gamePage;
  gameUrl = gameData?.gameUrl;
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
