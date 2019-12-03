const qiniu = require('qiniu')
const axios = require('axios')
const fs = require('fs')


class QiniuManager {
  constructor(accessKey, secretKey, bucket) {
    this.mac = new qiniu.auth.digest.Mac(accessKey, secretKey)
    this.bucket = bucket

    this.config = new qiniu.conf.Config()
    // 空间对应的机房
    this.config.zone = qiniu.zone.Zone_z0

    this.bucketManager = new qiniu.rs.BucketManager(this.mac, this.config);
  }

  uploadFile(key, localFilePath) {
    const options = {
      scope: this.bucket + ':' + key,
    };
    const putPolicy = new qiniu.rs.PutPolicy(options)
    const uploadToken=putPolicy.uploadToken(this.mac)
    const formUploader = new qiniu.form_up.FormUploader(this.config)
    const putExtra = new qiniu.form_up.PutExtra()

    return new Promise((resolve, reject) => {
      formUploader.putFile(uploadToken, key, localFilePath, putExtra, this._handleCallback(resolve, reject))
    })
  }

  deleteFile(key) {
    return new Promise((resolve, reject) => {
      this.bucketManager.delete(this.bucket, key, this._handleCallback(resolve, reject))
    })
  }

  // 空间内文件重命名
  renameFile(key, newKey) {
    const options = {
      force: true
    }
    return new Promise((resolve, reject) => {
      this.bucketManager.move(this.bucket, key, this.bucket, newKey, options, this._handleCallback(resolve, reject))
    })
  }

  // 获取空间内文件列表
  getFileList() {
    const options = {
      limit: 100
    }
    return new Promise((resolve, reject) => {
      this.bucketManager.listPrefix(this.bucket, options, this._handleCallback(resolve, reject))
    })
  }

  // 获取bucket域名
  getBuckerDomain() {
    const reqURL = `http://api.qiniu.com/v6/domain/list?tbl=${this.bucket}`
    const digest = qiniu.util.generateAccessToken(this.mac, reqURL)
    console.log('trigger')
    return new Promise((resolve, reject) => {
      qiniu.rpc.postWithoutForm(reqURL, digest, this._handleCallback(resolve, reject))
    })
  }

  generateDownloadLink(key) {
    // 利用promise封装缓存domain
    const domainPromise = this.publicBucketDomain ? Promise.resolve([this.publicBucketDomain]) : this.getBuckerDomain()
    return domainPromise.then(data => {
      if (Array.isArray(data) && data.length > 0) {
        const pattern = /^https?/
        this.publicBucketDomain = pattern.test(data[0]) ? data[0] : `http://${data[0]}`
        return this.bucketManager.publicDownloadUrl(this.publicBucketDomain, key)
      } else {
        throw Error('域名已失效')
      }
    })
  }

  downloadFile(key, downloadPath) {
    return this.generateDownloadLink(key).then(link => {
      const timeStamp = Date.now()
      const url = `${link}?timestamp=${timeStamp}`
      return axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
    }).then(res => {
      console.log('sss')
      const writer = fs.createWriteStream(downloadPath)
      res.data.pipe(writer)
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          resolve({
            key,downloadPath
          })
        })
        writer.on('error', reject)
      })
    }).catch(err => {
      console.log(err)
      return Promise.reject({
        err: err.response
      })
    })
  }

  getStat(key) {
    return new Promise((resolve, reject) => {
      this.bucketManager.stat(this.bucket, key, this._handleCallback(resolve, reject))
    })
  }

  // 高阶函数
  _handleCallback(resolve, reject) {
    return function(respErr, respBody, respInfo) {
      if (respErr) {
        throw respErr;
      }
      if (respInfo.statusCode === 200) {
        resolve(respBody);
      } else {
        reject({
          statusCode: respInfo.statusCode,
          body: respBody
        })
      }
    }
  }
}

module.exports = QiniuManager