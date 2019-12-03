import React, { useState, useEffect } from 'react';
import uuidv4 from 'uuid/v4'
import SimpleMDE from 'react-simplemde-editor'
import "easymde/dist/easymde.min.css"
import { faPlus, faFileImport, faSave } from '@fortawesome/free-solid-svg-icons'
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css'
import { flattenArr, objToArr, timestampToString } from './utils/helper'
import fileHelper from './utils/fileHelper'

import FileSearch from './components/FileSearch'
import FileList from './components/FileList'
import BottomBtn from './components/BottomBtn'
import TabList from './components/TabList'
import Loader from './components/Loader'
import useIpcRenderer from './hooks/useIpcRenderer'
// import defaultFiles from './utils/defaultFiles'

// 特殊方式获取node内置模块，直接require会被webpack捕获并在当前项目node_modules中寻找对应模块
const path = window.require('path')
const { remote, ipcRenderer } = window.require('electron')
const Store = window.require('electron-store')
const settingsStore = new Store({
  name: 'Settings'
})

const fileStore = new Store({
  name: 'Files Data'
})

const getAutoSync = () => [
  'accessKey',
  'secretKey',
  'bucket',
  'enableAutoSync'
].every(key => !!settingsStore.get(key))
let enableAutoSync = settingsStore.get('enableAutoSync')

const saveFilesToStore = files => {
  const filesStoreObj = objToArr(files).reduce((result, file) => {
    const { id, path, title, createdAt, isSynced, updatedAt } = file
    result[id] = {
      id,
      path,
      title,
      createdAt,
      isSynced,
      updatedAt
    }
    return result
  }, {})
  fileStore.set('files', filesStoreObj)
}

function App() {
  const [ files, setFiles ] = useState(fileStore.get('files') || {})
  const [ activeFileID, setActiveFileID ] = useState('')
  const [ openedFileIDs, setOpenedFileIDs ] = useState([])
  const [ unsavedFileIDs, setUnsavedFileIDs ] = useState([])
  const [ searchedFiles, setSearchedFiles ] = useState([])
  const [ loading, setLoading ] = useState(false)
  const savedLocation = settingsStore.get('savedFileLocation') || remote.app.getPath('documents')

  const openedFiles = openedFileIDs.map(openID => files[openID])
  const activeFile = files[activeFileID]
  const filesArr = objToArr(files)
  const fileClick = (fileID) => {
    setActiveFileID(fileID)
    const currentFile = files[fileID]
    console.log(files)
    console.log(fileID)
    console.log(currentFile)
    const { id, title, isLoaded } = currentFile
    console.log(currentFile)
    if (!isLoaded) {
      if (getAutoSync()) {
        ipcRenderer.send('download-file', {
          key: `${title}.md`,
          path: currentFile.path,
          id
        })
      } else {
        fileHelper.readFile(currentFile.path).then((value) => {
          const newFile = {
            ...currentFile,
            body: value,
            isLoaded: true
          }
          setFiles({
            ...files,
            [fileID]: newFile
          })
        }).catch((err) => {
          // 防止用户在本地删除后读取文件报错
          const {[fileID]: value, ...rest} = files
          // console.log(rest)
          fileStore.set('files', rest)
          setFiles(rest)
          alert('文件已删除!')
        })
      }
    }

    if (!openedFileIDs.includes(fileID)) {
      setOpenedFileIDs([...openedFileIDs, fileID])
    } 
  }
  const tabClick = (fileID) => {
    setActiveFileID(fileID)
  }
  const tabClose = (fileID) => {
    const tabsWithout = openedFileIDs.filter(id => id !== fileID)
    setOpenedFileIDs(tabsWithout)
    if (tabsWithout.length) {
      setActiveFileID(tabsWithout[0])
    } else {
      setActiveFileID('')
    }
  }
  const deleteFile = id => {
    if (files[id].isNew) {
      // delete files[id]
      const {[id]:value, ...rest} = files
      setFiles(rest)
    } else {
      fileHelper.deleteFile(files[id].path)
      .then(() => {
        const {[id]:value, ...rest} = files
        setFiles(rest)
        saveFilesToStore(rest)
        // 如果是云端同步后的文件，则通知主进程删除云端文件
        if(files[id].isSynced) {
          console.log(files[id])
          ipcRenderer.send('delete-file', {
            key: `${value.title}.md`
          })
        }
        // 同属关闭打开的tab
        tabClose(id)
      }) 
    } 
  }
  const updateFileName = (id, title, isNew) => {
    // 文件名重复提示
    if (filesArr.find(file => file.title === title)) {
      // alert('文件名重复!')
      return false
    }
    const newPath = isNew ? path.join(savedLocation, `${title}.md`) : path.join(path.dirname(files[id].path), `${title}.md`)
    const modifiedFile = {
      ...files[id],
      title,
      isNew: false,
      path: newPath
    }
    const newFiles = {
      ...files,
      [id]: modifiedFile
    }
    console.log(newPath)
    console.log(newFiles)
    if (isNew) {
      fileHelper.writeFile(newPath, files[id].body)
      .then(() => {
        setFiles(newFiles)
        saveFilesToStore(newFiles)
      })
    } else {
      fileHelper.renameFile(files[id].path, newPath)
      .then(() => {
        setFiles(newFiles)
        saveFilesToStore(newFiles)
        // 如果文件已同步，通知主进程重命名云端文件
        if (files[id].isSynced) {
          ipcRenderer.send('rename-file', {
            key: `${files[id].title}.md`,
            newKey: `${title}.md`
          })
        }
      })
    }
    return true
  }
  const fileChange = (id, value) => {
    // 文件内容没变化不生效
    if (files[id].body === value) {
      return
    }
    const newFile = {
      ...files[id],
      body: value
    }
    setFiles({
      ...files,
      [id]: newFile
    })
    if (!unsavedFileIDs.includes(id)) {
      setUnsavedFileIDs([...unsavedFileIDs, id])
    }
  }

  const fileSearch = (keyword) => {
    const newFiles = filesArr.filter(file => file.title.includes(keyword))
    setSearchedFiles(newFiles)
  }
  const fileList = searchedFiles.length ? searchedFiles : filesArr

  const createNewFile = () => {
    // 每次只能新建一个
    if (filesArr.find(file => file.isNew)) {
      return
    }
    const newID = uuidv4()
    const newFile = {
      id: newID,
      title: '',
      body: '## 请输入内容',
      createdAt: Date.now(),
      isNew: true
    }
    setFiles({
      ...files,
      [newID]: newFile
    })
  }

  const saveCurrentFile = () => {
    fileHelper.writeFile(activeFile.path, activeFile.body)
    .then(() => {
      setUnsavedFileIDs(unsavedFileIDs.filter(id => id!==activeFile.id))
      if (getAutoSync()) {
        ipcRenderer.send('upload-file', {
          key: `${activeFile.title}.md`,
          path: activeFile.path
        })
      }
    })
  }

  const importFiles = () => {
    remote.dialog.showOpenDialog({
      title: '选择导入的 Markdown 文件',
      properties: [
        'openFile',
        'multiSelections'
      ],
      filters: [
        {
          name: 'Markdown files',
          extensions: ['md']
        }
      ]
    }).then((res) => {
      console.log(res)
      const {filePaths} = res
      if (Array.isArray(filePaths)) {
        const filteredPaths = filePaths.filter(path => {
          const alreadyAdded = Object.values(files).find(file => file.path === path)
          return !alreadyAdded
        })

        const importFilesArr = filteredPaths.map(p => {
          return {
            id: uuidv4(),
            title: path.basename(p, path.extname(p)),
            path: p,

          }
        })

        const newFiles = {
          ...files,
          ...flattenArr(importFilesArr)
        }
        setFiles(newFiles)
        saveFilesToStore(newFiles)

        let num = importFilesArr.length
        if (num > 0) {
          remote.dialog.showMessageBox({
            type: 'info',
            title: `成功导入了${num}个文件`,
            message: `成功导入了${num}个文件`
          })
        }
      }
    })
  }

  const activeFileUploaded = () => {
    const { id } = activeFile
    const modifiedFile = {
      ...files[id],
      isSynced: true,
      updatedAt: Date.now()
    }
    const newFiles = {
      ...files,
      [id]: modifiedFile
    }
    setFiles(newFiles)
    saveFilesToStore(newFiles)
  }

  const activeFileDownloaded = (event, message) => {
    const currentFile = files[message.id]
    fileHelper.readFile(currentFile.path).then(value => {
      let newFile
      if (message.status === 'download-success') {
        newFile = {
          ...files[currentFile.id],
          body: value,
          isLoaded: true,
          isSynced: true,
          updatedAt: Date.now()
        }
      } else {
        newFile = {
          ...files[currentFile.id],
          body: value,
          isLoaded: true
        }
      }
      const newFiles = {
        ...files,
        [currentFile.id]: newFile
      }
      setFiles(newFiles)
      saveFilesToStore(newFiles)
    })
  }

  const filesUploaded = () => {
    const newFiles = objToArr(files).reduce((result, file) => {
      const currentTime = Date.now()
      result[file.id] = {
        ...file,
        isSynced: true,
        updatedAt: currentTime
      }
      return result
    }, {})
    setFiles(newFiles)
    saveFilesToStore(newFiles)
  }

  const fileDeleted = () => {
    console.log('云端文件已删除')
    remote.dialog.showMessageBox({
      type: 'info',
      title: '云端文件已删除',
      message: '云端文件已删除'
    })
  }

  const fileRenamed = () => {
    console.log('云端文件已重命名')
  }

  const allFilesDownloaded = (event, data) => {
    console.log(data)
    setFiles(data.files)
    saveFilesToStore(data.files)
  }

  useIpcRenderer({
    'create-new-file': createNewFile,
    'import-file': importFiles,
    'save-edit-file': saveCurrentFile, 
    'active-file-uploaded': activeFileUploaded,
    'file-downloaded': activeFileDownloaded,
    'files-uploaded': filesUploaded,
    'file-deleted': fileDeleted,
    'file-renamed': fileRenamed,
    'all-files-downloaded': allFilesDownloaded,
    'loading-status': (message, status) => {
      setLoading(status)
    }
  })

  return (
    <div className="App container-fluid px-0">
      {
        loading && <Loader />
      }
      <div className="row no-gutters">
        <div className="col-3 bg-light left-panel">
          <FileSearch 
            // title="我的云文档"
            onFileSearch={fileSearch}
          />
          <FileList
            files={fileList}
            onFileClick={fileClick}
            onFileDelete={deleteFile}
            onSaveEdit={updateFileName}
          />
          <div className="row no-gutters button-group">
            <div className="col">
              <BottomBtn 
                text="新建"
                colorClass="btn-primary"
                icon={faPlus}
                onBtnClick={createNewFile}
              />
            </div>
            <div className="col">
              <BottomBtn 
                text="导入"
                colorClass="btn-success"
                icon={faFileImport}
                onBtnClick={importFiles}
              />
            </div>
          </div>
        </div>
        <div className="col-9 right-panel">
          {
            !activeFile &&
            <div className="start-page">
              请选择或创建新的 Markdown 文档
            </div>
          }
          {
            activeFile &&
            <>
              <TabList 
                files={openedFiles}
                activeId={activeFileID}
                unsavedIds={unsavedFileIDs}
                onTabClick={tabClick}
                onCloseTab={tabClose}
              />
              <SimpleMDE
                key={activeFile && activeFile.id}
                value={activeFile && activeFile.body}
                options={{
                  minHeight: '515px'
                }}
                onChange={(value) => {
                  fileChange(activeFile.id, value)
                }}
              />
              {
                activeFile.isSynced &&
                <span className="sync-status">已同步，上次同步{timestampToString(activeFile.updatedAt)}</span>
              }
              {/* <BottomBtn 
                text="保存"
                colorClass="btn-primary"
                icon={faSave}
                onBtnClick={saveCurrentFile}
              /> */}
            </>
          }   
        </div>
      </div> 
    </div>
  );
}

export default App;
