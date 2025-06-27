let currWords = [];
let gameUrl = null;
let gameStarted = false;

export function getCurrWords() {
  return currWords;
}

export function setCurrWords(words) {
  const lowerCaseWords = words.map(word => word.toLowerCase());
  const uniqueWords = [...new Set(lowerCaseWords)];
  currWords = uniqueWords;
}

export function getGameUrl() {
  return gameUrl;
}

export function setGameUrl(url) {
  gameUrl = url;
}

export function getGameStarted() {
  return gameStarted;
}

export function setGameStarted(started) {
  gameStarted = started;
}