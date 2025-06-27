import puppeteer from 'puppeteer';
import { setGameStarted } from './gameState.js';
import { drawImage } from './drawing.js';

export async function initBrowser() {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
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

export async function playGame(gamePage) {
  await waitForTurn(gamePage);
  console.log('Turn started.');
  const wordButtonSelector = "#game-canvas > div.overlay-content > div.words.show > div:nth-child(1)";
  await gamePage.waitForSelector(wordButtonSelector);
  const word = await gamePage.evaluate(async (selector) => {
    const element = document.querySelector(selector);
    const word = element.innerText
    element.click();
    return word;
  }, wordButtonSelector);
  await new Promise((res) => { setTimeout(() => { res() }, 200) });
  await gamePage.click(wordButtonSelector);
  await new Promise((res) => { setTimeout(() => { res() }, 500) });
  await drawImage(gamePage, "https://i.imgur.com/99TClvD.png");
}

export async function waitForTurn(gamePage) {
  await gamePage.evaluate(async () => {

    const check = () => {
      const text = document
        ?.querySelector("#game-canvas > div.overlay-content")
        ?.firstChild
        ?.innerText
        ?.toLowerCase()
        ?.trim();
      return text?.includes("choose a word");
    }

    return new Promise((res) => {
      const interval = setInterval(() => {
        if (check()) {
          clearInterval(interval);
          res();
        }
      }, 200);
    })
  });
}
