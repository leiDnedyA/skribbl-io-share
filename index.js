import express from 'express';
import path from 'path';
import chatgptWordsRouter from './routes/chatgpt-words.js';
import { getCurrWords, setCurrWords, getGameUrl, setGameUrl } from './src/gameState.js';
import { createGame, initBrowser } from './src/botFunctions.js';
import { getBrowser, getGamePage, setBrowser, setGamePage } from './src/browserState.js';
import gameRouter from './routes/game.js';

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

app.use('/api/game', gameRouter);

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
