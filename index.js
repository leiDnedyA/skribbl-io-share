import express from 'express';
import path from 'path';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 3000;

async function initBrowser() {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    return browser;
}

async function createGame(browser) {
    const page = await browser.newPage();
    await page.goto('https://skribbl.io/');
    await page.waitForSelector('.input-name');
    await page.type('.input-name', 'Olivia Rodriguez');
    await page.click('.button-create');
    await page.waitForSelector('#item-settings-customwordsonly');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.evaluate(async () => {
        document.querySelector("#item-settings-customwordsonly").click();
    });
    await page.waitForSelector('#item-settings-customwords');
    console.log('Game created.');
    return page;
}

async function cleanUp() {
    if (browser) {
        await browser.close();
    }
}

let browser = null;
let gamePage = null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(import.meta.dirname, 'static')));

app.post('/api/add-word', async (req, res) => {
    if (!gamePage) {
        console.log('Failed to add word. Game not started.');
        return res.status(500).json({ error: 'Game not started.' });
    }
    const word = req.body.word;
    const currentWordText = await gamePage.evaluate(() => {
        return document.querySelector('#item-settings-customwords').value;
    });
    console.log({currentWordText, word})
    if (currentWordText) {
        await gamePage.type('#item-settings-customwords', `, ${word}`);
    } else {
        console.log({word})
        await gamePage.type('#item-settings-customwords', word);
    }
    console.log('Word added.');
    res.json({ message: 'Word added!' });
});

app.post('/api/start-game', async (req, res) => {
    if (!gamePage) {
        return res.status(500).json({ error: 'No game loaded, unable to start.' });
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, async () => {
    browser = await initBrowser();
    gamePage = await createGame(browser);
    console.log(`Server is running on port ${PORT}`);
    console.log(`Test endpoint available at: http://localhost:${PORT}/api/test`);
    console.log(`Static files served from: http://localhost:${PORT}/`);
});


process.on('SIGTERM', () => {
    console.info('SIGTERM signal received.');
    cleanUp();
});

process.on('SIGINT', () => {
    console.info('SIGINT signal received.');
    cleanUp();
});