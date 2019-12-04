const path = require('path')
const uuidv4 = require('uuid/v4')
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
const isDev = require('electron-is-dev')
const Store = require('electron-store')
const settingStore = new Store({
  name: 'Settings'
})
const fileStore = new Store({
  name: 'Files Data'
})
const menuTemplate = require('./src/menuTemplate')
const AppWindow = require('./src/AppWindow')
const QiniuManager = require('./src/utils/QiniuManager')

let mainWindow, settingsWindow

const createManager = () => {
  const accessKey = settingStore.get('accessKey')
  const secretKey = settingStore.get('secretKey')
  const bucket = settingStore.get('bucket')
  return new QiniuManager(accessKey, secretKey, bucket)
}

app.on('ready', () => {
  // mainWindow = new BrowserWindow({
  //   width: 1024,
  //   height: 680,
  //   webPreferences: {
  //     nodeIntegration: true
  //   }
  // })
  const mainWindowConfig = {
    width: 1024,
    height: 680,
  }
  const urlLocation = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, './index.html')}`

  mainWindow = new AppWindow(mainWindowConfig, urlLocation)
  // mainWindow.loadURL(urlLocation)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 设置原生应用菜单
  let menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)

  // 点击菜单设置选项创建新窗口
  ipcMain.on('open-settings-window', () => {
    const settingsWindowConfig = {
      width: 500,
      height: 400,
      parent: mainWindow
    }
    const settingsFileLocation = `file://${path.join(__dirname, './settings/settings.html')}`

    settingsWindow = new AppWindow(settingsWindowConfig, settingsFileLocation)
    settingsWindow.removeMenu()
    settingsWindow.on('closed', () => {
      settingsWindow = null
    })
  })

  // 根据设置动态修改云同步菜单状态
  ipcMain.on('config-is-saved', () => {
    // mac和windows应用菜单位置不一样
    let qiniuMenu = process.platform === 'darwin' ? menu.items[3] : menu.items[2]

    const switchItems = (toggle) => {
      [1,2,3].forEach(number => {
        qiniuMenu.submenu.items[number].enabled = toggle
      })
    }
    const qiniuIsConfiged = [
      'accessKey',
      'secretKey',
      'bucket'
    ].every(key => !!settingStore.get(key))

    if (qiniuIsConfiged) {
      switchItems(true)
    } else {
      switchItems(false)
    }
  })

  ipcMain.on('delete-file', (event, data) => {
    const manager = createManager()
    manager.deleteFile(data.key).then(data => {
      console.log('删除成功', data)
      mainWindow.webContents.send('file-deleted')
    }).catch(() => {
      dialog.showErrorBox('删除失败', '请检查本地文件是否同步')
    })
  })

  ipcMain.on('rename-file', (event, data) => {
    const manager = createManager()
    manager.renameFile(data.key, data.newKey).then(data => {
      console.log('修改成功', data)
      mainWindow.webContents.send('file-renamed')
    }).catch(() => {
      dialog.showErrorBox('修改失败', '请检查本地文件是否同步')
    })
  })

  ipcMain.on('upload-file', (event, data) => {
    const manager = createManager()
    manager.uploadFile(data.key, data.path).then(data => {
      console.log('上传成功', data)
      mainWindow.webContents.send('active-file-uploaded')
    }).catch(() => {
      dialog.showErrorBox('同步失败', '请检查七牛云参数是否正确')
    })
  })

  ipcMain.on('download-file', (event, data) => {
    const { key, id } = data
    const manager = createManager()
    const filesObj = fileStore.get('files')
    manager.getStat(data.key).then(res => {
      // console.log(res)
      // console.log(filesObj[id])
      const serverUpdatedTime = Math.round(res.putTime/10000)
      const localUpdatedTime = filesObj[id].updatedAt
      console.log(serverUpdatedTime)
      console.log(localUpdatedTime)
      if (serverUpdatedTime > localUpdatedTime || !localUpdatedTime) {
        console.log('new file')
        manager.downloadFile(key, data.path).then(res => {
          mainWindow.webContents.send('file-downloaded', {
            status: 'download-success',
            id
          })
        })
      } else {
        console.log('no new file')
        mainWindow.webContents.send('file-downloaded', {
          status: 'no-new-file',
          id
        })
      }
    }, err => {
      console.log(err)
      if (err.statusCode === 612) {
        mainWindow.webContents.send('file-downloaded', {
          status: 'no-file',
          id
        })
      }
    })
  })

  ipcMain.on('upload-all-to-qiniu', () => {
    mainWindow.webContents.send('loading-status', true)
    const manager = createManager()
    const filesObj = fileStore.get('files') || {}
    const uploadPromiseArr = Object.keys(filesObj).map(key => {
      const file = filesObj[key]
      return manager.uploadFile(`${file.title}.md`, file.path)
    })
    Promise.all(uploadPromiseArr).then(result => {
      console.log(result)
      dialog.showMessageBox({
        type: 'info',
        title: `成功上传了${result.length}个文件`,
        message: `成功上传了${result.length}个文件`
      })
      mainWindow.webContents.send('files-uploaded')
    }).catch(() => {
      dialog.showErrorBox('同步失败', '请检查七牛云参数是否正确')
    }).finally(() => {
      mainWindow.webContents.send('loading-status', false)
    })
  })

  ipcMain.on('download-all-to-local', () => {
    const manager = createManager()
    manager.getFileList().then(data => {
      console.log(data.items)
      const files = fileStore.get('files')
      const localFilesArr = Object.keys(files).map(key => files[key])
      // let xxx = data.items.filter(item => {
      //   let localItem = localFilesArr.find(file => file.title === item.key.replace('.md', ''))
      //   if (!localItem) {
      //     return true
      //   } else {
      //     return item.putTime/10000 > localItem.updatedAt
      //   }
      // })
      // console.log('xxxxx', xxx)
      const downloadPromiseArr = data.items.filter(item => {
        let localItem = localFilesArr.find(file => file.title === item.key.replace('.md', ''))
        if (!localItem) {
          return true
        } else {
          return item.putTime/10000 > localItem.updatedAt
        }
      }).map(item => {
        console.log(item)
        const savedLocation = settingStore.get('savedFileLocation') || app.getPath('documents')
        let localItem = localFilesArr.find(file => file.title === item.key.replace('.md', ''))
        return manager.downloadFile(item.key, localItem ? localItem.path : path.join(savedLocation, item.key))
        // .then(() => {
        //   return Promise.resolve(item)
        // })
        .catch(err => {console.log('单个文件下载错误')})
      })
      return Promise.all(downloadPromiseArr)
    })
    .then(arr => {
      console.log('------', arr)
      dialog.showMessageBox({
        type: 'info',
        title: '云端文件下载成功',
        message: '云端文件下载成功'
      })
      const currentFilesObj = fileStore.get('files')
      const currentFilesArr = Object.keys(currentFilesObj).map(key => currentFilesObj[key])
      console.log(currentFilesObj)
      const finalFilesObj = arr.reduce((newFilesObj, qiniuFile) => {
        let existItem = currentFilesArr.find(file => file.title === qiniuFile.key.replace('.md', ''))
        if (existItem){
          // 已存在时更新
          const updatedItem = {
            ...existItem,
            isSynced: true,
            updatedAt: Date.now()
          }
          return {
            ...newFilesObj,
            [existItem.id]: updatedItem
          }
        } else {
          // 不存在时插入
          const newID = uuidv4()
          const newItem = {
            id: newID,
            title: qiniuFile.key.replace('.md', ''),
            path: qiniuFile.downloadPath,
            updatedAt: Date.now(),
            createdAt: Date.now(),
            isSynced: true,
          }
          return {
            ...newFilesObj,
            [newID]: newItem
          }
        }
      }, {...currentFilesObj})
      console.log('final', finalFilesObj)
      mainWindow.webContents.send('all-files-downloaded', {
        files: finalFilesObj
      })
    })
    .catch((err) => {
      dialog.showErrorBox('文件下载失败', '文件下载失败')
    })
  })
})