import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Response, Request } from 'express';

interface defaultConfigInterface {
  maxSize?: number,//最大文件大小
  autoSave?: {
    save?: boolean,//自动保存到本地
    async?: boolean,//是否异步保存
    path?: string,//保存路径
    name?: {
      prefix?: string,//文件名前缀
      suffix?: string,//文件名后缀
      useMd5?: boolean//是否使用md5值作为文件名
    }
  }
}

interface fileMetaInterface {
  name: string,//文件名
  fileName: string,//文件名
  contentType: string,//文件类型
  suffix: string,//文件后缀
  prefix: string,//文件前缀
  size?: number,//文件大小
}

interface saveMetaInterface {
  fileName: string,//文件名
  filePath: string,//文件路径
}

interface filesInterface {
  fileMeta: fileMetaInterface,
  fileBuffer: Buffer,
  saveMeta?: saveMetaInterface
}

const defaultConfig: defaultConfigInterface = {
  maxSize: 1024 * 1024,//最大文件大小
  autoSave: {
    save: false,//自动保存到本地
    async: false,//是否异步保存
    path: './',//保存路径
    name: {
      prefix: '',//文件名前缀
      suffix: '',//文件名后缀
      useMd5: false,//是否使用md5值作为文件名
    },
  },
};

function receiveFormData({
                           maxSize = defaultConfig.maxSize,
                           autoSave: {
                             save = defaultConfig.autoSave.save,
                             async = defaultConfig.autoSave.async,
                             path = defaultConfig.autoSave.path,
                             name = defaultConfig.autoSave.name,
                           } = defaultConfig.autoSave,
                         }: defaultConfigInterface = defaultConfig) {
  return (req: Request, res: Response, next: Function) => {
    if (req.method === 'OPTIONS') {//跳过options请求
      next();
    } else {
      let error = false;//是否超出文件大小限制
      let data = Buffer.from([]);
      const contentType: string = req.headers['content-type'];
      const boundary = contentType.indexOf('boundary=') !== -1 ? '--' + contentType.split('boundary=')[1] : undefined;//解析header中的boundary
      req.on('data', (chunk) => {
        if (data.length > maxSize) {
          error = true;
          return;
        }
        data = Buffer.concat([data, chunk]);
      });
      req.on('end', () => {
        if (error) {
          next(new Error('文件大小超过限制，通过设置maxSize以调整限制'));//抛出异常给express错误处理中间件
          return;
        }
        req['files'] = req['files'] ? req['files'] : [];
        req.body = req.body ? req.body : {};
        if (!boundary) {
          req.body = JSON.parse(data.toString());//若不存在boundary，则解析为json
        } else {
          convertMutiFiles(data, boundary).forEach(collatingInfo(req));
        }
        if (save) {//自动保存文件
          saveFiles(req['files'], path, name, async);
        }
        next();
      });
    }
  };
}

function saveFiles(files: Array<filesInterface>, target: string, { prefix, suffix, useMd5 }: {
  prefix?: string,//文件名前缀
  suffix?: string,//文件名后缀
  useMd5?: boolean//是否使用md5值作为文件名
}, async: boolean) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target);//若目标路径不存在，则创建
  }
  files.forEach((file) => {
    const fileName = `${prefix}${useMd5 ? `${countHash(file.fileBuffer)}`
      : file.fileMeta.prefix}${suffix}.${file.fileMeta.suffix}`;
    const filePath = path.join(target, fileName);
    if (async) {
      fs.writeFile(filePath, file.fileBuffer, (err) => {//异步保存
        if (err) {
          console.log(err);
        }
      });
    } else {
      try {
        fs.writeFileSync(filePath, file.fileBuffer);//同步保存
      } catch (err) {
        console.log(err);
      }
    }
    file.saveMeta = {
      fileName,
      filePath,
    };
  });
}

function countHash(buffer): string {
  const hash = crypto.createHash('md5');
  hash.update(buffer, 'utf8');
  return hash.digest('hex');
}

function collatingInfo(req: Request) {
  return (file) => {
    if (!file.fileMeta.fileName) {//判断是否是文件
      if (req.body[file.fileMeta.name]) {//若存在相同name的对象，则以数组的形式放入
        req.body[file.fileMeta.name] = [req.body[file.fileMeta.name], JSON.parse(file.fileBuffer.toString())];
      } else {//若不存在相同name的对象，则以对象的形式放入
        req.body[file.fileMeta.name] = JSON.parse(file.fileBuffer.toString());
      }
    } else {//若是文件，则放入files数组中
      req['files'].push(file);
    }
  };
}

function convertMutiFiles(data: Buffer, boundary: string) {
  const files: Array<filesInterface> = [];//整体文件信息
  const fileMeta: Array<fileMetaInterface | Buffer> = [];//文件信息
  const fileBuffer: Array<Buffer> = [];//文件内容
  const fileSize: Array<number> = [];//文件大小
  const bufferBoundary = Buffer.from(boundary);//将字符boundary转为buffer形式
  let boundaryIndex = data.indexOf(bufferBoundary);//boundary在buffer中的位置

  while (boundaryIndex !== -1) {
    const fileIndex = data.indexOf('\r\n\r\n', boundaryIndex) + 4;
    if (fileIndex - 4 === -1) break;//到达末尾
    fileMeta.push(data.slice(boundaryIndex, fileIndex - 4));//将文件信息放入fileMeta数组中
    boundaryIndex = data.indexOf(bufferBoundary, fileIndex);//下一个boundary的位置
    fileBuffer.push(data.slice(fileIndex, boundaryIndex - 2));//将文件buffer放入fileBuffer数组中
    fileSize.push(boundaryIndex - 2 - fileIndex);//将文件大小放入fileSize数组中
  }

  fileBuffer.forEach((file, index) => {//将文件信息和文件内容放入files数组中
    files.push({
      fileMeta: {
        ...convertFileMeta(fileMeta[index] as Buffer),
        size: fileSize[index],
      },
      fileBuffer: file,
    });
  });
  return files;
}

function convertFileMeta(buffer: Buffer): fileMetaInterface {
  let name, fileName, contentType, suffix, prefix;
  const meta = buffer.toString().split('\r\n');
  name = meta[1].substring(meta[1].indexOf('name="') + 6, meta[1].indexOf('"', meta[1].indexOf('name="') + 7));//FormData名称
  if (meta.length !== 2) {//如果不是文件则跳过
    fileName = meta[1].substring(meta[1].indexOf('filename="') + 10, meta[1].indexOf('"', meta[1].indexOf('filename="') + 11));//文件名称
    contentType = meta[2]?.substring(meta[2].indexOf('Content-Type: ') + 14);//文件类型 **/**
    suffix = fileName?.split('.').at(-1);//文件后缀
    prefix = fileName?.substring(0, fileName?.lastIndexOf('.'));//文件前缀
  }
  return { name, fileName, contentType, suffix, prefix };
}

export default receiveFormData;
