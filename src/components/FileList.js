import React, { useState, useEffect, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { faMarkdown } from '@fortawesome/free-brands-svg-icons'
import PropTypes from 'prop-types'

import { getParentNode } from '../utils/helper'
import useKeyPress from '../hooks/useKeyPress'
import useContextMenu from '../hooks/useContextMenu'

// const { remote } = window.require('electron')
// const { Menu, MenuItem } = remote

const FileList = ({ files, onFileClick, onSaveEdit, onFileDelete }) => {
  const [editStatus, setEditStatus] = useState(false)
  const [value, setValue] = useState('')
  const enterPressed = useKeyPress(13)
  const escPressed = useKeyPress(27)
  let input = useRef(null)
  const closeSearch = (editItem) => {
    //e.preventDefault()
    setEditStatus(false)
    setValue('')
    if (editItem.isNew) {
      onFileDelete(editItem.id)
    }
  }

  const clickedItem = useContextMenu([
    {
      label: '打开',
      click: () => {
        const parentElement = getParentNode(clickedItem.current, 'file-item')
        if (parentElement) {
          console.log(parentElement.dataset.id)
          onFileClick(parentElement.dataset.id)
        }
      }
    },
    {
      label: '重命名',
      click: () => {
        const parentElement = getParentNode(clickedItem.current, 'file-item')
        if (parentElement) {
          console.log(parentElement.dataset.id)
          const {id, title} = parentElement.dataset
          setEditStatus(id)
          setValue(title)
        }
      }
    },
    {
      label: '删除',
      click: () => {
        const parentElement = getParentNode(clickedItem.current, 'file-item')
        if (parentElement) {
          console.log(parentElement.dataset.id)
          onFileDelete(parentElement.dataset.id)
        }
      }
    }
  ], '.file-list', [files])

  useEffect(() => {
    const editItem = files.find(file => file.id === editStatus)
    if (enterPressed && editStatus && value.trim() !== '') {
      if (onSaveEdit(editItem.id, value, editItem.isNew)) {
        console.log('不重复')
        setEditStatus(false)
        setValue('')
      } else {
        console.log('重复')
      }
    } else if (escPressed && editStatus) {
      closeSearch(editItem)
    }
  })

  useEffect(() => {
    const newFile = files.find(file => file.isNew)
    // console.log(newFile)
    if (newFile) {
      setEditStatus(newFile.id)
      setValue(newFile.title)
    }
  }, [files])

  useEffect(() => {
    if (editStatus) {
      input.current.focus()
    }  
  }, [editStatus])

  return (
    <ul className="list-group list-group-flush file-list">
      {
        files.map(file => (
          <li
            className="row list-group-item bg-light d-flex align-items-center file-item mx-0"
            key={file.id}
            data-id={file.id}
            data-title={file.title}
          >
            {
              (file.id !== editStatus && !file.isNew) &&
              <>
                <span className="col-2">
                  <FontAwesomeIcon
                    size="lg"
                    icon={faMarkdown}
                  />
                </span>
                <span 
                  className="col-6 c-link"
                  onClick={() => {
                    onFileClick(file.id)
                  }}
                >
                  {file.title}
                </span>
                {/* <button
                  type="button"
                  className="icon-button col-2"
                  onClick={() => {
                    setEditStatus(file.id)
                    setValue(file.title)
                  }}
                >
                  <FontAwesomeIcon
                    title="编辑"
                    size="lg"
                    icon={faEdit}
                  />
                </button>
                <button
                  type="button"
                  className="icon-button col-2"
                  onClick={() => {
                    onFileDelete(file.id)
                  }}
                >
                  <FontAwesomeIcon
                    title="删除"
                    size="lg"
                    icon={faTrash}
                  />
                </button> */}
              </>
            }
            {
              (file.id === editStatus || file.isNew) &&
              <>
                <input
                  className="form-control col-10"
                  value={value}
                  ref={input}
                  type="text"
                  placeholder="请输入文件名"
                  onChange={(e) => {
                    setValue(e.target.value)
                  }}
                />
                <button
                  type="button"
                  className="icon-button col-2"
                  onClick={() => {closeSearch(file)}}
                >
                  <FontAwesomeIcon
                    title="关闭"
                    size="lg"
                    icon={faTimes}
                  />
                </button>
              </>
            }
          </li>
        ))
      }
    </ul>
  )
}

FileList.propTypes = {
  files: PropTypes.array,
  onFileClick: PropTypes.func,
  onFileDelete: PropTypes.func,
  onSaveEdit: PropTypes.func
}

export default FileList