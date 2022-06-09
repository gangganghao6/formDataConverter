Usage：

```js
const app = express();

app.use(function (req, res, next) {
 res.header('Access-Control-Allow-Origin', '*');
 res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
 res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
 res.header('Access-Control-Allow-Credentials', 'true');
 next();
});
const fileConfig = {
 maxSize: 1024 * 1024,//max file size
 autoSave: {
  save: true,//save file to disk
  async: true,//async save file to disk
  path: 'D:\\nextjs\\total\\public',//save file path
  name: {
   prefix: 'prefix-',//file name prefix
   suffix: '-suffix',//file name suffix
   useMd5: true,//use md5 to generate file name
  }
 }
};
app.post('/upload', receiveFormData(fileConfig), (req, res) => {
 console.log(req.files);
 res.send({
  code: 200, msg: req.files.map(file => {
   return {
    fileName: file.saveMeta.fileName,
    filePath: file.saveMeta.filePath,
   };
  })
 });
}, (err, req, res, next) => {
 console.log(err);
 res.status(413).send({code: 413, msg: '文件体积过大，限制为1M'});
});
app.listen(3000, () => {
 console.log('Example app listening on port 3000!');
});
```

