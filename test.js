// const qiniu = require('qiniu')
const QiniuManager = require('./src/utils/QiniuManager')
const path = require('path')

const accessKey = 'eHnzGAMp2lj5cS4iN2XRv1uWVrD2glIlAjsD0fZd';
const secretKey = '1l-mjy-1N24L-3VOevRIk5N6zWDXmmohTlkEN6Bf';
const localFile = "/Users/cyc/Documents/aaabbb.md";
const key='aaabbb.md';
const downloadPath = path.join(__dirname, key)

const manager = new QiniuManager(accessKey, secretKey, 'electron-cloud-doc')

manager.renameFile('123.md', '234.md').then(res => {
  console.log('修改成功', res)
})
// manager.uploadFile(key, localFile).then(res => {
//   console.log('上传成功', res)
//   // return manager.deleteFile(key)
// })
// manager.deleteFile(key)
// manager.getBuckerDomain().then(res => {
//   console.log(res)
// })
// manager.generateDownloadLink(key).then(data => {
//   console.log(data)
//   return manager.generateDownloadLink('aaabbb.md')
// }).then((data) => {
//   console.log(data)
// })
// manager.downloadFile(key, downloadPath).then(() => {
//   console.log('下载写入完毕')
// }).catch(err => {
//   console.error(err)
// })

// const publicBucketDomain = 'http://q1tss6kvv.bkt.clouddn.com';
