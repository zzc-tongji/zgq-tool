import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
//
import { ArgumentParser } from 'argparse';
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
  const json = `${allConfig.runtime.wkdir}${path.sep}data.zgq.json`;
  const log = `${allConfig.runtime.wkdir}${path.sep}log.update.zgq.txt`;
  fs.writeFileSync(log, '', { encoding: 'utf-8' });
  const errorLog = `${allConfig.runtime.wkdir}${path.sep}log.error.update.zgq.txt`;
  fs.writeFileSync(errorLog, '', { encoding: 'utf-8' });
  //
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
  //
  let data;
  try {
    data = JSON.parse(fs.readFileSync(json, { encoding: 'utf-8' }));
    //
    console.log(`Data is loaded from "[${json}]".`);
  } catch (_) {
    console.log(`Data file "[${json}]" is not existent or invalid.`);
    return 1;
  }
  eagle.init();
  //
  const timer = setInterval(() => {
    // write
    fs.writeFileSync(json, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
    //
    console.log('☑️ auto save every 60 second(s)');
  }, 60000);
  let categoryNumber = 0;
  let imageNumber = 0;
  const categoryIdList = Object.keys(data);
  for (let i = 0; i < categoryIdList.length; i++) {
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
      if (!value.eagleId) {
        continue;
      }
      const eagleData = (await eagle.get('/api/item/info', `id=${value.eagleId}`).catch((e) => {
        console.log(`🛑 image get fail | /api/item/info | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}`);
        fs.appendFileSync(log, `🛑 image get fail | /api/item/info | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
        fs.appendFileSync(errorLog, `🛑 image get fail | /api/item/info | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
      }))?.data || null;
      if (!eagleData) {
        continue;
      }
      imageNumber += 1;
      //
      const eagleTagList = [ ...eagleData.tags ];
      let eagleAnnotation = eagleData.annotation;
      //
      for (let i = 0; i < eagleTagList.length; i++) {
        const t = eagleTagList[i];
        const tt = t.split('=');
        if (tt < 2 || tt[0] !== '_op') {
          continue;
        }
        const ttt = tt[1].split('/');
        if (ttt[0] === 'ocr') {
          if (ttt[1] === 'prefix-only') { // eagle tag "_op=ocr/prefix-only"
            let v = value.description.split(' ')[0];
            v = v.split('-');
            if (v.length >= 2) {
              value.description = `${v[0]}-${v[1]}`;
            } else {
              let temp;
              if ((temp = /([A-Za-z]+)[\s\S]*([0-9]+)/.exec(value.filename))) {
                value.description = `${temp[1]}-${temp[2]}`;
              } else {
                value.description = v[0];
              }
            }
          } else { // external OCR, for example, eagle tag "_op=ocr/umi.zh-CN"
            if (!value.ocr) {
              value.ocr = {};
            }
            if (!value.ocr[ttt[1]]) {
              value.ocr[ttt[1]] = externalOcr?.[ttt[1]]?.[value.eagleName];
            }
            value.description = await utils.ocrToDescription({ ocrText: value.ocr[ttt[1]], filename: value.filename });
          }
          value.eagleUpdate = true;
        } else if (ttt[0] === 'back') { // eagle tag "_op=back"
          let desc;
          try {
            desc = JSON.parse(eagleData.annotation);
          } catch (error) {
            if (!eagleData.annotation) {
              desc = {};
            } else {
              const d = eagleData.annotation.replaceAll(/\u003ca[\s]+?[\s\S]*?\u003e/g, '').replaceAll(/\u003c\/a\u003e/g, '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
              desc = JSON.parse(d);
              // fix description as valid JSON
              eagleAnnotation = d;
              value.eagleUpdate = true;
            }
          }
          // download meta from eagle
          value.description = desc.description;
          value.eagleName = `${eagleData.name}.${eagleData.ext}`;
          value.eagleUrl = eagleData.url;
          // mark item as "eagle managed"
          value.eagleManaged = true;
          console.log(`✅ [${String(imageNumber).padStart(6, '0')}] image updated | ⬅️ eagle | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}`);
          fs.appendFileSync(log, `✅ [${String(imageNumber).padStart(6, '0')}] image updated | ⬅️ eagle | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
        }
        // remove eagle tag "_op=*"
        eagleTagList.splice(i, 1) && (i -= 1);
        value.eagleUpdate = true;
      }
      if (value.eagleUpdate) {
        await eagle.post('/api/item/update', {
          id: value.eagleId,
          name: value.eagleName,
          url: value.eagleUrl,
          tags: eagleTagList,
          annotation: eagleAnnotation,
        }).catch((e) => {
          console.log(`🛑 image update fail | /api/item/update | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}`);
          fs.appendFileSync(log, `🛑 image update fail | /api/item/update | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
          fs.appendFileSync(errorLog, `🛑 image update fail | /api/item/update | ${e.message} | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
        });
        delete value.eagleUpdate;
        const sortedValue = {};
        Object.keys(value).sort().map((k) => {
          sortedValue[k] = value[k];
        });
        category.imageMap[url] = sortedValue;
        console.log(`✅ [${String(imageNumber).padStart(6, '0')}] image updated | ➡️ eagle | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}`);
        fs.appendFileSync(log, `✅ [${String(imageNumber).padStart(6, '0')}] image updated | ➡️ eagle | ${categoryId} | ${category.title} | ${value.count} | ${value.eagleName} | ${value.eagleId} | ${value.description ? value.description : '(empty)'}\n`, { encoding: 'utf-8' });
      }
    }
    console.log(`✅ [${String(categoryNumber).padStart(4, '0')}] category updated | ${categoryId} | ${category.title}`);
    fs.appendFileSync(log, `✅ [${String(categoryNumber).padStart(4, '0')}] category updated | ${categoryId} | ${category.title}\n`, { encoding: 'utf-8' });
  }
  console.log(`✅ finish updated ${imageNumber} image(s) in ${categoryNumber} category(s)`);
  fs.appendFileSync(log, `✅ finish updated ${imageNumber} image(s) in ${categoryNumber} category(s)\n`, { encoding: 'utf-8' });
  clearInterval(timer);
  // write
  fs.writeFileSync(json, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
  //
  console.log(`Data is stored to "[${json}]".`);
};

main().then(() => {
  process.exit(0);
}).catch((err) => {
  throw err;
});
