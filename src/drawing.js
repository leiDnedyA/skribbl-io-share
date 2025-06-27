
export async function drawImage(gamePage, imgSrc) {
    await gamePage.evaluate((imgSrc) => {
        // Ripped from https://github.com/Dev-Zhao/skribbl.io-autodraw
        class Toolbar{
            constructor(){
                this._toolbarElement = document.querySelector('.containerToolbar');
        
                let colorElementsContainer = this._toolbarElement.querySelector('.containerColorbox');
                let colorElements = Array.prototype.slice.call(colorElementsContainer.querySelectorAll('.colorItem'));
                this._colorElementsLookup = {}; // The lookup will look like this: { '{"r":0-255,"g":0-255,"b":0-255}' : colorElement, ... }
                this._colors = []; // This will look like [ {r: 0-255, g: 0-255, b: 0-255}, ... ] 
                colorElements.forEach((element) => {
                    // element.style.backgroundColor is an RGB string: 'rgb(0-255, 0-255, 0-255)'
                    // We need to convert it to a color object to use it
                    let color = Color.getColorFromRGBString(element.style.backgroundColor);
                    this._colorElementsLookup[color.JSONString] = element;
                    this._colors.push(color);
                });
        
                // Used to store a color and its nearest color that's available in game.
                // This means we only have to calculate the nearest color for a given color once.
                this._nearestColorLookup = {};
            
                let toolElementsContainer = this._toolbarElement.querySelector('.containerTools');
                this._toolElementsLookup = {
                    brush: toolElementsContainer.children[0],
                    eraser: toolElementsContainer.children[1],
                    fill: toolElementsContainer.children[2]
                }
            
                let brushElementsContainer = this._toolbarElement.querySelector('div.containerBrushSizes');
                this._brushElementsLookup = {
                    0 : {
                        brushDiameterforDots: 4,
                        brushDiameterforLines: 2.7,
                        brushElement: brushElementsContainer.children[0]
                    },
                    1 : {
                        brushDiameterforDots: 9,
                        brushDiameterforLines: 6,
                        brushElement: brushElementsContainer.children[1]
                    },
                    2 : {
                        brushDiameterforDots: 20,
                        brushDiameterforLines: 17,
                        brushElement: brushElementsContainer.children[2]
                    },
                    3 : {
                        brushDiameterforDots: 40,
                        brushDiameterforLines: 37,
                        brushElement: brushElementsContainer.children[3]
                    },
                };
        
                this._clearCanvasButton = document.getElementById('buttonClearCanvas');
            }
        
            get colors(){
                return this._colors;
            }
        
            get isActive(){
                return (this._toolbarElement.style.display != "none");
            }
        
            getNearestAvailableColor(color){ // get nearest color that's available in game.
                let shortestDistance = Number.MAX_SAFE_INTEGER;
                let key = color.JSONString;
                let nearestColor;
        
                if (color.a == 0){
                    nearestColor = new Color(0, 0, 0, 0);
                }
                else if (key in this._nearestColorLookup) {
                    // look for the nearest color in the lookup. This is what the lookup looks like: 
                    // { (color in JSON string format) : (nearest color that's available in game) }
                    nearestColor = this._nearestColorLookup[key];
                }
                else { // nearest color could not found in lookup
                    for (let i = 0; i < this._colors.length; i++) {
                        let distance = Color.distance(color, this._colors[i]);
        
                        if (distance < shortestDistance) { 
                            shortestDistance = distance;
                            nearestColor = this._colors[i];
                        }
                    }
        
                    // Store the nearest color in the lookup
                    this._nearestColorLookup[key] = nearestColor;
                }
        
                return nearestColor;
            }
        
            // All of these toolbar elements are provided by Skribbl.io, if we want to use them, we need to click on the appropriate element.
            // The toolbar only appears if it's the player's turn to draw.
            setColor(color) {
                this._colorElementsLookup[color.JSONString].click();
            }
        
            useTool(toolName) {
                this._toolElementsLookup[toolName].click();
            }
        
            getBrushDiameter(drawMode, brushNum){
                switch (drawMode){
                    case "Dots":
                        return this._brushElementsLookup[brushNum].brushDiameterforDots;
                        break;
                    case "Lines":
                        return this._brushElementsLookup[brushNum].brushDiameterforLines;
                        break;
                }
            }
        
            setBrushNum(brushNum) {
                this._brushElementsLookup[brushNum].brushElement.click();
            }
        
            clearCanvas() {
                this._clearCanvasButton.click();
            }
        };

        let storage = {
            getData: function(key){
                return new Promise ((resolve, reject) => {
                    chrome.storage.sync.get(key, (data) => {
                        if (chrome.runtime.lastError){
                            reject(chrome.runtime.lastError.message);
                        }
        
                        resolve(data[key]);
                    });        
                });
            },
        
            setData: function(data){
                return new Promise ((resolve, reject) => {
                    chrome.storage.sync.set(data, () => {
                        if (chrome.runtime.lastError){
                            reject(chrome.runtime.lastError.message);
                        }
        
                        resolve();
                    });        
                });        
            }
        };

        let imageHelper = {
            // 'Load an image using Promise()' - https://stackoverflow.com/a/52060802
            // 'Promise' - https://javascript.info/promise-basics
            loadImage: function (imgSrc) {
                return new Promise(function (resolve, reject) {
                    let img = new Image();

                    img.addEventListener('load', function () {
                        resolve(img);
                    });

                    img.addEventListener('error', reject);

                    // When you draw on a canvas with any data loaded from another origin without CORS, canvas becomes tainted.
                    // Any attempts to retrieve image data from canvas will cause an exception.
                    // 'Allowing cross-origin use of images and canvas' - 'https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image
                    img.crossOrigin = "Anonymous"; // Fetch image using CORS without credentials - https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#Attributes
                    img.src = imgSrc;
                });
            },

            scaleImage: function (img, options) {
                // Setting options or using default values if they don't exist
                let size = {
                    width: options.width || 800,
                    height: options.height || 600,
                };
                let scaleMode = options.scaleMode || 'scaleToFit';

                let canvas = document.createElement('canvas');

                // 'Scaling an image to fit on canvas' - https://stackoverflow.com/a/23105310
                // See it live: https://codepen.io/charliezhao0916/pen/oKayxE
                let wRatio = size.width / img.width;
                let hRatio = size.height / img.height;

                let ratio;
                let scaledImageWidth;
                let scaledImageHeight;

                switch (scaleMode) {
                    // Suppose image original size is 200 x 300, and size parameter is 800 x 600
                    // wRatio: 800/200 = 4, hRatio: 600 / 300 = 2
                    case 'scaleToFit':
                        // Determine which ratio is smaller. For the example, the hRatio would be smaller. 
                        // The image width/height will be multiplied by this ratio, so the image size is now 400x600
                        // Note: the image size will always be equal or smaller than the size parameter --> scaled to fit
                        ratio = Math.min(wRatio, hRatio);

                        scaledImageWidth = img.width * ratio;
                        scaledImageHeight = img.height * ratio;

                        // The image size is smaller than the size parameter, so we set canvas size to the image size to remove empty space
                        canvas.width = scaledImageWidth;
                        canvas.height = scaledImageHeight;
                        break;
                    case 'scaleToFill':
                        // Determine which ratio is larger. For the example, the wRatio would be larger. 
                        // The image width/height will be multiplied by this ratio, so the image size is now 800 x 1200
                        // Note: the image size will always be equal or larger than the size parameter --> scaled to fill
                        ratio = Math.max(wRatio, hRatio);

                        scaledImageWidth = img.width * ratio;
                        scaledImageHeight = img.height * ratio;

                        // The image size is larger than the size parameter, so we set canvas size to the size parameter.
                        // Some parts of the image will be cut off, but we are limited to the size parameter.
                        canvas.width = size.width;
                        canvas.height = size.height;
                        break;
                }

                // This determines from where on the canvas we are drawing the image
                // It is set so that we are always centering the image on the canvas
                let dx = (canvas.width - scaledImageWidth) / 2;
                let dy = (canvas.height - scaledImageHeight) / 2;

                // Draw the image on the canvas, this is where the scaling happens
                // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
                let canvasContext = canvas.getContext('2d');
                canvasContext.drawImage(img, dx, dy, scaledImageWidth, scaledImageHeight);

                return canvasContext.getImageData(0, 0, canvas.width, canvas.height);
            },

            getPixelColor: function (imageData, x, y) {
                const data = imageData.data;

                // Suppose you have a 2x2 image:
                // RED PIXEL  (x:0, y:0) |       GREEN PIXEL (x:1, y:0)
                // BLUE PIXEL (x:0, y:1) | TRANSPARENT PIXEL (x:1, y:1)
                // The data array is 1-dimensional, and it looks like this:
                // [ 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0 ]  
                // |   1ST PIXEL   |   2ND PIXEL   |   3RD PIXEL   | 4TH  PIXEL |
                // Each pixel has 4 values which corresponds to rgba
                // Notice the index for the first pixel's values starts at 0, second pixel: 4, third: 8, fourth: 12
                // This can be calculated using the formula: 4*y*imageWidth + 4*x
                let i = 4 * y * imageData.width + 4 * x; // r: data[i], g: data[i+1], b: data[i+2], a: data[i+3]

                return new Color(data[i], data[i + 1], data[i + 2], data[i + 3]);
            },

            // 'Get average color from area of image' - https://stackoverflow.com/a/44557266
            // To get the pixel data (array) from an area of the image, the solution uses: context.getImageData(x, y, width, height).data
            // This is very slow, it's much faster to get the pixel data (array) of the entire image and use indexes to get the values for the specific pixels you want
            getAverageColor: function (imageData, startX, startY, width, height) {
                let totals = { r: 0, g: 0, b: 0, weight: 0, numPixels: 0 };

                for (let y = startY; y < startY + height; y++) {
                    for (let x = startX; x < startX + width; x++) {
                        let color = this.getPixelColor(imageData, x, y);

                        // Use the alpha channel as the weight, the more transparent the pixel, the less we care about its rgb values
                        let weight = color.a / 255;
                        totals.r += color.r * weight;
                        totals.g += color.g * weight;
                        totals.b += color.b * weight;
                        totals.weight += weight;
                        totals.numPixels++;
                    }
                }

                let averageColor = new Color(
                    // The | operator stands for bitwise OR, OR 0 will truncate any decimals
                    // 'Using bitwise OR 0 to floor a number' - https://stackoverflow.com/questions/7487977/using-bitwise-or-0-to-floor-a-number
                    totals.r / totals.weight | 0, // r
                    totals.g / totals.weight | 0, // g
                    totals.b / totals.weight | 0, // b
                    totals.weight / totals.numPixels, // a
                );

                return averageColor;
            },
        };

        //'Making functions non-blocking' - https://medium.com/@maxdignan/making-blocking-functions-non-blocking-in-javascript-dfeb9501301c
        // Javascript runtimes can only perform one task at a time, if we are running thoudsands of draw commands, it blocks
        // everything else from happening. This allows Javascript to do other things while we are drawing
        class CommandsProcessor {
            constructor(commands) {
                this.commands = commands;
            }

            clearCommands() {
                this.commands = [];
            }

            setCommands(commands) {
                this.commands = commands;
            }

            process(delay, keepGoing) {
                let runCommand = () => {
                    if (!this.commands.length || !keepGoing()) { // Do nothing if there are no commands
                        return;
                    }

                    // Get and run the next command
                    let command = this.commands.shift();
                    command();

                    // Call runCommand() again after some delay
                    setTimeout(runCommand, delay);
                }

                runCommand(); // Start running commands
            }

        }

        let createArtist = function (toolbar) {
            let gameCanvas = document.getElementById('canvasGame');
            let gameBackgroundColor = new Color(255, 255, 255, 255) // white;
            let transparentColor = new Color(0, 0, 0, 0);

            let dispatchGameCanvasMouseEvent = function (name, x, y) {
                // Used to get position of the game canvas relative to the view port
                // See: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
                let rect = gameCanvas.getBoundingClientRect();

                // gameCanvas.style.width and gameCanvas.style.height is the size of the canvas element shown on the page
                //  > This changes when the page resizes, so we have to account for this when creating a mouse event
                // gameCanvas.width and gameCanvas.height is the size of the coordinate system used by Canvas API
                //  > This is fixed (800x600)
                // See: https://stackoverflow.com/a/19079320
                //
                // Suppose game canvas was 800x600 and we wanted to create a mouse event at x = 200 and y = 200 
                // If the game canvas get resized to 400x300 (halved), then the mouse event has to be created at x = 100 and y = 100
                // IMPORTANT: When game canvas resizes, it maintains aspect ratio, so both width and height will resize by same ratio
                let ratio = rect.width / gameCanvas.width;

                // rect.x and rect.y - position of the top left corner of the canvas
                // x and y - position of where the mouse event will take place relative to the canvas
                // > we multiply this by the ratio to account for the actual size of the canvas shown on the page
                let mouseEvent = new MouseEvent(name,
                    {
                        bubbles: true,
                        clientX: rect.x + x * ratio,
                        clientY: rect.y + y * ratio,
                        button: 0
                    }
                );

                gameCanvas.dispatchEvent(mouseEvent);
            };

            let generateDots = function (img, brushDiameter) {
                // Scale the image to fit the game canvas
                let imageData = imageHelper.scaleImage(img, { width: gameCanvas.width, height: gameCanvas.height, scaleMode: 'scaleToFit' });

                // This offset is used to center the image on the canvas
                // 'Scaling an image to fit on canvas' - https://stackoverflow.com/a/23105310
                let xOffset = (gameCanvas.width - imageData.width) / 2;
                let yOffset = (gameCanvas.height - imageData.height) / 2;

                let dots = [];
                // Separate the image into areas, the size is a square with width/height equal to the brush diameter
                for (let y = 0; y < imageData.height; y += brushDiameter) {
                    for (let x = 0; x < imageData.width; x += brushDiameter) {
                        // Get the average color of that area
                        let averageColor = imageHelper.getAverageColor(imageData, x, y, brushDiameter, brushDiameter);

                        // Get the nearest color that's available in Skribbl.io
                        let nearestColor = toolbar.getNearestAvailableColor(averageColor);

                        // You can draw a dot by clicking on the game canvas, the dot's center will be placed on where you clicked
                        // This will draw the dot exactly at the center of the area
                        let dotX = (x + (x + brushDiameter - 1)) / 2;
                        let dotY = (y + (y + brushDiameter - 1)) / 2;

                        dots.push({
                            color: nearestColor,
                            brushDiameter: brushDiameter,
                            x: dotX + xOffset,
                            y: dotY + yOffset,
                        });
                    }
                }

                return dots;
            };

            let drawDots = function (img, brushNum) {
                let commands = [];

                let brushDiameter = toolbar.getBrushDiameter("Dots", brushNum);

                let dots = generateDots(img, brushDiameter);

                // Sort the array such that the dot with smaller x value is put before dot with larger x value
                // This makes it so that we draw dots from left to right
                dots.sort((dot1, dot2) => {
                    return dot1.x - dot2.x;
                });

                dots.forEach((dot) => {
                    if (dot.color.isEqual(transparentColor) || dot.color.isEqual(gameBackgroundColor)) {
                        // Don't draw any dots that have the same color as game background color
                        return;
                    }

                    commands.push(function () {
                        toolbar.useTool('brush');
                        toolbar.setBrushNum(brushNum);
                        toolbar.setColor(dot.color);

                        dispatchGameCanvasMouseEvent("mousedown", dot.x, dot.y);
                        dispatchGameCanvasMouseEvent("mouseup", dot.x, dot.y);
                    });
                });

                return commands;
            };


            let generateLines = function (img, brushDiameter) {
                // Scale the image to fit the game canvas
                let imageDrawWidth = gameCanvas.width / brushDiameter;
                let imageDrawHeight = gameCanvas.height / brushDiameter;
                let imageData = imageHelper.scaleImage(img, { width: imageDrawWidth, height: imageDrawHeight, scaleMode: 'scaleToFit' });

                // This offset is used to center the image on the canvas
                // 'Scaling an image to fit on canvas' - https://stackoverflow.com/a/23105310
                let xOffset = (gameCanvas.width - imageData.width * brushDiameter) / 2;
                let yOffset = (gameCanvas.height - imageData.height * brushDiameter) / 2;

                let horizontalLines = [];
                let startX;
                let currColor = {};
                let lineColor = {};

                // Horizontally
                for (let y = 0; y < imageData.height; y++) {
                    startX = 0;
                    lineColor = imageHelper.getPixelColor(imageData, 0, y);
                    lineColor = toolbar.getNearestAvailableColor(lineColor);

                    for (let x = 1; x < imageData.width; x++) {
                        currColor = imageHelper.getPixelColor(imageData, x, y);
                        currColor = toolbar.getNearestAvailableColor(currColor);

                        if (!currColor.isEqual(lineColor)) {
                            if (!lineColor.isEqual(transparentColor) && !lineColor.isEqual(gameBackgroundColor)) {
                                let lineStartX = (startX * brushDiameter) + xOffset;
                                let lineEndX = ((x - 1) * brushDiameter) + xOffset;

                                horizontalLines.push({
                                    start: {
                                        x: lineStartX,
                                        y: (y * brushDiameter) + yOffset,
                                    },
                                    end: {
                                        x: lineEndX,
                                        y: (y * brushDiameter) + yOffset,
                                    },
                                    length: lineEndX - lineStartX,
                                    color: lineColor,
                                    brushDiameter: brushDiameter
                                });
                            }

                            startX = x;
                            lineColor = currColor;
                        }
                    }
                }

                // Vertically
                let verticalLines = [];
                let startY;
                for (let x = 0; x < imageData.width; x++) {
                    startY = 0;
                    lineColor = imageHelper.getPixelColor(imageData, x, 0);
                    lineColor = toolbar.getNearestAvailableColor(lineColor);

                    for (let y = 1; y < imageData.height; y++) {
                        currColor = imageHelper.getPixelColor(imageData, x, y);
                        currColor = toolbar.getNearestAvailableColor(currColor);

                        if (!currColor.isEqual(lineColor)) {
                            if (!lineColor.isEqual(transparentColor) && !lineColor.isEqual(gameBackgroundColor)) {
                                let lineStartY = (startY * brushDiameter) + yOffset;
                                let lineEndY = ((y - 1) * brushDiameter) + yOffset;

                                verticalLines.push({
                                    start: {
                                        x: (x * brushDiameter) + xOffset,
                                        y: lineStartY,
                                    },
                                    end: {
                                        x: (x * brushDiameter) + xOffset,
                                        y: lineEndY,
                                    },
                                    length: lineEndY - lineStartY,
                                    color: lineColor,
                                    brushDiameter: brushDiameter
                                });
                            }

                            startY = y;
                            lineColor = currColor;
                        }
                    }
                }

                return ((horizontalLines.length < verticalLines.length) ? horizontalLines : verticalLines);
            };

            let drawLines = function (img, brushNum) {
                let commands = [];

                let brushDiameter = toolbar.getBrushDiameter("Lines", brushNum);

                let lines = generateLines(img, brushDiameter);

                lines.sort((line1, line2) => {
                    return line2.length - line1.length;
                });

                // Get the position of the 
                lines.forEach((line) => {
                    commands.push(function () {
                        toolbar.useTool('brush');
                        toolbar.setBrushNum(brushNum);
                        toolbar.setColor(line.color);

                        dispatchGameCanvasMouseEvent("mousedown", line.start.x, line.start.y);
                        dispatchGameCanvasMouseEvent("mousemove", line.end.x, line.end.y);
                        dispatchGameCanvasMouseEvent("mouseup", line.end.x, line.end.y);
                    });
                });

                return commands;
            };

            return {
                draw: function (img, options) {
                    let drawMode = options.drawMode || "Lines";
                    let brushNum = options.brushNum || 0;

                    let drawFunction = (drawMode == "Dots") ? drawDots : drawLines;

                    let commands = [];
                    commands.push(function () {
                        toolbar.clearCanvas(); // Clear canvas before drawing anything
                    })
                    commands = commands.concat(drawFunction(img, brushNum));

                    return commands;
                }
            };
        };

        function _drawImage(imgSrc) {
            let toolbar = new Toolbar();
            let artist = createArtist(toolbar);

            imageHelper.loadImage(imgSrc).then((img) => {
                Promise.all([storage.getData("drawMode"), storage.getData("brushNum")]).then((data) => {
                    drawCommands = artist.draw(img, {
                        drawMode: data[0],
                        brushNum: data[1]
                    });

                    commandsProcessor.setCommands(drawCommands);

                    commandsProcessor.process(10, () => {
                        return toolbar.isActive;
                    });
                });
            }).catch(() => {
                showInstructionOverlay("Whoops.. Image failed to load.");

                setTimeout(() => {
                    hideInstructionOverlay();
                    setUpDragEventsListeners();
                    processingImage = false;
                }, 2000);
            });
        }
        _drawImage(imgSrc);
    }, imgSrc);
}