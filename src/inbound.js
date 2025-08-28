import crypto from 'crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
//
import { ArgumentParser } from 'argparse';
import fetch from 'node-fetch';
import { createWorker } from 'tesseract.js';
//
import * as setting from './setting.js';
import * as eagle from './eagle.js';
import * as utils from './utils.js';

const main = async () => {
  // get parameter
  const parser = new ArgumentParser({
    description: 'ZGQ Scrapper',
  });
  parser.add_argument('--setting', '-s', { help: 'setting for fetching, absolute path OR relative path based on "--wkdir"', default: './setting.zgq-tool.json' });
  parser.add_argument('--wkdir', '-w', { help: 'working directory', required: true });
  const argv = parser.parse_args();
  // setting
  let allConfig = null;
  try {
    const w = path.resolve(argv.wkdir);
    const s = path.isAbsolute(argv.setting) ? argv.setting : path.resolve(w, argv.setting);
    //
    setting.post(JSON.parse(fs.readFileSync(s, { encoding: 'utf-8' })));
    allConfig = setting.get();
    allConfig.runtime = { wkdir: w, setting: s };
  } catch (error) {
    console.log(`invalid parameter | --setting="${argv.setting}" --wkdir="${argv.wkdir}" | ${error.message}`);
    return 1;
  }
  // prepare
  process.chdir(allConfig.runtime.wkdir);
  const worker = await createWorker('eng');
  let eagleFolder = null;
  const json = `${allConfig.runtime.wkdir}${path.sep}data.zgq.json`;
  const log = `${allConfig.runtime.wkdir}${path.sep}log.inbound.zgq.txt`;
  fs.writeFileSync(log, '', { encoding: 'utf-8' });
  const errorLog = `${allConfig.runtime.wkdir}${path.sep}log.error.inbound.zgq.txt`;
  fs.writeFileSync(errorLog, '', { encoding: 'utf-8' });
  //
  let data;
  try {
    data = JSON.parse(fs.readFileSync(json, { encoding: 'utf-8' }));
    //
    console.log(`Data is loaded from "[${json}]".`);
    fs.appendFileSync(log, `Data is loaded from "[${json}]".\n`, { encoding: 'utf-8' });
  } catch (_) {
    console.log(`Data file "[${json}]" is not existent or invalid.`);
    return 1;
  }
  //
  const md5Map = {};
  const tesserartSkipCategory = [ '243', '244', '295', '318' ];
  const externalOcr = {};
  Object.keys(allConfig.inbound.ocr).map((k) => {
    const v = allConfig.inbound.ocr[k];
    let jsonlText;
    try {
      jsonlText = fs.readFileSync(`${allConfig.runtime.wkdir}${path.sep}${v}`, { encoding: 'utf-8' });
    } catch (e) {
      console.log(`🛑 external ORC file not found | ${allConfig.runtime.wkdir}${path.sep}${v} | ${e.message}`);
      fs.appendFileSync(log, `🛑 external ORC file not found | ${allConfig.runtime.wkdir}${path.sep}${v} | ${e.message}\n`, { encoding: 'utf-8' });
      fs.appendFileSync(errorLog, `🛑 external ORC file not found | ${allConfig.runtime.wkdir}${path.sep}${v} | ${e.message}\n`, { encoding: 'utf-8' });
      return;
    }
    jsonlText.split('\n').map((line) => {
      let d;
      try {
        d = JSON.parse(line);
      } catch (_) {
        return;
      }
      if (!d?.fileName || !d?.data[0]?.text) {
        return;
      }
      externalOcr[k] || (externalOcr[k] = {});
      externalOcr[k][d.fileName] = d.data[0].text;
    });
  });
  const tagMap = {
    csg: 'madmanmovies.com',
  };
  //
  let categoryNumber = 0;
  let imageNumber = 0;
  let imageDownloadNumber = 0;
  let imageEagleNumber = 0;
  let imageFailNumber = 0;
  let failed;
  const timer = setInterval(() => {
    // write
    fs.writeFileSync(json, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
    //
    console.log('☑️ auto save every 60 second(s)');
  }, 60000);
  const categoryIdList = Object.keys(data);
  for (let i = 0; i < categoryIdList.length; i++) {
    failed = false;
    const categoryId = categoryIdList[i];
    const category = data[categoryId];
    if (!category.imageMap) {
      continue;
    }
    categoryNumber += 1;
    const urlList = Object.keys(category.imageMap);
    for (let j = 0; j < urlList.length; j++) {
      const url = urlList[j];
      const value = category.imageMap[url];
      imageNumber += 1;
      // download
      value.filename = url.split('/');
      value.filename = decodeURI(value.filename[value.filename.length - 1]);
      let filePath;
      if (!value.eagleName) {
        const x = String(categoryId % 1000).padStart(3, '0').split('');
        const y = String(value.count % 10000).padStart(4, '0').split('');
        value.eagleName = `1999120${x[0]}_0${x[1]}0${x[2]}0${y[0]}_${y[1]}${y[2]}${y[3]}.jpg`;
        //
        filePath = `${allConfig.runtime.wkdir}${path.sep}zgq${path.sep}${value.eagleName}`;
        try {
          await fetch(url).then((res) => {
            const ws = fs.createWriteStream(filePath);
            return new Promise((resolve, reject) => {
              res.body.pipe(ws);
              res.body.on('error', reject);
              ws.on('finish', resolve);
              ws.on('error', reject);
            });
          });
          //
          await new Promise((resolve, reject) => {
            const rs = fs.createReadStream(filePath);
            const md5Hash = crypto.createHash('md5');
            rs.on('data', (data) => { md5Hash.update(data); });
            rs.on('end', () => {
              value.md5 = md5Hash.digest('hex');
              rs.close();
              if (md5Map[value.md5]) {
                value.duplicate = true;
              } else {
                md5Map[value.md5] = value.md5;
              }
              resolve();
            });
            rs.on('error', reject);
          });
        } catch (e) {
          console.log(`🛑 image inbound failed | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.duplicate ? '(duplicate)' : value.eagleId} | ${value.description ? value.description : '(empty)'}`);
          fs.appendFileSync(log, `🛑 image inbound failed | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.duplicate ? '(duplicate)' : value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
          fs.appendFileSync(errorLog, `🛑 image inbound failed | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.duplicate ? '(duplicate)' : value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
          failed = true;
          imageFailNumber += 1;
        }
        //
        imageDownloadNumber += 1;
      } else {
        filePath = `${allConfig.runtime.wkdir}${path.sep}zgq${path.sep}${value.eagleName}`;
      }
      if (failed) {
        continue;
      }
      // ocr
      if (!value.duplicate) {
        if (!value.ocr) {
          value.ocr = {};
          value.eagleUpdate = !!value.eagleId;
        }
        let updated = false;
        if (typeof value.ocr['tesserart.en-US'] !== 'string') {
          value.ocr['tesserart.en-US'] = tesserartSkipCategory.includes(categoryId) ? '' : ((await worker.recognize(filePath, { rectangle: { width: 730, height: 24 } }))?.data?.text || '');
          updated = true;
        }
        Object.keys(externalOcr).map((k) => {
          if (typeof value.ocr[k] !== 'string' && typeof externalOcr[k][value.eagleName] === 'string') {
            value.ocr[k] = externalOcr[k][value.eagleName];
            updated = true;
          }
        });
        if (updated) {
          const sortedOcrValue = {};
          Object.keys(value.ocr).sort().map((k) => {
            sortedOcrValue[k] = value.ocr[k];
          });
          value.ocr = sortedOcrValue;
        }
      }
      // description
      if (!(typeof value.description === 'string') && !value.duplicate) {
        value.description = utils.ocrToDescription({ ocrText: value.ocr['tesserart.en-US'] || value.ocr?.['umi.zh-CN'], filename: value.filename });
      }
      // url
      if (!value.eagleUrl) {
        value.eagleUrl = url;
      }
      // add to eagle
      if (!value.eagleId && !value.duplicate) {
        if (!eagleFolder) {
          eagle.init();
          eagleFolder = await eagle.updateFolder({ name: '.zengguanqiang.cn', parentName: '.import' });
        }
        //
        const tags = [ '_login=false', '_source=zengguanqiang.cn' ];
        const titleList = category.title.split('-');
        titleList.push(tagMap[titleList[1] || '']);
        titleList.map((t, i) => {
          if (!t) {
            return;
          }
          if (i < 2) {
            tags.push(`_tag=zengguanqiang.cn/${t}`);
          }
          tags.push(`_union_tag=${t}`);
        });
        //
        const eagleItem = await eagle.post('/api/item/addFromPath', {
          path: filePath,
          name: value.eagleName,
          website: value.eagleUrl,
          tags: tags,
          annotation: JSON.stringify({
            title: value.filename,
            description: value.description,
            category: { id: categoryId, name: category.name, url: category.url },
          }),
          folderId: eagleFolder.id,
        }).catch((e) => {
          console.log(`🛑 image inbound failed | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.duplicate ? '(duplicate)' : value.eagleId} | ${value.description ? value.description : '(empty)'}`);
          fs.appendFileSync(log, `🛑 image inbound failed | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.duplicate ? '(duplicate)' : value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
          fs.appendFileSync(errorLog, `🛑 image inbound failed | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.duplicate ? '(duplicate)' : value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
          failed = true;
          imageFailNumber += 1;
        });
        if (failed) {
          continue;
        }
        await utils.sleep(50);
        value.eagleId = eagleItem.data;
        imageEagleNumber += 1;
        //
        console.log(`✅ [${String(imageNumber).padStart(6, '0')}] image inbounded | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.duplicate ? '(duplicate)' : value.eagleId} | ${value.description ? value.description : '(empty)'}`);
        fs.appendFileSync(log, `✅ [${String(imageNumber).padStart(6, '0')}] image inbounded | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.duplicate ? '(duplicate)' : value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
      }
      //
      const sortedValue = {};
      Object.keys(value).sort().map((k) => {
        sortedValue[k] = value[k];
      });
      category.imageMap[url] = sortedValue;
    }
    console.log(`✅ [${String(categoryNumber).padStart(4, '0')}] category inbounded | ${categoryId} | ${category.title}`);
    fs.appendFileSync(log, `✅ [${String(categoryNumber).padStart(4, '0')}] category inbounded | ${categoryId} | ${category.title}\n`, { encoding: 'utf-8' });
  }
  console.log(`✅ finish inbounded ${imageNumber} image(s) in ${categoryNumber} category(s) | download ${imageDownloadNumber} | eagle ${imageEagleNumber} | fail ${imageFailNumber}`);
  fs.appendFileSync(log, `✅ finish inbounded ${imageNumber} image(s) in ${categoryNumber} category(s) | download ${imageDownloadNumber} | eagle ${imageEagleNumber} | fail ${imageFailNumber}\n`, { encoding: 'utf-8' });
  //
  clearTimeout(timer);
  await worker.terminate();
  // write
  fs.writeFileSync(json, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
  //
  console.log(`Data is stored to "[${json}]".`);
  fs.appendFileSync(log, `Data is stored to "[${json}]".\n`, { encoding: 'utf-8' });
};

main().then(() => {
  process.exit(0);
}).catch((err) => {
  throw err;
});
