const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const db = require('./database')

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.on('check-mined-words', (event, words) => {
  db.all('SELECT word FROM words WHERE word IN (' + words.map(() => '?').join(',') + ')', 
    words,
    (err, rows) => {
      if (err) {
        console.error(err)
        event.reply('mined-words-result', [])
      } else {
        event.reply('mined-words-result', rows.map(row => row.word))
      }
    }
  )
})

ipcMain.on('get-mined-words', (event) => {
  db.all('SELECT word, length, mined_count FROM words ORDER BY length DESC', 
    (err, rows) => {
      if (err) {
        console.error(err)
        event.reply('mined-words-list', [])
      } else {
        event.reply('mined-words-list', rows)
      }
    }
  )
})

ipcMain.on('store-word', (event, word) => {
  db.run('INSERT OR REPLACE INTO words (word, length, mined_count) VALUES (?, ?, COALESCE((SELECT mined_count + 1 FROM words WHERE word = ?), 1))', 
    [word, word.length, word], 
    function(err) {
      if (err) {
        console.error(err)
      }
      event.reply('word-stored', word)
    }
  )
})

ipcMain.on('clear-database', async (event) => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Limpar Banco de Dados',
    message: 'Tem certeza que deseja limpar o banco de dados?',
    detail: 'Esta ação irá apagar todas as palavras mineradas e não pode ser desfeita.',
    buttons: ['Cancelar', 'Limpar'],
    defaultId: 0,
    cancelId: 0
  })

  if (result.response === 1) {
    db.run('DELETE FROM words', (err) => {
      if (err) {
        console.error(err)
        event.reply('database-cleared', false)
      } else {
        event.reply('database-cleared', true)
      }
    })
  } else {
    event.reply('database-cleared', false)
  }
})
