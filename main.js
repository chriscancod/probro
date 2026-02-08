const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    titleBarStyle: 'hiddenInset', // Gives it that clean Mac "integrated" look
    webPreferences: {
      nodeIntegration: true
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// Standard Mac behavior: stay open even if window is closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});