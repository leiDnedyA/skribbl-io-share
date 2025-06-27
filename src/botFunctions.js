import puppeteer from 'puppeteer';
import { setGameStarted } from './gameState.js';

export async function initBrowser() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return browser;
}

export async function createGame(browser) {
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

export async function startGame(gamePage) {
  await gamePage.waitForSelector('#button-start-game');
  await gamePage.click('#button-start-game');
  await new Promise((res) => { setTimeout(() => { res() }, 200) });
  setGameStarted(true);
}